# MedRail — Test Results

**Purpose:** record only results that were actually produced, with the exact command that produced each one, so any claim in this set can be re-run and checked.

**Status of this document:** **VALIDATED**. Every figure below was executed or independently queried on **2026-08-21** against commit `3b387df` (branch `main`). On-chain facts were re-verified against the public Algorand TestNet endpoints — they are **not** quoted from the repository's own documentation. Nothing in this document is estimated, projected, or extrapolated.

**Cross-references:** [`Test_Cases.md`](Test_Cases.md) (per-case detail), [`Test_Plan.md`](Test_Plan.md), [`Performance_Validation.md`](Performance_Validation.md), [`../02_Requirements/Requirements_Traceability_Matrix.md`](../02_Requirements/Requirements_Traceability_Matrix.md), [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md).

---

## 1. Summary

| Suite | Command | Result | Wall time |
|---|---|---|---|
| Contract unit | `contracts/.venv/Scripts/python.exe -m pytest tests/ -q` | **28 passed** (2 files) | **0.44 s** |
| API | `cd api && npx vitest run` | **93 passed** (9 files) | **1.60 s** |
| Frontend | — | **no tests exist** | — |
| | **Total automated tests** | **121 passed, 0 failed, 0 skipped** | |

Plus **9 manual proof procedures** executed against live Algorand TestNet (§5), **one autonomous-agent verification run** (§5.7), and **0** performance, fuzzing or mutation runs — because none exist. Dependency scanning now runs in CI: `npm audit --audit-level=high` reports **0 vulnerabilities** in both `api/` and `web/`.

**The eight verification scripts in `api/scripts/` are not tests and are not counted above.** `agent-demo.ts`, `e2e-proof.ts`, `e2e-consent-proof.ts`, `verify-g01-fix.ts`, `preflight.ts`, `provision-agent-wallet.ts`, `provision-patient-wallet.ts` and `grant-consent.ts` are **manual procedures**: none is invoked by a test runner, none is registered with `vitest`, and **none of them runs in CI**. They spend real TestNet USDC and depend on two third parties, which is precisely why they are not on the per-commit path. What each proves is tabulated in [`Test_Plan.md`](Test_Plan.md) §3.5.1. The number 121 counts automated tests only.

**The suite grew from 32 tests to 121.** The added 89 are not spread evenly; they are concentrated on the things this document previously recorded as unproven. Three of them close by regression test — the payer-identity bypass, the transposed ARC-28 event, the under-reported box MBR — and **each was confirmed to fail against the pre-fix code before the fix landed**, which is what separates a regression test from a description of current behaviour. Two more close by measurement: cross-language box-key parity, and the address-validation / error-disclosure pair.

The one figure in this document that changed without a test producing it is on-chain: `total_audit_entries` on app `768743428` moved from **0 to 5** (§5.2). That was evidence gap **E-1**, the largest in the project, and it is closed (§6).

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
| Test files | `tests/test_consent.py` (17 tests), `tests/test_box_keys.py` (5 functions, 11 collected cases — two are parametrised over the 4 golden vectors) |

### 2.2 Output summary

```
............................                                             [100%]
28 passed in 0.44s
```

Twenty-eight dots, one per collected case, no `F`, no `E`, no `s`. Mapping to test cases is in [`Test_Cases.md`](Test_Cases.md) §A.1 and §A.2.

**Reproducibility note:** the wall time varies with interpreter and filesystem cache warmth; the pass count does not. **0.44 s is the figure from the measured run recorded here.** No timing conclusion should be drawn from it — see [`Performance_Validation.md`](Performance_Validation.md).

### 2.3 What passed

| Group | Tests | Requirements |
|---|---|---|
| Admin lifecycle and authorisation | `test_create_sets_admin`, `test_set_admin_only_admin` | FR-029, SEC-002 |
| Consent state machine | `test_request_access_emits_event_and_counts`, `test_grant_then_check_access`, `test_check_access_false_when_no_grant`, `test_grant_with_expiry_becomes_invalid_after_expiry`, `test_revoke_access`, `test_revoke_nonexistent_grant_asserts`, `test_regrant_after_revoke_reactivates` | FR-018…FR-024, DATA-001 |
| Audit log | `test_log_access_admin_only`, `test_log_access_rejects_non_admin`, `test_audit_log_sequence_increments_per_patient`, `test_get_audit_entry_missing_asserts` | FR-025…FR-028, SEC-001 |
| Fund safety | `test_withdraw_excess_admin_only` | SEC-002, FR-031 (negative case only — the successful withdrawal path and `fund_mbr` are both still untested, **G-25**) |
| **Contract-defect regressions** (new) | `test_request_access_event_field_order`, `test_grant_box_mbr_matches_the_protocol_formula`, `test_get_grant_box_mbr_returns_the_corrected_constant` | FR-024, FR-032, DATA-005 |
| **Cross-language box-key parity** (new file) | `test_fixture_is_present_and_shared_with_the_typescript_suite`, `test_grant_box_key_matches_golden_vector` ×4, `test_audit_seq_box_key_matches_golden_vector` ×4, `test_key_lengths_match_the_documented_layout`, `test_derivation_is_order_and_scope_sensitive` | NFR-011, DATA-001, FR-032 |

### 2.4 The three regression tests were verified against the pre-fix code

This matters more than the pass count. A test written *after* a fix, against the fixed code, proves only that the code does what it currently does. Each of the three defect regressions above was run against the **pre-fix** `contract.py` and **observed to fail**:

| Test | Pre-fix behaviour | Post-fix behaviour |
|---|---|---|
| `test_request_access_event_field_order` | **FAIL** — bytes 4…36 of the ARC-28 log held `Txn.sender`, not the `patient` argument; the two addresses were transposed for every event consumer (defect C-1 / G-12) | PASS |
| `test_grant_box_mbr_matches_the_protocol_formula` | **FAIL** — `GRANT_BOX_MBR` was `2_500 + 400 * (32 + 17)` = 22,100, omitting the BoxMap's 1-byte `key_prefix` (defect C-2 / G-20) | PASS at 22,500 |
| `test_get_grant_box_mbr_returns_the_corrected_constant` | **FAIL** — the public ABI method returned the same 22,100 | PASS |

The equivalent applies to the API side: `app.spec.ts`'s bad-checksum case returned `500 {"error":"wrong checksum for address"}` before `api/src/validation.ts` existed, and the disclosure assertion (`expect(raw).not.toContain("wrong checksum for address")`) was written specifically because that string *was* being returned to unauthenticated callers.

**The fixes for C-1 and C-2 are in source only.** `contracts/scripts/deploy_testnet.py` uses `OnUpdate.AppendApp`, which mints a *new* application rather than updating in place, so redeploying would invalidate App `768743428` along with its 12 boxes and its whole transaction history. The redeploy is deliberately deferred; **App `768743428` still runs the pre-fix bytecode**, and the `AccessRequested` events already on-chain still carry the transposed field order.

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
| Network access | **required, but only for two files of nine.** Importing `../src/app.js` constructs an `HTTPFacilitatorClient` against `https://facilitator.goplausible.xyz` (`api/src/x402.ts`), and the 402's `asset` and `extra.feePayer` are resolved from that facilitator's `/supported`. `x402-flow.spec.ts` and `bazaar-discovery.spec.ts` both assert on a real 402 and so depend on it; the other seven files do not. The suite is still **not hermetic** — defect **CI-2**, partially mitigated (§3.6). |

