# MedRail — Test Plan


> **⚠ Correction notice.** Parts of this document were written against a review finding that was
> later proven wrong. Settlement in x402 v2 happens **only** on a sub-400 response, so **no error
> path in MedRail can consume a settled payment** — and consent-denied calls (HTTP 403) are **not
> charged**, contrary to `API.md`, `SECURITY.md`, and the `paidButDenied` field. The audit-sequence
> race causes a **rejected transaction**, not a corrupted log. See
> [`CORRECTIONS.md`](../CORRECTIONS.md) — it supersedes any statement here that contradicts it.

**Purpose:** state, level by level, what testing exists today, what each level must cover, how it would be built, and what it costs — with the CI execution plan and its four confirmed defects.

**Status of this document:** **IMPLEMENTED** as a description of the plan in force on 2026-08-21 against commit `32ffd73` (branch `master`). Every "what exists today" row was verified by reading the repository and executing the suites. Every "what it should cover" row is **RECOMMENDED** and describes nothing that exists.

**Cross-references:** [`Test_Strategy.md`](Test_Strategy.md), [`Test_Cases.md`](Test_Cases.md), [`Test_Results.md`](Test_Results.md), [`Performance_Validation.md`](Performance_Validation.md), [`../02_Requirements/Requirements_Traceability_Matrix.md`](../02_Requirements/Requirements_Traceability_Matrix.md), [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md).

---

## 1. Scope

### 1.1 In scope

| Component | Path | Test status |
|---|---|---|
| `MedRailConsent` smart contract | `contracts/smart_contracts/consent/contract.py` (259 lines, 13 ABI methods) | 14 unit tests, AVM simulator |
| Triage rule engine | `api/src/services/triageScorer.ts` (11 red-flag groups) | 7 unit tests |
| Interaction rule engine | `api/src/services/interactionChecker.ts` (14 pairs) | 6 unit tests |
| x402 payment gate | `api/src/x402.ts`, `api/src/app.ts:37-50` | 5 component tests (non-hermetic) |
| Consent-gated records route | `api/src/routes/records.ts` | **zero tests** |
| Chain integration | `api/src/services/algorand.ts` | **zero tests** |
| Consent status/app-info routes | `api/src/routes/consent.ts` | **zero tests** |
| Frontend | `web/` (1 route, 5 components, 5 lib modules) | **zero tests, no test runner installed** |
| Deployment artefacts | `api/Dockerfile`, `web/Dockerfile`, `api/fly.toml` | **never built by CI** |

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
| O1 | Prove the consent state machine behaves correctly for grant, revoke, expiry, re-grant and authorisation | **Met** (14/14, simulator) |
| O2 | Prove the rule engines are deterministic and carry their safety disclaimers | **Met** (13/13) |
| O3 | Prove a priced route returns a real, correctly-priced x402 challenge | **Met** (5/5, but non-hermetic) |
| O4 | Prove a real payment settles and the resource is delivered | **Met by manual procedure only** — tx `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ`, not in CI |
| O5 | Prove the consent gate actually restricts access | **NOT MET** — see S-1; the gate authorises a self-asserted identity |
| O6 | Prove a settled payment is never consumed without delivery | **NOT MET** — see R-2 |
| O7 | Prove the on-chain audit trail works on real infrastructure | **NOT MET** — `log_access` has never run on TestNet (E-1) |
| O8 | Prove the three box-key derivations agree | **NOT MET** — NFR-011 |
| O9 | Establish a latency/throughput baseline | **NOT MET** — PERF-002, PERF-003 |
| O10 | Gate every change on an automated pipeline | **NOT MET** — CI-1: the pipeline has never triggered on a push |

---

## 3. Level-by-level plan

### 3.1 Unit testing

