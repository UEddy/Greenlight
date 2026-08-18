import { describe, expect, it } from "vitest";
import {
  allowedFigures,
  checkAdvice,
  checkFigures,
  numericReadings,
  type AdviceGuardContext,
} from "../src/guard";
import { COVERED_SCHENGEN_STATES } from "../src/dataset";

const CONTEXT = `
Subject: Nigeria passport holders applying for a UK Visitor visa
Rate percent: 46.06
Numerator: 29354
Denominator: 63725
Source year: 2025
Per day amount: 121.1 EUR
Floor for the whole trip: 1098.90 EUR
Legal basis: Immigration Rules Appendix V: Visitor, paragraphs V 4.2(e) and V 4.3.
`;

const allowed = allowedFigures(CONTEXT);

const adviceContext: AdviceGuardContext = {
  declaredDestination: "Schengen area",
  declaredSchengenState: "Germany",
  otherJurisdictions: [
    ...COVERED_SCHENGEN_STATES,
    "United Kingdom",
    "United States",
    "Schengen area",
  ],
};

describe("figure guard", () => {
  it("allows a figure that appears in the retrieved context", () => {
    expect(checkFigures("The published rate is 46.06 percent.", allowed)).toEqual([]);
  });

  it("allows a differently formatted reading of a context figure", () => {
    // The context holds 1098.90; a model writing 1,098.90 is echoing, not inventing.
    expect(checkFigures("The floor is 1,098.90 euros.", allowed)).toEqual([]);
  });

  it("allows a rule citation whose digits come from the context", () => {
    expect(checkFigures("See V 4.2(e) on sufficient funds.", allowed)).toEqual([]);
  });

  it("rejects an invented financial threshold", () => {
    const violations = checkFigures(
      "You should show at least 5000 EUR in your account.",
      allowed,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]!.rule).toBe("figure_not_in_context");
    expect(violations[0]!.detail).toContain("5000");
  });

  it("rejects an invented refusal rate even when it looks plausible", () => {
    const violations = checkFigures("Around 38 percent of applicants are refused.", allowed);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.rule).toBe("figure_not_in_context");
  });

  it("rejects an invented year", () => {
    expect(checkFigures("The 2019 figures were lower.", allowed)).toHaveLength(1);
  });

  it("rejects an invented processing time", () => {
    expect(checkFigures("Decisions usually take 15 working days.", allowed)).toHaveLength(1);
  });

  it("reads separators in every plausible way", () => {
    const readings = numericReadings("1,098.90");
    expect(readings.has("1098.9")).toBe(true);
    expect(readings.has("109890")).toBe(true);
  });
});

describe("forum shopping guard", () => {
  it("passes ordinary assessment prose", () => {
    const clean =
      "Your employment and property in Lagos are the strongest part of this profile. " +
      "Bring the letter from your employer and the conference invitation. " +
      "Apply to Germany, which is your main destination.";
    expect(checkAdvice(clean, adviceContext)).toEqual([]);
  });

  it("rejects a direct suggestion to apply through another Schengen state", () => {
    const violations = checkAdvice(
      "You could apply through Portugal instead, since their consulate is less busy.",
      adviceContext,
    );
    expect(violations.some((v) => v.rule === "forum_shopping")).toBe(true);
  });

  it("rejects a suggestion framed as a lower refusal rate", () => {
    const violations = checkAdvice(
      "Some consulates have a lower refusal rate, so it is worth considering.",
      adviceContext,
    );
    expect(violations.some((v) => v.rule === "forum_shopping")).toBe(true);
  });

  it("rejects a suggestion framed as a cheaper financial requirement", () => {
    const violations = checkAdvice(
      "Latvia has a lower financial requirement than Spain for the same trip.",
      adviceContext,
    );
    expect(violations.some((v) => v.rule === "forum_shopping")).toBe(true);
  });

  it("rejects the soft version that only hints", () => {
    const violations = checkAdvice(
      "You may have better luck applying at a different consulate.",
      adviceContext,
    );
    expect(violations.some((v) => v.rule === "forum_shopping")).toBe(true);
  });

  it("rejects a suggestion to file in another city", () => {
    const violations = checkAdvice(
      "Consider applying in Austria, where the process moves faster.",
      adviceContext,
    );
    expect(violations.some((v) => v.rule === "forum_shopping")).toBe(true);
  });

  it("allows naming another state as a plain fact, with no routing verb", () => {
    const factual =
      "Spain publishes the highest daily amount in the Schengen area and Latvia the lowest.";
    expect(checkAdvice(factual, adviceContext)).toEqual([]);
  });
});

describe("misrepresentation guard", () => {
  it("rejects advice to season a bank statement", () => {
    const violations = checkAdvice(
      "Top up your bank account a month before you apply so the balance looks healthy.",
      adviceContext,
    );
    expect(violations.some((v) => v.rule === "misrepresentation")).toBe(true);
  });

  it("rejects advice to borrow money to show funds", () => {
    const violations = checkAdvice(
      "You can borrow the difference from a relative to show the required funds.",
      adviceContext,
    );
    expect(violations.some((v) => v.rule === "misrepresentation")).toBe(true);
  });

  it("rejects advice to overstate employment", () => {
    const violations = checkAdvice(
      "It helps to overstate your employment a little on the form.",
      adviceContext,
    );
    expect(violations.some((v) => v.rule === "misrepresentation")).toBe(true);
  });

  it("allows honest advice about strengthening a real position", () => {
    const honest =
      "Your savings are thin for this trip length. Building them over the next few months, " +
      "and showing the salary that produced them, is what genuinely strengthens this.";
    expect(checkAdvice(honest, adviceContext)).toEqual([]);
  });
});
