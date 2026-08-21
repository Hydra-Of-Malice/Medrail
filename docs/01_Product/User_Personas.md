# MedRail — User Personas

**Purpose:** Define the five actors the current code actually serves, what each one touches at the level of specific endpoints and files, and what is concretely missing for each of them today.

**Status of this document:** Authored 2026-08-21 against the verified fact ledger and source at commit `3b387df`. Personas are derived from the implemented surface, not from an imagined roadmap: if no code serves a persona, that is stated rather than filled in. No demographic, adoption, or market figure appears here — none exists in this repository.

**Scope note.** These are personas for a **TestNet demonstration**. P-2 and P-3 in particular describe roles a production system would have; in this build they are exercised by throwaway keypairs against synthetic data. Nothing here implies a real patient or clinician has used this system.

---

## Persona index

| ID | Persona | Primary surface | Priced? | Best-served today? |
|---|---|---|---|---|
| P-1 | Autonomous agent / third-party developer | `POST /v1/triage`, `POST /v1/interaction-check` | $0.02 each | **Yes** — proven end to end, but with nothing publicly hosted to call |
| P-2 | Patient granting consent from a wallet | `grant_access` / `revoke_access` direct to Algorand | Network fee only | Mostly — two hard gaps (no real wallet, no audit view) |
| P-3 | Requesting clinician / care application | `POST /v1/records/summary` | $0.05 | **Yes on the mechanism** — success path proven on-chain and the gate now authenticates the payer; no identity layer above the keypair |
| P-4 | MedRail operator | Deploy, config, `OPERATOR_MNEMONIC`, `log_access` | — | **No** — no observability of any kind, single hot key |
| P-5 | Hackathon judge | `docs/`, the web demo, the public indexer | — | Well, for all three legs; blocked by DOC-1 |

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
| Cannot tell "broken" from "try again" | A facilitator outage returns **503** with `Retry-After: 30` and `{"error":{"code":"PAYMENT_FACILITATOR_UNAVAILABLE","retryable":true}}`; every other failure returns a generic `INTERNAL_ERROR` with a `requestId` to quote. An agent can branch on the code and back off on the header | REL-001, SEC-011 | **IMPLEMENTED** |
| Paying for a call that then fails | Impossible. `@x402/hono` reaches settlement only on a status below 400 — a 400, 403, 429, 500 or 503 cancels the payment | REL-002 | **VALIDATED** (satisfied by the SDK) |

**Technical proficiency.** High. Comfortable with HTTP semantics, an x402 client SDK (`@x402/fetch` or equivalent), an Algorand account, and an ASA opt-in. Will not read a PDF or fill in a form.

**What they touch**

| Surface | Evidence |
|---|---|
| `POST /v1/triage` — $0.02 (20000 µUSDC) | `api/src/routes/triage.ts:11-18` → `api/src/services/triageScorer.ts:53-73` |
| `POST /v1/interaction-check` — $0.02 | `api/src/routes/interaction.ts:11-18` → `api/src/services/interactionChecker.ts:36-55` |
| The 402 challenge and settlement path | `api/src/x402.ts:11-32`; price declarations at `api/src/app.ts:50-60` |
| `GET /` — free service index listing **all eight** routes with `method`, `path`, `price`, `gate`, plus `contract` and `x402` blocks | `api/src/app.ts:149-177`; asserted against the mounted set by `api/test/app.spec.ts` |
| `GET /v1/health` — free liveness, network, App ID | `api/src/routes/health.ts:6-14` |
| CORS: `origin: "*"`, `exposeHeaders: PAYMENT-REQUIRED, PAYMENT-RESPONSE` | `api/src/app.ts:22-35` (with a documented note on a prior preflight regression at `:27-32`) |

**What they get back**

- Triage: `{score, band, matchedFlags, disclaimer}` — bands `emergency ≥60`, `urgent ≥30`, `soon ≥10`, else `routine` (`triageScorer.ts:46-51`); score is the capped sum of the 11 red-flag group weights (`:32-44`).
- Interaction: `{flagged, matches, source, disclaimer}` over 14 curated pairs (`api/src/data/interactions.json`), severities `moderate|major|contraindicated`.
- **There is no LLM or ML model behind either.** Both are deterministic rule engines. Any integrator expecting model behaviour will be surprised — the response `disclaimer` and `source` fields say so explicitly, and tests assert their presence (AI-002, AI-004 **VALIDATED**).

