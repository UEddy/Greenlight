"use client";

import { useEffect, useState } from "react";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { xLayerTestnet } from "@/lib/chain";

const BTN =
  "border border-[#41557c] bg-[#1b2740] px-4 py-2.5 text-sm font-semibold text-[#e8ecf4] transition-colors hover:bg-[#22304d] disabled:cursor-not-allowed disabled:opacity-40";
const QUIET =
  "border border-[var(--color-ink-line)] bg-transparent px-3 py-2 text-xs text-[#8fa0bd] transition-colors hover:border-[#41557c]";

export function short(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function ConnectBar() {
  // Which wallets exist is discovered in the browser, so the server cannot
  // know the list and rendering it during SSR guarantees a hydration
  // mismatch. Nothing wallet dependent renders until after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();

  const wrongChain = isConnected && chainId !== xLayerTestnet.id;

  if (!mounted) {
    return (
      <section className="border border-[var(--color-ink-line)] bg-[var(--color-ink-raised)] p-5">
        <p className="text-sm text-[#7f8ea9]">Looking for a wallet in this browser.</p>
      </section>
    );
  }

  if (!isConnected) {
    return (
      <section className="border border-[var(--color-ink-line)] bg-[var(--color-ink-raised)] p-5">
        <p className="text-sm text-[#b8c4d8]">
          Connect a wallet to fund or sponsor this trip. Reading the trip needs
          no wallet, so everything below is already visible.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              type="button"
              className={BTN}
              disabled={isPending}
              onClick={() => connect({ connector })}
            >
              {connector.name}
            </button>
          ))}
        </div>
        {error ? (
          <p className="mt-3 text-xs text-[#d8a0a0]">
            {error.message}. If no wallet appeared, the extension is not
            installed or is not exposing itself to this page.
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 border border-[var(--color-ink-line)] bg-[var(--color-ink-raised)] px-5 py-3">
      <p className="figure text-xs text-[#9db4d8]">
        {address ? short(address) : ""}
        <span className="ml-2 text-[#7f8ea9]">
          {wrongChain ? `chain ${chainId}` : xLayerTestnet.name}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {wrongChain ? (
          <button
            type="button"
            className={BTN}
            disabled={switching}
            onClick={() => switchChain({ chainId: xLayerTestnet.id })}
          >
            {switching ? "Switching" : `Switch to ${xLayerTestnet.name}`}
          </button>
        ) : null}
        <button type="button" className={QUIET} onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    </section>
  );
}
