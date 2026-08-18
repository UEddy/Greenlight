import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AssessResponse } from "@/lib/types";

/**
 * Reads the captured responses from the backend package.
 *
 * These are real answers from a live provider, saved unedited, and they are
 * what the card is designed against. Styling iterations cost nothing and burn
 * no free tier quota, and the layout gets exercised against real prose lengths
 * rather than lorem ipsum that always happens to fit.
 *
 * Server side only. Called from a server component.
 */

const FIXTURE_DIR = join(process.cwd(), "..", "backend", "test", "fixtures");

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

export function loadFixtures(): Fixture[] {
  let files: string[];
  try {
    files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  return files.map((file) => {
    const parsed = JSON.parse(readFileSync(join(FIXTURE_DIR, file), "utf-8")) as {
      profile: FixtureProfile;
      response: AssessResponse;
    };
    return { name: file.replace(/\.json$/, ""), ...parsed };
  });
}
