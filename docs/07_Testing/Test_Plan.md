# MedRail — Test Plan

**Purpose:** state, level by level, what testing exists today, what each level must cover, how it would be built, and what it costs — with the CI execution plan and the defects that remain in it.

**Status of this document:** **IMPLEMENTED** as a description of the plan in force on 2026-08-21 against commit `3b387df` (branch `main`). Every "what exists today" row was verified by reading the repository and executing the suites. Every "what it should cover" row is **RECOMMENDED** and describes nothing that exists.

**Cross-references:** [`Test_Strategy.md`](Test_Strategy.md), [`Test_Cases.md`](Test_Cases.md), [`Test_Results.md`](Test_Results.md), [`Performance_Validation.md`](Performance_Validation.md), [`../02_Requirements/Requirements_Traceability_Matrix.md`](../02_Requirements/Requirements_Traceability_Matrix.md), [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md).

---

## 1. Scope

### 1.1 In scope

| Component | Path | Test status |
|---|---|---|
| `MedRailConsent` smart contract | `contracts/smart_contracts/consent/contract.py` (266 lines, 13 ABI methods) | **17** unit tests, AVM simulator |
| Box-key derivation, all three languages | `contract.py`, `api/src/services/algorand.ts`, `web/lib/consent.ts` | **25** golden-vector tests over one shared fixture (11 Python + 14 TypeScript) |
| Triage rule engine | `api/src/services/triageScorer.ts` (11 red-flag groups) | 7 unit tests |
| Interaction rule engine | `api/src/services/interactionChecker.ts` (14 pairs) | 6 unit tests |
| x402 payment gate | `api/src/x402.ts`, `api/src/app.ts` | 5 component tests (non-hermetic) |
| Payer-identity recovery | `api/src/x402Payer.ts` | **6** unit tests, hermetic |
| Service index, address validation, rate limiting | `api/src/app.ts`, `api/src/validation.ts`, `api/src/rateLimit.ts` | **7** component tests, hermetic |
| Consent-gated records route | `api/src/routes/records.ts` | **zero route-level tests** — its two guards are tested individually, their composition is not |
| Chain integration | `api/src/services/algorand.ts` | **no dedicated test file** (**G-05**); its key derivations are pinned indirectly by the golden-vector fixture |
| Consent status/app-info routes | `api/src/routes/consent.ts` | validation and rate limiting covered via `app.spec.ts`; the handlers themselves untested |
| Frontend | `web/` (1 route, 5 components, 5 lib modules) | **zero tests, no test runner installed** |
| Deployment artefacts | `api/Dockerfile`, `web/Dockerfile`, `api/fly.toml`, `.dockerignore` | **never built by CI** (NFR-007 **UNVALIDATED**) |

### 1.2 Out of scope (and why)

| Excluded | Reason |
|---|---|
| Database testing | **There is no database.** No Postgres, MongoDB, Redis, queue, cache, or ORM exists. State lives in Algorand box storage and two static constants. |
| Model evaluation (accuracy/precision/recall/AUC) | **There is no ML model, no LLM, no embeddings, no vector store.** The "AI" endpoints are deterministic rule engines. AI-005 records that no labelled dataset or evaluation harness exists, and none is claimed. |
| MainNet verification | `MedRailConsent` is not deployed on MainNet. |
| Compliance certification testing | No HIPAA/GDPR/SOC 2 work has been performed and none is claimed. There is no real PHI in the system. |
| Multi-tenant / account isolation | There are no accounts. All endpoints are unauthenticated by design (x402 pays instead of authenticating). |

---

## 2. Objectives