| | |
|---|---|
| **Exists today** | **IMPLEMENTED.** 27 unit tests: 14 contract (`contracts/tests/test_consent.py`), 7 triage (`api/test/triageScorer.spec.ts`), 6 interaction (`api/test/interactionChecker.spec.ts`). |
| **Tooling** | `pytest` + `algorand-python-testing` 1.1.0 (contract); `vitest` 4.1.10 (TypeScript). No `vitest.config.ts` exists — defaults are used. |
| **Measured** | 14 passed / 0.41 s; the TypeScript unit tests are part of the 18 passed / 4.08 s API run. |
| **Should also cover** | `request_access` event payload (would catch **C-1**); `get_grant_box_mbr` value against the real MBR formula (would catch **C-2**); `fund_mbr` (both paths — currently untested, FR-030); the *successful* `withdraw_excess` path (only the negative case exists, FR-031); expiry boundary equality (`latest_timestamp == expires_at`); short-name interaction false positives (**AI-006**); zod boundary values (1/2000 chars, 2/20/21 medications); the three box-key derivations as golden vectors (**NFR-011**). |
| **Tooling recommendation** | Keep both runners. Add `vitest --coverage` with `@vitest/coverage-v8` and `pytest-cov`; publish both as CI artefacts. Add a shared JSON golden-vector fixture consumed by the Python, Node and browser key-derivation tests so parity is asserted from one source of truth. |
| **Effort** | ~1.5 developer-days for all of the above. |
| **Requirements** | FR-004…FR-009, FR-018…FR-032, SEC-001…SEC-003, DATA-001, DATA-002, DATA-005, AI-001…AI-004, AI-006, NFR-009, NFR-011 |

### 3.2 Integration testing

| | |
|---|---|
| **Exists today** | **NOT IMPLEMENTED.** Zero integration tests. Nothing exercises `api/src/routes/records.ts`, `api/src/routes/consent.ts`, or `api/src/services/algorand.ts`. |
| **Should cover** | `records.ts` happy path, denied path, and the `logAccess`-throws-after-settlement path (**R-2**); `checkAccess`/`getAuditCount` against deployed app `768743428`; `logAccess` writing a real entry (closing **E-1**); `withPatientLock` concurrency — asserting that **N concurrent writes for one patient all succeed**, and that bypassing the lock reproduces a rejected transaction (**not** that sequence numbers are unique: the contract self-assigns those and guarantees uniqueness with or without the lock, so that assertion would pass for the wrong reason — see [`Test_Cases.md`](Test_Cases.md) §C.4); operator-key-absent behaviour; algod failure behaviour; facilitator-unreachable behaviour (**R-1**). |
| **Tooling recommendation** | `vitest` with two projects: `integration-mocked` (module-mock `../services/algorand.js` so route logic is testable with no network — this is where the R-2 regression test belongs) and `integration-live` (a real `OPERATOR_MNEMONIC` against TestNet, opt-in via env, excluded from the default CI run). Add `nock` or `msw` to stub the facilitator's `/supported`. |
| **Effort** | ~2 developer-days, of which the mocked route suite is ~0.5 day and delivers most of the value. |
| **Requirements** | FR-010, FR-011, FR-012, FR-013, FR-025, NFR-004, NFR-011, REL-001…REL-004, SEC-006 |
| **Blocking note** | This tier is where **S-1** and **R-2** both live. It is the single highest-value tier in this plan. |

### 3.3 System testing

| | |
|---|---|
| **Exists today** | **PARTIALLY IMPLEMENTED** — as two manual scripts, not as tests. `contracts/scripts/exercise_contract.py` runs a real request→grant→check→revoke→check cycle on TestNet with two freshly-generated throwaway accounts, and asserts both `check_access` results in-script (`exercise_contract.py:127-128`). `api/scripts/e2e-proof.ts` runs a real 402→sign→settle→200 against a running API and writes `contracts/artifacts/e2e-proof.json`. |
| **Status** | **VALIDATED but not automated / not in CI.** Neither script has an assertion harness, a reporter, an exit-code contract beyond an uncaught exception, or a scheduled run. |
| **Should also cover** | A full system path that has *never* been run: paid `/v1/records/summary` against a real grant, producing a real `auditTxId` and `auditSequence`. This is the missing proof for FR-012 and the direct cause of **E-1**. |
| **Tooling recommendation** | Wrap both scripts as `vitest` integration specs with real assertions, gated on `RUN_LIVE=1`; run them nightly on a schedule rather than per-commit so a facilitator or AlgoNode blip does not block merges. |
| **Effort** | ~0.5 day to convert; ~1 hour to execute the missing `log_access` path once. |
| **Requirements** | FR-003, FR-012, FR-018, FR-020, FR-023, FR-025, FR-040 |

