"use client";

import { useState } from "react";
import { VerdictCard, WithheldVerdictCard } from "@/components/VerdictCard";
import type { MrzInput } from "@/lib/mrz";
import type { AssessResponse, RejectedJudgement } from "@/lib/types";

interface Card {
  name: string;
  response: AssessResponse;
  mrz: MrzInput;
}

/**
 * Builds the withheld state from a real card.
 *
 * The retrieved half of a rejection is exactly the retrieved half of a
 * successful response, so the degraded card is shown here against genuine
 * records rather than a hand written stub. The violations are the ones the
 * guards actually emit.
 */
function asRejection(card: Card): RejectedJudgement {
  return {
    error: "model_output_rejected",
    message:
      "A verdict was not produced. The model's answer failed the output guards and was discarded rather than shown.",
    violations: [
      {
        rule: "digit_in_prose",
        detail:
          "The figure 5000 was written by the model. Model prose carries no digits: name the field in words, or use a token in the base rate line.",
        excerpt: "You should show at least 5000 in savings",
      },
      {
        rule: "placeholder_missing",
        detail:
          "The base rate line must contain {{subject}}. The figure and the subject it describes are both supplied by the service, so that a real number can never end up attached to the wrong thing.",
        excerpt: "The refusal rate for your passport is {{rate}}",
      },
    ],
    retrieved: {
      refusalRate: {
        nationality: card.response.refusalRate.nationality,
        applicationLocation: card.response.refusalRate.applicationLocation,
      },
      financialRequirement: card.response.financialRequirement,
      coverageNotes: card.response.coverageNotes,
    },
  };
}

export function DemoGallery({ cards, empty }: { cards: Card[]; empty: boolean }) {
  const [index, setIndex] = useState(0);
  const [withheld, setWithheld] = useState(false);
  const current = cards[index];

  if (empty || !current) {
    return (
      <div className="border border-[var(--color-ink-line)] bg-[var(--color-ink-raised)] p-6">
        <h1 className="text-lg font-semibold text-[#e8ecf4]">No fixtures found</h1>
        <p className="mt-2 text-sm leading-relaxed text-[#b8c4d8]">
          This page reads saved responses from backend/test/fixtures. Generate
          them with npx tsx scripts/capture-fixtures.ts in the backend package.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1
          className="text-xl font-semibold text-[#e8ecf4]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Card states, from saved responses
        </h1>
        <p className="mt-1.5 text-xs leading-relaxed text-[#7f8ea9]">
          Reload to watch the stamp land again.
        </p>
      </div>

      {/*
        Said plainly, on the page, because a gallery of perfect cards is
        exactly the kind of thing that quietly reads as live output.
      */}
      <section className="border-l-2 border-[#41557c] bg-[var(--color-ink-raised)] p-4">
        <h2 className="text-sm font-semibold text-[#e8ecf4]">
          These are replays, not live calls
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-[#b8c4d8]">
          Every card here is a real response, captured from the live model and
          saved to disk unedited. This page reads them from a file and makes no
          API call at all, so browsing it costs nothing and cannot be rate
          limited. Nothing on this page was written by hand or tidied up to
          look better: what failed its guards was never saved.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-[#b8c4d8]">
          The live path is the same code. The assess form calls the same
          endpoint, which retrieves the same records, prompts the same model and
          runs the same guards over its answer. To see it happen for real, start
          the backend with a key in backend/.env and submit the form at{" "}
          <a href="/assess" className="underline underline-offset-2">
            /assess
          </a>
          . Fixtures are regenerated with{" "}
          <span className="figure">npx tsx scripts/capture-fixtures.ts</span> in
          the backend package.
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        {cards.map((card, cardIndex) => (
          <button
            key={card.name}
            type="button"
            onClick={() => {
              setIndex(cardIndex);
              setWithheld(false);
            }}
            className={`border px-3 py-1.5 text-xs transition-colors ${
              cardIndex === index && !withheld
                ? "border-[#41557c] bg-[#1b2740] text-[#e8ecf4]"
                : "border-[var(--color-ink-line)] text-[#8fa0bd] hover:border-[#41557c]"
            }`}
          >
            {card.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setWithheld(true)}
          className={`border px-3 py-1.5 text-xs transition-colors ${
            withheld
              ? "border-[#41557c] bg-[#1b2740] text-[#e8ecf4]"
              : "border-[var(--color-ink-line)] text-[#8fa0bd] hover:border-[#41557c]"
          }`}
        >
          judgement withheld
        </button>
      </div>

      {withheld ? (
        <WithheldVerdictCard
          key={`withheld-${current.name}`}
          rejection={asRejection(current)}
          mrz={current.mrz}
          seed={4}
        />
      ) : (
        <VerdictCard
          key={current.name}
          result={current.response}
          mrz={current.mrz}
          seed={index + 1}
        />
      )}
    </div>
  );
}