| # | Objective | Met today? |
|---|---|---|
| O1 | Prove the consent state machine behaves correctly for grant, revoke, expiry, re-grant and authorisation | **Met** (17/17, simulator) |
| O2 | Prove the rule engines are deterministic and carry their safety disclaimers | **Met** (13/13) — but see O12 |
| O3 | Prove a priced route returns a real, correctly-priced x402 challenge | **Met** (5/5, still non-hermetic) |
| O4 | Prove a real payment settles and the resource is delivered | **Met by live procedure only** — two settled payments, `OYRQRKYA…` on `/v1/triage` and `5DKFUULW…` on `/v1/records/summary`. Not in CI. |
| O5 | Prove the consent gate actually restricts access | **Met.** The payer is recovered from the verified `PAYMENT-SIGNATURE` and must equal `requesterAddress`; 6 unit tests plus a live attack-and-control run against TestNet (**G-01** closed) |
| O6 | Prove a settled payment is never consumed without delivery | **Met by the SDK, not by MedRail.** `@x402/hono` calls `processSettlement` only when the handler returns a status below 400, and cancels on any throw or 4xx/5xx — settlement is structurally unreachable on an error response. REL-002 is **VALIDATED** and the risk it named does not exist |
| O7 | Prove the on-chain audit trail works on real infrastructure | **Met.** `total_audit_entries = 5` on app `768743428`; the first append is tx `4YLKLQKK…` (**E-1** closed) |
| O8 | Prove the three box-key derivations agree | **Met.** One shared golden-vector fixture asserted from both runtimes across Python, `node:crypto` and WebCrypto (**G-08**, NFR-011) |
| O9 | Establish a latency/throughput baseline | **NOT MET** — PERF-002, PERF-003, **G-24** |
| O10 | Gate every change on an automated pipeline | **Met.** CI triggers on `push` to `[main, master]`, on `pull_request` and on `workflow_dispatch`, with caching, `npm audit --audit-level=high` on both Node packages, and an artifact-freshness gate (**G-06 / CI-1** closed) |
| O11 | Prove the composition of payment, consent check and audit write | **NOT MET.** Each part is tested in isolation; `api/src/routes/records.ts` still has no route-level test (TC-100…TC-105) |
| O12 | Prove the rule engines do not fabricate warnings from short input | **NOT MET.** `checkInteractions(["a","b"])` returns five spurious severe-interaction matches and `scoreTriage("I have no chest pain")` bands as `urgent`. Both are disclosed, neither is pinned (**G-21**, **G-26**) |

---

## 3. Level-by-level plan

### 3.1 Unit testing

| | |
|---|---|
| **Exists today** | **IMPLEMENTED.** 61 unit tests: 17 contract (`contracts/tests/test_consent.py`), 11 Python + 14 TypeScript box-key parity (`contracts/tests/test_box_keys.py`, `api/test/boxKeyParity.spec.ts`), 7 triage, 6 interaction, 6 payer-identity (`api/test/x402Payer.spec.ts`). |
| **Tooling** | `pytest` + `algorand-python-testing` 1.1.0 (contract); `vitest` 4.1.10 (TypeScript). No `vitest.config.ts` exists — defaults are used. |
| **Measured** | 28 passed / 0.44 s across the two Python files; the TypeScript unit tests are part of the 45 passed / 9.99 s API run. |
| **Landed since the first edition** | The `request_access` event payload (catches **C-1 / G-12**), `get_grant_box_mbr` against the real MBR formula (catches **C-2 / G-20**), and the three box-key derivations as golden vectors (**G-08 / NFR-011**) — the last of these asserted from *both* runtimes against one fixture file, so drift fails a build rather than a demo. Each of the first two was confirmed to fail against the pre-fix source. |
| **Should still cover** | `fund_mbr`, both paths (untested, FR-030, **G-25**); the *successful* `withdraw_excess` path (only the negative case exists, FR-031, **G-25**); the `audit_log` box key, the one derivation the fixture does not carry (TC-124); expiry boundary equality (`latest_timestamp == expires_at`); short-name interaction false positives (**G-21**) and negation handling (**G-26**); zod boundary values (1/2000 chars, 2/20/21 medications). |
| **Tooling recommendation** | Keep both runners. Add `vitest --coverage` with `@vitest/coverage-v8` and `pytest-cov`; publish both as CI artefacts. Extend the existing `box-key-vectors.json` with an `expectedAuditLogBoxKeyHex` field rather than adding a second fixture — one shared source of truth is the property that makes the group work. |
| **Effort** | ~0.5 developer-day for the remainder. |
| **Requirements** | FR-004…FR-009, FR-018…FR-032, FR-039, SEC-001…SEC-003, SEC-007, DATA-001, DATA-002, DATA-005, AI-001…AI-004, NFR-009, NFR-011 |

### 3.2 Integration testing

