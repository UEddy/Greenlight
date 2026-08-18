"use client";

import { Guilloche } from "@/components/Guilloche";
import { MachineReadableZone } from "@/components/MachineReadableZone";
import { RateSections } from "@/components/RateSections";
import type { MrzInput } from "@/lib/mrz";
import type {
  AssessResponse,
  FinancialRequirement,
  RateFigure,
  RejectedJudgement,
  Verdict,
} from "@/lib/types";

/**
 * The verdict card. A visa vignette: guilloche behind, the profile set in
 * mono, and a machine readable zone along the bottom edge.
 *
 * The three verdict colours appear here and nowhere else in the interface.
 * That scarcity is the whole design argument, so this file is the only place
 * that names them.
 */

const VERDICT_STYLE: Record<Verdict, { colour: string; text: string; note: string }> = {
  GO: {
    colour: "var(--color-clearance)",
    text: "GO",
    note: "This profile reads as strong against the base rate.",
  },
  MARGINAL: {
    colour: "var(--color-caution)",
    text: "MARGINAL",
    note: "This could go either way. The fee is a real risk.",
  },
  ABORT: {
    colour: "var(--color-stamp)",
    text: "ABORT",
    note: "The honest advice is not to apply yet.",
  },
};

function Stamp({ verdict }: { verdict: Verdict }) {
  const style = VERDICT_STYLE[verdict];
  return (
    <div
      className="stamp-lands pointer-events-none select-none"
      style={{ color: style.colour }}
    >
      <div
        className="border-[3px] px-4 py-1.5 sm:px-5 sm:py-2"
        style={{ borderColor: style.colour }}
      >
        <span
          className="text-2xl font-extrabold tracking-[0.16em] sm:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {style.text}
        </span>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-vellum-muted)]">
        {label}
      </dt>
      <dd className="figure mt-0.5 text-sm text-[#241f18]">{value}</dd>
    </div>
  );
}

