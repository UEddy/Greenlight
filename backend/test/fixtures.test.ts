/**
 * The saved fixtures are real responses, so they must survive the guards.
 *
 * These were captured from live Gemini calls by scripts/capture-fixtures.ts
 * and were not edited afterwards. Re-running every guard over them proves two
 * things at once: that the demo can replay them safely with no network, and
 * that what a real provider actually returned is genuinely compliant rather
 * than compliant-looking.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COVERED_SCHENGEN_STATES } from "../src/dataset";
import { allowedFigures, checkAdvice, checkFigures, checkNoDigits } from "../src/guard";
import { renderContext } from "../src/prompt";
import { retrieve } from "../src/retrieval";
import { ProfileSchema, type AssessResponse } from "../src/types";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(here, "fixtures");

interface Fixture {
  profile: unknown;
  response: AssessResponse;
}

const files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".json"));

describe("saved fixtures", () => {
  it("has enough of them to demo without a live call", () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  for (const file of files) {
    describe(file, () => {
      const fixture = JSON.parse(
        readFileSync(join(FIXTURE_DIR, file), "utf-8"),
      ) as Fixture;
      const profile = ProfileSchema.parse(fixture.profile);
      const response = fixture.response;
      const prose = [...response.reasons, ...response.checklist];

      it("carries a verdict and the base rate caveat", () => {
        expect(["GO", "MARGINAL", "ABORT"]).toContain(response.verdict);
        expect(response.baseRateCaveat).toContain("not a personal probability");
      });

      it("has no unsubstituted token left in it", () => {
        expect(response.baseRateReading).not.toContain("{{");
      });

      it("carries no digit the model wrote itself", () => {
        for (const text of prose) {
          expect(checkNoDigits(text), `offending text: ${text}`).toEqual([]);
        }
      });

      it("carries only figures that are in the retrieved context", () => {
        const allowed = allowedFigures(renderContext(profile, retrieve(profile)));
        expect(
          checkFigures(response.baseRateReading, allowed),
          `base rate line: ${response.baseRateReading}`,
        ).toEqual([]);
      });

      it("suggests no other place to apply and no misrepresentation", () => {
        const adviceContext = {
          declaredDestination: profile.destination,
          declaredSchengenState: profile.schengenState,
          otherJurisdictions: [
            ...COVERED_SCHENGEN_STATES,
            "United Kingdom",
            "United States",
          ],
        };
        for (const text of [response.baseRateReading, ...prose]) {
          expect(checkAdvice(text, adviceContext), `offending text: ${text}`).toEqual([]);
        }
      });

      it("keeps the axes apart", () => {
        const { nationality, applicationLocation } = response.refusalRate;
        if (profile.destination === "Schengen area") {
          expect(nationality).toBeNull();
          expect(applicationLocation).not.toBeNull();
        } else {
          expect(nationality).not.toBeNull();
          expect(applicationLocation).toBeNull();
        }
      });
    });
  }
});
