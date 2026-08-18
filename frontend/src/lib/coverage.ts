/**
 * What the pickers may offer, and the mapping from a country code to a name.
 *
 * Coverage is deliberately short and it is not a roadmap. The UAE, Singapore,
 * Turkey, Thailand and South Korea are absent because they publish no usable
 * refusal statistics by nationality, not because they are coming later. The
 * interface says so rather than showing them greyed out as though they were.
 */

export const NATIONALITIES = [
  "Bangladesh",
  "Egypt",
  "Ghana",
  "India",
  "Indonesia",
  "Kenya",
  "Morocco",
  "Nepal",
  "Nigeria",
  "Pakistan",
  "Philippines",
  "Vietnam",
] as const;

export const DESTINATIONS = [
  "United Kingdom",
  "United States",
  "Schengen area",
] as const;

export const SCHENGEN_STATES = [
  "Austria", "Belgium", "Bulgaria", "Croatia", "Czech Republic", "Denmark",
  "Estonia", "Finland", "France", "Germany", "Greece", "Hungary", "Iceland",
  "Italy", "Latvia", "Liechtenstein", "Lithuania", "Luxembourg", "Malta",
  "Netherlands", "Norway", "Poland", "Portugal", "Romania", "Slovakia",
  "Slovenia", "Spain", "Sweden", "Switzerland",
] as const;

export const PURPOSES = [
  { value: "conference", label: "A conference or event" },
  { value: "business", label: "Business" },
  { value: "tourism", label: "Tourism" },
  { value: "visiting_family", label: "Visiting family or friends" },
  { value: "study_short", label: "Short course or study" },
  { value: "other", label: "Something else" },
] as const;

export const UNSUPPORTED_NOTE =
  "The UAE, Singapore, Turkey, Thailand and South Korea are not here because they publish no refusal statistics by nationality in any usable form. That is a gap in what exists, not a gap we are about to fill.";

/**
 * ISO 3166-1 alpha-2 to country name, for the countries this product covers
 * plus the places its users commonly apply from. A code outside this list is
 * treated as no guess at all rather than shown raw, because "Looks like you
 * are in ZZ" is worse than asking.
 */
const CODE_TO_COUNTRY: Record<string, string> = {
  AE: "United Arab Emirates",
  BD: "Bangladesh",
  CA: "Canada",
  CN: "China",
  DE: "Germany",
  EG: "Egypt",
  ES: "Spain",
  FR: "France",
  GB: "United Kingdom",
  GH: "Ghana",
  ID: "Indonesia",
  IN: "India",
  IT: "Italy",
  KE: "Kenya",
  MA: "Morocco",
  MY: "Malaysia",
  NG: "Nigeria",
  NL: "Netherlands",
  NP: "Nepal",
  PH: "Philippines",
  PK: "Pakistan",
  PT: "Portugal",
  QA: "Qatar",
  SA: "Saudi Arabia",
  SG: "Singapore",
  TH: "Thailand",
  TR: "Turkey",
  US: "United States",
  VN: "Vietnam",
  ZA: "South Africa",
};

/** Countries someone might plausibly be applying from. Superset of coverage. */
export const RESIDENCE_COUNTRIES = [
  ...new Set([...Object.values(CODE_TO_COUNTRY), ...NATIONALITIES]),
].sort();

export function countryFromCode(code: string | null | undefined): string | null {
  if (!code) return null;
  return CODE_TO_COUNTRY[code.toUpperCase()] ?? null;
}

/** ISO3 codes, used only to set the nationality field of the readable zone. */
export const ISO3: Record<string, string> = {
  Bangladesh: "BGD",
  Egypt: "EGY",
  Ghana: "GHA",
  India: "IND",
  Indonesia: "IDN",
  Kenya: "KEN",
  Morocco: "MAR",
  Nepal: "NPL",
  Nigeria: "NGA",
  Pakistan: "PAK",
  Philippines: "PHL",
  Vietnam: "VNM",
};