### 3.2 Output summary

```
 RUN  v4.1.11 D:/MedRail/api

 Test Files  9 passed (9)
      Tests  93 passed (93)
   Duration  1.60s (transform 538ms, import 4.68s, tests 1.40s)
```

**93 passed across 9 files in 1.60 s.**

| File | Tests | Kind |
|---|---|---|
| `api/test/triageScorer.spec.ts` | 7 | Pure function, no I/O |
| `api/test/interactionChecker.spec.ts` | 6 | Pure function, reads `api/src/data/interactions.json` once at import |
| `api/test/x402-flow.spec.ts` | 7 | Real Hono app via `app.request()`, **live facilitator call** |
| `api/test/x402Payer.spec.ts` | 6 | Real `algosdk`-signed transactions wrapped in genuine x402 v2 AVM payloads; **no network** |
| `api/test/boxKeyParity.spec.ts` | 14 | `node:crypto` + `crypto.subtle` against a shared golden-vector fixture; **no network** |
| `api/test/app.spec.ts` | 7 | Real Hono app via `app.request()` on free routes only; **no network** |
| `api/test/records.spec.ts` | 12 | The gated handler driven directly with `vi.mock` over `services/algorand.js`; **no network** |
| `api/test/algorandService.spec.ts` | 26 | `checkAccess`, `getAuditCount`, `logAccess` box references, the per-patient lock's ordering, and the health sampler, all against a mocked algod; **no network** |
| `api/test/bazaar-discovery.spec.ts` | 8 | Asserts the discovery declaration on the real 402 of all three priced routes, **live facilitator call** |

Note the `tests 1.40s` against a `1.60s` total: most of the wall time is still module import and transform rather than assertion execution. **Neither number is a performance measurement**; see [`Performance_Validation.md`](Performance_Validation.md).

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

That capture predates the Bazaar discovery wiring. The prices, paths, `payTo` and `extra.feePayer` are unchanged, but the 402 now also carries `resource.serviceName`, `resource.tags`, `accepts[0].extra.tag` and an `extensions.bazaar` block — the current shape is captured in [`../05_API/Bazaar_Discovery.md`](../05_API/Bazaar_Discovery.md) §6.

Note that `asset` and `extra.feePayer` are **not** in MedRail's configuration — they come from the facilitator. That is exactly why the suite is non-hermetic (CI-2), and it is why a 402 cannot be constructed offline at runtime either. What the runtime does about that has changed: `api/src/app.ts` now wraps the payment middleware, recognises the two initialisation failures the SDK raises when no payment kinds can be loaded, and returns **`503` with `Retry-After: 30`** and a stable `PAYMENT_FACILITATOR_UNAVAILABLE` code instead of an opaque 500. Free routes are untouched either way. Finding **G-04 / R-1 is closed** in the code; the automated guard for it (TC-170) is still absent, because it needs the same facilitator stub as CI-2.

### 3.4 Assertion quality — the test count still overstates the assurance

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

**The point for a reviewer:** "121 tests, 121 passing" is an accurate statement about this repository and a poor proxy for its assurance level. Growing the suite from 32 to 121 did not touch this weakness at all — G-21 and G-26 remain open, TC-180, TC-185 and TC-186 remain unwritten, and the green run above still issues a call that produces five spurious severe-interaction warnings. Coverage is now measured (§6, **E-2**) and it does not help here either: `interactionChecker.ts` is fully covered by line, and the defect survives, which is the cleanest available demonstration that coverage is not assurance. What remains unmeasured is assertion strength, and the technique for that — mutation testing — still does not exist here.

What the added tests *do* establish is narrower and should be claimed narrowly: five specific defects now have a test that fails without the fix (§2.4). That is a statement about five behaviours, not about the suite.

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

### 3.6 Hermeticity — CI-2, partially mitigated

Seven of the nine spec files now run with no outbound request: `triageScorer`, `interactionChecker`, `x402Payer`, `boxKeyParity`, `app`, `records` and `algorandService` are all offline. **78 of the 93 tests are hermetic.** `x402-flow.spec.ts` (7) and `bazaar-discovery.spec.ts` (8) are not — both assert on a real 402, which cannot be constructed without the facilitator — and there is still no `msw`/`nock` stub, so **CI-2 is not closed**.

Two things did change the shape of the risk:

- The new files were written to be offline by construction rather than by accident. `x402Payer.spec.ts` builds real signed transactions with `algosdk` and wraps them in genuine x402 v2 AVM payloads locally, so it exercises the real decode path with no facilitator; `app.spec.ts` only touches free routes, which never reach the payment middleware's initialisation.
- A facilitator outage no longer produces a confusing failure. Before, the SDK's initialisation error surfaced as an opaque 500 and a CI failure that looked like a MedRail regression. Now the runtime returns a 503 with a named code, so an outage is legible as an outage.

Neither of those makes CI independent of a third party. **TC-201 remains the fix**, and it is now also the prerequisite for TC-170 and TC-171.

---

## 4. Typecheck and build results

Every job the CI workflow runs passes locally, and the workflow now actually fires — defect CI-1 is closed.

| Check | Command | Result |
|---|---|---|
| API typecheck | `cd api && npx tsc --noEmit` | **PASS** — 0 errors (NFR-005, `strict: true`) |
| API build | `cd api && npm run build` (`tsc -p tsconfig.json`) | **PASS** |
| API tests | `cd api && npx vitest run` | **PASS** — 93 passed across 9 files, 1.60 s |
| API dependency audit | `cd api && npm audit --audit-level=high` | **PASS** — **found 0 vulnerabilities** |
| Contract compile | `python -m puyapy smart_contracts/consent/contract.py --out-dir artifacts` | run by CI step `Compile` with `puyapy==5.9.0`, followed by `cp smart_contracts/consent/artifacts/* artifacts/` — puyapy resolves `--out-dir` relative to the source file, so the output must be copied to where consumers read it (**G-28**, still open as a documentation defect) |
| Committed artifacts match source | `git diff --exit-code -- contracts/artifacts/current/` | CI gate — the build is byte-reproducible, so `contract.py` cannot change without `contracts/artifacts/current/` changing with it. Note the directory: **`contracts/artifacts/` itself is pinned to the deployed program** and is *expected* to differ from source while the C-1/C-2 redeploy is held (E-7). CI asserts that pinned set was **not** regenerated, as a separate step |
| Contract tests | `contracts/.venv/Scripts/python.exe -m pytest tests/ -q` | **PASS** — 28 passed, 0.44 s |
| Web typecheck | `cd web && npx tsc --noEmit -p tsconfig.json` | **PASS** — 0 errors |
| Web dependency audit | `cd web && npm audit --audit-level=high` | **PASS** — **found 0 vulnerabilities** |
| Web build | `cd web && next build` (Next.js 16.3.0, Turbopack) | **PASS** — compiled in 6.3 s; **2 static routes** (`/` and `/_not-found`), both prerendered `○ (Static)` |

The web build producing exactly two routes is itself a fact worth recording: the demo application has **one** real route. Any diagram or document showing more is wrong.

The API typecheck row records `npx tsc --noEmit`, which resolves `api/tsconfig.json` and therefore covers `src` only — the same set `npm run build` compiles, because `src` is all that ships. CI now runs a wider one: `npm run typecheck` is `tsc -p tsconfig.all.json`, which extends the build config with `noEmit` and `"include": ["src", "scripts", "test"]`. That matters here specifically, because `scripts/` is what produces the on-chain evidence quoted throughout §5 and nothing typechecked it until that config existed.

