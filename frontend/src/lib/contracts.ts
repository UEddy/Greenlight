/**
 * The deployed testnet contracts and the slice of their ABIs this screen uses.
 *
 * Hand written rather than imported from Foundry output, because contracts/out
 * is gitignored and the frontend should not depend on a local build having
 * happened. Every entry here is checked against contracts/src/TravelEscrow.sol.
 */

export const TRAVEL_ESCROW = "0x39311e81cB108C937D2DA307a1a2d494A66eD553" as const;
export const MOCK_USDC = "0x7B8DfdA0376677d7B853d77FfbAD782Ba0AefF36" as const;

/**
 * Trip lifecycle, matching the Solidity enum exactly and in order. The index
 * is the wire value, so this array must never be reordered.
 */
export const STATUS = [
  "None",
  "Created",
  "Funded",
  "VisaGranted",
  "VisaDenied",
  "Booked",
  "Completed",
  "Aborted",
  "Expired",
  "Leftover",
] as const;

export type TripStatus = (typeof STATUS)[number];

/** Plain language for each state, and whether money can still go in. */
export const STATUS_COPY: Record<TripStatus, { title: string; body: string; accepting: boolean }> = {
  None: {
    title: "No trip here",
    body: "Nothing has been created at this id yet.",
    accepting: false,
  },
  Created: {
    title: "Open, nothing in yet",
    body: "The escrow exists and is accepting money from the traveler and from anyone sponsoring.",
    accepting: true,
  },
  Funded: {
    title: "Open and holding money",
    body: "The escrow is accepting more, from the traveler or from a sponsor, until the settlement deadline.",
    accepting: true,
  },
  VisaGranted: {
    title: "Visa attested as granted",
    body: "Releases for booking are open. Refunds have closed, because the money is now meant to be spent.",
    accepting: false,
  },
  VisaDenied: {
    title: "Visa attested as denied",
    body: "Every contributor can claim their full deposit back. Nothing was released, so nothing is missing.",
    accepting: false,
  },
  Booked: {
    title: "Booked",
    body: "Money has been released to a payee for the trip.",
    accepting: false,
  },
  Completed: {
    title: "Completed",
    body: "The traveler marked this trip finished.",
    accepting: false,
  },
  Aborted: {
    title: "Aborted by the traveler",
    body: "Called off before any visa outcome. Every contributor can claim their full deposit back.",
    accepting: false,
  },
  Expired: {
    title: "Settlement deadline passed with no outcome",
    body: "No visa outcome was ever attested, so every contributor can claim their full deposit back. An absent verifier cannot strand anyone's money.",
    accepting: false,
  },
  Leftover: {
    title: "Settled, remainder shared",
    body: "The deadline passed after a visa was granted. Whatever was not spent is shared out in proportion to what each person put in.",
    accepting: false,
  },
};

export const TRAVEL_ESCROW_ABI = [
  {
    type: "function",
    name: "createTrip",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tripId", type: "bytes32" },
      { name: "stablecoin", type: "address" },
      { name: "target", type: "uint256" },
      { name: "travelBy", type: "uint64" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "fund",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tripId", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "sponsor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tripId", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getTrip",
    stateMutability: "view",
    inputs: [{ name: "tripId", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "traveler", type: "address" },
          { name: "travelBy", type: "uint64" },
          { name: "status", type: "uint8" },
          { name: "token", type: "address" },
          { name: "target", type: "uint256" },
          { name: "totalContributed", type: "uint256" },
          { name: "totalReleased", type: "uint256" },
          { name: "totalRefunded", type: "uint256" },
          { name: "leftoverPool", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "statusOf",
    stateMutability: "view",
    inputs: [{ name: "tripId", type: "bytes32" }],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "contributionOf",
    stateMutability: "view",
    inputs: [
      { name: "tripId", type: "bytes32" },
      { name: "contributor", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "escrowBalance",
    stateMutability: "view",
    inputs: [{ name: "tripId", type: "bytes32" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "claimableOf",
    stateMutability: "view",
    inputs: [
      { name: "tripId", type: "bytes32" },
      { name: "contributor", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "verifier",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    // Unrestricted on MockUSDC so anyone can top themselves up on testnet.
    // This exists on the mock only and has no mainnet equivalent.
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;
