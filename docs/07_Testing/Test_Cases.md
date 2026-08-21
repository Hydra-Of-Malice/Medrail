# MedRail — Test Case Catalogue


> **⚠ Correction notice.** Parts of this document were written against a review finding that was
> later proven wrong. Settlement in x402 v2 happens **only** on a sub-400 response, so **no error
> path in MedRail can consume a settled payment** — and consent-denied calls (HTTP 403) are **not
> charged**, contrary to `API.md`, `SECURITY.md`, and the `paidButDenied` field. The audit-sequence
> race causes a **rejected transaction**, not a corrupted log. See
> [`CORRECTIONS.md`](../CORRECTIONS.md) — it supersedes any statement here that contradicts it.

**Purpose:** the complete, per-case test register — every automated test that exists (Part A), every manual proof procedure that has been executed (Part B), and every test that is required but absent (Part C).

**Status of this document:** **IMPLEMENTED**. Parts A and B were verified by executing the suites and querying the public Algorand TestNet indexer on 2026-08-21 against commit `32ffd73` (branch `master`). Part C is **RECOMMENDED** — none of those tests exist. `Actual Result` is populated only where a run actually happened.

**Cross-references:** [`Test_Strategy.md`](Test_Strategy.md), [`Test_Plan.md`](Test_Plan.md), [`Test_Results.md`](Test_Results.md), [`Performance_Validation.md`](Performance_Validation.md), [`../02_Requirements/Requirements_Traceability_Matrix.md`](../02_Requirements/Requirements_Traceability_Matrix.md), [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md).

---

## 0. Register summary

| Part | Content | Count | Status |
|---|---|---|---|
| **A** | Automated tests that exist and pass | **32** (TC-001…TC-032) | **VALIDATED** — 14 Python + 18 TypeScript, all passing |
| **B** | Manual proof procedures executed against live TestNet | **7** (TC-050…TC-056) | **VALIDATED but not automated / not in CI** |
| **C** | Required-but-missing test cases | **64** (TC-100…TC-204) | **NOT IMPLEMENTED** |
| | **Total register** | **103** | 39 executed, 64 absent |

**Assurance caveat on the "32 passing tests" figure.** Three of the thirty-two assert markedly less than their names imply, and one of them runs directly over a live defect without noticing: `interactionChecker.spec.ts`'s "always includes a source citation and disclaimer" (TC-027) calls `checkInteractions(["a","b"])`, which — **measured by execution on 2026-08-21** — returns `flagged: true` with **five** spurious severe-interaction matches, and asserts nothing about any of them. The count of passing tests is not a measure of assurance. See TC-180, TC-185, TC-186 and [`Test_Results.md`](Test_Results.md) §3.4.

Reproduction for all of Part A:

```bash
# Contract suite — offline, AVM simulator
cd D:/MedRail/contracts && ./.venv/Scripts/python.exe -m pytest tests/ -q

# API suite — NOTE: makes a live call to facilitator.goplausible.xyz at import
cd D:/MedRail/api && npx vitest run
```

---

# PART A — Existing automated tests (TC-001…TC-032)

## A.1 Contract suite — `contracts/tests/test_consent.py`

Runner: `pytest` + `algorand-python-testing` 1.1.0 (in-memory AVM emulation, **no network**). Fixtures: `context` = `algopy_testing_context()`; `contract` = a fresh `MedRailConsent()` with `create()` already called, so `context.default_sender` is `admin`. Measured: **14 passed in 0.41 s**.

| ID | Requirement | Level | Scenario | Preconditions | Input | Expected Result | Actual Result | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| TC-001 | FR-029, SEC-002 | Unit (AVM sim) | `create()` records the deployer as admin | Fresh test context | `contract.create()` via fixture | `contract.admin.value == context.default_sender` | PASS | **VALIDATED** | `test_create_sets_admin`, `test_consent.py:36`; contract `contract.py:118-121` |
| TC-002 | FR-029, SEC-002 | Unit (AVM sim) | Admin can rotate admin; a non-admin cannot | Contract created | `set_admin(new_admin)` as default sender, then `set_admin(...)` wrapped in `as_sender(other)` | Rotation succeeds; the foreign-sender call raises `AssertionError` ("only admin") | PASS | **VALIDATED** | `test_set_admin_only_admin`, `test_consent.py:40-48`; assert at `contract.py:126` |
| TC-003 | FR-024 | Unit (AVM sim) | `request_access` increments the global request counter | Contract created | `request_access(patient, "records:summary")` | `total_requests == 1` | PASS | **VALIDATED** (counter only) | `test_request_access_emits_event_and_counts`, `test_consent.py:51-57` — **the emitted event payload is never inspected; this is why defect C-1 survives. See TC-150.** |
| TC-004 | FR-018, FR-023, DATA-001 | Unit (AVM sim) | Patient grants a never-expiring scope; `check_access` then returns true | Contract created; sender is the patient | `grant_access(requester, "records:summary", 0)` | `check_access(...) is True`; `total_grants_active == 1`; `get_grant(...).status == STATUS_GRANTED` | PASS | **VALIDATED** | `test_grant_then_check_access`, `test_consent.py:60-71`; `contract.py:148-176` |
| TC-005 | FR-023 | Unit (AVM sim) | `check_access` is false when no grant box exists | Contract created; no grants | `check_access(random_patient, random_requester, "records:summary")` | `False` | PASS | **VALIDATED** | `test_check_access_false_when_no_grant`, `test_consent.py:74-77`; `contract.py:201-202` |
| TC-006 | FR-019, FR-023 | Unit (AVM sim) | A time-limited grant becomes invalid once the ledger clock passes `expires_at` | Simulated ledger clock pinned via `patch_global_fields(latest_timestamp=1_000_000)` | `grant_access(requester, scope, 3600)`; then clock set to `1_000_000 + 3601` | `True` before, `False` after | PASS | **VALIDATED** | `test_grant_with_expiry_becomes_invalid_after_expiry`, `test_consent.py:80-93`; `contract.py:206-209` |
| TC-007 | FR-020 | Unit (AVM sim) | Patient revokes an active grant | Grant exists and is active | `revoke_access(requester, scope)` | `check_access` → `False`; `total_grants_active == 0`; `total_revocations == 1`; `get_grant(...).status == STATUS_REVOKED` | PASS | **VALIDATED** | `test_revoke_access`, `test_consent.py:96-111`; `contract.py:178-195` |
| TC-008 | FR-021 | Unit (AVM sim) | Revoking a grant that was never created fails atomically | Contract created; no grants | `revoke_access(requester, "records:summary")` | `AssertionError` ("no such grant") | PASS | **VALIDATED** | `test_revoke_nonexistent_grant_asserts`, `test_consent.py:114-117`; assert at `contract.py:182` |
| TC-009 | FR-022 | Unit (AVM sim) | Re-granting after revocation reactivates and restores the active counter exactly once | Grant created then revoked | `grant_access(requester, scope, 0)` a second time | `check_access` → `True`; `total_grants_active` returns to `1`, not `2` | PASS | **VALIDATED** | `test_regrant_after_revoke_reactivates`, `test_consent.py:120-131`; `was_active_before` logic at `contract.py:157-167` |
| TC-010 | FR-025, FR-028, DATA-002 | Unit (AVM sim) | Admin appends an audit entry and reads it back | Contract created; sender is admin | `log_access(patient, requester, "open:triage", "/v1/triage", "open_call")` | Returns `1`; `get_audit_count(patient) == 1`; `get_audit_entry(patient, 1).endpoint == "/v1/triage"` and `.action == "open_call"` | PASS | **VALIDATED in simulator only** | `test_log_access_admin_only`, `test_consent.py:134-146`; `contract.py:217-236`. **Never executed on TestNet — see E-1 in [`Test_Results.md`](Test_Results.md) §5.** |
| TC-011 | SEC-001, FR-026 | Unit (AVM sim) | A non-admin cannot write an audit entry | Contract created | `log_access(...)` wrapped in `as_sender(intruder)` | `AssertionError` ("only admin") | PASS | **VALIDATED** | `test_log_access_rejects_non_admin`, `test_consent.py:149-157`; assert at `contract.py:222` |
| TC-012 | FR-027 | Unit (AVM sim) | Audit sequence numbers are independent per patient | Contract created; sender is admin | 2× `log_access` for patient A, 1× for patient B | `get_audit_count(A) == 2`; `get_audit_count(B) == 1` | PASS | **VALIDATED** | `test_audit_log_sequence_increments_per_patient`, `test_consent.py:160-170`; `audit_seq` BoxMap keyed by account, `contract.py:115` |
| TC-013 | FR-028 | Unit (AVM sim) | Reading a non-existent audit entry fails atomically | Contract created; no audit entries | `get_audit_entry(patient, 99)` | `AssertionError` ("no such audit entry") | PASS | **VALIDATED** | `test_get_audit_entry_missing_asserts`, `test_consent.py:173-176`; assert at `contract.py:245` |
| TC-014 | SEC-002, FR-031 | Unit (AVM sim) | A non-admin cannot withdraw application funds | Contract created | `withdraw_excess(1000)` wrapped in `as_sender(intruder)` | `AssertionError` ("only admin") | PASS | **VALIDATED (negative case only)** | `test_withdraw_excess_admin_only`, `test_consent.py:179-183`; assert at `contract.py:258`. **The successful withdrawal path is untested — see TC-156.** |

