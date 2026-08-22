# MedRail — Project Vision

**Purpose:** Define what MedRail is trying to become, the measurable objectives and success criteria for the Global x402 Challenge submission, and the concrete gate conditions separating demo from beta from production.

**Status of this document:** Authored 2026-08-21 against the verified fact ledger and source at commit `3b387df`. Forward-looking statements are labelled **PLANNED** or **RECOMMENDED** and are never presented as built. Every "achieved" claim carries a requirement ID and evidence. No figure in this document was invented; where a target would need a number that does not exist in this repository, the target is stated qualitatively and marked.

---

## 1. Vision

> A patient's permission over their own health data should be an object the patient controls directly, that any party can verify without asking permission from the party holding the data — and calling a health-data service should cost exactly one call's worth of money, paid by whoever makes the call, at the moment they make it.

MedRail is a demonstration that those two ideas are the same idea. Payment settlement, authorisation, and audit are three facts about one event, and there is no technical reason they must be produced by three different systems, on three different timescales, with three different trust models.

## 2. Mission (this submission)

Prove the mechanism end-to-end on public infrastructure, at the smallest honest scale, with every claim independently checkable — and disclose, without softening, everything that has not been proven.

Concretely, this submission sets out to demonstrate:

1. That a **paid HTTP call can be consumed by a stranger's agent** with no account, key, or contract (FR-001…FR-003).
2. That a **patient can grant and withdraw a specific permission by signing with their own key**, with no backend holding or proxying it (FR-018, FR-020, FR-035, NFR-008, SEC-003).
3. That an **HTTP resource server can consult that permission live, per request, for free** (FR-013, SEC-009).
4. That the same call can **append an immutable, per-patient, sequenced audit entry** (FR-025) — proven on-chain at tx `4YLKLQKKWXXFW3UT5APJVYKXI7T7A6OACTAWCC5YBAN3XGOGHRVQ`, sequence 1.
5. That the **caller's identity is recovered from the payment rather than taken on trust** (FR-039, SEC-007, SEC-008), so the consent check is an authorisation decision and not a paywall — with no account system introduced to achieve it.

## 3. Non-goals for this submission

Stated up front so they cannot be read as failures. Full treatment in [`./Scope.md`](./Scope.md) §"Out of Scope".

- Not a clinical product. Not a diagnostic. Not decision support. (AI-003 **IMPLEMENTED**; AI-005 **NOT IMPLEMENTED** and not claimed.)
- Not a record store. No datastore of any kind exists in this repository.
- Not an ML system. There is no model, no embeddings, no vector store. The intelligence layer is two deterministic rule engines (NFR-009 **VALIDATED**).
- Not compliant with any regulatory framework, and no such claim is made.
- Not the "Sentinel Exchange" system described in `docs/SENTINEL_ARCHITECTURE.md`. That is an unbuilt proposal for a different product.
- Not an Orchestrator-class x402 entry. MedRail does not itself pay other x402 endpoints, and [`../COMPLIANCE.md`](../COMPLIANCE.md) explicitly declines to claim it.

## 4. Measurable objectives

Each objective is tied to requirement IDs and to evidence that exists today. "Measured" means an artefact a third party can check without trusting this repository.