| | |
|---|---|
| **Exists today** | **NOT IMPLEMENTED.** Zero integration tests. Nothing exercises `api/src/routes/records.ts`, `api/src/routes/consent.ts`'s handlers, or `api/src/services/algorand.ts` directly (**G-05**). |
| **Should cover** | `records.ts` happy path, denied path (`charged: false`), and the audit-write-failure path — which now degrades to `200` with `auditStatus: "pending"` rather than throwing, and is unguarded by any test (TC-103, TC-134); `checkAccess`/`getAuditCount` against deployed app `768743428`; `logAccess` writing a real entry on demand (TC-143 — the *evidence* exists, the runner-invoked test does not); `withPatientLock` concurrency — asserting that **N concurrent writes for one patient all succeed**, and that bypassing the lock reproduces a rejected transaction (**not** that sequence numbers are unique: the contract self-assigns those and guarantees uniqueness with or without the lock, so that assertion would pass for the wrong reason — see [`Test_Cases.md`](Test_Cases.md) §C.4); operator-key-absent behaviour; algod failure behaviour (REL-003); facilitator-unreachable behaviour, now a 503 (**REL-001**, TC-170). |
| **Tooling recommendation** | `vitest` with two projects: `integration-mocked` (module-mock `../services/algorand.js` so route logic is testable with no network — this is where TC-100…TC-105 and TC-113 belong) and `integration-live` (a real `OPERATOR_MNEMONIC` against TestNet, opt-in via env, excluded from the default CI run). Add `nock` or `msw` to stub the facilitator's `/supported`. The payment fixture the mocked project needs already has a working reference implementation: `api/test/x402Payer.spec.ts` builds real signed transactions inside real x402 v2 payloads with no network. |
| **Effort** | ~2 developer-days, of which the mocked route suite is ~0.5 day and delivers most of the value. |
| **Requirements** | FR-010, FR-011, FR-012, FR-013, FR-025, NFR-004, REL-001, REL-003, REL-004, SEC-006, SEC-008 |
| **Blocking note** | This is still the single highest-value tier in the plan, but for a different reason than before. It no longer contains an open Critical finding — payer binding is closed at the unit tier and proven live. What it contains now is **composition risk**: the two guards on the flagship route are each correct in isolation, and nothing asserts that they are wired in the right order, that the denial branch behaves, or that the degradation path degrades. |

### 3.3 System testing

| | |
|---|---|
| **Exists today** | **PARTIALLY IMPLEMENTED** — as four live scripts, not as tests. `contracts/scripts/exercise_contract.py` runs a real request→grant→check→revoke→check cycle on TestNet with two freshly-generated throwaway accounts, asserting both `check_access` results in-script. `api/scripts/e2e-proof.ts` runs a real 402→sign→settle→200 against `/v1/triage`. `api/scripts/e2e-consent-proof.ts` runs the full consent-gated composition — grant on-chain, free status check, paid call, on-chain audit append — and aborts before paying if the grant did not take effect. `api/scripts/verify-g01-fix.ts` performs the G-01 impersonation attempt against the live deployment plus a legitimate control call, and **exits non-zero** unless the attack is blocked *and* the control succeeds. |
| **Status** | **VALIDATED but not automated / not in CI.** None runs on a schedule or under a test runner. Two of the four now carry a real pass/fail contract; `verify-g01-fix.ts` is a test in everything but its runner. |
| **Landed since the first edition** | The system path that had never been run — a paid `/v1/records/summary` against a real grant, producing a real `auditTxId` and `auditSequence`. It has now run: settled payment `5DKFUULW…`, audit append `4YLKLQKK…`, `auditSequence: "1"`, and `total_audit_entries` on the deployed app moved 0 → 5. **E-1 closed.** |
| **Should still cover** | The same paths under a runner rather than by hand (TC-143, TC-201), on a nightly schedule; and the real-network failure modes that remain untried — app-account MBR exhaustion, operator ALGO exhaustion, box-reference rejection under concurrency. |
| **Tooling recommendation** | Wrap all four scripts as `vitest` integration specs with real assertions, gated on `RUN_LIVE=1`; run them nightly rather than per-commit so a facilitator or AlgoNode blip does not block merges. `verify-g01-fix.ts` is the easiest conversion — its verdict logic is already written. |
| **Effort** | ~0.5 day to convert all four. |
| **Requirements** | FR-003, FR-010, FR-012, FR-018, FR-020, FR-023, FR-025, FR-040, SEC-007, SEC-008 |

### 3.4 API testing

| | |
|---|---|
| **Exists today** | **PARTIALLY IMPLEMENTED — 12 tests across two files.** `api/test/x402-flow.spec.ts` (5, non-hermetic) drives the payment path: `/v1/health` free and 200; `/v1/triage` unpaid → 402 with decoded `accepts[0].scheme === "exact"`, `amount === "20000"`, `network` matching `/^algorand:/`; `/v1/interaction-check` → 402; `/v1/records/summary` → 402 with `amount === "50000"`; and one test documenting that middleware ordering makes a malformed unpaid request surface as 402 rather than 400. `api/test/app.spec.ts` (7, hermetic) covers the free surface: the service index advertising **exactly** the mounted route set (FR-017 — set equality, so neither an omission nor a phantom can slip through), the ARC-56 and App-ID pointers an integrator needs, checksum and length rejection on address inputs (SEC-010), the absence of internal exception text in any response body (SEC-011), a `429` with `Retry-After` once a free-route window is exhausted (SEC-013), and a guard that the health probe is **not** throttled. |
| **Not covered** | The *handlers* behind `GET /v1/consent/status` (FR-013), `GET /v1/consent/app-info` (FR-014) and `GET /v1/consent/arc56` (FR-015) — their input validation and rate limiting are tested, their chain-reading behaviour is not; every non-402 response of every priced route; the 503 facilitator-outage path (REL-001, TC-170). |
| **Tooling recommendation** | Same `vitest` + `app.request()` pattern — it is the right one and requires no server, and `app.spec.ts` demonstrates it can be fully hermetic. Add a facilitator stub so `x402-flow.spec.ts` can join it offline. Generate `../05_API/OpenAPI.yaml` from the implementation and add a schema-conformance assertion per route so drift between the spec and the handler becomes a test failure. |
| **Effort** | ~0.5 day. |
| **Requirements** | FR-001, FR-002, FR-013…FR-017, FR-038, SEC-010, SEC-011, SEC-013 |

