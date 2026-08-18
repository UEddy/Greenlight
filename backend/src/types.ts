/**
 * The wire contract for POST /assess.
 *
 * The response shape is the one in section 6 of the build spec, plus the base
 * rate caveat. One deliberate change: `refusalRate` is an object with a
 * separate field per axis rather than a bare number. A nationality refusal
 * rate and a Schengen application location rate answer different questions,
 * and a single numeric field is exactly the shape that invites a card to
 * render them as one comparable figure. Splitting them makes that mistake
 * impossible to make by accident.
 */

import { z } from "zod";

export const PURPOSES = [
  "conference",
  "business",
  "tourism",
  "visiting_family",
  "study_short",
  "other",
] as const;

export const ProfileSchema = z.object({
  /** What passport they hold. This is the nationality axis. */
  passportCountry: z.string().min(1),
  passportStatus: z.enum(["valid", "expired", "none"]),
  /** Where they are applying from. This is the application location axis. */
  residenceCountry: z.string().min(1),
  residenceCity: z.string().min(1).optional(),
  destination: z.enum(["United Kingdom", "United States", "Schengen area"]),
  /** Main destination state, required when destination is the Schengen area. */
  schengenState: z.string().min(1).optional(),
  purpose: z.enum(PURPOSES),
  tripLengthDays: z.number().int().positive().max(365),
  travellingWithOthers: z.boolean().default(false),
  fundsAvailable: z
    .object({ amount: z.number().nonnegative(), currency: z.string().min(3).max(3) })
    .optional(),
  hasAccommodationBooked: z.boolean().default(false),
  hasHostDeclaration: z.boolean().default(false),
  ties: z
    .object({
      employmentStatus: z
        .enum(["employed", "self_employed", "student", "unemployed", "other"])
        .optional(),
      ownsProperty: z.boolean().optional(),
      hasDependants: z.boolean().optional(),
      monthlyIncomeLocalCurrency: z.number().nonnegative().optional(),
    })
    .optional(),
  travelHistory: z
    .object({
      previousVisitsToDestination: z.number().int().nonnegative().optional(),
      previousSchengenUkUsVisas: z.number().int().nonnegative().optional(),
      previousRefusals: z.number().int().nonnegative().optional(),
      previousOverstays: z.boolean().optional(),
    })
    .optional(),
});

export type Profile = z.infer<typeof ProfileSchema>;

/** One refusal figure on exactly one axis. Never merged with the other. */
export interface RateFigure {
  axis: "nationality" | "application_location";
  /** What the number counts, in words, so a card can label it honestly. */
  label: string;
  subject: string;
  measure: string;
  ratePercent: number;
  numerator: number | null;
  denominator: number | null;
  sourceYear: number;
  sourceUrl: string;
  methodology: string;
  /** Always false. The three sources never share an axis. */
  comparableWithOtherAxis: false;
}

export interface AppliedVariant {
  condition: string;
  basis: string;
  amount: number | null;
  currency: string | null;
  note: string | null;
  /** Why this variant was surfaced for this profile. */
  whyItApplies: string;
}

export interface FinancialRequirement {
  destination: string;
  state: string | null;
  published: boolean;
  basis: string;
  amountStatus: string;
  currency: string | null;
  perDayAmount: number | null;
  perEntryAmount: number | null;
  tripMinimumAmount: number | null;
  /** Computed in code from the published amount and the trip length, or null. */
  estimatedTripTotal: {
    amount: number;
    currency: string;
    explanation: string;
  } | null;
  /** Variants that apply to this specific profile, surfaced not collapsed. */
  applicableVariants: AppliedVariant[];
  /** For the UK and US, the official position in place of a threshold. */
  qualitativeStatement: string | null;
  legalBasis: string | null;
  notes: string | null;
  sourceYear: number;
  sourceUrl: string;
  methodology: string;
  thresholdCaveat: string;
}

export interface CoverageNote {
  field: string;
  message: string;
}

export interface AssessResponse {
  verdict: "GO" | "MARGINAL" | "ABORT";
  confidence: "low" | "medium" | "high";
  refusalRate: {
    nationality: RateFigure | null;
    applicationLocation: RateFigure | null;
    axisNote: string;
  };
  sourceYear: number;
  sourceUrl: string;
  financialRequirement: FinancialRequirement;
  reasons: string[];
  checklist: string[];
  baseRateCaveat: string;
  /** The one plain line the spec asks the verdict card to carry. */
  baseRateReading: string;
  coverageNotes: CoverageNote[];
}

/**
 * What the model is allowed to return. Note what is absent: every numeric
 * field. The model chooses a verdict and writes prose. Code supplies each
 * number in the response above.
 */
export const ModelOutputSchema = z.object({
  verdict: z.enum(["GO", "MARGINAL", "ABORT"]),
  confidence: z.enum(["low", "medium", "high"]),
  baseRateReading: z.string().min(20).max(400),
  reasons: z.array(z.string().min(10).max(400)).min(2).max(6),
  checklist: z.array(z.string().min(5).max(200)).min(3).max(14),
});

export type ModelOutput = z.infer<typeof ModelOutputSchema>;
