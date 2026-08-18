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

| Source | Coverage | Axis | Records |
| --- | --- | --- | --- |
| UK Home Office, table Vis_D02 | Visitor visas, calendar year 2025, per decision | nationality | 12 |
| US State Department, B visa adjusted refusal rates | Fiscal year 2025, worldwide | nationality | 12 |
| EU Commission Schengen visa statistics | Calendar year 2025, per application | application location | 277 |
| Published financial requirements | Version 01/04/2026, all three destinations | destination | 32 |

**The Schengen file is not a nationality dataset and must never be rendered as one.** It has no applicant nationality column anywhere. A record says what happened at the consulates in a city, not what happens to a given passport, so a Nigerian applying in Dubai appears in the Dubai rows. Its measure is uniform visas **not issued**, which includes withdrawn and inadmissible applications and therefore runs above a true refusal rate.

Schengen records come at three levels, tagged in a `level` field: `consulate` is one issuing state at one city, so France at Lagos stands alone; `consulate_city` aggregates every state at that city; `consulate_country` aggregates the whole country. City aggregates are verified to equal the sum of their consulates, and country totals are reconciled against the Commission's own published figures at build time.

Cyprus is reported on its own sheet because it did not fully apply the Schengen acquis in 2025, and the source says its figures are **national visas, not Schengen visas**. Those 4 records carry their own methodology string and are deliberately excluded from every aggregate.

### Financial requirements

The fourth dataset answers a different question from the other three, so it carries a third axis value, `destination`. A refusal rate is about a passport or about a place you apply from. A financial requirement is set by the country you are travelling to. Never join them as though they shared an axis, and never present a financial requirement as something that moves the refusal rate.

**The destinations disagree about whether the question even has an answer.** Each of the 29 Schengen states publishes a per day reference amount, and they range from 14 EUR in Latvia to 121.10 EUR in Spain, a spread of almost nine to one across a single visa area. The United Kingdom and the United States publish nothing. Appendix V: Visitor contains no sterling figure anywhere, and the Home Office caseworker guidance says in terms that there is no set level of funds required. The B visa chapter of the Foreign Affairs Manual contains no dollar figure anywhere. Both assess adequacy case by case against the applicant's own itinerary.

So four records carry `basis: none_published`: the UK, the US, Austria and Cyprus, the last two being the Schengen states that decline to fix an amount. **A missing figure is recorded as missing.** No rule of thumb, forum number or visa agency figure is ever substituted for one, because a made up threshold is worse than an honest gap: it would be the one number a user actually acts on.

Amounts are recorded as published. They are never converted between currencies, never uprated, and never summed across separate requirements. Where a state publishes several amounts for the same day, the headline is the one that applies to a traveller paying their own way with no host declaration, and the rest are kept in `variants`. Italy has no headline daily amount at all, on purpose: it publishes a grid keyed on trip length, and collapsing that to one number would misstate it for most trips.

Unlike the other three, this dataset is transcribed by hand in `scripts/financial_requirements.py` rather than parsed. The source is prose, one written section per state, so picking the number is a reading rather than a parse and belongs somewhere it can be checked line by line. The build still refuses to write it if a Schengen state is missing, if a record claims both an amount and that nothing is published, or if the UK or US record is dropped.

Most figures rest on the Commission annex, which is the states' own notified amounts. Five states were also read on their own government page, marked with a `national_source`. Two findings came out of that: Spain's ministry publishes 121.10 EUR per day effective 1 January 2026 against the annex's 122.10, and the national figure wins because a state is the authority on its own amount. Luxembourg's own page publishes no amount at all, so its 67 EUR exists only in the annex, anchored to a 2018 wage. Treat it as the weakest figure here.

`data/manifest.json` records the direct download URL, landing page URL, format, retrieval date, byte size and checksum for every source. The UK download path contains a hashed segment that changes on republish, which is why the landing page URL is recorded alongside it.

## Running it

One npm workspace, two packages, one deployable app.

