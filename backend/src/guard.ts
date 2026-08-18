/**
 * Post generation guards. A prompt asks; this file enforces.
 *
 * Two checks run on every model response:
 *
 *   1. No figure that was not in the retrieved context. The allowlist is built
 *      from the exact text the model was shown, so the two cannot drift.
 *   2. No suggestion to route the application somewhere else, and no
 *      suggestion to misrepresent anything.
 *
 * A violation fails the response. It is never repaired by deleting the offending
 * sentence, because a response that had to be edited to be safe is not a
 * response worth trusting.
 */

export interface Violation {
  rule: "figure_not_in_context" | "forum_shopping" | "misrepresentation";
  detail: string;
  excerpt: string;
}

/** Matches a run of digits with optional grouping and decimal parts. */
const NUMBER_TOKEN = /\d+(?:[.,]\d+)*/g;

/**
 * Every plausible reading of a numeric token.
 *
 * Sources disagree about separators: the Commission writes 1.565 where the
 * dataset stores 1565, and 1,098.90 appears both ways. Rather than guess a
 * locale, every interpretation is generated. The allowlist is built with this
 * function and so is the check, so a token is accepted only if some reading of
 * it matches some reading of a number the model was actually shown.
 */
export function numericReadings(token: string): Set<string> {
  const readings = new Set<string>();
  const add = (value: number) => {
    if (Number.isFinite(value)) readings.add(String(value));
  };

  readings.add(token);
  const plain = token.replace(/[^\d.,]/g, "");

  // Treat every separator as grouping: 1,098.90 -> 109890, 1.565 -> 1565
  add(Number(plain.replace(/[.,]/g, "")));
  // Treat comma as grouping and dot as decimal: 1,098.90 -> 1098.9
  add(Number(plain.replace(/,/g, "")));
  // Treat dot as grouping and comma as decimal: 1.098,90 -> 1098.9
  add(Number(plain.replace(/\./g, "").replace(/,/g, ".")));

  return readings;
}

/** Builds the set of numbers the model is permitted to echo. */
export function allowedFigures(contextText: string): Set<string> {
  const allowed = new Set<string>();
  for (const match of contextText.matchAll(NUMBER_TOKEN)) {
    for (const reading of numericReadings(match[0])) allowed.add(reading);
  }
  return allowed;
}

/**
 * Rejects any figure the model was not shown.
 *
 * Note what this does not do: it does not permit a number merely because it is
 * small, round or looks like a year. If it was not in the context, it was
 * invented, and an invented number is the exact failure this product cannot
 * ship.
 */
export function checkFigures(text: string, allowed: Set<string>): Violation[] {
  const violations: Violation[] = [];
  for (const match of text.matchAll(NUMBER_TOKEN)) {
    const token = match[0];
    const readings = numericReadings(token);
    const permitted = [...readings].some((r) => allowed.has(r));
    if (!permitted) {
      const start = Math.max(0, match.index - 60);
      violations.push({
        rule: "figure_not_in_context",
        detail: `The figure ${token} is not present in the retrieved context.`,
        excerpt: text.slice(start, match.index + token.length + 60).trim(),
      });
    }
  }
  return violations;
}

/**
 * Words that turn a place into a route. A jurisdiction name near one of these
 * is the model telling someone where to file, which is the advice this product
 * refuses to give.
 */
const ROUTING_VERBS =
  /\b(?:appl(?:y|ying|ication)|file|filing|submit(?:ting)?|lodge|lodging|go through|route|try|book(?:ing)? (?:an|your) appointment)\b/i;

/** Phrases that compare one place against another on outcome or cost. */
const COMPARATIVE_PATTERNS: Array<{ pattern: RegExp; detail: string }> = [
  {
    pattern:
      /\b(?:lower|better|higher|easier|weaker|milder|kinder|more lenient|less strict|more favou?rable|friendlier)\s+(?:\w+\s+){0,3}(?:refusal|rejection|approval|acceptance|success|not[- ]issued|issuance)\s*rates?\b/i,
    detail: "Compares refusal outcomes between places.",
  },
  {
    pattern:
      /\b(?:refusal|rejection|approval|acceptance|success|not[- ]issued)\s*rates?\s+(?:\w+\s+){0,3}(?:are|is|tend to be|look|seem)\s+(?:\w+\s+){0,2}(?:lower|better|higher|easier|more favou?rable)\b/i,
    detail: "Compares refusal outcomes between places.",
  },
  {
    pattern:
      /\b(?:lower|cheaper|easier|smaller|less demanding|more lenient)\s+(?:\w+\s+){0,3}(?:financial|funds?|subsistence|means|threshold|requirement|amount)\b/i,
    detail: "Compares financial requirements between places, inviting a cheaper route.",
  },
  {
    pattern: /\bbetter (?:luck|odds|chances?|success)\b/i,
    detail: "Suggests the applicant would do better somewhere or somehow else.",
  },
  {
    pattern:
      /\b(?:another|a different|an alternative|some other|a second|any other)\s+(?:consulate|embassy|mission|member state|schengen state|country|city|jurisdiction|post)\b/i,
    detail: "Points the applicant at a different place to apply.",
  },
  {
    pattern: /\b(?:instead|rather than)\s+(?:\w+\s+){0,4}(?:appl(?:y|ying)|file|filing|lodg)/i,
    detail: "Proposes applying somewhere other than the main destination.",
  },
  {
    pattern: /\bconsider\s+(?:\w+\s+){0,3}(?:appl(?:y|ying)|filing|lodging)\s+(?:in|at|through|via|from)\b/i,
    detail: "Invites the applicant to apply through a different route.",
  },
];

