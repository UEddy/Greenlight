import { describe, expect, it } from "vitest";
import { CoverageError, retrieve } from "../src/retrieval";
import { ProfileSchema, type Profile } from "../src/types";

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

describe("axis separation", () => {
  it("gives the UK a nationality figure and no application location figure", () => {
    const r = retrieve(profile({ destination: "United Kingdom" }));
    expect(r.nationalityRate?.axis).toBe("nationality");
    expect(r.applicationLocationRate).toBeNull();
  });

  it("gives the US a nationality figure with no counts, as published", () => {
    const r = retrieve(profile({ destination: "United States" }));
    expect(r.nationalityRate?.axis).toBe("nationality");
    expect(r.nationalityRate?.numerator).toBeNull();
    expect(r.nationalityRate?.denominator).toBeNull();
  });

  it("gives Schengen an application location figure and no nationality figure", () => {
    const r = retrieve(
      profile({ destination: "Schengen area", schengenState: "Germany" }),
    );
    expect(r.nationalityRate).toBeNull();
    expect(r.applicationLocationRate?.axis).toBe("application_location");
    expect(
      r.coverageNotes.some((n) => n.field === "refusalRate.nationality"),
    ).toBe(true);
  });

  it("marks every figure as not comparable across axes", () => {
    const uk = retrieve(profile());
    expect(uk.nationalityRate?.comparableWithOtherAxis).toBe(false);
  });
});

describe("financial requirement", () => {
  it("reports the UK as publishing no threshold, with the official position", () => {
    const r = retrieve(profile({ destination: "United Kingdom" }));
    expect(r.financial.published).toBe(false);
    expect(r.financial.basis).toBe("none_published");
    expect(r.financial.perDayAmount).toBeNull();
    expect(r.financial.estimatedTripTotal).toBeNull();
    expect(r.financial.qualitativeStatement).toContain("no set amount");
    expect(r.financial.qualitativeStatement).toContain("case by case");
    expect(r.financial.sourceUrl).toContain("gov.uk");
  });

  it("reports the US as publishing no threshold, with the official position", () => {
    const r = retrieve(profile({ destination: "United States" }));
    expect(r.financial.published).toBe(false);
    expect(r.financial.qualitativeStatement).toContain("no set amount");
    expect(r.financial.sourceUrl).toContain("fam.state.gov");
  });

  it("computes a trip total from a plain daily amount", () => {
    const r = retrieve(
      profile({
        destination: "Schengen area",
        schengenState: "Germany",
        tripLengthDays: 4,
      }),
    );
    // Germany publishes 45 EUR per day and no floor.
    expect(r.financial.perDayAmount).toBe(45);
    expect(r.financial.estimatedTripTotal?.amount).toBe(180);
    expect(r.financial.estimatedTripTotal?.currency).toBe("EUR");
  });

  it("raises a short trip to the published floor rather than under stating it", () => {
    const r = retrieve(
      profile({
        destination: "Schengen area",
        schengenState: "Spain",
        tripLengthDays: 3,
      }),
    );
    // 121.10 for 3 days is below the 1,098.90 floor, so the floor governs.
    expect(r.financial.estimatedTripTotal?.amount).toBe(1098.9);
    expect(r.financial.estimatedTripTotal?.explanation).toContain("floor");
  });

  it("adds the per entry amount where the state charges one", () => {
    const r = retrieve(
      profile({
        destination: "Schengen area",
        schengenState: "Portugal",
        tripLengthDays: 5,
      }),
    );
    // 40 per day for 5 days, plus 75 for the entry.
    expect(r.financial.estimatedTripTotal?.amount).toBe(275);
  });
});