```bash
npm install            # at the repo root, links both workspaces
npm run dev            # the whole app on :3000
npm test               # 116 backend tests, offline, never calls the model API
npm run typecheck      # both packages
```

`backend/` stays a real package with its own tests and its own Express server for local work (`npm run dev --workspace greenlight-backend`, on :8787). Nothing deploys from it. The deployed app imports `assess` from it directly.

## Deploying to Vercel

The frontend and the backend ship as a single Vercel project. `frontend/src/app/api/assess/route.ts` imports `assess` from the `greenlight-backend` workspace package and does nothing but validate the request and map the errors that function already throws onto status codes. There is no second copy of the retrieval, the prompt, the guards or the assembly, so the deployed route and the 116 tests exercise one implementation.

**Project settings**

| Setting | Value |
| --- | --- |
| Framework preset | Next.js |
| Root directory | `frontend` |
| Build command | leave blank, `frontend/vercel.json` sets it |
| Install command | leave blank, `frontend/vercel.json` sets it |
| Output directory | leave as the default |
| Node version | 22 or later |

`frontend/vercel.json` pins the install and build commands in the repo rather than leaving them to dashboard detection, so a deploy cannot start behaving differently because a placeholder changed. The install runs at the workspace root, which is the only place the lockfile lives.

Two things had to be true for `greenlight-backend` to resolve in a deployed build, and neither was:

- **`frontend/package.json` has to declare `greenlight-backend`.** It imports it, so it depends on it. Without the declaration the package still turned up in the root `node_modules`, because it is a workspace member, and resolution from `frontend` found it by walking up. That is a hoisting accident rather than a dependency, and it does not survive an install layout where `frontend` is treated as its own root.
- **There must be exactly one lockfile, at the workspace root.** `frontend/package-lock.json` and `backend/package-lock.json` were still committed from before the workspace conversion. A lockfile inside the root directory makes that directory look like its own install root, which produces a `node_modules` holding only that package's own declared dependencies. Both are deleted and gitignored.

If the backend is ever missing or unresolvable, the build fails rather than the request: the API route and the statically prerendered landing page both import from the package at compile time, so a broken link is a `Module not found` at build.

**Environment variables**

| Name | Required | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | yes | Google AI Studio key. Without it the pages still render and `/api/assess` returns a 500 saying no provider is configured. |
| `GEMINI_API_KEY_BACKUP` | recommended | A key from a second project. A 429 fails over to it immediately. |
| `GEMINI_MODEL` | no | Defaults to `gemini-3.6-flash`. |
| `GREENLIGHT_PROVIDER` | no | `gemini` or `claude`. Unset means whichever key is present, Gemini first. |
| `ANTHROPIC_API_KEY` | no | Only if you set `GREENLIGHT_PROVIDER=claude`. |

**Nothing reads a `.env` file in production.** `backend/src/env.ts` is the only code that touches one, and it returns early when `NODE_ENV` is `production`, which Vercel sets. The keys arrive as real environment variables. The guard makes that true by construction rather than true because the file happens to be absent.

### Native binaries and the lockfile

The lockfile is committed and it is generated on Windows, which npm handles badly for packages that ship a compiled binary per platform. npm records only the binary matching the machine that ran the install, so a Linux build gets a tree with no binary to load and fails at the first CSS file with `Cannot find module '../lightningcss.linux-x64-gnu'`.

Three packages on the deploy path have this shape: `lightningcss` and `@tailwindcss/oxide`, both pulled in by Tailwind, and `@next/swc`. The Linux builds are declared as `optionalDependencies` of the frontend, pinned to the exact version of their parent, because a native binary and its JavaScript package have to be the same version:

```json
"optionalDependencies": {
  "@next/swc-linux-x64-gnu": "16.3.1",
  "@tailwindcss/oxide-linux-x64-gnu": "4.3.3",
  "lightningcss-linux-x64-gnu": "1.32.0"
}
```

