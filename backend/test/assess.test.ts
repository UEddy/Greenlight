import { describe, expect, it } from "vitest";
import { assess, ModelOutputRejectedError } from "../src/assess.js";
import type { ModelClient } from "../src/model.js";
import { SYSTEM_PROMPT } from "../src/prompt.js";
import { ProfileSchema, type ModelOutput, type Profile } from "../src/types.js";

function profile(overrides: Partial<Profile> = {}): Profile {
  return ProfileSchema.parse({
    passportCountry: "Nigeria",
    passportStatus: "valid",
    residenceCountry: "Nigeria",
    residenceCity: "LAGOS",
    destination: "United Kingdom",
    purpose: "conference",
    tripLengthDays: 6,
    ...overrides,
  });
}

const CLEAN_OUTPUT: ModelOutput = {
  verdict: "MARGINAL",
  confidence: "medium",
  baseRateReading:
    "The figure shown is a base rate for everyone holding this passport, not your personal odds, and this verdict reads your profile against it.",
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

/** A model that returns whatever it was handed, recording what it was asked. */
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

describe("the response schema", () => {
  it("returns the spec fields plus the base rate caveat", async () => {
    const model = new FakeModel([CLEAN_OUTPUT]);
    const result = await assess(profile(), model);

    expect(result.verdict).toBe("MARGINAL");
    expect(result.confidence).toBe("medium");
    expect(result.refusalRate).toBeDefined();
    expect(result.sourceYear).toBe(2025);
    expect(result.sourceUrl).toContain("http");
    expect(result.financialRequirement).toBeDefined();
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.checklist.length).toBeGreaterThan(0);
    expect(result.baseRateCaveat).toContain("not a personal probability");
  });

  it("keeps the two axes in separate fields", async () => {
    const model = new FakeModel([CLEAN_OUTPUT]);
    const result = await assess(profile(), model);
    expect(result.refusalRate.nationality).not.toBeNull();
    expect(result.refusalRate.applicationLocation).toBeNull();
    expect(result.refusalRate.axisNote).toContain("never comparable");
  });

  it("takes numbers from the records, not from the model", async () => {
    const model = new FakeModel([CLEAN_OUTPUT]);
    const result = await assess(profile(), model);
    // The UK Nigeria figure comes from the dataset, whatever the model said.
    expect(result.refusalRate.nationality!.numerator).toBeGreaterThan(0);
    expect(result.refusalRate.nationality!.denominator).toBeGreaterThan(0);
    expect(result.refusalRate.nationality!.ratePercent).toBeGreaterThan(0);
  });
});

describe("the system prompt carries the prohibitions", () => {
  it("forbids suggesting another state, consulate or city", () => {
    expect(SYSTEM_PROMPT).toContain("NEVER SUGGEST APPLYING SOMEWHERE ELSE");
    expect(SYSTEM_PROMPT).toMatch(/different Schengen state/i);
    expect(SYSTEM_PROMPT).toMatch(/different consulate/i);
    expect(SYSTEM_PROMPT).toMatch(/different city/i);
    expect(SYSTEM_PROMPT).toMatch(/misrepresentation/i);
  });

  it("forbids producing a number", () => {
    expect(SYSTEM_PROMPT).toContain("YOU NEVER PRODUCE A NUMBER");
  });

  it("forbids merging the axes", () => {
    expect(SYSTEM_PROMPT).toContain("NEVER MERGE THEM");
  });

  it("is handed to the model on every call", async () => {
    const model = new FakeModel([CLEAN_OUTPUT]);
    await assess(profile(), model);
    expect(model.calls[0]!.system).toBe(SYSTEM_PROMPT);
  });
});

