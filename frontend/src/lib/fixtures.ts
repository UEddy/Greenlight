import type { AssessResponse } from "@/lib/types";

import ghanaSpain from "../../../backend/test/fixtures/ghana-spain-schengen-bait.json" with { type: "json" };
import indiaUs from "../../../backend/test/fixtures/india-us-business-strong.json" with { type: "json" };
import nigeriaRomania from "../../../backend/test/fixtures/nigeria-romania-invitation-variant.json" with { type: "json" };
import nigeriaUk from "../../../backend/test/fixtures/nigeria-uk-conference-weak.json" with { type: "json" };
import vietnamItaly from "../../../backend/test/fixtures/vietnam-italy-length-grid.json" with { type: "json" };

/**
 * The captured responses, imported rather than read from disk.
 *
 * These were real answers from the live model, saved unedited by
 * scripts/capture-fixtures.ts. They drive the landing page and the gallery, so
 * both work with no API call, no key and no network.
 *
 * Imported statically for the same reason the datasets are. The previous
 * version walked backend/test/fixtures with readdirSync from process.cwd(),
 * which is fine locally and is precisely the thing that disappears inside a
 * serverless bundle: a different working directory, and a directory that was
 * never traced as a dependency. Naming each file makes the bundler include
 * them, so the landing page cannot deploy in a state where its verdict card
 * has nothing to render. Adding a fixture means adding a line here, which is
 * the small price for that guarantee.
 */

export interface FixtureProfile {
  passportCountry: string;
  residenceCountry: string;
  residenceCity?: string;
  destination: string;
  schengenState?: string;
  purpose: string;
  tripLengthDays: number;
}

export interface Fixture {
  name: string;
  profile: FixtureProfile;
  response: AssessResponse;
}

interface RawFixture {
  profile: FixtureProfile;
  response: AssessResponse;
}

const FIXTURES: Array<{ name: string; data: unknown }> = [
  { name: "ghana-spain-schengen-bait", data: ghanaSpain },
  { name: "india-us-business-strong", data: indiaUs },
  { name: "nigeria-romania-invitation-variant", data: nigeriaRomania },
  { name: "nigeria-uk-conference-weak", data: nigeriaUk },
  { name: "vietnam-italy-length-grid", data: vietnamItaly },
];

export function loadFixtures(): Fixture[] {
  return FIXTURES.map(({ name, data }) => {
    const raw = data as RawFixture;
    return { name, profile: raw.profile, response: raw.response };
  });
}

/** The card the landing page leads with: a real ABORT on a real profile. */
export function abortFixture(): Fixture {
  const all = loadFixtures();
  return all.find((f) => f.response.verdict === "ABORT") ?? all[0]!;
}
