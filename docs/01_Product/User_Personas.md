# MedRail — User Personas


> **⚠ Correction notice.** Parts of this document were written against a review finding that was
> later proven wrong. Settlement in x402 v2 happens **only** on a sub-400 response, so **no error
> path in MedRail can consume a settled payment** — and consent-denied calls (HTTP 403) are **not
> charged**, contrary to `API.md`, `SECURITY.md`, and the `paidButDenied` field. The audit-sequence
> race causes a **rejected transaction**, not a corrupted log. See
> [`CORRECTIONS.md`](../CORRECTIONS.md) — it supersedes any statement here that contradicts it.

**Purpose:** Define the five actors the current code actually serves, what each one touches at the level of specific endpoints and files, and what is concretely missing for each of them today.

**Status of this document:** Authored 2026-08-21 against the verified fact ledger and source at commit `32ffd73`. Personas are derived from the implemented surface, not from an imagined roadmap: if no code serves a persona, that is stated rather than filled in. No demographic, adoption, or market figure appears here — none exists in this repository.

**Scope note.** These are personas for a **TestNet demonstration**. P-2 and P-3 in particular describe roles a production system would have; in this build they are exercised by throwaway keypairs against synthetic data. Nothing here implies a real patient or clinician has used this system.

---

## Persona index

| ID | Persona | Primary surface | Priced? | Best-served today? |
|---|---|---|---|---|
| P-1 | Autonomous agent / third-party developer | `POST /v1/triage`, `POST /v1/interaction-check` | $0.02 each | **Yes** — the only fully proven path |
| P-2 | Patient granting consent from a wallet | `grant_access` / `revoke_access` direct to Algorand | Network fee only | Mostly — one hard UX gap (no real wallet) |
| P-3 | Requesting clinician / care application | `POST /v1/records/summary` | $0.05 | **No** — success path never executed on-chain; gate defeated by S-1 |
| P-4 | MedRail operator | Deploy, config, `OPERATOR_MNEMONIC`, `log_access` | — | **No** — no observability, no rate limiting, single hot key |
| P-5 | Hackathon judge | `docs/`, the web demo, the public indexer | — | Well, for the two proven legs; blocked by DOC-1 |

---

## P-1 — Autonomous agent / third-party developer

**Role.** A program (or the developer integrating one) that needs a clinical-intelligence result at runtime and has no relationship with MedRail. Concretely: another challenge entrant's orchestrator agent, a triage bot, or a script.

**Goals**

1. Discover what an endpoint costs and how to pay it, from the endpoint itself, without reading documentation.
2. Pay for exactly one call, with no account, no API key, no contract, no minimum.
3. Receive a machine-parseable result and a verifiable receipt for the money spent.
4. Fail loudly and recoverably when something is wrong.

**Pain points MedRail addresses**

| Pain | How | Requirement | Status |
|---|---|---|---|
| No way to learn the price programmatically | Unpaid call returns `402` with a `PAYMENT-REQUIRED` header carrying scheme, network, amount, asset, `payTo`, `maxTimeoutSeconds` | FR-001, FR-002 | **VALIDATED** |
| No way to pay without an account | x402 v2 `exact` scheme settled through the GoPlausible facilitator; no registration anywhere in the flow | FR-003 | **VALIDATED** (tx `OYRQRKYA…`) |
| Must hold the chain's native token for fees | Facilitator supplies `extra.feePayer` — the caller needs USDC but not ALGO (ledger §4) | — | Facilitator feature, not MedRail's |
| Cannot audit what it bought | `PAYMENT-RESPONSE` carries the settled transaction, confirmable on any public indexer | FR-003 | **VALIDATED** |
| Opaque decision logic | Both engines are pure functions over static tables, readable in one screen | AI-001, NFR-009 | **VALIDATED** |

**Technical proficiency.** High. Comfortable with HTTP semantics, an x402 client SDK (`@x402/fetch` or equivalent), an Algorand account, and an ASA opt-in. Will not read a PDF or fill in a form.

**What they touch**