### 3.5 End-to-end testing

| | |
|---|---|
| **Exists today** | **NOT IMPLEMENTED.** No automated E2E test exists in any form. The only end-to-end evidence is manual: `api/scripts/e2e-proof.ts` (headless, API-level) and the browser demo captured in `docs/PROOF.md`. |
| **Should cover** | Browser opens `/`; demo wallet is generated and its address displayed; a paid call to `/v1/triage` completes and the settled transaction id is rendered; a consent grant is signed client-side and `GET /v1/consent/status` subsequently reports `granted: true`; a revoke flips it back to `false`; a paid `/v1/records/summary` for a granted pair returns the summary and an `auditTxId`. |
| **Tooling recommendation** | Playwright, against a locally-running API (`npm run dev` in `api/`) and `next dev` in `web/`, targeting TestNet. Nightly, not per-commit — the flow spends real TestNet USDC and depends on two third parties. |
| **Effort** | ~1 developer-day for the first path, ~2 days for the full set. |
| **Requirements** | FR-033…FR-037, FR-001…FR-003, FR-010 |

### 3.6 UI / component testing

| | |
|---|---|
| **Exists today** | **NOT IMPLEMENTED.** No Vitest, Jest, Playwright or Cypress configuration exists anywhere under `web/`. `web/package.json` declares no test script and no test runner. |
| **Should cover** | `PricingTable` rows matching the prices actually configured in `api/src/app.ts` (a drift test); `NetworkBadge` health-poll states (loading / ok / unreachable); `DemoWalletCard` generate-and-clear against `sessionStorage`; `ConsentChecker` grant → check → revoke against a mocked algod; and `LiveDemoPanel` sending `requesterAddress: wallet.address` — which used to be a coincidence that masked G-01 in the demo and is now a hard requirement, because the demo wallet signs the payment and any other value earns a 403. |
| **Tooling recommendation** | Vitest + `@testing-library/react` + `jsdom`. Add a `test` script to `web/package.json` and a `web` test step to CI. |
| **Effort** | ~1 developer-day. |
| **Requirements** | FR-033…FR-037 |

### 3.7 Regression testing

| | |
|---|---|
| **Exists today** | **IMPLEMENTED in substance, not as a separate artefact.** The full 73 tests re-run on every change in about ten seconds combined, which at this size is the correct design. **Six confirmed defects now have a permanent guard**, and each guard was run against the pre-fix code and observed to fail: **G-01** (TC-110), **G-12 / C-1** (TC-150), **G-20 / C-2** (TC-033, TC-153), **G-10 / SEC-010** (TC-172), **SEC-011** (TC-173), **G-34** (TC-036). Cross-language drift is guarded structurally by the shared fixture (TC-125). |
| **Gap** | Two known past regressions still leave no test behind: the CORS `allowHeaders` drift that broke every paid browser call (fix documented in a comment in `api/src/app.ts`), and the `algosdk` ARC-56/ARC-4 parsing drift that motivated hand-constructing `ABIMethod` literals (comment in `api/src/services/algorand.ts`). Nothing asserts either fix holds — in particular nothing checks the hand-written ABI literals still match `contracts/artifacts/MedRailConsent.arc56.json`. |
| **Should cover** | The remaining confirmed defects: **G-21** (TC-180, TC-185), **G-26** (TC-186), REL-004 (TC-130, TC-131), the audit-write degradation (TC-103), and the two comment-only fixes above (TC-196 plus an ABI-literal-vs-ARC-56 conformance test). |
| **Tooling recommendation** | Same runners; tag regression specs so they can be reported separately in CI output. Keep the discipline that produced the six: **write the test, run it against the unfixed code, watch it fail, then fix.** A test authored against already-fixed code documents behaviour rather than protecting it. |
| **Effort** | Folded into the levels above. |

### 3.8 Performance testing

