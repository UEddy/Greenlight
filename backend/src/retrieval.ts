/**
 * Deterministic retrieval. Every number in the response is produced here.
 *
 * The model is called later and is never shown a question it could answer with
 * a figure of its own invention. It receives what this module found, and its
 * job is to read it. If this module finds nothing, the answer is that coverage
 * is missing, never an estimate.
 */

import {
  dataset,
  type FinancialRecord,
  type FinancialVariant,
  type SchengenRecord,
} from "./dataset.js";
import type {
  AppliedVariant,
  CoverageNote,
  FinancialRequirement,
  Profile,
  RateFigure,
} from "./types.js";

export interface Retrieved {
  nationalityRate: RateFigure | null;
  applicationLocationRate: RateFigure | null;
  /**
   * The one figure the verdict is read against, and the only record the base
   * rate line's placeholders resolve from. Exactly one axis is ever populated
   * for a given destination, so this is a selection and never a merge.
   */
  primaryRate: RateFigure | null;
  financial: FinancialRequirement;
  coverageNotes: CoverageNote[];
  /** Whichever refusal source actually backs the verdict, for the top level. */
  primarySource: { sourceYear: number; sourceUrl: string } | null;
}

export class CoverageError extends Error {
  constructor(
    message: string,
    readonly notes: CoverageNote[],
  ) {
    super(message);
    this.name = "CoverageError";
  }
}

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * The source lists consulate cities in capitals. That is fine in a table and
 * wrong inside a sentence, and the subject string is read aloud on the card,
 * so it is cased for display here. The underlying record is untouched.
 */
function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1)))
    .join(" ");
}

/** Nationality axis, UK. Carries a real numerator and denominator. */
function ukRate(profile: Profile): RateFigure | null {
  const record = dataset.uk.find(
    (r) => normalise(r.nationality) === normalise(profile.passportCountry),
  );
  if (!record) return null;
  return {
    axis: "nationality",
    label:
      "Visitor visa decisions refused, out of decisions made, for holders of this passport",
    subject: `${record.nationality} passport holders applying for a UK ${record.visa_group} visa`,
    measure: record.measure,
    ratePercent: record.refusal_rate_percent,
    numerator: record.numerator,
    denominator: record.denominator,
    sourceYear: record.source_year,
    sourceUrl: record.source_url,
    methodology: record.methodology,
    comparableWithOtherAxis: false,
  };
}

/** Nationality axis, US. The Department publishes a rate and no counts. */
function usRate(profile: Profile): RateFigure | null {
  const record = dataset.us.find(
    (r) => normalise(r.nationality) === normalise(profile.passportCountry),
  );
  if (!record) return null;
  return {
    axis: "nationality",
    label:
      "Adjusted refusal rate for B visitor visas, per person, for holders of this passport",
    subject: `${record.nationality} passport holders applying for US ${record.visa_group}`,
    measure: record.measure,
    ratePercent: record.refusal_rate_percent,
    numerator: record.numerator,
    denominator: record.denominator,
    sourceYear: record.source_year,
    sourceUrl: record.source_url,
    methodology: record.methodology,
    comparableWithOtherAxis: false,
  };
}

/**
 * Application location axis, Schengen. Keyed on where the person applies from,
 * never on their passport. Prefers their city when the source has it, because
 * a city record is the closest true statement about where they will queue.
 */
function schengenLocationRate(profile: Profile): {
  figure: RateFigure | null;
  note: CoverageNote | null;
} {
  const inCountry = dataset.schengen.filter(
    (r) => normalise(r.location_country) === normalise(profile.residenceCountry),
  );
  if (inCountry.length === 0) {
    return {
      figure: null,
      note: {
        field: "residenceCountry",
        message:
          `The Schengen consulate statistics have no rows for ${profile.residenceCountry}, ` +
          `so there is no application location figure for where this person applies from. ` +
          `No figure is estimated in its place.`,
      },
    };
  }

  let record: SchengenRecord | undefined;
  let note: CoverageNote | null = null;

  if (profile.residenceCity) {
    record = inCountry.find(
      (r) =>
        r.level === "consulate_city" &&
        r.consulate_city !== null &&
        normalise(r.consulate_city) === normalise(profile.residenceCity!),
    );
    if (!record) {
      note = {
        field: "residenceCity",
        message:
          `The source has no consulate city called ${profile.residenceCity} in ` +
          `${profile.residenceCountry}. The country level figure is used instead, and it ` +
          `covers every consulate city in that country.`,
      };
    }
  }
  if (!record) {
    record = inCountry.find((r) => r.level === "consulate_country");
  }
  if (!record) return { figure: null, note };

  const where =
    record.level === "consulate_city"
      ? `consulates in ${titleCase(record.consulate_city!)}, ${record.location_country}`
      : `all Schengen consulates in ${record.location_country}`;

  return {
    figure: {
      axis: "application_location",
      label:
        "Uniform visas not issued, out of applications made, at the consulates in this place",
      subject: `applications made at ${where}, whatever passport the applicant held`,
      measure: record.measure,
      ratePercent: record.not_issued_rate_percent,
      numerator: record.numerator,
      denominator: record.denominator,
      sourceYear: record.source_year,
      sourceUrl: record.source_url,
      methodology: record.methodology,
      comparableWithOtherAxis: false,
    },
    note,
  };
}

