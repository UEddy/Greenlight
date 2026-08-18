import { buildMrz, type MrzInput } from "@/lib/mrz";

/**
 * The two chevron filled lines along the bottom edge of the card.
 *
 * Rendered as text rather than an image so it stays selectable and legible to
 * a screen reader, with an explicit label saying what it is. Someone using a
 * screen reader should not have 88 characters of chevrons read at them without
 * being told this is a decorative summary, so the zone is labelled and the
 * glyph run itself is hidden from assistive tech.
 */
export function MachineReadableZone({ input }: { input: MrzInput }) {
  const [line1, line2] = buildMrz(input);

  return (
    <div className="border-t border-[var(--color-vellum-line)] bg-[#ded9ca] px-4 py-3 sm:px-6">
      <p className="sr-only">
        Machine readable zone, a summary of this assessment in the style of a
        passport data page. It repeats the nationality, the place of
        application, the destination, the purpose, the trip length and the
        verdict already stated above.
      </p>
      <div
        aria-hidden="true"
        className="figure overflow-x-auto whitespace-pre text-[10px] leading-[1.55] text-[#2f2a20] sm:text-xs"
      >
        <div>{line1}</div>
        <div>{line2}</div>
      </div>
    </div>
  );
}
