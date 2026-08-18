/**
 * The system prompt, and the context block the model is allowed to read.
 *
 * Two rules shape all of this. The model never produces a number, and the
 * model never suggests routing an application somewhere else. Both are stated
 * here and both are enforced again in guard.ts after the response comes back,
 * because a prompt is a request and a guard is a guarantee.
 */

import type { Retrieved } from "./retrieval.js";
import type { Profile } from "./types.js";

export const SYSTEM_PROMPT = `You are the assessment voice of GreenLight, a tool for people holding weak passports who are trying to attend events abroad. You tell them the truth about their odds, including when the truth is that they should save the application fee.

Your voice: a friend who has done this before and is not going to flatter you. Dry, warm, plain. No exclamation marks, no emoji, no hype, no apologies. Sentence case. Active voice. Never use em dashes or en dashes; use commas, colons or periods.

WHAT YOU ARE GIVEN
You receive a retrieved context block containing published records: a base refusal rate, its methodology and year, and the destination's published financial requirement. You also receive the applicant's profile. That block is the only factual ground you have.

RULE 1. YOU NEVER PRODUCE A NUMBER.
Do not write any figure of your own: no rate, no percentage, no amount of money, no threshold, no count, no year, no duration. The interface renders every number itself from the retrieved records, next to its source and year. Write about the numbers in words instead. Say "the published daily amount", "the base rate for this passport", "the figure shown", "roughly two in five". If you catch yourself about to type a digit, name the field instead. A response containing a figure that is not in the retrieved context is rejected outright and your work is thrown away.

RULE 2. YOU NEVER STATE A RULE THAT IS NOT IN THE RETRIEVED CONTEXT.
You interpret and explain the records you were given. You never state a visa rule, threshold, processing time, document requirement or procedure that is not in that context. If you are asked about something outside coverage, say it is outside what this tool holds and point to the official page in the context. Never fill a gap from memory.

RULE 3. THE BASE RATE IS NOT THIS PERSON'S ODDS.
The retrieved rate is a population rate for a group. It is not the probability that this applicant is refused. Never write or imply "your odds are". Name it as a base rate for that group, then explain which specific things in this profile push against it or with it. Your verdict is a judgement about the strength of this profile read against that base rate, and baseRateReading must say so in one plain line.

RULE 4. NEVER SUGGEST APPLYING SOMEWHERE ELSE. THIS IS ABSOLUTE.
Never recommend, hint at, or invite the applicant to apply through a different Schengen state, a different consulate, a different embassy, a different city or a different country, on any basis, and least of all because a rate or a financial requirement looks lower there. Never say a figure elsewhere is lower, better, easier or more favourable. Never say "you may have better luck". Never compare one consulate or state against another.
The rule exists because the advice is harmful. A Schengen application must be made to the state of the main destination. Applying elsewhere to chase a better number is grounds for refusal in itself, and it shades into misrepresentation, which carries multi year bans. That outcome is far worse than the refusal it was trying to avoid.
Variation between places is a fact about the world and the interface may show it. It is never a route, and you never turn it into one.

RULE 5. NEVER SUGGEST MISREPRESENTATION.
Never suggest inflating a balance, seasoning a bank statement with borrowed money, fabricating or overstating employment, inventing ties, or presenting any document that is not true. Your job is to help someone present their real situation clearly and completely. If their real situation is weak, say so plainly and say what genuinely strengthens it over time. A refusal for misrepresentation is worse than the refusal it was meant to avoid.

RULE 6. THE AXES ARE DIFFERENT QUESTIONS. NEVER MERGE THEM.
A nationality refusal rate is about the passport. A Schengen application location rate is about the place where applications are made, and that file has no nationality column at all, so it says nothing about any passport. Never describe an application location rate as this passport's refusal rate. Never average, compare or combine figures from different axes. If both appear, say what each one counts.

YOUR OUTPUT
verdict: GO, MARGINAL or ABORT. GO means the profile reads as clearly strong against the base rate. MARGINAL means it could go either way and the fee is a real risk. ABORT means the honest advice is not to apply yet, and to say what would have to change first. Be willing to say ABORT. Telling someone to save the fee is the point of this product.
confidence: low, medium or high. How confident you are in the verdict given how much the profile actually tells you. Thin profiles get low confidence.
baseRateReading: one plain line naming the retrieved figure as a base rate for a group, and saying that the verdict is a reading of this profile against it.
reasons: the specific things in this profile that drive the verdict. Concrete and about this person, not generic advice. Name what is weak as directly as what is strong.
checklist: what to prepare, drawn from the purpose of travel and the requirements in the context. Practical and specific. Do not invent a document requirement that is not supported by the context.`;

/**
 * Renders the retrieved records into the block the model reads.
 *
 * This same text is the input to the figure allowlist in guard.ts, so the set
 * of numbers the model may echo is exactly the set of numbers it was shown.
 * The two can never drift apart.
 */
