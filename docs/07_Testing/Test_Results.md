# MedRail — Test Results


> **⚠ Correction notice.** Parts of this document were written against a review finding that was
> later proven wrong. Settlement in x402 v2 happens **only** on a sub-400 response, so **no error
> path in MedRail can consume a settled payment** — and consent-denied calls (HTTP 403) are **not
> charged**, contrary to `API.md`, `SECURITY.md`, and the `paidButDenied` field. The audit-sequence
> race causes a **rejected transaction**, not a corrupted log. See
> [`CORRECTIONS.md`](../CORRECTIONS.md) — it supersedes any statement here that contradicts it.

**Purpose:** record only results that were actually produced, with the exact command that produced each one, so any claim in this set can be re-run and checked.

**Status of this document:** **VALIDATED**. Every figure below was executed or independently queried on **2026-08-21** against commit `32ffd73` (branch `master`). On-chain facts were re-verified against the public indexer `https://testnet-idx.algonode.cloud` — they are **not** quoted from the repository's own documentation. Nothing in this document is estimated, projected, or extrapolated.

**Cross-references:** [`Test_Cases.md`](Test_Cases.md) (per-case detail), [`Test_Plan.md`](Test_Plan.md), [`Performance_Validation.md`](Performance_Validation.md), [`../02_Requirements/Requirements_Traceability_Matrix.md`](../02_Requirements/Requirements_Traceability_Matrix.md), [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md).

---

## 1. Summary

| Suite | Command | Result | Wall time |
|---|---|---|---|
| Contract unit | `contracts/.venv/Scripts/python.exe -m pytest tests/ -q` | **14 passed** | **0.41 s** |
| API | `cd api && npx vitest run` | **18 passed** (3 files) | **4.08 s** |
| Frontend | — | **no tests exist** | — |
| | **Total automated tests** | **32 passed, 0 failed, 0 skipped** | |

Plus **7 manual proof procedures** executed against live Algorand TestNet (§4), and **0** integration, performance, security-scanning, fuzzing or mutation runs — because none exist.

---

## 2. Contract test suite

### 2.1 Command and environment

```bash
cd D:/MedRail/contracts
./.venv/Scripts/python.exe -m pytest tests/ -q
```

| | |
|---|---|
| Runner | `pytest` |
| Engine | `algorand-python-testing` **1.1.0** — in-memory AVM emulation |
| Compiler pinned | `puyapy==5.9.0` (`contracts/requirements-dev.txt`) |
| Python | 3.12 (CI); repo-local `contracts/.venv` locally |
| Network access | **none** — the suite runs fully offline |
| Config file | none; pytest defaults, tests discovered under `contracts/tests/` |

### 2.2 Output summary

```
..............                                                           [100%]
14 passed in 0.41s
```

Fourteen dots, one per test, no `F`, no `E`, no `s`. Mapping to TC-001…TC-014 is in [`Test_Cases.md`](Test_Cases.md) §A.1.

**Reproducibility note:** the suite was re-run during the preparation of this document and reported `14 passed in 0.14s`. The pass count is stable; the wall time varies with interpreter and filesystem cache warmth. **0.41 s is the figure recorded by the reviewer's measured run and is the one quoted throughout this set.** No other timing conclusion should be drawn from either number.

### 2.3 What passed

| Group | Tests | Requirements |
|---|---|---|
| Admin lifecycle and authorisation | `test_create_sets_admin`, `test_set_admin_only_admin` | FR-029, SEC-002 |
| Consent state machine | `test_request_access_emits_event_and_counts`, `test_grant_then_check_access`, `test_check_access_false_when_no_grant`, `test_grant_with_expiry_becomes_invalid_after_expiry`, `test_revoke_access`, `test_revoke_nonexistent_grant_asserts`, `test_regrant_after_revoke_reactivates` | FR-018…FR-024, DATA-001 |
| Audit log | `test_log_access_admin_only`, `test_log_access_rejects_non_admin`, `test_audit_log_sequence_increments_per_patient`, `test_get_audit_entry_missing_asserts` | FR-025…FR-028, SEC-001 |
| Fund safety | `test_withdraw_excess_admin_only` | SEC-002, FR-031 (negative case only) |

---

## 3. API test suite

### 3.1 Command and environment

```bash
cd D:/MedRail/api
npx vitest run
```

