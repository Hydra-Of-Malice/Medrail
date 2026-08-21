# MedRail — Adversarial Judge Evaluation

**Purpose:** an intentionally hostile, evidence-anchored assessment of MedRail as an entry to the Algorand Foundation Global x402 Challenge, written to surface everything a competent judge would find before they find it.

**Status of this document:** Reviewer assessment, **re-scored 2026-08-21 after the remediation pass**. Scores and weights below are **this reviewer's own**, not an official rubric. The four judging criteria referenced (real usage, use-case quality, technical execution, long-term potential) are taken from `docs/COMPLIANCE.md:31-33`; **the official rules were not independently re-fetched during this review**. No score, ranking, prize figure, competitor count, or official weighting is asserted anywhere in this document.

**What changed since the first pass.** The original review scored this entry **5.4 / 10** and led "why this could lose" with two findings: the consent gate did not authenticate its callers, and the on-chain audit write had never executed. Both are now closed, along with 20 others. The re-score is **6.6 / 10**. Every score below was reconsidered from the evidence, including the ones that did not move — and §4 has been rewritten around what actually remains, which is a shorter and more expensive list than the one it replaces.

Companion documents: [`../02_Requirements/Requirements_Gap_Analysis.md`](../02_Requirements/Requirements_Gap_Analysis.md), [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md), [`Winning_Strategy.md`](Winning_Strategy.md).

---

## 0. Finding IDs used throughout

Stable IDs, referenced by every document in this set. The ID column is unchanged so cross-references still resolve; the status column records where each one now stands.

| ID | One line | Status |
|---|---|---|
| **S-1** | `requesterAddress` was caller-asserted and never bound to the payer — the consent gate was not an access control. | **CLOSED** (G-01). `api/src/x402Payer.ts` recovers the payer from the verified payment signature; `records.ts` 403s on mismatch. Live attack rejected by `api/scripts/verify-g01-fix.ts`; 6 unit tests. |
| **E-1** | `log_access` had never executed on TestNet; `total_audit_entries == 5`, zero audit boxes. | **CLOSED** (G-02). `total_audit_entries = 5` on App `768743428`, confirmed against the public indexer. `api/scripts/e2e-consent-proof.ts` reproduces it. |
| **R-1** | Facilitator outage turned every priced route into HTTP 500 (no 402, no 503, no `Retry-After`). | **CLOSED** (G-04). `app.ts:69-105` converts exactly that condition into **503 + `Retry-After: 30`** with code `PAYMENT_FACILITATOR_UNAVAILABLE`. |
| **R-2** | "A settled payment can be consumed and the resource never delivered." | **WITHDRAWN — the finding was factually wrong.** `@x402/hono` calls `processSettlement` only when the handler returns status < 400; any throw or 4xx/5xx cancels instead. No error path in MedRail can consume a settled payment. Separately, the success-path `logAccess` is now guarded (see 1.9). |
| **R-3** | A 58-character-but-invalid address returned HTTP 500 and leaked the internal exception message. | **CLOSED** (G-10). `api/src/validation.ts` validates by checksum → 400; `app.onError` returns a generic body with a `requestId` and logs the detail server-side. |
| **R-4** | No timeout, retry, or circuit breaker on any algod call. | **OPEN.** |
| **C-1** | `request_access` emits its ARC-28 event with `patient` and `requester` swapped. | **FIXED IN SOURCE, REDEPLOY DEFERRED** (G-12). See the note below. |
| **C-2** | `GRANT_BOX_MBR` under-reports true box MBR by 400 µALGO per box. | **FIXED IN SOURCE, REDEPLOY DEFERRED** (G-20) — now `2_500 + 400 * (33 + 17)` = 22,500 µALGO. |
| **CI-1** | CI triggered on `main` only; the branch was `master`. CI had never run. | **CLOSED** (G-06). Triggers on `[main, master]`, pull requests, and `workflow_dispatch`; the branch is now `main`. |
| **D-1 / D-2** | `fly.toml` shipped `NETWORK = "mainnet"` with no `CONSENT_APP_ID`. | **CLOSED** (G-13). `testnet` + `CONSENT_APP_ID = "768743428"` + a `/v1/health` check. |
| **D-7** | `fly.toml` permitted >1 machine while the audit-sequence lock is in-process only. | **CLOSED** as a *config contradiction* — `max_machines_running = 1`, with the reason written into the file. The underlying single-machine constraint (G-11) is still open. |
| **DOC-1** | A 647-line architecture document for a different, unbuilt product sat in `docs/`. | **CLOSED.** Relocated to `docs/future/SENTINEL_EXCHANGE_PROPOSAL.md`, tracked in git, with an "UNBUILT PROPOSAL" banner. No copy remains at `docs/SENTINEL_ARCHITECTURE.md`. |
| **DOC-9** | "Implements Bazaar's discovery-extension schema" is unsupported — `@x402/extensions` is declared but imported nowhere. | **OPEN.** Still declared at `api/package.json:17`, still imported nowhere in `api/src/`. `COMPLIANCE.md:27` now carries an inline correction saying so, which is the honest half-measure. |
| **DOC-4** | `web/lib/demoWallet.ts:12` points at `lib/walletConnect.ts`, which does not exist. | **OPEN.** No wallet-connect code exists anywhere in `web/`. |

**The contract note, stated once and referenced throughout.** C-1 and C-2 are fixed in `contracts/contract.py` and covered by three regression tests in `contracts/tests/test_consent.py` that were verified to **fail** against the old code. They are **not live on-chain.** `deploy_testnet.py` uses `OnUpdate.AppendApp`, which mints a *new* application — so redeploying would replace App `768743428` and discard the on-chain history that is this submission's best evidence. The deployed app therefore still runs the pre-fix bytecode, by choice. Say it that way; it is a defensible trade and it collapses if you let a judge discover it.

---

## 1. Scores

Scale: 0 = absent/broken, 5 = credible hackathon work, 7 = notably above the field, 9–10 = would hold up outside a hackathon. Weights are this reviewer's, chosen to approximate the four criteria in `docs/COMPLIANCE.md`.

### 1.1 Problem significance — **7 / 10** (weight 8%)

Patient control over health-record access is a real, unsolved, socially consequential problem, and the specific framing — *consent as a queryable on-chain predicate rather than a checkbox inside a vendor's database* — is the right shape of the problem.

Deducted because the instantiation is thin. `api/src/routes/records.ts:17-23` returns one hard-coded `SYNTHETIC_RECORD` constant regardless of `patientId`; there is no patient datastore, no record ingestion, no encryption pipeline (`DATA-006` is **PLANNED**, no code). The system models the *permission* to see a record without modelling a record. That is a legitimate scoping decision for a hackathon and it is disclosed honestly in `docs/SECURITY.md`, but it caps how significant the demonstrated problem can be.

### 1.2 Innovation / novelty — **7 / 10** (weight 8%)

The genuinely novel contribution is not the consent registry — those are a well-trodden category — it is the **argued** endpoint split at `docs/ARCHITECTURE.md:30-46`: a consent-gated endpoint cannot generate payment volume by construction (one patient, one doctor, a handful of calls a year), so the entry deliberately carries two open endpoints that any stranger's agent can pay for in one round trip, sharing one on-chain trust layer with the gated one. Most teams will submit either a volume play or an ownership play. Submitting both with a written argument for why is unusual.

The second real idea is composing "you paid", "you are who you say you are", and "you were allowed" into a single call (`records.ts:41` then `records.ts:53` then `records.ts:84`). That is a genuinely new x402 pattern, and the middle step is the part worth explaining: **the payment is the authentication.** The signed payment transaction already carries a proven sender, so `payerFromRequest` recovers it from the verified `PAYMENT-SIGNATURE` header and the handler refuses to serve any `requesterAddress` that signature does not support. No API keys, no session tokens, no separate identity system — the x402 envelope was already carrying a cryptographic identity, and this endpoint is the one that uses it as one.

