# MedRail — Use Cases


> **⚠ Correction notice.** Parts of this document were written against a review finding that was
> later proven wrong. Settlement in x402 v2 happens **only** on a sub-400 response, so **no error
> path in MedRail can consume a settled payment** — and consent-denied calls (HTTP 403) are **not
> charged**, contrary to `API.md`, `SECURITY.md`, and the `paidButDenied` field. The audit-sequence
> race causes a **rejected transaction**, not a corrupted log. See
> [`CORRECTIONS.md`](../CORRECTIONS.md) — it supersedes any statement here that contradicts it.

**Purpose:** Specify, in a single verifiable format, every use case the implemented system supports — including the one it fails — with the evidence and status for each.

**Status of this document:** Authored 2026-08-21 against the verified fact ledger and source at commit `32ffd73`. Each use case carries the ledger's status vocabulary. **UC-006, UC-007 and UC-011 have never been executed against the deployed contract**; the audit-append step common to all three has never run on Algorand TestNet (`total_audit_entries == 0` on App `768743428`). Requirement IDs are taken verbatim from the canonical registry; two new IDs are allocated here from the reserved `FR-100…FR-119` block and are marked as such.

**Format.** Every use case uses the same eight fields: **Actor → Precondition → Action → System Behaviour → Expected Outcome → Postcondition → Evidence → Status**.

**Fixed system facts referenced throughout:** App ID `768743428` (Algorand TestNet, genesis `SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=`); facilitator `https://facilitator.goplausible.xyz`; USDC ASA `10458941`; prices `$0.02` / `$0.02` / `$0.05` = 20000 / 20000 / 50000 µUSDC; three priced routes, four free `/v1/*` routes plus `GET /`; no database, cache, queue, worker, or model of any kind.

---

## Index

