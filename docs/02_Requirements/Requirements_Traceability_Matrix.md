# MedRail — Requirements Traceability Matrix

**Purpose of this document.** Trace every requirement ID in the frozen canonical registry — and every ID legitimately allocated by a document in `docs/` — forward to a design component, a line of implementation, a named test function, and a piece of evidence, or record explicitly that no such link exists.

**Status of this document.** Authored 2026-08-21 against commit `3b387df` on branch `main`. Every `path:line` citation below was re-verified by reading the file, not copied from the registry (several registry line ranges have drifted and the corrected values are used here). Requirement statements are reproduced verbatim from the canonical registry; **status labels reflect the code as it now stands** — see §0.2 for the rows that moved and why. **No new requirement IDs are allocated by this document.**

---

## 0. How to read this matrix

### 0.1 Column semantics

| Column | Meaning |
|---|---|
| **Requirement** | Canonical ID plus a short mnemonic. Full statements live in the registry and in [`SRS.md`](SRS.md). |
| **Design Component** | The architectural element that owns the requirement. Fixed vocabulary: `MedRailConsent` contract · x402 middleware · API route layer · Intelligence layer · Chain integration service · Config layer · Web demo client · CI/CD pipeline · Container & platform config · Static data · **none** (nothing owns it). |
| **Implementation (file:line)** | The exact code that satisfies — or, where the requirement is unmet, the exact code that fails to satisfy — the requirement. `— none —` means no code exists. |
| **API/Module** | The externally visible surface or module boundary through which the requirement is exercised. |
| **Test Case** | A **real, named test function** (`test_consent.py::test_x`, or a `vitest` `it(...)` title) with its `TC-###` from [`../07_Testing/Test_Cases.md`](../07_Testing/Test_Cases.md), or the literal `— none —`. Manual `TC-050…TC-056` procedures are named where they are the only verification. Nothing in the `TC-100…TC-204` range appears here as a test: those cases do not exist. |
| **Evidence** | A repository path, an Algorand TestNet transaction id / indexer observation, an executed measurement, or `— none —`. |
| **Status** | The frozen status vocabulary, bolded, used verbatim. |

### 0.2 Status changes since the review, and why

The requirement IDs and statements are frozen. The statuses are not: the code was fixed after this matrix was first written, and the rows below moved as a result. Each is traceable to a specific artefact.

| ID(s) | Was | Now | What changed |
|---|---|---|---|
| **FR-039, SEC-007, SEC-008** | **NOT IMPLEMENTED** (finding G-01) | **VALIDATED** | `api/src/x402Payer.ts` recovers the address that signed the payment; `records.ts:41-51` returns 403 on a mismatch. 6 unit cases in `api/test/x402Payer.spec.ts`; live attack **and** control in `contracts/artifacts/g01-verification.json` |
| **SEC-006** | **PARTIALLY IMPLEMENTED — DEFEATED BY S-1** | **VALIDATED** | Consequence of the above — the grant is now evaluated against an authenticated identity |
| **FR-010, FR-012, FR-025** | **UNVALIDATED** / **UNVALIDATED on-chain** | **VALIDATED** | The full composition executed on TestNet: `contracts/artifacts/e2e-consent-proof.json`; `total_audit_entries = 5` on App `768743428` |
| **REL-002** | **NOT IMPLEMENTED** (finding R-2) | **VALIDATED — satisfied structurally by the SDK** | The finding was factually wrong. `@x402/hono` reaches `processSettlement` only on a status below 400 (`node_modules/@x402/hono/dist/esm/index.mjs:203-232`); every other path cancels first. Withdrawn, and credited to x402 v2 |
| **REL-001** | **NOT IMPLEMENTED** (finding R-1) | **IMPLEMENTED** | `api/src/app.ts:73-105` — 503 + `Retry-After: 30` + `PAYMENT_FACILITATOR_UNAVAILABLE` |
| **SEC-010, SEC-011, FR-038** | **NOT IMPLEMENTED** / **PARTIALLY IMPLEMENTED** | **IMPLEMENTED** | `api/src/validation.ts` (checksum validation) and `api/src/app.ts:113-139` (generic error body with a `requestId`); asserted by `api/test/app.spec.ts` |
| **SEC-013** | **NOT IMPLEMENTED** | **IMPLEMENTED** | `api/src/rateLimit.ts`; asserted by `api/test/app.spec.ts` |
| **NFR-011** | **UNVALIDATED** | **VALIDATED** | One shared golden-vector fixture asserted from Node, browser and Python |
| **FR-017** | **IMPLEMENTED** | **VALIDATED** | `GET /` now advertises all 8 routes plus `contract` and `x402` blocks; `app.spec.ts` asserts the advertised list equals the mounted set |
| **FR-024, FR-032** | **PARTIALLY IMPLEMENTED** / **IMPLEMENTED (incorrect value)** | **IMPLEMENTED in source** | `contract.py` fixed and regression-tested — **but App `768743428` still runs the pre-fix bytecode**, because `OnUpdate.AppendApp` would mint a new App ID. These two rows are the only place where source and chain deliberately disagree |
| **OPS-006, SEC-014** | **PARTIALLY IMPLEMENTED** / **NOT IMPLEMENTED** | **IMPLEMENTED** / **PARTIALLY IMPLEMENTED** | CI triggers on `main` and `master` with `npm audit --audit-level=high` on both packages and an artifact-freshness gate |
| **OPS-050…OPS-055, NFR-004, SEC-015, OPS-001** | **NOT IMPLEMENTED** | **IMPLEMENTED** | `api/fly.toml` (`NETWORK`, `CONSENT_APP_ID`, `/v1/health` check, `max_machines_running = 1`), `npm ci` in both Dockerfiles, `.dockerignore` at the repo root and in `web/` |
| **REL-004** | **PARTIALLY IMPLEMENTED**, framed as log corruption | **PARTIALLY IMPLEMENTED**, reframed as **availability** | The contract self-assigns the sequence (`contract.py:224-226`), so a race yields a **rejected transaction**, not a corrupted log. `api/fly.toml` now pins the service to one machine to hold the assumption |
| **FR-011** | **UNVALIDATED**, with a documented-vs-actual billing mismatch | **IMPLEMENTED** | The mismatch is resolved in the code's favour: a 403 cancels settlement, so the response carries `charged: false` and the `charged` field is gone. The denial path still has **no automated test and no recorded live run**, which is why this is IMPLEMENTED and not VALIDATED |

Qualified status forms still in use: **IMPLEMENTED in source** (FR-024, FR-032 — deployed application retains the defect), **IMPLEMENTED (by construction)** (AI-008), **NOT APPLICABLE / PARTIALLY ADDRESSED** (OPS-007).

### 0.3 Scope of the ID set

**134 requirement IDs** are traced: the **100** canonical registry IDs (FR-001…040, NFR-001…012, SEC-001…016, PERF-001…004, REL-001…006, OPS-001…008, DATA-001…006, AI-001…008) plus **34** IDs allocated by documents in `docs/` from the registry's §9 reserved blocks:

| Block | IDs allocated | Allocating document(s) |
|---|---|---|
| Product / Use Cases | **FR-100, FR-101** (2) | `01_Product/Use_Cases.md`, `01_Product/Project_Vision.md` |
| Security / Threat Model | **SEC-050…SEC-058** (9) | `06_Security/Security_Architecture.md` |
| Intelligence Layer | **AI-050…AI-059** (10) | `09_Intelligence_Layer/Algorithm_Inventory.md` |
| Testing (`×-090…×-099`) | **AI-090** (1) | `07_Testing/Test_Cases.md` |
| Deployment / Operations | **OPS-050…OPS-057, OPS-059…OPS-062** (12) | `08_Deployment/Deployment_Architecture.md`, `08_Deployment/CI_CD.md`, `10_Operations/{Monitoring,Logging,Incident_Response}.md` |

`OPS-058` is **not allocated** — the block skips it. `FR-102…FR-119`, `SEC-059…SEC-069`, `AI-060…AI-069`, `OPS-063…OPS-069` are unallocated. Tokens such as `FR-119`, `SEC-069`, `AI-069` appear in `docs/` only as the upper bound of a printed range, never as a defined requirement; they are correctly **not** requirements and are not traced here.

**No orphans were found.** Every `FR-###`/`NFR-###`/`SEC-###`/`PERF-###`/`REL-###`/`OPS-###`/`DATA-###`/`AI-###` token that appears anywhere in `docs/` is either a registry ID, one of the 34 allocations above, or a range bound.

---

## 1. FR — Functional requirements

### 1.1 Payment layer (FR-001…FR-003)

| Requirement | Design Component | Implementation (file:line) | API/Module | Test Case | Evidence | Status |
|---|---|---|---|---|---|---|
| **FR-001** — 402 challenge on any unpaid priced route | x402 middleware | `api/src/app.ts:58-175`; `api/src/x402.ts:11-14` | `POST /v1/{triage,interaction-check,records/summary}` | `x402-flow.spec.ts "returns a real 402 with priced accepts[] for /v1/triage when unpaid"` (TC-029); `"…for /v1/interaction-check…"` (TC-030); `"…for /v1/records/summary…"` (TC-031); `"rejects malformed triage requests before the payment gate would even matter"` (TC-032) | Live capture, `VERIFIED_FACTS` §4: HTTP 402, header `payment-required`, `x402Version: 2` | **VALIDATED** |
| **FR-002** — challenge advertises scheme/network/asset/`payTo` | x402 middleware | `api/src/x402.ts:16-32`; `api/src/config.ts:48`, `:53` | `PAYMENT-REQUIRED` header | `x402-flow.spec.ts "returns a real 402 with priced accepts[] for /v1/triage when unpaid"` (TC-029) asserts `amount === "20000"`, `network` matches `/^algorand:/`; TC-031 asserts `"50000"` | Decoded live challenge: `scheme "exact"`, `network algorand:SGO1GK…`, `asset 10458941`, `payTo 2WDV2J2F…`, `extra.feePayer ZMFK2OI7…` | **VALIDATED** |
| **FR-003** — settle an `exact` AVM payment via the facilitator | x402 middleware | `api/src/x402.ts:6`, `:11-14`; `api/src/app.ts:58-175` | `PAYMENT-SIGNATURE` → `PAYMENT-RESPONSE` | `— none —` (driven by `api/scripts/e2e-proof.ts:53-91`, a script with no assertion harness — manual **TC-056**) | tx `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ` — `axfer`, asset `10458941`, amount `20000`, `fee 0`, round `66091768`; `contracts/artifacts/e2e-proof.json`. Also on the gated route: `5DKFUULWLTNGKLYLH3TT44F22MHKOFRCEO6K4JVEPOPETFBYOESA`, `QZIQWHN553Q3QYJ4NJ5GP3QIROP6BE2DD45P3IUSHUOGEB7VLVSQ`. Those earlier runs were self-payments; the three-party `api/scripts/agent-demo.ts` run settles between **distinct accounts** — payer `UYBTLPHS…`, an independent keypair this service does not control, paying `payTo` `2WDV2J2F…`: `DOSKCNKJRXIMY2UDSDZ377LKPZQIZJW5JHCGUAGKOYV6KUCFYKIA` (round `66563930`), `PLBFDDADW576IUCH62HGGYI4AJQNO3QXSENNDIBKAORWVMP7NVHQ`, `COMJ3TQOGTKP6LXDJS7HZY7B45QZJQWXXJ23HQ3IDDQYD7GRK36A` (round `66563944`), each `fee 0`, sender ≠ receiver on the indexer. The third party is the patient `56LFG5EE…`, whose own keypair signed the grant authorising the last of the three and which is neither payer nor payee. **The agent's TestNet float and the patient's TestNet ALGO were both seeded from the project's own wallet; no external party has paid for this service.** | **VALIDATED** |