Raised from 6 because both ideas are now demonstrated rather than argued: the composition has run end to end on TestNet with a transaction id for each of its three on-chain touch points, and the authentication step is provable by an attack script that fails on purpose. Held to 7 because the "AI" half of the pitch contributes zero novelty, and because the pattern is demonstrated at a scale of exactly one operator.

### 1.3 Technical complexity — **6 / 10** (weight 8%)

Real, non-trivial on-chain work: ARC-4 contract with three `BoxMap`s and a sha256-derived 32-byte grant key (`contract.py:95-103`), a per-patient monotonic audit sequence implemented as read-then-write with predicted box keys (`contract.py:217-236` / `algorand.ts:146-178`), ARC-28 event emission, a committed ARC-56 spec served over HTTP (`app.ts:141-146`), readonly methods executed via `atc.simulate()` so consent reads cost nothing (`algorand.ts:80-100`), and a per-patient promise-chain lock for sequence collisions (`algorand.ts:129-140`).

Added since the first pass, and it is the most technically interesting piece in the API: `api/src/x402Payer.ts` decodes the verified `PAYMENT-SIGNATURE` header, reads the AVM `exact` payload (`{paymentGroup: string[], paymentIndex: number}`), and recovers the address that signed the payment transaction — turning a payment envelope into an identity assertion. Alongside it, `api/test/fixtures/box-key-vectors.json` is a shared golden-vector fixture asserted by **both** the Node/browser derivations (`api/test/boxKeyParity.spec.ts`) and the Python one (`contracts/tests/test_box_keys.py`), which is the only honest way to test three independent implementations of one hash.

Deducted honestly, and the reason is unchanged by any of the above: there is no database, no queue, no worker, no cache, no distributed component, no model. The system is a low four figures of substantive lines across three languages. It is *correctly-shaped* complexity, not *large* complexity, and the score reflects size as well as shape.

### 1.4 Engineering quality — **8 / 10** (weight 10%)

The best-scoring dimension after evidence quality, and the score is earned by things judges rarely see:

- Comments that record *why*, including a regression post-mortem: `app.ts:26-32` explains that a hand-maintained CORS `allowHeaders` allowlist previously drifted from what `@x402/fetch` sends and broke every paid call.
- `algorand.ts:16-19` explains why ABI methods are hand-constructed rather than parsed from ARC-56 (avoiding algosdk ARC-56-vs-ARC-4 parsing drift) — a decision with a stated cost.
- `contract.py:154-159` explains why the active-grant counter keys off prior *status*, not prior *existence*. That is the kind of subtle correctness detail most submissions get wrong silently.
- `x402.ts:8-10`: only the configured network is registered, so a testnet process cannot accept a mainnet-signed payment (`NFR-002`).
- Strict TypeScript, zero errors in both `api/` and `web/`; both build clean.

Raised from 7, for four specific things:

- **73 tests, up from 32** — 28 contract tests in the AVM simulator and 45 API tests. The additions target what was previously untested rather than what was easy: payer recovery (`x402Payer.spec.ts`, 6), the advertised-vs-mounted route set (`app.spec.ts`, 7), and cross-language box-key parity (`boxKeyParity.spec.ts`, 14, plus `contracts/tests/test_box_keys.py`).
- **The regression tests were verified to fail against the pre-fix code.** Three new cases in `contracts/tests/test_consent.py` pin C-1's event field order and C-2's MBR arithmetic, and each was run against the old implementation to confirm it goes red. A test that has never failed has not been shown to test anything.
- **`NFR-011` is now VALIDATED.** The three box-key derivations (`contract.py:96-98`, `algorand.ts:64-70`, `web/lib/consent.ts:25-33`) are pinned to one shared golden-vector fixture asserted from both toolchains, including the browser `crypto.subtle` path. A change to the `"g"` prefix or the hash input now breaks a test instead of breaking production silently.
- **The committed deployment config is now correct and self-explaining** (D-1, D-2, D-7 closed), CI actually runs (CI-1 closed), and `npm audit` reports **0 vulnerabilities** in both packages.

Still deducted, and these are what hold it below 9: the two contract fixes are in source and **not on the deployed app** (C-1, C-2 — deliberate, see §0); `api/src/services/algorand.ts`, the module with the box-key derivation, the lock and the two on-chain calls, still has **no dedicated unit-test file** (G-05); the frontend has **no automated tests of any kind**; `@x402/extensions` is still declared and imported nowhere (DOC-9); and the documented contract-compile command still writes artifacts to a different directory than the one consumers read from, with the reconciling copy step undocumented (G-28).

### 1.5 "AI" usage — **3 / 10** (weight 5%)

`api/src/services/triageScorer.ts` is substring matching over **11** hard-coded red-flag entries with fixed weights, summed and capped at 100, bucketed into four bands. `api/src/services/interactionChecker.ts` is bidirectional substring containment over a **14-row** JSON table. There is no model, no embedding, no training, no dataset, no evaluation harness, and no measured sensitivity or specificity (`AI-005`, **NOT IMPLEMENTED**).

The engineering is defensible — deterministic, inspectable, disclaimered, and unit-tested (13 of the 73 tests cover exactly these two functions). `AI-001` and `AI-002` are **VALIDATED**. `README.md` and `docs/JUDGES.md` have since been reworded to "clinical-intelligence endpoints", with `JUDGES.md` naming them as deterministic rule engines in its opening paragraph — which is the right fix and the more confident phrasing. **But `api/src/app.ts:152`, `web/app/layout.tsx:18` and `web/app/page.tsx:18` still say "AI intelligence endpoints"**, and the service index is the first thing an integrator fetches. The gap between that phrase and `str.includes()` is still the single easiest place for a judge to land a hit, and it is now a three-string fix.

**Three behaviours below were measured by executing the real modules on 2026-08-21, not inferred from reading the code.**

**Measured defect 1 — negation is not handled at all.** `scoreTriage("I have no chest pain")` returns:

```json
{"score":35,"band":"urgent","matchedFlags":["possible cardiac chest pain"]}
```

A patient explicitly reporting the *absence* of chest pain is scored **urgent**. This is the most quotable safety limitation in the system, it takes one sentence to demonstrate, and a judge can type it into the demo box on your own laptop. Substring matching has no notion of polarity, so `"no chest pain"`, `"denies chest pain"` and `"ruled out chest pain"` all score identically to `"chest pain"`.

**Measured defect 2 — short tokens produce spurious severe warnings, worse than a code read suggests** (`AI-006`, **NOT IMPLEMENTED**). The containment test at `interactionChecker.ts:38-52` is unanchored and symmetric (`m.includes(a) || a.includes(m)`). Measured:

- `checkInteractions(["a","b"])` → `flagged: true`, **5 matches**.
- `checkInteractions(["in","as"])` → **4 matches**, including `warfarin + aspirin`, `simvastatin + clarithromycin`, `simvastatin + erythromycin`, and `metformin + iodinated contrast` — a mix of `major` and `contraindicated` severities, from two two-letter strings.

**Measured defect 3 — a test that executes the bug and asserts nothing about it.** This is the most damaging of the three, because it is a finding about the *test suite*, not the code. `api/test/interactionChecker.spec.ts`, case *"always includes a source citation and disclaimer"*, literally calls `checkInteractions(["a","b"])` and then asserts only `result.source.length > 0` and the disclaimer text. **The suite therefore executes a call that produces five spurious major/contraindicated interaction warnings, on every CI run, and never asserts on them.** The 13 rule-engine tests are real tests, but this one is a concrete, verifiable instance of behavioural coverage that *looks* like validation and is not — and it is the exact kind of thing a judge finds when they open the one test file whose name suggests it covers the risky path.

