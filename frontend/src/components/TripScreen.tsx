"use client";

import { useCallback, useMemo, useState } from "react";
import { formatUnits, parseUnits, type Hex } from "viem";
import {
  useAccount,
  useChainId,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { ConnectBar, short } from "@/components/ConnectBar";
import { explorerAddress, explorerTx, xLayerTestnet } from "@/lib/chain";
import {
  ERC20_ABI,
  MOCK_USDC,
  STATUS,
  STATUS_COPY,
  TRAVEL_ESCROW,
  TRAVEL_ESCROW_ABI,
  type TripStatus,
} from "@/lib/contracts";

/**
 * Screen four. Escrow status, fund, sponsor link, balance.
 *
 * Two things shape this file.
 *
 * The RPC budget. Public X Layer endpoints allow 100 requests per second per
 * IP. Nothing here watches blocks or subscribes to events. Every read runs on
 * mount, again on a thirty second interval, and again immediately after a
 * transaction confirms, which is when the state actually changed. That is a
 * handful of calls a minute per viewer rather than a stream.
 *
 * The approve step is visible. ERC20 approval is a real transaction that costs
 * gas and grants a real allowance, and hiding it inside a single "fund" button
 * teaches people to sign approvals without seeing them. It is its own numbered
 * step, showing the current allowance, and it only appears when the allowance
 * is actually short.
 */

const READ_INTERVAL_MS = 30_000;

const CARD = "border border-[var(--color-ink-line)] bg-[var(--color-ink-raised)] p-5 sm:p-6";
const BTN =
  "border border-[#41557c] bg-[#1b2740] px-4 py-2.5 text-sm font-semibold text-[#e8ecf4] transition-colors hover:bg-[#22304d] disabled:cursor-not-allowed disabled:opacity-40";
const QUIET =
  "border border-[var(--color-ink-line)] bg-transparent px-3 py-2 text-xs text-[#8fa0bd] transition-colors hover:border-[#41557c]";
const FIELD =
  "figure w-full border border-[var(--color-ink-line)] bg-[#101a2e] px-3 py-2.5 text-sm text-[#e8ecf4]";
const LABEL = "block text-sm text-[#b8c4d8]";
const HEADING = "text-lg font-semibold text-[#e8ecf4]";

/** Slow, shared query options. Every read on this screen uses them. */
const readQuery = { refetchInterval: READ_INTERVAL_MS, refetchOnWindowFocus: false } as const;

export function TripScreen({ tripId }: { tripId: Hex }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onRightChain = chainId === xLayerTestnet.id;

  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);

  const trip = useReadContract({
    address: TRAVEL_ESCROW,
    abi: TRAVEL_ESCROW_ABI,
    functionName: "getTrip",
    args: [tripId],
    query: readQuery,
  });

  const escrowBalance = useReadContract({
    address: TRAVEL_ESCROW,
    abi: TRAVEL_ESCROW_ABI,
    functionName: "escrowBalance",
    args: [tripId],
    query: readQuery,
  });

  const myContribution = useReadContract({
    address: TRAVEL_ESCROW,
    abi: TRAVEL_ESCROW_ABI,
    functionName: "contributionOf",
    args: address ? [tripId, address] : undefined,
    query: { ...readQuery, enabled: Boolean(address) },
  });

  const token = (trip.data?.token ?? MOCK_USDC) as `0x${string}`;

  /**
   * decimals is read once and cached forever. It is display only: the escrow
   * is decimal agnostic and treats every amount as a raw token unit, so this
   * value never enters a calculation the contract will see, it only turns raw
   * units into something a person can read.
   */
  const decimals = useReadContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "decimals",
    query: { staleTime: Infinity, gcTime: Infinity, refetchOnWindowFocus: false },
  });

  const symbol = useReadContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "symbol",
    query: { staleTime: Infinity, gcTime: Infinity, refetchOnWindowFocus: false },
  });

  const walletBalance = useReadContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { ...readQuery, enabled: Boolean(address) },
  });

  const allowance = useReadContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, TRAVEL_ESCROW] : undefined,
    query: { ...readQuery, enabled: Boolean(address) },
  });

  const { writeContractAsync, isPending: writing } = useWriteContract();
  const [hash, setHash] = useState<Hex | undefined>();
  const receipt = useWaitForTransactionReceipt({ hash });

  /** One place that refetches, called after a transaction confirms. */
  const refreshAll = useCallback(() => {
    void trip.refetch();
    void escrowBalance.refetch();
    void myContribution.refetch();
    void walletBalance.refetch();
    void allowance.refetch();
  }, [trip, escrowBalance, myContribution, walletBalance, allowance]);

  const dp = decimals.data ?? 6;
  const unit = symbol.data ?? "USDC";

  const parsedAmount = useMemo(() => {
    if (!amount || Number.isNaN(Number(amount))) return null;
    try {
      return parseUnits(amount, dp);
    } catch {
      return null;
    }
  }, [amount, dp]);

  const status: TripStatus = STATUS[trip.data?.status ?? 0] ?? "None";
  const copy = STATUS_COPY[status];
  const exists = status !== "None";
  const isTraveler =
    Boolean(address) && trip.data?.traveler?.toLowerCase() === address?.toLowerCase();
  const needsApproval =
    parsedAmount !== null && (allowance.data ?? 0n) < parsedAmount;

  const fmt = (value: bigint | undefined) =>
    value === undefined ? "..." : formatUnits(value, dp);

  async function run(label: string, send: () => Promise<Hex>) {
    setLastAction(null);
    try {
      const txHash = await send();
      setHash(txHash);
      setLastAction(label);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Wallet rejections are a normal thing a person does, not a failure to
      // apologise for, so they are stated plainly and briefly.
      setLastAction(
        /rejected|denied|User rejected/i.test(message)
          ? "You rejected the transaction in your wallet. Nothing was sent."
          : `That did not go through. ${message.split("\n")[0]}`,
      );
      setHash(undefined);
    }
  }

  // When a receipt lands, read the new state once. This is the only automatic
  // refetch beyond the slow interval.
  const [settledHash, setSettledHash] = useState<Hex | undefined>();
  if (receipt.isSuccess && hash && hash !== settledHash) {
    setSettledHash(hash);
    refreshAll();
  }

  const sponsorUrl =
    typeof window === "undefined" ? "" : `${window.location.origin}/trip/${tripId}`;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-[#e8ecf4]" style={{ fontFamily: "var(--font-display)" }}>
          Trip escrow
        </h1>
        <p className="figure mt-1 break-all text-xs text-[#7f8ea9]">{tripId}</p>
      </header>

      <ConnectBar />

      {/* Status. Readable without a wallet, because a sponsor arriving from a
          link should see what they are being asked to put money into first. */}
      <section className={CARD}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className={HEADING}>{copy.title}</h2>
          <span className="figure text-xs text-[#7f8ea9]">{status}</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-[#b8c4d8]">{copy.body}</p>

        {trip.isLoading ? (
          <p className="mt-4 text-sm text-[#7f8ea9]">Reading the chain.</p>
        ) : !exists ? (
          <p className="mt-4 text-sm text-[#b8c4d8]">
            No trip exists at this id. If you followed a sponsor link, ask
            whoever sent it to confirm the trip was created.
          </p>
        ) : (
          <>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7f8ea9]">
                  In escrow
                </dt>
                <dd className="figure mt-1 text-2xl text-[#e8ecf4]">
                  {fmt(escrowBalance.data)} {unit}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7f8ea9]">
                  Target
                </dt>
                <dd className="figure mt-1 text-2xl text-[#e8ecf4]">
                  {fmt(trip.data?.target)} {unit}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7f8ea9]">
                  Contributed in total
                </dt>
                <dd className="figure mt-1 text-sm text-[#b8c4d8]">
                  {fmt(trip.data?.totalContributed)} {unit}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7f8ea9]">
                  Your share
                </dt>
                <dd className="figure mt-1 text-sm text-[#b8c4d8]">
                  {isConnected ? `${fmt(myContribution.data)} ${unit}` : "connect to see"}
                </dd>
              </div>
            </dl>

            <div className="mt-5 border-t border-[var(--color-ink-line)] pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7f8ea9]">
                Settlement deadline
              </p>
              <p className="mt-1 text-sm text-[#b8c4d8]">
                <span className="figure">
                  {trip.data
                    ? new Date(Number(trip.data.travelBy) * 1000).toISOString().slice(0, 10)
                    : "..."}
                </span>
                . This is not the travel date. It is the moment the escrow stops
                paying out and starts paying back: releases close and
                contributors can claim whatever is left.
              </p>
            </div>

            <p className="figure mt-4 text-xs text-[#7f8ea9]">
              traveler {trip.data ? short(trip.data.traveler) : "..."} &middot;{" "}
              <a
                className="underline underline-offset-2"
                href={explorerAddress(TRAVEL_ESCROW)}
                target="_blank"
                rel="noreferrer noopener"
              >
                escrow contract
              </a>
            </p>
          </>
        )}
      </section>

      {/* The sponsor link. This is the part that carries the story, so it is a
          real shareable URL to this same screen, not a mock. */}
      {exists ? (
        <section className={CARD}>
          <h2 className={HEADING}>Sponsor link</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#b8c4d8]">
            Send this to an event organiser, a DAO, or anyone covering part of
            the trip. It opens this same screen, and anyone who connects a
            wallet can top the escrow up. A sponsor's stake is recorded against
            their own address, and if the visa is refused they claim their own
            money back themselves.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input readOnly value={sponsorUrl} className={`${FIELD} max-w-md`} />
            <button
              type="button"
              className={QUIET}
              onClick={() => {
                void navigator.clipboard.writeText(sponsorUrl);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Link copied" : "Copy link"}
            </button>
          </div>
        </section>
      ) : null}

      {/* Fund or sponsor. Same escrow, different function, chosen by whether
          the connected wallet is the traveler. */}
      {exists && copy.accepting ? (
        <section className={CARD}>
          <h2 className={HEADING}>
            {isTraveler ? "Add your own money" : "Sponsor this trip"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[#b8c4d8]">
            {isTraveler
              ? "You are the traveler on this trip, so this calls fund and is recorded as your own stake."
              : "You are not the traveler on this trip, so this calls sponsor. Your stake is recorded against your address and is yours to claim back if the visa is refused."}
          </p>

          {!isConnected ? (
            <p className="mt-4 text-sm text-[#7f8ea9]">Connect a wallet to put money in.</p>
          ) : !onRightChain ? (
            <p className="mt-4 text-sm text-[#7f8ea9]">
              Switch to {xLayerTestnet.name} first.
            </p>
          ) : (
            <>
              <div className="mt-5">
                <label className={LABEL} htmlFor="amount">
                  Amount in {unit}
                </label>
                <input
                  id="amount"
                  className={`${FIELD} mt-1.5 max-w-xs`}
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="250"
                />
                <p className="figure mt-2 text-xs text-[#7f8ea9]">
                  wallet balance {fmt(walletBalance.data)} {unit} &middot; approved{" "}
                  {fmt(allowance.data)} {unit}
                </p>
              </div>

              {/* Step one, and only when it is genuinely needed. */}
              <div className="mt-5 space-y-3">
                <div className="border-l-2 border-[var(--color-ink-line)] pl-4">
                  <p className="text-sm font-semibold text-[#e8ecf4]">
                    Step one: approve {unit}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[#7f8ea9]">
                    {needsApproval
                      ? "A separate transaction that lets the escrow move exactly this amount. It costs gas, and it is shown rather than folded into the next button, because approvals are worth seeing."
                      : parsedAmount === null
                        ? "Enter an amount and this will tell you whether an approval is needed."
                        : "Already approved for this amount. No transaction needed."}
                  </p>
                  <button
                    type="button"
                    className={`${BTN} mt-3`}
                    disabled={!needsApproval || writing || receipt.isLoading}
                    onClick={() =>
                      run("Approved", () =>
                        writeContractAsync({
                          address: token,
                          abi: ERC20_ABI,
                          functionName: "approve",
                          args: [TRAVEL_ESCROW, parsedAmount!],
                        }),
                      )
                    }
                  >
                    Approve {unit}
                  </button>
                </div>

                <div className="border-l-2 border-[var(--color-ink-line)] pl-4">
                  <p className="text-sm font-semibold text-[#e8ecf4]">
                    Step two: {isTraveler ? "fund the escrow" : "sponsor the trip"}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[#7f8ea9]">
                    Moves the {unit} into the escrow, where it stays until a visa
                    outcome is attested or the settlement deadline passes.
                  </p>
                  <button
                    type="button"
                    className={`${BTN} mt-3`}
                    disabled={
                      parsedAmount === null ||
                      parsedAmount === 0n ||
                      needsApproval ||
                      writing ||
                      receipt.isLoading
                    }
                    onClick={() =>
                      run(isTraveler ? "Escrow funded" : "Trip sponsored", () =>
                        writeContractAsync({
                          address: TRAVEL_ESCROW,
                          abi: TRAVEL_ESCROW_ABI,
                          functionName: isTraveler ? "fund" : "sponsor",
                          args: [tripId, parsedAmount!],
                        }),
                      )
                    }
                  >
                    {isTraveler ? "Fund escrow" : "Sponsor trip"}
                  </button>
                </div>
              </div>

              {walletBalance.data === 0n ? (
                <div className="mt-5 border-t border-[var(--color-ink-line)] pt-4">
                  <p className="text-xs text-[#7f8ea9]">
                    No {unit} in this wallet. On testnet the mock token lets
                    anyone mint, so you can top yourself up to try this.
                  </p>
                  <button
                    type="button"
                    className={`${QUIET} mt-2`}
                    disabled={writing || receipt.isLoading}
                    onClick={() =>
                      run("Test tokens minted", () =>
                        writeContractAsync({
                          address: token,
                          abi: ERC20_ABI,
                          functionName: "mint",
                          args: [address!, parseUnits("1000", dp)],
                        }),
                      )
                    }
                  >
                    Mint test {unit}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {/* Transaction feedback. The button name survives into the result. */}
      {hash || lastAction ? (
        <section className={CARD}>
          {receipt.isLoading ? (
            <p className="text-sm text-[#b8c4d8]">Waiting for the chain to confirm.</p>
          ) : receipt.isSuccess ? (
            <p className="text-sm text-[#b8c4d8]">{lastAction}.</p>
          ) : (
            <p className="text-sm text-[#b8c4d8]">{lastAction}</p>
          )}
          {hash ? (
            <a
              className="figure mt-2 inline-block break-all text-xs text-[#9db4d8] underline underline-offset-2"
              href={explorerTx(hash)}
              target="_blank"
              rel="noreferrer noopener"
            >
              {short(hash)} on the explorer
            </a>
          ) : null}
        </section>
      ) : null}

      <p className="text-xs leading-relaxed text-[#7f8ea9]">
        Testnet. The token here is a mock deployed for this demo, because X
        Layer publishes no testnet stablecoin address. Reads refresh every
        thirty seconds and after each transaction, rather than polling, to stay
        inside the public RPC limit.
      </p>
    </div>
  );
}