The two audit results close **G-16** and **G-27**. The `nanoid` advisory GHSA-2v37-7h3g-55p8, previously reported against the web dependency tree, no longer appears in either package.

### 4.1 CI status

| | |
|---|---|
| Workflow | `.github/workflows/ci.yml`, 3 jobs (`contract`, `api`, `web`), all `ubuntu-latest`, all parallel |
| Do all jobs pass? | **Yes** — every step above is green locally |
| Does CI run on a push? | **Yes.** Triggers are `push: branches: [main, master]`, `pull_request`, and `workflow_dispatch`. The repository's branch is `main`. **CI-1 / G-06 is closed** — the earlier workflow listed only `main` while the only branch was `master`, so no push ever fired it. Both are listed now, and `workflow_dispatch` allows a manual run regardless. |
| Dependency caching? | **Yes.** `cache: pip` keyed on `contracts/requirements-dev.txt`; `cache: npm` keyed on each package's `package-lock.json` (**CI-4** closed) |
| Security scan produced? | **Partially.** `npm audit --audit-level=high` gates both Node jobs (SEC-014, **G-16 / G-27** closed). No `pip-audit`, CodeQL, Dependabot or SAST — TC-204 |
| Artifact-freshness gate? | **Yes, and pointed at the right directory.** The contract job recompiles today's source into `contracts/artifacts/current/` and fails on any diff there; a second step fails if the pinned `contracts/artifacts/*.teal` / `*.arc56.json` were regenerated by accident |
| Coverage produced? | **Locally, not in CI.** `npm run coverage` (`vitest run --coverage`) reports whole-suite **83.05%** statements / **65.85%** branches — measured, quotable, and recorded under **E-2**. No CI step runs it and no threshold gates a merge, so it can regress silently (**CI-3**, TC-202) |
| Container image built? | **Not by CI.** Both images have now been built and booted **by hand** (2026-08-22), which is what moved NFR-007 to **VALIDATED**; the pipeline still has no `docker` step, so nothing prevents a regression — TC-203 |

---

## 5. On-chain evidence

All rows below were **re-verified against the public Algorand TestNet endpoints on 2026-08-21**, independently of the repository's own `docs/PROOF.md`.

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
| Application account min-balance | **550,400 µALGO** |
| Boxes present | **12** — 6 `g`-prefixed (grants), 5 `a`-prefixed (audit entries), 1 `s`-prefixed (audit sequence); **1,051** total box bytes |
| Explorer | https://lora.algokit.io/testnet/application/768743428 |

The min-balance is worth checking rather than quoting: `100_000 + 2_500 × 12 + 400 × 1_051 = 550_400`. The protocol formula reproduces the observed value exactly, which is the independent confirmation behind the corrected `GRANT_BOX_MBR` (§2.4). Headroom above the minimum is ~4.45 ALGO.

**Note on `create_txid`:** `contracts/artifacts/deploy_testnet.json` records `"create_txid": null`. This is not a missing application — the app demonstrably exists and is not deleted. The recorded deploy run was an idempotent re-run that detected the existing app rather than creating it, and `deploy_testnet.py` only records `create_txid` when `operation_performed == Create`. Stated here rather than glossed.

### 5.2 Live global state

Read directly from the chain:

```
total_requests       = 2
total_grants_active  = 4
total_revocations    = 2
total_audit_entries  = 5     <-- was 0
```

`total_requests = 2` and `total_revocations = 2` indicate `exercise_contract.py` was run twice; the second run's transaction ids are not recorded in the repository.

`total_grants_active = 4` against **six** `g`-prefixed boxes is consistent and worth reading carefully: a revoked grant keeps its box and flips its status to `STATUS_REVOKED`, so 6 boxes − 2 revocations = 4 active. The four active grants come from the consent-gated proof run (`e2e-consent-proof.ts`) and the G-01 verification run (`verify-g01-fix.ts`), which grants to a freshly generated third-party address each time it runs.

**`total_audit_entries = 5` is the line that changed.** It was `0` when this document was first written, and the zero was the single most important piece of evidence in it: the on-chain audit append — the system's headline differentiator — had never executed outside the AVM simulator. It has now executed five times against real Algorand infrastructure, and the application holds the five `a`-prefixed boxes and the one `s`-prefixed sequence box to show for it. See §6, E-1.

### 5.3 Verified transactions

| Purpose | Transaction ID | Confirmed round | Sender | Test case |
|---|---|---|---|---|
| App funding, 5 ALGO | `KYH3H5CG2CCUPUUTJIBX47WD4RWSUV3QWTEUJQRQFYLWO5YAO3QA` | **66088626** | deployer | TC-050 |
| `request_access` | `5XIADMCGFP5I7H7AS656RXZS7MFEEPCVJGLA7T3SVE6XDEYSGFFA` | **66088670** | `CVYBERM3GTWG…` (throwaway requester) | TC-051 |
| `grant_access` | `X2BQ5FD4MW52B75WQGDB67TEULYLN7FHVFO6ZOBNI74PNCAKVOUA` | **66088672** | `S56WIB3XLUOX…` (throwaway patient) | TC-052 |
| `revoke_access` | `OV2J2T5VWMIQG64JYGL7JEGZKKNZNKCMNIQU6AC4PDRQYZ6ZOO5A` | **66088674** | `S56WIB3XLUOX…` | TC-054 |
| `grant_access` (consent-gated proof setup) | `M26NPR32Z5YBLBBMZDTBQL6Y7EUSNS5YV4PXYEUBXIVJQGVJ3MAA` | — | deployer, granting to itself | TC-057 |
| **`log_access`** (first audit append on TestNet) | **`4YLKLQKKWXXFW3UT5APJVYKXI7T7A6OACTAWCC5YBAN3XGOGHRVQ`** | — | operator (contract admin) | TC-057 |
| `grant_access` (G-01 verification setup) | `PCPVK3FLKP55L3FHCFIIF7QBYUPV5BHKSKYJTUIL6J4Q23HKNFDQ` | — | deployer, granting to a generated third party | TC-058 |
| `log_access` (G-01 control leg) | `OYNWBHJTS4LCIW2KQKOM2CEZGIFPRCZLVBVCDDG3GGNWKWDKNBGA` | — | operator | TC-058 |

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

**Disclosure, stated plainly:** in *this* payment, sender and receiver are the same address — the deployer paid itself. It is a genuine, facilitator-settled x402 v2 `exact`-scheme payment — the `fee: 0` and the group membership confirm it went through the facilitator's sponsored settlement path — but it is a self-transfer. The agent run in §5.7 settles between independent accounts instead, on a float seeded from this same wallet. What neither run has is an *external* payer: no unrelated party has paid for this service, and no payment volume is claimed. This is disclosed in `docs/PROOF.md` and is repeated here so the limitation travels with the evidence.

### 5.5 Settled payment on the consent-gated route — the composition proof

Produced by `api/scripts/e2e-consent-proof.ts` (TC-057). This is the run that closed **E-1**.