| Surface | Evidence |
|---|---|
| `POST /v1/triage` — $0.02 (20000 µUSDC) | `api/src/routes/triage.ts:11-18` → `api/src/services/triageScorer.ts:53-73` |
| `POST /v1/interaction-check` — $0.02 | `api/src/routes/interaction.ts:11-18` → `api/src/services/interactionChecker.ts:36-55` |
| The 402 challenge and settlement path | `api/src/x402.ts:11-32`; price declarations at `api/src/app.ts:37-50` |
| `GET /` — free service index | `api/src/app.ts:71-84` |
| `GET /v1/health` — free liveness, network, App ID | `api/src/routes/health.ts:6-14` |
| CORS: `origin: "*"`, `exposeHeaders: PAYMENT-REQUIRED, PAYMENT-RESPONSE` | `api/src/app.ts:20-33` (with a documented note on a prior preflight regression at `:25-30`) |

**What they get back**

- Triage: `{score, band, matchedFlags, disclaimer}` — bands `emergency ≥60`, `urgent ≥30`, `soon ≥10`, else `routine` (`triageScorer.ts:46-51`); score is the capped sum of the 11 red-flag group weights (`:32-44`).
- Interaction: `{flagged, matches, source, disclaimer}` over 14 curated pairs (`api/src/data/interactions.json`), severities `moderate|major|contraindicated`.
- **There is no LLM or ML model behind either.** Both are deterministic rule engines. Any integrator expecting model behaviour will be surprised — the response `disclaimer` and `source` fields say so explicitly, and tests assert their presence (AI-002, AI-004 **VALIDATED**).

**What is missing for this persona**

| Gap | Impact | ID |
|---|---|---|
| **No published OpenAPI/JSON-schema spec.** `docs/API.md` is hand-written; no machine-readable contract exists in the repository. | Integration requires reading prose. | — |
| **No discovery listing.** Bazaar registration and the `x402-global-challenge` tag are pending operator action. `@x402/extensions` is declared in `api/package.json` but **imported nowhere in `api/src`** (DOC-9). | The endpoint cannot be found by an agent that does not already know its URL. | **PARTIALLY IMPLEMENTED** |
| **No public URL.** No hosting is deployed; `api/fly.toml` would produce a broken service (D-1, D-2). | Nothing to call. | **NOT IMPLEMENTED** |
| **Facilitator outage returns HTTP 500 with no `PAYMENT-REQUIRED`, no `Retry-After`.** | An agent cannot distinguish "pay me" from "I am broken" and has nothing to back off against. Free routes stay up (REL-005 **VALIDATED**). | REL-001 **NOT IMPLEMENTED** (R-1) |
| **No rate limiting and therefore no documented quota.** | No contract about fair use in either direction. | SEC-013 **NOT IMPLEMENTED** |
| **Unanchored substring matching on medication names.** `m.includes(a) \|\| a.includes(m)` (`interactionChecker.ts:42-43`) means a one- or two-character name matches many table entries. | Silent false positives on short or malformed input; the existing test passes `["a","b"]` and asserts only the disclaimer. | AI-006 **NOT IMPLEMENTED** |
| **No idempotency key or retry token.** | A network failure after settlement is unrecoverable for the caller. | REL-002 **NOT IMPLEMENTED** (R-2) |

---

## P-2 — Patient granting consent from a wallet

**Role.** The subject of the record. The only party who can create or withdraw a grant: `grant_access` and `revoke_access` both take `Txn.sender` as the patient identity (`contract.py:148-195`), so no one can grant on their behalf.

**Goals**

1. Grant one named requester one named scope, optionally time-limited.
2. Revoke it unilaterally and observe that it took effect.
3. Never hand a private key to a service.
4. See who accessed what.

**Pain points MedRail addresses**

| Pain | How | Requirement | Status |
|---|---|---|---|
| Consent lives in someone else's system | A box on App `768743428`, keyed `sha256(patient‖requester‖scope)` | DATA-001 | **VALIDATED** |
| Revocation is a request to a custodian | The patient signs `revoke_access` directly; nobody mediates | FR-020, SEC-003 | **VALIDATED** (tx `OV2J2T5V…`) |
| The requester must be onboarded first | Box storage, not local state — neither party opts in to the app (rationale at `contract.py:11-17`) | — | **IMPLEMENTED** |
| Permission outlives intent | `duration_seconds > 0` sets `expires_at`; `check_access` enforces it | FR-019, FR-023 | **VALIDATED** |
| Backend holds the key | It does not, and there is no code path by which it could | NFR-008, FR-035 | **IMPLEMENTED** |

