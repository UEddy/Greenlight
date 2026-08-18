"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { VerdictCard, WithheldVerdictCard } from "@/components/VerdictCard";
import {
  DESTINATIONS,
  ISO3,
  NATIONALITIES,
  PURPOSES,
  RESIDENCE_COUNTRIES,
  SCHENGEN_STATES,
} from "@/lib/coverage";
import type { MrzInput } from "@/lib/mrz";
import type {
  AssessResponse,
  CoverageMissing,
  Onboarding,
  RejectedJudgement,
} from "@/lib/types";

/**
 * Screen two. The profile form, then the verdict card.
 *
 * Forms are plain and generously spaced. All the boldness is spent on the card
 * this produces, so nothing here competes with it, and none of the three
 * verdict colours appear on this screen.
 */

const API_BASE = process.env["NEXT_PUBLIC_API_BASE"] ?? "http://localhost:8787";

const CARD =
  "border border-[var(--color-ink-line)] bg-[var(--color-ink-raised)] p-5 sm:p-6";
const FIELD =
  "mt-1.5 w-full border border-[var(--color-ink-line)] bg-[#101a2e] px-3 py-2.5 text-sm text-[#e8ecf4]";
const LABEL = "block text-sm text-[#b8c4d8]";
const HINT = "mt-1 text-xs leading-relaxed text-[#7f8ea9]";
const PRIMARY =
  "border border-[#41557c] bg-[#1b2740] px-5 py-3 text-sm font-semibold text-[#e8ecf4] transition-colors hover:bg-[#22304d] disabled:cursor-not-allowed disabled:opacity-40";

type Outcome =
  | { kind: "verdict"; data: AssessResponse }
  | { kind: "withheld"; data: RejectedJudgement }
  | { kind: "coverage"; data: CoverageMissing }
  | { kind: "unreachable"; message: string };