| Field | Value |
|---|---|
| Grant transaction | `M26NPR32Z5YBLBBMZDTBQL6Y7EUSNS5YV4PXYEUBXIVJQGVJ3MAA` — `grant_access(self, "records:summary", 0)` |
| Settled payment | **`5DKFUULWLTNGKLYLH3TT44F22MHKOFRCEO6K4JVEPOPETFBYOESA`** — `$0.05`, TestNet USDC ASA `10458941` |
| **Audit append** | **`4YLKLQKKWXXFW3UT5APJVYKXI7T7A6OACTAWCC5YBAN3XGOGHRVQ`** — `log_access`, sent by the operator |
| HTTP outcome | `200` from `POST /v1/records/summary` |
| Response fields observed | `consentVerifiedOnChain: true`, `auditStatus: "recorded"`, `auditSequence: "1"`, the synthetic summary, and the disclaimer |
| Recorded to | `contracts/artifacts/e2e-consent-proof.json` |
| Test case | TC-057 |

**Why this one matters more than §5.4.** The `/v1/triage` payment proves that x402 settles. This proves the composition the project exists to demonstrate: **one paid HTTP call that is simultaneously a settled USDC payment, an on-chain authorisation read, and an immutable audit append**, with the resulting transaction ids returned to the caller in the response body. Three separate chain interactions and one HTTP request, and the caller can verify all three independently on a public explorer.

The script is repeatable — it detects an existing grant and skips straight to the paid call — and it aborts before paying if the grant did not take effect, so it cannot spend money to prove nothing.

**Disclosure:** in this run the patient, the requester and the payer are the same address — `e2e-consent-proof.ts` drives all three from the project's own key. The agent run in §5.7 separates all three onto their own keypairs: a patient (`56LFG5EE…`) that is neither the payer nor the payee, granting an agent (`UYBTLPHS…`) whose keypair this service does not hold. The identity binding of §5.6 is what makes that distinction meaningful rather than incidental.

### 5.6 The G-01 impersonation attempt, executed and rejected

Produced by `api/scripts/verify-g01-fix.ts` (TC-058). The script performs the actual attack against the live deployment, then a control.

| Leg | Setup | Result |
|---|---|---|
| **Setup** | The patient grants `records:summary` to a **freshly generated third-party address** whose private key the caller does not hold — `NHUPYHPA22HGPFEK…`. Grant confirmed on-chain (`PCPVK3FLKP55L3FHCFIIF7QBYUPV5BHKSKYJTUIL6J4Q23HKNFDQ`) and via the free `/v1/consent/status`. | Grant active |
| **Attack** | Pay with the caller's **own** key while asserting the third party's address as `requesterAddress` — the exact bypass G-01 described | **`403`** `{"error":"requesterAddress must match the address that signed the payment", "requesterAddress":"NHUPYHPA…", "payer":"2WDV2J2F…"}`. No `summary` field. **No settled payment** — a 4xx cancels settlement, so the attempt cost the attacker nothing and earned them nothing. |
| **Control** | The same payer asserting their **own** address | **`200`** with the summary, settled payment `QZIQWHN553Q3QYJ4NJ5GP3QIROP6BE2DD45P3IUSHUOGEB7VLVSQ`, audit append `OYNWBHJTS4LCIW2KQKOM2CEZGIFPRCZLVBVCDDG3GGNWKWDKNBGA` |
| **Verdict** | Script exits non-zero unless both hold | Reported `Impersonation blocked: YES`, `Legitimate call works: YES`, `G-01 CLOSED: YES`. Recorded to `contracts/artifacts/g01-verification.json`. |

**The control leg is what makes the result meaningful.** A 403 on its own proves nothing — a broken endpoint returns 403 too. Pairing the rejection with a successful call from the same payer, against the same app, seconds apart, is what shows the endpoint discriminates rather than simply refuses.

**The mechanism is worth stating, because it is the more interesting half.** `api/src/x402Payer.ts` decodes the verified `PAYMENT-SIGNATURE` header, reads the AVM `exact` payload's `paymentGroup` / `paymentIndex`, and recovers the address that signed the payment transaction. `api/src/routes/records.ts` then requires `payer === requesterAddress`. No new credential, no session, no key exchange: **the payment is the authentication.** The caller already proved possession of that private key in order to pay at all, so binding the consent check to it costs nothing and closes the bypass entirely. Six unit tests pin the recovery (`api/test/x402Payer.spec.ts`, §A.6 of [`Test_Cases.md`](Test_Cases.md)); this is the end-to-end confirmation.

### 5.7 The autonomous agent run — discovery through settlement, unattended

Produced by `api/scripts/agent-demo.ts`, executed on **2026-08-22** with separately provisioned agent and patient wallets. **This is a manual verification script, not an automated test.** Nothing asserts on its output, no runner invokes it, and it does **not** run in CI — it exits non-zero only if a call throws. Recorded here because it produced three public transaction ids, and those are evidence whatever the harness around them is.

A clinical triage agent was given one task and one base URL. It held no MedRail account, no API key and no prior relationship with the service.

**Three separate accounts with three separate keypairs, established before the run.** `api/scripts/provision-agent-wallet.ts` generated the agent's keypair — `UYBTLPHS6APCXVBDPASQMUIQCEORDIR6EMTVMNSDPSVRSR5HEPKQ5GO4YQ`, which this service does not hold — funded it with 260,000 µALGO (`YKGXFTZU75TWIKUWO35TEHCSND5TFOFE3BKWTFTZD3LA65TGZUIA`), had it opt **itself** in to USDC ASA `10458941` (`KOALP5W2EDFXU5DRDOTUZYQBLWBOJZVKVOXBG6Y7YZYCSPAQM5PA`), and sent it a $1.00 float (`3ODGZ44ZUMQAGUYTX7763FZH2U3A5MN3KQTYMXZ5I4RPGRACJGXA`). `api/scripts/provision-patient-wallet.ts` generated a third keypair for the patient — `56LFG5EEHIJ4ZVMPHUMJH6BST2O3D4DMG3AWRZ2SN7Y3LLUDVUDILO66YM`, funded with 150,000 µALGO (`GCYA23PHR2J43WBOXOXZ7IWCCI2VFSCTUXV7ZQHBLIA54TSTFWLA`) — an account that is neither the payer nor the `payTo`, and which never pays for anything. That patient then granted `records:summary` to *that specific agent* with `api/scripts/grant-consent.ts`: signed by the patient's own key and submitted straight to Algorand, with the backend nowhere in the path (`IG4XEBTMRCKI724ZVHSYUN4ECTYBXAGZM5N35NP4Y3ZVWECG7WUQ`, confirmed round **66563915**).

| Step | Call | Price | Observed result | Transaction |
|---|---|---|---|---|
| 1 | `GET /` | free | 8 endpoints with prices and gates; App `768743428`; network and CAIP-2 id; ARC-56 spec URL; x402 v2 / `exact` / facilitator | — |
| 2 | `POST /v1/triage` | **$0.02** | `band=EMERGENCY score=70` | **`DOSKCNKJRXIMY2UDSDZ377LKPZQIZJW5JHCGUAGKOYV6KUCFYKIA`** |
| 3 | `POST /v1/interaction-check` | **$0.02** | `MAJOR: warfarin + aspirin` | **`PLBFDDADW576IUCH62HGGYI4AJQNO3QXSENNDIBKAORWVMP7NVHQ`** |
| 4 | `GET /v1/consent/status` | **free** | `granted=true` — checked *before* committing to step 5 | — (`simulate`, nothing submitted) |
| 5 | `POST /v1/records/summary` | **$0.05** | consent verified on-chain, access audited | **`COMJ3TQOGTKP6LXDJS7HZY7B45QZJQWXXJ23HQ3IDDQYD7GRK36A`** |
| | **Total** | **$0.09** | across **3 settled Algorand transactions** — zero accounts created, zero API keys issued | |