/**
 * Picks the variants that actually apply to this profile.
 *
 * This is where Romania's invitation procedure and Italy's length grid stop
 * being footnotes. Both are selected on the machine readable fields in the
 * dataset, never by matching English in the condition string.
 */
function selectVariants(
  record: FinancialRecord,
  profile: Profile,
): AppliedVariant[] {
  const applied: AppliedVariant[] = [];
  const days = profile.tripLengthDays;
  const party = profile.travellingWithOthers ? "two_or_more" : "one";

  for (const v of record.variants) {
    const reasons: string[] = [];

    if (v.applies_to_iso3) {
      const iso3 = nationalityIso3(profile.passportCountry);
      if (!iso3 || !v.applies_to_iso3.includes(iso3)) continue;
      reasons.push(
        `${profile.passportCountry} is on the list of nationalities this rule names`,
      );
    }

    const hasDayBounds = v.min_days !== null || v.max_days !== null;
    if (hasDayBounds) {
      const aboveFloor = v.min_days === null || days >= v.min_days;
      const belowCeiling = v.max_days === null || days <= v.max_days;
      if (!aboveFloor || !belowCeiling) continue;
      reasons.push(`the trip is ${days} days long`);
    }

    if (v.participants) {
      if (v.participants !== party) continue;
      reasons.push(
        party === "one"
          ? "the applicant is travelling alone"
          : "the applicant is travelling with others",
      );
    }

    // A variant with no selectors is a conditional exemption, such as a host
    // declaration. Surface it only when the profile says the condition is met,
    // otherwise it is noise on the card.
    if (reasons.length === 0) {
      const conditional = describesSupportArrangement(v);
      if (!conditional) continue;
      if (conditional === "accommodation" && !profile.hasAccommodationBooked) continue;
      if (conditional === "host" && !profile.hasHostDeclaration) continue;
      reasons.push(
        conditional === "accommodation"
          ? "the applicant says accommodation is already booked"
          : "the applicant says a host will sign a declaration",
      );
    }

    applied.push({
      condition: v.condition,
      basis: v.basis,
      amount: v.amount,
      currency: v.currency,
      note: v.note,
      whyItApplies: `Surfaced because ${reasons.join(" and ")}.`,
    });
  }
  return applied;
}

function describesSupportArrangement(
  v: FinancialVariant,
): "host" | "accommodation" | null {
  const c = v.condition.toLowerCase();
  if (
    c.includes("guarantee") ||
    c.includes("invitation") ||
    c.includes("declaration") ||
    c.includes("host") ||
    c.includes("private individual") ||
    c.includes("liability") ||
    c.includes("undertaking") ||
    c.includes("inviting")
  ) {
    return "host";
  }
  if (
    c.includes("hotel") ||
    c.includes("booking") ||
    c.includes("board and lodging") ||
    c.includes("accommodation") ||
    c.includes("prepaid")
  ) {
    return "accommodation";
  }
  return null;
}

function nationalityIso3(name: string): string | null {
  const record =
    dataset.uk.find((r) => normalise(r.nationality) === normalise(name)) ??
    dataset.us.find((r) => normalise(r.nationality) === normalise(name));
  return record?.iso3 ?? null;
}

/**
 * The trip total, computed in code or not at all.
 *
 * Only computed where the state publishes a plain daily amount. A tiered or
 * gridded requirement is left to the variants, because multiplying the wrong
 * row by the number of days would produce a confident, sourced, wrong number,
 * which is worse than no number.
 */
function estimateTripTotal(
  record: FinancialRecord,
  profile: Profile,
): FinancialRequirement["estimatedTripTotal"] {
  if (record.basis !== "per_day" && record.basis !== "per_day_and_per_entry") {
    return null;
  }
  if (record.per_day_amount === null || record.currency === null) return null;

  const days = profile.tripLengthDays;
  const daily = record.per_day_amount * days;
  const entry = record.per_entry_amount ?? 0;
  let total = daily + entry;

  const parts = [
    `${record.per_day_amount} ${record.currency} per day for ${days} days`,
  ];
  if (entry > 0) {
    parts.push(`plus ${record.per_entry_amount} ${record.currency} for the entry`);
  }

  let floorNote = "";
  if (record.trip_minimum_amount !== null && total < record.trip_minimum_amount) {
    total = record.trip_minimum_amount;
    floorNote =
      `, raised to the published floor of ${record.trip_minimum_amount} ` +
      `${record.currency}, which applies whatever the length of stay`;
  }

  return {
    amount: Number(total.toFixed(2)),
    currency: record.currency,
    explanation:
      `${parts.join(", ")}${floorNote}. Computed from the published amount, ` +
      `not published as a total by ${record.state}.`,
  };
}