| # | Objective | Requirements | Measure | Current state |
|---|---|---|---|---|
| O-1 | An unpaid request to any priced route yields a protocol-correct x402 v2 challenge | FR-001, FR-002 | Decoded `PAYMENT-REQUIRED` matches the facilitator's `/supported`; asserted in CI-eligible tests | **VALIDATED** — `api/test/x402-flow.spec.ts` (3 cases); live capture in ledger §4 |
| O-2 | At least one real payment settles through the facilitator and is confirmable on the public indexer | FR-003 | A transaction ID resolvable at `testnet-idx.algonode.cloud` | **VALIDATED** — tx `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ`, 20000 base units of ASA `10458941`, round 66091768, plus later gated-route settlements `5DKFUULW…` and `QZIQWHN5…`. The agent run now settles between **distinct payer and payee** — `UYBTLPHS…` → `2WDV2J2F…`, an independent keypair this service does not control (`DOSKCNKJ…` round 66563930, `PLBFDDAD…`, `COMJ3TQO…` round 66563944). Float seeded from the project's own wallet; not external revenue, and not volume. |
| O-3 | The full consent lifecycle executes as real transactions on a public network | FR-018, FR-020, FR-023 | Confirmed rounds for `request_access` / `grant_access` / `revoke_access` | **VALIDATED** — `5XIADMCG…`, `X2BQ5FD4…`, `OV2J2T5V…` at rounds 66088670/66088672/66088674 |
| O-4 | A live on-chain consent read is available free, unpaid, to anyone | FR-013, SEC-009 | `GET /v1/consent/status` returns `granted` from `simulate()`, submitting nothing | **IMPLEMENTED** — `api/src/routes/consent.ts:19-31`; exercised structurally by `api/test/app.spec.ts` but no test asserts the verdict itself; reviewer observed one cold call at 505 ms (single observation, **not** a benchmark) |
| O-5 | An access under a valid grant appends an immutable on-chain audit entry | FR-012, FR-025, DATA-002 | `total_audit_entries > 0` on App `768743428`; a returned `auditTxId` resolvable on the indexer | **ACHIEVED** — `total_audit_entries = 5`; first entry at tx `4YLKLQKKWXXFW3UT5APJVYKXI7T7A6OACTAWCC5YBAN3XGOGHRVQ` sequence 1, with `s`- and `a`-prefixed boxes present and the app account's MBR reconciling exactly ([`../PROOF.md`](../PROOF.md) §9) |
| O-6 | The consent decision is bound to the identity that actually paid | FR-039, SEC-007, SEC-008 | A request naming a third party's `requesterAddress` is rejected `403` | **ACHIEVED** — `api/src/x402Payer.ts` + `api/src/routes/records.ts:41-51`; verified live with both an attack and a control by `api/scripts/verify-g01-fix.ts` (`contracts/artifacts/g01-verification.json`); 6 unit cases in `api/test/x402Payer.spec.ts` |
| O-7 | Every documented claim resolves to a file path, transaction ID, or reproducible command | NFR-010 | Spot-check any claim in [`../PROOF.md`](../PROOF.md) | **IMPLEMENTED** — this is the repository's strongest existing property |
| O-8 | Contract and API verify green on every change to the default branch | OPS-006 | A CI run triggered by a push to the repository's actual branch | **IMPLEMENTED** — `.github/workflows/ci.yml` triggers on `push: branches: [main, master]` plus `workflow_dispatch`, with pip and npm caching, `npm audit --audit-level=high` on both packages, and an artifact-freshness gate (`git diff --exit-code -- contracts/artifacts/` after recompiling). The repository's branch is now `main` |
| O-9 | The submission qualifies as a Composite entry: several priced endpoints, one `payTo` | FR-101 (new, added by this document set) | Three priced routes, one address | **IMPLEMENTED** — `api/src/app.ts:58-175`; `api/src/x402.ts:26` |
| O-10 | Publicly reachable HTTPS endpoint, MainNet deployment, Bazaar listing | — | A resolvable URL; a MainNet App ID; a Bazaar entry tagged `x402-global-challenge` | **NOT ACHIEVED** — all three pending the operator's own wallet/hosting/identity, by deliberate design ([`../IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) §5). The deployment configuration is now correct (`api/fly.toml`: `NETWORK = "testnet"`, `CONSENT_APP_ID = "768743428"`, `/v1/health` check, `max_machines_running = 1`); nothing is running on it |