### 1.2 Intelligence endpoints (FR-004…FR-009)

| Requirement | Design Component | Implementation (file:line) | API/Module | Test Case | Evidence | Status |
|---|---|---|---|---|---|---|
| **FR-004** — `/v1/triage` contract (1–2000 chars → score/band/flags/disclaimer) | API route layer + Intelligence layer | `api/src/routes/triage.ts:5-18`; `api/src/services/triageScorer.ts:53-73` | `POST /v1/triage` | `triageScorer.spec.ts "flags nothing for a benign, unrelated sentence"` (TC-015); `"flags chest pain plus breathing difficulty as emergency"` (TC-017); `"flags stroke warning signs distinctly"` (TC-018); `"is case-insensitive"` (TC-021) | `api/src/services/triageScorer.ts:9-16` (return type) | **VALIDATED** |
| **FR-005** — score = capped (≤100) sum of matched weights | Intelligence layer | `api/src/services/triageScorer.ts:56-65` | `scoreTriage()` | `triageScorer.spec.ts "caps the score at 100 even with many overlapping flags"` (TC-019); `"flags a single mild symptom as low urgency"` (TC-016) | `Math.min(100, score)` at `triageScorer.ts:65`; measured 35 + 35 = 70 for the TC-056 input | **VALIDATED** |
| **FR-006** — bands `emergency ≥60 / urgent ≥30 / soon ≥10 / routine` | Intelligence layer | `api/src/services/triageScorer.ts:46-51` | `scoreTriage()` | `triageScorer.spec.ts` TC-015, TC-016, TC-017, TC-018 (4 band cases) | `bandFor()` at `triageScorer.ts:46-51` | **VALIDATED** |
| **FR-007** — `/v1/interaction-check` contract (2–20 meds → flagged/matches/source/disclaimer) | API route layer + Intelligence layer | `api/src/routes/interaction.ts:5-18`; `api/src/services/interactionChecker.ts:36-55` | `POST /v1/interaction-check` | `interactionChecker.spec.ts "flags nothing for unrelated medications"` (TC-022); `"flags the classic warfarin + aspirin bleeding-risk pair"` (TC-023); `"flags a contraindicated pair (sildenafil + nitroglycerin)"` (TC-024); `"finds multiple simultaneous interactions in a longer list"` (TC-026) | `api/src/data/interactions.json` — 14 curated pairs | **VALIDATED** |
| **FR-008** — case-insensitive, partial-name tolerant matching | Intelligence layer | `api/src/services/interactionChecker.ts:32-34`, `:42-43` | `checkInteractions()` | `interactionChecker.spec.ts "matches case-insensitively and with partial names"` (TC-025) | `normalize()` at `:32-34`; bidirectional `includes` at `:42-43`. **The same line is the root cause of AI-006 / G-21.** | **VALIDATED** |
| **FR-009** — every intelligence response carries a disclaimer | Intelligence layer | `api/src/services/triageScorer.ts:18-21`, `:71`; `api/src/services/interactionChecker.ts:20-23`, `:53` | both services | `triageScorer.spec.ts "always includes the non-diagnostic disclaimer"` (TC-020); `interactionChecker.spec.ts "always includes a source citation and disclaimer"` (TC-027) | Disclaimer asserted as a correctness property, not prose | **VALIDATED** |

### 1.3 Consent-gated endpoint — the flagship (FR-010…FR-012)

| Requirement | Design Component | Implementation (file:line) | API/Module | Test Case | Evidence | Status |
|---|---|---|---|---|---|---|
| **FR-010** — `/v1/records/summary` requires settled payment **and** a valid on-chain grant | API route layer + Chain integration service | `api/src/routes/records.ts` — payer binding at `:41-51`, grant read at `:53`; gate mounted at `api/src/app.ts:54-57` | `POST /v1/records/summary` → `payerFromRequest()` → `checkAccess()` | `x402Payer.spec.ts "recovers the address that actually signed the payment"`, `"does NOT return an address a caller merely asserts"`, `"returns null (never a guess) on a malformed header"` (+3) | Live end-to-end run: `contracts/artifacts/e2e-consent-proof.json` — grant `M26NPR32…` → settled payment `5DKFUULW…` → audit `4YLKLQKK…`, HTTP 200. The consent check now runs against the address that signed the payment, not one asserted in the body | **VALIDATED** |
| **FR-011** — no valid grant ⇒ `403` + audit attempt; the caller is **not** charged | API route layer | `api/src/routes/records.ts:54-71`; denial audit write at `:58`; `charged: false` and the free-endpoint `hint` at `:66-67` | `POST /v1/records/summary` | **`— none —`** | Source plus the SDK's structural guarantee: a 403 never reaches `processSettlement` (`@x402/hono/dist/esm/index.mjs:203-232`), so **the caller pays nothing**, and `records.ts:58` submits a real `log_access` transaction whose fee **MedRail's operator account pays**. The `charged` field, and the `API.md`/`SECURITY.md` claim that a denial is billed, are gone. The cost is bounded by the 30/min limit on this route (SEC-013). **No test and no recorded live denial run** — which is why this is IMPLEMENTED, not VALIDATED. | **IMPLEMENTED** |
| **FR-012** — granted access appends an audit entry and returns `auditTxId`/`auditSequence` | API route layer + Chain integration service + `MedRailConsent` contract | `api/src/routes/records.ts:83-111` (wrapped in `try/catch`; on failure returns 200 with `auditStatus: "pending"`); `api/src/services/algorand.ts:146-179`; `contract.py:217-236` | `logAccess()` → `log_access` ABI | `— none —` for the route; the contract half is covered by `test_consent.py::test_log_access_admin_only` (TC-010) and `::test_audit_log_sequence_increments_per_patient` (TC-012) | **Confirming indexer evidence:** audit tx `4YLKLQKKWXXFW3UT5APJVYKXI7T7A6OACTAWCC5YBAN3XGOGHRVQ` at sequence `1`; app `768743428` reports `total_audit_entries = 5` with `s`- and `a`-prefixed boxes present and the app account's min-balance reconciling exactly against the box inventory (`docs/PROOF.md` §9) | **VALIDATED** |

### 1.4 Free read and introspection endpoints (FR-013…FR-017)

| Requirement | Design Component | Implementation (file:line) | API/Module | Test Case | Evidence | Status |
|---|---|---|---|---|---|---|
| **FR-013** — free live consent status for a `(patient, requester, scope)` triple | API route layer + Chain integration service | `api/src/routes/consent.ts:19-31`; `api/src/services/algorand.ts:82-100` | `GET /v1/consent/status` | `— none —` for the verdict; `app.spec.ts` exercises the route's validation and rate limiting | Reviewer-executed: HTTP 200 in **505 ms** (single cold observation, 2 sequential algod round trips). Used as the free pre-flight check in `api/scripts/e2e-consent-proof.ts`, returning `granted: true` after the grant | **IMPLEMENTED** |
| **FR-014** — app-info: network, CAIP-2, App ID, ARC-56 URL | API route layer | `api/src/routes/consent.ts:33-40` | `GET /v1/consent/app-info` | `— none —` (the equivalent `contract` block on `GET /` is asserted by `app.spec.ts`, but this route is not) | `api/src/config.ts:45`, `:48`, `:56` supply the four fields | **IMPLEMENTED** |
| **FR-015** — serve the compiled ARC-56 spec | API route layer + Static data | `api/src/app.ts:141-147` | `GET /v1/consent/arc56` | `— none —` | `contracts/artifacts/MedRailConsent.arc56.json` (committed; CI recompiles and runs `git diff --exit-code -- contracts/artifacts/` so the served spec cannot drift from source) | **IMPLEMENTED** |
| **FR-016** — health endpoint: liveness, network, App ID | API route layer | `api/src/routes/health.ts:6-14` | `GET /v1/health` | `x402-flow.spec.ts "health check is free and unpaid"` (TC-028); `app.spec.ts "does not throttle the health endpoint"` | Service name `medrail-api` at `health.ts:9`; wired to a `/v1/health` check in `api/fly.toml` | **VALIDATED** |
| **FR-017** — machine-readable service index at `/` | API route layer | `api/src/app.ts:149-177` | `GET /` | `app.spec.ts "advertises every mounted route, not a stale subset"`; `"points integrators at the ARC-56 spec and the App ID"` | Lists **all 8** routes with `method`/`path`/`price`/`gate`, plus a `contract` block (`appId`, `network`, `networkCaip2`, `arc56SpecUrl`) and an `x402` block (`version: 2`, `scheme: "exact"`, `facilitator`). The test asserts the advertised set **equals** the mounted set, so the stale-subset regression cannot recur | **VALIDATED** |

### 1.5 On-chain consent lifecycle (FR-018…FR-024)

| Requirement | Design Component | Implementation (file:line) | API/Module | Test Case | Evidence | Status |
|---|---|---|---|---|---|---|
| **FR-018** — patient grants a named, optionally time-limited scope with their own key | `MedRailConsent` contract | `contract.py:148-176`; `Txn.sender` is the patient at `:151` | `grant_access` ABI (selector `8c3ad539`) | `test_consent.py::test_grant_then_check_access` (TC-004) | tx `X2BQ5FD4MW52B75WQGDB67TEULYLN7FHVFO6ZOBNI74PNCAKVOUA`, round `66088672` (TC-052); 2 `g`-prefixed boxes on app `768743428` | **VALIDATED** |
| **FR-019** — `duration_seconds == 0` never expires; otherwise expires at `latest_timestamp + duration` | `MedRailConsent` contract | `contract.py:152`; evaluated at `:206-209` | `grant_access` / `check_access` | `test_consent.py::test_grant_with_expiry_becomes_invalid_after_expiry` (TC-006) | Simulator clock pinned via `patch_global_fields`. **The exact boundary `latest_timestamp == expires_at` is untested** (TC-157, absent) | **VALIDATED** |
| **FR-020** — patient revokes a granted scope | `MedRailConsent` contract | `contract.py:178-195` | `revoke_access` ABI (selector `a67aecbc`) | `test_consent.py::test_revoke_access` (TC-007) | tx `OV2J2T5VWMIQG64JYGL7JEGZKKNZNKCMNIQU6AC4PDRQYZ6ZOO5A`, round `66088674` (TC-054); global `total_revocations = 2` | **VALIDATED** |
| **FR-021** — revoking a non-existent grant fails atomically | `MedRailConsent` contract | `contract.py:182` (`assert … "no such grant"`) | `revoke_access` | `test_consent.py::test_revoke_nonexistent_grant_asserts` (TC-008) | `contracts/tests/test_consent.py:114-117` | **VALIDATED** |
| **FR-022** — re-grant after revoke reactivates and restores the counter exactly once | `MedRailConsent` contract | `contract.py:157-167` (`was_active_before` keys off prior *status*, not prior *existence*) | `grant_access` | `test_consent.py::test_regrant_after_revoke_reactivates` (TC-009) | `total_grants_active` returns to 1, not 2 | **VALIDATED** |
| **FR-023** — `check_access` true only for present + `STATUS_GRANTED` + unexpired | `MedRailConsent` contract | `contract.py:197-209` | `check_access` ABI (`readonly=True`) | `test_consent.py::test_grant_then_check_access` (TC-004); `::test_check_access_false_when_no_grant` (TC-005); `::test_grant_with_expiry_becomes_invalid_after_expiry` (TC-006) | Live: in-script assertions at `contracts/scripts/exercise_contract.py:127-128` (TC-053 `True`, TC-055 `False`) | **VALIDATED** |
| **FR-024** — `request_access` increments a counter and emits an event | `MedRailConsent` contract | `contract.py:140-146` — now emits `AccessRequested(patient, Txn.sender, scope)` | `request_access` ABI (selector `d84debd0`) | `test_consent.py::test_request_access_emits_event_and_counts` (TC-003) — counter; **`::test_request_access_event_field_order`** — the emitted payload, verified to fail against the old code | tx `5XIADMCGFP5I7H7AS656RXZS7MFEEPCVJGLA7T3SVE6XDEYSGFFA`, round `66088670` (TC-051); global `total_requests = 2`. **G-12: fixed in source, redeploy deferred by design** — `deploy_testnet.py` uses `OnUpdate.AppendApp`, which mints a *new* application, so redeploying would invalidate App `768743428` and its history. **The deployed application still emits the two parties inverted.** | **IMPLEMENTED in source** |