Credit where due: `scoreTriage("Sudden chest pain and shortness of breath")` returns score **70**, band `emergency`, flags `["possible cardiac chest pain","respiratory distress"]` — 35 + 35 = 70, and **byte-identical** to the response body recorded in `contracts/artifacts/e2e-proof.json` from the real settled payment. The happy path is genuinely evidenced end to end, from the rule table through the paid call to the ledger.

### 1.6 Scalability — **4 / 10** (weight 5%)

Audit writes serialise through `withPatientLock` (`algorand.ts:129-140`), an **in-process** `Map<string, Promise>`. The deployment config no longer contradicts that: `api/fly.toml` now sets `max_machines_running = 1` with the reason written into the file, so D-7 is closed as a *documentation-versus-config* defect. What it is not is a scaling story — it is a correctness-preserving cap, and the honest statement is that this service is pinned to one machine until the lock moves on-chain or into shared state (G-11, open).

Rate limiting now exists (`api/src/rateLimit.ts`, `SEC-013` **IMPLEMENTED**): fixed-window, in-memory, 60/min on `/v1/consent/status`, 30/min on `/v1/consent/arc56` and `/v1/records/summary`, returning 429 with `Retry-After`. It is scoped deliberately to the surface that is free to the caller — the priced happy paths are economically self-limiting, and a consent-denied 403 cancels settlement, so it costs the caller nothing while costing MedRail a chain fee. The limiter's own header comment concedes its two limits: it is per-process, so behind more than one instance it becomes per-instance; and the client key comes from `X-Forwarded-For`, which a direct caller can spoof. It is a courtesy guard, not a security boundary, and it says so.

Still absent: no caching, no connection pooling, no timeouts, retries or circuit breakers on any algod call (R-4), and **no load test of any kind — no latency, throughput, or concurrency number exists anywhere in the repository** (`PERF-003` **NOT IMPLEMENTED**, G-24 open). Every audit write also funnels through one operator account, a global serialisation point regardless of instance count.

Raised only from 3 to 4. Rate limiting and a coherent single-machine posture are real improvements; a dimension called scalability cannot score well when the deployment is deliberately capped at one machine and no performance figure has ever been measured.

### 1.7 Security — **7 / 10** (weight 12%)

**This is the largest movement in the re-score, from 3, and the reason is that the front door now locks.** S-1 was the entire deduction; it is closed, and five of the six findings listed beside it are closed too.

**The control, and why it is the interesting kind.** `api/src/x402Payer.ts` exports `payerFromRequest(c)`: it decodes the *verified* `PAYMENT-SIGNATURE` header, reads the AVM `exact` payload (`{paymentGroup, paymentIndex}`), and recovers the address that signed the payment transaction via `getSenderFromTransaction`. `api/src/routes/records.ts:41-51` then refuses to proceed unless that address equals the asserted `requesterAddress`:

```json
{"error":"requesterAddress must match the address that signed the payment",
 "requesterAddress":"NHUPYHPA…","payer":"2WDV2J2F…"}
```

returned with **403**, before `checkAccess` is called and before anything is written to the ledger. The design point worth saying out loud: **the payment is the authentication.** The x402 envelope was already carrying a cryptographically proven sender; this endpoint is the one that treats it as an identity rather than as a receipt. No API keys, no bearer tokens, no separate identity system, nothing to rotate.

**It is verified by attack, not by assertion.** `api/scripts/verify-g01-fix.ts` runs the exact original exploit against the live TestNet deployment: the patient grants consent to a third party, the attacker pays with their own key and asserts the third party's address, and the call is refused — then a control call with a matching payer succeeds, so the rejection cannot be dismissed as "the endpoint is simply broken". The run is recorded in `contracts/artifacts/g01-verification.json` (`"blocked": true`, `"result": "CLOSED"`). Six unit tests in `api/test/x402Payer.spec.ts` cover the decoding path. `SEC-008` is **IMPLEMENTED**.

Also closed since the first pass: `SEC-010` (addresses validated by checksum in `api/src/validation.ts` — a 58-character non-address is now a 400, not a 500); `SEC-011` (`app.onError` logs the message and stack server-side against a generated `requestId` and returns a fixed `INTERNAL_ERROR` body); `SEC-013` (rate limiting, §1.6); `SEC-014` (`npm audit --audit-level=high` in CI, and `npm audit` currently reports **0 vulnerabilities** in both packages); `SEC-015` (`.dockerignore` added at the repo root and in `web/`, so `api/.env` and `contracts/.env` are no longer inside the build context). The service also now refuses to boot without a checksum-valid `PAY_TO_ADDRESS` (`config.ts::assertPayToConfigured`), which turns a silently-misconfigured deployment into a startup failure.

Credited, and unchanged: no patient private key ever reaches the backend — `grant_access`/`revoke_access` are signed client-side in `web/lib/consent.ts:41-60` and submitted straight to AlgoNode (`NFR-008` **IMPLEMENTED**). `log_access` and `withdraw_excess` are admin-gated on-chain (`contract.py:222`, `contract.py:258`) with both rejection paths unit-tested (`SEC-001`, `SEC-002` **VALIDATED**). No PHI reaches the ledger (`SEC-004`). No `.env` is tracked by git (`SEC-005` **VALIDATED**).

**What holds this at 7 rather than 9,** stated plainly because a strong score is worth less than a specific one:

- **`SEC-012` is open and it is the biggest one.** A single hot `OPERATOR_MNEMONIC` sits in an environment variable and is *simultaneously* the contract admin. Compromise means forged audit entries, `set_admin` lockout, and a `withdraw_excess` drain. No multisig, no HSM, no rotation runbook, no key ceremony.
- **`withdraw_excess` is unbounded in-contract** (G-31) and its positive path is untested (G-25).
- **No observability** (G-15). There is no metric, no trace, no alert. An attack, a rate-limit storm, or a drained operator account would be discovered by a user complaining, and the rate limiter's own state is in-process memory that vanishes on restart.
- **The deployed app runs pre-fix bytecode** (C-1, C-2). Neither defect is exploitable — one is an event field order, one is an MBR under-estimate — but "the source is fixed" and "the chain is fixed" are different sentences.
- **No security review by anyone but this reviewer**, no threat model exercised against a live adversary beyond the one scripted attack, and no penetration testing. One verified control is not a security posture.

### 1.8 UX — **6 / 10** (weight 5%)

One route (`web/app/page.tsx`), dark, dense, and honest. A visitor with no wallet gets a browser-generated TestNet keypair and can attempt a real payment in two clicks (`web/lib/demoWallet.ts`). Settled transactions render as clickable Lora links (`LiveDemoPanel.tsx:154-163`). The failure path is explained rather than hidden: `LiveDemoPanel.tsx:165-170` tells the user that a real payment *was* constructed and signed and that settlement was rejected for want of TestNet USDC, with a dispenser link. That is better failure UX than most production software.

Deducted: the mnemonic is stored as plaintext JSON in `sessionStorage` (bounded to play money, disclosed in the UI, but any XSS on the page exfiltrates it); there is no wallet-connect path at all (DOC-4, still open — `web/lib/walletConnect.ts` is referenced in a comment and does not exist); and the consent panel still demonstrates self-granting only (`ConsentChecker.tsx:32` — wallet address as both patient and requester). That last one has changed meaning rather than gone away: it used to be the configuration that *hid* S-1, and it is now the configuration that fails to *show off* the control that replaced it. The payer-binding rejection is the best beat this project has, and the web UI is the one surface that cannot demonstrate it.