**What is missing for this persona**

| Gap | Impact | ID |
|---|---|---|
| **No published OpenAPI/JSON-schema spec.** `docs/API.md` is hand-written; no machine-readable contract exists in the repository. | Integration requires reading prose. | — |
| **No discovery listing.** Bazaar registration and the `x402-global-challenge` tag are pending operator action. `@x402/extensions` is declared in `api/package.json` but **imported nowhere in `api/src`** (DOC-9). | The endpoint cannot be found by an agent that does not already know its URL. | **PARTIALLY IMPLEMENTED** |
| **No public URL.** No hosting is deployed. The configuration in `api/fly.toml` is now correct and complete — it has simply never been run. | Nothing to call. This is the binding constraint for this persona. | **NOT IMPLEMENTED** |
| **No rate-limit contract published for the priced routes.** The free and refundable surface is limited (60/min on `/v1/consent/status`, 30/min on `/v1/consent/arc56` and `/v1/records/summary`, returning **429** with `Retry-After`), but the priced happy paths are deliberately unthrottled and no quota is documented for them. | An agent has a limit it can discover only by hitting it. | SEC-013 **IMPLEMENTED**, undocumented |
| **Unanchored substring matching on medication names.** `m.includes(a) \|\| a.includes(m)` (`interactionChecker.ts:42-43`) means a one- or two-character name matches many table entries. | Silent false positives on short or malformed input; the existing test passes `["a","b"]` and asserts only the disclaimer. | AI-006 **NOT IMPLEMENTED** (G-21) |
| **No idempotency key or retry token.** | A network failure *after* a 200 is unrecoverable for the caller. Note that a failure *before* the response is harmless: settlement is unreachable on any status ≥ 400, so a failed call costs the caller nothing (REL-002 **VALIDATED**). | — |

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
| **No audit view.** `get_audit_count` and `get_audit_entry` exist on-chain (FR-028 **VALIDATED**) and `getAuditCount` exists in the backend (`api/src/services/algorand.ts:103-121`), but **no endpoint and no UI exposes them**. There are now **5** entries on App `768743428` and no way for a patient to read them. | The "see who accessed your data" promise has data and no surface. This is now the largest gap for this persona. | FR-025 **VALIDATED on-chain**; the read surface is **NOT IMPLEMENTED** |
| **The deployed contract still emits a defective `AccessRequested` event.** The source has been corrected to `AccessRequested(patient, Txn.sender, scope)` with a regression test that inspects the payload, but redeploying via `OnUpdate.AppendApp` would mint a new App ID and discard the on-chain history, so the fix is deliberately not live. Any indexer consuming events from App `768743428` still reads the two parties inverted. | A patient notified by an event-driven consumer would be told the wrong parties. No on-chain state is corrupted. | C-1 / G-12 — fixed in source, redeploy deferred; MEDIUM |
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
| Authorisation requires a bilateral integration | `check_access` read live from the contract, per request | FR-010 | **VALIDATED** |
| The check is expensive or slow | `readonly=True` executed via `AtomicTransactionComposer.simulate()` — zero fee, nothing submitted | SEC-009 | **IMPLEMENTED** |
| Access leaves no defensible record | `log_access` appends an immutable per-patient sequenced entry, returning `auditTxId`, `auditSequence` and an `auditStatus` of `"recorded"` or `"pending"` | FR-012, FR-025 | **VALIDATED on-chain** (tx `4YLKLQKK…`, sequence 1) |
| Refusals are ambiguous | `403` with an explicit message, `charged: false`, and a `hint` pointing at the free pre-flight check | FR-011 | **VALIDATED** |
| Proving *which* party made the access | The audit entry names the requester recovered from the payment signature, not one supplied by the caller — so the record is defensible against the accessor as well as against the custodian | SEC-008, FR-039 | **VALIDATED** |