Declaring them puts real entries in the lockfile tree, with a resolved URL and an integrity hash, marked `os: ["linux"]` and optional. A Windows install skips downloading them and a Linux install fetches them. Nothing is disabled and Tailwind still runs its normal engine.

The alternative, regenerating the lockfile under a platform override with `npm install --os=linux`, was rejected: it rebuilds the tree *for* Linux and drops the Windows entries, so the next install on a Windows machine puts them back and removes the Linux ones. That ping pong would break a build every time the lockfile was touched from the other platform. Declaring the dependencies is stable in both directions.

**When upgrading Tailwind or Next, bump these pins in the same commit.** They are exact versions and they will silently drift otherwise. A mismatch does not fail on Windows, where these are never loaded, so it will show up as a failed deploy rather than a failed local build.

**Residual risk.** This covers linux x64 with glibc, which is what Vercel builds on. An arm64 builder or a musl based image would need its own entries, one line each in the same place. `@rolldown/binding-linux-x64-gnu`, used by vitest in the backend, has the same gap and is deliberately not fixed here, because the backend is not deployed; it would matter only if `npm test` were run on Linux CI.

### The monorepo path problem, and how it is solved

The likely snag in this layout is a path that resolves locally and vanishes inside a serverless bundle. Three places had one, and all three are now static imports rather than filesystem reads:

- `backend/src/dataset.ts` read `data/processed/*.json` through a path built from `import.meta.url`.
- `frontend/src/lib/fixtures.ts` walked `backend/test/fixtures` with `readdirSync` from `process.cwd()`.
- `backend/src/env.ts` probed for a `.env`, now skipped in production.

Reading a file at runtime asks the bundler to have traced a directory it has no reason to know about, and fails at request time in production while passing every local check. A static import puts the data in the module graph instead, so it either builds or fails at build time, and it can never be missing when a request arrives. All four datasets and five fixtures together are under a megabyte, which is nothing to bundle. The landing page in particular cannot deploy in a state where its verdict card has no data to render.

One consequence worth knowing: the backend now uses `moduleResolution: "bundler"` and extensionless relative imports, because TypeScript's NodeNext convention of importing `./dataset.js` from `dataset.ts` is not something a bundler resolves back to the source. That is why `backend` no longer has `build` and `start` scripts: `tsc` there can no longer emit runnable Node ESM, and it does not need to, since the deploy target is the Next route and local work runs through `tsx`.

`POST /assess` takes a traveller profile and returns the verdict card. `GET /coverage` returns what the pickers may offer, so the frontend never invents a supported country.

**Every number is retrieved in code. The model never produces one.** Retrieval runs first and reads only the curated JSON in `data/processed/`. The model is then given those records and asked for four things: a verdict, a confidence, one plain line reading the profile against the base rate, and the reasons and checklist. It returns no numeric field at all, and the response is assembled from the retrieved records. The model's contribution is judgement and prose.

That is enforced rather than requested, and the enforcement is a digit ban rather than an allowlist. **The model writes no digits at all, anywhere.** An earlier version checked each figure against the numbers present in the retrieved context, which catches invention and misses misattribution: a figure that is genuinely in the context can still be pinned to the wrong label. For a Nigerian profile assessed against the Schengen area, the application location figure is legitimately in context, so "the UK refusal rate for your passport is 47.74 percent" passed a presence check while being false on three counts, and would have rendered with a source and a year beside it. The only sentence that cannot do that is one containing no figures.

Where a figure genuinely belongs, the model leaves a slot. `baseRateReading` is written with tokens, `{{rate}}`, `{{subject}}`, `{{numerator}}`, `{{denominator}}`, `{{year}}` and `{{destination}}`, which code fills from the retrieved record after the answer passes its checks. `{{rate}}` and `{{subject}}` are both required, and the second one is the point: substituting the value alone leaves the model free to write the label, which reproduces the same false sentence. The subject comes from the record too, so the figure and the thing it describes are bound together by code. A token the source cannot fill is rejected rather than left blank, so a request against the US, which publishes a rate and no counts, cannot ask for `{{numerator}}`. Tokens are only substituted in the base rate line, so one appearing in a reason is rejected rather than reaching a user as raw braces. After substitution the finished line is checked back against the retrieved context, which audits this service's own work rather than the model's.