### 3.4 API testing

| | |
|---|---|
| **Exists today** | **PARTIALLY IMPLEMENTED.** 5 tests in `api/test/x402-flow.spec.ts` drive the real Hono app via `app.request()`: `/v1/health` free and 200; `/v1/triage` unpaid → 402 with decoded `accepts[0].scheme === "exact"`, `amount === "20000"`, `network` matching `/^algorand:/`; `/v1/interaction-check` → 402; `/v1/records/summary` → 402 with `amount === "50000"`; and one test documenting that middleware ordering makes a malformed unpaid request surface as 402 rather than 400. |
| **Not covered** | `GET /v1/consent/status` (FR-013), `GET /v1/consent/app-info` (FR-014), `GET /v1/consent/arc56` (FR-015), `GET /` (FR-017), every non-402 response of every priced route, all zod rejection paths behind the paywall, and the `app.onError` behaviour (SEC-011). |
| **Tooling recommendation** | Same `vitest` + `app.request()` pattern — it is the right one and requires no server. Add a hermetic facilitator stub so the whole file can run offline. Generate `../05_API/OpenAPI.yaml` from the implementation and add a schema-conformance assertion per route so drift between the spec and the handler becomes a test failure. |
| **Effort** | ~0.5 day. |
| **Requirements** | FR-001, FR-002, FR-013…FR-017, FR-038, SEC-010, SEC-011 |

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
| **Should cover** | `PricingTable` rows matching the prices actually configured in `api/src/app.ts` (a drift test); `NetworkBadge` health-poll states (loading / ok / unreachable); `DemoWalletCard` generate-and-clear against `sessionStorage`; `ConsentChecker` grant → check → revoke against a mocked algod; and — importantly — `LiveDemoPanel` sending `requesterAddress: wallet.address`, which is the coincidence that currently masks **S-1** in the demo. |
| **Tooling recommendation** | Vitest + `@testing-library/react` + `jsdom`. Add a `test` script to `web/package.json` and a `web` test step to CI. |
| **Effort** | ~1 developer-day. |
| **Requirements** | FR-033…FR-037 |

### 3.7 Regression testing

| | |
|---|---|
| **Exists today** | **PARTIALLY IMPLEMENTED.** There is no separate regression suite; the full 32 tests re-run on every change in 4.5 s combined, which at this size is the correct design. |
| **Gap** | Two known past regressions left no test behind: the CORS `allowHeaders` drift that broke every paid browser call (fix documented at `api/src/app.ts:25-30`), and the `algosdk` ARC-56/ARC-4 parsing drift that motivated hand-constructing `ABIMethod` literals (`api/src/services/algorand.ts:16-19`). Nothing asserts either fix holds. In particular nothing checks the hand-written ABI literals still match `contracts/artifacts/MedRailConsent.arc56.json`. |
| **Should cover** | One regression test per confirmed defect, permanently: S-1 (TC-110), R-2 (TC-103), R-3 (TC-172), C-1 (TC-150), C-2 (TC-153), NFR-011 (TC-125), REL-004 (TC-130), plus an ABI-literal-vs-ARC-56 conformance test. |
| **Tooling recommendation** | Same runners; tag regression specs so they can be reported separately in CI output. |
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
| **Exists today** | **PARTIALLY IMPLEMENTED**, and only on-chain. Three negative authorisation tests exist and pass: `test_set_admin_only_admin`, `test_log_access_rejects_non_admin`, `test_withdraw_excess_admin_only` — covering SEC-001, SEC-002, SEC-003. At the API tier there is **nothing**: no authorisation test, no input-fuzzing, no dependency scan, no SAST, no secret scan, no contract fuzzing, no mutation testing. |
| **Must cover — highest priority in this entire plan** | **TC-110:** pay as address A while asserting `requesterAddress = B`, expect **403**. This is the single most important missing test in the repository. Today the request returns 200 (S-1 / SEC-007 / FR-039). Also: forged/absent `PAYMENT-SIGNATURE` (TC-112); audit attribution matching the recovered payer, not the body (TC-113, SEC-008); invalid-checksum address → 400 not 500 (TC-172, SEC-010/R-3); `app.onError` not echoing internal messages (TC-173, SEC-011); rate limiting (SEC-013); dependency CVE gate (SEC-014); build-context secret exclusion (SEC-015). |
| **Tooling recommendation** | `npm audit --audit-level=high` and `pip-audit` as CI gates; CodeQL for JS/TS and Python; Dependabot; `gitleaks` on the build context; a small property/fuzz harness over the zod schemas and the contract's string arguments. |
| **Effort** | ~0.5 day for the S-1 fix and its regression test; ~1 day for the remaining API security tests; ~2 hours to wire the scanners. |
| **Requirements** | SEC-001…SEC-016, FR-039 |