**Technical proficiency.** High — must run an x402 client and hold funded USDC. There is no human-facing UI for this persona other than the demo panel, which sends `requesterAddress: wallet.address` (`web/components/LiveDemoPanel.tsx:38`) and therefore only exercises the self-grant case.

**What they touch**

| Surface | Evidence |
|---|---|
| `POST /v1/records/summary` — $0.05, x402 **and** consent | `api/src/routes/records.ts`; price at `api/src/app.ts:54-57` |
| Payer identity binding | `api/src/x402Payer.ts` → `records.ts:41-51`; 403 unless the recovered payer equals the asserted `requesterAddress` |
| Consent evaluation | `api/src/routes/records.ts:53` → `checkAccess` (`api/src/services/algorand.ts:82-100`) |
| Audit append on the allowed path | `api/src/routes/records.ts:83-99` → `logAccess` (`api/src/services/algorand.ts:146-179`), wrapped in `try/catch` |
| `GET /v1/consent/status` — free pre-flight check before paying, and named in the 403 body's `hint` | `api/src/routes/consent.ts:19-31` |
| `GET /v1/consent/arc56` — the compiled ARC-56 spec, so a third party can build its own ABI calls without this repository | `api/src/app.ts:141-147`; FR-015 **IMPLEMENTED** |

**What is missing for this persona**

