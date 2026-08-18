/**
 * Runs real profiles against the live provider and records what happened.
 *
 * Two outputs. A compliance report on stdout, saying for each profile whether
 * the model's first answer passed the guards, what tripped if it did not, and
 * whether the single retry rescued it. And, for every profile that ended in a
 * passing response, a fixture under test/fixtures so the demo can replay
 * known good output with no network call.
 *
 * Only genuinely passing responses are saved. Nothing here edits a model
 * answer to make it fit, because a fixture that had to be corrected would
 * misrepresent what the provider actually does.
 *
 *   npx tsx scripts/capture-fixtures.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assess, ModelOutputRejectedError } from "../src/assess.js";
import { guardModelOutput } from "../src/guard.js";
import { checkPlaceholders, buildPlaceholders } from "../src/placeholders.js";
import { SYSTEM_PROMPT, renderUserMessage } from "../src/prompt.js";
import { createModelClient, detectProvider, describeProvider } from "../src/provider.js";
import { retrieve } from "../src/retrieval.js";
import { COVERED_SCHENGEN_STATES } from "../src/dataset.js";
import { ProfileSchema, type ModelOutput, type Profile } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(here, "..", "test", "fixtures");

const CASES: Array<{ name: string; profile: unknown }> = [
  {
    name: "nigeria-uk-conference-weak",
    profile: {
      passportCountry: "Nigeria",
      passportStatus: "valid",
      residenceCountry: "Nigeria",
      residenceCity: "LAGOS",
      destination: "United Kingdom",
      purpose: "conference",
      tripLengthDays: 6,
      fundsAvailable: { amount: 900, currency: "GBP" },
      ties: { employmentStatus: "self_employed", ownsProperty: false },
      travelHistory: { previousVisitsToDestination: 0, previousRefusals: 1 },
    },
  },
  {
    name: "india-us-business-strong",
    profile: {
      passportCountry: "India",
      passportStatus: "valid",
      residenceCountry: "India",
      residenceCity: "MUMBAI",
      destination: "United States",
      purpose: "business",
      tripLengthDays: 8,
      fundsAvailable: { amount: 14000, currency: "USD" },
      hasAccommodationBooked: true,
      ties: { employmentStatus: "employed", ownsProperty: true, hasDependants: true },
      travelHistory: { previousVisitsToDestination: 3, previousSchengenUkUsVisas: 5, previousRefusals: 0 },
    },
  },
  {
    name: "ghana-spain-schengen-bait",
    profile: {
      passportCountry: "Ghana",
      passportStatus: "valid",
      residenceCountry: "Ghana",
      residenceCity: "ACCRA",
      destination: "Schengen area",
      schengenState: "Spain",
      purpose: "conference",
      tripLengthDays: 7,
      fundsAvailable: { amount: 400, currency: "EUR" },
      ties: { employmentStatus: "self_employed" },
      travelHistory: { previousVisitsToDestination: 0, previousRefusals: 1 },
    },
  },
  {
    name: "nigeria-romania-invitation-variant",
    profile: {
      passportCountry: "Nigeria",
      passportStatus: "valid",
      residenceCountry: "Nigeria",
      residenceCity: "ABUJA",
      destination: "Schengen area",
      schengenState: "Romania",
      purpose: "conference",
      tripLengthDays: 5,
      fundsAvailable: { amount: 1200, currency: "EUR" },
      hasHostDeclaration: true,
      ties: { employmentStatus: "employed" },
    },
  },
  {
    name: "vietnam-italy-length-grid",
    profile: {
      passportCountry: "Vietnam",
      passportStatus: "valid",
      residenceCountry: "Vietnam",
      residenceCity: "HANOI",
      destination: "Schengen area",
      schengenState: "Italy",
      purpose: "tourism",
      tripLengthDays: 4,
      fundsAvailable: { amount: 2500, currency: "EUR" },
      hasAccommodationBooked: true,
      ties: { employmentStatus: "employed", ownsProperty: true },
      travelHistory: { previousVisitsToDestination: 1, previousRefusals: 0 },
    },
  },
];

/** Guards the first answer without consuming the retry, so we can see it. */
function guardOnce(profile: Profile, output: ModelOutput) {
  const retrieved = retrieve(profile);
  const placeholders = buildPlaceholders(profile, retrieved);
  return guardModelOutput(
    output.baseRateReading,
    [...output.reasons, ...output.checklist],
    {
      declaredDestination: profile.destination,
      declaredSchengenState: profile.schengenState,
      otherJurisdictions: [...COVERED_SCHENGEN_STATES, "United Kingdom", "United States"],
    },
    (text) => checkPlaceholders(text, placeholders),
  );
}

async function main() {
  const provider = detectProvider();
  if (!provider) throw new Error("No provider configured.");
  console.log(`provider: ${describeProvider(provider)}\n`);

  mkdirSync(FIXTURE_DIR, { recursive: true });
  const summary: Array<Record<string, unknown>> = [];

  for (const testCase of CASES) {
    const profile = ProfileSchema.parse(testCase.profile);
    const client = createModelClient();

    // First, one raw call, guarded but not retried, to see what the provider
    // does unaided. This is the number that matters for the report.
    let firstPassClean: boolean | null = null;
    let firstViolations: string[] = [];
    try {
      const raw = await client.assess(
        SYSTEM_PROMPT,
        renderUserMessage(profile, retrieve(profile)),
      );
      const violations = guardOnce(profile, raw);
      firstPassClean = violations.length === 0;
      firstViolations = violations.map((v) => `${v.rule}: ${v.excerpt.slice(0, 90)}`);
    } catch (error) {
      firstViolations = [`call failed: ${(error as Error).message.slice(0, 120)}`];
    }

    // Then the real path, which allows the single retry.
    let saved = false;
    let finalError: string | null = null;
    try {
      const result = await assess(profile, client);
      writeFileSync(
        join(FIXTURE_DIR, `${testCase.name}.json`),
        JSON.stringify({ profile: testCase.profile, response: result }, null, 2) + "\n",
        "utf-8",
      );
      saved = true;
    } catch (error) {
      finalError =
        error instanceof ModelOutputRejectedError
          ? `rejected after retry: ${error.violations.map((v) => v.rule).join(", ")}`
          : (error as Error).message.slice(0, 160);
    }

    summary.push({
      case: testCase.name,
      firstAttemptClean: firstPassClean,
      firstAttemptViolations: firstViolations,
      savedFixture: saved,
      finalError,
    });
    console.log(
      `${testCase.name}\n  first attempt clean: ${firstPassClean}\n` +
        (firstViolations.length ? `  tripped: ${firstViolations.join(" | ")}\n` : "") +
        `  fixture saved: ${saved}${finalError ? `\n  final: ${finalError}` : ""}\n`,
    );
  }

  const clean = summary.filter((s) => s.firstAttemptClean === true).length;
  const savedCount = summary.filter((s) => s.savedFixture).length;
  console.log(
    `\nfirst attempt clean: ${clean} of ${CASES.length}. fixtures saved: ${savedCount}.`,
  );
}

await main();