**Technical proficiency.** In this build: whatever a browser demand. `web/components/ConsentChecker.tsx` reduces the whole lifecycle to three buttons — *Grant myself access*, *Revoke*, *Check status* — using a keypair the browser generated. In a real deployment, this persona would need a wallet, which does not exist here (see gaps).

**What they touch**

| Surface | Evidence |
|---|---|
| `grant_access(requester, scope, duration_seconds)` signed client-side | `web/lib/consent.ts:44-68` |
| `revoke_access(requester, scope)` signed client-side | `web/lib/consent.ts:70-89` |
| `GET /v1/consent/status?patient=&requester=&scope=` — free read-back | `api/src/routes/consent.ts:19-31`; called via `web/lib/api.ts:getConsentStatus` |
| Demo keypair generation and storage | `web/lib/demoWallet.ts:13-27` |
| App ID discovery before signing | `web/lib/consent.ts:36-41` → `GET /v1/consent/app-info` (`api/src/routes/consent.ts:33-40`) |
| Box MBR is paid by the app account, not the patient | `contract.py:129-138` (`fund_mbr`); the app account holds 5,000,000 µALGO |

**What is missing for this persona**

| Gap | Impact | ID |
|---|---|---|
| **No real wallet integration.** `web/lib/demoWallet.ts:12` points at `lib/walletConnect.ts` — **that file does not exist**, and `docs/IMPLEMENTATION_PLAN.md` §4 states the production wallet path "is also implemented." **It is not.** There is no Pera/Defly/WalletConnect code anywhere in `web/`. | This persona cannot participate outside the demo. This is the one place an otherwise scrupulous document overclaims (DOC-4). | **NOT IMPLEMENTED** |
| **Demo mnemonic stored as plaintext JSON in `sessionStorage`** under `medrail-demo-wallet-v1` (`web/lib/demoWallet.ts:3`, `:25`). | Any XSS on the demo page exfiltrates the key. Bounded to TestNet play money and disclosed in the UI, but the pattern is unsafe. | — |
| **The UI only supports self-granting.** `ConsentChecker.tsx:32` calls `grantAccessOnChain(wallet, wallet.address, SCOPE, 0)` — patient and requester are the same address, and duration is hard-coded to 0 (never expires). | The expiry feature (FR-019, **VALIDATED** in the contract) is unreachable from the UI, and the two-party flow cannot be demonstrated in the browser. | — |
| **No audit view.** `get_audit_count` and `get_audit_entry` exist on-chain (FR-028 **VALIDATED**) and `getAuditCount` exists in the backend (`api/src/services/algorand.ts:103-121`), but **no endpoint and no UI exposes them**, and `total_audit_entries == 0` on the deployed app, so there is nothing to show. | The "see who accessed your data" promise has no surface and no data. | FR-025 **UNVALIDATED on-chain** |
| **`request_access` emits a defective event.** `contract.py:146` passes `Txn.sender` (the requester) into the `patient` field and `patient` into the `requester` field. Any indexer consuming these ARC-28 events reads inverted data. | A patient notified by an event-driven consumer would be told the wrong parties. No on-chain state is corrupted. | Defect C-1 — FR-024 **PARTIALLY IMPLEMENTED**; MEDIUM |
| **No way to see or manage all standing grants.** There is no enumeration method on the contract and no aggregate view. | The patient can check one triple at a time and only if they remember it. | — |

---

## P-3 — Requesting clinician or care application

**Role.** The party that has been granted a scope and wants to read under it. In this build, whoever sends `{patientId, requesterAddress}` to `POST /v1/records/summary` and pays $0.05.

**Goals**

1. Get an authoritative "am I allowed?" answer without integrating bilaterally with a custodian.
2. Retrieve the record summary when allowed.
3. Have the access recorded so the authorisation is defensible later.
4. Get a clear, non-ambiguous refusal when not allowed.

**Pain points MedRail intends to address**

| Pain | Mechanism | Requirement | Status |
|---|---|---|---|
| Authorisation requires a bilateral integration | `check_access` read live from the contract, per request | FR-010 | **UNVALIDATED** |
| The check is expensive or slow | `readonly=True` executed via `AtomicTransactionComposer.simulate()` — zero fee, nothing submitted | SEC-009 | **IMPLEMENTED** |
| Access leaves no defensible record | `log_access` appends an immutable per-patient sequenced entry, returning `auditTxId` and `auditSequence` | FR-012, FR-025 | **UNVALIDATED on-chain** |
| Refusals are ambiguous | `403` with `paidButDenied: true` and an explicit message | FR-011 | **UNVALIDATED** |