### 1.9 Reliability — **7 / 10** (weight 7%)

Of the four single points of failure in the first pass, two are closed, one was a wrong finding, and one is open.

- **R-1 — CLOSED.** With the facilitator unreachable, `x402ResourceServer.initialize()` still fails — that part is structural, since `accepts[].asset` and `extra.feePayer` come from the facilitator's `/supported` (`x402.ts:16-32` deliberately omits `asset`) and the 402 genuinely cannot be constructed offline. What changed is the answer the caller gets. `app.ts:69-105` catches exactly that condition and returns **503 with `Retry-After: 30`** and a stable code:

  ```json
  {"error":{"code":"PAYMENT_FACILITATOR_UNAVAILABLE","message":"…","retryable":true,"facilitator":"…"}}
  ```

  Every other error is re-thrown untouched, and free routes are unaffected. The difference matters most to exactly the caller this project is built for: an autonomous agent reads `retryable: true` plus a `Retry-After` and comes back; it reads an opaque 500 and marks the endpoint dead. `REL-001` **IMPLEMENTED**.

- **R-2 — WITHDRAWN. The original finding was wrong, and the truth is better than the fix would have been.** `@x402/hono` calls `processSettlement` **only** when the handler returns a status below 400; any throw or any 4xx/5xx triggers `cancellationDispatcher.cancel(...)` and returns before settlement. **No error path in MedRail can consume a settled payment** — not an audit-write failure, not a validation error, not a 403 denial, not an unhandled exception. `REL-002` is **VALIDATED, satisfied by the SDK**, and it belongs in the credit column as an inherited strength of x402 v2 rather than being quietly dropped.

  The related defect was real and is fixed. `records.ts:76-100` now wraps the success-path `logAccess` in `try/catch`: on failure the caller still receives the record, with `auditStatus: "pending"` and null `auditTxId`/`auditSequence`, and the service emits a structured `audit_write_failed` event. What the unguarded version lost was never the caller's money — settlement was cancelled along with the 500 — it was the **sale**, and a legitimate paid request the caller was entitled to.

- **R-3 — CLOSED.** `api/src/validation.ts` validates addresses by checksum via `algosdk.isValidAddress`, so a 58-character non-address is a 400 with field-level detail. `app.onError` no longer echoes `err.message`.

- **R-4 — OPEN.** `algorand.ts:5` is still `new algosdk.Algodv2("", config.algodServer, "")` — no timeout, no retry, no circuit breaker; `atc.execute(algod, 4)` at `algorand.ts:175` waits four rounds and throws. One AlgoNode blip is still a user-visible failure on the consent and records paths.

Credited: `REL-005` is **VALIDATED** — free endpoints stay up with the facilitator down, so blast radius is bounded to the priced routes. `GET /v1/health` exists and `api/fly.toml` wires it as the platform health check.

Held at 7 rather than higher by R-4, by the absence of any observability that would detect a degradation before a user reports it (G-15, open), and by the plain fact that none of this has been exercised under load or over time — the service has never run anywhere but a laptop.

### 1.10 Demonstrability — **8 / 10** (weight 10%)

What can be shown live, right now, and checked by a judge on their own laptop against public infrastructure:

- App **768743428**, created round **66088624**, `deleted: false`, verified against `testnet-idx.algonode.cloud`. Not a screenshot.
- A settled x402 payment: `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ`, `axfer`, asset `10458941`, amount **20000** base units, confirmed round **66091768**, `fee: 0`.
- A full consent lifecycle as four real transactions (`5XIADMCG…`, `X2BQ5FD4…`, `OV2J2T5V…`, plus funding `KYH3H5CG…`).
- A live 402 with a decodable `PAYMENT-REQUIRED` header carrying the real asset id and real fee-payer address.
- **The flagship path, end to end, with a transaction id at every step.** `api/scripts/e2e-consent-proof.ts` performs grant → free consent check → paid call → on-chain audit append in one run and writes `contracts/artifacts/e2e-consent-proof.json`: grant `M26NPR32…`, settled payment `5DKFUULW…`, audit `4YLKLQKK…`, `auditSequence: "1"`, `httpStatus: 200`. It is repeatable, not a one-off recording.
- **The on-chain audit log, non-empty.** `total_audit_entries = 5` and `total_grants_active = 4` on App `768743428`, readable in one `curl` against the public indexer. The differentiator now has a counter a judge can watch increment.
- **An attack being rejected.** `api/scripts/verify-g01-fix.ts` grants a third party consent, pays as someone else, and gets a 403 — then a control call returns the record. Showing a security control refuse a live exploit is a fundamentally different demo beat from showing a feature work, and almost no competing entry will have one.
- **Source-to-chain verification.** The deployed approval program is byte-identical to the compilation of the committed TEAL (algod compile hash `W4TMZHJOL7FIN5GIGJCWNB2HVI4C4WGVRDVY6BMUUOMWRFHMBJVSPZZ33U`, 1404 base64 characters, exact match against the indexer). A judge can confirm the code they are reading is the code that is running.

**The two points that remain deducted are one thing and it has not moved: nothing is publicly hosted.** There is no URL a judge can hit without cloning the repository and running processes locally. Every demonstration above requires the team's laptop to be alive, which is precisely the dependency the evidence discipline everywhere else in this submission is designed to remove. It also caps the *"real usage"* criterion at zero by construction, since nobody else can call an endpoint that does not exist on the internet. Closing this — `docs/08_Deployment/GO_LIVE_RUNBOOK.md` is written for it — is the single highest-value action left.

### 1.11 Business potential — **4 / 10** (weight 6%)

$0.02 per call for keyword matching over 11 rules has no moat and no pricing power; the same function is a free npm package. The asset with actual commercial value is the consent registry plus the audit trail — a neutral, patient-signed, queryable permission substrate that a health system could point at without trusting MedRail. That is a real thing to sell, and it now *works*: the gate authenticates, the audit trail has entries, and the whole composition is reproducible from a script. But it is monetised at $0.05 per read, which is the wrong revenue model for it — the value is in being the registry of record, not in charging per lookup.

Unmoved from 4, and the reason is worth stating precisely because the technology improved and the score did not. **The cap on this dimension is demand evidence, not capability.** No customer, no pilot, no letter of intent, no MainNet, no distribution channel, no Bazaar listing, and every payment to date is a self-payment from the project's own account. Fixing the front door does not produce a buyer. This score moves when someone else pays, not when the code gets better.

### 1.12 Social impact — **6 / 10** (weight 4%)

The thesis — patients hold a revocable, publicly-auditable key to their own records, and every access leaves a trail the patient can read without asking permission — is genuinely worth building, and the architecture supports it rather than gesturing at it (`SEC-003` **VALIDATED**: only `Txn.sender` can grant or revoke on their own behalf; `contract.py:149-151`, `contract.py:179-181`).

Raised to 6 because the audit trail that carries most of the social value now exists on-chain — five entries a patient could read without asking anyone's permission — and because the access it records is attributed to an address that actually proved it was that address. An audit trail that anyone could write a false name into was worth considerably less than the pitch claimed; that is no longer the situation.

Held to 6 because nothing here has touched a real patient, a clinician, a health system, or a regulator; because there is no clinical validation and none is claimed; and because the triage engine's documented failure modes (negation scored as urgency, no synonyms, English only) point in the harmful direction for exactly the population a health tool most needs to serve well.

### 1.13 Competitive differentiation — **7 / 10** (weight 6%)