### 1.6 On-chain audit log (FR-025…FR-028)

| Requirement | Design Component | Implementation (file:line) | API/Module | Test Case | Evidence | Status |
|---|---|---|---|---|---|---|
| **FR-025** — append an immutable, per-patient, monotonically sequenced entry; return the sequence | `MedRailConsent` contract | `contract.py:217-236`; sequence self-assigned at `:224-226` | `log_access` ABI | `test_consent.py::test_log_access_admin_only` (TC-010); `::test_audit_log_sequence_increments_per_patient` (TC-012) — **AVM simulator only** | **Refuted on-chain:** `total_audit_entries = 5`; zero `s`/`a` boxes on app `768743428`. Never executed on TestNet. | **UNVALIDATED on-chain** |
| **FR-026** — `log_access` callable only by the contract admin | `MedRailConsent` contract | `contract.py:222` | `log_access` | `test_consent.py::test_log_access_rejects_non_admin` (TC-011) | Assert `Txn.sender == self.admin.value` | **VALIDATED** |
| **FR-027** — audit sequences independent per patient | `MedRailConsent` contract | `contract.py:115` (`audit_seq` BoxMap keyed by `Account`); `:224-226` | `log_access` / `get_audit_count` | `test_consent.py::test_audit_log_sequence_increments_per_patient` (TC-012) | Patient A → 2, patient B → 1 | **VALIDATED** |
| **FR-028** — read-only audit queries | `MedRailConsent` contract | `contract.py:238-246` | `get_audit_count`, `get_audit_entry` (both `readonly=True`) | `test_consent.py::test_log_access_admin_only` (TC-010, reads back); `::test_get_audit_entry_missing_asserts` (TC-013) | `contract.py:245` asserts `"no such audit entry"` | **VALIDATED** |

### 1.7 Contract administration and funding (FR-029…FR-032)

| Requirement | Design Component | Implementation (file:line) | API/Module | Test Case | Evidence | Status |
|---|---|---|---|---|---|---|
| **FR-029** — admin rotatable without redeployment | `MedRailConsent` contract | `contract.py:118-121` (create sets admin); `:123-127` (rotate) | `create`, `set_admin` | `test_consent.py::test_create_sets_admin` (TC-001); `::test_set_admin_only_admin` (TC-002) | Assert at `contract.py:126` | **VALIDATED** |
| **FR-030** — anyone may top up box-MBR reserve via `fund_mbr` | `MedRailConsent` contract | `contract.py:129-138`; assert `payment.receiver == Global.current_application_address` at `:138` | `fund_mbr` ABI | **`— none —`** — `fund_mbr` has **no test of any kind** (TC-154/TC-155 absent) | Source only. Reverse-traceability finding — see §10.1. | **IMPLEMENTED** |
| **FR-031** — admin may reclaim ALGO above MBR via `withdraw_excess` | `MedRailConsent` contract | `contract.py:254-259`; inner `itxn.Payment(fee=0)` at `:259` | `withdraw_excess` ABI | `test_consent.py::test_withdraw_excess_admin_only` (TC-014) — **negative case only** | The successful withdrawal path, including the `fee=0` fee-pooling assumption, is **untested** (TC-156 absent) | **PARTIALLY IMPLEMENTED** |
| **FR-032** — expose the per-grant box MBR as a queryable constant | `MedRailConsent` contract | `contract.py:52` (`2_500 + 400 * (32 + 17)` = 22,100 µALGO); returned at `:248-252` | `get_grant_box_mbr` ABI (`readonly=True`) | **`— none —`** (TC-153 absent) | **Refuting on-chain evidence:** app account `CCO26Y6Z56DDZ3OELO2UKJMIPJVSIT52I23F2MPMR52JBM3HQZZNUZNOR4` reports `min-balance = 145000` with `total-boxes = 2`; 145000 − 100000 base = 45000 = 2 × **22,500**. The BoxMap's 1-byte `key_prefix="g"` (`contract.py:114`) counts toward the key. The method under-reports by 400 µALGO/box. | **IMPLEMENTED (incorrect value — defect C-2)** |

### 1.8 Web demo client (FR-033…FR-037)

| Requirement | Design Component | Implementation (file:line) | API/Module | Test Case | Evidence | Status |
|---|---|---|---|---|---|---|
| **FR-033** — browser-generated session TestNet keypair | Web demo client | `web/lib/demoWallet.ts:13-31`; `sessionStorage` key `medrail-demo-wallet-v1` at `:3` | `getOrCreateDemoWallet()` | **`— none —`** — `web/` has **no test runner installed** | Mnemonic stored as plaintext JSON in `sessionStorage` (`demoWallet.ts:25`); TestNet-only and disclosed in the UI | **IMPLEMENTED** |
| **FR-034** — browser constructs, signs and submits a real x402 payment; displays the tx id | Web demo client | `web/lib/x402Client.ts:6-37`; `web/components/LiveDemoPanel.tsx:38` | `callPaidEndpoint()` | `— none —` | Manually captured in `docs/PROOF.md` §4. `x402Client.ts:33-34` deliberately skips `getPaymentSettleResponse` on a non-200 (a 402 is signed-but-unsettled and carries no `PAYMENT-RESPONSE`) | **IMPLEMENTED** |
| **FR-035** — patient grants/revokes by signing directly, backend never holds the key | Web demo client | `web/lib/consent.ts:44-68` (grant), `:70-89` (revoke); signs at `:50` and `:71` | `grantAccessOnChain()`, `revokeAccessOnChain()` | **`— none —`** | No key ingress path exists in `api/src` (verified). **Correction 3:** the path is *not* signer-abstracted — `consent.ts:50` calls `algosdk.mnemonicToSecretKey(wallet.mnemonic)`, so a real wallet needs a refactor, not a swap (G-18). | **IMPLEMENTED** |
| **FR-036** — display live backend health and active network | Web demo client | `web/components/NetworkBadge.tsx:7-39`; `web/lib/api.ts:11-15` | `GET /v1/health` consumer | **`— none —`** | `NetworkBadge.tsx:36` renders network + App ID | **IMPLEMENTED** |
| **FR-037** — publish the endpoint/price/gate table | Web demo client | `web/components/PricingTable.tsx:1-35` (4 static rows) | static component | **`— none —`** | Rows match `api/src/app.ts:41-46` today; **nothing guards the drift** (TC-190 absent) | **IMPLEMENTED** |

### 1.9 Validation, identity binding, proof (FR-038…FR-040)

| Requirement | Design Component | Implementation (file:line) | API/Module | Test Case | Evidence | Status |
|---|---|---|---|---|---|---|
| **FR-038** — all bodies and query params schema-validated before use | API route layer | `api/src/routes/records.ts:5-8`, `:26-29`; `consent.ts:6-10`, `:20-27`; `triage.ts:5-7`, `:12-15`; `interaction.ts:5-7`, `:12-15` | zod ^3.24.1 | `x402-flow.spec.ts "rejects malformed triage requests before the payment gate would even matter"` (TC-032) — **incidental**: it asserts `400` **or** `402`, documenting middleware ordering rather than verifying the schema | Address fields are validated by **length 58 only** — no checksum. See SEC-010 / G-10 | **PARTIALLY IMPLEMENTED** |
| **FR-039** — bind the paying identity to the `requesterAddress` used for the consent check | **none** | **`— none —`** | — | **`— none —`** (TC-110 absent — the single most important missing test) | **`— none —`**. Finding S-1 / **G-01**. The discovery step was **executed**: one unauthenticated query to `https://testnet-idx.algonode.cloud/v2/transactions?application-id=768743428&limit=100` recovered **two complete `(patient, requester, scope)` triples**, both scope `records:summary`. | **NOT IMPLEMENTED** |
| **FR-040** — reproducible end-to-end payment proof written to disk | CI/CD pipeline (absent) + API route layer | `api/scripts/e2e-proof.ts:53-91`; writes to `contracts/artifacts/e2e-proof.json` at `:80-88` | script, not a route | `— none —` — the script throws on a non-200 (`e2e-proof.ts:66-71`) but no pipeline invokes it (manual **TC-056**) | tx `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ`; `contracts/artifacts/e2e-proof.json`. **Not run in CI.** | **IMPLEMENTED** |

### 1.10 Newly allocated functional requirements (FR-100, FR-101)

| Requirement | Design Component | Implementation (file:line) | API/Module | Test Case | Evidence | Status |
|---|---|---|---|---|---|---|
| **FR-100** *(new, added by `01_Product/Use_Cases.md`)* — deploy script funds the app account for box MBR and is idempotent across re-runs | Container & platform config | `contracts/scripts/deploy_testnet.py:93` (`OnUpdate.AppendApp`), `:100-101`, `:112-126` (funding skipped when the app already existed), `:133-137` | `deploy_testnet.py` | **`— none —`** | Funding tx `KYH3H5CG2CCUPUUTJIBX47WD4RWSUV3QWTEUJQRQFYLWO5YAO3QA`, round `66088626`; app account balance 5,000,000 µALGO (TC-050). `create_txid` in `contracts/artifacts/deploy_testnet.json` is `null` because the recorded run was an idempotent re-run, not a create. | **IMPLEMENTED** |
| **FR-101** *(new, added by `01_Product/Project_Vision.md`)* — all priced endpoints settle to one configured `payTo`, qualifying the entry as Composite | x402 middleware + Config layer | `api/src/app.ts:37-50` (exactly three priced routes); `api/src/x402.ts:26` (`payTo: config.payToAddress` for all); `api/src/config.ts:53` (one env var) | `PAYMENT-REQUIRED` `accepts[].payTo` | **`— none —`** | Live challenge shows `payTo 2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE` on all three routes. Competition-rule framing is per `docs/COMPLIANCE.md`, not independently re-verified. | **IMPLEMENTED** |

---

## 2. NFR — Non-functional requirements