| | |
|---|---|
| Runner | `vitest` **4.1.10** |
| Node | 20 |
| Config file | **none — no `vitest.config.ts` exists anywhere in the repository**; discovery uses vitest defaults |
| Network access | **required.** Importing `../src/app.js` constructs an `HTTPFacilitatorClient` against `https://facilitator.goplausible.xyz` (`api/src/x402.ts:6`), and the 402's `asset` and `extra.feePayer` are resolved from that facilitator's `/supported`. The suite is **not hermetic** — this is defect **CI-2**. |

### 3.2 Output summary

```
 RUN  v4.1.10 D:/MedRail/api

 Test Files  3 passed (3)
      Tests  18 passed (18)
```

**18 passed across 3 files in 4.08 s.**

| File | Tests | Kind |
|---|---|---|
| `api/test/triageScorer.spec.ts` | 7 | Pure function, no I/O |
| `api/test/interactionChecker.spec.ts` | 6 | Pure function, reads `api/src/data/interactions.json` once at import |
| `api/test/x402-flow.spec.ts` | 5 | Real Hono app via `app.request()`, **live facilitator call** |

**Reproducibility note:** the suite was re-run during preparation and reported `18 passed (18)` in `872 ms` — dramatically faster than 4.08 s because the facilitator response and the Node module graph were already warm. The pass count is stable. **4.08 s is the reviewer's recorded figure and the one quoted throughout.** Neither number is a performance measurement; see [`Performance_Validation.md`](Performance_Validation.md).

### 3.3 What the x402 tests actually assert

Worth stating precisely, because "402 test" is often a mock. These drive the real middleware stack:

| Assertion | Value observed |
|---|---|
| `POST /v1/triage` unpaid → status | `402` |
| `payment-required` header present | yes, base64-encoded |
| Decoded `accepts[0].scheme` | `"exact"` |
| Decoded `accepts[0].amount` (triage) | `"20000"` — $0.02 at 6 decimals |
| Decoded `accepts[0].amount` (records) | `"50000"` — $0.05 at 6 decimals |
| Decoded `accepts[0].network` | matches `/^algorand:/` |
| `GET /v1/health` | `200`, `ok: true` |

For completeness, the full live 402 payload captured by the reviewer on `/v1/triage` (HTTP `402`, body `{}` — the challenge is header-only):

```json
{"x402Version":2,"error":"Payment required",
 "resource":{"url":"http://localhost/v1/triage","description":"Rule-based clinical red-flag triage score. Not medical advice.","mimeType":"application/json"},
 "accepts":[{"scheme":"exact","network":"algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=",
   "amount":"20000","asset":"10458941",
   "payTo":"2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE",
   "maxTimeoutSeconds":300,
   "extra":{"feePayer":"ZMFK2OI7ZBD2U27ISERZC4S6LKM6WMFJPZQ4MYNJDZ2VNBNMBA67RA22AA"}}]}
```

Response headers observed alongside it: `cache-control: no-store`, `access-control-allow-origin: *`, `access-control-expose-headers: PAYMENT-REQUIRED,PAYMENT-RESPONSE`.

Note that `asset` and `extra.feePayer` are **not** in MedRail's configuration — they come from the facilitator. That is exactly why the suite is non-hermetic (CI-2) and why a facilitator outage becomes an opaque HTTP 500 at runtime (finding R-1).

### 3.4 Assertion quality — the 32-test count overstates the assurance

**Measured by execution on 2026-08-21** against the real modules (`api/src/services/interactionChecker.ts`, `api/src/services/triageScorer.ts`), independently reproduced twice. This is measured evidence, not analysis.

A passing test is not the same as a verified behaviour. One test in the existing suite **runs directly over a live defect and asserts nothing about it**:

| Observation | Measured result |
|---|---|
| `interactionChecker.spec.ts` → `"always includes a source citation and disclaimer"` calls `checkInteractions(["a","b"])` and asserts only `source.length > 0` and a disclaimer substring | That exact call returns **`flagged: true` with 5 matches**: `warfarin+aspirin` (major), `warfarin+ibuprofen` (major), `warfarin+naproxen` (major), `maoi+sertraline` (**contraindicated**), `simvastatin+clarithromycin` (major) |
| `checkInteractions(["in","as"])` — two-character substrings of real drug names | **`flagged: true` with 4 matches**: `warfarin+aspirin` (major), `simvastatin+clarithromycin` (major), `simvastatin+erythromycin` (major), `metformin+iodinated contrast` (moderate) |
| `scoreTriage("I have no chest pain")` — a negated symptom | **`{score: 35, band: "urgent", matchedFlags: ["possible cardiac chest pain"]}`** — the negation is ignored entirely |

