/**
 * Loads the curated JSON from data/processed/ once, at startup.
 *
 * Nothing here reads data/raw/. Nothing here reaches the network. The four
 * files are the only source of every number this service will ever put in
 * front of a user, so they are loaded once and then treated as read only.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ESM has no __dirname. Derive the repo root from this module's own URL so the
// service can be started from any working directory.
const here = dirname(fileURLToPath(import.meta.url));
const PROCESSED_DIR = join(here, "..", "..", "data", "processed");

export interface UkRecord {
  nationality: string;
  iso3: string;
  destination: string;
  visa_group: string;
  axis: "nationality";
  measure: string;
  numerator: number;
  denominator: number;
  refusal_rate: number;
  refusal_rate_percent: number;
  outcome_counts: Record<string, number>;
  source_year: number;
  year_basis: string;
  source_url: string;
  source_landing_url: string;
  retrieved_at: string;
  methodology: string;
  base_rate_caveat: string;
}

export interface UsRecord {
  nationality: string;
  iso3: string;
  destination: string;
  visa_group: string;
  axis: "nationality";
  measure: string;
  numerator: number | null;
  denominator: number | null;
  refusal_rate: number;
  refusal_rate_percent: number;
  rate_as_published: string;
  source_year: number;
  year_basis: string;
  source_url: string;
  source_landing_url: string;
  retrieved_at: string;
  methodology: string;
  base_rate_caveat: string;
}

export interface SchengenRecord {
  level: "consulate" | "consulate_city" | "consulate_country";
  location_country: string;
  iso3: string;
  consulate_city: string | null;
  schengen_state: string | null;
  destination: string;
  visa_type: string;
  counts: Record<string, number>;
  axis: "application_location";
  measure: string;
  numerator: number;
  denominator: number;
  not_issued_rate: number;
  not_issued_rate_percent: number;
  source_year: number;
  year_basis: string;
  source_url: string;
  source_landing_url: string;
  retrieved_at: string;
  methodology: string;
  base_rate_caveat: string;
}

export interface FinancialVariant {
  condition: string;
  basis: string;
  amount: number | null;
  currency: string | null;
  note: string | null;
  min_days: number | null;
  max_days: number | null;
  participants: "one" | "two_or_more" | null;
  applies_to_iso3: string[] | null;
}

export interface FinancialRecord {
  jurisdiction: string;
  state: string;
  iso3: string;
  in_schengen_area: boolean;
  basis: string;
  currency: string | null;
  per_day_amount: number | null;
  per_entry_amount: number | null;
  trip_minimum_amount: number | null;
  amount_status: string;
  applies_to: string | null;
  variants: FinancialVariant[];
  legal_basis: string | null;
  notes: string | null;
  source_url: string;
  source_landing_url: string;
  source_version: string;
  source_year: number;
  national_source: {
    publisher: string;
    url: string;
    checked_on: string;
    states_an_amount: boolean;
    agrees_with_annex: boolean | null;
    note: string;
  } | null;
  axis: "destination";
  measure: string;
  retrieved_at: string;
  methodology: string;
  threshold_caveat: string;
}

interface Envelope<T> {
  records: T[];
  [key: string]: unknown;
}

function load<T>(filename: string): Envelope<T> {
  const raw = readFileSync(join(PROCESSED_DIR, filename), "utf-8");
  return JSON.parse(raw) as Envelope<T>;
}

const ukFile = load<UkRecord>("uk-visitor-refusals.json");
const usFile = load<UsRecord>("us-b-visa-refusals.json");
const schengenFile = load<SchengenRecord>("schengen-consulate-not-issued.json");
const financialFile = load<FinancialRecord>("financial-requirements.json");

export const dataset = {
  uk: ukFile.records,
  us: usFile.records,
  schengen: schengenFile.records,
  financial: financialFile.records,
  baseRateCaveat: ukFile["base_rate_caveat"] as string,
  financialThresholdCaveat: financialFile["threshold_caveat"] as string,
  financialAxisWarning: financialFile["axis_warning"] as string,
  schengenAxisWarning: schengenFile["axis_warning"] as string,
};

/** Destinations the product supports. Anything else is coverage, not a guess. */
export const SUPPORTED_DESTINATIONS = [
  "United Kingdom",
  "United States",
  "Schengen area",
] as const;

export type Destination = (typeof SUPPORTED_DESTINATIONS)[number];

/** Nationalities with a refusal record. Derived, never hardcoded. */
export const COVERED_NATIONALITIES: string[] = [
  ...new Set(dataset.uk.map((r) => r.nationality)),
].sort();

/** Countries with a Schengen consulate record, for the residence axis. */
export const COVERED_APPLICATION_LOCATIONS: string[] = [
  ...new Set(dataset.schengen.map((r) => r.location_country)),
].sort();

/** Schengen states with a published financial record, main destination picker. */
export const COVERED_SCHENGEN_STATES: string[] = dataset.financial
  .filter((r) => r.in_schengen_area)
  .map((r) => r.state)
  .sort();