describe("Italy's length grid is surfaced, not collapsed", () => {
  it("computes no single total, because Italy publishes a grid", () => {
    const r = retrieve(
      profile({
        destination: "Schengen area",
        schengenState: "Italy",
        tripLengthDays: 4,
      }),
    );
    expect(r.financial.estimatedTripTotal).toBeNull();
    expect(r.financial.perDayAmount).toBeNull();
    expect(r.financial.basis).toBe("per_trip_tiered_by_duration");
  });

  it("selects the row for a short solo trip", () => {
    const r = retrieve(
      profile({
        destination: "Schengen area",
        schengenState: "Italy",
        tripLengthDays: 4,
        travellingWithOthers: false,
      }),
    );
    const conditions = r.financial.applicableVariants.map((v) => v.condition);
    expect(conditions).toContain("1 to 5 days, one participant");
    expect(conditions).not.toContain("6 to 10 days, one participant");
    expect(conditions).not.toContain("1 to 5 days, two or more participants, each");
  });

  it("selects the group row when travelling with others", () => {
    const r = retrieve(
      profile({
        destination: "Schengen area",
        schengenState: "Italy",
        tripLengthDays: 14,
        travellingWithOthers: true,
      }),
    );
    const conditions = r.financial.applicableVariants.map((v) => v.condition);
    expect(conditions).toContain("11 to 20 days, two or more participants, each");
    expect(conditions).not.toContain("11 to 20 days, one participant");
  });

  it("selects the open ended row for a long trip", () => {
    const r = retrieve(
      profile({
        destination: "Schengen area",
        schengenState: "Italy",
        tripLengthDays: 45,
      }),
    );
    const conditions = r.financial.applicableVariants.map((v) => v.condition);
    expect(conditions).toContain("more than 20 days, one participant");
  });
});

describe("Romania's invitation variant is surfaced where it applies", () => {
  it("surfaces it for a nationality on the order's list", () => {
    const r = retrieve(
      profile({
        passportCountry: "Nigeria",
        destination: "Schengen area",
        schengenState: "Romania",
      }),
    );
    const invitation = r.financial.applicableVariants.find((v) =>
      v.condition.includes("invitation procedure"),
    );
    expect(invitation).toBeDefined();
    expect(invitation!.amount).toBe(30);
    expect(invitation!.whyItApplies).toContain("Nigeria");
  });

  it("surfaces it for each of the covered nationalities the order names", () => {
    for (const nationality of [
      "Bangladesh",
      "Egypt",
      "India",
      "Indonesia",
      "Morocco",
      "Nigeria",
      "Pakistan",
    ]) {
      const r = retrieve(
        profile({
          passportCountry: nationality,
          destination: "Schengen area",
          schengenState: "Romania",
        }),
      );
      expect(
        r.financial.applicableVariants.some((v) =>
          v.condition.includes("invitation procedure"),
        ),
      ).toBe(true);
    }
  });

  it("does not surface it for a nationality the order does not name", () => {
    const r = retrieve(
      profile({
        passportCountry: "Kenya",
        destination: "Schengen area",
        schengenState: "Romania",
      }),
    );
    expect(
      r.financial.applicableVariants.some((v) =>
        v.condition.includes("invitation procedure"),
      ),
    ).toBe(false);
  });
});

describe("Poland's duration tier", () => {
  it("selects the fixed sum for a trip of four days or less", () => {
    const r = retrieve(
      profile({
        destination: "Schengen area",
        schengenState: "Poland",
        tripLengthDays: 3,
      }),
    );
    expect(
      r.financial.applicableVariants.some((v) => v.condition === "stays of 4 days or less"),
    ).toBe(true);
  });

  it("does not select it for a longer trip", () => {
    const r = retrieve(
      profile({
        destination: "Schengen area",
        schengenState: "Poland",
        tripLengthDays: 9,
      }),
    );
    expect(
      r.financial.applicableVariants.some((v) => v.condition === "stays of 4 days or less"),
    ).toBe(false);
  });
});

describe("coverage is reported, never guessed", () => {
  it("refuses to assess an expired passport and explains why", () => {
    expect(() => retrieve(profile({ passportStatus: "expired" }))).toThrow(CoverageError);
    try {
      retrieve(profile({ passportStatus: "expired" }));
    } catch (error) {
      expect((error as CoverageError).notes[0]!.message).toContain("timeline");
    }
  });

  it("refuses a Schengen assessment with no main destination state", () => {
    expect(() =>
      retrieve(profile({ destination: "Schengen area", schengenState: undefined })),
    ).toThrow(CoverageError);
  });

  it("refuses a nationality with no refusal record rather than estimating", () => {
    expect(() => retrieve(profile({ passportCountry: "France" }))).toThrow(CoverageError);
  });

  it("falls back to the country figure when the city is not a consulate city", () => {
    const r = retrieve(
      profile({
        destination: "Schengen area",
        schengenState: "Germany",
        residenceCity: "IBADAN",
      }),
    );
    expect(r.applicationLocationRate?.subject).toContain("all Schengen consulates");
    expect(r.coverageNotes.some((n) => n.field === "residenceCity")).toBe(true);
  });
});
