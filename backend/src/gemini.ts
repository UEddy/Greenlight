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
import { ModelUnparseableError, type ModelClient } from "./model.js";
import { ModelOutputSchema, type ModelOutput } from "./types.js";

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

export class GeminiModelClient implements ModelClient {
  private readonly ai: GoogleGenAI;
  private readonly model: string;
  private readonly schema: unknown;

  constructor(options: { apiKey?: string; model?: string } = {}) {
    const apiKey =
      options.apiKey ?? process.env["GEMINI_API_KEY"] ?? process.env["GOOGLE_API_KEY"];
    if (!apiKey) {
      throw new Error(
        "No Gemini API key. Set GEMINI_API_KEY in backend/.env or the environment.",
      );
    }
    this.ai = new GoogleGenAI({ apiKey });
    this.model = options.model ?? process.env["GEMINI_MODEL"] ?? DEFAULT_GEMINI_MODEL;
    this.schema = toGeminiSchema(ModelOutputSchema);
  }

  /**
   * Retries transport failures only: 429 and 503, which the free tier returns
   * under load and which say nothing about the answer. A rejected answer is
   * never retried here. That decision belongs to assess.ts, which re-asks once
   * with the violation quoted back, and this must not quietly add attempts to
   * it.
   */
  private async generateWithBackoff(system: string, userMessage: string) {
    const delays = [1_000, 4_000, 10_000];
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.ai.models.generateContent({
          model: this.model,
          contents: userMessage,
          config: {
            systemInstruction: system,
            responseMimeType: "application/json",
            responseJsonSchema: this.schema,
            // Unlike Claude Opus 5, Gemini still accepts a sampling
            // temperature, so the build spec's request for a low one is
            // honoured literally on this provider.
            temperature: 0,
          },
        });
      } catch (error) {
        const status = (error as { status?: number }).status;
        const retryable = status === 429 || status === 503;
        const delay = delays[attempt];
        if (!retryable || delay === undefined) throw error;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
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