Against the field this entry is likely to face, three things stand out: an argued rather than assumed endpoint strategy (`docs/ARCHITECTURE.md:30-46`); off-the-shelf x402 client compatibility as a *defended* decision rather than an accident (`docs/ARCHITECTURE.md:95-108` explains why `log_access` is deliberately not bundled into the client's signed payment group — bundling would require every caller to know MedRail's app id and method signature and would break `@x402/fetch` compatibility); and a compliance document that contains a "What this document does not claim" section (`docs/COMPLIANCE.md:68-75`).

A fourth now belongs on that list: **the composition is executable in front of the judge, including its failure mode.** The consent gate authenticates, the audit append has run, and `verify-g01-fix.ts` will refuse a live impersonation attempt on stage. Differentiation you can only describe is worth roughly half of differentiation you can execute — and this moved from the first category to the second.

Held to 7 rather than higher because the whole demonstration still runs on the team's laptop, and because nobody outside the team has ever exercised any of it. A differentiator no third party has touched is a claim about the future.

### 1.14 Evidence quality — **9 / 10** (weight 6%)

The highest score here, and it is deserved. `docs/PROOF.md` gives a reproduction command for essentially every claim it makes, then independently re-verifies the result against the public indexer rather than trusting the deploy script or the facilitator response (`PROOF.md:95-99`, `PROOF.md:132-141`). `PROOF.md:143-147` volunteers that the settled payment was a self-payment before anyone asks. `COMPLIANCE.md` distinguishes "✅ Done" from "⏳ Pending — user action" line by line and states plainly that no MainNet transaction has been made and none will be. This is materially rarer and more valuable than teams realise; it converts every other claim in the repository from assertion into checkable fact.

Raised from 8, because the one category of claim that was previously unevidenced now is, and because two new artefacts raise the standard rather than merely meeting it:

- **E-1 is closed.** `FR-012` and `FR-025` are now **VALIDATED on-chain**: `total_audit_entries = 5`, `total_grants_active = 4`, readable from any public indexer, with `contracts/artifacts/e2e-consent-proof.json` giving the transaction id for the grant, the payment and the audit append of a single run — and `api/scripts/e2e-consent-proof.ts` regenerating all three on demand.
- **Source-to-chain verification.** The deployed approval program was compiled from the committed TEAL and confirmed byte-identical against the indexer (compile hash `W4TMZHJOL7FIN5GIGJCWNB2HVI4C4WGVRDVY6BMUUOMWRFHMBJVSPZZ33U`, 1404 base64 characters). Most submissions ask a judge to assume the deployed app matches the repository. This one closes the loop — and then volunteers the caveat that this pins the *deployed* bytecode to the *committed artifacts*, which predate the C-1/C-2 source fixes.
- **A finding was retracted rather than quietly deleted.** R-2 was investigated, proven wrong against the SDK source, and is recorded as withdrawn with the reason. Retracting your own finding is the same discipline as publishing it.

Held at 9, not 10, by two documentation overclaims that survive and are each findable in under a minute:

- **DOC-9 — open.** `COMPLIANCE.md:27` says the backend's metadata "is already in the shape Bazaar's discovery extension expects (see `@x402/extensions` dependency)". `@x402/extensions` is declared at `api/package.json:17` and imported **nowhere** in `api/src/`. The line now carries an inline correction saying exactly that, which is honest — but the honest thing and the fixed thing are not the same thing, and a dependency in a manifest is still not an implementation.
- **DOC-4 — open.** `web/lib/demoWallet.ts:12` points at `lib/walletConnect.ts`, which does not exist, and `docs/IMPLEMENTATION_PLAN.md` §4 claims a real-wallet (Pera/Defly) path "is also implemented, just not the one-click default." **It is not implemented.** There is no wallet-connect code anywhere in `web/`. In a documentation set that is otherwise scrupulous, this is the clearest remaining overclaim, and it is the one a judge who greps for `walletConnect` finds in ten seconds.

---

## 2. Weighted overall

| # | Dimension | Weight | Was | Now | Contribution |
|---|---|---:|---:|---:|---:|
| 1 | Problem significance | 8% | 7 | 7 | 0.56 |
| 2 | Innovation / novelty | 8% | 6 | **7** | 0.56 |
| 3 | Technical complexity | 8% | 6 | 6 | 0.48 |
| 4 | Engineering quality | 10% | 7 | **8** | 0.80 |
| 5 | "AI" usage | 5% | 3 | 3 | 0.15 |
| 6 | Scalability | 5% | 3 | **4** | 0.20 |
| 7 | Security | 12% | 3 | **7** | 0.84 |
| 8 | UX | 5% | 6 | 6 | 0.30 |
| 9 | Reliability | 7% | 3 | **7** | 0.49 |
| 10 | Demonstrability | 10% | 7 | **8** | 0.80 |
| 11 | Business potential | 6% | 4 | 4 | 0.24 |
| 12 | Social impact | 4% | 5 | **6** | 0.24 |
| 13 | Competitive differentiation | 6% | 6 | **7** | 0.42 |
| 14 | Evidence quality | 6% | 8 | **9** | 0.54 |
| | **Overall** | **100%** | *5.4* | | **6.6 / 10** |

**What moved and why, in one paragraph.** Security carries the largest share of the gain (+0.48 of the +1.2) because it had the largest weight and the largest defect: a flagship endpoint with no access control became one whose access control is proven by a scripted live attack. Reliability (+0.28) moved almost as far, half of it by fixing the facilitator path and half by discovering that one of the original findings was wrong. Engineering quality, demonstrability, novelty, differentiation, social impact and evidence quality each moved a single point, and each of those points is anchored to a specific artefact rather than to effort spent.

**What did not move, and this is the more useful half.** Problem significance, technical complexity, "AI" usage, UX and business potential are unchanged, because none of them was ever blocked by the findings that were fixed. The instantiation is still one synthetic record. The system is still small. The intelligence layer is still `String.includes`. The frontend is still untested and still cannot demonstrate the control that is now this project's best beat. And nobody outside the team has ever paid for anything.

**Counterfactual, updated.** Standing up a public HTTPS endpoint and obtaining **one third-party payment** would move demonstrability 8→9, business potential 4→5, and differentiation 7→8 — an overall of roughly **6.8 / 10**. That is a smaller gain than the last one for considerably more effort, and it is still the right next thing to spend effort on, because it is the only remaining move that changes what the team is *allowed to say* rather than how well they can say it. Everything above 7 from there is bounded by things a hackathon cannot buy: clinical validation, real users, MainNet economics, and time.

---

## 3. Why this could win

There is a real case, and it is stronger than the score above suggests, because several of these things are hard to fake and most competing entries will not have them.

**1. A deployed contract a judge can verify without your help.** App `768743428`, created at round `66088624`, `deleted: false`, admin set, 5 ALGO funded, two grant boxes live. That is checkable from any public indexer in one `curl`, with no reliance on your slides, your laptop, your uptime, or your honesty:

```
curl -s https://testnet-idx.algonode.cloud/v2/applications/768743428
```

Independently confirmed during this review. A judge who runs that command has verified you without trusting you — that is a different category of evidence from a demo video.

**2. A real settled payment with the full unit-conversion story intact.** Transaction `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ`: `axfer`, asset `10458941` (TestNet USDC, 6 decimals), amount **20000** base units — exactly `$0.02`, and *nothing in this repository hardcodes either the asset id or that conversion*. `api/src/x402.ts:16-32` deliberately omits an `asset` field so the SDK's money parser resolves it from the facilitator's live `/supported`. The 20000 in that transaction is the protocol working, not a constant you typed. `fee: 0` proves fee sponsorship worked: the caller needed USDC and no ALGO. Most teams cannot narrate their own payment at this resolution.