function buildFinancial(
  record: FinancialRecord,
  profile: Profile,
): FinancialRequirement {
  const published = record.basis !== "none_published";

  // For the UK and the US the honest answer is a sentence, not a number. It is
  // assembled from the dataset rather than written here, so the claim traces to
  // the same source as everything else on the card.
  let qualitative: string | null = null;
  if (!published) {
    const official = record.national_source?.note ?? null;
    qualitative =
      `${record.state} publishes no set amount for this route. ` +
      `The official position is that funds must be adequate for this specific trip, ` +
      `judged case by case against the itinerary, the applicant's own means and their ` +
      `ties, rather than against a threshold. ` +
      (official ? `${official} ` : "") +
      `Legal basis: ${record.legal_basis ?? "see source"}.`;
  }

  return {
    destination: record.jurisdiction,
    state: record.jurisdiction === "Schengen area" ? record.state : null,
    published,
    basis: record.basis,
    amountStatus: record.amount_status,
    currency: record.currency,
    perDayAmount: record.per_day_amount,
    perEntryAmount: record.per_entry_amount,
    tripMinimumAmount: record.trip_minimum_amount,
    estimatedTripTotal: published ? estimateTripTotal(record, profile) : null,
    applicableVariants: selectVariants(record, profile),
    qualitativeStatement: qualitative,
    legalBasis: record.legal_basis,
    notes: record.notes,
    sourceYear: record.source_year,
    sourceUrl: record.source_url,
    methodology: record.methodology,
    thresholdCaveat: record.threshold_caveat,
  };
}

export function retrieve(profile: Profile): Retrieved {
  const coverageNotes: CoverageNote[] = [];

  // The passport branch. Someone without a passport in hand does not have an
  // odds question yet, they have a timeline, and answering with a verdict
  // would be answering the wrong question confidently.
  if (profile.passportStatus !== "valid") {
    throw new CoverageError(
      "An odds assessment needs a valid passport in hand.",
      [
        {
          field: "passportStatus",
          message:
            profile.passportStatus === "expired"
              ? "This passport is expired. Renewal comes first, and the honest next step is a renewal timeline rather than a verdict on odds."
              : "There is no passport yet. Issuance comes first, and the honest next step is an issuance timeline rather than a verdict on odds.",
        },
      ],
    );
  }

  // Financial record. Selected on the destination, and on the main destination
  // state when the destination is the Schengen area.
  let financialRecord: FinancialRecord | undefined;
  if (profile.destination === "Schengen area") {
    if (!profile.schengenState) {
      throw new CoverageError(
        "A Schengen assessment needs the main destination state.",
        [
          {
            field: "schengenState",
            message:
              "Each Schengen state sets its own financial requirement, and they differ by almost nine to one. Name the state where the applicant will spend the most time.",
          },
        ],
      );
    }
    financialRecord = dataset.financial.find(
      (r) =>
        r.in_schengen_area &&
        normalise(r.state) === normalise(profile.schengenState!),
    );
  } else {
    financialRecord = dataset.financial.find(
      (r) => normalise(r.jurisdiction) === normalise(profile.destination),
    );
  }

  if (!financialRecord) {
    throw new CoverageError("No financial requirement record for that destination.", [
      {
        field: "destination",
        message: `No published financial requirement is held for ${profile.schengenState ?? profile.destination}.`,
      },
    ]);
  }

  let nationalityRate: RateFigure | null = null;
  let applicationLocationRate: RateFigure | null = null;

  if (profile.destination === "United Kingdom") {
    nationalityRate = ukRate(profile);
  } else if (profile.destination === "United States") {
    nationalityRate = usRate(profile);
  } else {
    const { figure, note } = schengenLocationRate(profile);
    applicationLocationRate = figure;
    if (note) coverageNotes.push(note);
    coverageNotes.push({
      field: "refusalRate.nationality",
      message:
        "No nationality refusal rate is shown for the Schengen area. The Commission file has no applicant nationality column at all, so no such figure exists to retrieve. What is shown instead is a rate for where the application is made.",
    });
  }

  if (profile.destination !== "Schengen area" && !nationalityRate) {
    coverageNotes.push({
      field: "passportCountry",
      message: `No refusal record is held for ${profile.passportCountry} at ${profile.destination}. No rate is estimated in its place.`,
    });
  }

  if (!nationalityRate && !applicationLocationRate) {
    throw new CoverageError("No refusal figure could be retrieved for this pair.", [
      ...coverageNotes,
      {
        field: "coverage",
        message:
          "Without a retrieved base rate there is nothing to read a profile against, so no verdict is produced. Coverage is missing, and this service does not guess.",
      },
    ]);
  }

  const primary = nationalityRate ?? applicationLocationRate;

  return {
    nationalityRate,
    applicationLocationRate,
    primaryRate: primary,
    financial: buildFinancial(financialRecord, profile),
    coverageNotes,
    primarySource: primary
      ? { sourceYear: primary.sourceYear, sourceUrl: primary.sourceUrl }
      : null,
  };
}