export function AssessForm() {
  const [passportCountry, setPassportCountry] = useState("");
  const [residenceCountry, setResidenceCountry] = useState("");
  const [residenceCity, setResidenceCity] = useState("");
  const [destination, setDestination] = useState<(typeof DESTINATIONS)[number] | "">("");
  const [schengenState, setSchengenState] = useState("");
  const [purpose, setPurpose] = useState("conference");
  const [tripLengthDays, setTripLengthDays] = useState("6");
  const [funds, setFunds] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [travellingWithOthers, setTravellingWithOthers] = useState(false);
  const [hasAccommodationBooked, setHasAccommodationBooked] = useState(false);
  const [hasHostDeclaration, setHasHostDeclaration] = useState(false);
  const [employmentStatus, setEmploymentStatus] = useState("employed");
  const [previousRefusals, setPreviousRefusals] = useState("0");
  const [previousVisits, setPreviousVisits] = useState("0");

  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  // Seeded from the onboarding conversation, which kept only the confirmed
  // country and the passport, on this device.
  useEffect(() => {
    const stored = sessionStorage.getItem("greenlight.onboarding");
    if (!stored) return;
    try {
      const onboarding = JSON.parse(stored) as Onboarding;
      setResidenceCountry(onboarding.residenceCountry);
      setPassportCountry(onboarding.passportCountry);
    } catch {
      // A malformed entry is not worth surfacing. The form simply starts blank.
    }
  }, []);

  const needsSchengenState = destination === "Schengen area";
  const ready =
    passportCountry &&
    residenceCountry &&
    destination &&
    (!needsSchengenState || schengenState) &&
    Number(tripLengthDays) > 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setPending(true);
    setOutcome(null);

    const profile = {
      passportCountry,
      passportStatus: "valid",
      residenceCountry,
      ...(residenceCity ? { residenceCity: residenceCity.toUpperCase() } : {}),
      destination,
      ...(needsSchengenState ? { schengenState } : {}),
      purpose,
      tripLengthDays: Number(tripLengthDays),
      travellingWithOthers,
      hasAccommodationBooked,
      hasHostDeclaration,
      ...(funds
        ? { fundsAvailable: { amount: Number(funds), currency } }
        : {}),
      ties: { employmentStatus },
      travelHistory: {
        previousRefusals: Number(previousRefusals),
        previousVisitsToDestination: Number(previousVisits),
      },
    };

    try {
      const response = await fetch(`${API_BASE}/assess`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile),
      });
      const body = await response.json();

      if (response.ok) setOutcome({ kind: "verdict", data: body as AssessResponse });
      else if (body?.error === "model_output_rejected")
        setOutcome({ kind: "withheld", data: body as RejectedJudgement });
      else if (body?.error === "coverage_missing")
        setOutcome({ kind: "coverage", data: body as CoverageMissing });
      else
        setOutcome({
          kind: "unreachable",
          message: body?.message ?? "The assessment service returned something unexpected.",
        });
    } catch {
      setOutcome({
        kind: "unreachable",
        message: `Could not reach the assessment service at ${API_BASE}. Start the backend with npm run dev, or set NEXT_PUBLIC_API_BASE.`,
      });
    } finally {
      setPending(false);
    }
  }

  const mrz: MrzInput = {
    passportIso3: ISO3[passportCountry] ?? "XXX",
    passportCountry: passportCountry || "Unknown",
    residenceCountry,
    residenceCity: residenceCity || undefined,
    destination: destination || "Unknown",
    schengenState: needsSchengenState ? schengenState : undefined,
    purpose,
    tripLengthDays: Number(tripLengthDays) || 0,
    verdict: outcome?.kind === "verdict" ? outcome.data.verdict : "PENDING",
    sourceYear:
      outcome?.kind === "verdict"
        ? outcome.data.sourceYear
        : outcome?.kind === "withheld"
          ? (outcome.data.retrieved.refusalRate.nationality?.sourceYear ??
            outcome.data.retrieved.refusalRate.applicationLocation?.sourceYear ??
            0)
          : 0,
  };

  return (
    <div className="space-y-6">
      {outcome === null || outcome.kind === "coverage" || outcome.kind === "unreachable" ? (
        <form onSubmit={submit} className="space-y-4">
          <section className={CARD}>
            <h1
              className="text-xl font-semibold text-[#e8ecf4]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              The trip
            </h1>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <label className={LABEL} htmlFor="passportCountry">
                  Passport
                </label>
                <select
                  id="passportCountry"
                  className={FIELD}
                  value={passportCountry}
                  onChange={(e) => setPassportCountry(e.target.value)}
                >
                  <option value="">Pick a passport</option>
                  {NATIONALITIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={LABEL} htmlFor="residenceCountry">
                  Applying from
                </label>
                <select
                  id="residenceCountry"
                  className={FIELD}
                  value={residenceCountry}
                  onChange={(e) => setResidenceCountry(e.target.value)}
                >
                  <option value="">Pick a country</option>
                  {RESIDENCE_COUNTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <p className={HINT}>
                  Different question from your passport, and it moves the odds
                  separately.
                </p>
              </div>

              <div>
                <label className={LABEL} htmlFor="residenceCity">
                  City you would apply in, optional
                </label>
                <input
                  id="residenceCity"
                  className={FIELD}
                  value={residenceCity}
                  onChange={(e) => setResidenceCity(e.target.value)}
                  placeholder="Lagos"
                />
              </div>

              <div>
                <label className={LABEL} htmlFor="destination">
                  Destination
                </label>
                <select
                  id="destination"
                  className={FIELD}
                  value={destination}
                  onChange={(e) =>
                    setDestination(e.target.value as (typeof DESTINATIONS)[number])
                  }
                >
                  <option value="">Pick a destination</option>
                  {DESTINATIONS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {needsSchengenState ? (
                <div>
                  <label className={LABEL} htmlFor="schengenState">
                    Main destination state
                  </label>
                  <select
                    id="schengenState"
                    className={FIELD}
                    value={schengenState}
                    onChange={(e) => setSchengenState(e.target.value)}
                  >
                    <option value="">Pick a state</option>
                    {SCHENGEN_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <p className={HINT}>
                    Where you will spend the most time. Each state sets its own
                    money requirement, and they differ by almost nine to one.
                  </p>
                </div>
              ) : null}

              <div>
                <label className={LABEL} htmlFor="purpose">
                  Purpose
                </label>
                <select
                  id="purpose"
                  className={FIELD}
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                >
                  {PURPOSES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={LABEL} htmlFor="tripLengthDays">
                  Trip length in days
                </label>
                <input
                  id="tripLengthDays"
                  className={`${FIELD} figure`}
                  type="number"
                  min="1"
                  max="365"
                  value={tripLengthDays}
                  onChange={(e) => setTripLengthDays(e.target.value)}
                />
              </div>
            </div>
          </section>

          <section className={CARD}>
            <h2
              className="text-xl font-semibold text-[#e8ecf4]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Money and ties
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[#7f8ea9]">
              Put down what is true. This tool is more useful to you honest than
              flattering, and a refusal for misrepresentation is far worse than
              a refusal.
            </p>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <label className={LABEL} htmlFor="funds">
                  Funds you can show
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    id="funds"
                    className="figure w-full border border-[var(--color-ink-line)] bg-[#101a2e] px-3 py-2.5 text-sm text-[#e8ecf4]"
                    type="number"
                    min="0"
                    value={funds}
                    onChange={(e) => setFunds(e.target.value)}
                    placeholder="2500"
                  />
                  <select
                    aria-label="Currency"
                    className="figure border border-[var(--color-ink-line)] bg-[#101a2e] px-2 py-2.5 text-sm text-[#e8ecf4]"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    {["USD", "EUR", "GBP", "NGN", "INR", "KES", "GHS"].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={LABEL} htmlFor="employmentStatus">
                  Work
                </label>
                <select
                  id="employmentStatus"
                  className={FIELD}
                  value={employmentStatus}
                  onChange={(e) => setEmploymentStatus(e.target.value)}
                >
                  <option value="employed">Employed</option>
                  <option value="self_employed">Self employed</option>
                  <option value="student">Student</option>
                  <option value="unemployed">Not working</option>
                  <option value="other">Something else</option>
                </select>
              </div>

              <div>
                <label className={LABEL} htmlFor="previousVisits">
                  Previous visits to this destination
                </label>
                <input
                  id="previousVisits"
                  className={`${FIELD} figure`}
                  type="number"
                  min="0"
                  value={previousVisits}
                  onChange={(e) => setPreviousVisits(e.target.value)}
                />
              </div>

              <div>
                <label className={LABEL} htmlFor="previousRefusals">
                  Previous visa refusals
                </label>
                <input
                  id="previousRefusals"
                  className={`${FIELD} figure`}
                  type="number"
                  min="0"
                  value={previousRefusals}
                  onChange={(e) => setPreviousRefusals(e.target.value)}
                />
              </div>
            </div>

            <fieldset className="mt-5 space-y-2.5">
              <legend className="text-sm text-[#b8c4d8]">Arrangements</legend>
              {[
                {
                  checked: travellingWithOthers,
                  set: setTravellingWithOthers,
                  label: "Travelling with other people",
                },
                {
                  checked: hasAccommodationBooked,
                  set: setHasAccommodationBooked,
                  label: "Accommodation already booked",
                },
                {
                  checked: hasHostDeclaration,
                  set: setHasHostDeclaration,
                  label: "A host will sign a declaration for me",
                },
              ].map((item) => (
                <label key={item.label} className="flex items-center gap-2.5 text-sm text-[#b8c4d8]">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(e) => item.set(e.target.checked)}
                    className="h-4 w-4 border border-[var(--color-ink-line)] bg-[#101a2e]"
                  />
                  {item.label}
                </label>
              ))}
            </fieldset>
          </section>

          <section className="border-l-2 border-[#41557c] bg-[var(--color-ink-raised)] p-4">
            <p className="text-xs leading-relaxed text-[#b8c4d8]">
              Submitting makes a real model call. The figures come from the
              published datasets in this repo either way, and the model writes
              only the verdict and the wording, with no numbers of its own. If
              you are just looking at how the card renders, the saved responses
              at{" "}
              <Link href="/demo" className="underline underline-offset-2">
                /demo
              </Link>{" "}
              show the same thing without spending a request.
            </p>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={PRIMARY} disabled={!ready || pending}>
              {pending ? "Reading the data" : "Get the verdict"}
            </button>
            <Link href="/" className="text-sm text-[#8fa0bd] underline underline-offset-2">
              Start over
            </Link>
          </div>

          {outcome?.kind === "coverage" ? (
            <section className={`${CARD} border-l-2 border-l-[#41557c]`}>
              <h2 className="text-sm font-semibold text-[#e8ecf4]">
                Coverage is missing for this one
              </h2>
              <ul className="mt-2 space-y-1.5">
                {outcome.data.coverageNotes.map((note) => (
                  <li key={note.field} className="text-sm leading-relaxed text-[#b8c4d8]">
                    {note.message}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-[#7f8ea9]">{outcome.data.note}</p>
            </section>
          ) : null}

          {outcome?.kind === "unreachable" ? (
            <section className={`${CARD} border-l-2 border-l-[#41557c]`}>
              <h2 className="text-sm font-semibold text-[#e8ecf4]">
                No verdict, because the service did not answer
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#b8c4d8]">
                {outcome.message}
              </p>
            </section>
          ) : null}
        </form>
      ) : null}

      {outcome?.kind === "verdict" ? (
        <VerdictCard result={outcome.data} mrz={mrz} seed={tripLengthDays.length + 2} />
      ) : null}

      {outcome?.kind === "withheld" ? (
        <WithheldVerdictCard rejection={outcome.data} mrz={mrz} seed={3} />
      ) : null}

      {outcome?.kind === "verdict" || outcome?.kind === "withheld" ? (
        <button type="button" className={PRIMARY} onClick={() => setOutcome(null)}>
          Change something and run it again
        </button>
      ) : null}
    </div>
  );
}