| Gap | Impact | ID |
|---|---|---|
| **No identity above the keypair.** The gate proves the caller controls the address the patient granted. Nothing establishes that the address belongs to a licensed clinician, a named organisation, or any real-world party at all. | For a demonstration this is the correct boundary. For anything clinical it is the blocking gap, and no design exists for it. | — |
| **No dedicated test for the chain client.** `api/src/routes/records.ts` is now covered by `api/test/x402Payer.spec.ts` (payer binding) and `api/test/app.spec.ts` (validation, rate limiting), but `api/src/services/algorand.ts` — which performs every simulate and every submit — has no unit-test file of its own. | The consent read and the audit write are asserted by live scripts and by reading the code, not by unit tests. | G-05 |
| **The payload is a fixed constant.** `SYNTHETIC_RECORD` (`records.ts:17-23`) is returned regardless of `patientId`. | There is no record retrieval to evaluate. Honestly disclosed in `docs/SECURITY.md`. | DATA-004 **IMPLEMENTED** (by design) |
| **No scope vocabulary.** `SCOPE` is hard-coded to `"records:summary"` (`records.ts:12`). The contract accepts free-form strings (DATA-003), but nothing negotiates or publishes them. | A requester cannot discover what scopes exist. | — |
| **An audit write that fails is silent to the caller's counterparty.** On the allowed path the caller is told (`auditStatus: "pending"`) and a structured `audit_write_failed` event is logged; nothing alerts an operator, and nothing tells the *patient* their trail is incomplete. | The receipt can be outstanding indefinitely with no reconciliation path. | G-15 |
| **No timeout or bounded retry on chain I/O.** `new algosdk.Algodv2("", config.algodServer, "")` sets neither. | A slow algod stretches the paid response path; `atc.execute(algod, 4)` then throws. | REL-003 **NOT IMPLEMENTED** |

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
| **Nothing is deployed.** `api/fly.toml` now sets `NETWORK = "testnet"`, `CONSENT_APP_ID = "768743428"`, a `/v1/health` check and `max_machines_running = 1`; both Dockerfiles use `npm ci`; `.dockerignore` files exist at the repository root and in `web/`. The configuration is correct and has never been run, and the images have never been built by CI. | The operator persona has a runbook and no running system. | NFR-007 **UNVALIDATED** |
| **No observability of any kind.** Structured JSON error logs with generated request IDs now exist (`api/src/app.ts:113-139`), plus `facilitator_unavailable` and `audit_write_failed` events — and **nothing consumes them**. No metrics, traces, dashboards, or alerts. | An operator still learns about failure from a caller. Notably: no alert on operator-account ALGO balance or app-account MBR headroom, either of which now degrades `log_access` **quietly** to `auditStatus: "pending"` rather than loudly to a 500. The failure got safer for the caller and harder for the operator to notice. | OPS-002 **PARTIALLY IMPLEMENTED**; OPS-003…OPS-005 **NOT IMPLEMENTED** (G-15) |
| **The deployed `get_grant_box_mbr()` under-reports by 400 µALGO per box.** The source now computes `2_500 + 400 * (33 + 17)` = 22,500 µALGO — the BoxMap's 1-byte `key_prefix="g"` counts toward the key — with a regression test verified to fail against the old constant. **App `768743428` still runs the pre-fix bytecode**, because redeploying via `OnUpdate.AppendApp` would mint a new App ID. An operator sizing `fund_mbr` from the *deployed* method under-funds by ~1.8%. | Small magnitude, and now a deployment-timing issue rather than a source defect. | C-2 / G-20 — fixed in source, redeploy deferred; LOW |
| **The audit lock pins the service to one machine.** `withPatientLock` (`api/src/services/algorand.ts:129-138`) serialises audit writes per patient within one process, so `api/fly.toml` sets `max_machines_running = 1` deliberately. The configuration is honest, and the ceiling is real: this service cannot scale horizontally until sequence assignment moves on-chain. The same constraint makes the in-memory rate limiter per-instance in principle, though with one instance that is moot today. | No horizontal scaling, no rolling deploy without a gap. | REL-004 **PARTIALLY IMPLEMENTED** (G-11) |
| **The free endpoint remains an amplification vector, now bounded.** `/v1/consent/status` is free, unauthenticated, and makes two outbound algod calls per request. It is limited to **60/min per client** (`api/src/rateLimit.ts`), but the client key comes from a spoofable `X-Forwarded-For` and the counter is in-memory. It also requires `OPERATOR_MNEMONIC` to be loaded, because `simulate()` needs a sender and signer (`api/src/services/algorand.ts:8-14`) — an unauthenticated route with a hard dependency on the private key. | Casual abuse is bounded; a determined caller is not. | SEC-013 **IMPLEMENTED** as a courtesy guard |
| **No SAST or automated dependency updates.** `npm audit --audit-level=high` runs in CI on both packages and both currently report 0 vulnerabilities, but there is no `pip-audit`, no Dependabot, no CodeQL. | Python dependencies and code-level issues are unscanned. | SEC-014 **PARTIALLY IMPLEMENTED** |
| **`scripts/` at the repository root is empty**, although `docs/IMPLEMENTATION_PLAN.md` §7 lists it as "repo-level orchestration (setup, smoke tests)". | No smoke test exists. | DOC-6 |
| **`config.indexerServer` is dead configuration.** Declared at `api/src/config.ts:51` and referenced by no module in `api/src`. | A configuration knob that does nothing, which an operator may reasonably expect to work. | G-29 |

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
| Mock payments | Real `axfer` transactions: 20000 base units of ASA `10458941` at round 66091768, `fee: 0`, note `x402-payment-v2-1786140083822`, plus $0.05 settlements on the gated route (`5DKFUULW…`, `QZIQWHN5…`) | [`../PROOF.md`](../PROOF.md) §6, §9 |
| "The differentiator is a design document" | The full composition — settle, authorise, audit — executed in one call and recorded: grant `M26NPR32…` → payment `5DKFUULW…` → audit `4YLKLQKK…` at sequence 1, with `total_audit_entries` moving 0 → 1 → 5 on the public indexer | [`../PROOF.md`](../PROOF.md) §9; `contracts/artifacts/e2e-consent-proof.json` |
| "The security fix is claimed, not tested" | `api/scripts/verify-g01-fix.ts` runs the impersonation attack against the live service (403) **and** a matched control (200), writing both to `contracts/artifacts/g01-verification.json` | [`./Use_Cases.md`](./Use_Cases.md) UC-011 |
| Hidden shortcuts | `docs/SECURITY.md` and `docs/COMPLIANCE.md` both carry explicit "what this does not claim" sections | Existing docs |
| Unrunnable tests | One command per suite; **28 contract + 45 API = 73**, all green | `contracts/tests/`, `api/test/` |

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
| **Four doc-vs-reality defects a hostile reviewer will find.** DOC-4: `docs/IMPLEMENTATION_PLAN.md` §4 claims a real-wallet path "is also implemented" — it is not, and the file it points at (`web/lib/walletConnect.ts`) does not exist. DOC-9: `docs/COMPLIANCE.md` claims the backend "correctly implements Bazaar's discovery-extension schema" on the strength of a dependency that is never imported. DOC-2/DOC-3: `IMPLEMENTATION_PLAN.md` lists `puya 0.6.0` where the pin is `puyapy==5.9.0`, and calls the gated route `/v1/records/:patientId/summary` where the implementation is `POST /v1/records/summary`. | Each is individually small; together they undercut the evidence-first posture the rest of the repository earns. | DOC-2, DOC-3, DOC-4, DOC-9 |
| **The deployed contract predates two source fixes.** A judge comparing `contract.py` to App `768743428` will find that the corrected `AccessRequested` argument order and the corrected `GRANT_BOX_MBR` are **not live**. The reason is defensible — `OnUpdate.AppendApp` mints a new App ID, which would discard the on-chain history every proof cites — but it must be stated before the judge finds it. | Source and chain disagree, deliberately. | G-12, G-20 |
| **No frontend tests of any kind.** No Vitest, Jest, Playwright, or Cypress configuration exists in `web/`. | The demo a judge is asked to click through has zero automated coverage. | — |
| **`web/README.md` is unmodified `create-next-app` boilerplate** in a repository whose root README is otherwise carefully written. | An avoidable blemish. | DOC-7 |
| **`ACTION_NEEDED.md` has an unbalanced backtick** that breaks rendering. | Cosmetic. | DOC-8 |
| **Nothing is publicly hosted, on MainNet, or listed on Bazaar**, and every settled payment is a self-payment. | A judge assessing traction rather than mechanism finds none. This is the honest headline. | — |

