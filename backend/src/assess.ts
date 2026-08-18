/**
 * Orchestration for POST /assess.
 *
 * Order matters here. Retrieve first, so the model can only ever see published
 * records. Render the context once, so the figure allowlist is built from the
 * exact bytes the model read. Call the model. Guard the answer. Assemble the
 * response from the retrieved records, taking only the verdict and the prose
 * from the model.
 */

import { dataset, COVERED_SCHENGEN_STATES } from "./dataset.js";
import { guardModelOutput, allowedFigures, checkFigures, type Violation } from "./guard.js";
import type { ModelClient } from "./model.js";
import {
  buildPlaceholders,
  checkPlaceholders,
  describeAvailable,
  substitute,
} from "./placeholders.js";
import { SYSTEM_PROMPT, renderContext, renderUserMessage } from "./prompt.js";
import { retrieve, type Retrieved } from "./retrieval.js";
import type { AssessResponse, ModelOutput, Profile } from "./types.js";

const AXIS_NOTE =
  "These two fields answer different questions and are never comparable. " +
  "The nationality figure is about the passport held. The application location " +
  "figure is about the place where applications were made, and that source has " +
  "no applicant nationality column at all, so it says nothing about any " +
  "passport. Render them separately, each with what it counts, and never " +
  "combine or average them.";

export class ModelOutputRejectedError extends Error {
  constructor(
    readonly violations: Violation[],
    readonly retrieved: Retrieved,
  ) {
    super(
      `The model response was rejected by the output guards: ${violations
        .map((v) => `${v.rule} (${v.detail})`)
        .join("; ")}`,
    );
    this.name = "ModelOutputRejectedError";
  }
}

/**
 * Jurisdiction names that must not be turned into a suggestion. Built from the
 * dataset so a state added later is guarded without touching this file.
 */
function otherJurisdictions(): string[] {
  return [
    ...COVERED_SCHENGEN_STATES,
    "United Kingdom",
    "United States",
    "Schengen area",
  ];
}

export interface AssessOptions {
  /** How many times to re-ask after a guard violation. One by default. */
  retries?: number;
}

export async function assess(
  profile: Profile,
  model: ModelClient,
  options: AssessOptions = {},
): Promise<AssessResponse> {
  const retries = options.retries ?? 1;
  const retrieved = retrieve(profile);

  const context = renderContext(profile, retrieved);
  const allowed = allowedFigures(context);
  const placeholders = buildPlaceholders(profile, retrieved);
  const adviceContext = {
    declaredDestination: profile.destination,
    declaredSchengenState: profile.schengenState,
    otherJurisdictions: otherJurisdictions(),
  };

  let userMessage = renderUserMessage(profile, retrieved);
  let lastViolations: Violation[] = [];

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const output = await model.assess(SYSTEM_PROMPT, userMessage);
    const violations = guardModelOutput(
      output.baseRateReading,
      [...output.reasons, ...output.checklist],
      adviceContext,
      (text) => checkPlaceholders(text, placeholders),
    );
    if (violations.length === 0) {
      const baseRateReading = substitute(output.baseRateReading, placeholders);

      // Check this service's own substitution. Every figure the finished line
      // carries must trace to the retrieved records; if one does not, the fault
      // is in buildPlaceholders, not in the model, and it must not ship.
      const introduced = checkFigures(baseRateReading, allowed);
      if (introduced.length > 0) {
        throw new Error(
          `Substitution produced a figure that is not in the retrieved context: ` +
            introduced.map((v) => v.detail).join("; "),
        );
      }

      return assemble(profile, retrieved, output, baseRateReading);
    }
    lastViolations = violations;

    // Tell it exactly what tripped, then ask again. If it trips a second time
    // the response is refused rather than patched, because a response that had
    // to be edited into compliance is not one to put in front of a user.
    userMessage =
      `${renderUserMessage(profile, retrieved)}\n\n` +
      `A previous attempt was rejected by the output guards. Do not repeat these:\n` +
      violations
        .map((v) => `- ${v.rule}: ${v.detail} Offending text: "${v.excerpt}"`)
        .join("\n") +
      `\nWrite no digits anywhere. In the base rate line use the tokens and nothing else. ` +
      `${describeAvailable(placeholders)} ` +
      `Never suggest applying anywhere other than the declared destination.`;
  }

  throw new ModelOutputRejectedError(lastViolations, retrieved);
}

function assemble(
  profile: Profile,
  retrieved: Retrieved,
  output: ModelOutput,
  baseRateReading: string,
): AssessResponse {
  const primary = retrieved.primarySource;
  if (!primary) {
    // retrieve() throws before this can happen. Kept so a future change cannot
    // quietly produce a card with no source on it.
    throw new Error("No primary source was retrieved, refusing to assemble a response.");
  }

  return {
    verdict: output.verdict,
    confidence: output.confidence,
    refusalRate: {
      nationality: retrieved.nationalityRate,
      applicationLocation: retrieved.applicationLocationRate,
      axisNote: AXIS_NOTE,
    },
    sourceYear: primary.sourceYear,
    sourceUrl: primary.sourceUrl,
    financialRequirement: retrieved.financial,
    reasons: output.reasons,
    checklist: output.checklist,
    baseRateCaveat: dataset.baseRateCaveat,
    baseRateReading,
    coverageNotes: retrieved.coverageNotes,
  };
}
