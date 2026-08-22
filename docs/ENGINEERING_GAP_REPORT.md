# MedRail — Engineering Gap Report

**Purpose:** A prioritised, evidence-backed register of every material engineering gap found during
the 2026-08-21 architecture and security review, with the concrete fix for each.

**Status of this document:** Complete. Every finding below was independently reproduced by the
reviewer — by reading source, executing the test suites, running the API against a broken
dependency, or querying the public Algorand TestNet indexer. Nothing here is inferred from
documentation. Findings are stated with the evidence needed to verify or refute them.

**Method.** Full source read of `contracts/`, `api/`, `web/`, and `docs/`; both test suites
executed; all four builds executed; the deployed contract's global state, box inventory, account
balance, and five cited transactions re-verified against `testnet-idx.algonode.cloud`; the API
exercised against a deliberately unreachable facilitator and against malformed input; the two rule
engines executed directly against adversarial inputs; a dependency vulnerability scan run against
both npm packages; and the reference patch for the critical finding compile-checked against the
installed SDK.

**Count:** 37 findings — **25 CLOSED, 12 open** (counted by parsing the register below, not asserted).

Both CRITICAL findings are closed: **G-01** (the paying identity is now bound to the asserted
requester, proven by a live attack simulation) and **G-02** (the on-chain audit write executes, with
a repeatable proof script). Of the 12 that remain, **none is CRITICAL and none is HIGH** — G-05, the
last HIGH, closed on 2026-08-22 when direct tests for `records.ts` and `algorand.ts` took whole-suite
branch coverage from 40.65% to 65.85% and `src/services` to 93.18%.

Two contract defects (**G-12**, **G-20**) are fixed in source and covered by regression tests, with
the redeploy deliberately deferred so App `768743428` keeps its App ID and its on-chain history.

Two claims from the original review were **withdrawn** after further reading rather than quietly
dropped: the settlement-loss claim (§9) and the audit-race characterisation. **G-03** was downgraded
from HIGH to MEDIUM by the correction in §9. Six documentation defects found during the review are
listed in §5.

Unlike the first pass, this review did modify source: the fixes recorded against each CLOSED finding
are real commits, not recommendations.

---

## 1. Severity scale

| Severity | Meaning |
|---|---|
| **CRITICAL** | Defeats a core security or product guarantee the project claims. Fix before any public demo. |
| **HIGH** | Causes user-visible failure, loss of funds, or collapses a headline claim under questioning. |
| **MEDIUM** | Real defect with bounded blast radius, or a significant absence of engineering rigour. |
| **LOW** | Correctness or hygiene issue with small practical impact. |

Effort: **S** ≈ under 1 hour · **M** ≈ 1–4 hours · **L** ≈ 1–3 days.

---

## 2. The gap register

