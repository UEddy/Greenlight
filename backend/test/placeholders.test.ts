/**
 * The hole these tests exist for.
 *
 * The old figure guard checked whether a number appeared anywhere in the
 * retrieved context. That catches invention and misses misattribution. For a
 * Nigerian profile assessed against the Schengen area, the application
 * location figure is legitimately in the context, so "the UK refusal rate for
 * your passport is 46.93 percent" cleared the allowlist while being false on
 * three counts: wrong destination, wrong axis, wrong subject. It would have
 * rendered with a source and a year beside it.
 */

import { describe, expect, it } from "vitest";
import { assess, ModelOutputRejectedError } from "../src/assess.js";
import { allowedFigures, checkFigures, checkNoDigits } from "../src/guard.js";
import type { ModelClient } from "../src/model.js";
import {
  buildPlaceholders,
  checkPlaceholders,
  substitute,
} from "../src/placeholders.js";
import { renderContext } from "../src/prompt.js";
import { retrieve } from "../src/retrieval.js";
import { ProfileSchema, type ModelOutput, type Profile } from "../src/types.js";

function profile(overrides: Partial<Profile> = {}): Profile {
  return ProfileSchema.parse({
    passportCountry: "Nigeria",
    passportStatus: "valid",
    residenceCountry: "Nigeria",
    residenceCity: undefined,
    destination: "Schengen area",
    schengenState: "Germany",
    purpose: "conference",
    tripLengthDays: 6,
    ...overrides,
  });
}

const GOOD_LINE =
  "Among {{subject}}, the published figure for {{year}} is {{rate}}, which is a base rate for that whole group and not your personal odds; this verdict reads your profile against it.";

const BASE_OUTPUT: ModelOutput = {
  verdict: "MARGINAL",
  confidence: "medium",
  baseRateReading: GOOD_LINE,
  reasons: [
    "Your employment and the conference invitation are the strongest parts of this application.",
    "Your savings are thin relative to the length of the trip, which is the weakest part.",
  ],
  checklist: [
    "Employer letter confirming your role and approved leave",
    "Conference invitation naming you",
    "Bank statements covering the recent months",
  ],
};

class FakeModel implements ModelClient {
  readonly calls: Array<{ system: string; user: string }> = [];
  constructor(private readonly outputs: ModelOutput[]) {}
  async assess(system: string, user: string): Promise<ModelOutput> {
    this.calls.push({ system, user });
    const next = this.outputs.shift();
    if (!next) throw new Error("FakeModel ran out of scripted outputs.");
    return next;
  }
}

describe("the misattribution hole is closed", () => {
  const target = profile();
  const retrieved = retrieve(target);
  const context = renderContext(target, retrieved);
  const allowed = allowedFigures(context);

  // The Schengen not issued rate for Nigeria, genuinely in this context.
  const REAL_FIGURE = String(retrieved.applicationLocationRate!.ratePercent);
  const MISLABELLED = `The UK refusal rate for your passport is ${REAL_FIGURE} percent.`;

  it("confirms the old allowlist really did permit this sentence", () => {
    // Documents the defect rather than asserting the fix. The number is real
    // and present, so a presence check has nothing to object to.
    expect(checkFigures(MISLABELLED, allowed)).toEqual([]);
  });

  it("rejects it now, because the model wrote a digit", () => {
    const violations = checkNoDigits(MISLABELLED);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.rule).toBe("digit_in_prose");
  });

  it("rejects it end to end through assess", async () => {
    const bad: ModelOutput = { ...BASE_OUTPUT, baseRateReading: MISLABELLED };
    const model = new FakeModel([bad, bad]);
    await expect(assess(target, model)).rejects.toThrow(ModelOutputRejectedError);
  });

  it("rejects a real figure copied into a reason as well", async () => {
    const bad: ModelOutput = {
      ...BASE_OUTPUT,
      reasons: [
        `Your passport carries a refusal rate of ${REAL_FIGURE} percent.`,
        "Your employment is the strongest part of this application.",
      ],
    };
    const model = new FakeModel([bad, bad]);
    await expect(assess(target, model)).rejects.toThrow(ModelOutputRejectedError);
  });
});

