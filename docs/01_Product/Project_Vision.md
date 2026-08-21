# MedRail — Project Vision


> **⚠ Correction notice.** Parts of this document were written against a review finding that was
> later proven wrong. Settlement in x402 v2 happens **only** on a sub-400 response, so **no error
> path in MedRail can consume a settled payment** — and consent-denied calls (HTTP 403) are **not
> charged**, contrary to `API.md`, `SECURITY.md`, and the `paidButDenied` field. The audit-sequence
> race causes a **rejected transaction**, not a corrupted log. See
> [`CORRECTIONS.md`](../CORRECTIONS.md) — it supersedes any statement here that contradicts it.

**Purpose:** Define what MedRail is trying to become, the measurable objectives and success criteria for the Global x402 Challenge submission, and the concrete gate conditions separating demo from beta from production.

**Status of this document:** Authored 2026-08-21 against the verified fact ledger and source at commit `32ffd73`. Forward-looking statements are labelled **PLANNED** or **RECOMMENDED** and are never presented as built. Every "achieved" claim carries a requirement ID and evidence. No figure in this document was invented; where a target would need a number that does not exist in this repository, the target is stated qualitatively and marked.

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
4. That the same call can **append an immutable, per-patient, sequenced audit entry** (FR-025) — **this is the leg that has not been proven on-chain.**

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
| O-2 | At least one real payment settles through the facilitator and is confirmable on the public indexer | FR-003 | A transaction ID resolvable at `testnet-idx.algonode.cloud` | **VALIDATED** — tx `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ`, 20000 base units of ASA `10458941`, round 66091768. **One payment; sender == receiver.** Not volume. |
| O-3 | The full consent lifecycle executes as real transactions on a public network | FR-018, FR-020, FR-023 | Confirmed rounds for `request_access` / `grant_access` / `revoke_access` | **VALIDATED** — `5XIADMCG…`, `X2BQ5FD4…`, `OV2J2T5V…` at rounds 66088670/66088672/66088674 |
| O-4 | A live on-chain consent read is available free, unpaid, to anyone | FR-013, SEC-009 | `GET /v1/consent/status` returns `granted` from `simulate()`, submitting nothing | **IMPLEMENTED** — `api/src/routes/consent.ts:19-31`; no automated test; reviewer observed one cold call at 505 ms (single observation, **not** a benchmark) |
| O-5 | An access under a valid grant appends an immutable on-chain audit entry | FR-012, FR-025, DATA-002 | `total_audit_entries > 0` on App `768743428`; a returned `auditTxId` resolvable on the indexer | **NOT ACHIEVED** — `total_audit_entries == 0`; zero `s`/`a` boxes exist. Simulator-only coverage. |
| O-6 | The consent decision is bound to the identity that actually paid | FR-039, SEC-007, SEC-008 | A request naming a third party's `requesterAddress` is rejected `403` | **NOT ACHIEVED** — **NOT IMPLEMENTED**; finding S-1 |
| O-7 | Every documented claim resolves to a file path, transaction ID, or reproducible command | NFR-010 | Spot-check any claim in [`../PROOF.md`](../PROOF.md) | **IMPLEMENTED** — this is the repository's strongest existing property |
| O-8 | Contract and API verify green on every change to the default branch | OPS-006 | A CI run triggered by a push to the repository's actual branch | **PARTIALLY IMPLEMENTED** — all jobs pass locally (ledger §18), but `.github/workflows/ci.yml` triggers on `main` while the only branch is `master` (finding CI-1). **No push has ever triggered CI.** |
| O-9 | The submission qualifies as a Composite entry: several priced endpoints, one `payTo` | FR-101 (new, added by this document set) | Three priced routes, one address | **IMPLEMENTED** — `api/src/app.ts:37-50`; `api/src/x402.ts:26` |
| O-10 | Publicly reachable HTTPS endpoint, MainNet deployment, Bazaar listing | — | A resolvable URL; a MainNet App ID; a Bazaar entry tagged `x402-global-challenge` | **NOT ACHIEVED** — all three pending the operator's own wallet/hosting/identity, by deliberate design ([`../IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) §5) |

> **FR-101 (new, added by `docs/01_Product/`)** — All priced endpoints shall settle to a single configured `payTo` address, so the submission classifies as a Composite entry. **IMPLEMENTED**. Evidence: `api/src/app.ts:37-50` declares exactly three priced routes; `api/src/x402.ts:26` sets `payTo: config.payToAddress` for all of them; `api/src/config.ts:53` resolves that from one env var.