Each id resolves at `https://lora.algokit.io/testnet/transaction/<TXID>`; the loop in §7.5 checks them against the indexer. Step 5 also produced an audit append — `E6ZTGEAOTLJQDYOUVBYJYL7LKTXHBGXGVTBKN3SR2NUPWJ2PIGQA`, confirmed round **66563942**, sent by the operator and naming `56LFG5EE…` as patient and `UYBTLPHS…` as requester — which the script records alongside the three payments in `contracts/artifacts/agent-run.json`.

**Re-verified against the public indexer**, not quoted from the script's own output:

| Transaction | `asset-id` | `amount` | `fee` | Confirmed round | Sender → receiver |
|---|---|---|---|---|---|
| `DOSKCNKJ…CFYKIA` | `10458941` | **20 000** = $0.02 | `0` — fee-sponsored | **66563930** | `UYBTLPHS…5GO4YQ` → `2WDV2J2F…TI64GE` |
| `COMJ3TQO…GRK36A` | `10458941` | **50 000** = $0.05 | `0` — fee-sponsored | **66563944** | `UYBTLPHS…5GO4YQ` → `2WDV2J2F…TI64GE` |

**Sender ≠ receiver on both**, which is the property the earlier runs in this document do not have: the agent paid from its own keypair into the service's `payTo`. `PLBFDDAD…` is the third settlement of the same run and was not separately re-read from the indexer.

**The earlier run of the same script, kept for the record.** Before the agent wallet existed, `agent-demo.ts` performed the identical sequence paying from the project's own account: `POAQNSOPPW6TB5DU76VHYZTS7X2SJQRUNVCNR55GRO7TYXOKUF4Q` ($0.02, round 66562629), `W3Z55BZYCALOFZFSXI75MR22OVVEX7JRSK7T2NRATKBDU7Y4OL5A` ($0.02, round 66562637) and `5CO5XV7M5H6WLFI2D5M7UODUOF2IUQNM3FOSKH5VA66SVQTLBBDQ` ($0.05, round 66562647), with audit append `5HYV5B2LO5DVHTTAOZMQKJNEYK6VICRVAINAZ5YBVW3QUR64TBKA`. On all three of those, sender and receiver were the same address — `2WDV2J2F…TI64GE`. They are real transactions from a real run and are recorded as such; they are **not** part of the run tabulated above, and the two sets must not be quoted as one. Two further runs sit between the two — the agent paying from its own keypair while the *patient* was still the service account — and are catalogued in [`../PROOF.md`](../PROOF.md) §10.

**What this adds that §5.4 and §5.5 do not.** Those runs proved that a payment settles and that the paid/consent/audit composition completes. Both were driven by a script that already knew the endpoint, the price and the shape of the request. What is new here is that **the caller was told none of those things**: it read the catalogue at runtime from `GET /`, took the prices it paid out of that response (`agent-demo.ts:157-158`), noticed from the `gate` field that one route had a precondition, and evaluated that precondition for free before spending on it. The only MedRail-specific value in the script is `API_BASE`.

**The pre-flight branch is real code, not narration.** `agent-demo.ts:194-197` returns early and reports on the two findings it has already paid for if `granted` is `false`. In this run the grant was active, so the branch was not taken — which is worth stating plainly: **the decline path was not exercised by this run.** What was exercised is the free check that decides it.

**Relation to the counters in §5.2.** Those global-state figures were read on 2026-08-21, *before* these runs. The patient's grant to the agent creates one further `g`-prefixed box, and each paid `/v1/records/summary` appends one further audit entry, so `total_grants_active`, `total_audit_entries` and the count of `a`-prefixed boxes are all **higher** than the values recorded in §5.2, which should now be read as a floor rather than a current figure. Re-run the query in §7.4 for a live value.

**Disclosures, in the same terms as §5.4 and §5.5.**

- **Not hosted.** The agent called `http://localhost:4021`. There is no public HTTPS endpoint, so no agent has ever discovered this service from a public URL.
- **An independent payer, on a float that came from here.** The agent signs with its own keypair (`AGENT_MNEMONIC`, `agent-demo.ts:37`), which this service does not control, so the settlements above are genuine account-to-account transfers and the indexer says so. Its TestNet USDC float was nonetheless seeded from the project's own wallet (`3ODGZ44Z…`), because TestNet USDC has no other practical source. **No external or unrelated party has paid for this service**, and no payment volume is claimed. What these ids close is the payment *mechanics*; the absence of external demand is untouched by them.
- **Three separate accounts, all three provisioned from here.** The patient who granted consent, `56LFG5EE…VUDILO66YM`, is a third keypair — neither the payer nor the `payTo` (`agent-demo.ts:50` reads it from `PATIENT_ADDRESS`) — so no two roles in this run share an address. What that does *not* make them is independent parties: this project generated the patient's key and funded it, exactly as it did the agent's. And because the agent asserts its own address as `requesterAddress`, the payer binding passes here by construction: §5.6 is still the run that shows it *discriminates*.
- **Nothing sits behind the gate.** `SYNTHETIC_RECORD` is a fixed constant returned regardless of `patientId`, and neither compute endpoint contains a model. The payments, the authorisation read and the audit entry are real; the clinical content is not.
- **The evidence file is self-reported.** The run writes `contracts/artifacts/agent-run.json` — the agent and patient addresses, the three payment ids with explorer links, the audit id, and the total. Like every artefact under `contracts/artifacts/`, it is written *by the script being evidenced*, so it indexes the evidence rather than being it. The indexer readings tabulated above are what actually settle the question.

Message-level sequence: [`../03_Architecture/Sequence_Diagrams.md`](../03_Architecture/Sequence_Diagrams.md) §10. Integration guide built from the same script: [`../05_API/API_Documentation.md`](../05_API/API_Documentation.md) §1.1.

---

## 6. Evidence gaps

**Read this section before drawing any conclusion from §5.**

### E-1 — `log_access` had never executed on Algorand TestNet — **CLOSED**

**Status: CLOSED on 2026-08-21.** This was the largest evidence gap in the project and it is worth recording what it was and what closed it, rather than deleting it.

**What it was.** Deployed app `768743428` reported `total_audit_entries = 5` and held two boxes, both `g`-prefixed — zero `s`-prefixed (`audit_seq`) and zero `a`-prefixed (`audit_log`). The on-chain audit append, the system's headline differentiator, was proven only inside `algopy_testing_context()`: no network, no node, no real box allocation. `POST /v1/records/summary` had never completed its success path against the live contract, and every `auditTxId` in the documentation was illustrative rather than observed.

**What closed it.** `api/scripts/e2e-consent-proof.ts` (TC-057, §5.5) drove the full path — grant, free status check, paid call, audit append. Re-verified against the chain:

| Evidence | Value |
|---|---|
| `total_audit_entries` | **5** (was 0) |
| `a`-prefixed boxes (`audit_log`) | **5**, 41-byte keys — matching `"a" ‖ pubkey ‖ itob(seq)` |
| `s`-prefixed boxes (`audit_seq`) | **1**, 33-byte key |
| First audit transaction | `4YLKLQKKWXXFW3UT5APJVYKXI7T7A6OACTAWCC5YBAN3XGOGHRVQ`, `auditSequence: "1"` |