## A.2 Triage rule engine — `api/test/triageScorer.spec.ts`

Runner: `vitest` 4.1.10. Pure function, no I/O, no network. Unit under test: `scoreTriage` (`api/src/services/triageScorer.ts:53-73`) over 11 `RED_FLAGS` groups.

| ID | Requirement | Level | Scenario | Preconditions | Input | Expected Result | Actual Result | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| TC-015 | FR-004, FR-006, NFR-009 | Unit | Benign text produces no flags | none | `"I'd like to schedule an annual checkup next month."` | `score === 0`; `band === "routine"`; `matchedFlags` empty | PASS | **VALIDATED** | `"flags nothing for a benign, unrelated sentence"`, `triageScorer.spec.ts:5-10` |
| TC-016 | FR-005, FR-006 | Unit | A single mild symptom scores low and bands routine | none | `"I have a mild headache and a runny nose."` | `0 < score < 10`; `band === "routine"` | PASS | **VALIDATED** | `"flags a single mild symptom as low urgency"`, `triageScorer.spec.ts:12-17`; weight 2 group at `triageScorer.ts:43` |
| TC-017 | FR-004, FR-005, FR-006 | Unit | Two high-weight red flags band as emergency | none | `"Sudden crushing chest pain and I can't breathe."` | `band === "emergency"`; `matchedFlags` contains `"possible cardiac chest pain"` and `"respiratory distress"` | PASS | **VALIDATED** | `"flags chest pain plus breathing difficulty as emergency"`, `triageScorer.spec.ts:19-24`; weights 35 + 35 |
| TC-018 | FR-004, FR-006 | Unit | FAST stroke signs are matched as their own labelled group | none | `"Sudden confusion and slurred speech since this morning."` | `matchedFlags` contains `"possible stroke (FAST signs)"`; band is `urgent` or `emergency` | PASS | **VALIDATED** | `"flags stroke warning signs distinctly"`, `triageScorer.spec.ts:26-30`; weight 40 group at `triageScorer.ts:35` |
| TC-019 | FR-005 | Unit | Score is capped at 100 regardless of how many groups match | none | Eight overlapping red-flag phrases in one string | `score === 100`; `band === "emergency"` | PASS | **VALIDATED** | `"caps the score at 100 even with many overlapping flags"`, `triageScorer.spec.ts:32-38`; `Math.min(100, score)` at `triageScorer.ts:65` |
| TC-020 | **AI-002**, FR-009 | Unit | Every response carries the non-diagnostic disclaimer | none | `"anything"` | `disclaimer` (lowercased) contains `"not a diagnosis"` | PASS | **VALIDATED** | `"always includes the non-diagnostic disclaimer"`, `triageScorer.spec.ts:40-43`; constant at `triageScorer.ts:18-21`. **This is the deliberate design choice to treat safety text as a tested correctness property.** |
| TC-021 | FR-004, NFR-009 | Unit | Scoring is case-insensitive | none | `"chest pain"` vs `"CHEST PAIN"` | Identical scores | PASS | **VALIDATED** | `"is case-insensitive"`, `triageScorer.spec.ts:45-49`; `toLowerCase()` at `triageScorer.ts:54` |

## A.3 Interaction rule engine — `api/test/interactionChecker.spec.ts`

Runner: `vitest`. Unit under test: `checkInteractions` (`api/src/services/interactionChecker.ts:36-55`) over 14 curated pairs loaded once at module import from `api/src/data/interactions.json`.

| ID | Requirement | Level | Scenario | Preconditions | Input | Expected Result | Actual Result | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| TC-022 | FR-007 | Unit | Unrelated medications produce no match | `interactions.json` loaded | `["ibuprofen", "vitamin d"]` | `flagged === false`; `matches` empty | PASS | **VALIDATED** | `"flags nothing for unrelated medications"`, `interactionChecker.spec.ts:5-9` |
| TC-023 | FR-007 | Unit | The warfarin + aspirin major bleeding-risk pair is flagged | `interactions.json` loaded | `["warfarin", "aspirin"]` | `flagged === true`; at least one match with `severity === "major"` | PASS | **VALIDATED** | `"flags the classic warfarin + aspirin bleeding-risk pair"`, `interactionChecker.spec.ts:11-15` |
| TC-024 | FR-007 | Unit | A contraindicated pair is classified as contraindicated | `interactions.json` loaded | `["sildenafil", "nitroglycerin"]` | `flagged === true`; `matches[0].severity === "contraindicated"` | PASS | **VALIDATED** | `"flags a contraindicated pair (sildenafil + nitroglycerin)"`, `interactionChecker.spec.ts:17-21` |
| TC-025 | FR-008 | Unit | Matching tolerates casing and dose suffixes | `interactions.json` loaded | `["Warfarin", "Aspirin 81mg"]` | `flagged === true` | PASS | **VALIDATED** | `"matches case-insensitively and with partial names"`, `interactionChecker.spec.ts:23-26`; bidirectional `includes` at `interactionChecker.ts:42-43` |
| TC-026 | FR-007 | Unit | Multiple simultaneous interactions in a longer list | `interactions.json` loaded | `["warfarin", "aspirin", "lithium", "hydrochlorothiazide"]` | `matches.length >= 2` | PASS | **VALIDATED** | `"finds multiple simultaneous interactions in a longer list"`, `interactionChecker.spec.ts:28-31` |
| TC-027 | **AI-002**, **AI-004**, FR-009, DATA-005 | Unit | Every response carries a source citation and a disclaimer | `interactions.json` loaded | `["a", "b"]` | `source.length > 0`; `disclaimer` contains `"not a comprehensive clinical database"` | PASS — **but see the measured result below** | **VALIDATED (for the disclaimer only)** | `"always includes a source citation and disclaimer"`, `interactionChecker.spec.ts:33-37`. **Measured by execution on 2026-08-21: this exact call returns `flagged: true` with 5 matches — `warfarin+aspirin` (major), `warfarin+ibuprofen` (major), `warfarin+naproxen` (major), `maoi+sertraline` (contraindicated), `simvastatin+clarithromycin` (major). The test runs a call that produces five spurious severe-interaction warnings and asserts nothing about any of them. Defect AI-006 is exercised on every green run and never observed. See TC-180.** |