### 3.10 User acceptance testing

| | |
|---|---|
| **Exists today** | **NOT IMPLEMENTED** as a formal activity. In practice the acceptance criterion for this submission is a judge reproducing the flows described in `docs/JUDGES.md` and `docs/PROOF.md`. |
| **Should cover** | A scripted judge walkthrough with pass/fail per step: open the demo, generate a wallet, fund it from the TestNet dispenser, make a paid triage call and verify the transaction on `lora.algokit.io`, grant consent, observe `granted: true`, call the records endpoint, verify the audit transaction, revoke, observe `granted: false`. |
| **Blocking caveat** | The final two steps of that walkthrough have **never been demonstrated**: `log_access` has never executed on TestNet (E-1), so `auditTxId` has never been produced by a real run. A UAT script must not assert a step that has never passed — it must be run once by the team first. |
| **Tooling recommendation** | A checklist in `docs/11_Hackathon/`, plus a hosted public endpoint (currently pending — no public HTTPS deployment exists). |
| **Effort** | ~0.5 day to write, gated on the E-1 run. |

---

## 4. CI execution plan

### 4.1 Pipeline as configured

`.github/workflows/ci.yml` — 3 jobs, all `ubuntu-latest`, all independent (no `needs:`), so they run in parallel.

| Job | Steps | Verifies |
|---|---|---|
| `contract` | `checkout` → `setup-python@v5` (3.12) → `pip install -r requirements-dev.txt` → `python -m puyapy smart_contracts/consent/contract.py --out-dir artifacts` → `pytest tests/ -v` | Contract compiles under `puyapy==5.9.0` and 14/14 unit tests pass |
| `api` | `checkout` → `setup-node@v4` (20) → `npm ci` → `npx tsc --noEmit` → `npm run build` → `npx vitest run` | Strict typecheck (NFR-005), build, 18/18 tests |
| `web` | `checkout` → `setup-node@v4` (20) → `npm ci` → `npx tsc --noEmit -p tsconfig.json` → `npm run build` with `NEXT_PUBLIC_API_BASE=http://localhost:4021`, `NEXT_PUBLIC_NETWORK=testnet` | Strict typecheck and Next.js production build |

**All three jobs pass when run locally** (see [`Test_Results.md`](Test_Results.md) §2 and §3). The pipeline definition is correct. The problem is not a failing build.

### 4.2 CI defects