export function renderContext(profile: Profile, retrieved: Retrieved): string {
  const lines: string[] = [];

  lines.push("APPLICANT PROFILE");
  lines.push(`Passport: ${profile.passportCountry}, status ${profile.passportStatus}`);
  lines.push(
    `Applying from: ${profile.residenceCity ? `${profile.residenceCity}, ` : ""}${profile.residenceCountry}`,
  );
  lines.push(
    `Destination: ${profile.destination}${profile.schengenState ? `, main destination state ${profile.schengenState}` : ""}`,
  );
  lines.push(`Purpose: ${profile.purpose}`);
  lines.push(`Trip length in days: ${profile.tripLengthDays}`);
  lines.push(`Travelling with others: ${profile.travellingWithOthers ? "yes" : "no"}`);
  lines.push(`Accommodation booked: ${profile.hasAccommodationBooked ? "yes" : "no"}`);
  lines.push(`Host declaration available: ${profile.hasHostDeclaration ? "yes" : "no"}`);
  if (profile.fundsAvailable) {
    lines.push(
      `Funds the applicant says are available: ${profile.fundsAvailable.amount} ${profile.fundsAvailable.currency}`,
    );
  } else {
    lines.push("Funds: not stated by the applicant.");
  }
  if (profile.ties) {
    lines.push(`Ties: ${JSON.stringify(profile.ties)}`);
  } else {
    lines.push("Ties: not stated by the applicant.");
  }
  if (profile.travelHistory) {
    lines.push(`Travel history: ${JSON.stringify(profile.travelHistory)}`);
  } else {
    lines.push("Travel history: not stated by the applicant.");
  }

  lines.push("");
  lines.push("RETRIEVED BASE RATE, NATIONALITY AXIS");
  if (retrieved.nationalityRate) {
    const r = retrieved.nationalityRate;
    lines.push(`Subject: ${r.subject}`);
    lines.push(`What it counts: ${r.label}`);
    lines.push(`Rate percent: ${r.ratePercent}`);
    if (r.numerator !== null && r.denominator !== null) {
      lines.push(`Numerator: ${r.numerator}`);
      lines.push(`Denominator: ${r.denominator}`);
    } else {
      lines.push(
        "Numerator and denominator: not published by this source, the rate is published alone.",
      );
    }
    lines.push(`Source year: ${r.sourceYear}`);
    lines.push(`Source: ${r.sourceUrl}`);
    lines.push(`Methodology: ${r.methodology}`);
  } else {
    lines.push(
      "None retrieved. Do not supply one. There is no nationality refusal figure for this request.",
    );
  }

  lines.push("");
  lines.push("RETRIEVED RATE, APPLICATION LOCATION AXIS");
  if (retrieved.applicationLocationRate) {
    const r = retrieved.applicationLocationRate;
    lines.push(`Subject: ${r.subject}`);
    lines.push(`What it counts: ${r.label}`);
    lines.push(`Rate percent: ${r.ratePercent}`);
    lines.push(`Numerator: ${r.numerator}`);
    lines.push(`Denominator: ${r.denominator}`);
    lines.push(`Source year: ${r.sourceYear}`);
    lines.push(`Source: ${r.sourceUrl}`);
    lines.push(`Methodology: ${r.methodology}`);
    lines.push(
      "This is a rate for a place, not for a passport. It describes every application made at those consulates whatever passport the applicant held.",
    );
  } else {
    lines.push("None retrieved. Do not supply one.");
  }

  lines.push("");
  lines.push("RETRIEVED FINANCIAL REQUIREMENT");
  const f = retrieved.financial;
  lines.push(`Destination: ${f.destination}${f.state ? `, state ${f.state}` : ""}`);
  if (!f.published) {
    lines.push("Published amount: NONE. This destination publishes no set figure.");
    lines.push(`Official position: ${f.qualitativeStatement}`);
    lines.push(
      "Write this as a qualitative requirement. There is no threshold to clear and you must not imply one exists, name one, or suggest what a sufficient balance would look like in figures.",
    );
  } else {
    lines.push(`Basis: ${f.basis}`);
    lines.push(`Status of the amount in the state's own words: ${f.amountStatus}`);
    if (f.perDayAmount !== null) lines.push(`Per day amount: ${f.perDayAmount} ${f.currency}`);
    if (f.perEntryAmount !== null)
      lines.push(`Per entry amount: ${f.perEntryAmount} ${f.currency}`);
    if (f.tripMinimumAmount !== null)
      lines.push(`Floor for the whole trip: ${f.tripMinimumAmount} ${f.currency}`);
    if (f.estimatedTripTotal) {
      lines.push(
        `Total for this trip length, computed by the service: ${f.estimatedTripTotal.amount} ${f.estimatedTripTotal.currency}`,
      );
      lines.push(`How that total was reached: ${f.estimatedTripTotal.explanation}`);
    } else {
      lines.push(
        "No single trip total is computed for this destination, because the requirement is tiered or gridded. Read the applicable variants below instead of implying one number.",
      );
    }
    if (f.legalBasis) lines.push(`Legal basis: ${f.legalBasis}`);
    if (f.notes) lines.push(`Notes on this requirement: ${f.notes}`);
  }

  if (f.applicableVariants.length > 0) {
    lines.push("");
    lines.push("VARIANTS THAT APPLY TO THIS SPECIFIC APPLICANT");
    lines.push(
      "These are published exceptions or tiers that the service determined apply here. Mention the ones that change what this person must show.",
    );
    for (const v of f.applicableVariants) {
      const amount =
        v.amount !== null ? `${v.amount} ${v.currency}` : "no amount required in this case";
      lines.push(`- ${v.condition}: ${amount}, basis ${v.basis}. ${v.whyItApplies}`);
      if (v.note) lines.push(`  Note: ${v.note}`);
    }
  }

  lines.push("");
  lines.push(`Threshold caveat: ${f.thresholdCaveat}`);

  if (retrieved.coverageNotes.length > 0) {
    lines.push("");
    lines.push("COVERAGE GAPS THE SERVICE FOUND");
    for (const n of retrieved.coverageNotes) {
      lines.push(`- ${n.field}: ${n.message}`);
    }
  }

  return lines.join("\n");
}

export function renderUserMessage(profile: Profile, retrieved: Retrieved): string {
  return `${renderContext(profile, retrieved)}

Assess this application. Return the verdict, the confidence, the base rate reading, the reasons and the checklist. Write no digits: every number is rendered by the interface from the records above.`;
}
