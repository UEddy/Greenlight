"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { http, createConfig, WagmiProvider } from "wagmi";
import { injected } from "wagmi/connectors";
import { xLayerTestnet } from "@/lib/chain";

/**
 * Wallet wiring. OKX Wallet first, any other injected wallet as the fallback.
 *
 * On the RPC budget: the public endpoints are limited to 100 requests per
 * second per IP, and a naive dapp blows through that without trying. Nothing
 * here watches blocks or events. Reads happen on mount, after an action, and
 * on a slow interval set on each query, and window focus refetching is off,
 * because tabbing back and forth should not cost a burst of calls.
 */

export const wagmiConfig = createConfig({
  chains: [xLayerTestnet],
  connectors: [
    // Targets the OKX extension specifically, so it is offered by name rather
    // than as whatever generic wallet happens to have claimed window.ethereum.
    injected({ target: "okxWallet" }),
    // Fallback for anything else injected: MetaMask, Rabby, a browser wallet.
    injected({ shimDisconnect: true }),
  ],
  transports: {
    [xLayerTestnet.id]: http(xLayerTestnet.rpcUrls.default.http[0]),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The RPC budget again, as defaults rather than per call, so a
            // future query added without thinking about it still behaves.
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            retry: 1,
            staleTime: 15_000,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