| UC | Title | Primary requirements | Status |
|---|---|---|---|
| [UC-001](#uc-001--unpaid-request-to-a-priced-route-yields-a-402-challenge) | Unpaid request to a priced route yields a 402 challenge | FR-001, FR-002 | **VALIDATED** |
| [UC-002](#uc-002--agent-pays-for-a-triage-score) | Agent pays for a triage score | FR-003, FR-004, FR-005, FR-006, FR-009 | **VALIDATED** |
| [UC-003](#uc-003--agent-pays-for-a-medication-interaction-check) | Agent pays for a medication interaction check | FR-003, FR-007, FR-008, FR-009 | **VALIDATED** (settlement by shared mechanism) |
| [UC-004](#uc-004--patient-grants-a-scoped-consent) | Patient grants a scoped consent | FR-018, FR-019, FR-022, FR-035, SEC-003 | **VALIDATED** |
| [UC-005](#uc-005--patient-revokes-a-consent) | Patient revokes a consent | FR-020, FR-021, FR-035, SEC-003 | **VALIDATED** |
| [UC-006](#uc-006--requester-reads-a-record-summary-under-a-valid-grant) | Requester reads a record summary under a valid grant | FR-010, FR-012, FR-025, SEC-006 | **UNVALIDATED** |
| [UC-007](#uc-007--requester-pays-and-is-denied) | Requester pays and is denied | FR-011 | **UNVALIDATED** |
| [UC-008](#uc-008--anyone-looks-up-consent-status-free) | Anyone looks up consent status, free | FR-013, SEC-009 | **IMPLEMENTED** |
| [UC-009](#uc-009--third-party-fetches-the-arc-56-application-spec) | Third party fetches the ARC-56 application spec | FR-015 | **IMPLEMENTED** |
| [UC-010](#uc-010--operator-rotates-the-contract-admin-key) | Operator rotates the contract admin key | FR-029, SEC-002 | **VALIDATED** (contract) / **NOT IMPLEMENTED** (runbook) |
| [UC-011](#uc-011--abuse--paying-stranger-impersonates-an-authorised-requester) | **[ABUSE]** Paying stranger impersonates an authorised requester | FR-039, SEC-007, SEC-008 | **NOT MITIGATED** |
| [UC-012](#uc-012--application-account-is-funded-for-box-mbr) | Application account is funded for box MBR | FR-030, FR-100, REL-006 | **PARTIALLY IMPLEMENTED** |

### New requirement IDs allocated by this document

Allocated from the `FR-100…FR-119` block reserved for Product / Use Cases.

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| **FR-100** *(new, added by `docs/01_Product/Use_Cases.md`)* | The deployment script shall fund the application account at creation with sufficient ALGO to cover box minimum-balance requirements, and shall be idempotent across re-runs — neither re-creating nor re-funding an application that already exists. | **IMPLEMENTED** | `contracts/scripts/deploy_testnet.py:99-137`; funding tx `KYH3H5CG2CCUPUUTJIBX47WD4RWSUV3QWTEUJQRQFYLWO5YAO3QA` round 66088626; app account balance 5,000,000 µALGO |
| **FR-101** *(new, added by `docs/01_Product/Project_Vision.md`)* | All priced endpoints shall settle to a single configured `payTo` address, so the submission classifies as a Composite entry. | **IMPLEMENTED** | `api/src/app.ts:37-50`; `api/src/x402.ts:26`; `api/src/config.ts:53` |

---

## UC-001 — Unpaid request to a priced route yields a 402 challenge

| Field | Content |
|---|---|
| **Actor** | P-1 — autonomous agent / third-party developer |
| **Precondition** | `medrail-api` is running. The GoPlausible facilitator is reachable and `x402ResourceServer.initialize()` has loaded at least one supported payment kind. `PAY_TO_ADDRESS` is configured. |
| **Action** | `POST /v1/triage` (or `/v1/interaction-check`, or `/v1/records/summary`) with **no** `PAYMENT-SIGNATURE` header. |
| **System Behaviour** | `paymentMiddleware`, registered on `*` ahead of every route (`api/src/app.ts:37-50`), intercepts before the handler. `priced()` (`api/src/x402.ts:16-32`) supplies scheme `exact`, the configured CAIP-2 network, the price string and `payTo`; **the asset id and `extra.feePayer` are resolved from the facilitator's `/supported`, not from MedRail configuration**. The route handler never runs. |
| **Expected Outcome** | HTTP **402**, body `{}` (the payload is header-only), headers `payment-required` (base64), `cache-control: no-store`, `access-control-allow-origin: *`, `access-control-expose-headers: PAYMENT-REQUIRED,PAYMENT-RESPONSE`. Decoded: `{"x402Version":2,"error":"Payment required","resource":{…},"accepts":[{"scheme":"exact","network":"algorand:SGO1GK…","amount":"20000","asset":"10458941","payTo":"2WDV2J2F…","maxTimeoutSeconds":300,"extra":{"feePayer":"ZMFK2OI7…"}}]}` |
| **Postcondition** | No state changed anywhere. No transaction submitted. No server-side session created (NFR-001). |
| **Evidence** | `api/src/app.ts:37-50`; `api/src/x402.ts:11-32`; live capture in ledger §4; asserted by `api/test/x402-flow.spec.ts` (3 cases, checking `amount` = `"20000"`/`"50000"` and `network` matching `/^algorand:/`) |
| **Status** | **VALIDATED** |

**Alternate flow A1 — facilitator unreachable.** `initialize()` throws `"Failed to initialize: no supported payment kinds loaded from any facilitator."` The caller receives **HTTP 500 with no `PAYMENT-REQUIRED` header** — not a 402, not a 503, no `Retry-After`. Reproduced by the reviewer. Free routes remain 200 (REL-005 **VALIDATED**). REL-001 **NOT IMPLEMENTED** (R-1). This is also the mechanism behind CI-2: `x402-flow.spec.ts` makes a live call to the facilitator at module import, so a facilitator outage turns into a red build with a misleading failure.

**Alternate flow A2 — malformed body with a valid payment.** zod rejects with 400 and a `flatten()` payload (`api/src/routes/triage.ts:13-15`). **The payment has already settled** — the middleware runs first. FR-038 **PARTIALLY IMPLEMENTED**.

---

## UC-002 — Agent pays for a triage score

| Field | Content |
|---|---|
| **Actor** | P-1 |
| **Precondition** | Caller holds an Algorand account opted in to ASA `10458941` with ≥ 20000 base units of USDC. Caller runs an x402 v2 `exact`-scheme client. **No ALGO is required** — the facilitator sponsors the fee via `extra.feePayer`. No account with MedRail exists or is created. |
| **Action** | `POST /v1/triage` with `PAYMENT-SIGNATURE` and body `{"symptoms": "<1..2000 chars>"}`. |
| **System Behaviour** | Middleware forwards the signed payment to the facilitator for verify + settle. On confirmation the handler runs: zod validates `symptoms` (`api/src/routes/triage.ts:5-7`); `scoreTriage()` lowercases the input, substring-matches against **11** hard-coded red-flag groups, sums their weights and caps at 100 (`api/src/services/triageScorer.ts:53-73`); the band is `emergency ≥60`, `urgent ≥30`, `soon ≥10`, else `routine` (`:46-51`). **No model, no inference, no external call, no persistence** — a pure function over a static table. |
| **Expected Outcome** | HTTP **200**, `{score, band, matchedFlags, disclaimer}`, plus a `PAYMENT-RESPONSE` header carrying the settled transaction. Recorded example (`contracts/artifacts/e2e-proof.json`): `{"score":70,"band":"emergency","matchedFlags":["possible cardiac chest pain","respiratory distress"],"disclaimer":"…"}` — 35 + 35, reconstructible by hand from `triageScorer.ts:33-34`. |
| **Postcondition** | USDC has moved from payer to `payTo` on Algorand. **No MedRail-side state changed** — no session, no record, no on-chain audit entry (the open endpoints are pure compute; `docs/ARCHITECTURE.md` says "Both categories write to the same audit log" and then corrects itself — the correction is the accurate half, and in fact *neither* category has ever written to it on-chain). |
| **Evidence** | Settled tx `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ` — `axfer`, asset `10458941`, amount **20000**, round **66091768**, `fee: 0`, group `XQzhbjBAqt0AjC5AByQsCxGbMdEuca3ZZFMyFBTb7K4=`, note `x402-payment-v2-1786140083822`. `api/test/triageScorer.spec.ts` (7 cases). `api/scripts/e2e-proof.ts` (manual, not in CI). |
| **Status** | **VALIDATED** — with the disclosure that exactly **one** settled payment exists and its sender equals its receiver (`2WDV2J2F…` paid itself; `docs/PROOF.md` §6). It is a genuine facilitator-settled x402 payment. It is **not** payment volume. |

**Requirements:** FR-003, FR-004, FR-005, FR-006, FR-009, AI-001, AI-002, AI-003, NFR-009.

---

## UC-003 — Agent pays for a medication interaction check

| Field | Content |
|---|---|
| **Actor** | P-1 |
| **Precondition** | As UC-002. |
| **Action** | `POST /v1/interaction-check` with `PAYMENT-SIGNATURE` and body `{"medications": ["warfarin","aspirin"]}` — 2 to 20 items, each ≥ 1 character (`api/src/routes/interaction.ts:5-7`). |
| **System Behaviour** | After settlement: `checkInteractions()` normalises each name (trim + lowercase) and tests every one of **14** curated pairs loaded once at module load by `readFileSync` from `api/src/data/interactions.json` (`api/src/services/interactionChecker.ts:18`). A pair matches when both of its drugs are present under **bidirectional substring containment** — `m.includes(a) \|\| a.includes(m)` (`:42-43`). Severities are `moderate \| major \| contraindicated`. |
| **Expected Outcome** | HTTP **200**, `{flagged, matches, source, disclaimer}`. `source` cites "Lexicomp/Micromedex-class severity classifications" as a **class of reference**, not a licensed dataset — the response says so and the test asserts the field is present. |
| **Postcondition** | USDC moved. No MedRail-side state changed. |
| **Evidence** | `api/src/routes/interaction.ts:11-18`; `api/src/services/interactionChecker.ts:36-55`; `api/src/data/interactions.json`; `api/test/interactionChecker.spec.ts` (6 cases). Settlement shares the mechanism validated in UC-002. |
| **Status** | **VALIDATED** for scoring and settlement mechanism; no settled payment against *this specific route* has been recorded. |

**Known defect — exception flow E1.** The substring rule is symmetric and unanchored, so a one- or two-character medication name is contained by many table entries (a medication literally named `"a"` is `includes`-contained by "warfarin", "aspirin", and others). The existing test `interactionChecker.spec.ts:"always includes a source citation"` calls `checkInteractions(["a","b"])` and asserts only the disclaimer, so this is not caught. Severity LOW-MEDIUM: false positives on short or malformed input. **RECOMMENDED** fix: token-boundary matching, or an explicit synonym/RxNorm map. **AI-006 NOT IMPLEMENTED.**

**Requirements:** FR-003, FR-007, FR-008, FR-009, AI-004, DATA-005.

---

## UC-004 — Patient grants a scoped consent

| Field | Content |
|---|---|
| **Actor** | P-2 — patient, holding their own key |
| **Precondition** | Patient holds an Algorand account with enough ALGO for one app-call fee. App `768743428` exists and its account holds enough balance for box MBR. **Neither the patient nor the requester has opted in to the application** — box storage makes opt-in unnecessary (`contract.py:11-17`). |
| **Action** | Patient signs and submits `grant_access(requester: Account, scope: String, duration_seconds: UInt64)` directly to Algorand. In the demo: `web/lib/consent.ts:44-68` via `AtomicTransactionComposer` against AlgoNode, triggered from `web/components/ConsentChecker.tsx:32`. |
| **System Behaviour** | The contract computes `key = sha256(Txn.sender.bytes ‖ requester.bytes ‖ scope.bytes)` (`contract.py:95-98`) — **`Txn.sender` is the patient**, so no one can grant on another's behalf. `expires_at = 0` when `duration_seconds == 0`, else `Global.latest_timestamp + duration_seconds`. It reads the box's *prior status* (not its prior existence) to decide whether to increment `total_grants_active`, so a re-grant after revocation reactivates without double-counting (`:157-167`). It writes `GrantRecord{status:1, granted_at, expires_at}` into the `"g"`-prefixed BoxMap and emits `AccessGranted`. **The MedRail backend is not involved and never sees the key.** |
| **Expected Outcome** | A confirmed application-call transaction. The demo then re-checks via `GET /v1/consent/status` and displays `granted`. |
| **Postcondition** | `grants[key].status == STATUS_GRANTED (1)`. `total_grants_active` incremented iff it was not already active. One grant box exists, costing the app account its MBR. `check_access(patient, requester, scope)` now returns `true` until expiry or revocation. |
| **Evidence** | `contract.py:148-176`; `web/lib/consent.ts:44-68`; tx `X2BQ5FD4MW52B75WQGDB67TEULYLN7FHVFO6ZOBNI74PNCAKVOUA` round **66088672**; `contracts/tests/test_consent.py::test_grant_then_check_access`, `::test_grant_with_expiry_becomes_invalid_after_expiry`, `::test_regrant_after_revoke_reactivates` |
| **Status** | **VALIDATED** |

**Limitations of the current surface.** The UI grants only to `wallet.address` — patient and requester are the same account — and hard-codes `durationSeconds = 0`, so the expiry behaviour proven in the contract (FR-019) is unreachable from the browser. There is no real-wallet path: `web/lib/demoWallet.ts:12` points at `lib/walletConnect.ts`, **which does not exist** (DOC-4).

**Related — `request_access`.** A requester may signal interest via `request_access(patient, scope)` (`contract.py:140-146`; tx `5XIADMCGFP5I7H7AS656RXZS7MFEEPCVJGLA7T3SVE6XDEYSGFFA`). It increments `total_requests` and emits an event but **persists no state**. **Defect C-1:** `contract.py:146` emits `AccessRequested(Txn.sender, patient, scope)` while the struct is declared `patient, requester` — `Txn.sender` is the *requester*, so the event labels the parties backwards. Any ARC-28 event consumer receives inverted data. No on-chain state is corrupted. Not caught by tests, because `test_request_access_emits_event_and_counts` asserts only `total_requests == 1` and never inspects the payload. Severity MEDIUM; one-line fix. **FR-024 PARTIALLY IMPLEMENTED.**

**Requirements:** FR-018, FR-019, FR-022, FR-035, SEC-003, NFR-008, DATA-001, DATA-003.

---

## UC-005 — Patient revokes a consent

| Field | Content |
|---|---|
| **Actor** | P-2 — patient |
| **Precondition** | A grant box exists for `(Txn.sender, requester, scope)`. |
| **Action** | Patient signs and submits `revoke_access(requester, scope)`. Demo: `web/lib/consent.ts:70-89` via `ConsentChecker.tsx:39`. |
| **System Behaviour** | The contract asserts the box exists — `assert self.grants.maybe(key)[1], "no such grant"` (`contract.py:182`) — then rewrites the record with `status = STATUS_REVOKED (2)`, preserving `granted_at` and `expires_at`. If it was active, `total_grants_active` decrements and `total_revocations` increments. Emits `AccessRevoked`. The box is **not** deleted, so a later re-grant reuses it (UC-004). |
| **Expected Outcome** | A confirmed transaction. `check_access` immediately returns `false`. No backend, custodian, or operator participates. |
| **Postcondition** | Grant inactive. Counters adjusted. Box retained with its MBR still locked. |
| **Evidence** | `contract.py:178-195`; tx `OV2J2T5VWMIQG64JYGL7JEGZKKNZNKCMNIQU6AC4PDRQYZ6ZOO5A` round **66088674**; `test_consent.py::test_revoke_access`. Live state on App `768743428`: `total_revocations = 2`, `total_grants_active = 0`, 2 grant boxes present, both revoked. |
| **Status** | **VALIDATED** |

**Exception flow E1 — revoking a non-existent grant.** The assertion fails and the transaction is rejected atomically; no counter moves. `test_consent.py::test_revoke_nonexistent_grant_asserts`. **FR-021 VALIDATED.**

**Requirements:** FR-020, FR-021, FR-035, SEC-003, NFR-008.

---

## UC-006 — Requester reads a record summary under a valid grant

| Field | Content |
|---|---|
| **Actor** | P-3 — requesting clinician or care application |
| **Precondition** | A currently-valid grant exists for `(patientId, requesterAddress, "records:summary")`. Caller holds ≥ 50000 base units of USDC. `CONSENT_APP_ID` resolves (env, or the `readDeployedAppId` fallback at `api/src/config.ts:31-40`). `OPERATOR_MNEMONIC` is loaded — required even for the read-only simulate, since `simulate()` still needs a sender and signer. The operator account holds enough ALGO for one transaction and the app account enough for one audit box. |
| **Action** | `POST /v1/records/summary` with `PAYMENT-SIGNATURE` and `{"patientId": "<58 chars>", "requesterAddress": "<58 chars>"}`. |
| **System Behaviour** | 1. Middleware settles $0.05 **before the handler runs** — this ordering is what makes UC-007 possible. 2. zod validates both fields for **length 58 only**; no checksum check (see UC-007 E2). 3. `checkAccess` derives `"g" ‖ sha256(pk(patient) ‖ pk(requester) ‖ utf8(scope))` in TypeScript and calls `check_access` via `AtomicTransactionComposer.simulate()` — zero fee, nothing submitted (`api/src/services/algorand.ts:82-100`). 4. On `true`, `logAccess` runs inside `withPatientLock`: it reads `get_audit_count(patient)` (simulate), predicts `count + 1`, and submits an admin-signed `log_access` with both box references, waiting up to 4 rounds (`algorand.ts:146-179`). 5. The contract asserts `Txn.sender == admin`, increments the per-patient sequence, writes `AuditEntry{ts, requester, scope, endpoint, action}` and increments `total_audit_entries` (`contract.py:217-236`). |
| **Expected Outcome** | HTTP **200** with `{patientId, requesterAddress, scope:"records:summary", summary, consentVerifiedOnChain:true, auditTxId, auditSequence, disclaimer}`. `summary` is the fixed `SYNTHETIC_RECORD` — `bloodType "O+"`, allergies `["penicillin"]`, chronic `["type 2 diabetes (controlled)"]`, meds `["metformin 500mg","lisinopril 10mg"]`, `lastUpdated "2026-01-15"` — returned **regardless of `patientId`** (`api/src/routes/records.ts:15-21`). |
| **Postcondition** | USDC moved. One new `"a"`-prefixed audit box; `audit_seq[patient]` incremented; `total_audit_entries` incremented. Nothing stored server-side. |
| **Evidence** | `api/src/routes/records.ts:25-61`; `api/src/services/algorand.ts:82-179`; `contract.py:217-236`; `contracts/tests/test_consent.py` (2 `log_access` cases, AVM simulator only). **No test exists for `api/src/routes/records.ts` and none for `api/src/services/algorand.ts`.** |
| **Status** | **UNVALIDATED.** FR-010, FR-012 have no test. FR-025 is **UNVALIDATED on-chain**: `total_audit_entries == 0` and there are zero `s`- or `a`-prefixed boxes on App `768743428`, so **`log_access` has never executed on Algorand TestNet** (ledger §3, E-1). `auditTxId` and `auditSequence`, documented in `docs/API.md`, have never been produced by a real run. |

**Exception flow E1 — settled payment lost (REL-002 NOT IMPLEMENTED, finding R-2).** `records.ts:49` awaits `logAccess` **without a catch**, unlike the denied path at `:37`. If the write throws — operator out of ALGO, app account out of box MBR, algod 5xx, validity-window expiry — the request falls through to `app.onError` and returns **HTTP 500 after settlement**. The caller has paid $0.05, receives nothing, and has no refund path and no retry token. The rejection path is defensive; the success path is not.

**Exception flow E2 — no timeout or retry on chain I/O (REL-003 NOT IMPLEMENTED, R-4).** `new algosdk.Algodv2("", config.algodServer, "")` (`algorand.ts:5`) sets no timeout and no retry; `atc.execute(algod, 4)` waits 4 rounds and throws. One AlgoNode blip becomes a user-visible 500 on this route and on UC-008.

**Exception flow E3 — concurrent writes for one patient (REL-004 PARTIALLY IMPLEMENTED, D-7).** `withPatientLock` (`algorand.ts:129-138`) is an in-process per-patient promise chain. It does not protect against two backend instances sharing one operator account, and `api/fly.toml` permits more than one machine (`auto_start_machines = true`; `min_machines_running = 1` is a floor, not a ceiling).

**Exception flow E4 — containerised deployment (D-1, HIGH).** `contracts/artifacts/deploy_testnet.json` is not copied into the image, so the `readDeployedAppId` fallback finds nothing; if `CONSENT_APP_ID` is unset, `requireConsentAppId()` throws and this route returns 500. **`api/fly.toml` does not set `CONSENT_APP_ID`**, and it hard-codes `NETWORK = "mainnet"` where no `MedRailConsent` deployment exists (D-2).

**Requirements:** FR-010, FR-012, FR-025, FR-027, FR-028, SEC-001, SEC-006, SEC-009, DATA-002, DATA-004, AI-007, PERF-004 (**NOT IMPLEMENTED** — the audit write blocks the paid response path).

---

## UC-007 — Requester pays and is denied

| Field | Content |
|---|---|
| **Actor** | P-3 |
| **Precondition** | **No** currently-valid grant for `(patientId, requesterAddress, "records:summary")` — never granted, revoked, or expired. Caller holds ≥ 50000 base units of USDC. |
| **Action** | `POST /v1/records/summary` with a valid `PAYMENT-SIGNATURE` and both addresses. |
| **System Behaviour** | The $0.05 settles first. `checkAccess` returns `false`. The handler attempts an audit entry with `action = "consent_denied"`, wrapped defensively — `await logAccess(...).catch(() => undefined)` (`records.ts:37`) — so an on-chain failure cannot turn a correct 403 into a 500. It then returns 403. |
| **Expected Outcome** | HTTP **403**, `{error: "no valid consent grant from this patient for this requester and scope", patientId, requesterAddress, paidButDenied: true}`. |
| **Postcondition** | **The caller has paid and received no record.** If the audit write succeeded, a `"consent_denied"` entry exists on the patient's trail; if it failed, nothing on-chain records the attempt and no error surfaces. |
| **Evidence** | `api/src/routes/records.ts:33-47`; documented in [`../API.md`](../API.md) and defended in [`../SECURITY.md`](../SECURITY.md) §"consent-denied calls are still charged" |
| **Status** | **UNVALIDATED** — no test covers this route, and the audit half has never run on-chain (E-1). |

**Design note.** Charging for a denial is deliberate: the fee pays for a real on-chain verification either way, the same way a paid lookup API charges for a miss. It is stated in the response body itself (`paidButDenied: true`), which is the right way to do it. The honest counterpoint: a requester whose grant was silently revoked pays to be told so, and there is no free way to discover that in the same call — though UC-008 provides a free pre-flight check.

**Exception flow E1 — the denial is not observable.** If `logAccess` fails on this path, the `.catch` swallows it with no log, no metric, and no alert (OPS-002, OPS-003 **NOT IMPLEMENTED**). Denied attempts can therefore be lost silently, which weakens the audit-trail claim in the direction nobody checks.

**Exception flow E2 — malformed-but-58-character address (SEC-010, SEC-011 NOT IMPLEMENTED, finding R-3).** zod validates length only. `algosdk.decodeAddress` then throws inside `grantBoxName`, `app.onError` returns `err.message` verbatim, and the caller receives **HTTP 500** with `{"error":"wrong checksum for address"}`. Two defects: a client input error reported as a server error, and internal exception text disclosed to unauthenticated callers. Reproduced by the reviewer against `GET /v1/consent/status`; the same schema pattern applies here. **RECOMMENDED:** `.refine(algosdk.isValidAddress)` on all four address fields, plus a generic 500 body with detail logged server-side only.

**Requirements:** FR-011, FR-038, SEC-010, SEC-011.

---

## UC-008 — Anyone looks up consent status, free

| Field | Content |
|---|---|
| **Actor** | Any party — P-1, P-2, P-3, P-5. No authentication, no payment. |
| **Precondition** | `medrail-api` is running with a resolvable `CONSENT_APP_ID` and a loaded `OPERATOR_MNEMONIC`. **The free, unauthenticated endpoint has a hard dependency on the operator private key**, because `simulate()` needs a sender and a signer (`api/src/services/algorand.ts:8-14`). |
| **Action** | `GET /v1/consent/status?patient=<58>&requester=<58>&scope=<≥1 char>` |
| **System Behaviour** | zod validates the query (`api/src/routes/consent.ts:6-10`). `checkAccess` performs two outbound algod calls per request — `getTransactionParams()` then `atc.simulate()`. The contract returns `true` only when the grant box exists **and** `status == STATUS_GRANTED` **and** (`expires_at == 0` or `Global.latest_timestamp < expires_at`) (`contract.py:197-209`). Nothing is submitted; no fee is paid. |
| **Expected Outcome** | HTTP **200**, `{patient, requester, scope, granted}`. |
| **Postcondition** | No state changed on-chain or off. |
| **Evidence** | `api/src/routes/consent.ts:19-31`; `api/src/services/algorand.ts:82-100`; consumed by `web/lib/api.ts` and `web/components/ConsentChecker.tsx:44-48`. Live behaviour confirmed by the `exercise_contract.py` run: `check_access` returned `True` after the grant and `False` after the revoke. |
| **Status** | **IMPLEMENTED** — FR-013 has **no automated test**. Reviewer observed one cold call at **505 ms** (two sequential algod round-trips). That is a **single observation on a developer laptop, not a benchmark**; no p50/p95/p99, load test, or latency budget exists anywhere in this repository (PERF-002, PERF-003 **NOT IMPLEMENTED**). |

**Abuse flow A1 — resource exhaustion and third-party amplification (SEC-013 NOT IMPLEMENTED).** Free, unauthenticated, two outbound algod calls per request, no rate limit anywhere in the codebase. Usable both to exhaust `medrail-api` and to amplify traffic at AlgoNode.

**Requirements:** FR-013, SEC-009, SEC-013, PERF-002.

---

## UC-009 — Third party fetches the ARC-56 application spec

| Field | Content |
|---|---|
| **Actor** | P-1 or P-3 — an integrator who wants to call `MedRailConsent` directly without cloning this repository |
| **Precondition** | The contract has been compiled and `contracts/artifacts/MedRailConsent.arc56.json` is present at the path resolved from `__dirname/../../contracts/artifacts` (`api/src/app.ts:64`). |
| **Action** | `GET /v1/consent/arc56` |
| **System Behaviour** | Resolves the path, checks existence, reads and parses the file, returns it as JSON. Free, unauthenticated, no chain call. |
| **Expected Outcome** | HTTP **200** with the full ARC-56 spec: 13 ABI methods, global schema of 4 uints + 1 byteslice, and the box definitions. With `GET /v1/consent/app-info` supplying the App ID and CAIP-2 network, an integrator has everything needed to construct their own ABI calls. |
| **Postcondition** | None. |
| **Evidence** | `api/src/app.ts:63-69`; `api/src/routes/consent.ts:33-40`; `contracts/artifacts/MedRailConsent.arc56.json`. `api/Dockerfile` does copy this artefact into the image at `/app/contracts/artifacts/`, matching the runtime resolution. |
| **Status** | **IMPLEMENTED** — no automated test (FR-015). |

**Exception flow E1.** If the spec is absent, HTTP **404** with `{"error":"ARC-56 spec not found — has the contract been compiled?"}` (`app.ts:65-67`) — a correctly-classified, actionable error, in contrast to R-3.

**Design note.** Publishing the ABI over HTTP turns the contract into a public integration surface rather than an internal dependency of this backend. It is a small thing and one of the better decisions in the codebase. Note the counterpoint: `api/src/services/algorand.ts:20-46` deliberately does **not** parse this file, hand-constructing `ABIMethod` literals instead to avoid algosdk ARC-56-vs-ARC-4 parsing drift (`:16-19`). The spec is published for others but not consumed internally — defensible, and a divergence risk worth noting.

**Requirements:** FR-014, FR-015.

---

## UC-010 — Operator rotates the contract admin key

| Field | Content |
|---|---|
| **Actor** | P-4 — MedRail operator, holding the current admin key |
| **Precondition** | Caller's address equals `admin` in global state (set to `Txn.sender` at `create`, `contract.py:118-121`). |
| **Action** | Submit `set_admin(new_admin: Account)`. |
| **System Behaviour** | `assert Txn.sender == self.admin.value, "only admin"`, then `self.admin.value = new_admin` (`contract.py:123-127`). No redeployment; no box or audit state touched. |
| **Expected Outcome** | Global `admin` now names the new address. `log_access` and `withdraw_excess` immediately accept only that address. |
| **Postcondition** | The previous key has no privileged capability. All existing grants and audit entries are unaffected. |
| **Evidence** | `contract.py:123-127`; `test_consent.py::test_set_admin_only_admin` covers both the success and the non-admin rejection. |
| **Status** | **VALIDATED at the contract layer.** **NOT IMPLEMENTED operationally:** there is no rotation runbook, no rotation policy, no key ceremony, and no procedure for updating `OPERATOR_MNEMONIC` in the running service without downtime. OPS-007 records that the operator mnemonic is the only irreplaceable local secret and that no backup or rotation procedure is documented. |

**Security context — the authority being rotated.** The admin key can (a) write arbitrary audit entries about any patient via `log_access`, (b) rotate `set_admin` to lock out the real owner, and (c) drain the app account via `withdraw_excess` (`contract.py:254-259`, an inner `itxn.Payment(fee=0)` to the admin). Today it is a **single hot mnemonic in an environment variable** — no multisig, no HSM, no rotation policy. Acknowledged in [`../SECURITY.md`](../SECURITY.md), and **SEC-012 remains NOT IMPLEMENTED**. Note also that `withdraw_excess`'s *successful* path is untested; only the non-admin rejection is covered (**FR-031 PARTIALLY IMPLEMENTED**).

**Requirements:** FR-029, FR-031, SEC-002, SEC-012, OPS-007.

---

## UC-011 — [ABUSE] Paying stranger impersonates an authorised requester

> ### Status: **NOT MITIGATED**
> This is finding **S-1**, the most serious defect in the system. **SEC-006 PARTIALLY IMPLEMENTED — DEFEATED BY S-1. SEC-007, SEC-008, FR-039 NOT IMPLEMENTED.**

| Field | Content |
|---|---|
| **Actor** | Any party willing to pay $0.05. No relationship with the patient. No credential of any kind. |
| **Precondition** | At least one `grant_access` transaction exists on App `768743428`. Grants are public by design: the patient is the transaction `sender` and the requester is ABI argument 0, both readable from any Algorand indexer without permission. The attacker holds ≥ 50000 base units of USDC. |
| **Action** | 1. Enumerate `(patient, requester)` pairs from the application's own public transaction history. 2. `POST /v1/records/summary` with an ordinary, valid $0.05 payment and body `{"patientId": "<victim>", "requesterAddress": "<the authorised third party>"}`. |
| **System Behaviour** | The middleware verifies that **a** payment settled. It does not tell the handler **who** paid, and the handler never asks. `requesterAddress` is taken directly from the request body — `z.string().length(58)` and nothing more (`api/src/routes/records.ts:5-8`) — and passed straight into `checkAccess(patientId, requesterAddress, SCOPE)` (`:32`). `check_access` correctly returns `true`, because that grant genuinely exists. The handler then writes an audit entry naming the **claimed** requester (`:49`). |
| **Expected Outcome (attacker's view)** | HTTP **200** with the record summary. Indistinguishable from a legitimate call. |
| **Postcondition** | 1. An unauthorised party has obtained the gated resource. 2. **A false attribution is written into the immutable, per-patient audit trail** — recording an access by a party that did not make it, in a log whose whole value proposition is that it cannot be rewritten. This is arguably worse than having no audit trail, because the record is trusted *precisely because* it is on-chain. |
| **Evidence** | `api/src/routes/records.ts:5-8` (the schema), `:32` (the check against a self-asserted identity), `:49` (the audit write using it). No test covers this route. |
| **Status** | **NOT MITIGATED** |

**Why it does not show up in the demo.** (a) The response is a fixed synthetic constant, so nothing sensitive leaks in this build. (b) `web/components/LiveDemoPanel.tsx:38` sends `requesterAddress: wallet.address`, so payer and requester coincide and the flaw never manifests. Neither of these is a control. With real PHI behind this endpoint, **the consent layer would provide no protection whatsoever.**

**Related, lower severity.** `patientId` is equally self-asserted, but it only selects which grant is evaluated, so it is not independently exploitable.

**Concrete mitigation — all APIs verified present in the installed SDK. RECOMMENDED, not implemented.**

1. `@x402/core/http` exports `decodePaymentSignatureHeader`; `@x402/avm` exports `getSenderFromTransaction`. In `routes/records.ts`, decode the `PAYMENT-SIGNATURE` header, recover the payer address from the signed payment transaction, and return **403** unless `payer === requesterAddress`.
2. Alternatively, use `x402HTTPResourceServer`'s `ProtectedRequestHook` — `.onProtectedRequest(...)`, exported from `@x402/hono` — to stash the verified payer on the Hono context.

Either approach is roughly a 10–15 line change plus a test, and is the highest value-per-line fix available before submission. Until it lands, no document in this repository may describe the consent gate as an access control without stating S-1 in the same place.

**Requirements:** FR-039, SEC-006, SEC-007, SEC-008.

---

## UC-012 — Application account is funded for box MBR

| Field | Content |
|---|---|
| **Actor** | P-4 — operator (at deploy time), or any party thereafter |
| **Precondition** | For the deploy path: `DEPLOYER_ADDRESS` / `DEPLOYER_MNEMONIC` in `contracts/.env`, funded with TestNet ALGO from `https://lora.algokit.io/testnet/fund`. For the top-up path: any account with ALGO. |
| **Action** | **Deploy path:** run `contracts/scripts/deploy_testnet.py`. **Top-up path:** call `fund_mbr(payment)` with a payment transaction in the same group. |
| **System Behaviour** | *Deploy path:* the script is idempotent — it detects an existing application and neither re-creates nor re-funds it, preserving the original `fund_txid` across re-runs, and funding only on `operation_performed == Create` (`deploy_testnet.py:99-137`). *Top-up path:* `fund_mbr` asserts `payment.receiver == Global.current_application_address` and is callable by anyone (`contract.py:129-138`). Boxes are owned by the application account, not by callers, so the app must carry its own MBR — which is what lets any `(patient, requester, scope)` triple exist without either party opting in. |
| **Expected Outcome** | The application account holds enough ALGO to create the grant and audit boxes it needs. |
| **Postcondition** | Verified on-chain for App `768743428`: balance **5,000,000 µALGO**, min-balance **145,000 µALGO**, `total-boxes = 2`, `total-box-bytes = 100`. |
| **Evidence** | `contracts/scripts/deploy_testnet.py:99-137`; funding tx `KYH3H5CG2CCUPUUTJIBX47WD4RWSUV3QWTEUJQRQFYLWO5YAO3QA` round **66088626**; `contract.py:129-138` |
| **Status** | **PARTIALLY IMPLEMENTED** — FR-030 has **no test**; FR-100 is **IMPLEMENTED**; REL-006 is **PARTIALLY IMPLEMENTED** (funded once, no monitoring, no alerting, and the advertised per-box cost is wrong). |

**Defect C-2 — the advertised per-box MBR is 400 µALGO too low.** `contract.py:52` computes `GRANT_BOX_MBR = 2_500 + 400 * (32 + 17)` = **22,100** µALGO. The Algorand formula is `2500 + 400 * (len(key) + len(value))`, and the *effective* key includes the BoxMap's one-byte `key_prefix="g"`, so the real key length is 33, not 32 ⇒ true cost **22,500** µALGO. **Confirmed on-chain:** 145,000 − 100,000 (base account MBR) = 45,000 = 2 × 22,500. The public ABI method `get_grant_box_mbr()` — advertised at `contract.py:249-252` as "a compile-time constant the backend can quote when sizing `fund_mbr` calls" — therefore returns a figure that under-funds by ~1.8% per box. Severity LOW; fix is `400 * (33 + 17)`. **FR-032 IMPLEMENTED (incorrect value).**

**Correctly handled, and worth crediting.** The contract deliberately does *not* hard-code the audit-box cost, because `AuditEntry` is variable-length (comment at `contract.py:53-55`). That is right, and it is not a defect.

**Exception flow E1 — no headroom monitoring.** Nothing tracks operator-account ALGO or app-account MBR headroom. Exhaustion of either surfaces as UC-006 E1: an HTTP 500 after a settled payment. OPS-005 **NOT IMPLEMENTED**.

**Requirements:** FR-030, FR-032, FR-100, REL-006, OPS-005.

---

## Traceability matrix

| Requirement | Use cases | Status |
|---|---|---|
| FR-001, FR-002 | UC-001 | **VALIDATED** |
| FR-003 | UC-002, UC-003 | **VALIDATED** |
| FR-004, FR-005, FR-006 | UC-002 | **VALIDATED** |
| FR-007, FR-008 | UC-003 | **VALIDATED** |
| FR-009 | UC-002, UC-003 | **VALIDATED** |
| FR-010, FR-012 | UC-006 | **UNVALIDATED** |
| FR-011 | UC-007 | **UNVALIDATED** |
| FR-013 | UC-008 | **IMPLEMENTED** |
| FR-014, FR-015 | UC-009 | **IMPLEMENTED** |
| FR-016, FR-017 | UC-001 (discovery) | **VALIDATED** / **IMPLEMENTED** |
| FR-018, FR-019, FR-022 | UC-004 | **VALIDATED** |
| FR-020, FR-021 | UC-005 | **VALIDATED** |
| FR-023 | UC-006, UC-008 | **VALIDATED** |
| FR-024 | UC-004 (related) | **PARTIALLY IMPLEMENTED** (C-1) |
| FR-025, FR-027, FR-028 | UC-006 | **UNVALIDATED on-chain** |
| FR-026 | UC-006 | **VALIDATED** |
| FR-029, FR-031 | UC-010 | **VALIDATED** / **PARTIALLY IMPLEMENTED** |
| FR-030, FR-032 | UC-012 | **IMPLEMENTED** / **IMPLEMENTED (incorrect value)** |
| FR-033…FR-037 | UC-002 (browser), UC-004, UC-005, UC-008 | **IMPLEMENTED**, no frontend tests exist |
| FR-038 | UC-001 A2, UC-007 E2 | **PARTIALLY IMPLEMENTED** |
| **FR-039** | **UC-011** | **NOT IMPLEMENTED** |
| FR-040 | UC-002 | **IMPLEMENTED** |
| **FR-100** *(new)* | UC-012 | **IMPLEMENTED** |
| **FR-101** *(new)* | UC-001, UC-002, UC-003, UC-006 | **IMPLEMENTED** |
| SEC-001, SEC-002 | UC-006, UC-010 | **VALIDATED** |
| SEC-003 | UC-004, UC-005 | **VALIDATED** |
| SEC-004 | UC-006 | **IMPLEMENTED** |
| SEC-006 | UC-006, **UC-011** | **DEFEATED BY S-1** |
| SEC-007, SEC-008 | **UC-011** | **NOT IMPLEMENTED** |
| SEC-009 | UC-006, UC-008 | **IMPLEMENTED** |
| SEC-010, SEC-011 | UC-007 E2 | **NOT IMPLEMENTED** |
| SEC-012 | UC-010 | **NOT IMPLEMENTED** |
| SEC-013 | UC-008 A1 | **NOT IMPLEMENTED** |
| REL-001 | UC-001 A1 | **NOT IMPLEMENTED** |
| REL-002 | UC-006 E1 | **NOT IMPLEMENTED** |
| REL-003 | UC-006 E2 | **NOT IMPLEMENTED** |
| REL-004 | UC-006 E3 | **PARTIALLY IMPLEMENTED** |
| REL-005 | UC-001 A1 | **VALIDATED** |
| REL-006 | UC-012 | **PARTIALLY IMPLEMENTED** |
| PERF-001 | UC-001 | **IMPLEMENTED** |
| PERF-002, PERF-003, PERF-004 | UC-006, UC-008 | **NOT IMPLEMENTED** |
| AI-001…AI-004 | UC-002, UC-003 | **VALIDATED** / **IMPLEMENTED** |
| AI-005, AI-006 | UC-003 E1 | **NOT IMPLEMENTED** |
| AI-007 | UC-006 | **IMPLEMENTED** |
| DATA-001…DATA-005 | UC-004, UC-006, UC-003 | **VALIDATED** / **IMPLEMENTED** |
| DATA-006 | — | **PLANNED** |

---

## Use cases deliberately **not** specified

Because no code supports them. Listing them prevents a reader from assuming an omission is an oversight.

| Would-be use case | Why absent |
|---|---|
| Patient reads their own audit trail | `get_audit_count` / `get_audit_entry` exist on-chain (FR-028 **VALIDATED**) and `getAuditCount` exists in the backend, but **no HTTP endpoint and no UI expose either**, and `total_audit_entries == 0`. |
| Patient enumerates all their standing grants | No enumeration method exists on the contract and no aggregate view exists anywhere. |
| Requester discovers available scopes | `SCOPE` is hard-coded to `"records:summary"` (`records.ts:10`). The contract accepts free-form strings (DATA-003) but nothing publishes a vocabulary. |
| MedRail pays another x402 endpoint (Orchestrator entry type) | Not built and explicitly not claimed ([`../COMPLIANCE.md`](../COMPLIANCE.md)). |
| Real record retrieval, storage, or encryption | No datastore exists. DATA-006 **PLANNED**. |
| Anything from `docs/SENTINEL_ARCHITECTURE.md` | An unbuilt proposal for a **different product**. No `engine/`, `sim/`, SQLite, forecasting model, second contract, or additional frontend routes exist. |

---

## Related documents

[`./Problem_Statement.md`](./Problem_Statement.md) · [`./Project_Vision.md`](./Project_Vision.md) · [`./User_Personas.md`](./User_Personas.md) · [`./User_Journey.md`](./User_Journey.md) · [`./Scope.md`](./Scope.md) · [`./USP_Novelty.md`](./USP_Novelty.md) · [`../API.md`](../API.md) · [`../SECURITY.md`](../SECURITY.md) · [`../PROOF.md`](../PROOF.md)