| ID | Severity | Defect | Evidence | Consequence | Fix |
|---|---|---|---|---|---|
| **CI-1** | **HIGH** | The workflow triggers on `push: branches: [main]`, but the repository's only branch is `master`. | `.github/workflows/ci.yml:4-5`; `git branch -a` → `* master` (single branch) | **No push has ever triggered CI, and none ever will** until the branch is renamed or the trigger changed. Only `pull_request` events would fire, and the repository has no PRs. The green pipeline is a green pipeline that has never run. OPS-006 is **PARTIALLY IMPLEMENTED** for exactly this reason. | Change to `branches: [main, master]`, or rename the branch. One line. |
| **CI-2** | **MEDIUM** | The `api` job runs `npx vitest run`, and `api/test/x402-flow.spec.ts` requires a live HTTP call to `facilitator.goplausible.xyz` at app-module import time. | `x402-flow.spec.ts:2` imports `../src/app.js` → `api/src/x402.ts:6` constructs `HTTPFacilitatorClient`; `accepts[].asset` and `extra.feePayer` come from the facilitator's `/supported`, not from MedRail config | CI depends on a third-party service being reachable from a GitHub runner. A facilitator outage produces a red build with a misleading failure. Same root cause as runtime finding **R-1**. | Stub `/supported` with `msw`/`nock` for the default run; keep a live variant behind `RUN_LIVE=1`. |
| **CI-3** | **MEDIUM** | No deployment stage, no security scanning, no coverage gate, no artefact publishing, no image build. | Absence throughout `ci.yml`; `api/Dockerfile`, `web/Dockerfile` and `api/fly.toml` exist but are never exercised | The pipeline is verification-only. No dependency CVE would be caught (SEC-014). No coverage figure is produced — which is why **no coverage percentage appears anywhere in this documentation set**. Neither Dockerfile has ever been proven to build, so NFR-007 is **UNVALIDATED**, and defects D-1/D-2 (missing `CONSENT_APP_ID`, `NETWORK = "mainnet"` in `fly.toml`) would survive any number of green builds. | Add `npm audit`/`pip-audit`/CodeQL, `vitest --coverage`, and a `docker build` job for both images. |
| **CI-4** | **LOW** | No dependency caching. | `actions/setup-node@v4` and `actions/setup-python@v5` are used without their `cache:` inputs | Every run reinstalls `npm ci` twice and the full Python toolchain, including `puyapy`. Slower and noisier than necessary; no correctness impact. | Add `cache: npm` with `cache-dependency-path`, and `cache: pip`. |

### 4.3 Recommended pipeline (**RECOMMENDED** — none of this exists)

| Stage | Trigger | Jobs | Gate |
|---|---|---|---|
| **PR / push to default branch** | every change | `contract` (compile + pytest + coverage), `api` (typecheck + build + hermetic vitest + coverage), `web` (typecheck + build + component tests) | all must pass; coverage must not regress against the stored baseline |
| **Security** | every change | `npm audit --audit-level=high`, `pip-audit`, CodeQL (JS/TS + Python), `gitleaks` on the build context | High/Critical CVE blocks merge |
| **Image** | every change | `docker build` for `api/` (context = repo root) and `web/`, then boot the API image and assert `GET /v1/health` returns 200 with the expected `consentAppId` | build + boot must pass — this alone would catch D-1 |
| **Live integration** | nightly | `RUN_LIVE=1` integration suite against TestNet app `768743428`, including one `log_access` write | reported, non-blocking; alert on failure |
| **E2E** | nightly | Playwright browser flow | reported, non-blocking |
| **Performance** | weekly / on demand | k6 baseline against a fixed environment | reported against the team-chosen thresholds once those exist |

---

## 5. Test environment matrix

