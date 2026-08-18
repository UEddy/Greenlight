import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import type { ModelClient } from "../src/model";
import type { ModelOutput } from "../src/types";

const OUTPUT: ModelOutput = {
  verdict: "ABORT",
  confidence: "high",
  baseRateReading:
    "Among {{subject}}, the published figure for {{year}} is {{rate}}, which is a base rate for that whole group and not your personal odds; this verdict reads your profile against it.",
  reasons: [
    "Your savings are well below what this destination publishes for a trip of this length.",
    "You have no prior travel to weigh against the base rate, which leaves little to argue with.",
  ],
  checklist: [
    "Employer letter confirming your role and approved leave",
    "Conference invitation naming you",
    "Bank statements covering the recent months",
  ],
};

class ScriptedModel implements ModelClient {
  constructor(private readonly output: ModelOutput = OUTPUT) {}
  async assess(): Promise<ModelOutput> {
    return this.output;
  }
}

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer(new ScriptedModel()).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(() => {
  server.close();
});

async function post(body: unknown) {
  const res = await fetch(`${base}/assess`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}

const NIGERIA_UK = {
  passportCountry: "Nigeria",
  passportStatus: "valid",
  residenceCountry: "Nigeria",
  residenceCity: "LAGOS",
  destination: "United Kingdom",
  purpose: "conference",
  tripLengthDays: 6,
  fundsAvailable: { amount: 900, currency: "GBP" },
};

describe("POST /assess", () => {
  it("returns a verdict card with sourced numbers", async () => {
    const { status, body } = await post(NIGERIA_UK);
    expect(status).toBe(200);
    expect(body.verdict).toBe("ABORT");
    expect(body.refusalRate.nationality.ratePercent).toBeGreaterThan(0);
    expect(body.refusalRate.nationality.sourceUrl).toContain("http");
    expect(body.sourceYear).toBe(2025);
    expect(body.baseRateCaveat).toContain("not a personal probability");
  });

  it("states the UK financial position qualitatively, with no threshold", async () => {
    const { body } = await post(NIGERIA_UK);
    const financial = body.financialRequirement;
    expect(financial.published).toBe(false);
    expect(financial.perDayAmount).toBeNull();
    expect(financial.estimatedTripTotal).toBeNull();
    expect(financial.qualitativeStatement).toContain("no set amount");
    expect(financial.qualitativeStatement).toContain("case by case");
    expect(financial.sourceUrl).toContain("gov.uk");
  });

  it("keeps the axes apart for a Schengen request", async () => {
    const { status, body } = await post({
      passportCountry: "Ghana",
      passportStatus: "valid",
      residenceCountry: "Ghana",
      residenceCity: "ACCRA",
      destination: "Schengen area",
      schengenState: "Spain",
      purpose: "conference",
      tripLengthDays: 5,
    });
    expect(status).toBe(200);
    expect(body.refusalRate.nationality).toBeNull();
    expect(body.refusalRate.applicationLocation.axis).toBe("application_location");
    expect(body.refusalRate.applicationLocation.subject).toContain("whatever passport");
    expect(body.financialRequirement.state).toBe("Spain");
    expect(body.financialRequirement.perDayAmount).toBe(121.1);
  });

  it("answers a coverage gap with the gap, not a guess", async () => {
    const { status, body } = await post({
      ...NIGERIA_UK,
      passportStatus: "expired",
    });
    expect(status).toBe(422);
    expect(body.error).toBe("coverage_missing");
    expect(body.coverageNotes[0].message).toContain("timeline");
  });

  it("rejects an invalid profile with the failing fields", async () => {
    const { status, body } = await post({ passportCountry: "Nigeria" });
    expect(status).toBe(400);
    expect(body.error).toBe("invalid_profile");
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("withholds the verdict but keeps the facts when the guards reject the model", async () => {
    const badServer = createServer(
      new ScriptedModel({
        ...OUTPUT,
        reasons: [
          "You should show at least 5000 GBP in savings.",
          "Your employment is the strongest part of this application.",
        ],
      }),
    ).listen(0);
    await new Promise((resolve) => badServer.once("listening", resolve));
    const address = badServer.address();
    if (address === null || typeof address === "string") throw new Error("no port");

    const res = await fetch(`http://127.0.0.1:${address.port}/assess`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(NIGERIA_UK),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(502);
    expect(body.error).toBe("model_output_rejected");
    expect(body.violations[0].rule).toBe("digit_in_prose");
    // The retrieved facts are still sourced and still true.
    expect(body.retrieved.refusalRate.nationality.ratePercent).toBeGreaterThan(0);
    expect(body.verdict).toBeUndefined();
    badServer.close();
  });
});

describe("GET /coverage", () => {
  it("lists what is supported and names what is not", async () => {
    const res = await fetch(`${base}/coverage`);
    const body = (await res.json()) as any;
    expect(body.destinations).toHaveLength(3);
    expect(body.nationalities).toContain("Nigeria");
    expect(body.schengenStates).toContain("Germany");
    expect(body.unsupportedNote).toContain("do not publish");
  });
});