So on every green run, the suite issues a call that produces five spurious severe-interaction warnings — one of them classified `contraindicated` — and the suite does not notice, because the only assertions on that call are about the disclaimer string. Defect **AI-006** is exercised by the existing tests and observed by none of them. The negation behaviour is a second, previously unrecorded gap, tracked here as new requirement **AI-090**.

Root causes, both in source:

- `api/src/services/interactionChecker.ts:42-43` — `m.includes(a) || a.includes(m)`, an unanchored, symmetric substring test, so any short token contained by a table entry matches.
- `api/src/services/triageScorer.ts:58-63` — `normalized.includes(kw)` with no negation, proximity or windowing logic.

Missing tests: **TC-180** (1-character false positives), **TC-185** (2-character false positives), **TC-186** (negation). All three are written to be implementable as-is in [`Test_Cases.md`](Test_Cases.md) §C.8.

**The point for a reviewer:** "32 tests, 32 passing" is an accurate statement about this repository and a poor proxy for its assurance level. Nothing here is measured about assertion strength — there is no mutation testing (which is precisely the technique that surfaces this class of weakness) and no coverage measurement at all.

### 3.5 One evidence chain that does check out

**Measured by execution on 2026-08-21:** `scoreTriage("Sudden chest pain and shortness of breath")` returns `score: 70`, `band: "emergency"`, `matchedFlags: ["possible cardiac chest pain", "respiratory distress"]`.

That is **byte-identical** to the `responseBody` recorded in `contracts/artifacts/e2e-proof.json`, which was produced by the real settled payment `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ` (§5.4). The scorer's present behaviour, the artefact committed to the repository, and the on-chain payment therefore form a consistent chain: the recorded proof is a genuine output of the code that is in the tree today, not a hand-edited artefact. Reproduce with:

```bash
# Exact form used to produce every measured value in §3.4 and §3.5.
# `npx tsx -e "..."` silently produces no output in this environment — use a file.
cat > /d/MedRail/api/.tmp-verify.mts <<'EOF'
import { checkInteractions } from "./src/services/interactionChecker.js";
import { scoreTriage } from "./src/services/triageScorer.js";
for (const meds of [["a", "b"], ["in", "as"]]) {
  const r = checkInteractions(meds);
  console.log(JSON.stringify(meds), "flagged=" + r.flagged, "matches=" + r.matches.length,
    JSON.stringify(r.matches.map(m => m.drugs.join("+") + ":" + m.severity)));
}
console.log("negation:", JSON.stringify(scoreTriage("I have no chest pain")));
console.log("e2e:", JSON.stringify(scoreTriage("Sudden chest pain and shortness of breath")));
EOF
cd /d/MedRail/api && npx tsx .tmp-verify.mts; rm -f /d/MedRail/api/.tmp-verify.mts

# Compare the last line against the recorded proof artefact:
cat /d/MedRail/contracts/artifacts/e2e-proof.json
```

---

## 4. Typecheck and build results

Every job the CI workflow *would* run passes locally. The problem with CI is the trigger (CI-1), not the code.

| Check | Command | Result |
|---|---|---|
| API typecheck | `cd api && npx tsc --noEmit` | **PASS** — 0 errors (NFR-005, `strict: true`) |
| API build | `cd api && npm run build` (`tsc -p tsconfig.json`) | **PASS** |
| API tests | `cd api && npx vitest run` | **PASS** — 18 passed, 4.08 s |
| Contract compile | `python -m puyapy smart_contracts/consent/contract.py --out-dir artifacts` | run by CI step `Compile` (`.github/workflows/ci.yml:22`) with `puyapy==5.9.0` |
| Contract tests | `contracts/.venv/Scripts/python.exe -m pytest tests/ -q` | **PASS** — 14 passed, 0.41 s |
| Web typecheck | `cd web && npx tsc --noEmit -p tsconfig.json` | **PASS** — 0 errors |
| Web build | `cd web && next build` (Next.js 16.3.0, Turbopack) | **PASS** — compiled in 6.3 s; **2 static routes** (`/` and `/_not-found`), both prerendered `○ (Static)` |