function FinancialPanel({ financial }: { financial: FinancialRequirement }) {
  return (
    <section className="border border-[var(--color-vellum-line)] bg-[#efece2] p-4 sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-vellum-muted)]">
        Money you must show
      </p>

      {financial.published ? (
        <>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3">
            {financial.perDayAmount !== null ? (
              <span className="figure text-3xl font-semibold text-[#241f18]">
                {financial.perDayAmount} {financial.currency}
                <span className="ml-1 text-sm font-normal text-[var(--color-vellum-muted)]">
                  per day
                </span>
              </span>
            ) : (
              <span className="text-sm leading-snug text-[#3b342a]">
                This state publishes a grid rather than a daily rate, so no
                single number is shown. The rows that apply to this trip are
                below.
              </span>
            )}
          </div>

          {financial.estimatedTripTotal ? (
            <p className="mt-3 text-sm text-[#3b342a]">
              <span className="figure font-semibold">
                {financial.estimatedTripTotal.amount}{" "}
                {financial.estimatedTripTotal.currency}
              </span>{" "}
              for this trip. {financial.estimatedTripTotal.explanation}
            </p>
          ) : null}

          {financial.applicableVariants.length > 0 ? (
            <ul className="mt-4 space-y-2 border-t border-[var(--color-vellum-line)] pt-3">
              {financial.applicableVariants.map((variant) => (
                <li key={variant.condition} className="text-sm text-[#3b342a]">
                  <span className="font-semibold">{variant.condition}: </span>
                  <span className="figure">
                    {variant.amount !== null
                      ? `${variant.amount} ${variant.currency}`
                      : "no amount required in this case"}
                  </span>
                  {variant.note ? (
                    <span className="mt-0.5 block text-xs text-[var(--color-vellum-muted)]">
                      {variant.note}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-[#3b342a]">
          {financial.qualitativeStatement}
        </p>
      )}

      <p className="mt-4 border-t border-[var(--color-vellum-line)] pt-3 text-xs leading-relaxed text-[var(--color-vellum-muted)]">
        {financial.thresholdCaveat}
      </p>
      <a
        className="figure mt-2 inline-block text-xs text-[#3b342a] underline underline-offset-2"
        href={financial.sourceUrl}
        target="_blank"
        rel="noreferrer noopener"
      >
        Source, {financial.sourceYear}
      </a>
    </section>
  );
}

function CardShell({
  seed,
  children,
  mrz,
}: {
  seed: number;
  children: React.ReactNode;
  mrz: MrzInput | null;
}) {
  return (
    <article className="relative overflow-hidden border border-[var(--color-ink-line)] bg-[var(--color-vellum)] text-[#241f18]">
      <div className="pointer-events-none absolute inset-0 opacity-[0.16]">
        <Guilloche seed={seed} className="h-full w-full" />
      </div>
      <div className="relative">{children}</div>
      {mrz ? <MachineReadableZone input={mrz} /> : null}
    </article>
  );
}

export function VerdictCard({
  result,
  mrz,
  seed = 1,
}: {
  result: AssessResponse;
  mrz: MrzInput;
  seed?: number;
}) {
  const style = VERDICT_STYLE[result.verdict];

  return (
    <CardShell seed={seed} mrz={mrz}>
      <header className="flex items-start justify-between gap-4 border-b border-[var(--color-vellum-line)] px-4 py-4 sm:px-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-vellum-muted)]">
            GreenLight assessment
          </p>
          <p
            className="mt-1 text-lg font-semibold text-[#241f18]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {mrz.passportCountry} passport, {mrz.destination}
          </p>
        </div>
        <Stamp verdict={result.verdict} />
      </header>

      <div className="space-y-5 px-4 py-5 sm:px-6">
        <p className="text-base leading-relaxed text-[#2f2a20]">
          {style.note} Confidence:{" "}
          <span className="figure">{result.confidence}</span>.
        </p>

        <p className="border-l-2 border-[var(--color-vellum-line)] py-1 pl-3 text-sm leading-relaxed text-[#3b342a]">
          {result.baseRateReading}
        </p>

        <RateSections
          nationality={result.refusalRate.nationality}
          applicationLocation={result.refusalRate.applicationLocation}
        />

        <FinancialPanel financial={result.financialRequirement} />

        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-vellum-muted)]">
            Why
          </h2>
          <ul className="mt-2 space-y-2">
            {result.reasons.map((reason) => (
              <li
                key={reason}
                className="border-l-2 border-[var(--color-vellum-line)] pl-3 text-sm leading-relaxed text-[#2f2a20]"
              >
                {reason}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-vellum-muted)]">
            What to prepare
          </h2>
          <ul className="mt-2 space-y-1.5">
            {result.checklist.map((item) => (
              <li key={item} className="flex gap-2 text-sm leading-relaxed text-[#2f2a20]">
                <span aria-hidden="true" className="text-[var(--color-vellum-muted)]">
                  &bull;
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {result.coverageNotes.length > 0 ? (
          <section className="border-t border-[var(--color-vellum-line)] pt-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-vellum-muted)]">
              What this does not cover
            </h2>
            <ul className="mt-2 space-y-1.5">
              {result.coverageNotes.map((note) => (
                <li key={note.field} className="text-xs leading-relaxed text-[#4a4236]">
                  {note.message}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="border-t border-[var(--color-vellum-line)] pt-4 text-xs leading-relaxed text-[var(--color-vellum-muted)]">
          {result.baseRateCaveat}
        </p>
      </div>
    </CardShell>
  );
}

/**
 * The degraded card.
 *
 * When a judgement fails its own guards the backend returns the retrieved
 * records with no verdict. That is not an error condition to apologise for, it
 * is the product working: the facts were retrieved and remain true, and the
 * only thing withheld is the judgement that could not be trusted.
 *
 * So this renders as a card, not an error screen. Same vellum, same guilloche,
 * same sourced figures, same machine readable zone. What is missing is the
 * stamp, and in its place a plain line saying why. None of the three verdict
 * colours appear here, because no verdict was reached and borrowing one would
 * be the interface implying a judgement the service refused to make.
 */
export function WithheldVerdictCard({
  rejection,
  mrz,
  seed = 1,
}: {
  rejection: RejectedJudgement;
  mrz: MrzInput;
  seed?: number;
}) {
  const { nationality, applicationLocation } = rejection.retrieved.refusalRate;
  const anyRate: RateFigure | null = nationality ?? applicationLocation;

  return (
    <CardShell seed={seed} mrz={{ ...mrz, verdict: "WITHHELD" }}>
      <header className="flex items-start justify-between gap-4 border-b border-[var(--color-vellum-line)] px-4 py-4 sm:px-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-vellum-muted)]">
            GreenLight assessment
          </p>
          <p
            className="mt-1 text-lg font-semibold text-[#241f18]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {mrz.passportCountry} passport, {mrz.destination}
          </p>
        </div>
        <div className="border-[3px] border-dashed border-[var(--color-vellum-line)] px-4 py-1.5 sm:px-5 sm:py-2">
          <span
            className="text-lg font-extrabold tracking-[0.16em] text-[var(--color-vellum-muted)] sm:text-xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            NO VERDICT
          </span>
        </div>
      </header>

      <div className="space-y-5 px-4 py-5 sm:px-6">
        <p className="text-base leading-relaxed text-[#2f2a20]">
          The judgement failed its own checks, so it was discarded rather than
          shown to you. The figures below were retrieved from published sources
          and are unaffected.
        </p>

        <details className="border border-[var(--color-vellum-line)] bg-[#efece2] p-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-vellum-muted)]">
            What failed
          </summary>
          <ul className="mt-2 space-y-1.5">
            {rejection.violations.map((violation, index) => (
              <li
                key={`${violation.rule}-${index}`}
                className="text-xs leading-relaxed text-[#4a4236]"
              >
                <span className="figure">{violation.rule}</span>: {violation.detail}
              </li>
            ))}
          </ul>
        </details>

        <RateSections
          nationality={nationality}
          applicationLocation={applicationLocation}
        />

        <FinancialPanel financial={rejection.retrieved.financialRequirement} />

        {anyRate ? (
          <p className="border-t border-[var(--color-vellum-line)] pt-4 text-xs leading-relaxed text-[var(--color-vellum-muted)]">
            These remain population base rates for a group, not this person's
            odds. Without a judgement there is nothing here reading the profile
            against them, so read them as background only.
          </p>
        ) : null}
      </div>
    </CardShell>
  );
}
