# GreenLight

An honest travel agent for people holding weak passports. It tells you go, marginal or abort before you pay a visa fee, and it holds trip money in a stablecoin escrow on X Layer so a weak local card is not the thing that stops you travelling.

Built for the OKX X Layer "Build X: AI Season" hackathon.

## What is real and what is not

Read this section first. It is the part judges ask about.

| Piece | Status |
| --- | --- |
| Refusal rate data | Real. Published UK Home Office and US State Department figures, parsed at build time from primary sources. |
| Odds engine verdict | Real, grounded only in the data above. It never states a rule that is not in the retrieved context. |
| TravelEscrow contract | Real. 36 passing tests including fuzzed accounting invariants. Deployed and verified on X Layer testnet. |
| Stablecoin on testnet | A mock. X Layer publishes no testnet stablecoin address, so the demo deploys its own six decimal MockUSDC. |
| Visa attestation | A trusted signer, not a real attestation. See the honest limitations below. |
| Flight and hotel booking | Sandbox only, if it ships at all. Every booking screen carries a sandbox banner. |

## Honest limitations

**The verifier is one key.** `attestVisaOutcome` is callable only by an address fixed at deploy. In this demo that is the backend signer, which means the demo trusts one key to say whether a visa was granted. A production version needs a consulate issued attestation or a document verification provider. We are not pretending otherwise.

The contract does have a real safety valve for this: if the verifier never attests, the trip settles at `travelBy` and every contributor can withdraw their full deposit. An absent or failed verifier cannot strand anyone's money.

**Refusal rates are population base rates, not personal odds.** A 38 percent national refusal rate does not mean a given applicant has a 38 percent chance. The verdict card states the base rate, names it as a base rate for that group, and then explains which factors in the profile push against it. Every record in `data/processed/` carries this caveat inline.

**The three data sources measure different things** and must never be blended into one number. The US figure is a per person, end of fiscal year adjusted rate. The UK figure is per decision. Every record carries a `methodology` string and an `axis` field saying whether it is keyed by nationality or by application location.

**Coverage is three destinations, and that is not a scoping choice.** The UK, the US and the Schengen area publish usable per nationality outcome data. The UAE, Singapore, Turkey, Thailand and South Korea do not. They are shown as unsupported with a reason rather than stubbed or estimated.

## Chain parameters

Confirmed from the official X Layer developer documentation, not from memory.

| | Testnet | Mainnet |
| --- | --- | --- |
| Chain ID | `1952` (`0x7A0`) | `196` (`0xC4`) |
| RPC | `https://testrpc.xlayer.tech/terigon` | `https://rpc.xlayer.tech` |
| RPC alternate | `https://xlayertestrpc.okx.com/terigon` | `https://xlayerrpc.okx.com` |
| Explorer | https://www.okx.com/web3/explorer/xlayer-test | https://www.okx.com/web3/explorer/xlayer |
| Gas token | OKB | OKB |