**Technical proficiency.** High — must run an x402 client and hold funded USDC. There is no human-facing UI for this persona other than the demo panel, which sends `requesterAddress: wallet.address` (`web/components/LiveDemoPanel.tsx:38`) and therefore only exercises the self-grant case.

**What they touch**

| Surface | Evidence |
|---|---|
| `POST /v1/records/summary` — $0.05, x402 **and** consent | `api/src/routes/records.ts:25-61`; price at `api/src/app.ts:43-46` |
| Consent evaluation | `api/src/routes/records.ts:32` → `checkAccess` (`api/src/services/algorand.ts:82-100`) |
| Audit append on the allowed path | `api/src/routes/records.ts:49` → `logAccess` (`api/src/services/algorand.ts:146-179`) |
| `GET /v1/consent/status` — free pre-flight check before paying | `api/src/routes/consent.ts:19-31` |
| `GET /v1/consent/arc56` — the compiled ARC-56 spec, so a third party can build its own ABI calls without this repository | `api/src/app.ts:63-69`; FR-015 **IMPLEMENTED** |

**What is missing for this persona — this is the least-served persona in the system**

| Gap | Impact | ID |
|---|---|---|
| **The success path has never executed on-chain.** `total_audit_entries == 0` on App `768743428`; zero `s`- or `a`-prefixed boxes exist. `docs/PROOF.md` §6 proves a payment against `/v1/triage` only. | The flagship endpoint's happy path is unproven on real infrastructure. `auditTxId` / `auditSequence`, documented in `docs/API.md`, have never been produced by a real run. | **UNVALIDATED on-chain** (E-1) |
| **The gate is not an access control.** `requesterAddress` is read from the request body (`api/src/routes/records.ts:5-8`) and never bound to the payer. Grants are public on Algorand, so an attacker can enumerate `(patient, requester)` pairs from the app's own transaction history, pay the ordinary $0.05, and be admitted. | Any paying stranger can impersonate any authorised requester. Second-order: a **false attribution** is written into the immutable audit trail. | SEC-006 **PARTIALLY IMPLEMENTED — DEFEATED BY S-1**; SEC-007, SEC-008, FR-039 **NOT IMPLEMENTED** |
| **Zero test coverage on this route.** No test exists for `api/src/routes/records.ts`, and none for `api/src/services/algorand.ts` — the highest-risk module in the repository. | Every behaviour above is asserted only by reading the code. | Ledger §9 |
| **A settled payment can be lost.** `logAccess` on the allowed path is awaited without a catch (`records.ts:49`), unlike the denied path (`:37`). Operator out of ALGO, app account out of box MBR, algod 5xx, or validity-window expiry ⇒ HTTP 500 *after* settlement, with no refund and no retry token. | The caller pays $0.05 and receives nothing. | REL-002 **NOT IMPLEMENTED** (R-2) |
| **A malformed-but-58-character address returns 500.** zod validates length only; `algosdk.decodeAddress` throws inside `grantBoxName` and `app.onError` returns `err.message` verbatim. Reproduced: `{"error":"wrong checksum for address"}`. | A client error is reported as a server error, and internal exception text leaks to unauthenticated callers. | SEC-010, SEC-011 **NOT IMPLEMENTED** (R-3) |
| **The payload is a fixed constant.** `SYNTHETIC_RECORD` (`records.ts:15-21`) is returned regardless of `patientId`. | There is no record retrieval to evaluate. Honestly disclosed in `docs/SECURITY.md`. | DATA-004 **IMPLEMENTED** (by design) |
| **No scope vocabulary.** `SCOPE` is hard-coded to `"records:summary"` (`records.ts:10`). The contract accepts free-form strings (DATA-003), but nothing negotiates or publishes them. | A requester cannot discover what scopes exist. | — |

---

## P-4 — MedRail operator

**Role.** Whoever runs `medrail-api` and holds `OPERATOR_MNEMONIC` — which is simultaneously the contract `admin` (set at `create`, `contract.py:118-121`).

**Goals**

1. Run the resource server so paid calls settle and audit entries are written.
2. Keep the app account funded for box MBR.
3. Rotate the admin key without redeploying.
4. Know when something is broken before a caller does.