## A.4 x402 payment gate — `api/test/x402-flow.spec.ts`

Runner: `vitest`, driving the real Hono app via `app.request()`. **Not hermetic:** importing `../src/app.js` constructs an `HTTPFacilitatorClient` (`api/src/x402.ts:6`) and the first priced request fetches the facilitator's `/supported` over the network, from which `accepts[].asset` and `extra.feePayer` are resolved. This is the mechanism behind **CI-2** and **R-1**.

| ID | Requirement | Level | Scenario | Preconditions | Input | Expected Result | Actual Result | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| TC-028 | FR-016, REL-005 | Component (HTTP) | The health endpoint is free and unpaid | App importable | `GET /v1/health` | `200`; body `ok === true` | PASS | **VALIDATED** | `"health check is free and unpaid"`, `x402-flow.spec.ts:5-10`; handler `api/src/routes/health.ts:6-14` |
| TC-029 | FR-001, FR-002 | Component (HTTP) | An unpaid triage call returns a real, correctly-priced 402 challenge | App importable; facilitator reachable | `POST /v1/triage` with `{"symptoms":"test"}`, no payment header | `402`; `payment-required` header present; decoded `accepts[0].scheme === "exact"`, `amount === "20000"`, `network` matches `/^algorand:/` | PASS | **VALIDATED** | `"returns a real 402 with priced accepts[] for /v1/triage when unpaid"`, `x402-flow.spec.ts:12-26`; pricing at `api/src/app.ts:41` |
| TC-030 | FR-001 | Component (HTTP) | An unpaid interaction-check call returns 402 | App importable; facilitator reachable | `POST /v1/interaction-check` with two medications, no payment header | `402` | PASS | **VALIDATED** | `"returns a real 402 for /v1/interaction-check when unpaid"`, `x402-flow.spec.ts:28-35`; pricing at `api/src/app.ts:42` |
| TC-031 | FR-001, FR-002 | Component (HTTP) | The consent-gated route is priced higher than the open routes | App importable; facilitator reachable | `POST /v1/records/summary` with 58-char placeholder ids, no payment header | `402`; decoded `accepts[0].amount === "50000"` | PASS | **VALIDATED** | `"returns a real 402 for /v1/records/summary when unpaid, priced higher than the open endpoints"`, `x402-flow.spec.ts:37-46`; pricing at `api/src/app.ts:43-46` |
| TC-032 | FR-001, FR-038 | Component (HTTP) | Middleware ordering: payment is enforced ahead of body validation | App importable; facilitator reachable | `POST /v1/triage` with `{}` | Status is `400` **or** `402` — the test documents the ordering rather than assuming it | PASS (observed `402`) | **VALIDATED** | `"rejects malformed triage requests before the payment gate would even matter"`, `x402-flow.spec.ts:48-59`. The in-test comment is an honest record of a real design consequence: an unpaid malformed request cannot be told apart from an unpaid valid one. |

---

# PART B — Manual proof procedures (TC-050…TC-056)

**Status of every case in this part: VALIDATED but not automated / not in CI.**

These are real transactions on Algorand TestNet, re-verified by the reviewer against `https://testnet-idx.algonode.cloud` on 2026-08-21 — not quoted from the repository's own documentation. Neither script has an assertion harness, a reporter, or a scheduled run; `contracts/scripts/exercise_contract.py` does carry two in-script `assert` statements (`exercise_contract.py:127-128`), and `api/scripts/e2e-proof.ts` throws on a non-200 (`e2e-proof.ts:66-71`), but neither is invoked by any pipeline.

| ID | Requirement | Level | Scenario | Preconditions | Input | Expected Result | Actual Result | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| TC-050 | REL-006 | System (live TestNet) | The application account is funded so it can pay box MBR for the grants it creates | Contract deployed as App `768743428` at round 66088624 | `deploy_testnet.py` funding payment of 5 ALGO to the app account | App account holds 5,000,000 µALGO; boxes become creatable | Confirmed: balance 5,000,000 µALGO, min-balance 145,000 µALGO, 2 boxes / 100 box bytes | **VALIDATED** | tx `KYH3H5CG2CCUPUUTJIBX47WD4RWSUV3QWTEUJQRQFYLWO5YAO3QA`, round **66088626**; app account `CCO26Y6Z56DDZ3OELO2UKJMIPJVSIT52I23F2MPMR52JBM3HQZZNUZNOR4`; `contracts/artifacts/deploy_testnet.json` |
| TC-051 | FR-024 | System (live TestNet) | A requester signals interest in a scope on the real network | App deployed; throwaway requester funded 1 ALGO | `request_access(patient, "records:summary")` sent by the throwaway requester | Transaction confirms; `total_requests` increments | Confirmed on-chain; global `total_requests = 2` (the script has been run twice) | **VALIDATED (state only)** | tx `5XIADMCGFP5I7H7AS656RXZS7MFEEPCVJGLA7T3SVE6XDEYSGFFA`, round **66088670**; `exercise_contract.py:77-85`; selector `d84debd0`. **The emitted event payload has never been inspected — defect C-1 is not disproved by this run.** |
| TC-052 | FR-018, SEC-003 | System (live TestNet) | A patient grants consent by signing with their own key | App deployed; throwaway patient funded 1 ALGO | `grant_access(requester, "records:summary", 0)` sent by the throwaway patient | Transaction confirms; a `g`-prefixed grant box is created | Confirmed on-chain; 2 `g`-prefixed boxes now exist on the app | **VALIDATED** | tx `X2BQ5FD4MW52B75WQGDB67TEULYLN7FHVFO6ZOBNI74PNCAKVOUA`, round **66088672**; `exercise_contract.py:87-95`; selector `8c3ad539` |
| TC-053 | FR-023 | System (live TestNet) | `check_access` returns true immediately after a grant | TC-052 confirmed | `check_access(patient, requester, "records:summary")` | ABI return `True`; script assertion holds | `True` — asserted in-script | **VALIDATED** | `exercise_contract.py:97-105`, assertion at `:127` |
| TC-054 | FR-020, SEC-003 | System (live TestNet) | A patient revokes a previously granted scope | TC-052 confirmed | `revoke_access(requester, "records:summary")` sent by the patient | Transaction confirms; grant status flips to `STATUS_REVOKED` | Confirmed on-chain; global `total_revocations = 2`, `total_grants_active = 0` | **VALIDATED** | tx `OV2J2T5VWMIQG64JYGL7JEGZKKNZNKCMNIQU6AC4PDRQYZ6ZOO5A`, round **66088674**; `exercise_contract.py:107-115`; selector `a67aecbc` |
| TC-055 | FR-023 | System (live TestNet) | `check_access` returns false immediately after a revoke | TC-054 confirmed | `check_access(patient, requester, "records:summary")` | ABI return `False`; script assertion holds | `False` — asserted in-script | **VALIDATED** | `exercise_contract.py:117-125`, assertion at `:128` |
| TC-056 | FR-003, FR-040 | System (live TestNet) | Full x402 flow: 402 → construct and sign a real AVM payment → facilitator settles → 200 with the resource | API running locally against TestNet; a funded TestNet account holding USDC ASA `10458941` in `PROOF_MNEMONIC` | `POST /v1/triage` with `{"symptoms":"Sudden chest pain and shortness of breath"}` via `wrapFetchWithPayment` | `200`; `PAYMENT-RESPONSE` header carries a real settled transaction id; proof written to `contracts/artifacts/e2e-proof.json` | `200`; body `{score: 70, band: "emergency", matchedFlags: [cardiac chest pain, respiratory distress], disclaimer: …}`; settled tx recorded | **VALIDATED** | tx `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ`, `axfer`, asset `10458941`, **amount 20000**, **fee 0** (sponsored), round **66091768**, group `XQzhbjBAqt0AjC5AByQsCxGbMdEuca3ZZFMyFBTb7K4=`, note `x402-payment-v2-1786140083822`; `api/scripts/e2e-proof.ts`; `contracts/artifacts/e2e-proof.json`. **Disclosure: sender == receiver == `2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE` — the deployer paid itself. It is a genuine facilitator-settled x402 payment, and it is the only one that exists.** |

