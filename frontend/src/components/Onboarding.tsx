"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ISO3,
  NATIONALITIES,
  RESIDENCE_COUNTRIES,
  UNSUPPORTED_NOTE,
} from "@/lib/coverage";

/**
 * The geo confirm, per section 7 of the spec. Three questions, under twenty
 * seconds.
 *
 * The two that matter and are usually collapsed into one: residence and
 * nationality are separate inputs, always. The edge guess seeds only the
 * residence field. A Nigerian passport holder applying from Dubai has a
 * materially different profile from one applying from Lagos, and a form that
 * asks "where are you from" cannot tell those apart.
 *
 * Only the confirmed country is kept, in session storage on this device. No IP
 * is read here and nothing is sent anywhere until the assess form is
 * submitted.
 */

type Step = "residence" | "passport" | "status";

const CARD =
  "border border-[var(--color-ink-line)] bg-[var(--color-ink-raised)] p-5 sm:p-6";
const CHOICE =
  "border border-[var(--color-ink-line)] bg-transparent px-4 py-2.5 text-sm text-[#dfe4ee] transition-colors hover:border-[#41557c] hover:bg-[#1b2740]";
const PRIMARY =
  "border border-[#41557c] bg-[#1b2740] px-4 py-2.5 text-sm font-semibold text-[#e8ecf4] transition-colors hover:bg-[#22304d] disabled:cursor-not-allowed disabled:opacity-40";
const FIELD =
  "w-full border border-[var(--color-ink-line)] bg-[#101a2e] px-3 py-2.5 text-sm text-[#e8ecf4]";

export function Onboarding({ guessedCountry }: { guessedCountry: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("residence");
  const [residence, setResidence] = useState(guessedCountry ?? "");
  const [correcting, setCorrecting] = useState(guessedCountry === null);
  const [passport, setPassport] = useState("");
  const [status, setStatus] = useState<"valid" | "expired" | "none" | null>(null);

  function confirmResidence(country: string) {
    setResidence(country);
    setCorrecting(false);
    setStep("passport");
  }

  function finish(passportStatus: "valid" | "expired" | "none") {
    setStatus(passportStatus);
    sessionStorage.setItem(
      "greenlight.onboarding",
      JSON.stringify({
        residenceCountry: residence,
        residenceConfirmed: true,
        passportCountry: passport,
        passportStatus,
      }),
    );
    if (passportStatus === "valid") router.push("/assess");
  }

  return (
    <div className="space-y-4">
      {/* Step 1. Guess where they are, ask them to confirm. */}
      <section className={CARD}>
        <p className="text-base text-[#e8ecf4]">
          {guessedCountry && !correcting && step === "residence"
            ? `Looks like you are in ${guessedCountry}. Right?`
            : "Where are you applying from?"}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-[#7f8ea9]">
          This is where you would hand in the application, not where your
          passport is from. We read a country code at the edge and never touch
          your IP address.
        </p>

        {step === "residence" ? (
          guessedCountry && !correcting ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className={PRIMARY}
                onClick={() => confirmResidence(guessedCountry)}
              >
                Yes
              </button>
              <button
                type="button"
                className={CHOICE}
                onClick={() => setCorrecting(true)}
              >
                No, somewhere else
              </button>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="residence">
                Country you are applying from
              </label>
              <select
                id="residence"
                className={`${FIELD} max-w-xs`}
                value={residence}
                onChange={(event) => setResidence(event.target.value)}
              >
                <option value="">Pick a country</option>
                {RESIDENCE_COUNTRIES.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={PRIMARY}
                disabled={!residence}
                onClick={() => confirmResidence(residence)}
              >
                That is right
              </button>
            </div>
          )
        ) : (
          <p className="figure mt-3 text-sm text-[#9db4d8]">{residence}</p>
        )}
      </section>

      {/* Step 2. Separate residence from nationality. */}
      {step !== "residence" ? (
        <section className={CARD}>
          <p className="text-base text-[#e8ecf4]">
            And the passport? That is the part that actually decides things.
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-[#7f8ea9]">
            Where you apply from and what passport you hold are different
            inputs, and they both move the odds a lot.
          </p>

          {step === "passport" ? (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="passport">
                  Passport country
                </label>
                <select
                  id="passport"
                  className={`${FIELD} max-w-xs`}
                  value={passport}
                  onChange={(event) => setPassport(event.target.value)}
                >
                  <option value="">Pick a passport</option>
                  {NATIONALITIES.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={PRIMARY}
                  disabled={!passport}
                  onClick={() => setStep("status")}
                >
                  Next
                </button>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[#7f8ea9]">
                {UNSUPPORTED_NOTE}
              </p>
            </>
          ) : (
            <p className="figure mt-3 text-sm text-[#9db4d8]">
              {passport} {ISO3[passport] ? `(${ISO3[passport]})` : ""}
            </p>
          )}
        </section>
      ) : null}

      {/* Step 3. Do they have it in hand. */}
      {step === "status" ? (
        <section className={CARD}>
          <p className="text-base text-[#e8ecf4]">
            Do you have it in hand right now?
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={PRIMARY} onClick={() => finish("valid")}>
              Valid
            </button>
            <button type="button" className={CHOICE} onClick={() => finish("expired")}>
              Expired
            </button>
            <button type="button" className={CHOICE} onClick={() => finish("none")}>
              Not yet
            </button>
          </div>

          {/*
            The branch that changes everything. With no passport in hand the
            honest answer is a timeline, not an odds calculation, so the flow
            stops here rather than producing a verdict on a question that
            cannot be answered yet.
          */}
          {status === "expired" || status === "none" ? (
            <div className="mt-5 border-l-2 border-[#41557c] pl-4">
              <p className="text-sm font-semibold text-[#e8ecf4]">
                Then the odds are not your question yet.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[#b8c4d8]">
                {status === "expired"
                  ? "Renewal comes first. A visa application needs a passport valid well past your travel dates, and most consulates want months of validity left on it, so the renewal queue is the thing setting your timeline right now."
                  : "Issuance comes first. A first passport is usually the longest wait in this whole process, and nothing about a visa can start until it is in your hand."}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[#b8c4d8]">
                We are not going to run an odds calculation on a passport that
                does not exist yet and hand you a number that feels like
                progress. Come back when it is in your hand and we will give you
                a real read.
              </p>
              <p className="mt-3 text-xs text-[#7f8ea9]">
                Passport issuing times are set by your own government, and this
                app holds no data on them, so it is not going to invent one.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