FR-010, FR-012 and FR-025 now have live on-chain evidence, and the `auditTxId` / `auditSequence` fields documented in `docs/API.md` have been produced by real runs.

**What remains.** Two things, and neither is small:

1. **This is evidence, not a test.** TC-143 — a runner-invoked, `RUN_LIVE=1`-gated version — is still absent, so the evidence is regenerated by hand rather than on demand.
2. **The real-network failure modes of this path are still untested:** app-account MBR exhaustion, operator ALGO exhaustion, box-reference rejection under concurrency, and the read-then-write sequence race under real confirmation latency. What has changed is the blast radius: the success-path audit write is now wrapped in `try/catch`, so any of those failures degrades to `200` with `auditStatus: "pending"` instead of turning a legitimate paid request into a 500. That degradation is itself untested (TC-103, TC-134).

### E-2 — no coverage figure exists

There is no `--coverage` flag, no coverage threshold, no coverage report, and no coverage tooling installed in either `api/` or `contracts/`. **No line, branch, statement or function coverage percentage may be quoted for MedRail, by this document or any other.** Requirement coverage *is* countable and is reported in [`Test_Cases.md`](Test_Cases.md) §4 (41 of 101 requirements have automated coverage, up from 32); that is a different metric and is labelled as such.

### E-3 — no performance measurement exists

Two single observations exist, both taken by the reviewer on a developer laptop against live TestNet:

| Observation | Value | Conditions |
|---|---|---|
| `GET /v1/consent/status`, cold | **505 ms** | Includes a real algod `getTransactionParams` plus a `simulate` round-trip |
| 402 generation on `/v1/triage`, warm | **~15 ms** | Facilitator payment kinds already cached in-process |

**These are single samples, not a benchmark.** They are not p50, not p95, not p99, and not an SLO. There is no load test, no throughput measurement, no concurrency test, no error-rate-under-load measurement, and no performance tooling anywhere in the repository. PERF-002 and PERF-003 are **NOT IMPLEMENTED**. See [`Performance_Validation.md`](Performance_Validation.md), which is deliberately structured as a plan rather than as results.

### E-4 — security and supply-chain testing: partially addressed

| Check | State | Requirement |
|---|---|---|
| Payer-identity binding | **PRESENT** — 6 unit tests (`x402Payer.spec.ts`) plus a live end-to-end attack and control (§5.6) | SEC-007, FR-039 |
| Audit attribution not forgeable | **PARTIAL** — proven live (§5.6); the offline ordering guard TC-113 is absent | SEC-008 |
| Address checksum validation | **PRESENT** — `app.spec.ts` | SEC-010 |
| Internal-message disclosure | **PRESENT** — `app.spec.ts` asserts the leaked string is gone | SEC-011 |
| Rate-limit testing | **PRESENT** — `app.spec.ts`, including a guard that the health probe is *not* throttled | SEC-013 |
| Dependency vulnerability scan | **PRESENT for Node** — `npm audit --audit-level=high` gates both jobs; 0 vulnerabilities. **Absent for Python** | SEC-014 |
| Secret exclusion from the build context | **PRESENT by construction, untested** — `.dockerignore` at the repo root and in `web/` excludes `.env`, `**/.env`, `*.mnemonic`; no `gitleaks` gate verifies it | SEC-015 |
| Settled-payment-loss test | **NOT NEEDED as originally framed.** Settlement in x402 v2 runs only on a sub-400 response — `@x402/hono` calls `processSettlement` after the handler and cancels on any throw or 4xx/5xx — so no MedRail error path can consume a settled payment. REL-002 is satisfied structurally by the SDK, and the risk the original test targeted does not exist. What a test *would* pin is the degradation added for G-03: `200` with `auditStatus: "pending"` when the audit write fails (TC-103) | REL-002, FR-012 |
| Facilitator-outage degradation | **ABSENT** — the 503 path exists in `app.ts` but nothing exercises it (TC-170) | REL-001 |
| SAST / CodeQL | **ABSENT** | — |
| Contract fuzzing | **ABSENT** | — |
| Mutation testing | **ABSENT** — and it is the technique that would surface §3.4 | — |

### E-5 — CI had never executed on a push — **CLOSED**

**Status: CLOSED.** The workflow triggered on `main` while the repository's only branch was `master`, so no push ever fired it: not a failing build, a pipeline that had never run. `.github/workflows/ci.yml` now triggers on `push` to `[main, master]`, on `pull_request`, and on `workflow_dispatch`; the repository's branch is `main` and its remote is `https://github.com/Hydra-Of-Malice/Medrail`. **CI-1 / G-06 closed**, and OPS-006 has an automated gate that actually fires.

Listing both branch names is deliberate belt-and-braces: the failure mode was a silent one — a workflow that never runs looks exactly like a workflow that runs and passes — and the cheapest defence against repeating it is not to depend on which name the default branch happens to carry. The guard that would *detect* a recurrence is TC-200, still absent.

### E-6 — never built, never deployed

| Artefact | State |
|---|---|
| `api/Dockerfile`, `web/Dockerfile` | Committed; both now install with `npm ci` from the lockfile, and `.dockerignore` files exist at both build roots. **Neither image has ever been built** — NFR-007 remains **UNVALIDATED** (TC-203) |
| Fly.io deployment config | `api/fly.toml` now sets `NETWORK = "testnet"`, `CONSENT_APP_ID = "768743428"`, a `/v1/health` check, and `max_machines_running = 1`. **G-07, G-13, G-14 closed.** The config is correct and has never been applied |
| MainNet deployment | **Does not exist.** No `MedRailConsent` app on MainNet and no `contracts/artifacts/deploy_mainnet.json` |
| Public HTTPS endpoint | **Does not exist** — pending user hosting per `docs/COMPLIANCE.md` |
| Bazaar discovery listing / leaderboard presence | **Do not exist.** The discovery extension itself is now wired — `api/src/x402.ts` registers `bazaarResourceServerExtension` and every priced route declares its input/output shape and the `x402-global-challenge` tag ([`../05_API/Bazaar_Discovery.md`](../05_API/Bazaar_Discovery.md)) — but the catalogue is keyed on the resource URL, and listing happens only when a paid call lands against a *publicly reachable* one. While the API answers on `localhost` there is nothing listable |

### E-7 — the deployed bytecode predates the contract fixes

Recorded here so it is not mistaken for a documentation slip. The deployed approval program on app `768743428` is byte-identical to a compilation of the committed TEAL — verified by an algod `compile` whose hash `W4TMZHJOL7FIN5GIGJCWNB2HVI4C4WGVRDVY6BMUUOMWRFHMBJVSPZZ33U` and 1,404-character base64 program match the chain exactly. That pins the *deployed* bytecode to the *committed artifacts*, and the committed artifacts predate the C-1 and C-2 source fixes of §2.4.

So both statements are true at once: the fixes are real and tested in source, and the live application does not have them. Redeploying would mint a new App ID under `OnUpdate.AppendApp`, so the deferral is a deliberate trade — see [`../08_Deployment/Rollback_Strategy.md`](../08_Deployment/Rollback_Strategy.md) §2.

---

## 7. Reproduction commands

Every claim in this document, with the command that produces it. All paths absolute; `bash` syntax.

### 7.1 Test suites