### Part B gap

There is **no** Part B case for a paid `/v1/records/summary` call. The consent-gated flagship endpoint has never completed its success path against the live contract, which is why deployed app `768743428` reports `total_audit_entries = 0` and holds zero `s`- or `a`-prefixed boxes. See **E-1** in [`Test_Results.md`](Test_Results.md) §5 and TC-143 below.

---

# PART C — Required but missing test cases (TC-100…TC-204)

**Status of every case in this part: NOT IMPLEMENTED.** `Actual Result` is empty by definition — none of these have ever been executed. They are written to be implementable directly, with the file each belongs in named.

## C.1 `api/src/routes/records.ts` — the untested flagship route

Target file: **new** `api/test/records.route.spec.ts`. Technique: `vi.mock("../src/services/algorand.js")` so `checkAccess` and `logAccess` are controllable; drive the route through `app.request()`. Note that the payment middleware sits ahead of the handler (`api/src/app.ts:37-50`), so these tests need either a stubbed resource server or a presented payment fixture.

| ID | Requirement | Level | Scenario | Preconditions | Input | Expected Result | Actual Result | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| TC-100 | FR-010, FR-012, SEC-006 | Integration | Paid request with a valid grant returns the summary and the audit metadata | Payment settled; `checkAccess` → `true`; `logAccess` → `{txId:"TX", sequence:7n}` | `{patientId: <58>, requesterAddress: <58>}` | `200` with `summary === SYNTHETIC_RECORD`, `consentVerifiedOnChain === true`, `auditTxId === "TX"`, `auditSequence === "7"`, and a `disclaimer` | — | **NOT IMPLEMENTED** | Handler `api/src/routes/records.ts:49-60` |
| TC-101 | FR-011 | Integration | Paid request with no valid grant returns 403 and still attempts an audit entry | Payment settled; `checkAccess` → `false`; `logAccess` resolves | same | `403`; body `paidButDenied === true`; `logAccess` called exactly once with action `"consent_denied"` | — | **NOT IMPLEMENTED** | `records.ts:33-47` |
| TC-102 | FR-011, REL-002 | Integration | The denied path survives an audit-write failure | `checkAccess` → `false`; `logAccess` **rejects** | same | Still `403` with `paidButDenied === true` — the `.catch(() => undefined)` absorbs it | — | **NOT IMPLEMENTED** | `records.ts:37` — this defensive `.catch` is currently unproven |
| TC-103 | **REL-002 / R-2**, FR-012 | Integration (**regression**) | **A settled payment must not be lost when the audit write fails on the success path** | `checkAccess` → `true`; `logAccess` **rejects** (simulate operator out of ALGO / algod 5xx / validity-window expiry) | same | **Required behaviour:** the caller receives the resource, or a 5xx that carries a recoverable receipt/retry token — never a bare `500` after money has moved. **Current behaviour:** falls through to `app.onError` and returns `500` with the raw exception message; the caller has paid $0.05 and receives nothing, with no refund path. | — | **NOT IMPLEMENTED** | `records.ts:49` — note the asymmetry with `:37`: the rejection path is defensive, the success path is not |
| TC-104 | FR-038 | Integration | Schema rejection for malformed identifiers | Payment settled | `{patientId: "short", requesterAddress: <58>}` | `400` with `error === "invalid request"` and zod `details` | — | **NOT IMPLEMENTED** | `records.ts:5-8`, `:26-29` |
| TC-105 | FR-019, FR-023, SEC-006 | Integration | An expired grant is treated as no grant | `checkAccess` → `false` because the on-chain grant has passed `expires_at` | same | `403`, `paidButDenied === true` | — | **NOT IMPLEMENTED** | `contract.py:206-209` + `records.ts:32` |

## C.2 Payer-identity binding — **the single most important missing test**

Target file: **new** `api/test/records.security.spec.ts`. This group exists because of finding **S-1**: `requesterAddress` is read from the request body (`api/src/routes/records.ts:5-8`, `:30`) and nothing binds it to the identity that actually paid. Grants are public on Algorand, so an attacker can enumerate `(patient, requester)` pairs from the app's own transaction history, pay the ordinary $0.05, and name someone else's authorised requester. `check_access` returns true — because that grant genuinely exists — and the record is served. The impersonation is then written into the immutable audit trail as a false attribution (SEC-008).

The fix is available in the installed SDK: `decodePaymentSignatureHeader` from `@x402/core/http` plus `getSenderFromTransaction` from `@x402/avm`, or the `ProtectedRequestHook` exported by `@x402/hono`.

| ID | Requirement | Level | Scenario | Preconditions | Input | Expected Result | Actual Result | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| **TC-110** | **SEC-007, SEC-006, FR-039** | **Security regression** | **Payer A cannot obtain a record by asserting authorised requester B** | A grant exists on-chain for `(patient P, requester B, "records:summary")`. Attacker controls address **A**, which has **no** grant. | Present a **valid, settled `PAYMENT-SIGNATURE` signed by A** to `POST /v1/records/summary` with body `{patientId: P, requesterAddress: B}` — i.e. **pay as A while claiming to be B** | **`403`.** The handler must decode `PAYMENT-SIGNATURE`, recover the payer address, and reject unless `payer === requesterAddress`. No `summary` field in the body. No audit entry attributed to B. | — | **NOT IMPLEMENTED** | **This test would fail today: the current handler returns `200` with the record.** `records.ts:30-32`; finding S-1; see [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md). **Highest value-per-line fix available before submission — roughly 10–15 lines plus this test.** |
| TC-111 | SEC-007, FR-010 | Security (positive control) | The legitimate case still works after the fix | Grant exists for `(P, A, scope)`; attacker-free | Payment signed by **A**, body `requesterAddress: A` | `200` with the summary | — | **NOT IMPLEMENTED** | Must accompany TC-110 so the fix is not a blanket deny |
| TC-112 | SEC-007 | Security | An absent or undecodable `PAYMENT-SIGNATURE` never yields a record | — | `POST /v1/records/summary` with a corrupted / truncated / absent payment header | `402` or `403`, never `200`, and never a `500` echoing a decode exception | — | **NOT IMPLEMENTED** | `records.ts`; `app.ts:58-61` |
| TC-113 | **SEC-008** | Security | The audit entry attributes the *recovered payer*, not the body value | Grant exists for `(P, B, scope)`; payment signed by A | Body `requesterAddress: B` | With the fix in place the request is rejected, so **no** audit entry is written. Assert `logAccess` is not called with `requester = B`. | — | **NOT IMPLEMENTED** | Second-order effect of S-1: a forged `requesterAddress` currently produces a false, permanent on-chain attribution |

## C.3 Box-key derivation parity — three implementations, zero cross-checks

Target: a single shared golden-vector fixture (e.g. `contracts/tests/fixtures/box_keys.json`) consumed by a Python test, a Node test, and a browser/jsdom test. NFR-011 is **UNVALIDATED** today: the same derivation is implemented independently at `contracts/smart_contracts/consent/contract.py:96-98`, `api/src/services/algorand.ts:64-79`, and `web/lib/consent.ts:26-34` (which uses `crypto.subtle.digest` rather than `node:crypto`). A change to the prefix or the hash input silently breaks two of three.

Fixed inputs for the golden vector (chosen so the expected hex is a literal in the fixture, computed once and reviewed):

- `patient` = a fixed valid 58-character TestNet address
- `requester` = a second fixed valid 58-character address
- `scope` = `"records:summary"`
- `seq` = `1`