**Authority this persona holds — worth stating explicitly**

The admin key can: write arbitrary audit entries (`log_access`, `contract.py:217-236`, admin-gated), rotate the admin to any address (`set_admin`, `:123-127`), and move ALGO out of the app account (`withdraw_excess`, `:254-259`, via an inner `itxn.Payment(fee=0)`). Both admin gates are unit-tested for rejection (SEC-001, SEC-002 **VALIDATED**), but the key itself is a single hot mnemonic in an environment variable, with no multisig, no HSM, no rotation policy, and no rotation runbook (SEC-012 **NOT IMPLEMENTED**; acknowledged in [`../SECURITY.md`](../SECURITY.md)).

**Technical proficiency.** Expert. Runs Node 20 and Python 3.12, manages mnemonics, reads an indexer.

**What they touch**

| Surface | Evidence |
|---|---|
| Configuration — `NETWORK`, `PORT`, `FACILITATOR_URL`, `PAY_TO_ADDRESS`, `CONSENT_APP_ID`, `OPERATOR_MNEMONIC`, `OPERATOR_ADDRESS` | `api/src/config.ts:42-59`; `api/.env.example` |
| Deployment / funding | `contracts/scripts/deploy_testnet.py` (idempotent; funds the app account on create only, `:108-126`) |
| Live lifecycle exercise | `contracts/scripts/exercise_contract.py` |
| USDC opt-in | `contracts/scripts/opt_in_usdc.py` — every Algorand account must opt in to an ASA before it can receive it |
| Payment proof | `api/scripts/e2e-proof.ts` → `contracts/artifacts/e2e-proof.json` (FR-040 **IMPLEMENTED**, not run in CI) |
| Liveness | `GET /v1/health` (`api/src/routes/health.ts`) |
| Containers | `api/Dockerfile` (2-stage, `node:20-slim`, build context = repo root), `api/fly.toml`, `web/Dockerfile` |

**What is missing for this persona**

| Gap | Impact | ID |
|---|---|---|
| **`fly deploy` today produces a broken service.** `api/fly.toml` hard-codes `NETWORK = "mainnet"` where no `MedRailConsent` deployment exists (D-2), and does not set `CONSENT_APP_ID`; `contracts/artifacts/deploy_testnet.json` is **not copied into the image**, so the `readDeployedAppId` fallback (`api/src/config.ts:31-40`) finds nothing and `requireConsentAppId()` throws ⇒ `/v1/records/summary` and `/v1/consent/status` return 500 (D-1). | The committed production config is broken by default. | Both **HIGH** |
| **CI has never run.** `.github/workflows/ci.yml` triggers on `push: branches: [main]`; the repository's only branch is `master`. All three jobs pass locally (ledger §18) — the code is not failing; the trigger is wrong. | The green-badge assumption is false. | OPS-006 **PARTIALLY IMPLEMENTED** (CI-1, HIGH) |
| **No observability of any kind.** Only `console.log` at boot and `console.error(err)` in the error handler. No structured logs, request IDs, metrics, traces, or alerts. | An operator learns about failure from a caller. Notably: no alert on operator-account ALGO balance or app-account MBR headroom, both of which silently break `log_access`. | OPS-002…OPS-005 **NOT IMPLEMENTED** |
| **`/v1/health` is not wired to any probe.** Neither Dockerfile nor `fly.toml` declares a healthcheck. | The one operability primitive that exists is unused. | OPS-001 (D-6) |
| **The advertised per-box MBR is wrong.** `GRANT_BOX_MBR = 2_500 + 400 * (32 + 17)` = 22,100 µALGO (`contract.py:52`), but the BoxMap's 1-byte `key_prefix="g"` makes the effective key 33 bytes ⇒ 22,500. Verified on-chain: app account min-balance 145,000 with 2 boxes ⇒ 145,000 − 100,000 = 45,000 = 2 × 22,500. An operator sizing `fund_mbr` from `get_grant_box_mbr()` under-funds by ~1.8%. | Small magnitude, but it is an incorrect value exposed as a public ABI method advertised as authoritative. Fix: `400 * (33 + 17)`. | Defect C-2 — FR-032 **IMPLEMENTED (incorrect value)**; LOW |
| **In-process locking contradicts the deployment config.** `withPatientLock` (`api/src/services/algorand.ts:129-138`) serialises audit writes per patient within one process; `api/fly.toml` sets `auto_start_machines = true` and `min_machines_running = 1` — a floor, not a ceiling. Two machines sharing one operator account reintroduce the sequence race that `docs/SECURITY.md` says is mitigated. | Silent audit-write collisions under scale. | REL-004 **PARTIALLY IMPLEMENTED** (D-7) |
| **No `.dockerignore` anywhere.** `api/Dockerfile`'s build context is the repository root, so `api/.env` and `contracts/.env` — both containing live mnemonics — enter the build context. Nothing `COPY`s them into a layer today, so no secret lands in an image, but the margin is one careless `COPY api/ ./api/`. Also ships `contracts/.venv/` and both `node_modules/` trees. | A latent secret-exposure path and slow builds. | SEC-015 **NOT IMPLEMENTED** (D-3) |
| **Builds are not reproducible.** Both Dockerfiles use `npm install`, not `npm ci`, despite committed lockfiles. | Image contents can drift from the lockfile CI validates. | NFR-007 **UNVALIDATED** (D-4) |
| **The free endpoint is an amplification vector.** `/v1/consent/status` is free, unauthenticated, and makes two outbound algod calls per request — usable to exhaust the API and to amplify traffic at AlgoNode. It also requires `OPERATOR_MNEMONIC` to be loaded, because `simulate()` still needs a sender and signer (`api/src/services/algorand.ts:8-14`, `:82-100`). | An unauthenticated route with a hard dependency on the private key and no rate limit. | SEC-013 **NOT IMPLEMENTED** |
| **No dependency scanning.** No `npm audit`, `pip-audit`, Dependabot, CodeQL, or SAST in CI. | Unknown vulnerability exposure. | SEC-014 **NOT IMPLEMENTED** |
| **`scripts/` at the repository root is empty**, although `docs/IMPLEMENTATION_PLAN.md` §7 lists it as "repo-level orchestration (setup, smoke tests)". | No smoke test exists. | DOC-6 |

