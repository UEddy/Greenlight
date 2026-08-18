import { defineChain } from "viem";

/**
 * X Layer testnet, chain ID 1952.
 *
 * Gas is OKB, not ETH. X Layer is an OP Stack chain with a custom gas token,
 * so anything assuming ETH as the native currency is wrong here.
 *
 * Parameters are the ones confirmed against the official developer docs and
 * recorded in the repo README, not from memory.
 */
export const xLayerTestnet = defineChain({
  id: 1952,
  name: "X Layer testnet",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testrpc.xlayer.tech/terigon"] },
  },
  blockExplorers: {
    default: {
      name: "OKX Explorer",
      url: "https://www.okx.com/web3/explorer/xlayer-test",
    },
  },
  testnet: true,
});

export function explorerTx(hash: string): string {
  return `${xLayerTestnet.blockExplorers.default.url}/tx/${hash}`;
}

export function explorerAddress(address: string): string {
  return `${xLayerTestnet.blockExplorers.default.url}/address/${address}`;
}