| ID | Requirement | Level | Scenario | Preconditions | Input | Expected Result | Actual Result | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| TC-120 | NFR-011, DATA-001 | Unit (Python) | Contract `grant_key` matches the golden vector | Fixture loaded | Fixed `(patient, requester, scope)` | `grant_key(...)` equals the fixture's 32-byte hex; prefixed with `"g"` it equals the 33-byte effective box key | — | **NOT IMPLEMENTED** | `contract.py:96-98`, `BoxMap(..., key_prefix="g")` at `contract.py:114` |
| TC-121 | NFR-011 | Unit (Node) | `grantBoxName` matches the same golden vector | Fixture loaded | same | `grantBoxName(patient, requester, scope)` equals the 33-byte hex | — | **NOT IMPLEMENTED** | `api/src/services/algorand.ts:64-69` |
| TC-122 | NFR-011 | Unit (browser/jsdom) | The browser derivation matches the same golden vector | Fixture loaded; `crypto.subtle` available | same | `web/lib/consent.ts:grantBoxName(...)` resolves to the identical 33-byte hex | — | **NOT IMPLEMENTED** | `web/lib/consent.ts:26-34` — the only implementation using `crypto.subtle.digest` |
| TC-123 | NFR-011 | Unit (Python + Node) | `audit_seq` key parity | Fixture loaded | Fixed `patient` | `"s"` ‖ 32-byte pubkey in both implementations | — | **NOT IMPLEMENTED** | `contract.py:115`; `algorand.ts:72-74` |
| TC-124 | NFR-011 | Unit (Python + Node) | `audit_log` key parity | Fixture loaded | Fixed `(patient, seq=1)` | `"a"` ‖ 32-byte pubkey ‖ big-endian `itob(1)` = 41 bytes in both | — | **NOT IMPLEMENTED** | `contract.py:101-103`, `:116`; `algorand.ts:77-79` |
| TC-125 | NFR-011 | Integration (**regression**) | Fixture drift guard | — | Regenerate all three derivations and compare pairwise | All three byte-identical; any divergence fails the build with a diff of the offending implementation | — | **NOT IMPLEMENTED** | Severity MEDIUM per the review; this is the cheapest high-value structural test available |

## C.4 Concurrency and audit sequencing

Target file: **new** `api/test/algorand.concurrency.spec.ts`.

**Read this before writing the assertions — the obvious test would pass for the wrong reason.**

The **contract already self-assigns the sequence number**. `log_access` reads its own `audit_seq` box, computes `next_seq` itself, writes both boxes, and returns the value it assigned (`contracts/smart_contracts/consent/contract.py:224-236`). The client-side `predictedSeq` in `api/src/services/algorand.ts:158-159` exists **only to populate the AVM box-reference array** (`:169-172`), because Algorand requires every box a transaction touches to be declared in advance; the sequence actually reported to the caller is the contract's return value, with `predictedSeq` used merely as a fallback (`:176`).

Consequently the race failure mode is a **rejected transaction, not a corrupted or misordered log**. Two concurrent calls both read count `n` and both declare box `a‖patient‖itob(n+1)`. The first executes and the contract writes sequence `n+1`. The second executes, the contract computes `n+2`, and the write fails because box `a‖patient‖itob(n+2)` was never declared in that transaction's reference array.

**Therefore: a test asserting "sequence numbers are unique and correctly ordered" would pass whether or not the lock exists, because the contract guarantees that property on its own. It would prove nothing.** The assertion with teeth is that no call is *rejected*.

`api/fly.toml` permits more than one machine (`auto_start_machines = true`; `min_machines_running = 1` is a floor, not a ceiling), so the in-process mitigation `docs/SECURITY.md` claims does not hold across instances (defect **D-7**).

| ID | Requirement | Level | Scenario | Preconditions | Input | Expected Result | Actual Result | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| TC-130 | **REL-004** | Integration | **N concurrent `logAccess` calls for one patient all succeed — none is rejected on a box reference** | Live TestNet or a faithful chain fake that enforces box-reference declaration; N = 10 | `await Promise.all(Array.from({length:10}, () => logAccess(P, R, scope, endpoint, "consent_checked")))` | **All 10 promises resolve.** Zero rejections, zero box-reference errors, 10 distinct `txId`s. Sequence uniqueness may be asserted as a secondary sanity check but is **not** the point — the contract provides it regardless. | — | **NOT IMPLEMENTED** | `algorand.ts:123-138` (lock), `:153-178` (write); `contract.py:224-236` |
| TC-131 | **REL-004** | Integration (**lock efficacy**) | **Bypassing the lock reproduces the rejection — proving the lock does something** | Same fixture as TC-130, but invoke the inner write function directly, outside `withPatientLock` | 10 concurrent unlocked writes for one patient | **At least one call is rejected** with a box-reference/unavailable-box error. Pairing this with TC-130 is what demonstrates the lock is load-bearing; TC-130 alone cannot distinguish "the lock works" from "there was never a race". | — | **NOT IMPLEMENTED** | The inner closure at `algorand.ts:153-178` must be exported (or the lock made injectable) for this to be testable — a small refactor is a prerequisite |
| TC-132 | **REL-004 / D-7** | Integration (**known-limitation proof**) | Two independent module instances sharing one operator account collide | Import `services/algorand.js` twice under separate module registries, or run two processes | Simultaneous `logAccess` for the same patient from both | **Documents the failure:** each process's queue is unaware of the other, both predict `n+1`, and one transaction is **rejected**. Assert the rejection explicitly so the limitation is proven rather than assumed, and so a future fix can flip the assertion. | — | **NOT IMPLEMENTED** | `docs/SECURITY.md` states this is mitigated; `api/fly.toml` permits the topology that breaks it |
| TC-133 | REL-004 | Unit | A rejected call does not poison the per-patient queue | Mock the inner write: first call rejects, second resolves | Two sequential calls for the same patient | The second call still runs — `prior.then(fn, fn)` at `algorand.ts:132` deliberately chains on both settle paths, and the stored queue entry is `next.catch(() => undefined)` (`:133-136`) | — | **NOT IMPLEMENTED** | `algorand.ts:123-138` |
| TC-134 | **REL-002 / R-2**, REL-004 | Integration | **A rejected `logAccess` on the success path must not produce a 500 after settlement** | Payment settled; `checkAccess` → `true`; `logAccess` rejects with a box-reference error (the exact outcome TC-131/TC-132 reproduce) | `POST /v1/records/summary` | The caller receives the resource, or a recoverable receipt — **never a bare `500` after money has moved**. This is the direct downstream consequence of the race and is currently unguarded. | — | **NOT IMPLEMENTED** | Same defect as TC-103, reached by a different trigger. `records.ts:49` has no `.catch`, unlike the denied path at `:37` |

## C.5 Chain integration against the deployed contract

Target file: **new** `api/test/algorand.live.spec.ts`, gated on `RUN_LIVE=1` and a real `OPERATOR_MNEMONIC`. App ID **768743428**, TestNet.