| Requirement | Design Component | Implementation (file:line) | API/Module | Test Case | Evidence | Status |
|---|---|---|---|---|---|---|
| **NFR-001** — no server-side session, account, or persistent request state | API route layer | `api/src/` — 13 files, no datastore client, no ORM, no cache, no queue (verified by exhaustive read) | whole service | `— none —` | Absence verified by reading every file in `api/src`. This is also why **SEC-013** has no per-caller throttling primitive to build on. | **IMPLEMENTED** |
| **NFR-002** — register only the configured CAIP-2 network | x402 middleware | `api/src/x402.ts:8-14` (one `register()` call, with the rationale in the comment at `:8-10`) | `x402ResourceServer` | `— none —` | Source only. A mainnet-signed payment cannot be accepted by a testnet process. | **IMPLEMENTED** |
| **NFR-003** — environment-specific values supplied by env vars with documented defaults | Config layer | `api/src/config.ts:44-59`; `api/.env.example`; `web/.env.example` | `config` object | `— none —` | Source only. **This ID carries a **VALIDATED** label with no test and no executed check** — see §9.2. | **VALIDATED** |
| **NFR-004** — fall back to the deploy script's recorded App ID when `CONSENT_APP_ID` is unset | Config layer | `api/src/config.ts:31-40`, `:56` | `readDeployedAppId()` | `— none —` (TC-203 absent) | Resolves `process.cwd()/../contracts/artifacts/deploy_<network>.json`. **In the container this cannot work:** the file is not copied (`api/Dockerfile:16-20`) and `api/fly.toml:10` sets `NETWORK = "mainnet"`, so the path sought is `deploy_mainnet.json`, **which has never existed**. G-07. | **IMPLEMENTED (breaks in container — see D-1)** |
| **NFR-005** — all TypeScript compiles under `strict` with zero errors | CI/CD pipeline | `api/tsconfig.json` (`"strict": true`); enforced by `.github/workflows/ci.yml` jobs `api` and `web` | `tsc --noEmit` | `— none —` (a build gate, not a test function) | Reviewer-executed 2026-08-21: `npx tsc --noEmit` **PASS, 0 errors** in both `api/` and `web/`; `npm run build` and `next build` both PASS. The CI gate that would enforce this **has never fired** (G-06). | **VALIDATED** |
| **NFR-006** — callable cross-origin by any browser client without pre-registration | API route layer | `api/src/app.ts:22-35` (`origin: "*"`, `exposeHeaders` for both payment headers at `:31`) | CORS middleware | `— none —` (TC-196 absent) | `allowHeaders` is deliberately unset so Hono reflects the browser's preflight — the in-code comment at `app.ts:27-32` records a real prior regression that broke every paid browser call. Good engineering, **guarded by no test**. | **IMPLEMENTED** |
| **NFR-007** — API and web each buildable into a container image from a committed Dockerfile | Container & platform config | `api/Dockerfile:1-24`; `web/Dockerfile:1-17` | Docker | `— none —` (TC-203 absent) | **Neither image has ever been built** — no CI job builds them (`.github/workflows/ci.yml` has 3 jobs, none of which is a build). Defects D-3…D-6 remain unexercised. | **UNVALIDATED** |
| **NFR-008** — backend never holds, receives, or proxies a patient's private key | Web demo client + API route layer | `web/lib/consent.ts:50`, `:71` (signing is client-side); no key ingress path in `api/src` | `grantAccessOnChain`/`revokeAccessOnChain` | `— none —` (TC-193 absent) | Verified by reading every route: no request schema accepts a mnemonic or secret key. **A genuine strength with no permanent guard.** | **IMPLEMENTED** |
| **NFR-009** — intelligence endpoints deterministic and fully inspectable | Intelligence layer | `api/src/services/triageScorer.ts:32-44` (11 static rules); `api/src/services/interactionChecker.ts:40-47` (14 static pairs) | pure functions | `triageScorer.spec.ts "flags nothing for a benign, unrelated sentence"` (TC-015); `"is case-insensitive"` (TC-021) | No model, no randomness, no I/O in the decision path | **VALIDATED** |
| **NFR-010** — documentation claims traceable to a path, tx id, or reproducible command | (documentation) | `docs/PROOF.md` (153 lines, built on this principle) | — | `— none —` | Source only. Gaps G-17…G-19, G-22, G-23 are the recorded exceptions, all corrected. | **IMPLEMENTED** |
| **NFR-011** — box-key derivation byte-identical across contract, Node backend and browser | `MedRailConsent` contract + Chain integration service + Web demo client | `contract.py:95-98` + `:114-116` (prefixes); `api/src/services/algorand.ts:64-79`; `web/lib/consent.ts:26-34` (`crypto.subtle.digest`) | three independent implementations | **`— none —`** (TC-120…TC-125 absent) | **Three implementations, zero cross-checks.** A prefix or concatenation-order change silently breaks two of three, and the failure mode is a consent lookup returning `false` rather than erroring. G-08. | **UNVALIDATED** |
| **NFR-012** — TestNet/MainNet by configuration only, no code edit | Config layer | `api/src/config.ts:8-29` (four per-network maps), `:42`; `NETWORK` env in all three deploy scripts | `config.network` | `— none —` | Source only. `config.ts:42` is an **unchecked cast** — a typo yields `undefined` URLs rather than a boot failure (SEC-050). | **IMPLEMENTED** |

---

## 3. SEC — Security requirements

### 3.1 Canonical (SEC-001…SEC-016)