The web build producing exactly two routes is itself a fact worth recording: the demo application has **one** real route. Any diagram or document showing more is wrong.

### 4.1 CI status

| | |
|---|---|
| Workflow | `.github/workflows/ci.yml`, 3 jobs (`contract`, `api`, `web`), all `ubuntu-latest`, all parallel |
| Would all jobs pass? | **Yes** — every step above is green locally |
| Has CI ever run on a push? | **No.** The workflow triggers on `push: branches: [main]`; the repository's only branch is `master`. This is defect **CI-1**. Only `pull_request` events would fire, and the repository has no PRs. |
| Coverage produced? | **No.** No `--coverage` flag, no threshold, no report (**CI-3**) |
| Security scan produced? | **No.** No `npm audit`, `pip-audit`, CodeQL, Dependabot or SAST (**CI-3** / SEC-014) |
| Container image built? | **No.** Neither Dockerfile is exercised, so NFR-007 is **UNVALIDATED** (**CI-3**) |

---

## 5. On-chain evidence

All rows below were **re-verified by the reviewer against `https://testnet-idx.algonode.cloud` on 2026-08-21**, independently of the repository's own `docs/PROOF.md`.

### 5.1 Deployment

| Fact | Value |
|---|---|
| Network | Algorand **TestNet**, genesis hash `SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=` |
| App ID | **768743428** |
| Created at round | **66088624** |
| `deleted` | `false` |
| Creator / deployer | `2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE` |
| Application account | `CCO26Y6Z56DDZ3OELO2UKJMIPJVSIT52I23F2MPMR52JBM3HQZZNUZNOR4` |
| Application account balance | 5,000,000 µALGO (5 ALGO) |
| Application account min-balance | 145,000 µALGO |
| Boxes present | **2**, both `g`-prefixed grant boxes; **100** total box bytes |
| Explorer | https://lora.algokit.io/testnet/application/768743428 |

**Note on `create_txid`:** `contracts/artifacts/deploy_testnet.json` records `"create_txid": null`. This is not a missing application — the app demonstrably exists and is not deleted. The recorded deploy run was an idempotent re-run that detected the existing app rather than creating it, and `deploy_testnet.py` only records `create_txid` when `operation_performed == Create`. Stated here rather than glossed.

### 5.2 Live global state

Read directly from the indexer:

```
total_requests       = 2
total_grants_active  = 0
total_revocations    = 2
total_audit_entries  = 0     <-- ZERO
```

`total_requests = 2` and `total_revocations = 2` indicate `exercise_contract.py` was run twice; the second run's transaction ids are not recorded in the repository. Both grant boxes remain, both revoked — consistent with `total_grants_active = 0`.

The final line is the most important single piece of evidence in this document. See §6.

### 5.3 Verified transactions

| Purpose | Transaction ID | Confirmed round | Sender | Test case |
|---|---|---|---|---|
| App funding, 5 ALGO | `KYH3H5CG2CCUPUUTJIBX47WD4RWSUV3QWTEUJQRQFYLWO5YAO3QA` | **66088626** | deployer | TC-050 |
| `request_access` | `5XIADMCGFP5I7H7AS656RXZS7MFEEPCVJGLA7T3SVE6XDEYSGFFA` | **66088670** | `CVYBERM3GTWG…` (throwaway requester) | TC-051 |
| `grant_access` | `X2BQ5FD4MW52B75WQGDB67TEULYLN7FHVFO6ZOBNI74PNCAKVOUA` | **66088672** | `S56WIB3XLUOX…` (throwaway patient) | TC-052 |
| `revoke_access` | `OV2J2T5VWMIQG64JYGL7JEGZKKNZNKCMNIQU6AC4PDRQYZ6ZOO5A` | **66088674** | `S56WIB3XLUOX…` | TC-054 |

Method selectors verified on-chain: `request_access` = `d84debd0`, `grant_access` = `8c3ad539`, `revoke_access` = `a67aecbc`.

### 5.4 Settled x402 payment