| ID | Requirement | Level | Scenario | Preconditions | Input | Expected Result | Actual Result | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| TC-140 | FR-013, FR-023, SEC-009 | Integration (live) | `checkAccess` against a known-revoked pair on the deployed app | `OPERATOR_MNEMONIC` set; App `768743428` reachable | The `(patient, requester)` pair from TC-054 | `false`; the call is a `simulate()` — zero fee, nothing submitted | — | **NOT IMPLEMENTED** | `algorand.ts:82-100`; the two existing grant boxes are both revoked |
| TC-141 | FR-013, FR-018 | Integration (live) | `checkAccess` returns true for a freshly granted pair | A grant created on TestNet during setup | New `(patient, requester, scope)` | `true`, then `false` after a revoke in teardown | — | **NOT IMPLEMENTED** | `algorand.ts:82-100` |
| TC-142 | FR-028 | Integration (live) | `getAuditCount` for an unknown patient | `OPERATOR_MNEMONIC` set | A random address | `0n` — via the contract's `get(patient, default=UInt64(0))` | — | **NOT IMPLEMENTED** | `algorand.ts:103-121`; `contract.py:239-240` |
| TC-143 | **FR-012, FR-025, E-1** | Integration (live) | **`logAccess` writes a real audit entry on TestNet and it is readable back** | Operator is contract admin; app account has MBR headroom | `logAccess(P, R, "records:summary", "/v1/records/summary", "consent_checked")` | Transaction confirms; `getAuditCount(P)` increments; a new `s`-prefixed and a new `a`-prefixed box appear on the app; `total_audit_entries` increments from 0 | — | **NOT IMPLEMENTED** | **Executing this once closes evidence gap E-1, the largest in the project.** `algorand.ts:146-179`; `contract.py:217-236` |
| TC-144 | NFR-004, SEC-011 | Integration | Missing operator key produces a clear, non-leaking error | `OPERATOR_MNEMONIC` unset | `GET /v1/consent/status?...` | A deliberate, non-500 error naming the missing configuration — **not** the raw `Error` message echoed to the caller | — | **NOT IMPLEMENTED** | `algorand.ts:8-14` throws; `app.ts:58-61` echoes `err.message`. Note the free, unauthenticated `/v1/consent/status` has a hard dependency on the operator private key being loaded. |

## C.6 Contract-level tests that would catch confirmed defects

Target file: extend `contracts/tests/test_consent.py`.

| ID | Requirement | Level | Scenario | Preconditions | Input | Expected Result | Actual Result | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| **TC-150** | FR-024 | Unit (AVM sim) | **`request_access` emits `AccessRequested` with the correct field order** | Contract created; sender is the requester | `request_access(patient, "records:summary")` | Decoded event: `patient` field == the `patient` argument; `requester` field == `Txn.sender` | — | **NOT IMPLEMENTED** | **This test would fail today.** `contract.py:146` passes `Txn.sender` (the requester) into the struct's first field, which is declared `patient` (`contract.py:76-79`) — the two are swapped (**defect C-1**). Any ARC-28 event consumer receives inverted data. One-line fix: swap the two arguments. |
| TC-151 | FR-018 | Unit (AVM sim) | `AccessGranted` event payload is correct | Contract created | `grant_access(requester, scope, 3600)` | Decoded event carries patient = `Txn.sender`, requester, scope, and `expires_at` equal to the stored value | — | **NOT IMPLEMENTED** | `contract.py:169-176` — correct as written, but unasserted |
| TC-152 | FR-020 | Unit (AVM sim) | `AccessRevoked` event payload is correct | Grant exists | `revoke_access(requester, scope)` | Decoded event carries patient = `Txn.sender`, requester, scope | — | **NOT IMPLEMENTED** | `contract.py:195` — correct as written, but unasserted |
| **TC-153** | FR-032, REL-006 | Unit (AVM sim) | **`get_grant_box_mbr` returns the true per-box minimum balance** | Contract created | `get_grant_box_mbr()` | `2500 + 400 * (len(effective_key) + len(value))` where the effective key includes the BoxMap's 1-byte `"g"` prefix ⇒ key length **33**, value 17 ⇒ **22,500** µALGO | — | **NOT IMPLEMENTED** | **This test would fail today.** `contract.py:52` computes `2_500 + 400 * (32 + 17)` = **22,100** — 400 µALGO/box too low (**defect C-2**). Independently confirmed on-chain: app account min-balance 145,000 − 100,000 base = 45,000 = 2 × 22,500 with `total-boxes = 2`. A backend sizing `fund_mbr` from this method under-funds by ~1.8 %. Fix: `400 * (33 + 17)`. |
| TC-154 | FR-030 | Unit (AVM sim) | `fund_mbr` accepts a payment addressed to the app account | Contract created | Grouped `PaymentTransaction` with `receiver == Global.current_application_address` | Call succeeds | — | **NOT IMPLEMENTED** | `contract.py:129-138` — **`fund_mbr` has no test of any kind today** |
| TC-155 | FR-030 | Unit (AVM sim) | `fund_mbr` rejects a payment addressed elsewhere | Contract created | Grouped payment with a different `receiver` | `AssertionError` ("must pay the app") | — | **NOT IMPLEMENTED** | assert at `contract.py:138` |
| TC-156 | FR-031, SEC-002 | Unit (AVM sim) | **The successful `withdraw_excess` path** | Contract created; app account funded above MBR; sender is admin | `withdraw_excess(amount)` | An inner `itxn.Payment` is submitted to `self.admin.value` with `fee = 0`; the app balance decreases by `amount` | — | **NOT IMPLEMENTED** | Only the negative case exists (TC-014). `contract.py:254-259`; FR-031 is **PARTIALLY IMPLEMENTED** for exactly this reason |
| TC-157 | FR-019, FR-023 | Unit (AVM sim) | Expiry boundary: `latest_timestamp == expires_at` exactly | Clock pinned | Grant for 3600 s at t=1 000 000; set clock to exactly 1 003 600 | `check_access` → `False` — the comparison is strict `<` | — | **NOT IMPLEMENTED** | `contract.py:209` — TC-006 tests t+3601, never the exact boundary |
| TC-158 | FR-019 | Unit (AVM sim) | `duration_seconds == 0` stores `expires_at == 0` and never expires | Clock pinned | `grant_access(requester, scope, 0)`, then advance the clock far forward | `get_grant(...).expires_at == 0`; `check_access` still `True` | — | **NOT IMPLEMENTED** | `contract.py:152`, `:206-208` |
| TC-159 | FR-025, FR-027, DATA-002 | Unit (AVM sim) | Sequence continues monotonically for a patient who already has entries | `audit_seq[patient]` already 3 | `log_access(patient, ...)` | Returns `4`; the existing entries 1–3 are unchanged and unreadable-as-mutated | — | **NOT IMPLEMENTED** | `contract.py:224-234`; DATA-002 (append-only) is **IMPLEMENTED** but unasserted |
| TC-160 | FR-023 | Unit (AVM sim) | `get_grant` on a non-existent grant fails atomically | No grants | `get_grant(patient, requester, scope)` | `AssertionError` ("no such grant") | — | **NOT IMPLEMENTED** | assert at `contract.py:214` |
| TC-161 | FR-029 | Unit (AVM sim) | `create` is create-only | Contract already created | Call `create()` again on an existing app | Rejected — `@arc4.abimethod(create="require")` | — | **NOT IMPLEMENTED** | `contract.py:118` |

## C.7 Reliability and error handling

Target file: **new** `api/test/reliability.spec.ts`.