**3. 73 passing tests across two toolchains, including AVM-simulator contract tests — and CI that now actually runs them.** 28 contract tests via `algorand-python-testing` and 45 API tests via vitest. Both suites were executed and confirmed during this review; `tsc --noEmit` is clean in `api/` and `web/`, both builds are green, and `npm audit` reports 0 vulnerabilities in both packages. The workflow triggers on `[main, master]`, pull requests and `workflow_dispatch`, caches pip and npm, runs `npm audit --audit-level=high`, and includes an **artifact-freshness gate** — it recompiles the contract and fails on `git diff --exit-code -- contracts/artifacts/`, so committed TEAL cannot drift from committed source.

The coverage is aimed at what is risky rather than what is easy. The contract tests cover the negative paths — non-admin `log_access` rejection, non-admin `withdraw_excess` rejection, revoking a non-existent grant, expiry via `patch_global_fields`, per-patient sequence isolation. The API tests now include payer recovery from a payment signature, an assertion that the advertised route list equals the mounted set, and cross-language box-key parity against a shared golden-vector fixture that both the TypeScript and Python suites read. **And three of the new contract tests were verified to fail against the pre-fix code** — a regression test that has never been red has not been shown to test anything, and saying so is itself a maturity signal.

**4. Evidence discipline that is genuinely rare.** `docs/PROOF.md` is not a claims list, it is a reproduction script: every section is a command plus an independently-checkable artifact, and where the artifact could be doubted it is re-verified against the public indexer rather than the tool that produced it. `docs/COMPLIANCE.md:68-75` has a "What this document does not claim" section. `PROOF.md:143-147` volunteers the self-payment caveat unprompted. Judges spend most of their time discounting other people's claims; a submission that pre-discounts its own buys credibility that transfers to everything else it says. **This is your most underrated asset. Lead with it.**

**5. A defensible architectural thesis, written down and argued.** `docs/ARCHITECTURE.md:30-46` states the problem — a consent-gated endpoint cannot generate leaderboard volume by construction — and solves it with a two-category catalogue sharing one trust layer. It names the trade-off, picks a side, and explains why. Most hackathon architecture documents describe what was built. This one argues for it. That is the difference between a project and a position.

**6. A security control you can watch reject an attack, live.** `api/scripts/verify-g01-fix.ts` does not assert that impersonation is impossible; it *attempts* it against the live TestNet deployment — grants a third party consent, pays with the wrong key, claims the third party's address — and shows the 403, then runs the legitimate call as a control so the refusal cannot be read as breakage. A judge watching a paid request be refused *for the right reason* learns more in fifteen seconds than any feature walkthrough conveys, and the artefact it writes (`contracts/artifacts/g01-verification.json`) is checkable afterwards without the team present. Nearly every entry will demo a feature working. Almost none will demo an attack failing.

**7. The composition, proven end to end and repeatable.** `api/scripts/e2e-consent-proof.ts` performs grant → free consent check → paid call → on-chain audit append in a single run and prints four clickable Lora links. `total_audit_entries` on App `768743428` reads **5**. The claim at the centre of the pitch — that one HTTP call can be simultaneously a settled USDC payment, an on-chain authorisation decision, and an immutable audit append — is now a thing with transaction ids rather than a thing with a diagram.

**8. Off-the-shelf client compatibility as a deliberate, defended decision.** `docs/ARCHITECTURE.md:95-108` is the strongest paragraph in the repository. The `exact` AVM scheme permits up to 16 transactions in a client's signed group, so bundling a consent app-call with the payment was *available* — and was rejected, because a generic `@x402/fetch` client only knows how to build the transaction described in `paymentRequirements`. Requiring callers to know MedRail's app id and method signature would make the endpoint uncallable by any other team's agent, which directly contradicts the volume strategy. The document then names the cost of that choice (the audit write is not atomic with the payment) and states the mitigation. Identifying a tempting-but-wrong design, rejecting it for a stated reason, and owning the residual cost is exactly the reasoning judges are trying to detect.

---

## 4. Why this could lose

Ranked by how much damage each does when a competent judge finds it. **The previous version of this section was led by two findings that are now closed** — the consent gate not authenticating, and the headline audit write never having executed. What remains is a shorter list, and almost every item on it is something the team has *not done* rather than something the team got *wrong*. That is a better position, and a harder one to improve, because effort no longer converts into points at the same rate.

**1. Nothing is publicly hosted. This is now the whole ballgame.** There is no public HTTPS URL. Every demonstration in this submission — the paid call, the consent gate, the audit append, the rejected impersonation — requires cloning the repository and running processes on a laptop. Against a judging criterion explicitly named *real usage*, an endpoint that does not exist on the internet cannot have any, and no amount of engineering quality substitutes for it. It also strands the rest of the entry checklist: there is no Bazaar listing and no leaderboard presence because there is no URL to list. `docs/08_Deployment/GO_LIVE_RUNBOOK.md` was written for exactly this and has not been executed.

**2. Every payment is a self-payment.** The settled transactions are real, facilitator-verified, and independently confirmed against the public indexer — and the sender is the receiver, `2WDV2J2F…`, every time. `docs/PROOF.md` volunteers this before anyone asks, which converts a gotcha into a disclosure. Disclosure is not demand. *"Has anyone other than you ever paid for this?"* is the one question in the set that no amount of engineering rigour answers, and the answer is still no. **One payment from an unrelated third-party wallet, recorded beside the first, would change what this team is allowed to claim more than anything else on this list.**

**3. No MainNet deployment.** The contract exists on TestNet only. `contracts/scripts/deploy_testnet.py` is parameterised by network and the MainNet procedure is documented step by step, but no MainNet application has ever been created and no MainNet transaction has ever been made. `docs/COMPLIANCE.md` states this plainly, and states that it requires the team's own funded wallet. A judge weighting long-term potential will note both that everything here is one funded wallet away from MainNet, and that the wallet has not been funded.

**4. The deployed contract runs pre-fix bytecode (C-1, C-2).** Two contract defects are fixed in `contracts/contract.py`, with three regression tests verified to fail against the old code — and App `768743428` is still running the old code. This is deliberate: `deploy_testnet.py` uses `OnUpdate.AppendApp`, which mints a *new* application, so redeploying would abandon the App ID along with the consent lifecycle and five audit entries that are this submission's strongest evidence. Preserving the history was judged worth more than shipping a cosmetic event-field fix. The trade is defensible and the reasoning is sound. **It is also the sharpest question a well-prepared judge can ask, and it is only defensible if you raise it first** — if they discover that the "fixed" contract is not the running contract, the fix reads as a claim rather than a change.

**5. No observability of any kind (G-15).** No metrics, no tracing, no alerting, no dashboards, no error aggregation. There are three structured JSON error events (`facilitator_unavailable`, `audit_write_failed`, and a generic `INTERNAL_ERROR` record with a `requestId`) and a `/v1/health` endpoint, and that is the entirety of it. The rate limiter's state is in-process memory that vanishes on restart. If this service went public tomorrow, nothing would tell the team it was degraded except a user complaining. *"How would you know if this broke at 3 a.m.?"* currently has no good answer, and it is the question that separates a demo from a service.

**6. No performance data at all (G-24).** No latency figure, no throughput figure, no concurrency figure, no load test — `PERF-002` and `PERF-003` are **NOT IMPLEMENTED**, and no number of any kind exists anywhere in the repository. The service is also pinned to a single machine on purpose (`max_machines_running = 1`), because the audit-sequence lock is in-process (G-11, open). Both facts are written into the config with their reasons, which is the right posture. The honest summary is still that this system's scaling behaviour is unmeasured and its current ceiling is one process.

