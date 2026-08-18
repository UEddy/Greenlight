/**
 * Gemini implementation of ModelClient, on Google AI Studio's free tier.
 *
 * The point of putting a second vendor behind the same interface is that the
 * guards never learn which one answered. They validate output, not provenance.
 * A token contract that only holds for one model was never a contract, it was
 * a habit of that model.
 *
 * Both providers are driven by the same Zod schema. Anthropic takes it through
 * zodOutputFormat; Gemini takes it through z.toJSONSchema and responseJsonSchema.
 * Neither hand maintains a second copy of the shape, so the two cannot drift.
 */

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { ModelUnparseableError, type ModelClient } from "./model";
import { ModelOutputSchema, type ModelOutput } from "./types";

/**
 * Override with GEMINI_MODEL.
 *
 * Chosen the hard way. The published examples name gemini-3.7-flash, which
 * this key cannot see. models.list advertises gemini-2.5-flash, which the API
 * then refuses with "no longer available to new users" and names this one as
 * the replacement. So listing a model is not the same as being allowed to call
 * it, and the only reliable source here was the error from a real call.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

/**
 * Gemini accepts a documented subset of JSON Schema. Anything outside it is a
 * risk of a 400 rather than a silent ignore, so the unsupported keywords are
 * removed here.
 *
 * The two this schema produces are minLength and maxLength on strings, which
 * are advisory anyway: length was never what made an answer safe. The guards
 * enforce what actually matters, and they run on the parsed result whatever
 * the vendor did or did not honour.
 */
const UNSUPPORTED_KEYWORDS = new Set(["$schema", "minLength", "maxLength"]);

export function toGeminiSchema(schema: z.ZodType): unknown {
  return strip(z.toJSONSchema(schema));
}

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (node === null || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) continue;
    out[key] = strip(value);
  }
  return out;
}

export interface GeminiKey {
  label: string;
  value: string;
}

/**
 * The keys to try, in order.
 *
 * A second key from a separate project is a real quota, not a retry of the
 * same one: the free tier counts generate requests per day per project per
 * model, so a primary that has hit its ceiling stays at its ceiling no matter
 * how long you wait. Only another project's key helps, which is why a 429
 * moves to the next key immediately rather than backing off.
 */
export function collectGeminiKeys(
  env: Record<string, string | undefined> = process.env,
  override?: string,
): GeminiKey[] {
  const keys: GeminiKey[] = [];
  const seen = new Set<string>();
  const push = (label: string, value: string | undefined) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    keys.push({ label, value });
  };

  push("override", override);
  push("GEMINI_API_KEY", env["GEMINI_API_KEY"]);
  push("GOOGLE_API_KEY", env["GOOGLE_API_KEY"]);
  push("GEMINI_API_KEY_BACKUP", env["GEMINI_API_KEY_BACKUP"]);
  return keys;
}

export class GeminiModelClient implements ModelClient {
  private readonly clients: Array<{ label: string; ai: GoogleGenAI }>;
  private readonly model: string;
  private readonly schema: unknown;

  constructor(options: { apiKey?: string; model?: string } = {}) {
    const keys = collectGeminiKeys(process.env, options.apiKey);
    if (keys.length === 0) {
      throw new Error(
        "No Gemini API key. Set GEMINI_API_KEY in backend/.env or the environment.",
      );
    }
    this.clients = keys.map((key) => ({
      label: key.label,
      ai: new GoogleGenAI({ apiKey: key.value }),
    }));
    this.model = options.model ?? process.env["GEMINI_MODEL"] ?? DEFAULT_GEMINI_MODEL;
    this.schema = toGeminiSchema(ModelOutputSchema);
  }

  /** How many distinct keys are configured. For logs and tests, never a guard. */
  get keyCount(): number {
    return this.clients.length;
  }

  /**
   * Transport failures only. Two of them, handled differently on purpose.
   *
   * 503 is the free tier being busy. Waiting helps, so it backs off on the
   * same key.
   *
   * 429 is a quota. Waiting does not help, because the free tier counts
   * requests per day per project, so the same key stays exhausted for hours.
   * The only thing that helps is a key belonging to a different project, so a
   * 429 moves to the next key immediately and only backs off once every key
   * has refused.
   *
   * A rejected answer is never retried here. That decision belongs to
   * assess.ts, which re-asks once with the violation quoted back, and this
   * must not quietly add attempts to a budget the guards own.
   */
  private async generateWithBackoff(system: string, userMessage: string) {
    const delays = [1_000, 4_000, 10_000];
    const request = {
      model: this.model,
      contents: userMessage,
      config: {
        systemInstruction: system,
        responseMimeType: "application/json",
        responseJsonSchema: this.schema,
        // Unlike Claude Opus 5, Gemini still accepts a sampling temperature,
        // so the build spec's request for a low one is honoured literally on
        // this provider.
        temperature: 0,
      },
    };

    let lastError: unknown;
    for (let attempt = 0; attempt <= delays.length; attempt += 1) {
      // One pass over every configured key before any waiting happens.
      for (let index = 0; index < this.clients.length; index += 1) {
        const client = this.clients[index]!;
        try {
          const response = await client.ai.models.generateContent(request);
          if (index > 0 || attempt > 0) {
            // Worth a line in the log during a recording session: it says
            // which key actually answered.
            // eslint-disable-next-line no-console
            console.warn(`[gemini] served by ${client.label}`);
          }
          return response;
        } catch (error) {
          const status = (error as { status?: number }).status;
          lastError = error;
          if (status !== 429 && status !== 503) throw error;
          if (status === 429 && index + 1 < this.clients.length) {
            // eslint-disable-next-line no-console
            console.warn(
              `[gemini] ${client.label} is rate limited, falling back to the next key`,
            );
            continue;
          }
          if (status === 503) break; // Busy, not exhausted: wait, do not burn the backup.
        }
      }
      const delay = delays[attempt];
      if (delay === undefined) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    throw lastError;
  }

  async assess(system: string, userMessage: string): Promise<ModelOutput> {
    const response = await this.generateWithBackoff(system, userMessage);

    const text = response.text;
    if (!text) throw new ModelUnparseableError();

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new ModelUnparseableError();
    }

    // Validated against the same Zod schema the Anthropic path parses with, so
    // a shape that satisfies one provider cannot slip through on the other.
    const parsed = ModelOutputSchema.safeParse(raw);
    if (!parsed.success) throw new ModelUnparseableError();
    return parsed.data;
  }
}