Any digit in any field fails the response. It is re-asked once with the offending text quoted back, and refused after that. A refused answer returns HTTP 502 **with the retrieved records attached and no verdict**, because the facts are still sourced and still true; it is only the judgement that failed its checks.

**Never recommend applying somewhere else.** A Schengen application belongs to the state of the main destination. Suggesting a different state, consulate or city because a rate or a threshold looks lower there is advice that gets people refused, and it shades into misrepresentation, which carries multi year bans. The prohibition is rule 4 of the system prompt and it is checked again on the way out: the guard rejects comparative phrasing about rates or requirements, and rejects naming any other jurisdiction in a sentence that also contains a routing verb. Naming another state as a plain fact is fine, because the variation is real and the interface may show it. Turning it into a route is not. Tests cover the direct suggestion, the soft hint, the version framed as a lower financial requirement, and the version framed as a lower refusal rate.

**The axes stay apart.** `refusalRate` is an object with a `nationality` field and an `applicationLocation` field, never a single number. UK and US records are nationality. Schengen records are application location, and that file has no nationality column at all, so a Schengen request returns `nationality: null` and says why in `coverageNotes`. Each figure carries what it counts and `comparableWithOtherAxis: false`.

**The UK and US financial line is qualitative.** Neither publishes an amount, so neither gets a threshold, an estimated total, or a per day figure. They get a statement of the official position, assembled from the dataset with the source attached: funds must be adequate for the specific trip, judged case by case against the itinerary, the applicant's own means and their ties.

**Romania and Italy are surfaced, not flattened.** Romania routes seven of the twelve covered passports through an inviting party at a different daily amount; the applicable variant is selected on the nationality list and shown. Italy publishes a grid keyed on trip length and party size, so no single trip total is computed for it at all, and the row that matches the trip is surfaced instead. Selection uses the machine readable bounds in the dataset, never a regex over the English.

Coverage gaps return HTTP 422 with the gap, never an estimate. That includes an expired or absent passport, where the honest next step is a renewal timeline rather than a verdict on odds.

### Providers

Two model providers sit behind one `ModelClient` interface: `assess(system, user)` returning `ModelOutput`. Gemini on Google AI Studio's free tier is the default, Claude is intact and unchanged. Set `GREENLIGHT_PROVIDER` to `gemini` or `claude` to force one, or leave it unset and whichever key is present wins, Gemini first. Keys go in `backend/.env`, which the bare `.env` entry in `.gitignore` covers at any depth.

One Zod schema drives both. Anthropic takes `ModelOutputSchema` through `zodOutputFormat`, Gemini takes it through `z.toJSONSchema()` into `responseJsonSchema`, and the Gemini path validates the parsed result against the same schema again. Neither provider hand maintains a copy of the shape, so the two cannot drift. `minLength` and `maxLength` are stripped on the way out because Gemini's documented JSON Schema subset does not include them; they were advisory anyway, and the guards enforce what actually matters.

**Every guard is byte for byte the same for both providers.** They validate output, not vendor. That is the whole point: a token contract that only held for one model was never a contract.

### What Gemini actually did

Model `gemini-3.6-flash`, five profiles chosen to stress different paths, captured by `scripts/capture-fixtures.ts`.

**Five of five complied on the first attempt.** No bare digits in any reason or checklist item, no dropped `{{subject}}`, no invented or unavailable token, no forum shopping, no misrepresentation nudge. The single retry was not consumed once, so there is no rescue rate to report. That includes a profile built specifically to bait the prohibited answer, a Ghanaian applicant to Spain, which publishes the highest daily amount in the Schengen area, with funds far short of it: Gemini returned ABORT with high confidence and never suggested filing anywhere else.

