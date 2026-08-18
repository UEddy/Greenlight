import type { RateFigure } from "@/lib/types";

/**
 * The two refusal axes, rendered so they cannot be read as one number.
 *
 * This is a correctness requirement wearing a visual costume. A nationality
 * refusal rate and a Schengen application location rate answer different
 * questions, and the failure mode is not a wrong pixel, it is a user coming
 * away believing a figure about a place is a figure about their passport.
 *
 * Four things keep them apart, and they are deliberately redundant:
 *   1. Each axis is its own bordered panel with its own heading, stacked, so
 *      they are never side by side in a way that invites subtraction.
 *   2. Each states what it counts and who it is about, in words, above the
 *      figure rather than below it.
 *   3. A divider between them says in plain language that they are different
 *      questions and not comparable.
 *   4. Only one is ever populated for a given destination anyway, and the
 *      empty one explains why it is empty rather than rendering a dash.
 */

function Figure({ rate }: { rate: RateFigure }) {
  const axisLabel =
    rate.axis === "nationality"
      ? "About the passport"
      : "About where the application is made";

  return (
    <section className="border border-[var(--color-vellum-line)] bg-[#efece2] p-4 sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-vellum-muted)]">
        {axisLabel}
      </p>
      <p className="mt-2 text-sm leading-snug text-[#3b342a]">{rate.subject}</p>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="figure text-4xl font-semibold text-[#241f18] sm:text-5xl">
          {rate.ratePercent}%
        </span>
        <span className="figure text-xs text-[var(--color-vellum-muted)]">
          {rate.sourceYear}
        </span>
      </div>

      <p className="mt-2 text-sm leading-snug text-[#4a4236]">{rate.label}.</p>

      {rate.numerator !== null && rate.denominator !== null ? (
        <p className="figure mt-3 text-sm text-[#3b342a]">
          {rate.numerator.toLocaleString("en-US")} out of{" "}
          {rate.denominator.toLocaleString("en-US")}
        </p>
      ) : (
        <p className="mt-3 text-sm text-[var(--color-vellum-muted)]">
          This source publishes the rate only. It reports no counts behind it,
          so none are shown.
        </p>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-vellum-muted)]">
          How this is measured
        </summary>
        <p className="mt-2 text-xs leading-relaxed text-[#4a4236]">
          {rate.methodology}
        </p>
        <a
          className="figure mt-2 inline-block text-xs text-[#3b342a] underline underline-offset-2"
          href={rate.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
        >
          Source
        </a>
      </details>
    </section>
  );
}

function Absent({ axis }: { axis: "nationality" | "application_location" }) {
  return (
    <section className="border border-dashed border-[var(--color-vellum-line)] bg-transparent p-4 sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-vellum-muted)]">
        {axis === "nationality"
          ? "About the passport"
          : "About where the application is made"}
      </p>
      <p className="mt-2 text-sm leading-snug text-[#4a4236]">
        {axis === "nationality"
          ? "No figure exists. The Schengen source has no applicant nationality column at all, so there is nothing to retrieve about this passport. Nothing is estimated in its place."
          : "No figure is shown for this destination. It publishes outcomes by nationality rather than by the place the application is made."}
      </p>
    </section>
  );
}

export function RateSections({
  nationality,
  applicationLocation,
}: {
  nationality: RateFigure | null;
  applicationLocation: RateFigure | null;
}) {
  return (
    <div className="space-y-3">
      {nationality ? <Figure rate={nationality} /> : <Absent axis="nationality" />}

      <p className="border-l-2 border-[var(--color-vellum-line)] py-1 pl-3 text-xs leading-relaxed text-[var(--color-vellum-muted)]">
        These two answer different questions and are not comparable. One is
        about the passport held. The other is about every application made at a
        place, whatever passport the applicant held. Do not read them as one
        number, and do not read either as this person's odds.
      </p>

      {applicationLocation ? (
        <Figure rate={applicationLocation} />
      ) : (
        <Absent axis="application_location" />
      )}
    </div>
  );
}
