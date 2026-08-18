/**
 * The shape POST /assess returns. Mirrors backend/src/types.ts.
 *
 * Note what refusalRate is: an object with one field per axis, never a number.
 * The card is built against that shape on purpose, so there is no single
 * numeric field a component could reach for and render as "the" rate.
 */

export type Verdict = "GO" | "MARGINAL" | "ABORT";
export type Confidence = "low" | "medium" | "high";

export interface RateFigure {
  axis: "nationality" | "application_location";
  label: string;
  subject: string;
  measure: string;
  ratePercent: number;
  numerator: number | null;
  denominator: number | null;
  sourceYear: number;
  sourceUrl: string;
  methodology: string;
  comparableWithOtherAxis: false;
}

export interface AppliedVariant {
  condition: string;
  basis: string;
  amount: number | null;
  currency: string | null;
  note: string | null;
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
  estimatedTripTotal: { amount: number; currency: string; explanation: string } | null;
  applicableVariants: AppliedVariant[];
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
  verdict: Verdict;
  confidence: Confidence;
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
  baseRateReading: string;
  coverageNotes: CoverageNote[];
}

/** The 502 the backend returns when a judgement fails its own guards. */
export interface RejectedJudgement {
  error: "model_output_rejected";
  message: string;
  violations: Array<{ rule: string; detail: string; excerpt: string }>;
  retrieved: {
    refusalRate: {
      nationality: RateFigure | null;
      applicationLocation: RateFigure | null;
    };
    financialRequirement: FinancialRequirement;
    coverageNotes: CoverageNote[];
  };
}

export interface CoverageMissing {
  error: "coverage_missing";
  message: string;
  coverageNotes: CoverageNote[];
  note: string;
}

/** What the onboarding conversation collects, before the assess form. */
export interface Onboarding {
  residenceCountry: string;
  residenceConfirmed: boolean;
  passportCountry: string;
  passportStatus: "valid" | "expired" | "none";
}