| # | Gap | Severity | Current state | Why it matters | Recommended fix | Effort |
|---|---|---|---|---|---|---|
| **G-01** | **Paying identity is never bound to the asserted requester identity** (finding S-1) | ~~CRITICAL~~ **CLOSED** | **CLOSED 2026-08-21.** `api/src/x402Payer.ts` recovers the payer from the verified `PAYMENT-SIGNATURE` header; `records.ts` rejects with 403 unless it equals `requesterAddress`. 6 unit tests (`api/test/x402Payer.spec.ts`) plus a **live attack simulation** (`api/scripts/verify-g01-fix.ts`) that grants a third party consent, pays as someone else, asserts the third party's address, and confirms the 403. Verified against TestNet: impersonation blocked, legitimate call still returns 200. <br><br>*Original finding:* `api/src/routes/records.ts:8-11` takes `requesterAddress` from the request body and passes it straight to `checkAccess`. Nothing ties it to whoever paid. | The consent gate — the product's entire thesis — provides no access control. **The discovery step is not theoretical: it was executed during this review** (see §8). A single unauthenticated indexer query against the deployed app recovers complete `(patient, requester, scope)` triples from the public `grant_access` transactions. An attacker pays the ordinary $0.05, asserts a recovered requester address, and `check_access` returns true — because that grant genuinely exists. With real PHI behind the endpoint this is a total authorisation bypass. It also writes a **false attribution** into the immutable audit log, which is worse than no log, because the record is trusted precisely for being on-chain. | Decode the `PAYMENT-SIGNATURE` header, recover the payer from the signed payment transaction, and reject unless it equals `requesterAddress`. Reference implementation in §4 — **compile-verified** against the installed SDK. | **S** |
| **G-02** | ~~The on-chain audit write has never executed on TestNet~~ **— RESOLVED 2026-08-21** | ~~CRITICAL~~ **CLOSED** | **Fixed during this review.** `total_audit_entries` is now **1**, and the app holds an `a`-prefixed audit-entry box (41 B) and an `s`-prefixed sequence box (33 B). The full composition ran end to end: `grant_access` (`M26NPR32…`) → `check_access` true → settled $0.05 x402 payment (`5DKFUULW…`) → `log_access` (`4YLKLQKK…`, sequence 1), returning `consentVerifiedOnChain: true`. | **Root cause was never a chain problem:** `log_access` has one caller (`records.ts`), reachable only with both a settled payment *and* a live grant — and no script reached it (`exercise_contract.py` stops at revoke; `e2e-proof.ts` pays only `/v1/triage`). | **Done.** A new repeatable script, `api/scripts/e2e-consent-proof.ts`, performs the grant and the paid gated call and writes `contracts/artifacts/e2e-consent-proof.json`. Evidence in [`PROOF.md`](PROOF.md) §9. | **— (done)** |
| **G-03** | **The consent-denied path is documented as charged, but is not — and it costs MedRail a fee to answer** (supersedes finding R-2) | ~~MEDIUM~~ **CLOSED** | **CLOSED 2026-08-21.** Kept the 403 and corrected the documents (your decision). `paidButDenied` removed; the response now carries `charged: false` plus a pointer to the free pre-flight. Success-path `logAccess` wrapped in `try/catch` so a chain failure degrades to `200` + `auditStatus: "pending"` instead of discarding a sale. `API.md` and `SECURITY.md` corrected. <br><br>*Original finding:* **Corrected during review — see §7.** `@x402/hono`'s middleware calls `processSettlement` **only when the handler returns a status below 400** (`node_modules/@x402/hono/dist/esm/index.mjs:203-232`): a throw triggers `cancellationDispatcher.cancel({reason:"handler_threw"})`, and any status ≥ 400 triggers `cancel({reason:"handler_failed"})` and returns before settlement. So `/v1/records/summary`'s 403 denial and any 500 both **cancel settlement — the caller is never charged.** Meanwhile the denied path submits a real `logAccess` transaction (`records.ts:37`) whose fee MedRail's operator account pays. | The economics are the exact inverse of what is documented. `docs/API.md` states "The fee is not taken at all when consent is absent - a 403 cancels settlement"; `docs/SECURITY.md` has a section headed "consent-denied calls are still charged"; and the 403 body returns `paidButDenied: true`. **None of that is true.** The caller pays nothing, and MedRail pays an Algorand fee to tell them no — a free, fee-burning endpoint any stranger can invoke. The original R-2 framing (a settled payment lost on a 500) was **wrong** and is withdrawn: the SDK structurally prevents it. | Decide the intended behaviour, then make code and docs agree. To genuinely charge for a denial, return `200` with a `granted: false` body (settlement then proceeds) rather than `403`. To keep `403`, correct `API.md`, `SECURITY.md`, and drop the misleading `paidButDenied` field. Separately, guard the success-path `logAccess` in `try/catch` so a chain failure degrades to `200` + `auditStatus: "pending"` rather than a 500 that silently voids a legitimate sale. | **S** |
| **G-04** | **A facilitator outage turns every priced endpoint into HTTP 500** (finding R-1) | ~~HIGH~~ **CLOSED** | **CLOSED 2026-08-21.** The payment middleware is wrapped so a facilitator-initialisation failure returns **503 + `Retry-After: 30`** with a stable `PAYMENT_FACILITATOR_UNAVAILABLE` code, instead of an opaque 500. Reproduced with `FACILITATOR_URL` pointed at a closed port; free routes verified unaffected. <br><br>*Original finding:* Reproduced: with `FACILITATOR_URL` pointed at a closed port, `POST /v1/triage` returns `500 {"error":"Failed to initialize: no supported payment kinds loaded from any facilitator."}` with **no `PAYMENT-REQUIRED` header**. Free routes were verified to still return 200, so blast radius is the three priced routes. | The 402 challenge cannot be constructed offline, because `accepts[].asset` and `extra.feePayer` come from the facilitator's `/supported`, not from MedRail's config. There is no timeout, retry, circuit breaker, or cached fallback. A calling agent sees an opaque server error rather than a retryable signal — and in a competition scored on payment volume, that is lost revenue during every upstream blip. This is also the mechanism behind the CI fragility in G-06. | Cache the `/supported` response at startup and persist it; on facilitator failure serve the 402 from the cached kinds. If no cache exists, return `503` with `Retry-After` and a clear error code instead of `500`. Add an explicit fetch timeout. | **M** |
| **G-05** | **The two highest-risk modules have zero test coverage** | ~~HIGH~~ **CLOSED** | **CLOSED 2026-08-22.** `api/test/records.spec.ts` (12 tests) drives the gated handler directly — payer/requester mismatch → 403 with no audit attempted, missing payment header → 403, consent denied → the `charged: false` denial body, audit failure → still 200 at `auditStatus: "pending"`, invalid addresses → 400. `api/test/algorandService.spec.ts` (26 tests) covers `checkAccess`, `getAuditCount`, `logAccess` box references, the per-patient lock's ordering, and the health sampler. Measured with `npm run coverage`: `src/services` **47.96% → 98.37%** statements and **50.0% → 93.18%** branches (`algorand.ts` 98.87%); `src/routes` **37.09% → 74.19%** statements and **9.09% → 63.63%** branches; whole suite **54.23% → 83.05%**. API tests went 18 → **93**. Neither spec touches the network. *Original finding:* No test exists for `api/src/routes/records.ts` or `api/src/services/algorand.ts`. All 18 API tests cover the two pure rule engines and the 402 response shape. | These two modules contain every piece of logic that can lose money, mis-authorise a caller, or corrupt the audit sequence — box-key derivation, `simulate` reads, read-then-write sequencing, `withPatientLock`, and the consent decision itself. The 32-test count is real, but it is concentrated where the risk is not. | Add: a payer-binding regression test for G-01; box-key derivation golden vectors shared across all three implementations (G-08); a `withPatientLock` concurrency test asserting N concurrent writes yield N distinct sequences; and records-route tests for the happy, denied, and audit-failure paths. | **M** |
| **G-06** | **CI has never run** (finding CI-1) | ~~HIGH~~ **CLOSED** | **CLOSED 2026-08-21.** `branches: [main, master]` plus `workflow_dispatch`. Dependency caching, `npm audit --audit-level=high` on both packages, and an artifact-freshness gate added. <br><br>*Original finding:* `.github/workflows/ci.yml:5` triggers on `push: branches: [main]`. The repository's only branch is `master`, with no PRs. | Every document cites CI as evidence of engineering discipline. The workflow is well-constructed and all three jobs pass locally — but no push has ever triggered it and none will. A judge who clicks the Actions tab finds nothing. | One-line fix: `branches: [main, master]`, or rename the branch. Then add dependency caching, `npm audit`/`pip-audit`, and a coverage upload. | **S** |
| **G-07** | **The committed production config is broken** (findings D-1, D-2) | ~~HIGH~~ **CLOSED** | **CLOSED 2026-08-21.** `fly.toml` now sets `NETWORK=testnet` and `CONSENT_APP_ID=768743428`, adds a `/v1/health` check, and pins `max_machines_running = 1`. Secrets documented as `fly secrets`, never committed. <br><br>*Original finding:* `api/fly.toml` hard-codes `NETWORK = "mainnet"` and sets no `CONSENT_APP_ID`. The API Dockerfile does not copy the deploy artifact that `api/src/config.ts:26-36` falls back on. And the fallback could not help even if it were copied: with `WORKDIR /app/api` the resolved path is `/app/contracts/artifacts/deploy_<network>.json`, and with `NETWORK=mainnet` that is **`deploy_mainnet.json` — a file that has never existed.** | A `fly deploy` today produces a service pointed at a network where `MedRailConsent` does not exist, with `consentAppId = 0`, so `requireConsentAppId()` throws and both `/v1/records/summary` and `/v1/consent/status` return 500. The one config file a reviewer will open to check deployment readiness is the one that would not work. | Set `NETWORK = "testnet"` and `CONSENT_APP_ID = "768743428"` in `[env]` until MainNet exists; document the MainNet cutover as an explicit override. Optionally copy the deploy artifact into the image. | **S** |
| **G-08** | **Three unsynchronised implementations of the same box-key derivation** (NFR-011) | ~~MEDIUM~~ **CLOSED** | **CLOSED 2026-08-21.** A shared golden-vector fixture (`api/test/fixtures/box-key-vectors.json`) is asserted by **both** `api/test/boxKeyParity.spec.ts` (Node + WebCrypto paths) and `contracts/tests/test_box_keys.py` (Python path), pinning all three implementations to identical bytes. <br><br>*Original finding:* The `sha256(patient‖requester‖scope)` key with prefix `g` is implemented independently in `contract.py:grant_key`, `api/src/services/algorand.ts:64-69`, and `web/lib/consent.ts:30-38` (the last using `crypto.subtle.digest`). No test compares them. | If any one drifts — a prefix change, a different concatenation order, a scope-encoding difference — consent lookups silently return `false` instead of erroring. The failure mode is "the patient's grant mysteriously doesn't work", which is the hardest class of bug to diagnose and the worst possible one to hit live on stage. | Add a shared golden-vector fixture (fixed patient, requester, scope → expected 33-byte key in hex) and assert it in all three languages. ~20 lines each. | **M** |
| **G-09** | **No rate limiting anywhere** (SEC-013) | ~~MEDIUM~~ **CLOSED** | **CLOSED 2026-08-21.** `api/src/rateLimit.ts` — fixed-window limiting on the free and refundable surface (60/min consent status, 30/min records and arc56), returning 429 with `Retry-After`. Priced happy paths are economically self-limiting and deliberately untouched. <br><br>*Original finding:* No rate-limit middleware in `api/src/app.ts`. `/v1/consent/status` is free, unauthenticated, and performs two sequential algod calls per request (`getTransactionParams` + `simulate`). | Two distinct abuses: exhausting the MedRail API, and using MedRail as an unwitting amplifier against public AlgoNode infrastructure. Neither costs the attacker anything. | Add per-IP rate limiting on the free routes. Priced routes are economically self-limiting, so scope the control to the unpaid surface. | **S** |
| **G-10** | **Malformed address returns 500 and leaks internal errors** (finding R-3, SEC-010/SEC-011) | ~~MEDIUM~~ **CLOSED** | **CLOSED 2026-08-21.** `api/src/validation.ts` adds checksum validation via `algosdk.isValidAddress` on all four address fields, so a malformed address is a 400. `app.onError` now logs the detail server-side with a `requestId` and returns a generic body — no internal exception text reaches callers. <br><br>*Original finding:* Reproduced: `GET /v1/consent/status?patient=AAAA…(58 chars)` returns `500 {"error":"wrong checksum for address"}`. zod validates length only (`.length(58)`); `algosdk.decodeAddress` then throws inside `grantBoxName`, and `app.ts:55-58` echoes `err.message` verbatim to an unauthenticated caller. | A client input error is reported as a server error, which corrupts error-rate monitoring and misleads integrators. Separately, echoing internal exception messages to anonymous callers is an information-disclosure pattern that will leak more as the codebase grows. | Add `.refine(algosdk.isValidAddress)` to all four address fields. Change `onError` to log the detail server-side and return a generic body with a stable error code. | **S** |
| **G-11** | **In-process lock contradicts the multi-machine deployment config** (REL-004, D-7) | **MEDIUM** | `withPatientLock` (`api/src/services/algorand.ts:123-138`) is an in-process promise chain. `api/fly.toml` sets `auto_start_machines = true` with `min_machines_running = 1` — a floor, not a ceiling. | `docs/SECURITY.md` correctly discloses that the lock protects only a single process; the deployment config then permits multiple processes. **Precise failure mode (corrected during review — see §7):** the *contract* already self-assigns the sequence (`contract.py:log_access` derives `next_seq` from its own `audit_seq` box), so a race cannot corrupt or misorder the audit log. The client-side `predictedSeq` is used only to populate the AVM **box-reference array**. A losing racer therefore declares the wrong box name, the AVM rejects the transaction, and on the success path that rejection becomes **G-03** — a settled payment lost to a 500. The impact is availability and revenue, not integrity. It remains the hard horizontal-scaling blocker. | Short term: pin to one machine and document it. Correct fix: **not** "move sequencing on-chain" (already there) — instead make the box reference resilient: retry once with a refreshed `getAuditCount` on a box-reference rejection, and/or declare a small window of candidate box names. Pair with G-03's guard so a rejection never consumes a payment. | **S** (pin) / **M** (retry) |
| **G-12** | **`request_access` emits its event with `patient` and `requester` swapped** (defect C-1) | ~~MEDIUM~~ **CLOSED** | **FIXED IN SOURCE 2026-08-21** (redeploy deliberately deferred). Argument order corrected in `contract.py`; `tests/test_consent.py::test_request_access_event_field_order` decodes the emitted ARC-28 log and asserts the address positions. Confirmed to fail against the old code. <br><br>*Original finding:* `contract.py` emits `AccessRequested(arc4.Address(Txn.sender), arc4.Address(patient), …)` while the struct is declared `patient, requester`. `Txn.sender` is the requester. | Any ARC-28 event consumer — an indexer, a subscriber, a future notification service — receives inverted data. The existing test asserts only that the counter incremented, never the event payload, which is why it survived. | Swap the two arguments and add a test asserting event field order. **Do not redeploy to ship it before the finals:** `deploy_testnet.py` uses `OnUpdate.AppendApp`, which creates a *new application* rather than updating in place, so a redeploy mints a new App ID and invalidates `768743428` everywhere it is cited. Fix in source; redeploy afterwards, bundled with C-2. | **S** (code) / **M** (redeploy, deferred) |
| **G-13** | **No `.dockerignore`; secrets sit in the build context** (D-3) | ~~MEDIUM~~ **CLOSED** | **CLOSED 2026-08-21.** `.dockerignore` added at the repo root and in `web/`, excluding `.env*`, `node_modules`, `.venv`, `.next`, `dist`, `.git`, and `docs`. <br><br>*Original finding:* No `.dockerignore` exists anywhere. `api/Dockerfile` builds from the repo root, so `api/.env` and `contracts/.env` — both containing live mnemonics — are inside the context sent to the daemon. | No secret lands in a published layer *today*, because the Dockerfile copies only explicit paths. The margin is one careless `COPY api/ ./api/` wide. It also ships `contracts/.venv/` and both `node_modules/` trees into every build. | Add a root `.dockerignore` and a `web/.dockerignore` excluding `.env*`, `node_modules`, `.venv`, `.next`, `dist`. | **S** |
| **G-14** | **Non-reproducible container builds** (D-4) | ~~MEDIUM~~ **CLOSED** | **CLOSED 2026-08-21.** Both Dockerfiles now use `npm ci` (and `npm ci --omit=dev` in the API runtime stage). <br><br>*Original finding:* Both Dockerfiles run `npm install` despite committed `package-lock.json` files that CI validates with `npm ci`. | The image can silently drift from the dependency set CI verified — the classic "works in CI, broken in prod" divergence, and a supply-chain weakness. | Change both to `npm ci` (and `npm ci --omit=dev` in the runtime stage). | **S** |
| **G-15** | **No observability of any kind** (OPS-002…OPS-005) | **MEDIUM** | The only logging is `console.log` at boot and `console.error(err)` in the error handler. No structured logs, no request IDs, no metrics, no tracing, no alerting. `/v1/health` exists but is wired to no probe (D-6). | The operator cannot answer: how many payments settled, how much revenue arrived at `payTo`, is the operator account about to run out of ALGO (which turns every paid records call into G-03), is the app account short of box MBR, is the facilitator degraded. G-03 in particular is *undetectable* without logs. | Add a request-id middleware and structured JSON logging with an explicit never-log list (mnemonics, `PAYMENT-SIGNATURE` contents, raw symptom text). Add a chain-native canary polling the operator balance and `total_audit_entries`. Wire a `HEALTHCHECK` to `/v1/health`. | **M** |
| **G-16** | **No dependency vulnerability scanning** (SEC-014) | ~~MEDIUM~~ **CLOSED** | **CLOSED 2026-08-21.** `npm audit --audit-level=high` added to both CI jobs. <br><br>*Original finding:* No `npm audit`, `pip-audit`, Dependabot, or CodeQL in the workflow. The reviewer ran the scan that CI does not — see G-27 for what it found. | The project pulls a large transitive tree (`@x402/*`, `algosdk`, `next`, `algokit-utils`, `puyapy`) and has no standing signal on known vulnerabilities. The absence is not theoretical: the first scan ever run against this repository returned a finding. | Add `npm audit --audit-level=high` and `pip-audit` steps; enable Dependabot. | **S** |
| **G-27** | **A high-severity advisory is shipping in the frontend's production dependency tree** | ~~MEDIUM~~ **CLOSED** | **CLOSED 2026-08-21.** `npm audit fix` run in both packages — both now report **0 vulnerabilities**. <br><br>*Original finding:* **Measured:** `npm audit` reports `nanoid@3.3.17` — [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8), *custom generators can loop indefinitely when size is zero*, severity **high** — in both packages. Dependency paths differ and the distinction matters: in `api/` it arrives only via `vitest → vite → postcss`, a **devDependency chain**, so it does **not** reach the runtime image (the Dockerfile's final stage installs with `--omit=dev`). In `web/` it arrives via `next@16.3.0 → postcss`, a **production dependency**, and `web/Dockerfile` copies the full `node_modules` into the runtime image, so it does ship. | Practical exploitability here is low — the vulnerable path is a build-time CSS toolchain reached through Next's own bundling, not something a caller can drive. But it is a real, currently-shipping high-severity advisory that no process in this repository would have surfaced, and it is exactly the class of finding a security-minded judge checks for with one command. | `npm audit fix` in both packages (the advisory reports a fix as available), then re-run and commit the updated lockfiles. Pair with G-16 so the next one is caught automatically. Adopting `output: "standalone"` in `web/next.config.ts` would additionally stop the runtime image carrying the full dev-inclusive tree. | **S** |
| **G-17** | **`@x402/extensions` is declared but never imported** (DOC-9) | ~~MEDIUM~~ **CLOSED** | **CLOSED 2026-08-22 by implementation.** The dependency is now imported and wired: `api/src/x402.ts:4-8` imports `bazaarResourceServerExtension` / `declareDiscoveryExtension` from the `@x402/extensions/bazaar` subpath, `api/src/x402.ts:50-52` registers the extension on the shared `x402ResourceServer`, and all three priced routes declare their real input/output shape (`api/src/app.ts:58-175`). A live 402 now carries `extensions.bazaar` with `info.input.method` enriched to `"POST"` — proof the extension's `enrichDeclaration` hook ran — plus the `x402-global-challenge` tag in both `resource.tags` and `accepts[].extra.tag`. Prices, paths and payment behaviour are unchanged; `npx tsc --noEmit` exits 0 and `npx vitest run` reports 53 passed (the prior 45 plus 8 new in `api/test/bazaar-discovery.spec.ts`). Full evidence, including the export inventory and the measurement showing 454/500 live catalogue records carry the tag in `accepts[].extra.tag` while 0/500 use `resource.tags`, is in [`05_API/Bazaar_Discovery.md`](05_API/Bazaar_Discovery.md). <br><br>*Original finding:* zero references across `api/src/`, `api/scripts/`, `web/`. Yet `docs/COMPLIANCE.md` cited this dependency as evidence that "the backend correctly implements Bazaar's discovery-extension schema". | An unused dependency presented as implemented functionality. A judge who greps for the import finds nothing, and the credibility cost lands on every *other* claim in that document. | Integrated properly rather than removed — the package genuinely provides a resource-server extension that works with the existing `paymentMiddleware` setup. **Note the residual:** listing on Bazaar is a side effect of one paid call against a *publicly reachable* URL, not a registration API, so MedRail will not appear in the catalogue until the deployment item in `COMPLIANCE.md` is done. | **S** |
| **G-18** | **`walletConnect.ts` is referenced but does not exist** (DOC-4) | ~~MEDIUM~~ **CLOSED** | `web/lib/demoWallet.ts:12` points at `lib/walletConnect.ts` for "production usage". `docs/IMPLEMENTATION_PLAN.md` §4 claims the real-wallet path "is also implemented, just not the one-click default". No such file exists; there is no wallet-connect integration anywhere in `web/`. | This is the one place where an otherwise scrupulously honest document overclaims, and a judge can falsify it in ten seconds. There is also a second-order inaccuracy: `docs/ARCHITECTURE.md` says adding a real wallet is "a signer-object change, not an architecture change." That holds for the **payment** path (`web/lib/x402Client.ts` takes a `ClientAvmSigner`), but **not** for the consent path — `web/lib/consent.ts` takes a `DemoWallet` and calls `algosdk.mnemonicToSecretKey(wallet.mnemonic)`, and a real wallet has no mnemonic to surrender. `grant_access`/`revoke_access` would need a genuine refactor. | Correct the comment and the plan text to say the real-wallet path is **NOT IMPLEMENTED**, and scope the "signer swap" claim to the payment path only. **Documentation corrected in this review; the `demoWallet.ts` comment and the `consent.ts` refactor remain for the team.** | **S** (docs) / **M** (refactor) |
| **G-19** | **A 647-line architecture doc for an unbuilt product sat in `docs/`** (DOC-1) | ~~MEDIUM~~ **CLOSED** | `docs/SENTINEL_ARCHITECTURE.md` (untracked) described "Sentinel Exchange" — a FastAPI engine, SQLite database, XGBoost forecasting, a contract-net auction, a second smart contract, five new frontend routes — none of which exists. It instructed "rewrite README around Sentinel Exchange". | A judge browsing `docs/` finds a detailed architecture for a system that does not exist, adjacent to documentation for one that does, and must then decide which documents to believe. This was the largest single credibility risk in the repository. | Relocated to `docs/future/SENTINEL_EXCHANGE_PROPOSAL.md` with a prominent **UNBUILT PROPOSAL — NOT IMPLEMENTED** banner enumerating exactly what is absent. **Corrected in this review.** | **S** |
| **G-28** | **The documented compile command writes artifacts to the wrong directory; the real build has an undocumented copy step; and CI never checks the result** | **MEDIUM** | **Reproduced end to end.** `puyapy` resolves `--out-dir` relative to the *source file*, so `python -m puyapy smart_contracts/consent/contract.py --out-dir artifacts` writes to `contracts/smart_contracts/consent/artifacts/` — not `contracts/artifacts/`, which is what `deploy_testnet.py` and the `/v1/consent/arc56` route read. The command appears verbatim at `README.md:142`, `docs/DEPLOYMENT.md:12`, `docs/PROOF.md:11`, and `.github/workflows/ci.yml:22`. **The committed artifacts prove a copy step happened:** `contracts/artifacts/MedRailConsent.approval.puya.map` declares `"sources": ["../contract.py"]`, which resolves correctly only from `smart_contracts/consent/artifacts/` — from where the file actually sits it points at a `contracts/contract.py` that does not exist. So the artifacts were compiled into the source-adjacent directory and copied across, and that copy is documented nowhere. | Three consequences. (a) A fresh clone following the Quickstart populates a directory nothing reads; it only appears to work because the artifacts are committed. (b) The committed source maps carry a path that is stale relative to their own location — harmless for deployment, but it means debugger/source-map tooling cannot resolve the source from the committed artifacts. (c) Most seriously, **CI compiles the contract but never compares the output to the committed ARC-56 spec**, so contract source and deployed spec can silently diverge — exactly how a fix to C-1 or C-2 could merge while the spec still describes the old contract. | Document the copy step (it is what actually reproduces the committed bytes), or better, point `deploy_testnet.py` and `app.ts` at `smart_contracts/consent/artifacts/` and drop the copy entirely — which also fixes the stale source-map path. **Do not simply switch to `--out-dir ../../artifacts`:** it targets the right directory but makes `puyapy` embed an absolute machine-specific path (`D:/MedRail/contracts/...`) in the source maps, breaking byte-reproducibility. Then add a CI step that recompiles and runs `git diff --exit-code contracts/artifacts/`. | **S** |
| **G-20** | **`GRANT_BOX_MBR` under-reports the true box cost** (defect C-2) | ~~LOW~~ **CLOSED** | **FIXED IN SOURCE 2026-08-21** (redeploy deferred). `GRANT_BOX_MBR = 2_500 + 400 * (33 + 17)` = 22,500. Two tests pin it to the protocol formula and to the on-chain observation; both fail against the old constant. <br><br>*Original finding:* `contract.py` computes `2500 + 400*(32+17) = 22100` µALGO. The BoxMap's 1-byte `key_prefix` counts toward the key length, so the real cost is `2500 + 400*(33+17) = 22500`. **Verified on-chain:** the app account reports `min-balance = 145000` with 2 boxes — 145000 − 100000 base = 45000 = 2 × 22500. | `get_grant_box_mbr()` is a public ABI method advertised as the value a backend can quote when sizing `fund_mbr`. A caller trusting it under-funds by 400 µALGO per box. Small in magnitude, but it is a wrong number in a method whose only purpose is to be a right number. | Change to `400 * (33 + 17)`. Requires a redeploy to take effect — bundle with C-1 and defer past the finals for the App-ID reason given in G-12. | **S** (code) |
| **G-21** | **Unanchored substring matching produces false positives** (AI-006) | **MEDIUM** | `interactionChecker.ts:44-45` matches with `m.includes(a) \|\| a.includes(m)` — symmetric and unanchored. **Measured by execution:** `checkInteractions(["a","b"])` returns `flagged: true` with **5 matches**; `checkInteractions(["in","as"])` returns 4, including `warfarin+aspirin` and `simvastatin+clarithromycin`. Worse, the existing test case "always includes a source citation and disclaimer" *calls* `checkInteractions(["a","b"])` and asserts only the disclaimer — the suite exercises the defect and never notices it. | A drug-interaction endpoint that fabricates major and contraindicated warnings from two-character input is a correctness problem in a clinical-adjacent context, and it is trivially reproducible by a judge at the keyboard. It is also a precise illustration of why the 32-test count overstates the assurance the suite provides. | Match on token boundaries, enforce a minimum token length, and add an explicit synonym/RxNorm map. Add a false-positive regression test. | **M** |
| **G-26** | **No negation handling in the triage scorer** (AI-006) | **MEDIUM** | **Measured by execution:** `scoreTriage("I have no chest pain")` returns `{"score":35,"band":"urgent","matchedFlags":["possible cardiac chest pain"]}`. Substring matching cannot distinguish assertion from denial. | A triage endpoint that escalates a *denied* symptom to `urgent` is the most quotable failure in the system and the first thing a curious judge will type. The disclaimer is a genuine mitigation and the harm is bounded — but the behaviour must be disclosed rather than discovered. | Short term: document it prominently in `09_Intelligence_Layer/Limitations.md` (done) and add a regression test pinning the current behaviour. Proper fix: negation-scope detection, or per-flag phrase patterns instead of bare substrings. | **M** |
| **G-30** | **`payTo` defaults to an empty string with no validation** | ~~MEDIUM~~ **CLOSED** | **CLOSED 2026-08-21.** `assertPayToConfigured()` runs at boot and refuses to start without a checksum-valid `PAY_TO_ADDRESS`, so the service can no longer silently advertise an empty payee. <br><br>*Original finding:* `api/src/config.ts:53` — `payToAddress: process.env.PAY_TO_ADDRESS ?? process.env.OPERATOR_ADDRESS ?? ""`. Nothing validates it at startup or at 402-construction time. | With neither variable set, the service starts happily and serves a `402` whose `accepts[0].payTo` is `""`. A caller's SDK then constructs a payment to an empty address. This is a silent misconfiguration on the one field that determines whether the project earns anything — and it is exactly the field most likely to be forgotten on a first deploy, where `fly.toml` correctly leaves it to secrets (G-07). | Fail fast at startup: validate `payToAddress` with `algosdk.isValidAddress` and refuse to boot without it. Three lines, and it converts a silent revenue-loss into an obvious boot error. | **S** |
| **G-31** | **`withdraw_excess` has no in-contract bound** | **LOW** | `contract.py::withdraw_excess` submits `itxn.Payment(receiver=admin, amount=amount, fee=0)` with no upper bound on `amount`; the only limit is the AVM's minimum-balance check at submission. The method is admin-only and that check is unit-tested — but only negatively (the successful path is untested, G-25). | Combined with G-31's sibling risk in SEC-012 (a single hot admin mnemonic), an attacker holding the operator key can drain the app account to its MBR floor in one transaction. The admin gate is the *only* control. This is a reasonable design for a hackathon build; it is worth stating that the contract itself imposes no ceiling, because "admin-only escape hatch" reads as more bounded than it is. | Optionally cap withdrawals or add a timelock. At minimum, document the unbounded semantics and test the successful path. | **S** |
| **G-32** | **`total_grants_active` does not mean what its name implies** | **LOW** | Nothing decrements the counter when a grant *expires* — only `revoke_access` does (`contract.py`). So it counts "grant boxes not yet revoked", not "currently valid grants". `get_grant` and `check_access` consequently disagree for an expired grant: the former returns a record with `status = GRANTED`, the latter returns `false`. | The API is unaffected, because it only ever calls `check_access` — which is the correct one. But the global counter is published on-chain and reads as a live metric; anyone building a dashboard on it would over-count. `get_grant`'s disagreement with `check_access` is a trap for any future integrator who reaches for the richer method. | Rename the counter, or document both semantics precisely in `04_Data/Data_Dictionary.md` (done). A counter that cannot see expiry cannot be fixed without an on-chain sweep, so documenting is the proportionate response. | **S** (docs) |
| **G-33** | **A redundant algod round-trip on the paid path** | **LOW** | `logAccess` (`api/src/services/algorand.ts`) calls `getAuditCount`, which itself calls `algod.getTransactionParams()` — a second fetch of parameters `logAccess` has already retrieved. | Two sequential network round-trips where one would do, on the endpoint that has Algorand latency in the caller's critical path already (PERF-004). Small, but it is on the money path and it compounds with `withPatientLock` serialising per patient. | Pass the already-fetched `suggestedParams` into `getAuditCount`, or inline the box read. | **S** |
| **G-34** | **The service index advertises 5 of 8 routes, omitting the two an integrator needs most** | ~~MEDIUM~~ **CLOSED** | **CLOSED 2026-08-21.** `GET /` now advertises all 8 routes with price and gate, plus the App ID, CAIP-2 network, ARC-56 spec URL, and x402 version. `api/test/app.spec.ts` asserts the list matches the mounted routes so it cannot drift again. <br><br>*Original finding:* `api/src/app.ts:71-84` — `GET /` lists `POST /v1/triage`, `POST /v1/interaction-check`, `POST /v1/records/summary`, `GET /v1/consent/status`, `GET /v1/health`. It omits **`/v1/consent/app-info`**, **`/v1/consent/arc56`**, and `/` itself. | `GET /` is the discovery surface — the first thing a third-party agent fetches. The two omitted routes are precisely the pair a third party needs to build its own ABI client against the contract without cloning this repository: `app-info` supplies the App ID and CAIP-2 network, `arc56` supplies the method signatures. Serving that spec is a deliberate design goal (FR-015), and the index that would lead anyone to it does not mention it. It is also a maintenance trap: the list is hand-maintained with nothing checking it against the mounted routes, and it is already out of step. | Derive the list from the router rather than hand-maintaining it, or at minimum add the three missing entries. Add a test asserting the advertised list equals the mounted route set — which also prevents the next drift. | **S** |
| **G-29** | **Dead configuration: `indexerServer` is declared but never used** | **LOW** | `api/src/config.ts:51` computes `indexerServer` from a per-network map, and **no module in `api/src` or `api/scripts` references it** (verified by grep). The running service never calls an indexer — all chain reads go through algod via `simulate`. | Harmless today, but it is configuration that implies a capability the service does not have. It also matters for dependency documentation: the AlgoNode **indexer** is a *verification-only* dependency used by humans and scripts checking the ledger, not a runtime dependency of the API. Documenting it as a runtime dependency would overstate the service's external coupling. | Remove the field, or wire it up if an indexer-backed read path is intended (it would be the natural home for the audit-log listing that box storage cannot serve — see `04_Data/Indexing_And_Query_Strategy.md`). | **S** |
| **G-22** | **`web/README.md` is unmodified `create-next-app` boilerplate** (DOC-7) | ~~LOW~~ **CLOSED** | Verified — it still says "bootstrapped with create-next-app" and links to the Next.js tutorial. | In a repository whose root README is carefully written, a default-template README is the visible seam where care ran out. | Replace with a short frontend-specific README. **Corrected in this review.** | **S** |
| **G-23** | **Stale details in `IMPLEMENTATION_PLAN.md`** (DOC-2, DOC-3, DOC-6) | ~~LOW~~ **CLOSED** | §1 lists "puya 0.6.0" while the project pins `puyapy==5.9.0`; §0/§2 call the gated endpoint `/v1/records/:patientId/summary` when it is `POST /v1/records/summary` with the patient in the body; §7 lists a `scripts/` directory that exists but is empty. | Small drifts, but this is the document other documents cite as their source of verified facts, so errors in it propagate. | Correct all three. **Corrected in this review.** | **S** |
| **G-24** | **No performance measurement of any kind** (PERF-002/003) | **LOW-MEDIUM** | No load test, no benchmark, no latency instrumentation, no tooling. The only data points are two single observations by the reviewer: 505 ms for a cold `/v1/consent/status`, ~15 ms for a warm 402. | The project makes no performance claims, which is the honest position — but it also cannot answer "how does this behave under load", and the structural bottleneck (an inline `await logAccess` putting Algorand confirmation latency on the paid response path, serialised per patient) is real and predictable. | Establish a latency budget, then measure with k6 or autocannon. Move the audit write off the response path. See `07_Testing/Performance_Validation.md`. | **M** |
| **G-25** | **`fund_mbr` untested; `withdraw_excess` has only a negative test** | **LOW** | `contracts/tests/test_consent.py` covers `withdraw_excess` rejection for a non-admin but never a successful withdrawal, and never exercises `fund_mbr` at all. | Two fund-handling methods with no positive-path coverage. `withdraw_excess` submits an inner payment with `fee=0`, which depends on fee pooling from the outer transaction — an untested assumption in a method that moves money. | Add positive-path tests for both, including the fee-pooling condition. | **S** |
| **G-35** | **`scripts/` and `test/` were never typechecked** | ~~MEDIUM~~ **CLOSED** | **CLOSED 2026-08-22.** New `api/tsconfig.all.json` (`noEmit`, `include: ["src", "scripts", "test"]`) and `npm run typecheck`; CI now runs that instead of `npx tsc --noEmit`. It immediately surfaced a real error in `test/boxKeyParity.spec.ts:112` (a `Uint8Array<ArrayBufferLike>` passed to `crypto.subtle.digest`, which wants a view over a plain `ArrayBuffer`), now fixed. | `api/tsconfig.json` sets `"include": ["src"]`, because that is all that ships. But `scripts/` is not scratch code — it produces the on-chain evidence this project is judged on, and `test/` is the safety net. Neither was ever compiled. A malformed string literal in `scripts/agent-demo.ts` survived a green `tsc --noEmit` and only failed at run time, which is exactly the class of error a typechecker exists to catch. | Add a second tsconfig that includes everything and emits nothing; point CI at it. | **S** |
| **G-36** | **No visibility into the two balances that keep the audit trail alive** | ~~MEDIUM~~ **CLOSED** | **CLOSED 2026-08-22.** `chainAccountHealth()` in `api/src/services/algorand.ts` reports operator spendable µALGO, application-account spendable µALGO, and a conservative `estimatedAuditWritesRemaining`, with a `warning` string below 20. Surfaced on `GET /v1/health` (30-second cache so Fly's health check does not hammer algod), and a chain outage sets `chainError` rather than failing liveness. Pinned by a test asserting exactly one of `chain`/`chainError` is populated. | `log_access` is signed by the operator, which pays the fee, while the audit box is stored under the application account, which pays the MBR. Either running dry stops audit writes — and the failure is invisible to the caller, because the paid call still returns 200 and silently degrades to `auditStatus: "pending"`. At the time this was written the operator held 101 µALGO-fees' worth of headroom: about 101 more audit writes. | Report both balances on the health endpoint so the condition is observable before a demo rather than after one. | **S** |
| **G-37** | **A paid call returned a spurious `402` once, and the cause is not established** | **LOW** | Observed 2026-08-22 running `api/scripts/verify-g01-fix.ts`: step 2 (the impersonation attack) was correctly rejected with 403, and step 3 — the legitimate control call, same payer — came back **402** with no settled transaction, making the script report `G-01 CLOSED: NO`. An identical call issued standalone seconds later returned 200. Re-running the whole script returned 200 for the control and `G-01 CLOSED: YES`. | A paid endpoint that intermittently refuses a valid payment is a bad failure on a live demo, and worse in production, where the caller sees a payment-required response for a payment they were willing to make. **The cause is not established and this entry deliberately does not guess one.** The obvious hypothesis — two identical transfers from one payer colliding on transaction ID — was tested and **refuted**: four identical paid calls (two concurrent, two sequential) all settled with distinct transaction IDs. That leaves a transient condition at the facilitator, or in the window between verify and settle, as the likeliest remaining explanation. Unconfirmed. | Reproduce under load before assigning a cause. The operational answer meanwhile is a retry: a 402 on a call the client intended to pay for is retryable, and `verify-g01-fix.ts` should say so rather than reporting a closed finding as re-opened on a single sample. | **M** |

---

## 3. Top 10 by Impact × Feasibility

Ranked by what most improves technical credibility per hour spent.

| Rank | Gap | Severity | Effort | Why it ranks here |
|---|---|---|---|---|
| **1** | **G-01** — bind payer to requester | CRITICAL | S | ~15 lines converts the project's biggest vulnerability into its strongest talking point. The reference patch below is compile-verified. Highest value-per-line change available. |
| **2** | **G-02** — execute `log_access` on TestNet once | CRITICAL | S | Minutes of work turns the headline mechanism from simulator-only into a checkable transaction ID. Nothing needs to be written — the code path exists. |
| **3** | **G-03** — guard the success-path audit write | HIGH | S | Stops the system consuming a settled payment and returning nothing. Three lines. |
| **4** | **G-06** — fix the CI branch trigger | HIGH | S | One line makes the CI evidence real instead of theoretical. |
| **5** | **G-07** — fix `fly.toml` defaults | HIGH | S | The deployment config a reviewer opens should not be one that cannot work. |
| **6** | **G-04** — graceful facilitator degradation | HIGH | M | Removes a hard third-party dependency from the demo's critical path and from CI. |
| **7** | **G-05** — test `records.ts` and `algorand.ts` | HIGH | M | Moves coverage to where the risk actually is; the G-01 regression test is part of this. |
| **8** | **G-08** — box-key golden vectors | MEDIUM | M | Cheap insurance against the worst-diagnosed failure mode in the system. |
| **9** | **G-10** — address validation + error hygiene | MEDIUM | S | Removes a 500-on-client-error and an information leak in one small change. |
| **10** | **G-15** — minimal observability | MEDIUM | M | Without it, G-03 is undetectable and operator-balance exhaustion is invisible until it breaks the demo. |

Gaps **G-17 through G-19, G-22, G-23** were documentation defects and have been **corrected during
this review** — see §5.

**G-21 and G-26** (rule-engine false positives and missing negation handling) sit just below the
top ten. They are genuine correctness defects and are trivially reproducible by a judge at a
keyboard — but the mitigation that matters before submission is *disclosure*, which is already
done in [`09_Intelligence_Layer/Limitations.md`](09_Intelligence_Layer/Limitations.md), rather than
a rewrite of the matching logic under time pressure.

---

## 4. Reference fix for G-01 (compile-verified)

This was written against the installed SDK and **type-checks cleanly** (`npx tsc --noEmit`, exit 0)
with the exact exports and payload shape confirmed present in `node_modules`:
`decodePaymentSignatureHeader` from `@x402/core/http`; `decodeTransaction` and
`getSenderFromTransaction` from `@x402/avm`; and `PaymentPayload.payload` carrying the AVM
`{ paymentGroup: string[], paymentIndex: number }` structure.

```ts
// api/src/x402Payer.ts  (new file)
import type { Context } from "hono";
import { decodePaymentSignatureHeader } from "@x402/core/http";
import { decodeTransaction, getSenderFromTransaction } from "@x402/avm";

interface ExactAvmPayloadV2 {
  paymentGroup: string[];
  paymentIndex: number;
}

/**
 * Recovers the address that actually signed the settled payment for this request.
 * Returns null when no payment header is present or the payload cannot be parsed —
 * callers must treat null as "unauthenticated", never as "trusted".
 */
export function payerFromRequest(c: Context): string | null {
  const header = c.req.header("PAYMENT-SIGNATURE");
  if (!header) return null;
  try {
    const decoded = decodePaymentSignatureHeader(header);
    const p = decoded.payload as unknown as ExactAvmPayloadV2;
    const raw = p.paymentGroup?.[p.paymentIndex];
    if (!raw) return null;
    return getSenderFromTransaction(decodeTransaction(raw), true);
  } catch {
    return null;
  }
}
```

Then in `api/src/routes/records.ts`, immediately after schema validation:

```ts
const payer = payerFromRequest(c);
if (!payer || payer !== requesterAddress) {
  return c.json(
    {
      error: "requesterAddress must match the address that signed the payment",
      requesterAddress,
      payer: payer ?? null,
    },
    403,
  );
}
```

**Why this is the right fix rather than a workaround.** It uses the payment itself as the
authentication mechanism, which is the property x402 already provides and MedRail was simply not
reading. No new credential, session, API key, or signature scheme is introduced. It also makes the
audit log truthful: the recorded requester becomes the party that provably paid, which is what the
"immutable on-chain audit trail" claim needs in order to mean anything.

**Test to add alongside it** (this is the regression test that matters most in the repository):
pay from address A while asserting `requesterAddress = B`, and assert `403`. Without that test the
fix can silently regress.

---

## 5. Documentation defects corrected during this review

| ID | Defect | Action taken |
|---|---|---|
| DOC-1 / G-19 | `SENTINEL_ARCHITECTURE.md` described an unbuilt product inside `docs/` | Relocated to `docs/future/SENTINEL_EXCHANGE_PROPOSAL.md` with an **UNBUILT PROPOSAL — NOT IMPLEMENTED** banner enumerating what is verifiably absent |
| DOC-2 / G-23 | `IMPLEMENTATION_PLAN.md` §1 listed compiler "puya 0.6.0" | Corrected to `puyapy 5.9.0`, matching `requirements-dev.txt` and `docs/PROOF.md` |
| DOC-3 / G-23 | `IMPLEMENTATION_PLAN.md` used the stale path `/v1/records/:patientId/summary` | Corrected to `POST /v1/records/summary` |
| DOC-4 / G-18 | `demoWallet.ts` and `IMPLEMENTATION_PLAN.md` §4 claimed a real-wallet path was implemented | Corrected to **NOT IMPLEMENTED**, noting `ClientAvmSigner` as the integration seam |
| DOC-6 / G-23 | `IMPLEMENTATION_PLAN.md` §7 listed a populated `scripts/` directory | Corrected to note it is empty |
| DOC-7 / G-22 | `web/README.md` was `create-next-app` boilerplate | Replaced with a frontend-specific README |
| DOC-8 | `ACTION_NEEDED.md` had an unbalanced backtick breaking markdown rendering | Fixed |
| DOC-9 / G-17 | `COMPLIANCE.md` cited `@x402/extensions` as implemented Bazaar discovery | Downgraded to describe route-metadata shape, noting the dependency is currently unused |
| DOC-5 | `ARCHITECTURE.md` "both categories write to the same audit log" | Clarified against the on-chain reality (`total_audit_entries = 5`) |

**No source code was modified during this review.** All findings against `contracts/`, `api/`, and
`web/` are reported here with their fixes for the team to apply and test. Documentation was
corrected because a document that contradicts the code is itself the defect.

---

## 6. What is genuinely strong

A gap report that lists only problems is as untrustworthy as one that lists none. The following
were verified and are real engineering strengths:

- **The deployment is real and independently checkable.** App `768743428`, created at round
  66088624, `deleted: false` — confirmed against the public indexer, not taken from the repo's own
  documentation. The five cited transactions all resolve, with the right method selectors.
- **The settled payments are real and correct in detail.** Transaction
  `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ`: `axfer`, asset `10458941`, amount
  `20000` base units — exactly $0.02 at 6 decimals — `fee: 0` via facilitator sponsorship,
  confirmed at round 66091768. The unit conversion was done by the SDK against the live
  facilitator, not hardcoded.
- **Payments now settle between distinct accounts.** `api/scripts/provision-agent-wallet.ts`
  creates an independent agent keypair this service does not control
  (`UYBTLPHS6APCXVBDPASQMUIQCEORDIR6EMTVMNSDPSVRSR5HEPKQ5GO4YQ`), `api/scripts/grant-consent.ts`
  has the patient grant *that* agent access (`IG4XEBTM…G7WUQ`, patient-signed, backend not in the
  path), and `api/scripts/agent-demo.ts` then pays from it — the indexer confirms sender ≠ receiver
  on `DOSKCNKJ…FYKIA` (round 66563930) and `COMJ3TQO…RK36A` (round 66563944), `fee: 0` on both.
  The honest limit is the other half of that sentence: the agent's TestNet USDC float was seeded
  from the project's own wallet, because TestNet USDC has no other practical source, so **no
  external or unrelated party has paid for this service.** The remaining gap is demand, not
  payment mechanics.
- **Patient key custody is correct.** `grant_access` and `revoke_access` are signed client-side in
  `web/lib/consent.ts`; there is no code path by which a patient key reaches the backend. This is
  the hardest thing to get right in a consent system and it is right.
- **On-chain authorisation is sound where it exists.** `log_access`, `set_admin`, and
  `withdraw_excess` all assert `Txn.sender == self.admin.value`, and the rejections are unit-tested.
- **The contract's consent state machine is carefully reasoned.** The `was_active_before` logic
  correctly keys the active-grant counter off prior *status* rather than prior *box existence* —
  a subtle distinction most implementations get wrong, and it is tested.
- **Secret hygiene is disciplined.** `git ls-files` confirms no `.env` is tracked; the gitignore
  covers every secret-bearing pattern including `*.mnemonic`.
- **The attack surface is genuinely small.** No database, no template rendering, no shell
  execution, no user-controlled file paths, no model in the decision path — so no SQL injection,
  no SSTI, no command injection, and no prompt-injection surface. This is a real architectural
  property, not an accident.
- **The deployed bytecode is provably this repository's source.** Verified in two steps during
  this review: `contract.py` compiles reproducibly to the committed artifacts, and those artifacts
  assemble via algod to bytecode **byte-identical** to the program deployed at App `768743428`
  (1404 base64 characters, exact match; algod compile hash
  `W4TMZHJOL7FIN5GIGJCWNB2HVI4C4WGVRDVY6BMUUOMWRFHMBJVSPZZ33U`). This was the one link in the
  evidence chain nothing in the repository had established, and it is the link every other on-chain
  claim depends on. Documented in [`PROOF.md`](PROOF.md) §7 with runnable commands.
- **The contract build is byte-reproducible.** Recompiling `contract.py` with `puyapy` 5.9.0
  produces approval TEAL, clear TEAL, the ARC-56 spec, and the source maps **byte-identical** to the
  committed artifacts (verified with `cmp` on all four). The spec the deploy script uses is
  provably the one in source — which is exactly the property that makes G-28's missing CI check
  cheap to add and worth adding.
- **Safety disclaimers are enforced as correctness properties**, asserted by tests rather than
  merely written in prose.
- **The existing documentation is unusually honest.** `docs/PROOF.md` gives a reproduction command
  for every claim; `docs/COMPLIANCE.md` carries an explicit "what this document does not claim"
  section; `docs/SECURITY.md` discloses the audit-race limitation and the facilitator trust model
  without being asked to. The defects in §5 are the exceptions in a body of work that is
  substantially more rigorous than its category norm — which is precisely why those few
  overclaims are worth correcting rather than tolerating.

---

## 7. Cross-references

- Requirement IDs and traceability: [`02_Requirements/Requirements_Traceability_Matrix.md`](02_Requirements/Requirements_Traceability_Matrix.md)
- Full gap analysis by requirement: [`02_Requirements/Requirements_Gap_Analysis.md`](02_Requirements/Requirements_Gap_Analysis.md)
- Threat model and the S-1 exploit chain: [`06_Security/Threat_Model.md`](06_Security/Threat_Model.md)
- Missing test cases (TC-100 onward): [`07_Testing/Test_Cases.md`](07_Testing/Test_Cases.md)
- Prioritised remediation sequence: [`WINNING_ROADMAP.md`](WINNING_ROADMAP.md)
- Judge-perspective assessment: [`11_Hackathon/Judge_Evaluation.md`](11_Hackathon/Judge_Evaluation.md)

---

## 7. Corrections made to this review

Recorded because a review that cannot correct itself is not a review.

**G-11 — the audit-sequence race was initially mischaracterised.** The first pass described it as a
risk of a corrupted or misordered audit log, and recommended moving sequence assignment on-chain.
Re-reading `contracts/smart_contracts/consent/contract.py:log_access` shows the contract **already**
self-assigns: it reads its own `audit_seq` box, computes `next_seq`, and writes both boxes itself.
Nothing trusts a caller-supplied sequence number.

The client-side `predictedSeq` in `api/src/services/algorand.ts:160-172` exists for a different
reason: Algorand requires every box a transaction touches to be declared in advance in the
transaction's box-reference array. The prediction populates that array. When two writers race, the
loser's declared box name does not match the box the contract goes on to write, and the AVM rejects
the transaction.

So the real failure mode is a **rejected transaction**, not a corrupted log — which is materially
safer than first stated, and changes the fix: the sequencing is already correct, and what needs
hardening is box-reference resilience plus G-03's guard so a rejection cannot consume a settled
payment. The severity stays MEDIUM; the reasoning behind it does not.

Credit: surfaced while cross-checking `ADR-009` against the contract source.

---

## 8. Demonstrated: the S-1 discovery step (executed 2026-08-21)

G-01 depends on an attacker being able to learn a valid `(patient, requester, scope)` triple. The
first pass of this review described that as *discoverable from public ledger data*. It was then
actually executed, against the live deployed application, with one unauthenticated request:

```bash
curl -s "https://testnet-idx.algonode.cloud/v2/transactions?application-id=768743428&limit=100"
```

Decoding the ARC-4 application arguments of every transaction whose method selector is
`8c3ad539` (`grant_access`) yields, directly and without inference:

- **patient** — the transaction `sender`, because `grant_access` uses `Txn.sender` as the patient identity
- **requester** — application argument 0, a raw 32-byte public key
- **scope** — application argument 1, an ARC-4 string

Two complete triples were recovered from the seven indexed application calls, both with scope
`records:summary` — the exact scope `/v1/records/summary` checks. The `grants` box key is a
sha256 digest, which hides the triple *in box storage*; it does nothing to hide the transaction
that created it.

**What this does and does not prove.** It proves the discovery step is trivial, unauthenticated,
and needs no privileged access — which is the part a reader might reasonably have doubted. It does
not constitute a completed exploit here, because both recovered grants were subsequently revoked
by `exercise_contract.py`, so `check_access` currently returns `false` for both. The attack
requires an *active* grant. That is a matter of the demo data's lifecycle, not of any control in
the system: nothing in `api/src/routes/records.ts` would have stopped it.

The corollary matters independently of G-01: **consent relationships on this contract are public
by construction.** Anyone can enumerate who has asked for access to whose records, and under what
scope. That is a privacy property of the design, not a bug in it — but it should be a deliberate,
documented choice rather than a surprise, and it is treated as one in
[`06_Security/Privacy.md`](06_Security/Privacy.md).

---

## 9. Second correction: the settlement model

**G-03 was originally reported as "a settled payment can be consumed without delivering
anything."** That was wrong, and it was wrong in the direction that matters — it overstated a risk.

Reading `@x402/hono`'s middleware (`node_modules/@x402/hono/dist/esm/index.mjs:203-232`) settles the
question structurally, independent of any facilitator behaviour:

```js
case "payment-verified":                    // verified, NOT yet settled
  try { await next(); }                     // run the route handler
  catch (error) { await cancellationDispatcher.cancel({reason: "handler_threw"}); throw error; }
  if (c.res.status >= 400) {                // any 4xx or 5xx
    await cancellationDispatcher.cancel({reason: "handler_failed"});
    return;                                 // <-- returns BEFORE processSettlement
  }
  ... await httpServer.processSettlement(...)   // only reached when status < 400
```

`processSettlement` — the call that actually moves money — is reachable only on a sub-400 response.
Verification and settlement are distinct phases, and MedRail's error paths all land in the phase
before money moves. **No error path in this system can consume a settled payment.** That is a
genuine and non-obvious strength of the x402 v2 design, and the project inherits it for free.

The finding that survives is the opposite one, and it is a documentation defect rather than a
money-loss defect: three documents and one response field assert that a consent-denied call is
still charged, and it is not. The real cost asymmetry runs the other way — MedRail's operator
account pays an Algorand transaction fee to write the `consent_denied` audit entry, on a call that
earns nothing.

**Also withdrawn on the same evidence:** the observation that a paid-but-malformed request loses
the payment. It returns 400, which cancels settlement identically.

Recorded here because the original claim appeared in an earlier draft of this report and in
[`WINNING_ROADMAP.md`](WINNING_ROADMAP.md); both have been corrected. A review that reports a
money-loss bug that does not exist is worse than one that misses a small finding.

---

## 10. Verification applied to this documentation set itself

Documentation that asserts rigour should be held to it. The following checks were run against the
`docs/` tree produced by this review:

| Check | Method | Result |
|---|---|---|
| Mermaid diagrams parse | Every ` ```mermaid ` block extracted and run through the real Mermaid v11 parser (`mermaid.parse()`) under jsdom | **66 diagrams, 66 parsed, 0 failures.** Two initially failed — a `;` inside sequence-diagram message text terminates the statement — and were fixed |
| OpenAPI specification validates | `yaml.safe_load` + structural check of paths and response codes | **Valid OpenAPI 3.1.0**, 8 paths, response codes matching the implementation route-by-route |
| Internal links resolve | Every relative markdown link resolved against the filesystem | All resolve |
| Canonical values consistent | App ID, USDC asset ids, prices, and test counts checked across every file | Consistent; the sole variant (`768743429`) is a deliberate illustration of a *successor* application in `08_Deployment/Rollback_Strategy.md` |
| Requirement IDs defined | Every `FR/NFR/SEC/PERF/REL/OPS/DATA/AI-###` citation checked against the frozen registry and its reserved extension blocks | No undefined IDs |
| No fabricated metrics | Automated scan for percentiles paired with durations, ML accuracy figures, throughput and capacity claims | None found |

The scan is not proof of correctness — it catches contradiction and fabrication patterns, not
misjudgement. But a documentation set that has never been mechanically checked is asserting its own
accuracy, and this one has been.

**Known defects in this documentation set, self-disclosed rather than hidden:**

- **`OPS-059` carries three different statement texts** across `08_Deployment/Deployment_Architecture.md:445`,
  `08_Deployment/CI_CD.md:614`, and `08_Deployment/Rollback_Strategy.md:408`. That is a genuine ID
  collision, not a cross-reference; one of the three must be made authoritative before the registry
  is reconciled.
- **`OPS-060` carries two different statuses** inside its own owning document
  (`10_Operations/Monitoring.md:297` heads the section **RECOMMENDED**; `:67` and `:377` both say
  **NOT IMPLEMENTED**).
- **There is no `OPS-058`** — the reserved block is not contiguous.
- **`FR-101` is defined twice** (`01_Product/Use_Cases.md` and `01_Product/Project_Vision.md`) with
  identical statement text but differing attribution.

All four are flagged in place by `02_Requirements/SRS.md` §14.1 and
`02_Requirements/Requirements_Traceability_Matrix.md` §6.2. They arose because sibling documents
allocated from reserved ID blocks in parallel without a shared lock — the predictable cost of
parallel authorship, and the reason the core registry was frozen up front. The frozen block
(`FR-001`…`AI-008`) has **no** collisions; only the extension blocks do.

**One further caveat, stated because it is the honest one:** the banner-stamped documents in §5 and the
correction notices in mean some documents still contain
superseded prose alongside a pointer to the correction. That is deliberate — rewriting thirty files
would erase the record that a correction happened — but it does mean a reader who skips the banner
can still encounter a stale claim. The banner is the mitigation; it is not a guarantee.