| ID | Requirement | Level | Scenario | Preconditions | Input | Expected Result | Actual Result | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| TC-170 | **REL-001 / R-1** | Integration | Facilitator unreachable ⇒ priced routes degrade gracefully | `FACILITATOR_URL` pointed at a closed port | `POST /v1/triage` | **Required:** `503` with `Retry-After`, or a 402 constructed from cached/configured payment kinds. **Current:** `500` with `"Failed to initialize: no supported payment kinds loaded from any facilitator."` and **no `PAYMENT-REQUIRED` header** — reproduced by the reviewer | — | **NOT IMPLEMENTED** | `api/src/x402.ts:6-14`; root cause is that `accepts[].asset` and `extra.feePayer` come from the facilitator's `/supported`, so the 402 cannot be built offline |
| TC-171 | **REL-005** | Integration (**regression**) | Free routes stay up when the facilitator is down | `FACILITATOR_URL` pointed at a closed port | `GET /v1/health`, `GET /`, `GET /v1/consent/app-info` | All `200` | — | **NOT IMPLEMENTED** | REL-005 is **VALIDATED** by the reviewer's manual reproduction but has no automated guard; this test locks in a genuinely good property |
| TC-172 | **SEC-010 / R-3** | Integration (**regression**) | A 58-character but invalid address is a client error, not a server error | API running | `GET /v1/consent/status?patient=AAAA…(58 chars)&requester=<valid>&scope=records:summary` | **Required:** `400`. **Current:** `500` with body `{"error":"wrong checksum for address"}` — reproduced by the reviewer | — | **NOT IMPLEMENTED** | zod validates length only (`api/src/routes/consent.ts:6-10`, `records.ts:5-8`); `algosdk.decodeAddress` throws inside `grantBoxName` (`algorand.ts:48-50`). Fix: `.refine(algosdk.isValidAddress)` on all four address fields |
| TC-173 | **SEC-011** | Integration (**regression**) | Internal exception text is never returned to an unauthenticated caller | Force any handler to throw | Any request that triggers `app.onError` | Body is a generic message; the detail appears only in the server log | — | **NOT IMPLEMENTED** | `api/src/app.ts:58-61` returns `err.message` verbatim |
| TC-174 | **REL-003 / R-4** | Integration | algod calls have an explicit timeout and bounded retry | Point `algodServer` at a black-holed address | `GET /v1/consent/status` | Bounded failure inside a defined budget, not an indefinite hang | — | **NOT IMPLEMENTED** | `new algosdk.Algodv2("", config.algodServer, "")` at `algorand.ts:5` — no timeout, no retry, no circuit breaker |
| TC-175 | REL-003 | Integration | Round-wait exhaustion on a submitted transaction is handled | Simulate `atc.execute(algod, 4)` exceeding 4 rounds | `logAccess(...)` | A typed, retryable error — not an unhandled rejection surfacing as a raw 500 | — | **NOT IMPLEMENTED** | `algorand.ts:175`; 4 rounds is roughly 14 s on Algorand |
| TC-176 | SEC-013 | Integration | Rate limiting on free endpoints | Rate limiter installed | 1000 rapid `GET /v1/consent/status` | Excess requests receive `429` | — | **NOT IMPLEMENTED** | No rate limiting exists anywhere. `/v1/consent/status` is free, unauthenticated, and makes **two** outbound algod calls per request — usable both to exhaust the API and to amplify traffic at AlgoNode |

## C.8 Intelligence layer

Target files: extend `api/test/interactionChecker.spec.ts` and `api/test/triageScorer.spec.ts`, plus a new route-level spec.

| ID | Requirement | Level | Scenario | Preconditions | Input | Expected Result | Actual Result | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| **TC-180** | **AI-006** | Unit (**defect exposure**) | **1-character medication names must not produce false positives** | `interactions.json` loaded | `checkInteractions(["a", "b"])` | **Required:** `flagged === false`, `matches` empty. | — | **NOT IMPLEMENTED** | **Measured by execution on 2026-08-21: returns `flagged: true` with 5 matches — `warfarin+aspirin` (major), `warfarin+ibuprofen` (major), `warfarin+naproxen` (major), `maoi+sertraline` (contraindicated), `simvastatin+clarithromycin` (major).** Root cause: the matching rule at `api/src/services/interactionChecker.ts:42-43` is `m.includes(a) \|\| a.includes(m)` — unanchored and symmetric — so the single character `"a"` is contained by "warfarin", "aspirin", "naproxen", "maoi" and others. **TC-027 feeds exactly this input today and asserts only the disclaimer**, so the defect ships behind a green suite. Fix: token-boundary matching or an explicit synonym/RxNorm map. Severity LOW-MEDIUM. |
| **TC-185** | **AI-006** | Unit (**defect exposure**) | **2-character substrings of real drug names must not produce false positives** | `interactions.json` loaded | `checkInteractions(["in", "as"])` | **Required:** `flagged === false`, `matches` empty. | — | **NOT IMPLEMENTED** | **Measured by execution on 2026-08-21: returns `flagged: true` with 4 matches — `warfarin+aspirin` (major), `simvastatin+clarithromycin` (major), `simvastatin+erythromycin` (major), `metformin+iodinated contrast` (moderate).** Demonstrates that the failure is not limited to single characters: any short token that is a substring of a table entry flags. Same root cause and same fix as TC-180. |
| **TC-186** | **AI-090** *(new, added by Test_Cases.md)* | Unit (**defect exposure**) | **A negated symptom mention must not score as if the symptom were present** | none | `scoreTriage("I have no chest pain")` | **Required:** `score === 0`, `band === "routine"`, `matchedFlags` empty — or, if negation is judged out of scope, the limitation must be stated in the response and in `docs/API.md` rather than left silent. | — | **NOT IMPLEMENTED** | **Measured by execution on 2026-08-21: returns `{score: 35, band: "urgent", matchedFlags: ["possible cardiac chest pain"]}`.** The scorer is a plain `normalized.includes(kw)` substring scan (`api/src/services/triageScorer.ts:58-63`) with **no negation handling of any kind**, so "no chest pain", "denies chest pain" and "chest pain resolved" all score 35 and band `urgent`. NFR-009 (deterministic and inspectable) still holds — the behaviour is exactly what the source says it is — but AI-003 (do not present the score as a clinical severity measure) is materially weakened when a negation inflates the band. **New requirement AI-090: triage scoring shall not score a negated symptom mention as if the symptom were present.** |
| TC-181 | AI-006, FR-008 | Unit | Token-boundary matching preserves the legitimate partial-name case | Fix applied | `["Aspirin 81mg", "Warfarin sodium"]` | Still flagged — dose suffixes and salt forms must keep matching (TC-025 must not regress) | — | **NOT IMPLEMENTED** | Guards against an over-tight fix for TC-180 / TC-185 |
| TC-182 | FR-004, FR-038 | Integration | Triage input length boundaries | Payment settled | `symptoms` of length 0, 1, 2000, 2001 | `400`, `200`, `200`, `400` | — | **NOT IMPLEMENTED** | `api/src/routes/triage.ts:5-7` |
| TC-183 | FR-007, FR-038 | Integration | Interaction list size boundaries | Payment settled | `medications` arrays of length 1, 2, 20, 21, and one containing `""` | `400`, `200`, `200`, `400`, `400` | — | **NOT IMPLEMENTED** | `api/src/routes/interaction.ts:5-7` |
| TC-184 | **AI-007**, SEC-004 | Integration | Free-text clinical input never reaches the ledger | Mocked `logAccess` | Paid `/v1/triage` and `/v1/records/summary` calls with distinctive symptom text | `logAccess` is called only with the constant `scope`/`endpoint`/`action` strings; the symptom text appears in no chain argument | — | **NOT IMPLEMENTED** | `records.ts:10-11`, `:37`, `:49` — correct by construction, currently unasserted |

## C.9 Frontend

Target: **new** `web/vitest.config.ts` + `@testing-library/react` + `jsdom`; Playwright for E2E. **No test runner is installed in `web/` today.**