**7. "AI endpoints" are keyword matching over 11 rules and a 14-row table.** Defensible — but only if you say it first. `README.md` and `docs/JUDGES.md` have been reworded to "clinical-intelligence endpoints", with `JUDGES.md` naming them as deterministic rule engines in its opening paragraph. That is the correct fix, and it is incomplete: **three places still say "AI intelligence endpoints"** — `api/src/app.ts:152` (the service index, which is the first thing an integrator fetches), `web/app/layout.tsx:18`, and `web/app/page.tsx:18`. A judge who reads the landing page and then opens `triageScorer.ts` closes that gap in under a minute. Volunteer it and it is a design position; let them extract it and the identical argument reads as a retreat.

**8. The intelligence-layer defects are still open, and one is demonstrable from your own demo box.** `scoreTriage("I have no chest pain")` returns score **35**, band **`urgent`** — there is no negation handling at all (G-26, open). `checkInteractions(["a","b"])` returns **five** spurious major/contraindicated matches from two single letters, because the containment test is unanchored and symmetric (G-21, open). The sharper version of the finding is about the test suite rather than the code: `api/test/interactionChecker.spec.ts`'s *"always includes a source citation and disclaimer"* case calls that exact input and asserts only that `source` is non-empty and the disclaimer is present. It executes the defect on every CI run and is structurally incapable of seeing it. 73 tests is a respectable number; the one test whose name suggests it covers the risky path is asserting on the wrong property of its own output.

**9. Thin direct coverage of the module with the most machinery in it (G-05).** `api/src/services/algorand.ts` — box-key derivation, `withPatientLock`, `checkAccess`, `logAccess` — still has **no dedicated unit-test file**. The derivation half is now covered indirectly by the cross-language golden-vector suite, which is a real improvement, but the lock and both on-chain call paths are exercised only by end-to-end scripts that need funded keys and are not run by CI. The frontend still has **no automated tests of any kind**. And `fund_mbr` is untested, as is the positive path of `withdraw_excess` (G-25), which is also unbounded in-contract (G-31).

**10. Two documentation overclaims survive (DOC-9, DOC-4).** `@x402/extensions` is declared at `api/package.json:17` and imported nowhere, so the Bazaar discovery extension is not wired up — only the metadata shape is compatible. `COMPLIANCE.md:27` now says so in an inline correction, which is honest and still leaves a dependency sitting in the manifest looking like an implementation. And `web/lib/demoWallet.ts:12` still points at a `lib/walletConnect.ts` that does not exist, beside a claim in `docs/IMPLEMENTATION_PLAN.md` §4 that a Pera/Defly path "is also implemented, just not the one-click default." It is not implemented. In a documentation set this careful, two remaining overclaims are conspicuous precisely because everything around them checks out.

---

## 5. The five most dangerous questions a judge will ask

The previous version of this section listed five questions this team could not answer well. **Three of them now have good answers, and two of those have become demo beats.** The list below is re-ranked by current danger: the questions are ordered by how much damage they still do, and each one records honestly whether it is a strength, a survivable weakness, or a live hazard.

Two questions were retired from this list and are noted here so nobody re-adds them. *"Show me an audit-log entry on-chain"* is now answered with a transaction id — `4YLKLQKK…`, `auditSequence: "1"`, and `total_audit_entries = 5` on App `768743428`, checkable on any indexer. *"Your API 500s after my payment settles — who refunds me?"* is answered by the SDK: `@x402/hono` settles only on a sub-400 response, so **no error path in MedRail can consume a settled payment**; on an audit-write failure the caller receives the record with `auditStatus: "pending"`, and on any 4xx or 5xx settlement is cancelled outright. Both answers are short, true, and verifiable.

---

### Q1 — "Your contract fixes aren't on the deployed contract, are they?"

**Verbatim.** *"You told me you fixed two contract defects. I checked the approval program on App `768743428` against your repository. Which one am I looking at?"*

**Why it is dangerous.** It is now the sharpest available question, because it is the only place where "fixed" and "running" come apart, and because the team volunteered the evidence that makes it findable: the source-to-chain verification in `docs/PROOF.md` pins the deployed bytecode to the *committed artifacts*, which predate the C-1 and C-2 source fixes. A judge who follows that trail and gets there first will read it as the fix being a claim rather than a change — and will then re-examine every other "fixed" in the submission.

**The answer, and it is a good one.** "You're looking at the pre-fix bytecode, deliberately. Our deploy script uses `OnUpdate.AppendApp`, which creates a *new* application — so redeploying would mint a new App ID and abandon `768743428` along with its whole on-chain history: the consent lifecycle, the settled payments, five audit entries. Both defects are non-exploitable — one is an ARC-28 event field order, the other under-estimates box MBR by 400 µALGO per box — and neither is worth trading our evidence for. They're fixed in `contract.py`, they're covered by three regression tests, and we ran those tests against the old code first to confirm they go red. When we deploy to MainNet the fixed source is what ships."

**What makes it strong rather than defensive:** the trade is named, the cost of the alternative is quantified, the fix is verifiable in source, and the tests are shown to have failed once. **Say this before the judge asks.** It is the single best demonstration in the submission that this team reasons about consequences rather than about checkboxes — and it only reads that way if you raise it.

---

### Q2 — "Has anyone other than you ever paid for this?"

**Verbatim.** *"Real usage is the first judging criterion. How many payments have you had, and from whom?"*

**Why it is dangerous.** It goes at the criterion listed first in `docs/COMPLIANCE.md:33`, the answer is still "only me", and the honest disclosure already sitting in `docs/PROOF.md` means the team cannot even be surprised by it. Everything about the entry — the open-endpoint split, off-the-shelf client compatibility, the $0.02 price — is architected *for* volume, which makes zero external volume read as a strategy that was designed and never launched. **This is the most damaging question that remains, and unlike the rest of the list it cannot be answered by explaining something.**

**Best honest answer available today.** "Every settled payment so far is one of ours — TestNet, sender equals receiver, disclosed in our proof log before anyone asks. What those transactions prove is that the pipeline settles: real facilitator, real `axfer`, 20000 base units, fee-sponsored, independently confirmed on the indexer, and now the consent-gated composition end to end with an audit entry on-chain. What they do not prove is demand, and I'm not going to claim they do. The reason there's no external volume is that there's no public URL yet — the endpoint runs on my laptop. That's a deployment gap, not a design gap."

**What to build,** in order: (a) the public HTTPS endpoint — `docs/08_Deployment/GO_LIVE_RUNBOOK.md` is written for it and it unlocks everything downstream; (b) re-run `e2e-proof.ts`, `e2e-consent-proof.ts` and `verify-g01-fix.ts` against that URL so every proof in the repository points at something a stranger can reach; (c) **get one unrelated wallet to make one real payment** and record its transaction id in `docs/PROOF.md` beside the first; (d) then the Bazaar tag and MainNet. The distance between "one self-payment" and "a payment from someone else" is trivial in volume and enormous in what it licenses the team to say.

---

### Q3 — "Where's the AI? And why is a keyword match worth two cents?"

**Verbatim.** *"You call these AI intelligence endpoints. I read `triageScorer.ts`. It's `String.includes` over eleven hardcoded phrases. Where's the AI, and what am I paying for?"*

**Why it is still dangerous.** The framing has been partly fixed — `README.md` and `docs/JUDGES.md` now say "clinical-intelligence endpoints" and `JUDGES.md` calls them deterministic rule engines in its opening paragraph — but `api/src/app.ts:152`, `web/app/layout.tsx:18` and `web/app/page.tsx:18` still say "AI intelligence endpoints", and the service index is the first thing an integrator fetches. Once a judge catches one overclaim they audit everything else, and this submission's greatest asset is that its claims survive auditing.