Scored **6 of 10 achieved, 1 partial, 3 not achieved.** That ratio is the honest headline.

## 5. Success criteria for the challenge

Split into what the build controls and what it does not. Challenge framing is per [`../COMPLIANCE.md`](../COMPLIANCE.md); the official rules were **not independently re-verified** in this review.

### 5.1 Criteria the build controls

| Criterion | Requirements | Met? |
|---|---|---|
| Real, working x402 integration against the designated facilitator, not a mock | FR-001…FR-003, NFR-002 | **Yes** — **VALIDATED** |
| At least one confirmed real payment | FR-003 | **Yes** on TestNet — **VALIDATED**. One payment, self-to-self. |
| A deployed, non-deleted smart contract on a public Algorand network | FR-018…FR-029 | **Yes** — App `768743428`, created round 66088624, `deleted: false` |
| A genuinely new composition, not a paywall bolted onto a free service | FR-010, FR-012 | **Partially** — the composition is designed and coded; leg 3 is **UNVALIDATED on-chain** and leg 2 is **DEFEATED BY S-1** |
| Technical execution: strict typecheck, green tests, reproducible builds | NFR-005, and ledger §18 | **Yes for the code** — 32/32 tests pass, both typechecks clean, both builds pass. **No** for reproducibility: Dockerfiles use `npm install`, not `npm ci` (finding D-4), and have never been built in CI (NFR-007 **UNVALIDATED**) |
| Honest, evidence-linked documentation | NFR-010 | **Yes**, with three known doc-vs-reality defects to correct: DOC-1 (`SENTINEL_ARCHITECTURE.md`), DOC-4 (a non-existent `lib/walletConnect.ts` is referenced as implemented), DOC-9 (`@x402/extensions` is declared but imported nowhere in `api/src`) |

### 5.2 Criteria the build does not control