Source: [Network information](https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/network-information) and [RPC endpoints](https://web3.okx.com/onchainos/dev-docs/xlayer/developer/rpc-endpoints/rpc-endpoints). Public RPCs are limited to 100 requests per second per IP.

Testnet OKB comes from the [X Layer testnet faucet](https://web3.okx.com/xlayer/faucet).

Gas is paid in OKB, not ETH. X Layer is an OP Stack chain with a custom gas token, so any code assuming ETH as the native currency is wrong.

### Mainnet stablecoins

From the [contracts page](https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/contracts). The escrow is decimal agnostic and treats all amounts as raw token units, so it works with any of these without configuration.

| Token | Mainnet address |
| --- | --- |
| USDC | `0x74b7F16337b8972027F6196A17a631aC6dE26d22` |
| USDT | `0x1E4a5963aBFD975d8c9021ce480b42188849D41d` |
| USDC.e | `0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035` |

The same page lists a dash for every stablecoin on testnet, which is why this repo deploys its own mock.

Decimals are not published on that page. Confirm with an onchain `decimals()` call before pointing the escrow at a mainnet token. Do not assume 18.

## Deployed addresses

**X Layer testnet, chain ID 1952.** Both contracts verified on the explorer.

| Contract | Address | Explorer |
| --- | --- | --- |
| TravelEscrow | `0x39311e81cB108C937D2DA307a1a2d494A66eD553` | [view](https://www.okx.com/web3/explorer/xlayer-test/address/0x39311e81cB108C937D2DA307a1a2d494A66eD553) |
| MockUSDC | `0x7B8DfdA0376677d7B853d77FfbAD782Ba0AefF36` | [view](https://www.okx.com/web3/explorer/xlayer-test/address/0x7B8DfdA0376677d7B853d77FfbAD782Ba0AefF36) |

Deployer and verifier: `0xD2d0411b6a5A3B1932C748F2cD4D2cdd6Ce87c88`. Deployed in block 38543117. The deployer holds a seed balance of 1,000,000 MockUSDC, and `mint` is unrestricted so anyone can top themselves up.

**X Layer mainnet, chain ID 196.** Not yet deployed. On mainnet the escrow points at a real stablecoin address from the table above, not at MockUSDC.

## Contracts

`TravelEscrow.sol` holds stablecoin for one trip until a visa outcome is known. Four decisions shape it.

**Decimal agnostic.** Every amount is a raw token unit. The contract never calls `decimals()` and never stores it. USDC on X Layer is likely 6 rather than 18, and treating amounts as opaque removes the question. Display scaling belongs to the frontend.

**SafeERC20 for every token movement.** X Layer USDT returns no bool from `transfer`, so a bare call would revert on ABI decoding. There is a test that runs a full deposit and refund cycle against a token in that shape.

**Refunds are pull based.** Nothing loops over sponsors. Each contributor calls `claimRefund` and withdraws their own recorded stake. An unbounded loop would be both a gas ceiling and a denial of service surface.

**Refunds close once a visa is granted.** Because nothing can leave the escrow before `VisaGranted`, a refundable trip still holds every unit contributed, so each contributor's pro rata share is exactly their own deposit. There is no partial release to reconcile.

### `travelBy` is a settlement deadline, not a departure date

This is the single most misread field in the contract. `travelBy` is the moment the escrow stops paying out and starts paying back: releases close and contributors can claim. It therefore belongs after the last payment the trip will ever make, and hotels commonly settle at checkout rather than at booking.

Set it to the return date plus roughly a week. The frontend prefills that and never labels the field as the date of travel.

### State machine

```
Created -> Funded -> VisaGranted -> Booked -> Completed
                  |               \
                  |                `-> (travelBy) -> Leftover, pro rata claims
                  |-> VisaDenied -> full refunds
                  |-> Aborted    -> full refunds
                  `-> (travelBy) -> Expired, full refunds
```

Two things can happen when `travelBy` passes, depending on whether a visa was ever attested. With no outcome the trip expires and everyone takes their full deposit back. With a grant, the traveler had their chance to spend it, so only the unspent remainder goes back, shared in proportion to what each person put in.

The leftover pool is snapshotted on entry to `Leftover`. Computing shares against a live balance would shrink the denominator under each successive claimant and short change everyone after the first.

### Build and test

```bash
cd contracts
forge build
forge test
```

36 tests. The suite covers the happy path, denial with pull refunds, expiry, the leftover path, abort, double claim, a reentrancy attempt through a hostile token, a USDT shaped token that returns no bool, and three fuzzed accounting properties.

The load bearing one is `testFuzz_releasedPlusClaimedNeverExceedsDeposited`, which fuzzes deposits, release amount, terminal path and claim order, then asserts that what the escrow pays out for bookings plus what it pays back to contributors can never exceed what was put in.

### Deploy to X Layer testnet

Already done, see the addresses above. To redeploy:

```bash
cd contracts
forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://testrpc.xlayer.tech/terigon \
  --account greenlight-deployer \
  --broadcast
```

Deploys MockUSDC first, then TravelEscrow pointed at it, then mints a seed balance to the deployer. Set `VERIFIER_ADDRESS` to override the verifier, which otherwise defaults to the deployer. Deployed addresses land in `broadcast/Deploy.s.sol/1952/run-latest.json`, which is gitignored.

Gas is paid in OKB. Top the deployer up from the [faucet](https://web3.okx.com/xlayer/faucet) first.

### Verify a contract

This works. It was run against both testnet contracts and both report verified. Do not re-derive it.

```bash
cd contracts
forge verify-contract <address> \
  src/TravelEscrow.sol:TravelEscrow \
  --chain 1952 \
  --verifier oklink \
  --verifier-url https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLAYER_TESTNET \
  --etherscan-api-key dummy
```

**The API key is not checked.** The literal string `dummy` is accepted. `forge verify-contract` refuses to run without the flag present, so it has to be passed, but its value is ignored by this endpoint. That is why there is no key in `.env` and nothing to obtain. The OKLink docs link for applying for a key is circular and never resolves, so do not go looking for one.

**For mainnet, the same command with two changes.** Swap `XLAYER_TESTNET` for `XLAYER` in the verifier URL, and `--chain 1952` for `--chain 196`. Keep the dummy key flag.

```bash
forge verify-contract <address> \
  src/TravelEscrow.sol:TravelEscrow \
  --chain 196 \
  --verifier oklink \
  --verifier-url https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLAYER \
  --etherscan-api-key dummy
```

Notes worth having before Thursday:

- Wait at least one minute after deploying before verifying, per the docs. Verification submitted too early fails.
- Re-running against an already verified address is safe. It prints `is already verified. Skipping verification.` and exits cleanly, so it doubles as a status check.
- Submission is asynchronous. A successful submit prints a GUID and returns immediately. Re-run the same command after roughly a minute to confirm it actually landed. Add `--watch` to poll instead.
- `TravelEscrow` takes a constructor argument. If a fresh verification is rejected, add `--constructor-args $(cast abi-encode "constructor(address)" <verifier_address>)` first. It was not needed for the testnet deploy, but a mainnet deploy with a different verifier is the case most likely to need it.
- Flattening is not needed. `forge verify-contract` submits standard JSON input with all the OpenZeppelin imports resolved.

Sources: [Verifying with Foundry](https://web3.okx.com/onchainos/dev-docs/xlayer/developer/verify-a-smart-contract/verify-with-foundry) for the command shape and the one minute wait, and the [OKLink supported chains list](https://www.oklink.com/docs/en/#developer-tools) for `XLAYER` and `XLAYER_TESTNET`.

**One caveat that is not resolved.** The docs contradict themselves about which explorer is authoritative. [Manual verification](https://web3.okx.com/onchainos/dev-docs/xlayer/developer/verify-a-smart-contract/manual-verification) tells you to use OKX Explorer, while the Foundry page targets OKLink, which OKX has been folding into its own explorer. The OKLink path is what actually works today. If it stops working, manual verification through the explorer UI is the fallback: paste the address, open the Contract tab, choose SingleFile plus compiler version, paste the source. That path would need `forge flatten` output.

## Data

```bash
python scripts/fetch-sources.py     # downloads into data/raw/, writes data/manifest.json
python scripts/build-dataset.py     # parses into data/processed/*.json
```

Needs Python 3 with `openpyxl` and `pypdf`, plus `curl`. Downloads go through curl because travel.state.gov rejects Python's urllib with a 403 no matter which headers are set.

`data/raw/` is gitignored and never read at runtime. Only the curated JSON in `data/processed/` ships.

| Source | Coverage | Axis |
| --- | --- | --- |
| UK Home Office, table Vis_D02 | Visitor visas, calendar year 2025, per decision | nationality |
| US State Department, B visa adjusted refusal rates | Fiscal year 2025, worldwide | nationality |
| EU Commission Schengen visa statistics | 2025, not yet built | application location |

`data/manifest.json` records the direct download URL, landing page URL, format, retrieval date, byte size and checksum for every source. The UK download path contains a hashed segment that changes on republish, which is why the landing page URL is recorded alongside it.

## Repo layout

```
contracts/          Foundry project
  src/              TravelEscrow.sol, MockUSDC.sol
  test/             TravelEscrow.t.sol and mocks
  script/           Deploy.s.sol
data/
  processed/        curated JSON, committed
  raw/              downloaded sources, gitignored
  manifest.json     provenance for every source
docs/               build spec
scripts/            dataset fetch and build
```