---

## Cross-persona conflicts

Worth stating because they are real design tensions, not oversights.

| Conflict | Between | How it is resolved today |
|---|---|---|
| Broad, unauthenticated reach vs. abuse control | P-1 wants no registration; P-4 needs to limit load | Resolved mostly in P-1's favour, with a floor under P-4. `origin: "*"` and no authentication anywhere; the free and refundable surface is capped (60/min, 30/min) while the priced happy paths are left unthrottled because they are economically self-limiting. The limiter is in-memory and keyed on a spoofable header, so P-4 still carries the residual risk. |
| Who pays for a denied lookup | P-3 wants a cheap refusal; P-4 pays a chain fee to record it | Resolved in P-3's favour, and not by design — a 403 cancels settlement, so P-3 pays nothing while P-4's operator account funds the denial audit write. Earlier documentation had this backwards. The exposure is bounded by the 30/min limit on `/v1/records/summary`, and the 403 body points P-3 at the free pre-flight check so the round trip is avoidable. |
| Patient control vs. payment volume | P-2's model is inherently low-volume; the challenge scores volume | Resolved by the open/gated endpoint split — the central product decision, argued in [`../JUDGES.md`](../JUDGES.md) and analysed in [`./USP_Novelty.md`](./USP_Novelty.md). |
| Operator authority vs. patient sovereignty | P-4's admin key can write arbitrary audit entries about P-2 | Not resolved. Patient *grants* are patient-signed and cannot be forged (SEC-003 **VALIDATED**); patient *audit entries* are operator-written and can be. SEC-012 **NOT IMPLEMENTED**. |
| One-click demo vs. key hygiene | P-5 wants zero-install; P-2 needs a real wallet | Resolved in P-5's favour: plaintext mnemonic in `sessionStorage`, TestNet-only, disclosed in the UI. The real-wallet path does not exist (DOC-4). |

---

## Related documents

[`./Problem_Statement.md`](./Problem_Statement.md) · [`./Project_Vision.md`](./Project_Vision.md) · [`./User_Journey.md`](./User_Journey.md) · [`./Use_Cases.md`](./Use_Cases.md) · [`./Scope.md`](./Scope.md) · [`./USP_Novelty.md`](./USP_Novelty.md) · [`../API.md`](../API.md) · [`../SECURITY.md`](../SECURITY.md)