That is a better result than expected, and it is worth being precise about why it is not proof. Five cases is a small sample, the temperature is pinned at zero, and compliance was measured on the one prompt these guards were written alongside. The claim supported here is that the contract is portable across vendors, not that this model can never breach it. The guards remain the thing that makes it safe, and none were touched to get this result.

Finding worth keeping: model discovery on AI Studio is not trustworthy from documentation. The published examples name `gemini-3.7-flash`, which this key cannot see; `models.list` advertises `gemini-2.5-flash`, which the API then refuses with "no longer available to new users" and names `gemini-3.6-flash` as the replacement. Listing a model is not the same as being allowed to call it, and the only reliable source was the error from a real call.

The free tier also returns 503 under load. `GeminiModelClient` retries 429 and 503 with backoff, which is transport resilience and deliberately separate from the guard retry in `assess.ts`: a rejected answer is never retried at the transport layer, because that would quietly add attempts to a budget the guards own.

One difference in the spec's favour: Gemini accepts a sampling temperature, so the build spec's request for a low one is honoured literally at zero. Claude Opus 5 rejects sampling parameters with a 400, so on that provider determinism comes from the schema constrained response and pinned effort instead.

### Fixtures, and what is replayed rather than live

`test/fixtures/` holds five real responses captured from live Gemini calls, unedited. `test/fixtures.test.ts` re-runs every guard over them, which proves both that the replay is safe and that what a real provider returned is genuinely compliant rather than compliant looking. A response that failed its guards was never saved, so nothing in that directory was corrected into passing.

**The demo gallery at `/demo` replays those saved responses and makes no API call at all.** It is a server component reading files from disk, so browsing it costs nothing, cannot be rate limited, and works with no key configured. The page says so on itself rather than only here, because a gallery of well formed cards is exactly the kind of thing that quietly reads as live output.

**The live path is the same code.** Submitting the form at `/assess` calls `POST /assess`, which retrieves the same records, prompts the same model and runs the same guards over the answer. The only difference between a fixture and a live response is when it was produced. To run it live:

```bash
echo "GEMINI_API_KEY=..." > backend/.env
cd backend && npm run dev          # POST /assess on :8787
cd frontend && npm run dev         # submit the form at /assess
```

Regenerate the fixtures with `npx tsx scripts/capture-fixtures.ts` in the backend package. That spends one request per profile.

### The free tier budget

Google AI Studio's free tier allows **twenty generate requests per day, per project, per model**. That is small enough that an accidental test run can cost a recording session, so two things protect it.

`npm test` excludes the live tests entirely and runs 116 offline. The live suite is opt in through `GREENLIGHT_LIVE=1 npm run test:live`, gated on an explicit flag rather than on whether a key happens to be present. It used to be the latter, which turned `backend/.env` existing into a quota trap: presence of a key is not consent to spend it.

`GEMINI_API_KEY_BACKUP` is a fallback for a rate limit arriving at the worst moment. A 429 fails over to it immediately rather than backing off, because the quota is counted per project per day, so waiting on an exhausted key changes nothing and only another project's key helps. A 503 is different: that is the free tier being busy rather than exhausted, so it backs off on the same key and does not burn the backup. Identical values in both variables are collapsed to one key, so a copy paste mistake cannot look like a working fallback while changing nothing.

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
  sources.py                 source registry and methodology strings
  financial_requirements.py  curated financial records, transcribed by hand
backend/            Node, TypeScript
  src/gemini.ts              Gemini provider, free tier, same schema and guards
  src/provider.ts            picks the provider, defaults to whichever key exists
  test/fixtures/             real captured responses, replayed offline
  src/retrieval.ts           deterministic lookup, every number originates here
  src/prompt.ts              system prompt and the context block the model reads
  src/guard.ts               figure allowlist and prohibited advice checks
  src/assess.ts              retrieve, ask, guard, assemble
  src/server.ts              POST /assess, GET /coverage
```
