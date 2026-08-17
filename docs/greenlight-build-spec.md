# GreenLight: Claude Code Build Spec

Working name. Change it if you have better. The name should signal the core feature: the agent tells you go or abort, honestly.

Target: X Layer AI Season hackathon. Submissions close 2026-08-21, 23:59 UTC. Solo build, Windows, Git Bash, roughly 4 working days.

---

## 1. Kickoff prompt (paste this into Claude Code first)

```
You are helping me ship a hackathon project in 4 days for the OKX X Layer
"Build X: AI Season" hackathon. Deadline is 2026-08-21 23:59 UTC. I am solo,
on Windows using Git Bash.

Read the attached spec file in full before writing any code. Then:

1. Confirm the X Layer testnet and mainnet chain IDs, RPC URLs, explorer URLs
   and faucet URL by fetching the official X Layer developer docs. Do NOT rely
   on your training data for these values. Report what you find before
   proceeding.
2. Propose a repo layout and a build order that fits 4 days, flagging anything
   in the spec you think should be cut.
3. Wait for my confirmation before scaffolding.

Hard constraints:
- No em dashes and no en dashes anywhere in code comments, docs, UI copy or
  commit messages. Use commas, colons or periods.
- Do not invent visa rules, refusal rates, financial thresholds or embassy
  procedures. Every factual claim shown to a user must trace to a dataset
  file in the repo with a source URL and a year.
- Every contract gets tests. No untested contract goes to mainnet.
```

---

## 2. What the product is

An AI travel agent for people holding weak passports, aimed at crypto builders and creators trying to attend events abroad.

Two halves:

**Pre visa.** The user enters their passport, country of residence, destination, purpose, funds, travel history and ties to home country. The agent returns an honest verdict: GO, MARGINAL or ABORT. It shows the historical refusal rate for that passport at that consulate, the published financial requirement, the document checklist, and specific reasons for the verdict. If the odds are bad, it says so and tells them to save the fee.

**Post visa.** Once the user marks a visa as granted, the agent searches flights and hotels against their budget and taste, pays from a stablecoin escrow held on X Layer, and sets reminders for departure, check in and visa validity dates.

The onchain layer is not decoration. Weak passport countries are almost always weak currency countries. A Nigerian card gets declined by a Paris hotel and carries a monthly international limit under 100 USD. Stablecoin escrow on X Layer is the only part of this stack that could not be built without a chain.

---

## 3. Scope discipline

Build in this order. If you run out of time, you stop, you do not skip ahead.

| Priority | Feature | Status |
| --- | --- | --- |
| P0 | Odds engine with real refusal data and honest verdict | Must ship |
| P0 | TravelEscrow contract, tested, on testnet then mainnet | Must ship |
| P0 | Wallet connect, deposit, visa confirmation, release | Must ship |
| P1 | Sponsorship: third party tops up a traveler's escrow | Must ship if P0 lands early |
| P1 | Flight and hotel search via sandbox API | Nice to have |
| P2 | Reminders | Trivial, add last |
| CUT | Restaurant reservations | Do not build |
| CUT | Onchain reputation registry | Fold into escrow events |

Restaurant booking is a whole integration for one line in a demo video. It is cut. Do not negotiate with yourself about this on day 3.

---

## 4. Data layer (build this first, it de-risks everything)

The odds engine is the differentiator and the accuracy risk. Ground it in published data or do not ship it.

Create `data/` with curated JSON. Do not attempt global coverage. Pick roughly 12 passports and 8 destinations that matter to the crypto event circuit:

- Passports: Nigeria, Ghana, Kenya, India, Pakistan, Bangladesh, Vietnam, Philippines, Egypt, Morocco, Indonesia, Nepal
- Destinations: Schengen area, United Kingdom, United States, United Arab Emirates, Singapore, Turkey, Thailand, South Korea

Source datasets, in build order:

1. **UK Home Office entry clearance outcomes, table Vis_D02.** Build on this first. It is the only source that carries a true nationality axis, a purpose of travel dimension, and both numerator and denominator, so you can show decisions refused out of decisions made rather than a bare percentage. Query the Visitor group for conference travel. Large file, parse at build time only, never at runtime, and never ship it.
2. **US State Department adjusted refusal rates for B visas.** Trivial parse, by nationality, worldwide. Set a browser User-Agent or the fetch returns 403 silently.
3. **EU Commission Schengen visa statistics.** Correction to an earlier version of this spec: this file has **no applicant nationality field**. It is keyed by which Schengen state issued and which city the consulate sits in. It answers where you apply from, not what passport you hold. Model it as a residence side signal and label it that way in the UI. Its column is uniform visas not issued, which includes withdrawn and inadmissible cases and therefore runs above a true refusal rate.
4. Published per country daily subsistence requirements for Schengen states.

Record schema. Every record carries:

- `source_url`, `source_year`
- `axis`: either `nationality` or `application_location`. These are different questions and the UI must never blend them into one number.
- `methodology`: the three sources measure different things. The US figure is a per person, end of year adjusted rate, where someone refused in April and issued in July counts only as an issuance. The UK figure is per decision. The Schengen figure is per application and counts not issued rather than refused. Surface this wherever two sources appear together, and never put them on a shared axis without saying so.
- `numerator` and `denominator` where the source provides them.

The UI renders the year next to every number. If coverage is missing for a pair, the app says coverage is missing. It does not guess.

**The single most important honesty rule in the product.** These are population rates, not personal probabilities. A 38 percent national refusal rate does not mean this user has a 38 percent chance. Never render a national aggregate as "your odds". The verdict card states the base rate, names it as a base rate for that group, and then explains which specific factors in this profile push against it. GO, MARGINAL and ABORT are a judgement about profile strength read against the base rate, and the card should say so in one plain line.

**Guardrail to encode in the system prompt of the LLM layer:** the model interprets and explains the retrieved data. It never states a visa rule, threshold or procedure that is not in the retrieved context. If asked something outside coverage, it says so and links the official consulate page.

**Second guardrail:** the agent helps a user present their real situation clearly and completely. It never suggests inflating balances, fabricating employment, borrowing funds to season a bank statement, or misrepresenting ties. Refusal for misrepresentation carries multi year bans, which is worse than the refusal it was trying to avoid. Put this in the system prompt and in the UI footer.

---

## 5. Contracts

Foundry. Solidity 0.8.24 or later. One contract, kept small enough to audit yourself in an hour.

`TravelEscrow.sol`

State machine per trip:

```
Created -> Funded -> VisaGranted -> Booked -> Completed
                  \-> VisaDenied  -> Refunded
                  \-> Aborted     -> Refunded
```

Interface sketch:

```solidity
function createTrip(bytes32 tripId, address stablecoin, uint256 target, uint64 travelBy) external;
function fund(bytes32 tripId, uint256 amount) external;          // traveler
function sponsor(bytes32 tripId, uint256 amount) external;       // anyone, event organizer or DAO
function attestVisaOutcome(bytes32 tripId, bool granted) external onlyVerifier;
function releaseForBooking(bytes32 tripId, address payee, uint256 amount) external;
function refund(bytes32 tripId) external;
function abort(bytes32 tripId) external;                          // traveler, before VisaGranted
```

Requirements:

- Sponsors are recorded and refunded pro rata on denial. This is the feature that makes the sponsorship story real, so get the accounting right.
- `verifier` is a role, set at deploy. In the demo it is your backend signer. Document clearly that a production version needs a real attestation source. Do not pretend otherwise in the README, judges notice.
- Emit rich events. `TripCreated`, `Funded`, `Sponsored`, `VisaAttested`, `Released`, `Refunded`. The frontend and any future reputation view read from events, so you do not need a second contract.
- Use a mock ERC20 in tests. Use real USDC or USDT on X Layer for mainnet, verify the address from the official docs.
- Reentrancy guard on every function that moves tokens. Checks effects interactions.
- Full Foundry test suite including the refund path, the pro rata sponsor path, and the abort path. Fuzz the accounting.

