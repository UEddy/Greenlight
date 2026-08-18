/**
 * The Claude call.
 *
 * One request, structured output, schema validated by the SDK before this
 * module returns. The model chooses a verdict and writes prose. It is given no
 * opportunity to supply a number, and guard.ts checks that it did not anyway.
 *
 * A note on temperature. The build spec asks for a low temperature, which was
 * the right instinct for a task that must not wander. Sampling parameters are
 * not accepted on Claude Opus 5 and sending one returns a 400, so determinism
 * is bought here in the two ways that do work on this model: the response is
 * constrained to a schema, and effort is pinned. The guards downstream are what
 * actually hold the line, and they would be needed at any temperature.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ModelOutputSchema, type ModelOutput } from "./types";

export const MODEL_ID = process.env["GREENLIGHT_MODEL"] ?? "claude-opus-5";

export interface ModelClient {
  assess(system: string, userMessage: string): Promise<ModelOutput>;
}

export class ModelRefusedError extends Error {
  constructor(readonly category: string | null | undefined) {
    super(`The model declined to answer. Category: ${category ?? "unspecified"}.`);
    this.name = "ModelRefusedError";
  }
}

export class ModelUnparseableError extends Error {
  constructor() {
    super("The model response did not parse against the output schema.");
    this.name = "ModelUnparseableError";
  }
}

export class ClaudeModelClient implements ModelClient {
  private readonly client: Anthropic;

  constructor(client?: Anthropic) {
    // Zero argument construction resolves ANTHROPIC_API_KEY, or an
    // ANTHROPIC_AUTH_TOKEN, or a stored `ant auth login` profile.
    this.client = client ?? new Anthropic();
  }

  async assess(system: string, userMessage: string): Promise<ModelOutput> {
    const response = await this.client.messages.parse({
      model: MODEL_ID,
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: userMessage }],
      output_config: {
        effort: "medium",
        format: zodOutputFormat(ModelOutputSchema),
      },
    });

    if (response.stop_reason === "refusal") {
      throw new ModelRefusedError(response.stop_details?.category);
    }
    if (!response.parsed_output) {
      throw new ModelUnparseableError();
    }
    return response.parsed_output;
  }
}