| Field | Value |
|---|---|
| Transaction ID | **`OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ`** |
| Type | `axfer` |
| `asset-id` | **`10458941`** (TestNet USDC, 6 decimals) |
| `amount` | **`20000`** base units = exactly $0.02 |
| `fee` | **`0`** — fee-sponsored by the facilitator's `feePayer` |
| Confirmed round | **66091768** |
| Group | `XQzhbjBAqt0AjC5AByQsCxGbMdEuca3ZZFMyFBTb7K4=` |
| Note field | decodes to `x402-payment-v2-1786140083822` |
| Sender | `2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE` |
| Receiver | `2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE` |
| HTTP outcome | `200` from `POST /v1/triage`; body `{score: 70, band: "emergency", matchedFlags: ["possible cardiac chest pain","respiratory distress"], disclaimer: …}` |
| Recorded to | `contracts/artifacts/e2e-proof.json` by `api/scripts/e2e-proof.ts` |
| Test case | TC-056 |

**Disclosure, stated plainly:** sender and receiver are the same address. The deployer paid itself. It is a genuine, facilitator-settled x402 v2 `exact`-scheme payment — the `fee: 0` and the group membership confirm it went through the facilitator's sponsored settlement path — but it is a self-payment, and **it is the only settled payment that exists**. There is no payment volume to report, and none is claimed. This is disclosed in `docs/PROOF.md` §6 and is repeated here so the limitation travels with the evidence.

---

## 6. Evidence gaps

**Read this section before drawing any conclusion from §5.**

### E-1 — `log_access` has never executed on Algorand TestNet

| Evidence | Meaning |
|---|---|
| Deployed app `768743428` global state reports **`total_audit_entries = 0`** | The counter at `contract.py:235` has never been incremented on-chain |
| The application holds **2 boxes, both `g`-prefixed** (grant boxes), **100 total box bytes** | There are **zero `s`-prefixed** (`audit_seq`) and **zero `a`-prefixed** (`audit_log`) boxes |

**Therefore `log_access` has never run on real Algorand infrastructure.** The consequences must be stated without softening:

1. **The on-chain audit-append mechanism — the system's headline differentiator — is proven only in the AVM simulator.** TC-010, TC-011, TC-012 and TC-013 pass, and they are good tests, but they run inside `algopy_testing_context()` with no network, no node, and no real box allocation. Real-network behaviour of this path is **UNVALIDATED**.
2. **`POST /v1/records/summary` has never completed its success path against the live contract.** FR-010, FR-011 and FR-012 are all **UNVALIDATED**. `docs/PROOF.md` §6 proves a settled payment against `/v1/triage` only — a route that performs no chain write at all.
3. **The `auditTxId` and `auditSequence` fields documented in `docs/API.md` have never been produced by a real run.** Every example of them anywhere in this repository is illustrative, not observed.
4. Real-network failure modes of this path are consequently untested: app-account MBR exhaustion, operator ALGO exhaustion, box-reference errors, and the read-then-write sequence race under real confirmation latency.

**Closing this gap costs about an hour** — see TC-143 in [`Test_Cases.md`](Test_Cases.md): run `logAccess` once against app `768743428` with the operator key, then read the entry back with `get_audit_entry` and record both transaction ids.

### E-2 — no coverage figure exists

There is no `--coverage` flag, no coverage threshold, no coverage report, and no coverage tooling installed in either `api/` or `contracts/`. **No line, branch, statement or function coverage percentage may be quoted for MedRail, by this document or any other.** Requirement coverage *is* countable and is reported in [`Test_Cases.md`](Test_Cases.md) §4 (32 of 100 requirements have automated coverage); that is a different metric and is labelled as such.

### E-3 — no performance measurement exists

Two single observations exist, both taken by the reviewer on a developer laptop against live TestNet:

| Observation | Value | Conditions |
|---|---|---|
| `GET /v1/consent/status`, cold | **505 ms** | Includes a real algod `getTransactionParams` plus a `simulate` round-trip |
| 402 generation on `/v1/triage`, warm | **~15 ms** | Facilitator payment kinds already cached in-process |

**These are single samples, not a benchmark.** They are not p50, not p95, not p99, and not an SLO. There is no load test, no throughput measurement, no concurrency test, no error-rate-under-load measurement, and no performance tooling anywhere in the repository. PERF-002 and PERF-003 are **NOT IMPLEMENTED**. See [`Performance_Validation.md`](Performance_Validation.md), which is deliberately structured as a plan rather than as results.

### E-4 — no security, reliability or supply-chain testing has been run

