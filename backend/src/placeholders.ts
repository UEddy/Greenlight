/**
 * The base rate line, assembled from tokens rather than written.
 *
 * Why this exists. Checking that a digit appears somewhere in the retrieved
 * context proves the model did not invent a number. It does not prove the
 * number is attached to the right thing. For a Nigerian profile assessed
 * against the Schengen area, the application location figure sits in the
 * context legitimately, so a sentence like "the UK refusal rate for your
 * passport is 46.93 percent" clears the allowlist and is false: right number,
 * wrong label, wrong axis, and delivered with a source next to it.
 *
 * Substituting the value alone does not fix that. A model writing "the UK
 * refusal rate for your passport is {{rate}}" produces the same false sentence
 * after substitution. So the label is a token too. The model writes the shape
 * of the sentence; code supplies both the figure and the subject it belongs
 * to, and the line is required to carry both.
 */

import type { Violation } from "./guard.js";
import type { Retrieved } from "./retrieval.js";
import type { Profile } from "./types.js";

/** Matches {{name}}, tolerating inner spaces. */
export const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

/**
 * Tokens the base rate line may use. A value of null means the token is known
 * but this source does not publish it, which is a different failure from a
 * token that does not exist, and gets a different message.
 */
export interface PlaceholderTable {
  [name: string]: string | null;
}

/**
 * Both are required. {{rate}} is the figure. {{subject}} is what the figure is
 * about, and without it the model is free to describe the number however it
 * likes, which is the hole this module closes.
 */
export const REQUIRED_PLACEHOLDERS = ["rate", "subject"] as const;

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function buildPlaceholders(
  profile: Profile,
  retrieved: Retrieved,
): PlaceholderTable {
  const rate = retrieved.primaryRate;
  if (!rate) {
    throw new Error("No primary rate retrieved, refusing to build placeholders.");
  }

  return {
    rate: `${rate.ratePercent} percent`,
    subject: rate.subject,
    numerator: rate.numerator === null ? null : formatCount(rate.numerator),
    denominator: rate.denominator === null ? null : formatCount(rate.denominator),
    year: String(rate.sourceYear),
    destination: profile.destination,
  };
}

/** Human readable list for the prompt and for the retry feedback. */
export function describeAvailable(table: PlaceholderTable): string {
  const available: string[] = [];
  const unavailable: string[] = [];
  for (const [name, value] of Object.entries(table)) {
    if (value === null) unavailable.push(`{{${name}}}`);
    else available.push(`{{${name}}}`);
  }
  let text = `Available tokens: ${available.join(", ")}.`;
  if (unavailable.length > 0) {
    text +=
      ` Not available for this request, because this source does not publish them: ` +
      `${unavailable.join(", ")}. Using one of those is rejected.`;
  }
  return text;
}

/**
 * Validates the base rate line before anything is substituted into it.
 *
 * Three ways to fail: a token that does not exist, a token this source cannot
 * fill, and a required token left out.
 */
export function checkPlaceholders(text: string, table: PlaceholderTable): Violation[] {
  const violations: Violation[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1]!;
    seen.add(name);
    if (!(name in table)) {
      violations.push({
        rule: "placeholder_unknown",
        detail: `There is no token called {{${name}}}. ${describeAvailable(table)}`,
        excerpt: match[0],
      });
      continue;
    }
    if (table[name] === null) {
      violations.push({
        rule: "placeholder_unavailable",
        detail:
          `{{${name}}} cannot be filled for this request, because the source publishes ` +
          `no such value. Write the line without it.`,
        excerpt: match[0],
      });
    }
  }

  for (const required of REQUIRED_PLACEHOLDERS) {
    if (!seen.has(required)) {
      violations.push({
        rule: "placeholder_missing",
        detail:
          `The base rate line must contain {{${required}}}. The figure and the subject ` +
          `it describes are both supplied by the service, so that a real number can ` +
          `never end up attached to the wrong thing.`,
        excerpt: text.slice(0, 120),
      });
    }
  }

  return violations;
}

/** Fills the tokens. Only ever called on a line that already passed the guards. */
export function substitute(text: string, table: PlaceholderTable): string {
  return text.replace(PLACEHOLDER_PATTERN, (whole, name: string) => {
    const value = table[name];
    if (value === undefined || value === null) {
      // checkPlaceholders runs first and rejects both cases, so reaching here
      // is a bug in this service, not a bad answer from the model.
      throw new Error(`Refusing to substitute unresolved token ${whole}.`);
    }
    return value;
  });
}