| ID | Requirement | Level | Scenario | Preconditions | Input | Expected Result | Actual Result | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| TC-190 | FR-037 | Component | The published pricing table matches the prices the API actually charges | Test runner installed | Render `PricingTable` | The rendered rows match `$0.02` / `$0.02` / `$0.05` and the free tier, as configured in `api/src/app.ts:41-46` | — | **NOT IMPLEMENTED** | `web/components/PricingTable.tsx`; a drift test between the UI and the middleware map |
| TC-191 | FR-036, OPS-001 | Component | Health badge renders loading, healthy and unreachable states | Fetch mocked | `NetworkBadge` against 200 / network error | Correct state per response; no unhandled rejection | — | **NOT IMPLEMENTED** | `web/components/NetworkBadge.tsx` polls `/v1/health` |
| TC-192 | FR-033 | Component | Demo wallet generates, persists and clears | jsdom `sessionStorage` | Generate → reload → clear | A valid Algorand keypair; persisted under `medrail-demo-wallet-v1`; cleared on request | — | **NOT IMPLEMENTED** | `web/lib/demoWallet.ts:14-31`. The mnemonic is stored as **plaintext JSON in `sessionStorage`** — TestNet-only and disclosed in the UI, but any XSS on the demo page exfiltrates the key |
| TC-193 | FR-035, NFR-008 | Component | Consent grant/revoke are signed client-side and never sent to the backend | algod mocked | `ConsentChecker` grant → check → revoke | Transactions are constructed and signed locally; **no request carries a mnemonic or secret key to the API** | — | **NOT IMPLEMENTED** | `web/lib/consent.ts:44-89`. NFR-008 is a genuine strength of the design and deserves a permanent guard |
| TC-194 | FR-001…FR-003, FR-034 | E2E (Playwright) | Full browser flow: wallet → paid call → settled transaction rendered | API running locally against TestNet; funded demo wallet | Click through `LiveDemoPanel` | `200` from the priced endpoint; a real transaction id displayed and resolvable on `lora.algokit.io` | — | **NOT IMPLEMENTED** | `web/lib/x402Client.ts`, `web/components/LiveDemoPanel.tsx`. Note `x402Client.ts` deliberately skips `getPaymentSettleResponse` on a non-200 — a 402 means signed-but-unsettled and carries no `PAYMENT-RESPONSE` header |
| TC-195 | SEC-007 | Component (**masking guard**) | The demo panel sends its own wallet address as `requesterAddress` | Wallet present | Trigger a records call | Request body `requesterAddress === wallet.address` | — | **NOT IMPLEMENTED** | `web/components/LiveDemoPanel.tsx`. **This coincidence is precisely why S-1 never manifests in the demo.** Documenting it as a test makes the masking explicit rather than accidental |
| TC-196 | NFR-006 | E2E | CORS preflight succeeds for a payment-signing browser client | API running | Cross-origin `POST /v1/triage` with a `PAYMENT-SIGNATURE` header | Preflight passes; `PAYMENT-REQUIRED` and `PAYMENT-RESPONSE` are exposed | — | **NOT IMPLEMENTED** | `api/src/app.ts:20-33`. A hand-maintained `allowHeaders` allowlist previously drifted and broke every paid browser call; the fix is documented in a comment but guarded by no test |

## C.10 Pipeline, configuration and supply chain

| ID | Requirement | Level | Scenario | Preconditions | Input | Expected Result | Actual Result | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| TC-200 | **OPS-006 / CI-1** | Pipeline | CI triggers on the repository's actual default branch | — | Push a commit to `master` | The `contract`, `api` and `web` jobs run | — | **NOT IMPLEMENTED** | `.github/workflows/ci.yml:4-5` triggers on `main`; the only branch is `master`. **No push has ever triggered CI.** All three jobs pass locally — the pipeline is correct, it has simply never fired |
| TC-201 | **CI-2** | Pipeline | The API suite runs hermetically | Facilitator `/supported` stubbed via `msw`/`nock` | `npx vitest run` with the network disabled | 18/18 pass with no outbound request; a separate `RUN_LIVE=1` variant exercises the real facilitator | — | **NOT IMPLEMENTED** | `x402-flow.spec.ts:2` → `api/src/x402.ts:6` |
| TC-202 | **CI-3** | Pipeline | Coverage is measured and published | `@vitest/coverage-v8` and `pytest-cov` installed | `vitest run --coverage`, `pytest --cov` | A coverage report artefact per run and a stored baseline. **Until this exists, no coverage percentage may be quoted anywhere in this documentation set.** | — | **NOT IMPLEMENTED** | No `--coverage` flag, no threshold, no report exists in the repository |
| TC-203 | **NFR-007, D-1, D-2** | Pipeline | Both container images build and the API image boots healthy | Docker available | `docker build` (`api/` with the repo root as context, and `web/`), then run the API image and probe it | Both build; the API container returns `200` from `GET /v1/health` with the expected `network` and a non-null `consentAppId` | — | **NOT IMPLEMENTED** | Neither Dockerfile is exercised by CI, so NFR-007 is **UNVALIDATED**. This single test would catch **D-1** — `contracts/artifacts/deploy_testnet.json` is not copied into the image, so without an explicit `CONSENT_APP_ID` the config falls back to `0` and both `/v1/consent/status` and `/v1/records/summary` return 500; `api/fly.toml` does not set it. It would also surface **D-2** — `fly.toml` hard-codes `NETWORK = "mainnet"` where no contract is deployed |
| TC-204 | **SEC-014, SEC-015** | Pipeline | Dependency and secret scanning gate every change | Scanners wired | `npm audit --audit-level=high`, `pip-audit`, CodeQL, `gitleaks` over the build context | High/Critical findings block the merge; no secret material is present in the Docker build context | — | **NOT IMPLEMENTED** | No scanning of any kind in `ci.yml`. Related: there is **no `.dockerignore` anywhere in the repository**, and `api/Dockerfile`'s build context is the repo root, so `api/.env` and `contracts/.env` — both containing live mnemonics — enter the build context (defect **D-3**). Nothing is `COPY`'d from them today, so no secret currently lands in an image, but the margin is one careless `COPY` wide |

---

## 4. Requirement coverage roll-up

Derived arithmetically from the register above and the requirement registry in [`../02_Requirements/Requirements_Traceability_Matrix.md`](../02_Requirements/Requirements_Traceability_Matrix.md). **This is requirement coverage, not code coverage — no code-coverage figure exists anywhere in this repository and none may be quoted (see TC-202).**

Counting rule: a requirement is "covered by an automated test" if at least one passing test or automated CI gate exercises it; "manual only" if its sole evidence is a Part B on-chain procedure or a reviewer's manual reproduction; otherwise it has no test evidence.

| Prefix | Requirements | Covered by a passing automated test | Covered only by a manual procedure | No test evidence at all |
|---|---|---|---|---|
| FR | 40 | 22 | 4 | 14 |
| NFR | 12 | 2 | 0 | 10 |
| SEC | 16 | 3 | 1 | 12 |
| PERF | 4 | 0 | 0 | 4 |
| REL | 6 | 0 | 2 | 4 |
| OPS | 8 | 0 | 0 | 8 |
| DATA | 6 | 2 | 0 | 4 |
| AI | 9 (incl. **AI-090**, new) | 3 | 0 | 6 |
| **Total** | **101** | **32** | **7** | **62** |

The "32" in the second column is a coincidence of arithmetic and not the test count — 32 *requirements* have automated coverage, delivered by 32 *tests*, and the two sets do not correspond one-to-one.

Twenty-four of the sixty-two uncovered requirements describe capabilities that are **NOT IMPLEMENTED** or **PLANNED** rather than implemented-but-untested (FR-039; SEC-007, SEC-008, SEC-010…SEC-015; PERF-002…PERF-004; REL-001…REL-003; OPS-002…OPS-005, OPS-008; AI-005, AI-006, AI-090; DATA-006). The remaining thirty-eight are shipped behaviour with no verification behind it — most consequentially FR-010, FR-011, FR-012 (`records.ts`), NFR-011 (key parity) and REL-004 (concurrency).

**New requirement allocated by this document** (from the Testing cluster's reserved block, per the registry's §9):

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| **AI-090** *(new, added by Test_Cases.md)* | Triage scoring shall not score a negated symptom mention as if the symptom were present. | **NOT IMPLEMENTED** | `api/src/services/triageScorer.ts:58-63` performs an unqualified `normalized.includes(kw)` scan with no negation handling. Measured by execution on 2026-08-21: `scoreTriage("I have no chest pain")` → `score 35`, `band "urgent"`. Test: TC-186. |

The four highest-leverage additions, in order: **TC-110** (payer binding, closes the CRITICAL finding), **TC-103** (settled-payment loss), **TC-125** (key-derivation parity), **TC-143** (closes evidence gap E-1).
