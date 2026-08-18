import Link from "next/link";
import { VerdictCard } from "@/components/VerdictCard";
import { ISO3 } from "@/lib/coverage";
import { abortFixture } from "@/lib/fixtures";
import type { MrzInput } from "@/lib/mrz";

/**
 * The landing page, and for a judge with no video to watch, the whole pitch.
 *
 * Constraints it is built to: no wallet, no API call, no key, nothing to click
 * before the point lands. The verdict card above the fold is a real captured
 * response rather than a mockup, because the honest version of this product is
 * more persuasive than a polished stand in, and because a mockup here would be
 * the one dishonest thing on a site whose entire argument is honesty.
 *
 * No new visual language. Ink ground, vellum for the card only, the three
 * verdict colours still confined to the stamp.
 */

const REPO_URL = "https://github.com/eddyhamezz/greenlight";
const ESCROW_ADDRESS = "0x39311e81cB108C937D2DA307a1a2d494A66eD553";
const ESCROW_EXPLORER = `https://www.okx.com/web3/explorer/xlayer-test/address/${ESCROW_ADDRESS}`;

const SOURCES = [
  {
    name: "UK Home Office",
    detail: "Entry clearance visa outcomes, table Vis_D02",
    measure: "Refused out of decisions made, by nationality",
    year: "2025",
  },
  {
    name: "US Department of State",
    detail: "Adjusted refusal rates for B visitor visas",
    measure: "Per person, end of fiscal year, by nationality",
    year: "FY2025",
  },
  {
    name: "European Commission",
    detail: "Schengen visa statistics for consulates",
    measure: "Not issued out of applications, by where you apply",
    year: "2025",
  },
  {
    name: "Commission and member states",
    detail: "Reference amounts for means of subsistence, Annex 25",
    measure: "Published financial requirement, by destination",
    year: "2026",
  },
];

const PANEL = "border border-[var(--color-ink-line)] bg-[var(--color-ink-raised)] p-5 sm:p-6";
const PRIMARY =
  "border border-[#41557c] bg-[#1b2740] px-5 py-3 text-sm font-semibold text-[#e8ecf4] transition-colors hover:bg-[#22304d]";
const SECONDARY =
  "border border-[var(--color-ink-line)] bg-transparent px-5 py-3 text-sm text-[#dfe4ee] transition-colors hover:border-[#41557c] hover:bg-[#1b2740]";

export default function Page() {
  const fixture = abortFixture();
  const mrz: MrzInput = {
    passportIso3: ISO3[fixture.profile.passportCountry] ?? "XXX",
    passportCountry: fixture.profile.passportCountry,
    residenceCountry: fixture.profile.residenceCountry,
    residenceCity: fixture.profile.residenceCity,
    destination: fixture.profile.destination,
    schengenState: fixture.profile.schengenState,
    purpose: fixture.profile.purpose,
    tripLengthDays: fixture.profile.tripLengthDays,
    verdict: fixture.response.verdict,
    sourceYear: fixture.response.sourceYear,
  };

  return (
    <div className="space-y-10">
      <section className="space-y-5">
        <h1
          className="text-3xl leading-tight font-extrabold text-[#e8ecf4] sm:text-4xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          An honest read on your visa odds, before you pay the fee.
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-[#b8c4d8]">
          For people holding weak passports who are trying to get to an event
          abroad. It tells you go, marginal or abort, grounded only in published
          government refusal data, and it says abort when that is the truth.
        </p>

        <div className="flex flex-wrap gap-3">
          <Link href="/start" className={PRIMARY}>
            Check my odds
          </Link>
          <Link href="/demo" className={SECONDARY}>
            See real verdicts
          </Link>
          <a href={REPO_URL} className={SECONDARY} target="_blank" rel="noreferrer noopener">
            Code on GitHub
          </a>
        </div>

        <p className="text-xs leading-relaxed text-[#7f8ea9]">
          The card below is a real response from this system, saved unedited.
          Nothing on this page makes an API call or needs a wallet.
        </p>
      </section>

      <VerdictCard result={fixture.response} mrz={mrz} seed={2} />

      <section className={PANEL}>
        <h2
          className="text-xl font-semibold text-[#e8ecf4]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Every figure is retrieved, not generated
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#b8c4d8]">
          The model never writes a number. Not one, anywhere. Rates, counts,
          amounts and years are all retrieved in code from the datasets below
          and rendered with their source and year beside them. The model
          receives those records and writes only the verdict and the reasoning.
          If its answer contains a digit, or attaches a real figure to the wrong
          label, the answer is thrown away and the card says so instead of
          showing you a judgement that failed its own checks.
        </p>

        <ul className="mt-5 space-y-3">
          {SOURCES.map((source) => (
            <li
              key={source.name + source.detail}
              className="border-l-2 border-[var(--color-ink-line)] pl-4"
            >
              <p className="text-sm font-semibold text-[#e8ecf4]">
                {source.name}{" "}
                <span className="figure ml-1 text-xs font-normal text-[#7f8ea9]">
                  {source.year}
                </span>
              </p>
              <p className="text-sm text-[#b8c4d8]">{source.detail}</p>
              <p className="text-xs text-[#7f8ea9]">{source.measure}</p>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-xs leading-relaxed text-[#7f8ea9]">
          Twelve passports, three destinations. That is not a scoping choice, it
          is what governments actually publish. Countries that publish nothing
          are shown as unsupported with the reason, never estimated. A refusal
          rate for a nationality and a rate for the place you apply from are
          different questions, so they are never rendered as one number.
        </p>
      </section>

      <section className={PANEL}>
        <h2
          className="text-xl font-semibold text-[#e8ecf4]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          The money runs on X Layer
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#b8c4d8]">
          Weak passport countries are usually weak currency countries. A
          Nigerian card gets declined by a Paris hotel and carries a monthly
          international limit under a hundred dollars. So trip money sits in a
          stablecoin escrow on X Layer instead: the traveler funds it, anyone
          can top it up through a sponsor link, and it pays out for booking only
          after a visa outcome is attested.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#b8c4d8]">
          If the visa is refused, or if nobody ever attests an outcome, every
          contributor claims their own deposit back. An absent verifier cannot
          strand anyone's money. This is the part of the product that could not
          have been built without a chain.
        </p>
        <p className="figure mt-4 text-xs break-all text-[#7f8ea9]">
          TravelEscrow, verified on X Layer testnet:{" "}
          <a
            className="text-[#9db4d8] underline underline-offset-2"
            href={ESCROW_EXPLORER}
            target="_blank"
            rel="noreferrer noopener"
          >
            {ESCROW_ADDRESS}
          </a>
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/trip" className={SECONDARY}>
            Open a trip escrow
          </Link>
        </div>
      </section>

      <section className={PANEL}>
        <h2 className="text-sm font-semibold text-[#e8ecf4]">
          What is real here, and what is not
        </h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[#b8c4d8]">
          <li className="border-l-2 border-[var(--color-ink-line)] pl-3">
            The refusal data and the financial requirements are real, parsed
            from primary government sources at build time.
          </li>
          <li className="border-l-2 border-[var(--color-ink-line)] pl-3">
            The escrow is real, tested, deployed and verified on X Layer
            testnet. The token on testnet is a mock, because X Layer publishes
            no testnet stablecoin address.
          </li>
          <li className="border-l-2 border-[var(--color-ink-line)] pl-3">
            Visa attestation is a trusted signer today, not a real attestation.
            The production path is a consulate issued attestation or a document
            verification provider, and the README says so plainly.
          </li>
        </ul>
      </section>
    </div>
  );
}