| | |
|---|---|
| **Exists today** | **NOT IMPLEMENTED.** No load test, no benchmark, no profiling, no tooling in the repository. The only latency data in existence is two single observations recorded by the reviewer (505 ms cold `GET /v1/consent/status`; ~15 ms warm 402 generation). Those are single samples on a developer laptop, not a benchmark. |
| **Should cover** | Per-endpoint latency distribution under a defined concurrent workload; throughput ceiling; error rate under load; settlement success rate; algod call latency as a separate component; and specifically the per-patient audit-write ceiling imposed by `withPatientLock` + Algorand confirmation. |
| **Tooling recommendation** | k6 or autocannon for the HTTP tier; a purpose-built Node harness for the `logAccess` concurrency path, because the constraint there is chain confirmation and an in-process lock, not HTTP. |
| **Effort** | ~1 day to a first baseline; ~2–3 days to a repeatable, environment-controlled harness. |
| **Requirements** | PERF-001…PERF-004. **See [`Performance_Validation.md`](Performance_Validation.md) — it is a plan, not results.** |

### 3.9 Security testing

| | |
|---|---|
| **Exists today** | **PARTIALLY IMPLEMENTED, and no longer only on-chain.** On-chain: three negative authorisation tests pass — `test_set_admin_only_admin`, `test_log_access_rejects_non_admin`, `test_withdraw_excess_admin_only` (SEC-001…SEC-003). At the API tier: 6 payer-identity tests (SEC-007, FR-039), checksum validation (SEC-010), a no-internal-message-disclosure assertion (SEC-011), and rate limiting with an over-tightening guard (SEC-013). In CI: `npm audit --audit-level=high` on both Node packages, 0 vulnerabilities (SEC-014, partly). In the repository: `.dockerignore` at both build roots excluding `.env`, `**/.env` and `*.mnemonic` (SEC-015, unverified by any gate). |
| **The one that mattered most, and what it looks like now** | **TC-110** — pay as address A while asserting `requesterAddress = B` — used to return 200 with the record. It now returns **403**, and the mechanism is worth understanding rather than just recording: `api/src/x402Payer.ts` decodes the verified `PAYMENT-SIGNATURE`, reads the AVM `exact` payload's `paymentGroup`/`paymentIndex`, and recovers the address that signed the payment transaction. `records.ts` requires that address to equal `requesterAddress`. **The payment is the authentication** — the caller already proved possession of that key in order to pay, so no new credential, session or key exchange is needed. Six unit tests pin the recovery, including the sponsored multi-leg group layout that real settled payments use, and every malformed-input path returns `null` rather than throwing, so a decode failure becomes a 403 and not a 500. `api/scripts/verify-g01-fix.ts` executes the attack and a control against live TestNet. |
| **Must still cover** | Audit attribution ordering — assert `logAccess` is never called when the payer check fails (TC-113, SEC-008); the 503 facilitator path (TC-170); `pip-audit` for the Python toolchain; CodeQL for JS/TS and Python; `gitleaks` over the build context to verify SEC-015 rather than assume it; a property/fuzz harness over the zod schemas and the contract's string arguments; mutation testing, which is the technique that would surface the assertion-strength weakness recorded in [`Test_Results.md`](Test_Results.md) §3.4. |
| **Tooling recommendation** | Add `pip-audit` alongside the existing `npm audit` gates; CodeQL; Dependabot; `gitleaks`; a small property/fuzz harness. |
| **Effort** | ~1 day for the remaining API security tests; ~2 hours to wire the remaining scanners. |
| **Requirements** | SEC-001…SEC-016, FR-039 |

### 3.10 User acceptance testing

| | |
|---|---|
| **Exists today** | **NOT IMPLEMENTED** as a formal activity. In practice the acceptance criterion for this submission is a judge reproducing the flows described in `docs/JUDGES.md` and `docs/PROOF.md`. |
| **Should cover** | A scripted judge walkthrough with pass/fail per step: open the demo, generate a wallet, fund it from the TestNet dispenser, make a paid triage call and verify the transaction on `lora.algokit.io`, grant consent, observe `granted: true`, call the records endpoint, verify the audit transaction, revoke, observe `granted: false`. |
| **Caveat, now smaller** | Every step of that walkthrough has now been demonstrated at least once at the API tier: the audit-writing step by `e2e-consent-proof.ts` (audit tx `4YLKLQKK…`, `auditSequence: "1"`), so `auditTxId` is no longer an illustrative value. What has **not** been demonstrated is the same walkthrough *through the browser*, end to end, by someone other than the author. A UAT script must not assert a step that has never passed in the environment it targets. |
| **Blocking caveat** | **No public HTTPS endpoint exists.** A judge cannot run this walkthrough without cloning the repository and supplying their own funded TestNet account. That is the remaining blocker, and it is a hosting one, not a testing one — see [`../08_Deployment/GO_LIVE_RUNBOOK.md`](../08_Deployment/GO_LIVE_RUNBOOK.md). |
| **Tooling recommendation** | A checklist in `docs/11_Hackathon/`, plus a hosted public endpoint. |
| **Effort** | ~0.5 day to write. |