---

## P-5 — Hackathon judge

**Role.** A technical reviewer with limited time and an incentive to find the seam between claim and reality.

**Goals**

1. Confirm quickly that something real was built and deployed.
2. Verify claims independently, without trusting the repository.
3. Assess whether the composition is novel or a paywall with extra steps.
4. Detect overclaiming.

**Pain points MedRail addresses well** — this is a genuine strength and should be credited.

| Pain | How | Evidence |
|---|---|---|
| Claims without evidence | Every claim in [`../PROOF.md`](../PROOF.md) carries a transaction ID, command, or path | NFR-010 **IMPLEMENTED** |
| "Deployed" that means localhost | App `768743428`, created round 66088624, `deleted: false`, checkable on any public indexer | Ledger §3 |
| Mock payments | One real `axfer`: 20000 base units of ASA `10458941`, round 66091768, `fee: 0`, note `x402-payment-v2-1786140083822` | Ledger §4 |
| Hidden shortcuts | `docs/SECURITY.md` and `docs/COMPLIANCE.md` both carry explicit "what this does not claim" sections | Existing docs |
| Unrunnable tests | One command per suite; 14 contract + 18 API, all green (0.41 s / 4.08 s) | Ledger §9, §18 |

**Technical proficiency.** Expert; will read `contract.py` (259 lines) end to end and query the indexer directly.

**What they touch**

| Surface | Where |
|---|---|
| Entry point | [`../JUDGES.md`](../JUDGES.md), [`../../README.md`](../../README.md) |
| Evidence log | [`../PROOF.md`](../PROOF.md) |
| Rule mapping | [`../COMPLIANCE.md`](../COMPLIANCE.md) |
| Design rationale | [`../ARCHITECTURE.md`](../ARCHITECTURE.md) |
| The contract | `contracts/smart_contracts/consent/contract.py` |
| Live demo | `web/app/page.tsx` — **exactly one route** (`/`), with `NetworkBadge`, `LiveDemoPanel`, `ConsentChecker`, `PricingTable` |
| Independent verification | `https://testnet-idx.algonode.cloud`, `https://lora.algokit.io/testnet/application/768743428` |

**What is missing for this persona**