```bash
# 28 passed
cd /d/MedRail/contracts && ./.venv/Scripts/python.exe -m pytest tests/ -q

# 28 passed, verbose per-test names (this is what CI runs)
cd /d/MedRail/contracts && ./.venv/Scripts/python.exe -m pytest tests/ -v

# 45 passed across 6 files — x402-flow.spec.ts requires network access to the facilitator;
# the other five files are hermetic.
cd /d/MedRail/api && npx vitest run

# The five hermetic files on their own — no outbound request, 40 tests.
cd /d/MedRail/api && npx vitest run test/triageScorer.spec.ts test/interactionChecker.spec.ts \
  test/x402Payer.spec.ts test/boxKeyParity.spec.ts test/app.spec.ts

# Dependency audit — the gate CI runs. Both report "found 0 vulnerabilities".
cd /d/MedRail/api && npm audit --audit-level=high
cd /d/MedRail/web && npm audit --audit-level=high
```

### 7.2 Typecheck and build

```bash
cd /d/MedRail/api  && npx tsc --noEmit && npm run build

# What CI actually runs for the API typecheck: tsconfig.all.json, which is the
# build config plus noEmit and "include": ["src", "scripts", "test"].
cd /d/MedRail/api  && npm run typecheck

cd /d/MedRail/web  && npx tsc --noEmit -p tsconfig.json && npm run build
cd /d/MedRail/contracts && ./.venv/Scripts/python.exe -m puyapy smart_contracts/consent/contract.py --out-dir artifacts
```

### 7.3 CI trigger — confirming CI-1 is closed

```bash
cd /d/MedRail && git branch -a                            # -> * main
cd /d/MedRail && git remote -v                            # -> https://github.com/Hydra-Of-Malice/Medrail.git
cd /d/MedRail && sed -n '1,10p' .github/workflows/ci.yml  # -> branches: [main, master] + workflow_dispatch
```

### 7.4 On-chain: application, global state, boxes

```bash
# Application record: created-at-round, deleted flag, creator, global state
curl -s "https://testnet-api.algonode.cloud/v2/applications/768743428" | python -m json.tool

# Application account: balance, min-balance, total-boxes, total-box-bytes
# Expect: amount 5000000, min-balance 550400, total-boxes 12, total-box-bytes 1051
curl -s "https://testnet-api.algonode.cloud/v2/accounts/CCO26Y6Z56DDZ3OELO2UKJMIPJVSIT52I23F2MPMR52JBM3HQZZNUZNOR4" | python -m json.tool

# Boxes on the application, counted by prefix.
# Expect 6 "g" (grants), 5 "a" (audit entries), 1 "s" (audit sequence).
# The five "a" boxes are the direct proof that evidence gap E-1 is closed.
curl -s "https://testnet-api.algonode.cloud/v2/applications/768743428/boxes?max=50" | python -c "
import json,sys,base64,collections
c = collections.Counter()
for b in json.load(sys.stdin)['boxes']:
    c[chr(base64.b64decode(b['name'])[0])] += 1
print(dict(c))"
```

Global-state keys are base64-encoded in the response; `total_audit_entries` decodes from `dG90YWxfYXVkaXRfZW50cmllcw==`.

### 7.5 On-chain: individual transactions

```bash
for TX in \
  KYH3H5CG2CCUPUUTJIBX47WD4RWSUV3QWTEUJQRQFYLWO5YAO3QA \
  5XIADMCGFP5I7H7AS656RXZS7MFEEPCVJGLA7T3SVE6XDEYSGFFA \
  X2BQ5FD4MW52B75WQGDB67TEULYLN7FHVFO6ZOBNI74PNCAKVOUA \
  OV2J2T5VWMIQG64JYGL7JEGZKKNZNKCMNIQU6AC4PDRQYZ6ZOO5A \
  OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ \
  M26NPR32Z5YBLBBMZDTBQL6Y7EUSNS5YV4PXYEUBXIVJQGVJ3MAA \
  5DKFUULWLTNGKLYLH3TT44F22MHKOFRCEO6K4JVEPOPETFBYOESA \
  4YLKLQKKWXXFW3UT5APJVYKXI7T7A6OACTAWCC5YBAN3XGOGHRVQ \
  PCPVK3FLKP55L3FHCFIIF7QBYUPV5BHKSKYJTUIL6J4Q23HKNFDQ \
  QZIQWHN553Q3QYJ4NJ5GP3QIROP6BE2DD45P3IUSHUOGEB7VLVSQ \
  OYNWBHJTS4LCIW2KQKOM2CEZGIFPRCZLVBVCDDG3GGNWKWDKNBGA \
  POAQNSOPPW6TB5DU76VHYZTS7X2SJQRUNVCNR55GRO7TYXOKUF4Q \
  W3Z55BZYCALOFZFSXI75MR22OVVEX7JRSK7T2NRATKBDU7Y4OL5A \
  5CO5XV7M5H6WLFI2D5M7UODUOF2IUQNM3FOSKH5VA66SVQTLBBDQ \
  5HYV5B2LO5DVHTTAOZMQKJNEYK6VICRVAINAZ5YBVW3QUR64TBKA \
  IG4XEBTMRCKI724ZVHSYUN4ECTYBXAGZM5N35NP4Y3ZVWECG7WUQ \
  DOSKCNKJRXIMY2UDSDZ377LKPZQIZJW5JHCGUAGKOYV6KUCFYKIA \
  PLBFDDADW576IUCH62HGGYI4AJQNO3QXSENNDIBKAORWVMP7NVHQ \
  COMJ3TQOGTKP6LXDJS7HZY7B45QZJQWXXJ23HQ3IDDQYD7GRK36A \
  E6ZTGEAOTLJQDYOUVBYJYL7LKTXHBGXGVTBKN3SR2NUPWJ2PIGQA ; do
  echo "== $TX"
  curl -s "https://testnet-idx.algonode.cloud/v2/transactions/$TX" | python -m json.tool
done
```

`POAQNSOP…`, `W3Z55BZY…`, `5CO5XV7M…` and `5HYV5B2L…` are the **earlier** agent run of §5.7: expect `"amount": 20000` on the first two, `"amount": 50000` on the third, and an `application-transaction` against app `768743428` invoking `log_access` on the fourth.

The last five are the **three-account** agent run of §5.7. `IG4XEBTM…` is the patient's `grant_access` to the agent — expect a `sender` of `56LFG5EE…`, which is neither the payer nor the payee. On `DOSKCNKJ…`, `PLBFDDAD…` and `COMJ3TQO…` expect `"amount": 20000`, `20000` and `50000`, `"fee": 0`, a `sender` of `UYBTLPHS…` and a receiver of `2WDV2J2F…` — **not** the same address, which is the point of reading them. `E6ZTGEAO…` is the audit append the gated call produced: an `application-transaction` against app `768743428` invoking `log_access`, sent by the operator, whose decoded arguments name `56LFG5EE…` as patient and `UYBTLPHS…` as requester.

For the `/v1/triage` payment of §5.4, confirm: `"asset-transfer-transaction"."amount": 20000`, `"asset-transfer-transaction"."asset-id": 10458941`, `"fee": 0`, `"confirmed-round": 66091768`, and that `sender` equals the asset receiver — that one is the self-transfer.

For the consent-gated payment `5DKFUULW…`, expect `"amount": 50000` — the $0.05 price of `/v1/records/summary` — and for `4YLKLQKK…` an `application-transaction` against app `768743428` invoking `log_access`.

Human-readable equivalents:

- https://lora.algokit.io/testnet/application/768743428
- https://lora.algokit.io/testnet/transaction/OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ
- https://lora.algokit.io/testnet/transaction/4YLKLQKKWXXFW3UT5APJVYKXI7T7A6OACTAWCC5YBAN3XGOGHRVQ

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