describe("the guards reject bad model output", () => {
  it("rejects a verdict whose reasons contain an invented figure", async () => {
    const invented: ModelOutput = {
      ...CLEAN_OUTPUT,
      reasons: [
        "You will need to show at least 5000 GBP to satisfy the caseworker.",
        "Your employment is the strongest part of this application.",
      ],
    };
    const model = new FakeModel([invented, invented]);
    await expect(assess(profile(), model)).rejects.toThrow(ModelOutputRejectedError);
  });

  it("rejects output that suggests applying through another Schengen state", async () => {
    const forumShopping: ModelOutput = {
      ...CLEAN_OUTPUT,
      reasons: [
        "Your ties to home are reasonable for this trip length.",
        "You could apply through Portugal instead, where the refusal rate is lower.",
      ],
    };
    const model = new FakeModel([forumShopping, forumShopping]);
    const target = profile({ destination: "Schengen area", schengenState: "Germany" });
    await expect(assess(target, model)).rejects.toThrow(ModelOutputRejectedError);

    try {
      const retryModel = new FakeModel([forumShopping, forumShopping]);
      await assess(target, retryModel);
    } catch (error) {
      const rejection = error as ModelOutputRejectedError;
      expect(rejection.violations.some((v) => v.rule === "forum_shopping")).toBe(true);
    }
  });

  it("rejects output that nudges towards misrepresentation", async () => {
    const dishonest: ModelOutput = {
      ...CLEAN_OUTPUT,
      checklist: [
        "Employer letter confirming your role",
        "Top up your bank account before applying so the balance looks stronger",
        "Conference invitation naming you",
      ],
    };
    const model = new FakeModel([dishonest, dishonest]);
    await expect(assess(profile(), model)).rejects.toThrow(ModelOutputRejectedError);
  });

  it("re-asks once, and accepts a corrected second answer", async () => {
    const bad: ModelOutput = {
      ...CLEAN_OUTPUT,
      reasons: [
        "You need about 5000 GBP saved.",
        "Your employment is the strongest part of this application.",
      ],
    };
    const model = new FakeModel([bad, CLEAN_OUTPUT]);
    const result = await assess(profile(), model);
    expect(result.verdict).toBe("MARGINAL");
    expect(model.calls).toHaveLength(2);
    expect(model.calls[1]!.user).toContain("rejected by the output guards");
  });

  it("keeps the retrieved records on the rejection, so facts survive a bad answer", async () => {
    const bad: ModelOutput = {
      ...CLEAN_OUTPUT,
      reasons: [
        "You need about 5000 GBP saved.",
        "Your employment is the strongest part of this application.",
      ],
    };
    const model = new FakeModel([bad, bad]);
    try {
      await assess(profile(), model);
      expect.unreachable("should have thrown");
    } catch (error) {
      const rejection = error as ModelOutputRejectedError;
      expect(rejection.retrieved.nationalityRate).not.toBeNull();
      expect(rejection.retrieved.financial.published).toBe(false);
    }
  });
});

describe("the context the model is shown", () => {
  it("tells the model plainly that the UK publishes no amount", async () => {
    const model = new FakeModel([CLEAN_OUTPUT]);
    await assess(profile({ destination: "United Kingdom" }), model);
    const sent = model.calls[0]!.user;
    expect(sent).toContain("Published amount: NONE");
    expect(sent).toContain("no threshold to clear");
  });

  it("shows Romania's invitation variant to the model when it applies", async () => {
    const model = new FakeModel([CLEAN_OUTPUT]);
    await assess(
      profile({
        passportCountry: "Nigeria",
        destination: "Schengen area",
        schengenState: "Romania",
      }),
      model,
    );
    expect(model.calls[0]!.user).toContain("invitation procedure");
  });

  it("shows Italy's applicable grid row and no collapsed total", async () => {
    const model = new FakeModel([CLEAN_OUTPUT]);
    await assess(
      profile({
        destination: "Schengen area",
        schengenState: "Italy",
        tripLengthDays: 4,
      }),
      model,
    );
    const sent = model.calls[0]!.user;
    expect(sent).toContain("1 to 5 days, one participant");
    expect(sent).toContain("tiered or gridded");
  });

  it("tells the model there is no nationality figure for Schengen", async () => {
    const model = new FakeModel([CLEAN_OUTPUT]);
    await assess(
      profile({ destination: "Schengen area", schengenState: "Germany" }),
      model,
    );
    expect(model.calls[0]!.user).toContain("None retrieved. Do not supply one.");
  });
});