---

## 4. CI execution plan

### 4.1 Pipeline as configured

`.github/workflows/ci.yml` — 3 jobs, all `ubuntu-latest`, all independent (no `needs:`), so they run in parallel.

**Triggers:** `push` to `[main, master]`, every `pull_request`, and `workflow_dispatch`. The repository's branch is `main`; its remote is `https://github.com/Hydra-Of-Malice/Medrail`.

| Job | Steps | Verifies |
|---|---|---|
| `contract` | `checkout` → `setup-python@v5` (3.12, `cache: pip` keyed on `contracts/requirements-dev.txt`) → `pip install -r requirements-dev.txt` → `python -m puyapy smart_contracts/consent/contract.py --out-dir artifacts` **and copy the output into `contracts/artifacts/`** → `git diff --exit-code -- contracts/artifacts/` → `pytest tests/ -v` | Contract compiles under `puyapy==5.9.0`, **the committed ARC-56 spec matches a fresh compile**, and 28/28 unit tests pass |
| `api` | `checkout` → `setup-node@v4` (20, `cache: npm`) → `npm ci` → `npm audit --audit-level=high` → `npx tsc --noEmit` → `npm run build` → `npx vitest run` | No high-or-critical advisory, strict typecheck (NFR-005), build, 45/45 tests |
| `web` | `checkout` → `setup-node@v4` (20, `cache: npm`) → `npm ci` → `npm audit --audit-level=high` → `npx tsc --noEmit -p tsconfig.json` → `npm run build` with `NEXT_PUBLIC_API_BASE=http://localhost:4021`, `NEXT_PUBLIC_NETWORK=testnet` | No high-or-critical advisory, strict typecheck, Next.js production build |

**All three jobs pass when run locally** (see [`Test_Results.md`](Test_Results.md) §2, §3 and §4).

**The artifact-freshness gate is the interesting one.** The puya build is byte-reproducible, so recompiling `contract.py` and asserting `git diff --exit-code -- contracts/artifacts/` turns any divergence between the source and the ARC-56 spec that `deploy_testnet.py` actually consumes into a build failure instead of a silent mismatch. It also documents an awkwardness in the toolchain: `puyapy` resolves `--out-dir` relative to the *source file*, so the output lands in `contracts/smart_contracts/consent/artifacts/` and has to be copied to `contracts/artifacts/` where every consumer reads it. **G-28** — the documented compile command writing to the wrong directory, with an undocumented copy step — remains open as a documentation defect.

### 4.2 CI defects

| ID | Severity | Status | Defect | Detail |
|---|---|---|---|---|
| **CI-1** | HIGH | **CLOSED** | The workflow triggered on `push: branches: [main]` while the repository's only branch was `master`, so no push ever fired it. | Now `branches: [main, master]` plus `workflow_dispatch`, and the branch is `main`. Listing both names is deliberate: the failure mode was silent — a workflow that never runs is indistinguishable from one that runs and passes — so the trigger no longer depends on which name the default branch carries. **G-06 closed; OPS-006 has a gate that actually fires.** The guard that would *detect* a recurrence is TC-200 and is still absent. |
| **CI-2** | MEDIUM | **PARTIALLY MITIGATED** | The `api` job runs `npx vitest run`, and `api/test/x402-flow.spec.ts` requires a live HTTP call to `facilitator.goplausible.xyz` at app-module import time. | Root cause unchanged: `accepts[].asset` and `extra.feePayer` come from the facilitator's `/supported`, not from MedRail config, so a 402 cannot be built offline. Two things improved. **Blast radius:** 40 of the 45 API tests are now hermetic — the three new spec files were written to run offline by construction. **Legibility:** a facilitator outage at runtime is now a `503 PAYMENT_FACILITATOR_UNAVAILABLE` with `Retry-After`, not an opaque 500, so an outage reads as an outage. CI still reaches the network. **Fix: stub `/supported` with `msw`/`nock` for the default run and keep a live variant behind `RUN_LIVE=1` (TC-201).** |
| **CI-3** | MEDIUM | **PARTIALLY ADDRESSED** | No deployment stage, no coverage gate, no artefact publishing, no image build. | **Landed:** `npm audit --audit-level=high` on both Node jobs (0 vulnerabilities in each — **G-16, G-27** closed) and the artifact-freshness gate. **Still absent:** `pip-audit`, CodeQL, Dependabot, `gitleaks`; `vitest --coverage` and `pytest --cov` — which is why **no coverage percentage appears anywhere in this documentation set**; and any `docker build`, so NFR-007 stays **UNVALIDATED**. Note that the configuration defects an image job would once have caught are already fixed in `api/fly.toml` — what an image job proves now is that the images build and boot, not that the config is right. |
| **CI-4** | LOW | **CLOSED** | No dependency caching. | `cache: pip` keyed on `contracts/requirements-dev.txt`; `cache: npm` keyed on each package's `package-lock.json`. |