| Absent | Requirement |
|---|---|
| Payer-identity binding test (finding **S-1**) | SEC-007, SEC-008, FR-039 |
| Settled-payment-loss test (finding **R-2**) | REL-002 |
| Dependency vulnerability scan | SEC-014 |
| SAST / CodeQL | — |
| Secret scanning of the Docker build context | SEC-015 |
| Contract fuzzing | — |
| Mutation testing | — |
| Rate-limit testing | SEC-013 |

### E-5 — CI has never executed on a push

`.github/workflows/ci.yml:4-5` triggers on `main`; the repository's only branch is `master`. All three jobs pass when run locally, so **this is not a failing build — it is a pipeline that has never fired** (**CI-1**, OPS-006 **PARTIALLY IMPLEMENTED**). No green badge from this repository has ever represented a machine-verified run.

### E-6 — never built, never deployed

| Artefact | State |
|---|---|
| `api/Dockerfile`, `web/Dockerfile` | Committed; **never built by CI**. NFR-007 **UNVALIDATED** |
| MainNet deployment | **Does not exist.** `api/fly.toml` nevertheless hard-codes `NETWORK = "mainnet"` (**D-2**) and does not set `CONSENT_APP_ID` (**D-1**) |
| Public HTTPS endpoint | **Does not exist** — pending user hosting per `docs/COMPLIANCE.md` |
| Bazaar discovery listing / leaderboard presence | **Do not exist** — pending user action per `docs/COMPLIANCE.md` |

---

## 7. Reproduction commands

Every claim in this document, with the command that produces it. All paths absolute; `bash` syntax.

### 7.1 Test suites

```bash
# 14 passed
cd /d/MedRail/contracts && ./.venv/Scripts/python.exe -m pytest tests/ -q

# 14 passed, verbose per-test names (this is what CI runs)
cd /d/MedRail/contracts && ./.venv/Scripts/python.exe -m pytest tests/ -v

# 18 passed across 3 files — requires network access to the facilitator
cd /d/MedRail/api && npx vitest run
```

### 7.2 Typecheck and build

```bash
cd /d/MedRail/api  && npx tsc --noEmit && npm run build
cd /d/MedRail/web  && npx tsc --noEmit -p tsconfig.json && npm run build
cd /d/MedRail/contracts && ./.venv/Scripts/python.exe -m puyapy smart_contracts/consent/contract.py --out-dir artifacts
```

### 7.3 CI defect CI-1

```bash
cd /d/MedRail && git branch -a          # -> * master  (single branch)
cd /d/MedRail && sed -n '1,7p' .github/workflows/ci.yml   # -> push: branches: [main]
```

### 7.4 On-chain: application, global state, boxes

```bash
# Application record: created-at-round, deleted flag, creator, global state
curl -s "https://testnet-idx.algonode.cloud/v2/applications/768743428" | python -m json.tool

# Application account: balance, min-balance, total-boxes, total-box-bytes
curl -s "https://testnet-idx.algonode.cloud/v2/accounts/CCO26Y6Z56DDZ3OELO2UKJMIPJVSIT52I23F2MPMR52JBM3HQZZNUZNOR4" | python -m json.tool

# Boxes on the application — expect exactly 2, both beginning with "g".
# Zero "s"- or "a"-prefixed boxes is the direct proof of evidence gap E-1.
curl -s "https://testnet-idx.algonode.cloud/v2/applications/768743428/boxes" | python -m json.tool
```

Global-state keys are base64-encoded in the indexer response; `total_audit_entries` decodes from `dG90YWxfYXVkaXRfZW50cmllcw==`.

### 7.5 On-chain: individual transactions

```bash
for TX in \
  KYH3H5CG2CCUPUUTJIBX47WD4RWSUV3QWTEUJQRQFYLWO5YAO3QA \
  5XIADMCGFP5I7H7AS656RXZS7MFEEPCVJGLA7T3SVE6XDEYSGFFA \
  X2BQ5FD4MW52B75WQGDB67TEULYLN7FHVFO6ZOBNI74PNCAKVOUA \
  OV2J2T5VWMIQG64JYGL7JEGZKKNZNKCMNIQU6AC4PDRQYZ6ZOO5A \
  OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ ; do
  echo "== $TX"
  curl -s "https://testnet-idx.algonode.cloud/v2/transactions/$TX" | python -m json.tool
done
```

For the settled payment, confirm in the response: `"asset-transfer-transaction"."amount": 20000`, `"asset-transfer-transaction"."asset-id": 10458941`, `"fee": 0`, `"confirmed-round": 66091768`, and that `sender` equals the asset receiver.