**The follow-up that actually hurts, and it takes eight seconds to land:** *"What does it say if I type 'I have no chest pain'?"* Measured answer: score **35**, band **`urgent`**. A judge can run that in the demo box while the design is still being explained. If they find it, the deterministic-rules argument dies on the spot, because it is being made in defence of a system that escalates a negation. If **you** show it first, it becomes the sharpest evidence available that you understand your own limitations.

**Best honest answer available today.** "There is no model. Two deterministic rule engines: eleven weighted red-flag phrases and a fourteen-row interaction table, both pure functions, both unit-tested, both carrying a non-diagnostic disclaimer that a test asserts as a correctness property. That was deliberate — an opaque model in a clinical triage path is a liability, and this one you can read in ninety seconds and audit line by line. Here's what it costs us: type 'I have no chest pain' and it scores thirty-five, urgent. Substring matching has no notion of polarity, and I'd rather show you that than have you find it. It's a screening trigger, not a diagnosis, and the disclaimer on every response says so. What you're paying for is the metered call — and the engine sits behind a route boundary, so swapping in a model doesn't touch the payment or consent layers."

**What to build.** (1) Change the three remaining "AI intelligence endpoints" strings — the accurate name is also the more confident one, and it is a three-string edit. (2) Add negation detection, even crudely: a leading-negator check (`no`, `denies`, `without`, `ruled out`) within a few tokens before a matched phrase (G-26). (3) Fix the unanchored substring match so `["a","b"]` stops emitting five severe warnings, **and fix the test that calls it** so the suite stops silently exercising the defect (G-21). (4) Publish the rule table itself as a free endpoint: "our decision logic is public; that's the point."

---

### Q4 — "How would you know if this broke at three in the morning?"

**Verbatim.** *"Say you're live and the operator account runs out of ALGO, so every audit write starts failing. How do you find out?"*

**Why it is dangerous.** The question is well-aimed at exactly the seam this build has: the audit write is now *guarded*, so a chain failure returns a 200 with `auditStatus: "pending"` instead of an error — which is the right behaviour for the caller and means the failure is **silent to everyone else**. There is no metric, no alert, no dashboard, no error aggregation (G-15). The only signal is a structured `audit_write_failed` line in stdout that nobody is reading.

**Best honest answer available today.** "You wouldn't, and that's the gap. We fixed the caller's experience — a failed audit write still returns the record, flagged `auditStatus: pending`, and we log a structured `audit_write_failed` event with the patient, requester and error — but there's nothing consuming that log. No metrics, no tracing, no alerting. There's a `/v1/health` endpoint wired as the platform health check and that's the extent of our observability. It's finding G-15 in our own gap report, it's open, and it's the main thing standing between this and something I'd call operable."

**Why answering it this way works:** the flag in the response body is genuinely good design and worth showing, and naming the gap by its own tracking ID demonstrates that the team found it before the judge did. Do not oversell the health check as monitoring.

---

### Q5 — "How do you know the caller is who they say they are?" *(this one flipped)*

**Verbatim.** *"You take `requesterAddress` from the request body. What stops me from paying five cents and putting someone else's address in there?"*

**Why it used to be the most dangerous question in the set,** and why it is now the best: it needs no setup, it arrives immediately after the consent demo lands, and the answer used to be "nothing." It is included here because a judge who read an earlier version of this submission's own documentation will still ask it, and because the answer is now a live demonstration rather than a confession.

**The answer.** "The payment *is* the authentication. The `PAYMENT-SIGNATURE` header carries a signed Algorand transaction, so we decode it, recover the address that actually signed it, and refuse to serve any `requesterAddress` that signature doesn't support — 403, before we touch the consent check and before anything is written to the ledger. No API keys, no session tokens, nothing to rotate; the identity was already in the envelope and we just started using it. Let me show you."

**Then show it.** `API_BASE=… npx tsx api/scripts/verify-g01-fix.ts` grants a third party consent on-chain, pays with a different key while claiming the third party's address, and prints the 403 — then runs the legitimate call as a control and returns the record with its audit transaction. Watching an attack be refused for the right reason, followed by the same request succeeding when the identity matches, is stronger than any feature walkthrough in the room. `SEC-008` **IMPLEMENTED**; six unit tests in `api/test/x402Payer.spec.ts`; artefact at `contracts/artifacts/g01-verification.json`.

**The one caveat to volunteer if pressed:** this binds the requester to the payer, which is the right control for this endpoint. It does not, and cannot, prove that the human behind that key is the clinician the patient meant. On-chain identity is pseudonymous; the patient chose an address, and MedRail enforces that the address is the one that showed up.

---

## 6. Maturity verdict

**The ladder as used here:**

| Level | Definition |
|---|---|
| **Hackathon Ready** | Builds and shows something. Claims exceed what can be reproduced on demand. |
| **Demo Ready** | Every claim on the critical path can be reproduced live, on demand, in front of a skeptic, with artifacts they can check independently. Known defects exist and are disclosed. |
| **Beta Ready** | Publicly reachable, authenticated where it matters, degrades gracefully, has coverage on its risky modules, and does not lose money on a failure path. |
| **Production Ready** | Beta plus operability: monitoring, alerting, key management, incident response, defined RPO/RTO. |

### Verdict: **Demo Ready, without a carve-out** — and one deploy away from a credible Beta claim.

The previous verdict was `Demo Ready` *with a carve-out*: the two open endpoints qualified, and the consent-gated flagship — the endpoint the entire pitch is built around — was honestly only `Hackathon Ready`, because its success path had never completed outside an AVM simulator and its authorisation check did not authorise anything. **That carve-out is removed.** `/v1/records/summary` now completes end to end against live TestNet infrastructure with a transaction id for its payment and its audit append, its authorisation check refuses a real impersonation attempt, and both are reproducible from committed scripts by anyone with the repository and a funded key. The submission's strongest narrative no longer rests on its weakest-evidenced component.

**Why Demo Ready and not Hackathon Ready.** The core claims are not assertions. App `768743428` is verifiable from any public indexer without the team present, and its approval program is byte-identical to the compilation of the committed TEAL. Transaction `OYRQRKYA…` is a real settled `axfer` of 20000 base units with `fee: 0`. The consent lifecycle is four real confirmed transactions; `total_audit_entries` reads 5. 73 tests pass and were re-run during this review, CI runs them, and `npm audit` is clean in both packages. `docs/PROOF.md` gives a reproduction command for each claim. That is a materially higher standard than most entries reach, and the honesty discipline in `COMPLIANCE.md` and `PROOF.md` — including the retraction of one of this review's own findings — is a genuine differentiator rather than a consolation prize.

**Why not Beta Ready — and the gap has narrowed to something specific.** Beta requires: publicly reachable, authenticated where it matters, degrades gracefully, coverage on the risky modules, and no money lost on a failure path. Four of those five now hold. The consent gate authenticates and the control is proven by attack. A facilitator outage returns 503 with `Retry-After` instead of an opaque 500. No error path can consume a settled payment — that is structural in the SDK, not a promise. Test coverage is materially better, though `services/algorand.ts` still has no dedicated file and the frontend has none at all.

**What is actually missing is the first word: publicly reachable.** There is no URL. Add to that no observability (G-15) and no performance measurement of any kind (G-24), and the honest position is: **`Demo Ready`, with a genuine line of sight to Beta that runs through one deployment.**

**Do not inflate past that.** Specifically, do not claim Beta on the strength of the security and reliability fixes alone — a service nobody can reach has not degraded gracefully in public, has not been rate-limited by a real client, and has not had its audit write fail at three in the morning with nobody watching. `docs/08_Deployment/GO_LIVE_RUNBOOK.md` is the next document to open, and `Winning_Strategy.md` sequences what follows it.