> **FR-101 (new, added by `docs/01_Product/`)** — All priced endpoints shall settle to a single configured `payTo` address, so the submission classifies as a Composite entry. **IMPLEMENTED**. Evidence: `api/src/app.ts:58-175` declares exactly three priced routes; `api/src/x402.ts:26` sets `payTo: config.payToAddress` for all of them; `api/src/config.ts:53` resolves that from one env var, and `assertPayToConfigured()` refuses to boot the service if it is empty or fails checksum validation.

Scored **9 of 10 achieved, 1 not achieved.** The one that is not achieved is the one the build does not control: nothing is publicly hosted, on MainNet, or listed. That ratio is the honest headline — a proven mechanism with no distribution.

## 5. Success criteria for the challenge

Split into what the build controls and what it does not. Challenge framing is per [`../COMPLIANCE.md`](../COMPLIANCE.md); the official rules were **not independently re-verified** in this review.

### 5.1 Criteria the build controls

| Criterion | Requirements | Met? |
|---|---|---|
| Real, working x402 integration against the designated facilitator, not a mock | FR-001…FR-003, NFR-002 | **Yes** — **VALIDATED** |
| At least one confirmed real payment | FR-003 | **Yes** on TestNet — **VALIDATED**. Several: the earliest were self-to-self, and the agent run pays from an independent keypair the service does not control (`UYBTLPHS…` → `2WDV2J2F…`, sender ≠ receiver on the indexer). That payer's float came from the project's own wallet, so none of it is external revenue. |
| A deployed, non-deleted smart contract on a public Algorand network | FR-018…FR-029 | **Yes** — App `768743428`, created round 66088624, `deleted: false`, and the deployed approval program is byte-identical to the compilation of the committed TEAL (algod compile hash `W4TMZHJOL7FIN5GIGJCWNB2HVI4C4WGVRDVY6BMUUOMWRFHMBJVSPZZ33U`) |
| A genuinely new composition, not a paywall bolted onto a free service | FR-010, FR-012 | **Yes** — all three legs execute in one call and are proven on TestNet; the composition's central attack has been executed against the live service and rejected. What is unproven is adoption, not mechanism |
| Technical execution: strict typecheck, green tests, reproducible builds | NFR-005 | **Yes** — 121/121 tests pass (28 contract + 93 API), both typechecks clean, both builds pass, both packages report 0 npm vulnerabilities. Both Dockerfiles now use `npm ci` against committed lockfiles and `.dockerignore` files exist at the repo root and in `web/`. Images are still **not built by CI** (NFR-007 **UNVALIDATED**) |
| Honest, evidence-linked documentation | NFR-010 | **Yes**, with two known doc-vs-reality defects still to correct: DOC-1 (`SENTINEL_ARCHITECTURE.md` is untracked, 647 lines, and describes a different unbuilt product) and DOC-4 (a non-existent `lib/walletConnect.ts` is referenced as implemented). DOC-9 stands as stated: `@x402/extensions` is declared in `api/package.json` and imported nowhere in `api/src` |

### 5.2 Criteria the build does not control