describe("the base rate line must carry both tokens", () => {
  const target = profile();
  const table = buildPlaceholders(target, retrieve(target));

  it("accepts a line with the required tokens", () => {
    expect(checkPlaceholders(GOOD_LINE, table)).toEqual([]);
  });

  it("rejects a line with no rate token", () => {
    const violations = checkPlaceholders(
      "Among {{subject}}, published figures put this group above average.",
      table,
    );
    expect(violations.some((v) => v.rule === "placeholder_missing")).toBe(true);
  });

  it("rejects a line that describes the subject itself instead of using the token", () => {
    // This is the shape the hole took: the model naming the group in its own
    // words, next to a figure the service supplied.
    const violations = checkPlaceholders(
      "The refusal rate for UK visitor visas held by people with your passport is {{rate}}.",
      table,
    );
    expect(violations.some((v) => v.rule === "placeholder_missing")).toBe(true);
    expect(violations[0]!.detail).toContain("{{subject}}");
  });

  it("rejects an invented token", () => {
    const violations = checkPlaceholders(
      "Among {{subject}}, the rate is {{rate}} and the trend is {{trend}}.",
      table,
    );
    expect(violations.some((v) => v.rule === "placeholder_unknown")).toBe(true);
  });

  it("rejects a token this source cannot fill", () => {
    // The US publishes an adjusted rate with no counts behind it.
    const us = profile({ destination: "United States", schengenState: undefined });
    const usTable = buildPlaceholders(us, retrieve(us));
    expect(usTable["numerator"]).toBeNull();

    const violations = checkPlaceholders(
      "Among {{subject}}, {{numerator}} of {{denominator}} were refused, a rate of {{rate}}.",
      usTable,
    );
    expect(violations.filter((v) => v.rule === "placeholder_unavailable")).toHaveLength(2);
  });

  it("fills the counts where the source does publish them", () => {
    const uk = profile({ destination: "United Kingdom", schengenState: undefined });
    const ukTable = buildPlaceholders(uk, retrieve(uk));
    expect(ukTable["numerator"]).not.toBeNull();
    expect(checkPlaceholders(
      "Among {{subject}}, {{numerator}} of {{denominator}} decisions were refused, a rate of {{rate}}.",
      ukTable,
    )).toEqual([]);
  });

  it("rejects a token smuggled into a reason, where nothing substitutes it", async () => {
    const target2 = profile();
    const bad: ModelOutput = {
      ...BASE_OUTPUT,
      reasons: [
        "Your profile sits against a base rate of {{rate}} for this group.",
        "Your employment is the strongest part of this application.",
      ],
    };
    const model = new FakeModel([bad, bad]);
    await expect(assess(target2, model)).rejects.toThrow(ModelOutputRejectedError);
  });
});

describe("substitution", () => {
  it("fills the figure and the subject from the retrieved record", async () => {
    const target = profile({ destination: "United Kingdom", schengenState: undefined });
    const retrieved = retrieve(target);
    const model = new FakeModel([BASE_OUTPUT]);
    const result = await assess(target, model);

    const rate = retrieved.nationalityRate!;
    expect(result.baseRateReading).toContain(String(rate.ratePercent));
    expect(result.baseRateReading).toContain(rate.subject);
    expect(result.baseRateReading).toContain(String(rate.sourceYear));
    expect(result.baseRateReading).not.toContain("{{");
  });

  it("binds the subject to the axis actually retrieved, for Schengen", async () => {
    const target = profile({ residenceCity: "LAGOS" });
    const model = new FakeModel([BASE_OUTPUT]);
    const result = await assess(target, model);

    // The subject names a place and says the passport is irrelevant to it, so
    // the sentence cannot read as a rate for this applicant's nationality.
    expect(result.baseRateReading).toContain("whatever passport");
    expect(result.baseRateReading).not.toMatch(/Nigeria passport holders/);
  });

  it("never emits a figure that is not in the retrieved context", async () => {
    const target = profile();
    const allowed = allowedFigures(renderContext(target, retrieve(target)));
    const model = new FakeModel([BASE_OUTPUT]);
    const result = await assess(target, model);
    expect(checkFigures(result.baseRateReading, allowed)).toEqual([]);
  });

  it("refuses to substitute an unresolved token if one ever reaches it", () => {
    expect(() => substitute("a {{missing}} token", { rate: "x", subject: "y" })).toThrow(
      /Refusing to substitute/,
    );
  });
});