---

## 6. Backend

Node, TypeScript. Keep it boring.

- `POST /assess` takes the traveler profile, retrieves matching dataset records, calls the LLM with retrieved context only, returns `{ verdict, confidence, refusalRate, sourceYear, sourceUrl, financialRequirement, reasons[], checklist[] }`.
- `POST /draft-cover-letter` produces a cover letter from the real profile. Truthful framing only.
- `POST /attest-visa` verifies the user uploaded a visa document, then calls `attestVisaOutcome` on chain. For the hackathon, a manual confirm plus signer call is acceptable. Say so in the README.
- Flights and hotels: use Duffel test mode or Amadeus self service test tier. Both have free sandboxes with real schemas. Every booking screen carries a visible sandbox banner.
- Reminders: a simple table plus a cron job. Departure minus 72 hours, check in window, visa expiry minus 30 days.

Model calls go to Claude. Structured JSON output, temperature low, schema validated on return.

---

## 7. Onboarding: the geo confirm

The first screen is a conversation, not a form. It does three things in under twenty seconds.

**Step 1. Guess where they are, ask them to confirm.**

Do not call a third party IP geolocation API and do not log the IP address. Deploy on Vercel and read `request.geo.country` in middleware, or read the `CF-IPCountry` header behind Cloudflare. Both give you a country code at the edge without your application ever touching, storing or logging an IP.

This matters more than it looks. You are about to hold, in one row, a person's nationality, their immigration intent, their financial position and their location. That is a genuinely sensitive record and a bad one to leak. Persist the confirmed country code only. Never write the IP to a database, a log line or an analytics event.

Expect the guess to be wrong often. Crypto people live behind VPNs. That is exactly why you confirm rather than assume, and the confirm is what makes it feel like a conversation instead of surveillance.

**Step 2. Separate residence from nationality.** This is the real product insight buried in your idea. IP tells you where someone is applying from. It says nothing about which passport they hold, and the two are different inputs that both move the odds a lot. A Nigerian passport holder applying from Dubai has a materially different profile than one applying from Lagos. Capture both, always, and let the geo guess seed only the residence field.

**Step 3. Ask if they actually have a passport in hand.** Valid, expired, or none yet. If the answer is expired or none, the entire flow changes and the honest advice is a timeline, not an odds calculation. Handle that branch, it will be a real share of your users.

Copy, roughly:

```
"Looks like you are in Nigeria. Right?"
   [ Yes ]  [ No, somewhere else ]

"And the passport? That is the part that actually decides things."
   [ country picker ]

"Do you have it in hand right now?"
   [ Valid ]  [ Expired ]  [ Not yet ]
```

Dry, warm, no exclamation marks, no emoji. The voice is a friend who has done this before and is not going to flatter you.

---

## 8. Design direction

Next.js App Router, Tailwind, wagmi and viem, OKX Wallet connector plus injected fallback.

The subject has its own visual world and you should raid it: passports, visa vignettes, entry stamps, security printing, machine readable zones. The tension worth designing around is that officialdom uses this language to be opaque, and this product uses it to be honest.

**Palette.** Ink first, document panels second.

| Token | Hex | Use |
| --- | --- | --- |
| `ink` | #0E1626 | Page ground, deep passport navy |
| `guilloche` | #2A3B57 | Fine security pattern lines, borders |
| `vellum` | #E8E4D9 | Document panels only, never the page background |
| `stamp` | #B5322C | ABORT |
| `caution` | #C98A1E | MARGINAL |
| `clearance` | #1F6F5C | GO |

The three verdict colors are a literal traffic light, which is what the product is named after. Do not use them anywhere else in the interface. Their scarcity is what gives the verdict weight.

**Type.** Three roles, chosen for the subject rather than for taste.