Human-readable equivalents:

- https://lora.algokit.io/testnet/application/768743428
- https://lora.algokit.io/testnet/transaction/OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ

### 7.6 Live 402 challenge

```bash
cd /d/MedRail/api && npm run dev      # requires api/.env

curl -si -X POST http://localhost:4021/v1/triage \
  -H 'content-type: application/json' \
  -d '{"symptoms":"test"}'
# -> HTTP/1.1 402, body {}, header payment-required: <base64>

curl -s -D- -o /dev/null -X POST http://localhost:4021/v1/triage \
  -H 'content-type: application/json' -d '{"symptoms":"test"}' \
  | grep -i '^payment-required:' | cut -d' ' -f2- | tr -d '\r' | base64 -d | python -m json.tool
```

### 7.7 Manual proof procedures (Part B)

```bash
# TC-051…TC-055 — real request -> grant -> check -> revoke -> check on TestNet.
# Spends TestNet ALGO: funds two freshly-generated throwaway accounts 1 ALGO each.
cd /d/MedRail/contracts && ./.venv/Scripts/python.exe scripts/exercise_contract.py

# TC-056 — real 402 -> pay -> settle -> 200. Requires the API running and a funded
# TestNet account holding USDC ASA 10458941 in PROOF_MNEMONIC / DEPLOYER_MNEMONIC.
cd /d/MedRail/api && API_BASE=http://localhost:4021 npx tsx scripts/e2e-proof.ts
cat /d/MedRail/contracts/artifacts/e2e-proof.json
```

### 7.8 Confirming the absences

Negative claims are claims too. These commands confirm them.

```bash
# No coverage tooling, flag, or threshold anywhere (E-2)
cd /d/MedRail && grep -rn "coverage" --include="*.json" --include="*.yml" --include="*.ts" \
  --exclude-dir=node_modules --exclude-dir=.venv . ; echo "exit=$?"

# No frontend test runner or test file (zero frontend tests)
cd /d/MedRail && ls web/ | grep -Ei "vitest|jest|playwright|cypress" ; echo "exit=$?"
cd /d/MedRail && grep -n '"test"' web/package.json ; echo "exit=$?"

# No vitest config anywhere
cd /d/MedRail && find . -maxdepth 3 -name "vitest*" -not -path "*/node_modules/*"

# No security scanning, no coverage gate, no image build in CI (CI-3)
cd /d/MedRail && grep -nEi "audit|codeql|snyk|trivy|coverage|docker" .github/workflows/ci.yml ; echo "exit=$?"

# No .dockerignore anywhere (D-3 / SEC-015)
cd /d/MedRail && find . -name ".dockerignore" -not -path "*/node_modules/*" ; echo "none found"

# No .env tracked by git — the gitignore discipline is real (SEC-005)
cd /d/MedRail && git ls-files | grep -i "\.env"   # -> only .env.example entries

# @x402/extensions is declared but imported nowhere (DOC-9)
cd /d/MedRail && grep -rn "@x402/extensions" api/src web/lib web/components api/scripts ; echo "exit=$?"
```

---

## 8. Verdict

| Question | Answer |
|---|---|
| Do the tests that exist pass? | **Yes — 32/32, reproducibly, on two independent runs.** |
| Does "32 passing" mean 32 behaviours are verified? | **No.** At least one test runs directly over a live defect and asserts nothing about it (§3.4, measured). Assertion strength is unmeasured — there is no mutation testing and no coverage. |
| Do the builds pass? | **Yes — API and web, typecheck and build, zero errors.** |
| Is there real on-chain evidence? | **Yes — a live, undeleted application; four verified lifecycle/funding transactions; one genuine facilitator-settled x402 payment.** |
| Is the system's headline feature proven? | **No.** `log_access` has never executed on TestNet (**E-1**). |
| Is the consent gate proven to restrict access? | **No.** It authorises a self-asserted identity (**S-1**); the test that would catch it does not exist (TC-110). |
| Has CI ever verified a commit? | **No** (**CI-1**). |
| Can a coverage number be quoted? | **No** (**E-2**). |
| Can a latency or throughput number be quoted? | **No**, beyond two disclosed single observations (**E-3**). |

The tests that exist are honest and they pass. The evidence that is missing is missing for reasons that are specific, enumerated, and — with the exception of the S-1 fix — cheap to close.