| Environment | Config source | Can exercise | Cannot exercise | Present state |
|---|---|---|---|---|
| **Local developer** (Windows 11, Node 20, Python 3.12, `contracts/.venv`) | `api/.env`, `contracts/.env`, `web/.env.local` — all untracked, all present on disk | Both unit suites; the full API with a real `OPERATOR_MNEMONIC`; both proof scripts; live TestNet reads *and* writes; the Next.js dev server; the browser demo wallet | Nothing structurally blocked | **The only environment in which the complete system has ever run.** All results in [`Test_Results.md`](Test_Results.md) were produced here. |
| **CI runner** (`ubuntu-latest`, GitHub Actions) | workflow `env:` only — no secrets configured | `puyapy` compile; 14 contract tests; API typecheck/build/tests; web typecheck/build | Any chain write (no operator key); `checkAccess`/`getAuditCount` (both call `getOperator()`, which throws without `OPERATOR_MNEMONIC`); either proof script; any Docker build; anything at all in practice, because of **CI-1** | Definition correct, jobs pass locally, **has never executed on a push** |
| **Algorand TestNet** | `NETWORK=testnet`, App ID `768743428`, USDC ASA `10458941`, GoPlausible facilitator, AlgoNode algod/indexer | `request_access`, `grant_access`, `revoke_access`, `check_access` (all four verified on-chain); real x402 settlement (tx `OYRQRKYA…`, round 66091768); app funding (tx `KYH3H5CG…`) | **`log_access` — never executed here.** Global state reads `total_audit_entries = 0`; the app holds 2 grant boxes and zero `s`/`a` boxes (**E-1**) | Live, `deleted: false`, app account funded 5 ALGO |
| **MainNet** | `api/fly.toml` hard-codes `NETWORK = "mainnet"` (defect **D-2**) | **nothing** | Everything — `MedRailConsent` is not deployed on MainNet and no App ID is configured (**D-1**) | **Pending.** No MainNet deployment exists. A `fly deploy` today would point at a network where the contract does not exist. |
| **Container** (`api/Dockerfile`, `web/Dockerfile`) | Build context = repo root for `api/`; no `.dockerignore` anywhere (**D-3**) | **nothing verified** | Never built by CI (NFR-007 **UNVALIDATED**). `contracts/artifacts/deploy_testnet.json` is not copied into the image, so without an explicit `CONSENT_APP_ID` the config falls back to `0` and `/v1/consent/status` and `/v1/records/summary` return 500 (**D-1**); `api/fly.toml` does not set it | **Never built.** |
| **Public HTTPS endpoint** | — | — | — | **Does not exist.** No public deployment, no Bazaar listing, no leaderboard presence — all pending user action per `docs/COMPLIANCE.md`. |

---

## 6. Roles, entry/exit, and reporting

| Item | Current state |
|---|---|
| Test ownership | Single developer; no separate QA function |
| Defect tracker | None — findings live in this documentation set and in `docs/` |
| Test management tool | None |
| Reporting | Console output of `pytest -q` and `vitest run`; no JUnit XML, no HTML report, no coverage artefact |
| Entry criteria | Compile + typecheck + build (see [`Test_Strategy.md`](Test_Strategy.md) §7.1) |
| Exit criteria | 32/32 green + both builds. **No coverage gate, no security gate, no performance gate exists** (see §7.2 of the strategy) |
| Suspension criteria | None defined |
| **RECOMMENDED** | JUnit XML from both runners → GitHub Actions test summary; coverage artefacts published per run; a defect register with the IDs already assigned in this set (S-1, R-1…R-4, C-1, C-2, CI-1…CI-4, D-1…D-7, E-1) |

---

## 7. Effort summary

| Level | Effort to reach an acceptable baseline | Priority |
|---|---|---|
| Security — payer binding + regression test (TC-110) | ~0.5 day | **1** |
| Integration — `records.ts` suite (TC-100…TC-105) | ~0.5 day | **2** |
| Unit — box-key golden vectors (TC-120…TC-125) | ~0.5 day | **3** |
| CI — fix CI-1, stub facilitator (CI-2), add coverage (CI-3) | ~2 hours | **4** |
| System — execute `log_access` once on TestNet (closes E-1) | ~1 hour | **5** |
| Unit — contract event + MBR tests (TC-150, TC-153) | ~2 hours | 6 |
| Integration — concurrency harness (TC-130…TC-134) | ~0.5 day | 7 |
| API — remaining route coverage + error paths | ~0.5 day | 8 |
| UI — component tests | ~1 day | 9 |
| E2E — Playwright first path | ~1 day | 10 |
| Performance — first baseline | ~1 day | 11 |
| **Total to close every Critical and High finding** | **~2 developer-days** | — |

The last row is the important one. The gap between MedRail's current test posture and one that would survive hostile review is measured in days, not weeks — because the missing tests are few, specific, and already enumerated in [`Test_Cases.md`](Test_Cases.md).