| Gap | Impact | ID |
|---|---|---|
| **`docs/SENTINEL_ARCHITECTURE.md` is the single largest credibility risk in the repository.** 647 lines, untracked, describing a completely different, unbuilt product ("Sentinel Exchange" — pharma supply chain, FastAPI `engine/`, SQLite, XGBoost forecasting, contract-net auction, a second contract, five new frontend routes, SSE, Twilio). **None of it exists**, and it instructs "rewrite README around Sentinel Exchange." A judge opening `docs/` sees an architecture for a system that does not exist, adjacent to docs for one that does. | Recommended: move to `docs/future/SENTINEL_EXCHANGE_PROPOSAL.md` with a bold **PROPOSAL — NOT IMPLEMENTED** banner, or delete before submission. `docs/future/` exists and is currently empty. | DOC-1, **HIGH** |
| **Three doc-vs-reality defects a hostile reviewer will find.** DOC-4: `docs/IMPLEMENTATION_PLAN.md` §4 claims a real-wallet path "is also implemented" — it is not, and the file it points at (`web/lib/walletConnect.ts`) does not exist. DOC-9: `docs/COMPLIANCE.md` claims the backend "correctly implements Bazaar's discovery-extension schema" on the strength of a dependency that is never imported. DOC-2/DOC-3: `IMPLEMENTATION_PLAN.md` lists `puya 0.6.0` where the pin is `puyapy==5.9.0`, and calls the gated route `/v1/records/:patientId/summary` where the implementation is `POST /v1/records/summary`. | Each is individually small; together they undercut the evidence-first posture the rest of the repository earns. | DOC-2, DOC-3, DOC-4, DOC-9 |
| **The flagship endpoint's success path is unproven on-chain.** A judge checking `total_audit_entries` on App `768743428` finds **0**. | The differentiator's third leg has never run. | E-1 |
| **No frontend tests of any kind.** No Vitest, Jest, Playwright, or Cypress configuration exists in `web/`. | The demo a judge is asked to click through has zero automated coverage. | Ledger §9 |
| **`web/README.md` is unmodified `create-next-app` boilerplate** in a repository whose root README is otherwise carefully written. | An avoidable blemish. | DOC-7 |
| **`ACTION_NEEDED.md` has an unbalanced backtick** that breaks rendering. | Cosmetic. | DOC-8 |
| **CI badge assumption.** Nothing has ever run in CI. | Any inference from "there is a workflow file" is wrong. | CI-1 |

---

## Cross-persona conflicts

Worth stating because they are real design tensions, not oversights.

| Conflict | Between | How it is resolved today |
|---|---|---|
| Broad, unauthenticated reach vs. abuse control | P-1 wants no registration; P-4 needs to limit load | Resolved in P-1's favour. `origin: "*"`, no auth, no rate limiting. P-4 carries the risk. SEC-013 **NOT IMPLEMENTED**. |
| Charging for a denied lookup | P-3 pays $0.05 and may get a 403 | Deliberate and disclosed: the fee covers a real on-chain verification either way (`api/src/routes/records.ts:34-46`; `docs/SECURITY.md`). Defensible, but it means a P-3 with a stale grant pays to be told so. |
| Patient control vs. payment volume | P-2's model is inherently low-volume; the challenge scores volume | Resolved by the open/gated endpoint split — the central product decision, argued in [`../JUDGES.md`](../JUDGES.md) and analysed in [`./USP_Novelty.md`](./USP_Novelty.md). |
| Operator authority vs. patient sovereignty | P-4's admin key can write arbitrary audit entries about P-2 | Not resolved. Patient *grants* are patient-signed and cannot be forged (SEC-003 **VALIDATED**); patient *audit entries* are operator-written and can be. SEC-012 **NOT IMPLEMENTED**. |
| One-click demo vs. key hygiene | P-5 wants zero-install; P-2 needs a real wallet | Resolved in P-5's favour: plaintext mnemonic in `sessionStorage`, TestNet-only, disclosed in the UI. The real-wallet path does not exist (DOC-4). |

---

## Related documents

[`./Problem_Statement.md`](./Problem_Statement.md) · [`./Project_Vision.md`](./Project_Vision.md) · [`./User_Journey.md`](./User_Journey.md) · [`./Use_Cases.md`](./Use_Cases.md) · [`./Scope.md`](./Scope.md) · [`./USP_Novelty.md`](./USP_Novelty.md) · [`../API.md`](../API.md) · [`../SECURITY.md`](../SECURITY.md)