- Display: Bricolage Grotesque. Characterful, variable, used with restraint on verdicts and section heads only.
- Body: Public Sans. It is the US civic design system typeface. The product speaks the language of government forms and then tells the truth in it.
- Data: IBM Plex Mono. Every number, refusal rate, date, source year, wallet address and amount is set in mono. Numbers should read as evidence.

**Signature element.** The verdict card is a visa vignette. Guilloche pattern in the background, the traveler's profile set in mono, and along the bottom edge, a real machine readable zone: the two chevron filled lines you find under a passport photo page, generated from their actual profile data. It is on subject, nobody else at this hackathon will have it, and it makes a screenshot people forward to each other.

**Motion.** One orchestrated moment, not scattered effects. On verdict, the stamp lands: scale in from slightly large, a few degrees of rotation, a short settle. Everything else in the interface stays still. Respect `prefers-reduced-motion` and render the stamped state directly when it is set.

**Restraint.** Spend all the boldness on the verdict card. Forms are plain and generously spaced. No gradients, no glass, no floating cards with shadows. The quality floor is unannounced: responsive to mobile, visible keyboard focus, real empty and error states.

**Screens, in build order:**

1. Onboarding conversation, per section 7.
2. Assess. The profile form, then the verdict card. This is the demo video thumbnail. The ABORT state should be uncomfortable to look at, because that is the honest experience.
3. Trip. Escrow status, fund, sponsor link, balance.
4. Post visa. Search results, release payment, booking confirmations, with a permanent sandbox banner.
5. Reminders.

**Copy rules.** No em dashes, no en dashes. Sentence case. Active voice. Buttons name what happens, and the name survives the whole flow, so a button that says Fund escrow produces a toast that says Escrow funded. Errors state what broke and what to do, and they do not apologize. No hype anywhere.

---

## 9. Four day plan

**Day 1, Mon 17 Aug.** Confirm chain params from docs. Scaffold repo. Build and seed the dataset. Write `TravelEscrow.sol` and its tests. Deploy to X Layer testnet. Create the project X account today, it needs history before submission.

**Day 2, Tue 18 Aug.** Backend `/assess` with retrieval and the guardrailed prompt. Verdict card frontend. Wallet connect, fund, sponsor.

**Day 3, Wed 19 Aug.** Visa attestation flow. Release path. Duffel or Amadeus sandbox search. Reminders if time.

**Day 4, Thu 20 Aug.** Mainnet deploy. Verify contracts on the X Layer explorer. README with honest limitations section. Record demo video. Note: Arc Demo Day is this day, so protect the morning.

**Fri 21 Aug, before 23:59 UTC.** Post from the project X account tagging @XLayerOfficial. Submit the Google Form. Do not leave this to the final hour, form submissions fail.

---

## 10. Submission checklist

- [ ] Deployed on X Layer testnet during the hackathon window
- [ ] Launched on X Layer mainnet
- [ ] Contracts verified on the explorer
- [ ] Dedicated project X account, created and active
- [ ] Submission post from that account mentioning @XLayerOfficial
- [ ] Google Form submitted before 2026-08-21 23:59 UTC
- [ ] Demo video, 2 to 3 minutes, opens with the ABORT verdict
- [ ] README states plainly what is sandboxed and what is live

---

## 11. Things that will go wrong

- **Chain params.** Verify from docs, not memory. Get testnet OKB from the faucet on day 1, not day 4.
- **Dataset scope creep.** You will want to cover more countries. Do not. Twelve by eight is a demo, exhaustive coverage is a company.
- **The verifier role.** A judge will ask who confirms the visa was granted. Have the honest answer ready: today it is a trusted signer, the production path is a consulate issued attestation or a document verification provider. Do not oversell.
- **Booking APIs.** Sandbox only. Say it on screen. Claiming live bookings you cannot make is how you lose credibility in the Q and A.
- **Time.** You have the GOAT port in flight and Arc Demo Day on the 20th. If day 2 ends without a working verdict card, cut flights and hotels entirely and ship the odds engine plus escrow. That is still a complete product.