const MISREPRESENTATION_PATTERNS: Array<{ pattern: RegExp; detail: string }> = [
  {
    pattern: /\b(?:inflat|overstat|exaggerat|pad(?:ding)?|boost)\w*\s+(?:\w+\s+){0,3}(?:balance|funds?|savings?|income|salary|statement)/i,
    detail: "Suggests overstating funds.",
  },
  {
    pattern: /\b(?:season|top up|topping up|deposit)\w*\s+(?:\w+\s+){0,3}(?:bank\s+)?(?:statement|account|balance)/i,
    detail: "Suggests seasoning a bank statement.",
  },
  {
    // The window is wide because the natural phrasing puts a clause between
    // the verb and its purpose: "borrow the difference from a relative to show
    // the funds". A narrow window reads that sentence as clean.
    pattern:
      /\b(?:borrow|loan)\w*\b(?:\W+\w+){0,8}\W+(?:to|and|then)\W+(?:show|prove|demonstrate|meet|cover|top)\b/i,
    detail: "Suggests borrowing money to appear solvent.",
  },
  {
    pattern: /\b(?:fabricat|invent|forge|falsif|fake)\w*\b/i,
    detail: "Suggests fabricating evidence.",
  },
  {
    pattern: /\b(?:overstate|embellish|stretch the truth|be vague about|leave out|omit)\s+(?:\w+\s+){0,3}(?:employment|job|ties|income|refusal)/i,
    detail: "Suggests misrepresenting the applicant's real situation.",
  },
];

export interface AdviceGuardContext {
  /** The place the application legitimately belongs to. */
  declaredDestination: string;
  declaredSchengenState?: string | undefined;
  /** Every other jurisdiction name that must not become a suggestion. */
  otherJurisdictions: string[];
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Flags any recommendation to apply elsewhere, and any nudge to misrepresent.
 *
 * The jurisdiction check is deliberately narrow: naming another state is fine,
 * because the interface shows variation as a fact. Naming another state in the
 * same sentence as a routing verb is not, because that is a route.
 */
export function checkAdvice(text: string, context: AdviceGuardContext): Violation[] {
  const violations: Violation[] = [];

  for (const { pattern, detail } of COMPARATIVE_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      violations.push({ rule: "forum_shopping", detail, excerpt: match[0] });
    }
  }

  for (const { pattern, detail } of MISREPRESENTATION_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      violations.push({ rule: "misrepresentation", detail, excerpt: match[0] });
    }
  }

  const allowedNames = new Set(
    [context.declaredDestination, context.declaredSchengenState]
      .filter((v): v is string => Boolean(v))
      .map((v) => v.toLowerCase()),
  );

  for (const sentence of splitSentences(text)) {
    if (!ROUTING_VERBS.test(sentence)) continue;
    for (const name of context.otherJurisdictions) {
      if (allowedNames.has(name.toLowerCase())) continue;
      const named = new RegExp(`\\b${escapeRegExp(name)}\\b`, "i");
      if (named.test(sentence)) {
        violations.push({
          rule: "forum_shopping",
          detail: `Names ${name} in a sentence about where to apply, when the declared destination is ${context.declaredSchengenState ?? context.declaredDestination}.`,
          excerpt: sentence,
        });
        break;
      }
    }
  }

  return violations;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Runs every guard over the model's prose fields. */
export function guardModelOutput(
  strings: string[],
  allowed: Set<string>,
  adviceContext: AdviceGuardContext,
): Violation[] {
  const violations: Violation[] = [];
  for (const text of strings) {
    violations.push(...checkFigures(text, allowed));
    violations.push(...checkAdvice(text, adviceContext));
  }
  return violations;
}