| Requirement | Design Component | Implementation (file:line) | API/Module | Test Case | Evidence | Status |
|---|---|---|---|---|---|---|
| **SEC-001** — only the admin may write audit entries | `MedRailConsent` contract | `contract.py:222` | `log_access` | `test_consent.py::test_log_access_rejects_non_admin` (TC-011) | Assert tested for rejection | **VALIDATED** |
| **SEC-002** — only the admin may withdraw funds or rotate admin | `MedRailConsent` contract | `contract.py:126`, `:258` | `set_admin`, `withdraw_excess` | `test_consent.py::test_set_admin_only_admin` (TC-002); `::test_withdraw_excess_admin_only` (TC-014) | Two negative tests | **VALIDATED** |
| **SEC-003** — only the patient (as `Txn.sender`) may grant or revoke | `MedRailConsent` contract | `contract.py:151` (grant), `:181` (revoke) — the patient identity is `Txn.sender`, never an argument | `grant_access`, `revoke_access` | `— none —` (implicit in TC-004/TC-007; no dedicated foreign-sender test) | On-chain: grant tx `X2BQ5FD4MW52B75WQGDB67TEULYLN7FHVFO6ZOBNI74PNCAKVOUA` and revoke tx `OV2J2T5VWMIQG64JYGL7JEGZKKNZNKCMNIQU6AC4PDRQYZ6ZOO5A` both sent by the patient account `S56WIB3XLUOX…` (TC-052, TC-054) | **VALIDATED** |
| **SEC-004** — no PHI written to the public ledger | `MedRailConsent` contract | `contract.py:58-63` (`GrantRecord`: status byte + 2 timestamps); `:66-73` (`AuditEntry`: ts, address, 3 constant strings); `api/src/routes/records.ts:10-11` (constant scope/endpoint) | box storage | `— none —` (TC-184 absent) | On-chain corroboration: app `768743428` holds 2 boxes / **100 total box bytes** = 2 × (33-byte key + 17-byte `GrantRecord`). No free-text field is stored. | **IMPLEMENTED** |
| **SEC-005** — secrets never committed to version control | (repository hygiene) | `.gitignore` covers `.env`, `.env.local`, `*.mnemonic`, `contracts/.env` | git | `— none —` | Reviewer-executed: `git ls-files \| grep .env` returns only `.env.example`. No `.env` is tracked. | **VALIDATED** |
| **SEC-006** — record access authorised against an on-chain grant | API route layer + Chain integration service | `api/src/routes/records.ts:32`; `api/src/services/algorand.ts:82-100` | `checkAccess()` | **`— none —`** | The grant *is* checked — against a **self-asserted identity** (`records.ts:7`, `:30`). Residual risk: the facilitator's settlement verdict is not re-verified against algod (standard x402 trust model; SEC-057). | **PARTIALLY IMPLEMENTED — DEFEATED BY S-1** |
| **SEC-007** — paying identity cryptographically bound to the asserted requester identity | **none** | **`— none —`** | — | **`— none —`** (TC-110…TC-113 absent) | **`— none —`**. **G-01, CRITICAL.** Fix is compile-verified: `decodePaymentSignatureHeader` from `@x402/core/http` + `decodeTransaction`/`getSenderFromTransaction` from `@x402/avm`; full patch in `ENGINEERING_GAP_REPORT.md` §4. Masked in the demo only because `LiveDemoPanel.tsx:38` sends `requesterAddress: wallet.address`. | **NOT IMPLEMENTED** |
| **SEC-008** — audit trail accurately attributes each access to the party that made it | **none** | **`— none —`** (the value written is `records.ts:49`'s `requesterAddress`, taken from the body) | `log_access` argument 1 | **`— none —`** (TC-113 absent) | **`— none —`**. Second-order consequence of S-1: a forged `requesterAddress` becomes a **false, permanent on-chain attribution** — worse than no audit trail, because the record is trusted precisely for being on-chain. | **NOT IMPLEMENTED** |
| **SEC-009** — consent reads require no fee and submit no transaction | Chain integration service | `api/src/services/algorand.ts:98`, `:119` (`atc.simulate()`) | `checkAccess`, `getAuditCount` | `— none —` (TC-140…TC-142 absent) | Source only. Note the coupling: `simulate` still needs a sender and signer, so `getOperator()` (`algorand.ts:8-14`) makes the **free, unauthenticated** `/v1/consent/status` hard-depend on `OPERATOR_MNEMONIC`. | **IMPLEMENTED** |
| **SEC-010** — address-shaped inputs validated for checksum, not merely length | **none** | `api/src/routes/records.ts:6-7`; `api/src/routes/consent.ts:7-8` — `.length(58)` only; no `.refine(algosdk.isValidAddress)` | zod schemas | `— none —` (TC-172 absent) | Reviewer-reproduced: `GET /v1/consent/status?patient=AAAA…(58 chars)` → **HTTP 500** `{"error":"wrong checksum for address"}`. `algosdk.decodeAddress` throws at `algorand.ts:48-50`. G-10. | **NOT IMPLEMENTED** |
| **SEC-011** — internal exception messages not returned to unauthenticated callers | error handler | `api/src/app.ts` logs server-side against a `requestId` and returns a generic `INTERNAL_ERROR` body | `app.spec.ts` "never echoes an internal exception message" | **IMPLEMENTED** | ~~`api/src/app.ts:58-61` returned `err.message` verbatim | `app.onError` | `— none —` (TC-173 absent) | Same reproduction as SEC-010: the internal message reached an anonymous caller. G-10. | **NOT IMPLEMENTED** |
| **SEC-012** — operator/admin key protected commensurate with its authority | **none** | `api/src/config.ts:58` (`OPERATOR_MNEMONIC` env var); `api/src/services/algorand.ts:8-14` | operator account | `— none —` | One hot key holds three separable powers: forge audit entries (`contract.py:222`), rotate admin irreversibly (`:126`), drain the app account (`:258-259`). No multisig, no HSM, no rotation runbook. Acknowledged in `docs/SECURITY.md`. | **NOT IMPLEMENTED** |
| **SEC-013** — public endpoints rate-limited | **none** | **`— none —`** — no rate-limit middleware anywhere in `api/src/app.ts` | all routes | `— none —` (TC-176 absent) | Two abuse paths: exhausting the API, and amplifying traffic at public AlgoNode (`/v1/consent/status` makes **two** sequential algod calls per free request). **Sharpened by G-03:** a consent-denied `/v1/records/summary` call costs the caller **nothing** and costs MedRail **one Algorand transaction fee** (`records.ts:37`) — an unauthenticated fee-drain against the operator account, and if that account empties, `log_access` stops working for everyone. | **NOT IMPLEMENTED** |
| **SEC-014** — dependencies scanned for known vulnerabilities on every change | **none** | **`— none —`** — no `npm audit`, `pip-audit`, Dependabot or CodeQL step in `.github/workflows/ci.yml` | CI | `— none —` (TC-204 absent) | Reviewer-executed — the **first dependency scan ever run against this repository**: `npm audit` reports **1 high** in both packages, `nanoid@3.3.17` / [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8). In `api/` it is a devDependency (`vitest → vite → postcss`) and does **not** ship; in `web/` it is a production dependency (`next@16.3.0 → postcss`) and **does** ship, because `web/Dockerfile:14` copies the full `node_modules`. G-16, G-27. | **NOT IMPLEMENTED** |
| **SEC-015** — container build contexts exclude secret material | **none** | **`— none —`** — no `.dockerignore` anywhere; `api/Dockerfile:1-3` builds from the repo root | Docker build context | `— none —` (TC-204 absent) | Reviewer-verified: `api/.env` and `contracts/.env`, both holding live mnemonics, enter the build context. **No secret lands in a published layer today** (only explicit paths are `COPY`'d at `api/Dockerfile:7-20`) — the margin is one careless `COPY api/ ./api/` wide. G-13. | **NOT IMPLEMENTED** |
| **SEC-016** — transport to the public API is HTTPS-only | Container & platform config | `api/fly.toml:16` (`force_https = true`) | Fly.io HTTP service | `— none —` | Transport is covered; **no HSTS, CSP, `X-Content-Type-Options` or `Referrer-Policy` is set by the app** (SEC-051). | **PARTIALLY IMPLEMENTED** |

### 3.2 Newly allocated by `06_Security/` (SEC-050…SEC-058)

| Requirement | Design Component | Implementation (file:line) | API/Module | Test Case | Evidence | Status |
|---|---|---|---|---|---|---|
| **SEC-050** *(new)* — validate `NETWORK` at startup; refuse to boot on an unrecognised value | **none** | `api/src/config.ts:42` — unchecked `as NetworkName` cast | `config` | `— none —` | A typo yields `undefined` CAIP-2, asset id and algod URL, deferring failure to request time. `Security_Architecture.md` §7.2; risk RT-08. | **NOT IMPLEMENTED** |
| **SEC-051** *(new)* — API sets HSTS / `X-Content-Type-Options` / `Referrer-Policy`; web sets CSP | **none** | **`— none —`** — no header middleware in `api/src/app.ts`; `web/next.config.ts` is empty | all responses | `— none —` | `Security_Architecture.md` §15.2; risk RS-12 | **NOT IMPLEMENTED** |
| **SEC-052** *(new)* — a settlement proof is single-use | **none** | **`— none —`** — MedRail holds no state with which to implement one (**NFR-001**) | `PAYMENT-SIGNATURE` | `— none —` | The AVM note is `x402-payment-v2-<ms>` (`@x402/avm/dist/cjs/index.js:266`) — a **client-generated timestamp, not a server nonce**. No replay/nonce symbols in the SDK's exported type surface. Facilitator behaviour was not exercised and **cannot be determined from this repository**. Threat T-09. | **UNVALIDATED** |
| **SEC-053** *(new)* — clinical reference table integrity-verified and not runtime-writable | **none** | `api/src/services/interactionChecker.ts:18` — `readFileSync` at module load, no checksum, no signature | `interactions.json` | `— none —` | Also an availability dependency: a missing or malformed file throws during module init and **the entire API fails to start**. Threat T-25. | **NOT IMPLEMENTED** |
| **SEC-054** *(new)* — the 402 states the exact price before the caller commits funds | x402 middleware | `api/src/x402.ts:16-32` | `PAYMENT-REQUIRED` | `x402-flow.spec.ts` TC-029/TC-031 assert the advertised amount — price *disclosure* only | Price is advertised; MedRail enforces **no per-caller cap** and has no per-caller identity with which to. Threat T-A1. | **PARTIALLY IMPLEMENTED** |
| **SEC-055** *(new)* — audit-writer role separable from contract-owner role | **none** | `contract.py:222`, `:126`, `:258` all assert against the **same** `self.admin.value` | `MedRailConsent` | `— none —` | One key, three powers. Threat T-03. | **NOT IMPLEMENTED** |
| **SEC-056** *(new)* — consent relationships not publicly correlatable | **none** | `contract.py:151` — the patient is `Txn.sender` and the requester is ABI arg 0, both cleartext in the transaction. The **box key** is hashed (`:96-98`); the **transaction** is not. | `grant_access` | `— none —` | Reviewer-executed: one unauthenticated indexer query recovered **two complete `(patient, requester, scope)` triples** from the public `grant_access` transactions on app `768743428`. This is the reconnaissance step for G-01 and, independently, a privacy property of the design. | **NOT IMPLEMENTED** |
| **SEC-057** *(new)* — independently re-verify the settled transaction against algod before serving or logging | **none** | **`— none —`** — `api/src/x402.ts:6` trusts the facilitator verdict | settlement path | `— none —` | Cheap here: MedRail already holds an algod client (`algorand.ts:5`). Threat T-06, accepted residual. | **NOT IMPLEMENTED / RECOMMENDED** |
| **SEC-058** *(new)* — `FACILITATOR_URL` allowlisted and required to be `https:` | **none** | `api/src/config.ts:47` — accepted verbatim from the environment | facilitator client | `— none —` | Whoever can set that env var redirects every payment payload and controls the settlement verdict. Threat T-08. | **NOT IMPLEMENTED / RECOMMENDED** |

---

## 4. PERF — Performance requirements

**No performance requirement in this system has an agreed target, a benchmark, or a measurement harness.** The only numbers that exist anywhere are the four single observations below; none is a percentile, a throughput, or an SLO, and none may be presented as one.

| Requirement | Design Component | Implementation (file:line) | API/Module | Test Case | Evidence | Status |
|---|---|---|---|---|---|---|
| **PERF-001** — 402 challenge served without a per-request outbound call | x402 middleware | `api/src/x402.ts:6`, `:11-14` — the facilitator's `/supported` is fetched once at `initialize()` and the payment kinds cached | `PAYMENT-REQUIRED` generation | `— none —` | Reviewer-measured: **~15 ms** warm, single observation. The same caching is why **REL-001** fails cold. | **IMPLEMENTED** |
| **PERF-002** — `/v1/consent/status` within a defined latency budget under a defined workload | **none** | `api/src/routes/consent.ts:19-31` (two sequential algod round trips: `getTransactionParams` then `simulate`) | `GET /v1/consent/status` | `— none —` | Reviewer-measured: **505 ms** cold, single observation. **No budget has ever been defined** — do not read 505 ms as a target. | **NOT IMPLEMENTED** |
| **PERF-003** — paid endpoint latency measured and published (p50/p95/p99) under concurrency | **none** | **`— none —`** | — | `— none —` | No load test, no benchmark, no tooling anywhere in the repository. | **NOT IMPLEMENTED** |
| **PERF-004** — the audit-log write does not block the paid response path | **none** | `api/src/routes/records.ts:49` — `await logAccess(...)` inline before the response is built | `POST /v1/records/summary` | `— none —` | Structural: Algorand confirmation latency (`atc.execute(algod, 4)` waits 4 rounds, roughly 14 s worst case, at `algorand.ts:175`) sits on the paid response path, serialised per patient by `withPatientLock`. | **NOT IMPLEMENTED** |

---

## 5. REL — Reliability requirements

| Requirement | Design Component | Implementation (file:line) | API/Module | Test Case | Evidence | Status |
|---|---|---|---|---|---|---|
| **REL-001** — facilitator outage degrades priced endpoints gracefully | **none** | `api/src/x402.ts:6-14` — no timeout, no retry, no circuit breaker, no cached-`/supported` fallback | all three priced routes | `— none —` (TC-170 absent) | Reviewer-reproduced with `FACILITATOR_URL` on a closed port: `POST /v1/triage` → **HTTP 500** `"Failed to initialize: no supported payment kinds loaded from any facilitator."`, **no `PAYMENT-REQUIRED` header**, no `Retry-After`. Root cause: `accepts[].asset` and `extra.feePayer` come from the facilitator, so the 402 cannot be built offline. G-04. | **NOT IMPLEMENTED** |
| **REL-002** — a settled payment is never consumed without delivering the resource or recording a recoverable failure | x402 middleware (SDK) | `node_modules/@x402/hono/dist/esm/index.mjs:203-232` — `processSettlement` is reachable **only** when the handler returns status < 400; a throw triggers `cancel({reason:"handler_threw"})` and any status ≥ 400 triggers `cancel({reason:"handler_failed"})` and returns before settlement | payment middleware | `— none —` (TC-103, TC-134 absent — they would lock the property in) | **Satisfied structurally by the SDK, not by MedRail code.** Every MedRail error path — the 403 denial, a 400 on malformed input, a 500 from a failed `logAccess` — lands in the phase before money moves. The former "R-2 money loss" finding is **withdrawn**. What survives is smaller and inverted: the unguarded `await logAccess` at `records.ts:49` (contrast the defensive `.catch(() => undefined)` at `:37`) turns a transient chain failure into a 500 that **forfeits a legitimate sale**, not a caller's money. | **VALIDATED** |
| **REL-003** — outbound algod calls have explicit timeout and bounded retry | **none** | `api/src/services/algorand.ts:5` — `new algosdk.Algodv2("", config.algodServer, "")`, no options | all chain reads and the one write | `— none —` (TC-174, TC-175 absent) | `atc.execute(algod, 4)` at `algorand.ts:175` waits 4 rounds (~14 s) then throws. A single AlgoNode blip becomes a user-visible 500 on `/v1/consent/status` and `/v1/records/summary`. | **NOT IMPLEMENTED** |
| **REL-004** — concurrent audit writes for one patient do not collide on a predicted box key | Chain integration service | `api/src/services/algorand.ts:123-138` (`withPatientLock`, an **in-process** per-patient promise chain); prediction at `:158-159`; box refs declared at `:169-172` | `logAccess()` | `— none —` (TC-130…TC-134 absent) | **Reframed** The contract self-assigns the sequence (`contract.py:224-226`), so a race **cannot corrupt or misorder the log**; `predictedSeq` exists only to populate the AVM box-reference array. A losing racer declares a box name the contract does not write, and the AVM **rejects the transaction**. Classification is **availability**, not integrity. Contradicted by `api/fly.toml:17-19` (`auto_start_machines = true`; `min_machines_running = 1` is a floor, not a ceiling). G-11. | **PARTIALLY IMPLEMENTED** |
| **REL-005** — free endpoints remain available when the facilitator is unreachable | API route layer | `api/src/routes/health.ts:6-14`; `api/src/routes/consent.ts:33-40`; `api/src/app.ts:236-292` — none touches the facilitator | 4 free routes | `x402-flow.spec.ts "health check is free and unpaid"` (TC-028) — **partial**: it proves the route is unpriced, not that it survives an outage (TC-171 absent) | Reviewer-reproduced with the facilitator down: `/v1/health`, `/`, `/v1/consent/app-info` all returned **200**. Blast radius is confined to the three priced routes. | **VALIDATED** |
| **REL-006** — app account holds sufficient balance for the box MBR it must create | `MedRailConsent` contract + Container & platform config | `contract.py:129-138` (`fund_mbr`); `contracts/scripts/deploy_testnet.py:112-126` (5 ALGO at deploy) | `fund_mbr` ABI | `— none —` (TC-154 absent — `fund_mbr` has no test) | On-chain: app account `CCO26Y6Z56DDZ3OELO2UKJMIPJVSIT52I23F2MPMR52JBM3HQZZNUZNOR4` holds 5,000,000 µALGO against a min-balance of 145,000 µALGO; funding tx `KYH3H5CG2CCUPUUTJIBX47WD4RWSUV3QWTEUJQRQFYLWO5YAO3QA` (TC-050). **No monitoring, no alerting**, and the advertised per-box cost is 400 µALGO too low (FR-032). | **PARTIALLY IMPLEMENTED** |

---

## 6. OPS — Operability requirements

### 6.1 Canonical (OPS-001…OPS-008)

| Requirement | Design Component | Implementation (file:line) | API/Module | Test Case | Evidence | Status |
|---|---|---|---|---|---|---|
| **OPS-001** — health endpoint suitable for an orchestrator probe | API route layer | `api/src/routes/health.ts:6-14` | `GET /v1/health` | `x402-flow.spec.ts "health check is free and unpaid"` (TC-028) — proves the route, **not the probe wiring** | **Wired to nothing:** no `HEALTHCHECK` in `api/Dockerfile`, no `[[http_service.checks]]` in `api/fly.toml:14-19`. D-6 / OPS-054. | **IMPLEMENTED** |
| **OPS-002** — structured logs with a request correlation id | **none** | `api/src/app.ts:59` (`console.error(err)`) and one `console.log` at boot — that is the entire logging surface | — | `— none —` | No request IDs, no log levels, no never-log list. G-15. | **NOT IMPLEMENTED** |
| **OPS-003** — metrics exported (request rate, error rate, latency, settlement outcomes) | **none** | **`— none —`** | — | `— none —` | The operator cannot answer how many payments settled or how much arrived at `payTo`. G-15. | **NOT IMPLEMENTED** |
| **OPS-004** — distributed tracing across API → facilitator → algod | **none** | **`— none —`** | — | `— none —` | G-15 | **NOT IMPLEMENTED** |
| **OPS-005** — alerting on operator balance, app-account MBR headroom, settlement failure rate | **none** | **`— none —`** | — | `— none —` | Operator-balance exhaustion turns every paid records call into a 500 and is **invisible until it breaks the demo**. G-15. | **NOT IMPLEMENTED** |
| **OPS-006** — CI verifies every component on every change to the default branch | CI/CD pipeline | `.github/workflows/ci.yml:3-6` — `push: branches: [main]`; three jobs at `:9`, `:27`, and the `web` job | GitHub Actions | `— none —` (TC-200 absent) | Reviewer-verified: the repository's **only branch is `master`** and it has no PRs, so **no push has ever triggered CI and none will**. All three jobs pass locally (§18 of the fact ledger). The workflow is correct; it has simply never fired. G-06. | **PARTIALLY IMPLEMENTED** |
| **OPS-007** — backup and restore defined for all stateful components | (design property) | Durable state is Algorand box storage only, replicated by the network | — | `— none —` | The only irreplaceable local secret is `OPERATOR_MNEMONIC`, for which **no backup or rotation procedure is documented**. | **NOT APPLICABLE / PARTIALLY ADDRESSED** |
| **OPS-008** — RPO and RTO defined | **none** | **`— none —`** | — | `— none —` | Never established. No target is invented here. | **NOT IMPLEMENTED** |

### 6.2 Newly allocated by `08_Deployment/` and `10_Operations/` (OPS-050…OPS-057, OPS-059…OPS-062)

| Requirement | Design Component | Implementation (file:line) | API/Module | Test Case | Evidence | Status |
|---|---|---|---|---|---|---|
| **OPS-050** *(new, `Deployment_Architecture.md`)* — the API container receives the consent App ID by configuration, not by reading a build-time artefact | Container & platform config | `api/src/config.ts:56` falls back to `readDeployedAppId()`; `api/fly.toml:9-12` sets no `CONSENT_APP_ID` | `config.consentAppId` | `— none —` (TC-203 absent) | D-1. `requireConsentAppId()` (`config.ts:61-68`) throws ⇒ 500 on both chain-backed routes. | **NOT IMPLEMENTED** |
| **OPS-051** *(new)* — the committed default deployment config targets a network where `MedRailConsent` exists | Container & platform config | `api/fly.toml:10` — `NETWORK = "mainnet"` | Fly.io `[env]` | `— none —` | D-2. No MainNet deployment of `MedRailConsent` exists; `contracts/artifacts/` contains no `deploy_mainnet.json`. | **NOT IMPLEMENTED** |
| **OPS-052** *(new)* — `.dockerignore` at every build root | Container & platform config | **`— none —`** — no `.dockerignore` in the repository | Docker | `— none —` | D-3, D-5. Also ships `contracts/.venv/` and both `node_modules/` trees into the context. | **NOT IMPLEMENTED** |
| **OPS-053** *(new)* — images install from the committed lockfile (`npm ci`) | Container & platform config | `api/Dockerfile:8`, `:17`; `web/Dockerfile:4` — all `npm install` | Docker | `— none —` | D-4. Images can drift from the dependency set CI validates with `npm ci`. | **NOT IMPLEMENTED** |
| **OPS-054** *(new)* — runtime image and platform config declare a healthcheck against `/v1/health` | Container & platform config | **`— none —`** in `api/Dockerfile`; **`— none —`** in `api/fly.toml:14-19` | Docker / Fly | `— none —` | D-6; the endpoint exists (OPS-001) and is purpose-built for this. | **NOT IMPLEMENTED** |
| **OPS-055** *(new)* — the platform runs no more API replicas than the audit-write serialisation supports | Container & platform config | `api/fly.toml:17-19` permits > 1 machine while `algorand.ts:123-138` serialises in-process only | Fly machines | `— none —` (TC-132 absent) | D-7; the hard horizontal-scaling blocker. Failure mode is a **rejected** `log_access`, per REL-004. | **NOT IMPLEMENTED** |
| **OPS-056** *(new, `CI_CD.md`)* — CI builds both container images and smoke-tests the API image | CI/CD pipeline | **`— none —`** — `.github/workflows/ci.yml` has no image job | GitHub Actions | `— none —` (TC-203 absent) | Neither Dockerfile has ever been built; **NFR-007** is **UNVALIDATED** for exactly this reason. | **NOT IMPLEMENTED** |
| **OPS-057** *(new, `Deployment_Architecture.md`)* — algod and indexer endpoints overridable by environment variable | **none** | `api/src/config.ts:21-29` — hardcoded per-network maps, no env override | `config.algodServer` | `— none —` | A stuck AlgoNode endpoint cannot be swapped without a code change and redeploy. Related: `config.indexerServer` (`:51`) is **read by nothing** — see §10.1. | **NOT IMPLEMENTED** |
| **OPS-059** *(new, `CI_CD.md`)* — every deployed build identifiable and redeployable by an immutable image tag/digest | CI/CD pipeline | **`— none —`** — `dist/` and `.next/` are built then discarded; nothing is tagged or retained | GitHub Actions | `— none —` | The reason API rollback is impossible today (`Rollback_Strategy.md` §1.2). | **NOT IMPLEMENTED** |
| **OPS-060** *(new, `Monitoring.md`)* — a synthetic canary exercises 402 → settle → 200 on a schedule | CI/CD pipeline | `api/scripts/e2e-proof.ts` **could** be one; it is invoked by no pipeline and no scheduler | script | `— none —` | Run manually exactly once (TC-056). | **NOT IMPLEMENTED** |
| **OPS-061** *(new, `Logging.md`)* — an HTTP request correlatable with the settlement transaction and the audit transaction it produced | **none** | **`— none —`** — `records.ts:57` returns `auditTxId` to the caller but nothing correlates it server-side | — | `— none —` | Without this, G-03's lost-sale condition is undetectable. | **NOT IMPLEMENTED** |
| **OPS-062** *(new, `Incident_Response.md`)* — incident severity, escalation and ownership defined; security contact published | **none** | **`— none —`** | — | `— none —` | No `SECURITY.md` disclosure contact, no on-call definition. | **NOT IMPLEMENTED** |

---

## 7. DATA — Data requirements

| Requirement | Design Component | Implementation (file:line) | API/Module | Test Case | Evidence | Status |
|---|---|---|---|---|---|---|
| **DATA-001** — consent state keyed by a collision-resistant digest of `(patient, requester, scope)` | `MedRailConsent` contract | `contract.py:95-98` (`op.sha256`, 32 B); prefix `"g"` at `:114` | `grants` BoxMap | `test_consent.py::test_grant_then_check_access` (TC-004) | On-chain: 2 `g`-prefixed boxes, 100 total box bytes ⇒ 33-byte effective key + 17-byte value each | **VALIDATED** |
| **DATA-002** — audit entries append-only, never mutated or deleted | `MedRailConsent` contract | `contract.py:228-234` — the only write to `audit_log`, always at a fresh `next_seq`; no method deletes | `audit_log` BoxMap | `test_consent.py::test_log_access_admin_only` (TC-010) | Verified by reading all 13 ABI methods: none writes an existing `audit_log` key. TC-159 (monotonic continuation over pre-existing entries) is absent. | **IMPLEMENTED** |
| **DATA-003** — scope is a free-form string, not an enumeration | `MedRailConsent` contract | `contract.py:141`, `:149`, `:179`, `:198`, `:218` — `scope: String` throughout | all consent ABI methods | `— none —` | New endpoints need no contract change. The only scope in this build is `records:summary` (`api/src/routes/records.ts:10`). | **IMPLEMENTED** |
| **DATA-004** — the record payload is synthetic and contains no real patient data | API route layer | `api/src/routes/records.ts:15-21` — one fixed constant, returned regardless of `patientId` | `POST /v1/records/summary` | `— none —` (TC-100 absent) | There is no patient datastore of any kind. Honestly disclosed in `docs/SECURITY.md` and at `records.ts:13-14`. | **IMPLEMENTED** |
| **DATA-005** — the interaction reference table carries provenance in every response | Static data + Intelligence layer | `api/src/data/interactions.json` `"source"`; surfaced at `api/src/services/interactionChecker.ts:52` | `POST /v1/interaction-check` | `interactionChecker.spec.ts "always includes a source citation and disclaimer"` (TC-027) | The citation names a reference **class** ("Lexicomp/Micromedex-class severity classifications"), not a licensed dataset. **DATA-005 is satisfied by the string being present, not by its content being verified** (SEC-053). | **VALIDATED** |
| **DATA-006** — off-chain encrypted storage with on-chain content-address pointers | **none** | **`— none —`** | — | `— none —` | Described as a design direction in `docs/SECURITY.md`. **No encryption pipeline exists.** | **PLANNED** |

---

## 8. AI — Deterministic intelligence layer

**There is no ML model, no LLM, no embedding store and no vector database in this system.** These requirements govern two rule engines: an 11-group keyword scorer and a 14-pair table lookup — 25 rules in total. Several IDs exist specifically to record that conventional model-evaluation requirements are unmet and, in most cases, not applicable.

### 8.1 Canonical (AI-001…AI-008)

| Requirement | Design Component | Implementation (file:line) | API/Module | Test Case | Evidence | Status |
|---|---|---|---|---|---|---|
| **AI-001** — scoring logic transparent and auditable; no opaque model in the decision path | Intelligence layer | `api/src/services/triageScorer.ts:32-73`; `api/src/services/interactionChecker.ts:36-55` | pure functions | `— none —` (absence of a model is not directly assertable) | Both services are pure functions over static tables. No dependency in `api/package.json` is a model runtime. | **VALIDATED** |
| **AI-002** — every response states it is not a diagnosis | Intelligence layer | `api/src/services/triageScorer.ts:18-21`; `api/src/services/interactionChecker.ts:20-23` | both services | `triageScorer.spec.ts "always includes the non-diagnostic disclaimer"` (TC-020); `interactionChecker.spec.ts "always includes a source citation and disclaimer"` (TC-027) | Safety text treated as a tested correctness property — a deliberate and creditable choice | **VALIDATED** |
| **AI-003** — the triage score is not presented as a clinical severity measure | Intelligence layer | `api/src/services/triageScorer.ts:46-51` (band names), `:18-21` (disclaimer) | `POST /v1/triage` | `— none —` | Rationale in `docs/IMPLEMENTATION_PLAN.md` §4. **Materially weakened by AI-090:** a negated mention inflates the band to `urgent`. | **IMPLEMENTED** |
| **AI-004** — interaction findings cite their reference class | Intelligence layer + Static data | `api/src/services/interactionChecker.ts:52`; `api/src/data/interactions.json:2` | `POST /v1/interaction-check` | `interactionChecker.spec.ts "always includes a source citation and disclaimer"` (TC-027) | Reference **class**, not a licensed dataset — stated as such | **VALIDATED** |
| **AI-005** — rule coverage, sensitivity and specificity measured against a labelled clinical dataset | **none** | **`— none —`** | — | `— none —` | No dataset, no evaluation harness, no metric — **and none is claimed**. This is the honest position, not a hidden gap. | **NOT IMPLEMENTED** |
| **AI-006** — matching produces no false positives on short or malformed medication names | **none** | `api/src/services/interactionChecker.ts:42-43` — `m.includes(a) \|\| a.includes(m)`, symmetric and unanchored | `checkInteractions()` | **`— none —`** (TC-180, TC-185 absent) | **Measured by execution 2026-08-21:** `checkInteractions(["a","b"])` → `flagged: true`, **5 matches** incl. `warfarin+aspirin` (major) and `maoi+sertraline` (contraindicated); `checkInteractions(["in","as"])` → 4 matches. **TC-027 calls exactly `["a","b"]` and asserts only the disclaimer — the suite exercises the defect on every green run and never notices.** G-21. | **NOT IMPLEMENTED** |
| **AI-007** — free-text clinical input never written to the public ledger | API route layer | `api/src/routes/records.ts:10-11` (constant `SCOPE`, `ENDPOINT`), `:37`, `:49` (constant `action` strings) | `logAccess()` arguments | `— none —` (TC-184 absent) | Correct by construction: `/v1/triage` and `/v1/interaction-check` never call `logAccess` at all, and `records.ts` passes only constants. **Currently unasserted.** | **IMPLEMENTED** |
| **AI-008** — the intelligence layer is swappable without changing the payment or consent layers | Intelligence layer | `api/src/routes/triage.ts:16`; `api/src/routes/interaction.ts:16` — one pure call behind a route boundary | route → service seam | `— none —` | Structural property, not a tested one | **IMPLEMENTED (by construction)** |

### 8.2 Newly allocated by `09_Intelligence_Layer/` (AI-050…AI-059) and `07_Testing/` (AI-090)

| Requirement | Design Component | Implementation (file:line) | API/Module | Test Case | Evidence | Status |
|---|---|---|---|---|---|---|
| **AI-050** *(new)* — negation in symptom text suppresses or inverts the matched red-flag group | **none** | `api/src/services/triageScorer.ts:59` — a bare `normalized.includes(kw)` | `scoreTriage()` | **`— none —`** (TC-186 absent) | Measured: `"no chest pain"` ⇒ score 35, band `urgent`. Overlaps **AI-090**, which states the same property from the testing side. | **NOT IMPLEMENTED** |
| **AI-051** *(new)* — lay terms, abbreviations and synonyms resolve to the canonical red-flag group | **none** | `api/src/services/triageScorer.ts:32-44` — literal phrases only | `scoreTriage()` | `— none —` | Measured: `"heart attack"`, `"MI"`, `"SOB"` ⇒ score 0, band `routine` | **NOT IMPLEMENTED** |
| **AI-052** *(new)* — medication matching anchored at token boundaries or resolved via a normalised vocabulary | **none** | `api/src/services/interactionChecker.ts:42-43` | `checkInteractions()` | `— none —` (TC-181 absent) | The named fix for AI-006 / G-21 | **RECOMMENDED** |
| **AI-053** *(new)* — a clinician-adjudicated labelled corpus exists before any accuracy claim | **none** | **`— none —`** | — | `— none —` | No dataset, no harness. Restates AI-005 as a gating precondition. | **NOT IMPLEMENTED** |
| **AI-054** *(new)* — non-English input recognised, or explicitly rejected rather than silently scored `routine` | **none** | `api/src/routes/triage.ts:6` accepts any string 1–2000 chars | `POST /v1/triage` | `— none —` | Measured: `"dolor de pecho"` ⇒ score 0, band `routine` — silently, with a confident-looking response | **NOT IMPLEMENTED** |
| **AI-055** *(new)* — the score carries a documented, calibrated interpretation | **none** | `api/src/services/triageScorer.ts:33-43` — 11 weights with no stated derivation | `scoreTriage()` | `— none —` | The bands at `:46-51` are thresholds over an uncalibrated ordinal | **NOT IMPLEMENTED** |
| **AI-056** *(new)* — patient and prescription context accepted and used | **none** | `api/src/routes/triage.ts:5-7`; `api/src/routes/interaction.ts:5-7` — no such field in either schema | both priced intelligence routes | `— none —` | No age, pregnancy, comorbidity, dose, route or duration input exists | **NOT IMPLEMENTED** |
| **AI-057** *(new)* — per-entry citations, table version and revision date | **none** | `api/src/data/interactions.json:2` — one collective, class-level provenance string; no version field | `interactions.json` | `— none —` | Related to SEC-053 (no integrity verification of the same file) | **NOT IMPLEMENTED** |
| **AI-058** *(new)* — a regression test asserts a single-character or garbage medication list flags nothing | **none** | **`— none —`** | `api/test/interactionChecker.spec.ts` | **`— none —`** (would be TC-180) | `interactionChecker.spec.ts:33-37` calls exactly this input and asserts nothing about `flagged` | **RECOMMENDED** |
| **AI-059** *(new)* — every free-text field has an explicit maximum length | API route layer | `api/src/routes/triage.ts:6` caps at 2000 chars; `api/src/routes/interaction.ts:6` caps the **array** at 20 items but sets **no per-item maximum** (`z.string().min(1)`) | both priced intelligence routes | `— none —` (TC-182, TC-183 absent) | A 20-element array of arbitrarily long strings is accepted | **PARTIALLY IMPLEMENTED** |
| **AI-090** *(new, added by `07_Testing/Test_Cases.md`)* — triage scoring shall not score a negated symptom mention as if the symptom were present | **none** | `api/src/services/triageScorer.ts:58-63` — unqualified substring scan, no negation handling of any kind | `scoreTriage()` | **`— none —`** (TC-186 absent) | **Measured by execution 2026-08-21:** `scoreTriage("I have no chest pain")` ⇒ `{score: 35, band: "urgent", matchedFlags: ["possible cardiac chest pain"]}`. `"denies chest pain"` and `"chest pain resolved"` behave identically. G-26. **NFR-009 still holds** — the behaviour is exactly what the source says it is — but **AI-003** is materially weakened. | **NOT IMPLEMENTED** |

---

## 9. Coverage summary

### 9.1 Counting rule

Each requirement is placed in exactly one bucket by reading its own `Test Case` and `Evidence` cells above:

| Bucket | Definition |
|---|---|
| **A — verified by an automated test** | The `Test Case` cell names a real, currently-passing test function. |
| **B — on-chain evidence, no automated test** | The `Test Case` cell is `— none —` but `Evidence` cites an Algorand TestNet transaction id or an indexer-observed artifact. |
| **C — manual/executed evidence only** | Neither A nor B, but `Evidence` records something a reviewer actually **ran** — the service, a build, a scanner, an indexer query, a measurement. |
| **D — no verifying evidence** | `Evidence` is `— none —`, or is a source path only. A source path shows that code *exists*; it does not show that it *works*. |

A requirement in bucket **A** may *additionally* carry on-chain evidence; the overlap is reported separately rather than double-counted.

### 9.2 Counts

| Prefix | Total | **A** automated test | **B** on-chain only | **C** manual/executed only | **D** none |
|---|---|---|---|---|---|
| FR (incl. FR-100, FR-101) | **42** | 23 | 4 | 2 | 13 |
| NFR | **12** | 1 | 0 | 1 | 10 |
| SEC (incl. SEC-050…058) | **25** | 2 | 2 | 6 | 15 |
| PERF | **4** | 0 | 0 | 2 | 2 |
| REL | **6** | 1 | 1 | 1 | 3 |
| OPS (incl. OPS-050…062) | **20** | 0 | 0 | 1 | 19 |
| DATA | **6** | 3 | 0 | 0 | 3 |
| AI (incl. AI-050…059, AI-090) | **19** | 2 | 0 | 5 | 12 |
| **Total** | **134** | **73** | **7** | **18** | **77** |

Derived percentages (arithmetic over the counts above, not estimates):

| Measure | Count | Share of 134 |
|---|---|---|
| Verified by an automated test (**A**) | 32 | **23.9 %** |
| Carrying on-chain evidence (**B** ∪ the 5 A-rows that also have a transaction id: FR-018, FR-020, FR-023, FR-024, DATA-001) | 12 | **9.0 %** |
| Verified by an automated test **or** on-chain evidence (**A** ∪ **B**) | 39 | **29.1 %** |
| Manual/executed evidence only (**C**) | 18 | **13.4 %** |
| **No verifying evidence at all (D)** | **77** | **57.5 %** |

Restricted to the **100 canonical registry IDs**, all 32 automated-test requirements fall inside that set, so registry-only automated coverage is **32 / 100 = 32 %**.

### 9.3 Two figures that must not be confused

- **32 tests exist** (14 Python + 18 TypeScript, all passing, 0.41 s + 4.08 s).
- **32 requirements have automated coverage.**

The equality is arithmetic coincidence. The two sets do not correspond one-to-one: `x402-flow.spec.ts` covers four FR IDs in one test, while eleven contract tests cover one ID each.

### 9.4 Reconciliation with `07_Testing/Test_Cases.md` §4

That document's roll-up reports the same **total** of 32 automated-coverage requirements but distributes them slightly differently by prefix (FR 22 / SEC 3 / REL 0 / DATA 2 / AI 3 against FR 23 / SEC 2 / REL 1 / DATA 3 / AI 2 here). The differences are at the boundary of "does this test really verify this requirement":

- **FR-038** — TC-032 asserts `400 || 402`, documenting middleware ordering rather than verifying the schema. Counted here; excluding it reproduces 22.
- **REL-005** — TC-028 proves the route is unpriced but never creates the outage condition. Counted here as partial.
- **SEC-003** — verified on-chain (bucket B), not by a contract test with a foreign sender.
- **DATA-005 / AI-004** — both hang off the single test TC-027.

`Test_Cases.md` §4 also counts a passing test **or an automated CI gate**, which admits **NFR-005** (`tsc --noEmit`); this matrix counts only named test functions and places NFR-005 in bucket C. Neither rule is wrong; this document states its rule so the numbers can be re-derived cell by cell.

**No coverage percentage of source code appears anywhere in this document.** No `--coverage` flag, threshold or report exists in this repository (TC-202), so no code-coverage figure may be quoted.

---

## 10. Untraceable requirements

77 requirements (57.5 %) have no verifying evidence. They split into two materially different populations.

### 10.1 Implemented but untested — 38 requirements

**This is the population that matters.** Each describes behaviour that ships today with nothing proving it works.

| Prefix | IDs | Why the absence matters |
|---|---|---|
| **FR** (12) | FR-010, FR-011, FR-012, FR-014, FR-015, FR-017, FR-030, FR-033, FR-035, FR-036, FR-037, FR-101 | FR-010/011/012 are the flagship consent-gated flow — see §12. FR-030 (`fund_mbr`) handles money and has no test at all. FR-033/035/036/037 are the entire frontend, which has **no test runner installed**. |
| **NFR** (10) | NFR-001, NFR-002, NFR-003, NFR-004, NFR-006, NFR-007, NFR-008, NFR-010, NFR-011, NFR-012 | **NFR-008** (the backend never holds a patient key) is the single hardest thing to get right in a consent system, is currently right, and has no permanent guard. **NFR-011** is three unsynchronised implementations of one hash; drift produces a silent `false`, not an error. **NFR-006** guards a CORS regression that has already happened once. **NFR-003 carries a VALIDATED label supported only by a source reading** — the one place in the registry where the label outruns its evidence. |
| **SEC** (5) | SEC-006, SEC-009, SEC-012, SEC-016, SEC-054 | SEC-006 is checked but defeated (S-1). SEC-009's zero-fee property depends on `simulate()` staying in place; nothing pins it. |
| **REL** (2) | REL-002, REL-004 | **REL-002 is VALIDATED on the strength of reading the installed SDK, not a MedRail test.** An SDK upgrade could silently withdraw the property. TC-103 and TC-134 exist precisely to pin it and are absent. |
| **OPS** (2) | OPS-001, OPS-007 | The health endpoint exists and is wired to no probe. |
| **DATA** (2) | DATA-003, DATA-004 | Append-only-ness (DATA-002) is tested; free-form scope and synthetic-payload guarantees are not. |
| **AI** (5) | AI-001, AI-003, AI-007, AI-008, AI-059 | **AI-007** (no free-text on the ledger) is correct by construction and unasserted; a future `logAccess` argument change would break it silently. |

### 10.2 No implementation exists — 39 requirements

FR-039 · SEC-007, SEC-008, SEC-013, SEC-050, SEC-051, SEC-052, SEC-053, SEC-055, SEC-057, SEC-058 · PERF-003, PERF-004 · REL-003 · OPS-002, OPS-003, OPS-004, OPS-005, OPS-008, OPS-050…OPS-057, OPS-059…OPS-062 · DATA-006 · AI-005, AI-052, AI-053, AI-055, AI-056, AI-057, AI-058.

These are honest absences rather than hidden failures — every one is labelled **NOT IMPLEMENTED**, **PLANNED** or **RECOMMENDED**. The consequential ones are **FR-039 / SEC-007 / SEC-008** (one gap, G-01, and the only CRITICAL of the three) and the OPS block, whose absence makes every other failure mode invisible.

### 10.3 Requirements whose only evidence *refutes* them

Three rows carry indexer or measurement evidence that the requirement is **not** met. They are counted in the appropriate bucket above, but they deserve naming, because a reader scanning the Evidence column could mistake a transaction id for a passing verdict:

| ID | Evidence | What it shows |
|---|---|---|
| **FR-012 / FR-025** | `total_audit_entries = 5`; zero `s`/`a` boxes on app `768743428` | The audit write has **never executed on TestNet** |
| **FR-032** | app account `min-balance = 145000` with 2 boxes ⇒ 22,500 µALGO/box | The ABI method returns 22,100 — it is wrong by 400 µALGO/box |
| **AI-006 / AI-090** | `checkInteractions(["a","b"])` → 5 matches; `scoreTriage("I have no chest pain")` → 35/`urgent` | Both defects were measured by execution, not inferred |

---

## 11. Reverse traceability — code and tests that map to no requirement

Traceability is only honest in both directions. The following exists in the repository and is claimed by no requirement ID.

### 11.1 Code with no requirement

| Artefact | Location | Assessment |
|---|---|---|
| **`config.indexerServer`** | `api/src/config.ts:51` | **Referenced by no module at all** — verified across `api/src/` and `api/scripts/` (only the definition matches). The running service never calls an indexer; every chain read goes through algod via `simulate`. Dead configuration that implies a capability the service does not have. G-29. It also matters for dependency documentation: AlgoNode **indexer** is a verification-only dependency used by humans and scripts, **not** a runtime dependency of the API. |
| **`config.usdcAssetId`** | `api/src/config.ts:49` | Likewise defined and never read. The asset id in the live 402 comes from the facilitator's `/supported`, not from this constant — which is exactly why REL-001 fails. Same class of defect as `indexerServer`; not separately numbered in the gap report. |
| **`@x402/extensions`** | `api/package.json:17`, pinned `2.21.0` | Declared and **imported nowhere** in `api/src`, `api/scripts`, `web/lib`, `web/components` or `web/app`. `docs/COMPLIANCE.md` cited it as evidence of implemented Bazaar discovery; that claim was downgraded during the review. G-17. |
| **`get_grant`** ABI method | `contract.py:211-215` | The 13th ABI method, exercised incidentally by TC-004/TC-007 assertions, but **claimed by no requirement**. FR-023 covers `check_access`; FR-028 covers the *audit* queries. `get_grant` is a public, readonly grant-detail query with no owning requirement and no dedicated test (TC-160, absent). |
| **`AccessGranted` / `AccessRevoked` events** | `contract.py:169-176`, `:195` | FR-024 requires an event only for `request_access`. These two are emitted **correctly** (there `Txn.sender` genuinely is the patient) but no requirement demands them and no test asserts their payload (TC-151, TC-152, absent). Any ARC-28 consumer depends on an untraced, unasserted contract. |
| **`contracts/scripts/opt_in_usdc.py`** | operator USDC opt-in helper | No requirement covers operator asset opt-in, which is nonetheless a precondition for FR-003 to settle. |
| **`api/scripts/dotenvLoad.ts`** | script bootstrap | Build-support code; no requirement, correctly. |
| **`web/lib/api.ts`** | `getHealth()`, `getConsentStatus()` | The frontend's own API client. FR-036 covers the health badge; **`getConsentStatus` (`web/lib/api.ts:24-33`, consumed by `web/components/ConsentChecker.tsx:6`) is covered by no FR** — FR-013 specifies the *server* endpoint, not the client that reads it. |
| **`web/components/DemoWalletCard.tsx`** | balance display + dispenser link | Rendered from `LiveDemoPanel.tsx:58`. FR-033 covers keypair generation; the balance/dispenser surface is untraced. |
| **CORS `allowHeaders` omission** | `api/src/app.ts:27-32` | A deliberate design decision documenting a real prior regression. NFR-006 covers "callable cross-origin"; **nothing requires the reflection behaviour that fixed the bug**, so a well-meaning future change could reinstate an allowlist and break every paid browser call again. |

### 11.2 Tests that assert less than their subject requires

| Test | TC | What it under-asserts |
|---|---|---|
| `test_consent.py::test_request_access_emits_event_and_counts` | TC-003 | Named for the **event**, asserts only `total_requests == 1`. **This is why defect C-1 / G-12 survives.** |
| `test_consent.py::test_withdraw_excess_admin_only` | TC-014 | Negative case only. The successful withdrawal path — including the `fee=0` inner-payment fee-pooling assumption at `contract.py:259` — is untested. |
| `interactionChecker.spec.ts "always includes a source citation and disclaimer"` | TC-027 | Calls `checkInteractions(["a","b"])`, which returns **5 spurious severe-interaction matches**, and asserts nothing about any of them. **The suite exercises the defect on every green run.** |
| `x402-flow.spec.ts "rejects malformed triage requests before the payment gate would even matter"` | TC-032 | Asserts `400` **or** `402` — an honest record of middleware ordering, but it verifies FR-038's schema layer only incidentally. |

### 11.3 Methods with no positive-path coverage

`fund_mbr` (`contract.py:129-138`) has **no test of any kind**. `withdraw_excess` (`:254-259`) has only a negative test. **Both handle funds.** G-25.

---

## 12. Critical-path traceability — the consent-gated flow

The seven requirements that constitute MedRail's flagship claim, isolated.

| Requirement | Design Component | Implementation (file:line) | Test Case | On-chain evidence | Status |
|---|---|---|---|---|---|
| **FR-010** — payment **and** valid grant required | API route layer + Chain integration service | `api/src/routes/records.ts:25-47`; `:32` | **`— none —`** | **`— none —`** | **UNVALIDATED** |
| **FR-011** — denial ⇒ 403 + audit attempt | API route layer | `api/src/routes/records.ts:33-47`; `:37`, `:43` | **`— none —`** | **`— none —`** | **UNVALIDATED** |
| **FR-012** — grant ⇒ audit entry + `auditTxId`/`auditSequence` | API route layer + contract | `api/src/routes/records.ts:49-60`; `algorand.ts:146-179`; `contract.py:217-236` | **`— none —`** | **Refuting:** `total_audit_entries = 5` | **UNVALIDATED** |
| **SEC-006** — authorisation against an on-chain grant | API route layer | `api/src/routes/records.ts:32` | **`— none —`** | **`— none —`** | **PARTIALLY IMPLEMENTED — DEFEATED BY S-1** |
| **SEC-007** — payer bound to asserted requester | **none** | **`— none —`** | **`— none —`** | **`— none —`** | **NOT IMPLEMENTED** |
| **SEC-008** — audit attributes the real accessor | **none** | **`— none —`** | **`— none —`** | **`— none —`** | **NOT IMPLEMENTED** |
| **REL-004** — concurrent audit writes do not collide on a predicted box key | Chain integration service | `api/src/services/algorand.ts:123-138`, `:158-172` | **`— none —`** | **`— none —`** | **PARTIALLY IMPLEMENTED** |

**Sub-matrix totals: 0 of 7 have an automated test. 0 of 7 have confirming on-chain evidence. 1 of 7 has evidence, and that evidence refutes it.**

### 12.1 Why this is the least-covered path in the system

Set against the rest of the register:

| Path | Requirements | Automated coverage |
|---|---|---|
| Consent-gated flow (this sub-matrix) | 7 | **0 %** |
| Contract consent lifecycle (FR-018…FR-024) | 7 | 100 % |
| Intelligence endpoints (FR-004…FR-009) | 6 | 100 % |
| Payment layer (FR-001…FR-003) | 3 | 67 % (FR-003 is on-chain, not automated) |

Every module the flagship path depends on that *is* well tested — the contract's grant state machine, the rule engines — is a module where a bug is cheap. Every module where a bug is expensive is untested:

- **`api/src/routes/records.ts`** — the consent decision, the denial semantics, the audit write, and the response contract. **Zero tests.**
- **`api/src/services/algorand.ts`** — box-key derivation, `simulate` reads, read-then-write sequencing, `withPatientLock`, and the only transaction MedRail ever submits. **Zero tests.**

The 32-test count is real, and it is concentrated where the risk is not.

### 12.2 The compounding effect

These seven are not seven independent gaps; they interlock:

1. **SEC-007** is unimplemented, so **FR-010**'s consent check runs against an identity the caller chose (`records.ts:7`, `:30`). The reconnaissance step is **executed and confirmed** — one unauthenticated indexer query recovered two complete `(patient, requester, scope)` triples, both scope `records:summary`, from app `768743428`'s public `grant_access` transactions.
2. Because **SEC-007** fails, **SEC-008** fails: the forged address is what `records.ts:49` passes to `log_access`, writing a **false permanent attribution** into the trail that is trusted precisely for being on-chain.
3. **FR-012** and **FR-025** have never run on TestNet, so the very mechanism that would carry that false attribution is itself unproven on real infrastructure.
4. **REL-004**'s in-process lock is contradicted by `api/fly.toml:17-19`; the failure it now produces is a **rejected transaction**, which on the unguarded success path at `records.ts:49` becomes a 500 that **forfeits a legitimate sale** (not the caller's money — see REL-002).
5. **FR-011**'s denial path is documented as billed and is not, and costs MedRail a chain fee per denial — free for any stranger to invoke, unbounded because **SEC-013** does not exist.

**Two tests would break the chain.** TC-110 (pay as A, assert `requesterAddress: B`, expect 403) closes 1 and 2. TC-143 (one live `logAccess` against app `768743428`) closes 3. Both are listed in [`../07_Testing/Test_Cases.md`](../07_Testing/Test_Cases.md) Part C, and neither exists.

---

## 13. Cross-references

- Requirement statements and rationale: [`SRS.md`](SRS.md)
- Prioritised remediation: [`Requirements_Gap_Analysis.md`](Requirements_Gap_Analysis.md)
- Evidence-backed findings register: [`../ENGINEERING_GAP_REPORT.md`](../ENGINEERING_GAP_REPORT.md)
- Test register (TC-001…TC-204): [`../07_Testing/Test_Cases.md`](../07_Testing/Test_Cases.md)
- Threat model and the S-1 exploit chain: [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md)