### 4.3 Recommended pipeline (**RECOMMENDED** — the security, image, live-integration, E2E and performance stages do not exist)

| Stage | Trigger | Jobs | Gate | Exists? |
|---|---|---|---|---|
| **PR / push to default branch** | every change | `contract` (compile + artifact-freshness + pytest), `api` (audit + typecheck + build + vitest), `web` (audit + typecheck + build) | all must pass | **Yes**, minus coverage and the hermetic-vitest split |
| **Coverage** | every change | `vitest --coverage`, `pytest --cov`, published as artefacts with a stored baseline | must not regress | **No** (TC-202) |
| **Security** | every change | `pip-audit`, CodeQL (JS/TS + Python), `gitleaks` on the build context | High/Critical blocks merge | **Partly** — `npm audit --audit-level=high` is in place on both Node jobs; the rest is absent (TC-204) |
| **Image** | every change | `docker build` for `api/` (context = repo root) and `web/`, then boot the API image and assert `GET /v1/health` returns 200 with the expected `network` and a non-null `consentAppId` | build + boot must pass | **No** (TC-203) — the only thing standing between NFR-007 and **VALIDATED** |
| **Live integration** | nightly | `RUN_LIVE=1` suite against TestNet app `768743428`, wrapping the four existing proof scripts | reported, non-blocking; alert on failure | **No** — the scripts exist and are run by hand (TC-143, TC-201) |
| **E2E** | nightly | Playwright browser flow | reported, non-blocking | **No** (TC-194) |
| **Performance** | weekly / on demand | k6 baseline against a fixed environment | reported against team-chosen thresholds once those exist | **No** (**G-24**) |

---

## 5. Test environment matrix

| Environment | Config source | Can exercise | Cannot exercise | Present state |
|---|---|---|---|---|
| **Local developer** (Windows 11, Node 20, Python 3.12, `contracts/.venv`) | `api/.env`, `contracts/.env`, `web/.env.local` — all untracked, all present on disk | Both unit suites; the full API with a real `OPERATOR_MNEMONIC`; both proof scripts; live TestNet reads *and* writes; the Next.js dev server; the browser demo wallet | Nothing structurally blocked | **The only environment in which the complete system has ever run.** All results in [`Test_Results.md`](Test_Results.md) were produced here. |
| **CI runner** (`ubuntu-latest`, GitHub Actions) | workflow `env:` only — no secrets configured | `puyapy` compile + artifact-freshness gate; 28 contract tests; API audit/typecheck/build/tests; web audit/typecheck/build | Any chain write (no operator key); `checkAccess`/`getAuditCount` (both call `getOperator()`, which throws without `OPERATOR_MNEMONIC`); any proof script; any Docker build | **Runs on every push to `main`, every PR, and on demand.** Definition correct, jobs pass locally |
| **Algorand TestNet** | `NETWORK=testnet`, App ID `768743428`, USDC ASA `10458941`, GoPlausible facilitator, AlgoNode algod/indexer | `request_access`, `grant_access`, `revoke_access`, `check_access`; **`log_access` — five entries appended**; real x402 settlement on **both** priced route types (`OYRQRKYA…` on `/v1/triage`, `5DKFUULW…` on `/v1/records/summary`); a live impersonation attempt, rejected | The C-1 and C-2 fixes — the deployed bytecode predates them, and redeploying under `OnUpdate.AppendApp` would mint a new App ID | Live, `deleted: false`, app account funded 5 ALGO, min-balance 550,400 µALGO, 12 boxes (6 `g`, 5 `a`, 1 `s`) |
| **MainNet** | `api/fly.toml` correctly targets `NETWORK = "testnet"`; MainNet requires an explicit override | **nothing** | Everything — `MedRailConsent` is not deployed on MainNet and no `deploy_mainnet.json` exists | **Pending.** No MainNet deployment exists. |
| **Container** (`api/Dockerfile`, `web/Dockerfile`) | Build context = repo root for `api/`; `.dockerignore` present at the repo root and in `web/`; both images install with `npm ci` | **nothing verified** | Never built by CI (NFR-007 **UNVALIDATED**, TC-203) | **Never built.** The configuration is correct on paper — `api/fly.toml` supplies `NETWORK`, `CONSENT_APP_ID = "768743428"`, a `/v1/health` check and `max_machines_running = 1` — and none of it has been executed once. |
| **Public HTTPS endpoint** | — | — | — | **Does not exist.** No public deployment, no Bazaar listing, no leaderboard presence — all pending user action per `docs/COMPLIANCE.md`. |

