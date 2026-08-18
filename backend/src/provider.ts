/**
 * Chooses which model answers. Nothing downstream of here knows or cares.
 *
 * Selection order:
 *   1. GREENLIGHT_PROVIDER, if set, is obeyed exactly and fails loudly when
 *      its key is missing. An explicit choice is never silently overridden.
 *   2. Otherwise whichever key is present, Gemini first, because it is the
 *      free tier and the one this project runs on today.
 */

import { loadEnv } from "./env.js";
import { DEFAULT_GEMINI_MODEL, GeminiModelClient } from "./gemini.js";
import { ClaudeModelClient, type ModelClient } from "./model.js";

export type ProviderName = "gemini" | "claude";

export function detectProvider(): ProviderName | null {
  loadEnv();
  const explicit = process.env["GREENLIGHT_PROVIDER"]?.trim().toLowerCase();
  if (explicit === "gemini" || explicit === "claude") return explicit;
  if (explicit) {
    throw new Error(
      `GREENLIGHT_PROVIDER is set to ${explicit}, which is not a provider. Use gemini or claude.`,
    );
  }
  if (process.env["GEMINI_API_KEY"] ?? process.env["GOOGLE_API_KEY"]) return "gemini";
  if (process.env["ANTHROPIC_API_KEY"] ?? process.env["ANTHROPIC_AUTH_TOKEN"]) return "claude";
  return null;
}

export function createModelClient(provider?: ProviderName): ModelClient {
  loadEnv();
  const chosen = provider ?? detectProvider();
  if (!chosen) {
    throw new Error(
      "No model provider configured. Set GEMINI_API_KEY or ANTHROPIC_API_KEY in " +
        "backend/.env, or set GREENLIGHT_PROVIDER explicitly.",
    );
  }
  return chosen === "gemini" ? new GeminiModelClient() : new ClaudeModelClient();
}

/** For logs and test output. Never used to vary a guard. */
export function describeProvider(provider: ProviderName): string {
  return provider === "gemini"
    ? `gemini (${process.env["GEMINI_MODEL"] ?? DEFAULT_GEMINI_MODEL})`
    : `claude (${process.env["GREENLIGHT_MODEL"] ?? "claude-opus-5"})`;
}