Deliberate boundaries, not omissions ([`../IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) §5): MainNet deployment, public hosting, and the Bazaar listing are actions taken under the operator's own identity with the operator's own funds.

| Criterion | Blocking action | Blocking defect to fix first |
|---|---|---|
| MainNet contract deployment | Operator runs `NETWORK=mainnet scripts/deploy_testnet.py` with a funded wallet | — |
| Public HTTPS endpoint | Operator provisions hosting | **D-1** (`deploy_testnet.json` is not copied into the image and `fly.toml` sets no `CONSENT_APP_ID` ⇒ `/v1/records/summary` and `/v1/consent/status` 500) and **D-2** (`api/fly.toml` hard-codes `NETWORK = "mainnet"` where no contract exists). A `fly deploy` today produces a broken service. |
| Bazaar listing + `x402-global-challenge` tag | Operator submits through Bazaar's UI | **DOC-9** — the "implements the discovery extension" claim is **PARTIALLY IMPLEMENTED**; route metadata is well-shaped but `@x402/extensions` is never imported |
| Leaderboard placement | Follows automatically from the above | Payment volume requires real third-party callers; one self-payment exists |

### 5.3 What would falsify the submission's central claim

A reviewer should be able to state the conditions under which the pitch fails. They are:

1. **`total_audit_entries` remains 0.** The differentiator is a composition of three legs; one has never executed on the network it claims. *Falsified today.*
2. **S-1 stands.** If the consent gate admits any paying stranger, "patient-controlled access" is a description of the registry, not of the system. *Falsified today.*
3. **Priced routes cannot serve a 402 when the facilitator is down.** The asset id and `feePayer` come from the facilitator's `/supported`, so the challenge cannot be constructed offline (R-1). *Falsified today.*

Fixing (1) requires one successful `/v1/records/summary` call against the live contract. Fixing (2) is a ~10–15 line change plus a test, using `decodePaymentSignatureHeader` (`@x402/core/http`) and `getSenderFromTransaction` (`@x402/avm`) — both verified present in the installed SDK. Fixing (3) requires caching `/supported` and degrading to `503` + `Retry-After`. All three are **RECOMMENDED**; none is implemented.

## 6. Maturity ladder

Three rungs. Each lists its **entry gate** (what must be true to claim the rung) and its **exit work** (what the next rung requires). Nothing beyond Rung 1 exists.

### Rung 1 — Demo *(current rung; partially satisfied)*

*The mechanism is real on a public test network, and every claim is checkable.*

| Gate condition | Status |
|---|---|
| Contract deployed, non-deleted, on a public network | **Met** — App `768743428` |
| Consent lifecycle proven with real transactions | **Met** — FR-018/FR-020/FR-023, three tx IDs |
| At least one real settled x402 payment | **Met** — FR-003, one tx |
| All automated tests green; both typechecks clean; both builds pass | **Met** — 14 + 18 = 32 tests (ledger §9, §18) |
| CI actually runs on the repository's default branch | **Not met** — CI-1 |
| The audit-append path proven on-chain at least once | **Not met** — E-1, O-5 |
| The consent gate binds payer to requester | **Not met** — S-1, O-6 |
| Documentation contains no unbuilt-product artefact presented as built | **Not met** — DOC-1: `docs/SENTINEL_ARCHITECTURE.md` is untracked, 647 lines, and describes a different system |

**Exit work for Rung 1 → 2 (all RECOMMENDED, none implemented):** fix CI-1 (one-line trigger change); execute `/v1/records/summary` successfully once against App `768743428` and record the `auditTxId`; implement FR-039/SEC-007 payer binding with a test; relocate or banner `SENTINEL_ARCHITECTURE.md`; correct DOC-4 and DOC-9; fix contract defects C-1 (swapped event args, `contract.py:146`) and C-2 (`GRANT_BOX_MBR` should be `400 * (33 + 17)` = 22,500 µALGO, `contract.py:52`).

### Rung 2 — Beta

*Real third parties can call it, against real money, without the operator present — and a failure costs someone something recoverable.*

| Requirement to enter Rung 2 | ID | Current |
|---|---|---|
| Payer identity cryptographically bound to `requesterAddress` | SEC-007, FR-039 | **NOT IMPLEMENTED** |
| Address inputs validated by checksum, not length | SEC-010 | **NOT IMPLEMENTED** (`z.string().length(58)` only; a malformed 58-char address returns **500** with `{"error":"wrong checksum for address"}` — finding R-3) |
| Internal exception messages not returned to callers | SEC-011 | **NOT IMPLEMENTED** (`api/src/app.ts:58-61` echoes `err.message`) |
| Rate limiting on free endpoints | SEC-013 | **NOT IMPLEMENTED** — `/v1/consent/status` is free, unauthenticated, and makes two outbound algod calls per request |
| A settled payment is never consumed without delivery or a recoverable record | REL-002 | **NOT IMPLEMENTED** — finding R-2 |
| Facilitator outage degrades to `503` + `Retry-After`, not `500` | REL-001 | **NOT IMPLEMENTED** — finding R-1 |
| Explicit timeout and bounded retry on all algod I/O | REL-003 | **NOT IMPLEMENTED** — finding R-4 |
| Cross-implementation test proving the three box-key derivations agree | NFR-011 | **UNVALIDATED** — three independent implementations (`contract.py:95-98`, `api/src/services/algorand.ts:63-79`, `web/lib/consent.ts:26-34`), no cross-check test |
| Container images build in CI and are proven to boot | NFR-007, CI-3 | **UNVALIDATED** — never built by CI; `npm install` not `npm ci` (D-4); no `.dockerignore` anywhere (D-3, SEC-015) |
| Dependency vulnerability scanning on every change | SEC-014 | **NOT IMPLEMENTED** |
| Structured logging with correlation IDs | OPS-002 | **NOT IMPLEMENTED** |
| A healthcheck wired to the existing `/v1/health` | OPS-001, D-6 | Endpoint **IMPLEMENTED**; not wired in `Dockerfile` or `fly.toml` |

### Rung 3 — Production

*Real patients, real records, real regulatory exposure.* Nothing in this repository approaches this rung, and this document does not claim a path is designed — only that these are the obvious preconditions. All **RECOMMENDED**.

| Requirement | ID | Note |
|---|---|---|
| Real clinical payloads held encrypted off-chain with on-chain content-address pointers | DATA-006 **PLANNED** | No encryption pipeline exists. The box design anticipates it; that is design intent, not implementation. |
| Operator/admin key protected commensurate with its authority | SEC-012 **NOT IMPLEMENTED** | Today one hot mnemonic in an env var can forge audit entries, rotate `set_admin`, and drain the app account. Multisig or hardware backing, plus a rotation runbook, would be the minimum. |
| Audit sequencing safe under horizontal scale | REL-004 **PARTIALLY IMPLEMENTED** | `withPatientLock` is in-process only (`api/src/services/algorand.ts:129-138`) while `api/fly.toml` permits more than one machine (`auto_start_machines = true`) — finding D-7. Moving sequence assignment fully on-chain removes the class of bug. |
| Real identity binding: address ↔ person, clinician credentialing | — | No mechanism exists, planned or otherwise. This is the largest unaddressed gap for any real deployment. |
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