---

## 6. Roles, entry/exit, and reporting

| Item | Current state |
|---|---|
| Test ownership | Single developer; no separate QA function |
| Defect tracker | None — findings live in this documentation set and in `docs/` |
| Test management tool | None |
| Reporting | Console output of `pytest -q` and `vitest run`; no JUnit XML, no HTML report, no coverage artefact |
| Entry criteria | Compile + artifact-freshness + typecheck + build + dependency audit (see [`Test_Strategy.md`](Test_Strategy.md) §7.1) |
| Exit criteria | 73/73 green, both builds, both `npm audit` gates clean, committed artifacts matching a fresh compile. **No coverage gate, no Python dependency gate, no performance gate, no image gate exists** (see §7.2 of the strategy) |
| Suspension criteria | None defined |
| **RECOMMENDED** | JUnit XML from both runners → GitHub Actions test summary; coverage artefacts published per run; a defect register with the IDs already assigned in this set (G-01…G-34, C-1, C-2, CI-1…CI-4, E-1…E-7) |

---

## 7. Effort summary

### 7.1 Delivered

| Level | Delivered | Closed |
|---|---|---|
| Security — payer binding + regression test (TC-110) + live attack/control script | 6 unit tests, `verify-g01-fix.ts` | **G-01**, SEC-007, FR-039 |
| Unit — box-key golden vectors (TC-120…TC-123, TC-125) | one shared fixture, 25 tests across two runtimes | **G-08**, NFR-011 |
| Unit — contract event + MBR regressions (TC-150, TC-033, TC-153) | 3 tests, each verified to fail pre-fix | **G-12**, **G-20** (in source) |
| API — service index, checksum validation, error hygiene, rate limiting | 7 tests in `app.spec.ts` | **G-34**, **G-10**, SEC-010, SEC-011, **G-09** / SEC-013 |
| CI — real trigger, caching, dependency audits, artifact-freshness gate | `ci.yml` | **G-06 / CI-1**, **CI-4**, **G-16**, **G-27** |
| System — the consent-gated composition executed on TestNet | `e2e-consent-proof.ts`, `total_audit_entries` 0 → 5 | **E-1**, FR-010, FR-012, FR-025 |

### 7.2 Remaining

| Level | Effort to reach an acceptable baseline | Priority |
|---|---|---|
| Integration — `records.ts` suite (TC-100…TC-105, TC-113) | ~0.5 day | **1** |
| CI — stub the facilitator (CI-2), then TC-170 / TC-171 on top of it | ~3 hours | **2** |
| Integration — concurrency harness (TC-130…TC-134) | ~0.5 day | **3** |
| Unit — pin the two rule-engine defects (TC-180, TC-185, TC-186) | ~30 minutes | **4** |
| Unit — a direct spec for `services/algorand.ts` (G-05) | ~0.5 day | 5 |
| Unit — `fund_mbr` and successful `withdraw_excess` (TC-154…TC-156, G-25) | ~2 hours | 6 |
| CI — build both images and boot-probe the API image (TC-203) | ~2 hours | 7 |
| CI — coverage report and floor (TC-202); `pip-audit`, CodeQL, `gitleaks` (TC-204) | ~3 hours | 8 |
| UI — component tests | ~1 day | 9 |
| E2E — Playwright first path | ~1 day | 10 |
| Performance — first baseline (G-24) | ~1 day | 11 |
| **Total to close the remaining Medium findings** | **~2 developer-days** | — |

No Critical finding remains open. The two High findings that do — **G-11** (the in-process audit lock pins the deployment to one machine) and **G-15** (no metrics, tracing or alerting) — are not closed by a test: G-11 needs the sequence prediction moved off the client or the lock moved into shared state, and G-15 needs instrumentation that does not exist yet. Both are design work, sized in [`../10_Operations/Monitoring.md`](../10_Operations/Monitoring.md) and [`Test_Cases.md`](Test_Cases.md) §C.4 respectively.

The rest of the gap between MedRail's current test posture and one that would survive hostile review is still measured in days, not weeks — because the missing tests are few, specific, and already enumerated in [`Test_Cases.md`](Test_Cases.md).