Deliberate boundaries, not omissions ([`../IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) §5): MainNet deployment, public hosting, and the Bazaar listing are actions taken under the operator's own identity with the operator's own funds.

| Criterion | Blocking action | Blocking defect to fix first |
|---|---|---|
| MainNet contract deployment | Operator runs `NETWORK=mainnet scripts/deploy_testnet.py` with a funded wallet | — |
| Public HTTPS endpoint | Operator provisions hosting | None blocking. `api/fly.toml` now sets `NETWORK = "testnet"`, `CONSENT_APP_ID = "768743428"`, a `/v1/health` check, and `max_machines_running = 1` (deliberate — the in-process audit lock, G-11). Both Dockerfiles use `npm ci`; `.dockerignore` files exist at the repo root and in `web/`. The configuration is correct and unused |
| Bazaar listing + `x402-global-challenge` tag | Operator submits through Bazaar's UI | **DOC-9** — the "implements the discovery extension" claim is **PARTIALLY IMPLEMENTED**; route metadata is well-shaped (`GET /` advertises all eight routes with `method`, `path`, `price`, `gate`, plus `contract` and `x402` blocks) but `@x402/extensions` is never imported |
| Leaderboard placement | Follows automatically from the above | Payment volume requires real third-party callers. Settlements are now genuinely account-to-account (`UYBTLPHS…` → `2WDV2J2F…`), but the payer's float was seeded from the project's own wallet and no external party has paid |

### 5.3 What would falsify the submission's central claim

A reviewer should be able to state the conditions under which the pitch fails. They are:

1. **`total_audit_entries` remains 0.** The differentiator is a composition of three legs; if one never executes on the network it claims, the claim is a design document. *Not falsified — `total_audit_entries = 5`, first entry at tx `4YLKLQKK…` sequence 1.*
2. **The consent gate admits any paying stranger.** If it does, "patient-controlled access" describes the registry, not the system. *Not falsified — `api/scripts/verify-g01-fix.ts` runs the attack against the live service and gets a 403, and runs a matched control and gets a 200.*
3. **Priced routes cannot degrade gracefully when the facilitator is down.** The asset id and `feePayer` come from the facilitator's `/supported`, so the 402 cannot be constructed offline. *Not falsified — the condition is classified as a 503 with `Retry-After: 30` and a `PAYMENT_FACILITATOR_UNAVAILABLE` code (`api/src/app.ts:73-105`), and free routes stay up.*

**The condition that would still falsify it, and does today:** none of the above is worth anything if nobody but the author ever calls it. Payments do settle between independent accounts — the agent pays from its own keypair, which this service does not control — but that agent's TestNet float was seeded from the project's own wallet, because TestNet USDC has no other practical source, so **no external or unrelated party has paid for this service**. Every audit entry was written by this project's own scripts, and there is no public endpoint, MainNet deployment, or Bazaar listing. The mechanism is demonstrated; the demand is not.

## 6. Maturity ladder

Three rungs. Each lists its **entry gate** (what must be true to claim the rung) and its **exit work** (what the next rung requires). Nothing beyond Rung 1 exists.

### Rung 1 — Demo *(current rung; satisfied)*

*The mechanism is real on a public test network, and every claim is checkable.*

| Gate condition | Status |
|---|---|
| Contract deployed, non-deleted, on a public network | **Met** — App `768743428`, and the deployed bytecode is verified byte-identical to the compilation of the committed TEAL |
| Consent lifecycle proven with real transactions | **Met** — FR-018/FR-020/FR-023, three tx IDs |
| At least one real settled x402 payment | **Met** — FR-003, several; the agent run settles between independent accounts (`UYBTLPHS…` → `2WDV2J2F…`), with the payer's float seeded from the project's own wallet |
| All automated tests green; both typechecks clean; both builds pass | **Met** — 28 contract + 93 API = **121 tests** |
| CI actually runs on the repository's default branch | **Met** — triggers on `main` and `master` plus `workflow_dispatch`, with dependency caching, `npm audit --audit-level=high`, and an artifact-freshness gate |
| The audit-append path proven on-chain at least once | **Met** — `total_audit_entries = 5`, first entry at tx `4YLKLQKK…` (O-5) |
| The consent gate binds payer to requester | **Met** — `api/src/x402Payer.ts`, verified live with an attack and a control (O-6) |
| Documentation contains no unbuilt-product artefact presented as built | **Not met** — DOC-1: `docs/SENTINEL_ARCHITECTURE.md` is untracked, 647 lines, and describes a different system |

**Exit work for Rung 1 → 2:** relocate or banner `SENTINEL_ARCHITECTURE.md`; correct DOC-4 (`web/lib/walletConnect.ts` is referenced as implemented and does not exist) and DOC-9; redeploy the contract once the App-ID cost is acceptable, to land the C-1 and C-2 source fixes on-chain; and close the Rung 2 requirements below that remain open — direct test coverage for `api/src/services/algorand.ts` (G-05), observability (G-15), and explicit timeouts and bounded retries on algod I/O (REL-003).

### Rung 2 — Beta

*Real third parties can call it, against real money, without the operator present — and a failure costs someone something recoverable.*

| Requirement to enter Rung 2 | ID | Current |
|---|---|---|
| Payer identity cryptographically bound to `requesterAddress` | SEC-007, FR-039 | **VALIDATED** — `api/src/x402Payer.ts`; `records.ts:41-51`; 6 unit cases plus a live attack-and-control run |
| Address inputs validated by checksum, not length | SEC-010 | **IMPLEMENTED** — `api/src/validation.ts` wraps `algosdk.isValidAddress`; a malformed 58-character address is a **400**, asserted by `api/test/app.spec.ts` |
| Internal exception messages not returned to callers | SEC-011 | **IMPLEMENTED** — `api/src/app.ts:113-139` logs server-side against a generated `requestId` and returns a generic `INTERNAL_ERROR` body |
| Rate limiting on free endpoints | SEC-013 | **IMPLEMENTED** — fixed-window, in-memory: `/v1/consent/status` 60/min, `/v1/consent/arc56` and `/v1/records/summary` 30/min, **429** with `Retry-After`. In-memory means per-instance behind more than one machine, and the client key is a spoofable `X-Forwarded-For` — a courtesy guard, not a security boundary |
| A settled payment is never consumed without delivery or a recoverable record | REL-002 | **VALIDATED — satisfied by the SDK.** `@x402/hono` reaches `processSettlement` only on a status below 400; any throw or 4xx/5xx cancels the payment first. Structurally unreachable, so there is nothing for MedRail to implement. Credited as an inherited strength of x402 v2 |
| Facilitator outage degrades to `503` + `Retry-After`, not `500` | REL-001 | **IMPLEMENTED** — `api/src/app.ts:73-105` |
| Explicit timeout and bounded retry on all algod I/O | REL-003 | **NOT IMPLEMENTED** — `new algosdk.Algodv2("", config.algodServer, "")` sets neither |
| Cross-implementation test proving the three box-key derivations agree | NFR-011 | **VALIDATED** — one shared golden-vector fixture, `api/test/fixtures/box-key-vectors.json`, asserted by `api/test/boxKeyParity.spec.ts` (Node and browser `crypto.subtle`) and `contracts/tests/test_box_keys.py` (Python) |
| Container images build in CI and are proven to boot | NFR-007 | **UNVALIDATED** — still never built by CI. `npm ci` is now used in both Dockerfiles and `.dockerignore` files exist at the repo root and in `web/` |
| Dependency vulnerability scanning on every change | SEC-014 | **IMPLEMENTED** — `npm audit --audit-level=high` on both packages in CI; both currently report **0 vulnerabilities** |
| Structured logging with correlation IDs | OPS-002 | **PARTIALLY IMPLEMENTED** — structured JSON error logs with a generated `requestId`, plus `facilitator_unavailable` and `audit_write_failed` events. No correlation across requests, and nothing consumes the output (G-15) |
| A healthcheck wired to the existing `/v1/health` | OPS-001 | **IMPLEMENTED** — `api/fly.toml` defines a `/v1/health` check |
| Metrics, tracing, and alerting | OPS-003, OPS-004 | **NOT IMPLEMENTED** — G-15, the largest remaining operability gap |
| Direct test coverage for the chain client | — | **NOT IMPLEMENTED** — `api/src/services/algorand.ts` has no dedicated unit-test file (G-05) |

### Rung 3 — Production

*Real patients, real records, real regulatory exposure.* Nothing in this repository approaches this rung, and this document does not claim a path is designed — only that these are the obvious preconditions. All **RECOMMENDED**.

| Requirement | ID | Note |
|---|---|---|
| Real clinical payloads held encrypted off-chain with on-chain content-address pointers | DATA-006 **PLANNED** | No encryption pipeline exists. The box design anticipates it; that is design intent, not implementation. |
| Operator/admin key protected commensurate with its authority | SEC-012 **NOT IMPLEMENTED** | Today one hot mnemonic in an env var can forge audit entries, rotate `set_admin`, and drain the app account. Multisig or hardware backing, plus a rotation runbook, would be the minimum. |
| Audit sequencing safe under horizontal scale | REL-004 **PARTIALLY IMPLEMENTED** | `withPatientLock` is in-process only (`api/src/services/algorand.ts:129-138`), and `api/fly.toml` now sets `max_machines_running = 1` to match — the configuration is honest about the constraint rather than removing it (G-11). The failure mode if it were violated is a **rejected transaction**, not a corrupted log: availability, not integrity. Moving sequence assignment fully on-chain removes the class of bug and lifts the one-machine ceiling. |
| Real identity binding: address ↔ person, clinician credentialing | — | No mechanism exists, planned or otherwise. The payer binding proves control of a keypair (O-6); nothing connects that keypair to a person or a licence. This is the largest unaddressed gap for any real deployment. |
| Latency, throughput and error-budget targets, measured | PERF-002, PERF-003 **NOT IMPLEMENTED** | **No performance target, benchmark, or load test exists anywhere in this repository.** The only measurements that exist are two single-sample observations and two test-suite durations (ledger §12). No p50/p95/p99 figure exists and none may be quoted. |
| RPO / RTO defined | OPS-008 **NOT IMPLEMENTED** | Never established. Not invented here. |
| Regulatory programme | — | No HIPAA/GDPR/SOC 2/ISO work has been done. Any such claim would be false. |
| Clinical validation of the intelligence layer, or its removal | AI-005 **NOT IMPLEMENTED** | Either measure the rules against a labelled dataset or replace them. AI-008 notes the layer is swappable by construction — both services are pure functions behind a route boundary. |

## 7. Guiding principles

These are observable in the code, not aspirational.

| Principle | Where it is visible |
|---|---|
| **Evidence or silence.** A claim without a transaction ID, file path, or command is not made. | [`../PROOF.md`](../PROOF.md); NFR-010 |
| **The patient's key never leaves the patient.** | `web/lib/consent.ts:44-89`; no key-ingress path in `api/src`; NFR-008 |
| **Nothing sensitive on the ledger.** Only an address, a sha256 key, a status byte, two timestamps, and constant strings. | SEC-004; AI-007; `contract.py:217-236` |
| **Reads are free and submit nothing.** `readonly=True` methods run through `simulate()`. | SEC-009; `api/src/services/algorand.ts:98`, `:119` |
| **Disclaimers are correctness properties, not decoration.** Asserted by tests. | AI-002 **VALIDATED**; `triageScorer.ts:18-21`, `interactionChecker.ts:20-23` |
| **Transparent over clever.** The decision rules are 11 keyword groups and 14 pairs, readable in one screen. No opaque model in the decision path. | AI-001 **VALIDATED** |
| **Configuration, not code, selects the network.** | NFR-012; `api/src/config.ts:8-29` |
| **Concede the flaw in the same breath as the claim.** | This document; [`../SECURITY.md`](../SECURITY.md); [`./USP_Novelty.md`](./USP_Novelty.md) |

## 8. Related documents

[`./Problem_Statement.md`](./Problem_Statement.md) · [`./User_Personas.md`](./User_Personas.md) · [`./User_Journey.md`](./User_Journey.md) · [`./Use_Cases.md`](./Use_Cases.md) · [`./Scope.md`](./Scope.md) · [`./Competitive_Analysis.md`](./Competitive_Analysis.md) · [`./USP_Novelty.md`](./USP_Novelty.md) · [`../ARCHITECTURE.md`](../ARCHITECTURE.md) · [`../PROOF.md`](../PROOF.md) · [`../SECURITY.md`](../SECURITY.md) · [`../COMPLIANCE.md`](../COMPLIANCE.md)