# TC-057 — the composition proof: grant -> free status check -> paid call -> audit append.
# Idempotent: skips grant_access when a grant is already active. Each run appends one
# audit entry, so total_audit_entries increases by 1 per successful run.
cd /d/MedRail/api && API_BASE=http://localhost:4021 npx tsx scripts/e2e-consent-proof.ts
cat /d/MedRail/contracts/artifacts/e2e-consent-proof.json

# TC-058 — the G-01 impersonation attempt plus its control. Exits non-zero unless the
# attack is blocked AND the legitimate call succeeds. Creates one new grant per run
# (to a freshly generated third-party address) and one audit entry via the control leg.
cd /d/MedRail/api && API_BASE=http://localhost:4021 npx tsx scripts/verify-g01-fix.ts
cat /d/MedRail/contracts/artifacts/g01-verification.json

# §5.7 setup, step 1 — provision the INDEPENDENT agent wallet. Generates a keypair, funds it
# with 260,000 uALGO, opts it in to USDC ASA 10458941, and sends it a $1.00 float from the
# project's own wallet. Prints the mnemonic; save it to api/.env as AGENT_MNEMONIC.
# Writes contracts/artifacts/agent-wallet.json. TestNet play money throughout.
cd /d/MedRail/api && npx tsx scripts/provision-agent-wallet.ts

# §5.7 setup, step 2 — the PATIENT grants that agent access, signing with their own key and
# submitting straight to Algorand; the backend is not in the path. PATIENT_MNEMONIC (falls
# back to PROOF_MNEMONIC, then DEPLOYER_MNEMONIC). Append --revoke to reverse it.
cd /d/MedRail/api && npx tsx scripts/grant-consent.ts <agentAddress> records:summary

# §5.7 — the autonomous agent: discover -> decide -> pay -> free consent check -> paid gated call.
# NOT A TEST. Nothing asserts on the output; it exits non-zero only if a call throws.
# Spends $0.09 of TestNet USDC per run and appends one audit entry.
# Needs AGENT_MNEMONIC funded with USDC ASA 10458941 (the wallet from step 1 — it does fall
# back to PROOF_MNEMONIC, then DEPLOYER_MNEMONIC, and that fallback is what makes the run a
# self-payment), PATIENT_ADDRESS set to the granting patient, and an ALREADY ACTIVE grant
# from that patient to the agent on scope "records:summary" — the script checks the grant,
# it does not create one. Run step 2 first, or the agent will decline at step 4.
# Writes no artefact file: the evidence is the console output and the transaction ids.
cd /d/MedRail/api && API_BASE=http://localhost:4021 npx tsx scripts/agent-demo.ts
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

# CI scanning: `npm audit` IS present on both Node jobs; codeql/snyk/trivy/pip-audit,
# a coverage gate and an image build are all still absent (TC-202, TC-203, TC-204)
cd /d/MedRail && grep -nEi "audit|codeql|snyk|trivy|coverage|docker|pip-audit" .github/workflows/ci.yml

# .dockerignore now exists at both build roots (D-3 / SEC-015 closed)
cd /d/MedRail && find . -name ".dockerignore" -not -path "*/node_modules/*"
cd /d/MedRail && grep -c "" .dockerignore web/.dockerignore

# Neither Dockerfile uses `npm install` any more — both install from the lockfile (D-4)
cd /d/MedRail && grep -n "npm ci\|npm install" api/Dockerfile web/Dockerfile

# No .env tracked by git — the gitignore discipline is real (SEC-005)
cd /d/MedRail && git ls-files | grep -i "\.env"   # -> only .env.example entries

# @x402/extensions is now imported and wired, not merely declared (DOC-9 / G-17)
# -> api/src/x402.ts imports bazaarResourceServerExtension from @x402/extensions/bazaar
cd /d/MedRail && grep -rn "@x402/extensions" api/src web/lib web/components api/scripts ; echo "exit=$?"
```

---

## 8. Verdict

| Question | Answer |
|---|---|
| Do the tests that exist pass? | **Yes — 121/121, reproducibly.** |
| Does "121 passing" mean 121 behaviours are verified? | **No.** At least one test still runs directly over a live defect and asserts nothing about it (§3.4, measured). Assertion strength remains unmeasured — no mutation testing, no coverage. |
| Do the builds pass? | **Yes — API and web, typecheck and build, zero errors; both dependency audits clean.** |
| Is there real on-chain evidence? | **Yes** — a live, undeleted application; the lifecycle and funding transactions; two genuine facilitator-settled x402 payments (`/v1/triage` and `/v1/records/summary`); and five `log_access` appends. |
| Is the system's headline feature proven? | **Yes, on-chain.** `total_audit_entries = 5`; the full grant → pay → verify → append composition has executed against TestNet and its transaction ids are public (**E-1 closed**). |
| Is the consent gate proven to restrict access? | **Yes.** The payer is recovered from the payment signature and must equal `requesterAddress`; the impersonation was executed against the live deployment and rejected with a 403 while the control call returned 200 (§5.6, TC-110, TC-058). |
| Was a settled payment ever at risk on an error path? | **No — and it never was.** `@x402/hono` settles only on a sub-400 response, so REL-002 is satisfied structurally by the SDK. The 500 that G-03 described cost MedRail the sale, never the caller's money, and it is now degraded to `200 { auditStatus: "pending" }`. |
| Are consent-denied calls charged? | **No.** A 403 cancels settlement; the response says `charged: false` and points at the free status endpoint. The residual cost is MedRail's — one chain fee for the denial audit write — and is bounded by rate limiting. |
| Can a machine integrate without being told anything about MedRail? | **Yes — once, by hand.** `api/scripts/agent-demo.ts` discovered the catalogue from `GET /`, priced three calls out of that response, checked the free consent oracle before spending on the gated route, and paid **$0.09 across three settled Algorand transactions** with no account and no API key (§5.7). It is a **manual verification script, not an automated test**, it does not run in CI, and the API it called was a local process. |
| Has CI ever verified a commit? | **Yes** (**CI-1 / E-5 closed**) — `push` on `[main, master]`, `pull_request`, `workflow_dispatch`, with caching, dependency audits and an artifact-freshness gate. |
| Has either container image ever been built? | **No.** NFR-007 remains **UNVALIDATED** (**E-6**), though both Dockerfiles and `fly.toml` are now correct. |
| Is anything publicly hosted? | **No.** No public HTTPS endpoint, no MainNet deployment, no Bazaar listing. The agent run of §5.7 settles between independent accounts — the payer's keypair is not held by this service — but that agent's float was seeded from the project's own wallet, and **no external party has ever paid for this service**. |
| Can a coverage number be quoted? | **No** (**E-2**). |
| Can a latency or throughput number be quoted? | **No**, beyond two disclosed single observations (**E-3**). G-24 is open. |

The tests that exist are honest and they pass. Five defects that this document previously recorded as *argued* are now recorded as *pinned by a regression test that fails without the fix*, and the largest evidence gap in the project is closed with public transaction ids.

What is left is left, and it is worth naming rather than burying: no coverage measurement, no performance measurement, no mutation testing, no route-level test for `records.ts`, no concurrency test for the audit lock, no container image ever built, two rule-engine defects still open and unpinned, and two contract fixes that are correct in source and absent from the deployed bytecode by choice.
