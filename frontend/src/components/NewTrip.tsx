"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { parseUnits, toHex, type Hex } from "viem";
import { useAccount, useChainId, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { ConnectBar } from "@/components/ConnectBar";
import { explorerTx, xLayerTestnet } from "@/lib/chain";
import { MOCK_USDC, TRAVEL_ESCROW, TRAVEL_ESCROW_ABI } from "@/lib/contracts";

/**
 * Opens an escrow, so there is something for the trip screen to show and for a
 * sponsor link to point at.
 *
 * The travelBy field is the one people misread, so this screen never calls it
 * a travel date. It asks for the return date and adds a week, which is the
 * default the contract's own documentation asks the frontend to prefill,
 * because hotels commonly settle at checkout rather than at booking and the
 * escrow has to still be able to pay when they do.
 */

const CARD = "border border-[var(--color-ink-line)] bg-[var(--color-ink-raised)] p-5 sm:p-6";
const BTN =
  "border border-[#41557c] bg-[#1b2740] px-4 py-2.5 text-sm font-semibold text-[#e8ecf4] transition-colors hover:bg-[#22304d] disabled:cursor-not-allowed disabled:opacity-40";
const FIELD =
  "figure mt-1.5 w-full max-w-xs border border-[var(--color-ink-line)] bg-[#101a2e] px-3 py-2.5 text-sm text-[#e8ecf4]";
const LABEL = "block text-sm text-[#b8c4d8]";

const SETTLEMENT_BUFFER_DAYS = 7;

function randomTripId(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

function defaultReturnDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

export function NewTrip() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const onRightChain = chainId === xLayerTestnet.id;

  const [target, setTarget] = useState("1500");
  const [returnDate, setReturnDate] = useState(defaultReturnDate);
  const [tripId, setTripId] = useState<Hex | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<Hex | undefined>();
  const receipt = useWaitForTransactionReceipt({ hash });

  const settlement = new Date(returnDate);
  settlement.setDate(settlement.getDate() + SETTLEMENT_BUFFER_DAYS);
  const settlementSeconds = Math.floor(settlement.getTime() / 1000);
  const valid =
    Number.isFinite(settlementSeconds) && settlementSeconds > Math.floor(Date.now() / 1000);

  if (receipt.isSuccess && tripId) {
    router.push(`/trip/${tripId}`);
  }

  async function create() {
    setError(null);
    const id = randomTripId();
    setTripId(id);
    try {
      const txHash = await writeContractAsync({
        address: TRAVEL_ESCROW,
        abi: TRAVEL_ESCROW_ABI,
        functionName: "createTrip",
        // The token is the mock on testnet. On mainnet this is a real
        // stablecoin address, and the escrow treats either as raw units.
        args: [id, MOCK_USDC, parseUnits(target || "0", 6), BigInt(settlementSeconds)],
      });
      setHash(txHash);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(
        /rejected|denied/i.test(message)
          ? "You rejected the transaction in your wallet. Nothing was sent."
          : message.split("\n")[0]!,
      );
      setTripId(null);
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1
          className="text-xl font-semibold text-[#e8ecf4]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Open a trip escrow
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-[#b8c4d8]">
          Holds stablecoin for one trip until a visa outcome is known. You can
          share a link afterwards so anyone can top it up.
        </p>
      </header>

      <ConnectBar />

      <section className={CARD}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="target">
              Target in USDC
            </label>
            <input
              id="target"
              className={FIELD}
              inputMode="decimal"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            />
            <p className="mt-1.5 text-xs leading-relaxed text-[#7f8ea9]">
              A goal, not a cap. The contract does not enforce it, so a trip can
              end up under or over funded.
            </p>
          </div>

          <div>
            <label className={LABEL} htmlFor="returnDate">
              Date you expect to return
            </label>
            <input
              id="returnDate"
              type="date"
              className={FIELD}
              value={returnDate}
              onChange={(event) => setReturnDate(event.target.value)}
            />
            <p className="mt-1.5 text-xs leading-relaxed text-[#7f8ea9]">
              The escrow settles a week after this, on{" "}
              <span className="figure">{settlement.toISOString().slice(0, 10)}</span>.
              That buffer is deliberate: hotels often charge at checkout, and the
              escrow has to still be able to pay when they do.
            </p>
          </div>
        </div>

        <button
          type="button"
          className={`${BTN} mt-5`}
          disabled={!isConnected || !onRightChain || !valid || isPending || receipt.isLoading}
          onClick={create}
        >
          {receipt.isLoading ? "Waiting for the chain" : "Create trip"}
        </button>

        {!isConnected ? (
          <p className="mt-3 text-xs text-[#7f8ea9]">Connect a wallet to create a trip.</p>
        ) : !onRightChain ? (
          <p className="mt-3 text-xs text-[#7f8ea9]">
            Switch to {xLayerTestnet.name} first.
          </p>
        ) : null}

        {error ? <p className="mt-3 text-xs text-[#d8a0a0]">{error}</p> : null}

        {hash ? (
          <a
            className="figure mt-3 inline-block break-all text-xs text-[#9db4d8] underline underline-offset-2"
            href={explorerTx(hash)}
            target="_blank"
            rel="noreferrer noopener"
          >
            Transaction on the explorer
          </a>
        ) : null}
      </section>
    </div>
  );
}
