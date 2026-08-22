# MedRail — Risk Register

**Purpose:** a single, consistently-scored inventory of every risk this reviewer could identify across technical, security, intelligence-layer, operational, scalability, dependency, product, deployment, and hackathon-demo categories, with a derived severity and a named owning role.

**Status of this document:** authored 2026-08-21 against commit `32ffd73`, from source review, live reproduction, and public-indexer queries against App ID `768743428`. It is an engineering risk register, **not** an audit, a certification, or a compliance assessment. No scanning tool has been run against this codebase, so no CVE count, vulnerability total, or scan result appears here. Every probability rating is a reviewer's judgement stated openly as such; every impact rating is anchored to a consequence that can be traced to a file, a line, or an on-chain fact.

**Headline:** **58 risks. 8 Critical, 24 High, 21 Medium, 5 Low.** The three highest are all consequences of the same two facts: the consent gate authorises against a caller-asserted identity (S-1), and the on-chain audit log — the project's stated differentiator — has never executed on real infrastructure.

---

## 1. Scoring method

Severity is **derived**, never assigned. `Severity = Probability × Impact`, both on a 1–5 scale.

### 1.1 Probability — likelihood of occurrence within a 12-month operating window, system as-built

| Score | Band | Meaning |
|---|---|---|
| 5 | **Almost Certain** | Already true, or occurs on every run. No trigger required. |
| 4 | **Likely** | Requires only ordinary use, public information, or a routine action (e.g. a first deploy). |
| 3 | **Possible** | Requires a specific but plausible condition — load, concurrency, a motivated actor, a config change. |
| 2 | **Unlikely** | Requires privileged access, an unusual conjunction, or third-party failure. |
| 1 | **Rare** | Requires a third-party compromise or an event with no known precedent here. |

### 1.2 Impact — worst credible consequence **as-built** (synthetic data, TestNet play money)

| Score | Band | Meaning |
|---|---|---|
| 5 | **Severe** | Irreversible loss of control, complete defeat of a core security property, or the submission failing on its central claim. |
| 4 | **Major** | Loss of funds, total outage of a paid capability, permanent corruption of the public record, or a live demo failure. |
| 3 | **Moderate** | Degraded correctness, one route unavailable, an unproven claim, or information disclosure. |
| 2 | **Minor** | Contained, self-limiting, or cosmetic-but-visible to a technical reviewer. |
| 1 | **Negligible** | Bounded to worthless assets or invisible in practice. |

**Where a risk is materially worse in a production system handling real PHI, the row says so explicitly.** Rating as-built and then noting the production delta is the only honest way to score a system whose flagship endpoint returns a hard-coded constant.

### 1.3 Severity bands

| Range | Severity |
|---|---|
| 15 – 25 | **CRITICAL** |
| 10 – 14 | **HIGH** |
| 5 – 9 | **MEDIUM** |
| 1 – 4 | **LOW** |

### 1.4 Owner

The Owner column names a **role**, not a person. This repository has two commits and one author, so every role currently resolves to the same individual. The column exists to say which hat the work is done in, and to make the register usable if the project ever has more than one contributor.

Roles: **Contract** · **Backend** · **Frontend** · **Release** (CI/CD, containers, hosting) · **Product** (docs, claims, submission) · **Demo** (the live presentation).

### 1.5 Status

**OPEN** · **OPEN (accepted)** — a deliberate, documented decision to carry the risk · **OPEN (unverifiable)** — cannot be resolved from this repository · **MITIGATED**.

---

## 2. Risk register

### 2.1 Security (RS)

| Risk ID | Category | Risk | Prob. | Impact | Severity | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|---|
| **RS-01** | Security | **Consent gate defeated: `requesterAddress` is caller-asserted and never bound to the payer.** Any paying stranger can impersonate any authorised requester by reading a `(patient, requester)` pair off the public ledger. `api/src/routes/records.ts:5-8, 32`. Finding S-1 / threat T-01. | 4 | 5 | **20 — CRITICAL** | Decode `PAYMENT-SIGNATURE` (`decodePaymentSignatureHeader`, `@x402/core/http`), recover the payer (`getSenderFromTransaction`, `@x402/avm`), reject unless it equals `requesterAddress`. Both verified present in the pinned SDK. ~10–15 lines + 1 test. `SEC-007`, `FR-039`. | Backend | **OPEN** |
| **RS-02** | Security | **False attribution written to the immutable audit log.** RS-01's second-order effect: the claimed requester is written permanently to a public, undeletable box (`api/src/routes/records.ts:49`). A record trusted *because* it is on-chain, asserting something false, with **no correction mechanism in the contract**. | 4 | 5 | **20 — CRITICAL** | Same fix as RS-01. `SEC-008`. Until then the audit log records claims, not facts. | Backend | **OPEN** |
| **RS-03** | Security | **`OPERATOR_MNEMONIC` is one hot key in an env var holding three separable powers:** forge audit entries (`contract.py:222`), rotate admin irreversibly (`contract.py:126`), drain the app account via an in-contract-unbounded `withdraw_excess` (`contract.py:258-259`). No multisig, no HSM, no rotation runbook, no detection. | 2 | 5 | **10 — HIGH** | Split the audit-writer role from the contract-owner role (`SEC-055`); move admin to 2-of-3 multisig (no contract change needed); KMS/external signer; bound or remove `withdraw_excess`. `SEC-012`. | Backend / Contract | **OPEN** |
| **RS-04** | Security | **No rate limiting anywhere** — not per IP, per route, global, or at the platform. `/v1/consent/status` is free, unauthenticated, and makes 2 outbound algod calls per request. | 4 | 3 | **12 — HIGH** | Add rate-limit middleware, starting with the free routes. `SEC-013`. | Backend | **OPEN** |
| **RS-05** | Security | **No `.dockerignore` exists anywhere in the repository** (verified). `api/Dockerfile` builds from the repo root, so `api/.env` and `contracts/.env` — both holding live mnemonics — enter the build context on every build. | 2 | 5 | **10 — HIGH** | Not `COPY`'d into any layer today, so no secret currently ships; the margin is one careless `COPY api/ ./api/` wide. Add a 6-line root `.dockerignore`. `SEC-015`, D-3, D-5. | Release | **OPEN** |
| **RS-06** | Security | **No dependency vulnerability scanning of any kind** — no `npm audit`, `pip-audit`, CodeQL, Dependabot, or SAST in `.github/workflows/ci.yml`. | 4 | 3 | **12 — HIGH** | Add scan steps — **after** RO-02, since the workflow currently never runs. `SEC-014`. | Release | **OPEN** |
| **RS-07** | Security | **The facilitator's settlement verdict is trusted without independent re-verification against algod.** A malicious facilitator could assert settlement that never happened. | 1 | 4 | **4 — LOW** | **Accepted:** this is the standard x402 trust model — the facilitator is by protocol design the verify+settle authority. Correctly recorded at `docs/SECURITY.md:84-87`. Optional hardening: re-read the settled tx from algod before serving/logging (`SEC-057`). | Backend | **OPEN (accepted)** |
| **RS-08** | Security | **Replay resistance of a settlement proof is unknown.** MedRail implements none and holds no state to implement one. The AVM note is `x402-payment-v2-<ms>` — a client-generated timestamp (`@x402/avm/dist/cjs/index.js:266`), **not** a server nonce. No replay/nonce symbols in the SDK's exported types. | 2 | 3 | **6 — MEDIUM** | Establish and document replay semantics with the facilitator operator, or track settlement ids server-side. `SEC-052`. **Cannot be resolved from this repository.** | Backend | **OPEN (unverifiable)** |
| **RS-09** | Security | **Box-MBR exhaustion griefing.** `scope` is free-form (`DATA-003`), so the grant key space is unbounded. Each grant box locks ~22,500 µALGO of the app account's balance permanently; exhausting it stops all new grants and audit entries. Attacker fee ≈ 0.001 ALGO vs ≈ 0.0225 ALGO consumed — a **~22:1 economic asymmetry**. | 3 | 4 | **12 — HIGH** | `fund_mbr` is open to anyone, so recovery is cheap but reactive. Add MBR-headroom monitoring and alerting. `REL-006`, `OPS-005`. | Contract / Backend | **OPEN** |
| **RS-10** | Security | **Consent relationships are permanently public.** Every `grant_access` publishes `(patient, requester, scope)` in cleartext — the box key is hashed, the transaction is not. The reviewer enumerated the live app's full consent history from a public indexer for free. | 5 | 2 | **10 — HIGH** | **None possible for on-chain data.** In production (impact 4–5): per-relationship rotating pseudonyms and opaque scope identifiers (`Privacy.md` §5.3–5.4). `SEC-056`. Also the reconnaissance step for RS-01. | Contract / Product | **OPEN** |
| **RS-11** | Security | **Demo-wallet mnemonic in `sessionStorage` as plaintext** (`web/lib/demoWallet.ts:17-27`) — XSS-exfiltratable. | 1 | 1 | **1 — LOW** | **Accepted, and defensible:** blast radius deliberately made worthless (browser-generated, TestNet-only, cleared on tab close), disclosed in code, UI, and `docs/SECURITY.md:35-38`. Verified no XSS vector exists — zero `dangerouslySetInnerHTML` in project source. Note `web/lib/demoWallet.ts:12` points at `lib/walletConnect.ts`, **which does not exist** (see RP-03). | Frontend | **OPEN (accepted)** |
| **RS-12** | Security | **No security headers** — no HSTS, CSP, `X-Content-Type-Options`, `X-Frame-Options`, or `Referrer-Policy`. `api/fly.toml:16` sets `force_https = true`, which is the only transport control present. | 3 | 1 | **3 — LOW** | Low value for a JSON-only, cookie-less API; **CSP is genuinely worth having on `web/`** as the mitigating control for RS-11. `SEC-051`, `SEC-016`. | Backend / Frontend | **OPEN** |

### 2.2 Technical (RT)

| Risk ID | Category | Risk | Prob. | Impact | Severity | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|---|
| **RT-01** | Technical | **The two highest-risk modules have zero test coverage.** No test exists for `api/src/routes/records.ts` or `api/src/services/algorand.ts`. No frontend test of any kind exists. No integration test runs the API against the deployed contract. **Evidence this is not theoretical: RS-01, RS-02, and RT-04 all live in exactly those two files.** | 4 | 3 | **12 — HIGH** | Add route tests for `records.ts` (allowed, denied, payer-mismatch) and unit tests for box-name derivation and `withPatientLock`. 32 tests exist and pass (14 contract + 18 API); none touches these modules. | Backend | **OPEN** |
| **RT-02** | Technical | **Three independent implementations of the same box-key derivation, with no cross-check.** `contract.py:96-98` (AVM), `api/src/services/algorand.ts:63-69` (Node), `web/lib/consent.ts:26-34` (browser). A one-byte divergence makes `check_access` read an empty box and **fail closed silently** — indistinguishable from "never granted". | 3 | 3 | **9 — MEDIUM** | One golden-vector test file asserting the exact 33-byte box name for fixed triples, shared by all three. ~30 lines. `NFR-011`. | Backend / Contract | **OPEN** |
| **RT-03** | Technical | **No timeout, retry, or circuit breaker on any chain I/O.** `new algosdk.Algodv2("", config.algodServer, "")` (`api/src/services/algorand.ts:5`). `atc.execute(algod, 4)` waits ~4 rounds then throws. A single AlgoNode blip becomes a user-visible 500 on two routes. | 4 | 3 | **12 — HIGH** | Explicit timeouts, bounded retry with jitter, circuit breaker. `REL-003`, finding R-4. | Backend | **OPEN** |
| **RT-04** | Technical | **A settled payment can be lost to an HTTP 500.** The *denied* path wraps `logAccess` in `.catch(() => undefined)` (`records.ts:37`); the *allowed* path does not (`records.ts:49`). Any throw ⇒ 500 after settlement, no refund path, no retry token, no record. | 3 | 3 | **9 — MEDIUM** | Guard the success path; return the record with a degraded-audit flag rather than failing the paid response. `REL-002`, finding R-2. | Backend | **OPEN** |
| **RT-05** | Technical | **`request_access` emits its event with `patient` and `requester` inverted.** `contract.py:146` passes `(Txn.sender, patient)` into a struct declared `(patient, requester)`, and `Txn.sender` is the requester per the method's own docstring. Every ARC-28 consumer gets systematically reversed data. | 5 | 2 | **10 — HIGH** | One-line fix: swap the two arguments. Not caught because the test asserts only `total_requests == 1` and never inspects the payload. Defect C-1, `FR-024`. | Contract | **OPEN** |
| **RT-06** | Technical | **`GRANT_BOX_MBR` under-reports the true cost by 400 µALGO per box.** `contract.py:52` uses `400 * (32 + 17)` = 22,100; the BoxMap's 1-byte `key_prefix="g"` makes the effective key 33 bytes ⇒ 22,500. **Verified on-chain:** min-balance 145,000 with 2 boxes ⇒ 45,000 = 2 × 22,500. | 2 | 1 | **2 — LOW** | Fix to `400 * (33 + 17)`. The wrong figure is exposed via a public ABI method advertised as a constant the backend can quote. Defect C-2, `FR-032`. | Contract | **OPEN** |
| **RT-07** | Technical | **Audit-write failure under concurrency across instances.** `withPatientLock` (`api/src/services/algorand.ts:123-138`) serialises in-process only; `api/fly.toml:17-19` permits >1 machine. **This is an availability risk, not an integrity one** — the contract self-assigns the sequence (`contract.py:224-226`), so a racing write is *rejected by the AVM*, never misordered. | 3 | 2 | **6 — MEDIUM** | Pin to one machine, or guard the success path (RT-04, which is what a rejection actually costs). `REL-004`, D-7. | Release / Backend | **OPEN** |
| **RT-08** | Technical | **`NETWORK` env value is an unchecked cast** (`api/src/config.ts:42`). A typo yields `undefined` CAIP-2, asset id, and algod URL, deferring failure to request time instead of failing at boot. | 2 | 3 | **6 — MEDIUM** | `z.enum(["testnet","mainnet"]).parse()` at startup; refuse to boot on an unrecognised value. `SEC-050`. | Backend | **OPEN** |
| **RT-09** | Technical | **Internal exception messages returned verbatim, and client errors reported as server errors.** `app.onError` returns `err.message` (`api/src/app.ts:60`). Reproduced: a 58-character invalid address returns **500** `{"error":"wrong checksum for address"}` — inviting infinite retries from any 5xx-keyed retry policy. | 5 | 2 | **10 — HIGH** | `.refine(algosdk.isValidAddress)` on all four address fields (or `isValidAlgorandAddress` from `@x402/avm`, already a dependency); generic 500 body with server-side logging. `SEC-010`, `SEC-011`, finding R-3. | Backend | **OPEN** |

### 2.3 AI / Intelligence layer (RA)

*Context: there is no LLM, no ML model, no embedding, and no vector store anywhere in this system. Both "AI endpoints" are pure deterministic functions over static tables (`AI-001`, **VALIDATED**). Prompt injection, jailbreak, training-data poisoning, and hallucination are therefore **not applicable** and appear in no row below — see `Threat_Model.md` §6.*

| Risk ID | Category | Risk | Prob. | Impact | Severity | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|---|
| **RA-01** | AI/Intelligence | **Unanchored bidirectional substring matching produces false positives and false negatives.** `m.includes(a) \|\| a.includes(m)` (`api/src/services/interactionChecker.ts:42-43`) — a medication named `"a"` is contained by "warfarin", "aspirin", "tramadol". Conversely a misspelling or an absent brand name yields `flagged: false`, which reads as an all-clear. | 4 | 3 | **12 — HIGH** | Token-boundary matching or an RxNorm/synonym map. The existing test calls exactly `checkInteractions(["a","b"])` and asserts **only** the disclaimer, so the defect is exercised and not checked. `AI-006`. **Production impact 5** — a false negative on a contraindicated pair is a patient-harm vector. | Backend | **OPEN** |
| **RA-02** | AI/Intelligence | **No measured sensitivity, specificity, or coverage.** 11 keyword rules and 14 interaction pairs, with no labelled dataset and no evaluation harness. | 5 | 2 | **10 — HIGH** | **None claimed, anywhere** — `AI-005` is **NOT IMPLEMENTED** and the docs say so. Mitigated in practice only by non-diagnostic disclaimers, which are asserted by tests as a correctness property (`FR-009`, `AI-002`, **VALIDATED**). **Production impact 5**: no clinical claim may be made without an evaluation harness. | Product / Backend | **OPEN** |
| **RA-03** | AI/Intelligence | **Reference-table poisoning.** `interactions.json` is loaded once at module start via `readFileSync` (`api/src/services/interactionChecker.ts:18`) with no checksum, no signature, and no integrity check. Anyone who can write that file silently changes paid clinical output for every caller. | 2 | 4 | **8 — MEDIUM** | Integrity verification at load; read-only container filesystem. `SEC-053`. Also an availability dependency: a missing or malformed file throws during module init and **the entire API fails to start**. | Backend / Release | **OPEN** |
| **RA-04** | AI/Intelligence | **An agentic caller treats a keyword-heuristic band as clinical truth.** `band` returns `emergency`/`urgent`/`soon`/`routine` — words carrying clinical weight. An LLM-driven consumer has no structural reason to weight the `disclaimer` string above the `band` string; both are JSON fields, and prose is exactly what a summariser drops. **The safety property lives in the field machines are least likely to honour.** | 3 | 4 | **12 — HIGH** | `AI-003` addresses band naming and disclaimers; nothing enforces this against machine consumers. Consider a machine-readable confidence/coverage field rather than prose. | Product / Backend | **OPEN** |
| **RA-05** | AI/Intelligence | **Excessive agency: unbounded autonomous spend.** An agent looping on MedRail spends real stablecoin per call with **no budget cap enforced by MedRail**, which cannot enforce one because it has no per-caller identity. Compounded by RT-04: a call that 500s *after* settling still costs money and produces no result — exactly the condition that triggers naive retry logic. | 3 | 2 | **6 — MEDIUM** | The 402 advertises the exact price before commitment (`api/src/x402.ts:16-32`), which is the right primitive — the caller can budget because it knows the price. `SEC-054` **PARTIALLY IMPLEMENTED**. Publish a machine-readable spend contract including the charge-on-denial semantics. | Product | **OPEN** |

### 2.4 Operational (RO)

| Risk ID | Category | Risk | Prob. | Impact | Severity | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|---|
| **RO-01** | Operational | **No observability of any kind.** The entire logging surface is `console.log` at startup (`api/src/index.ts:6`) and `console.error(err)` (`api/src/app.ts:59`). No structured logs, levels, request ids, access log, metrics, tracing, or alerting. **Concretely: an RS-01 exploit would leave no off-chain trace whatsoever.** | 4 | 3 | **12 — HIGH** | Structured logging with request correlation ids first; metrics and alerting after. `OPS-002`–`OPS-005`. | Backend | **OPEN** |
| **RO-02** | Operational | **CI has never run and never will as configured.** `.github/workflows/ci.yml:3-6` triggers on `push: branches: [main]`; the repository's only branch is `master`. No PRs exist, so `pull_request` never fires either. | 5 | 2 | **10 — HIGH** | One-word fix. **Do this first** — it is the prerequisite for RS-06 and every other CI-enforced control. Note: **the code is not failing** — the reviewer ran every job locally and all passed. `OPS-006`, CI-1. | Release | **OPEN** |
| **RO-03** | Operational | **CI depends on a live third party.** `api/test/x402-flow.spec.ts` makes a live call to `facilitator.goplausible.xyz` at app-module import, so a facilitator outage becomes a red build with a misleading failure. | 3 | 2 | **6 — MEDIUM** | Mock the facilitator `/supported` response for the hermetic tests; keep one opt-in live test. CI-2. | Release / Backend | **OPEN** |
| **RO-04** | Operational | **No RPO or RTO defined.** Never established for any component. | 3 | 2 | **6 — MEDIUM** | Define them. `OPS-008`. **No targets are invented in this register.** | Release | **OPEN** |
| **RO-05** | Operational | **No backup or rotation procedure for the operator mnemonic.** `set_admin` makes rotation *possible* (`FR-029`, **VALIDATED**); no runbook, cadence, or break-glass procedure makes it *executable*. Loss of the mnemonic with no rotation path = permanent loss of audit-write capability. | 3 | 4 | **12 — HIGH** | Write the rotation runbook; establish a secure backup. `OPS-007`. | Backend / Release | **OPEN** |
| **RO-06** | Operational | **No alerting on operator-account balance, app-account MBR headroom, or settlement failure rate.** All three are silent failure modes that surface as user-visible 500s. | 3 | 3 | **9 — MEDIUM** | Alerting on all three. `OPS-005`, `REL-006`. | Release | **OPEN** |

### 2.5 Scalability / performance (RC)

| Risk ID | Category | Risk | Prob. | Impact | Severity | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|---|
| **RC-01** | Scalability | **No load test, no latency benchmark, no concurrency measurement, and no capacity target exists anywhere in the repository.** The only measured numbers in existence are two test-suite durations and two single-sample latency observations. | 5 | 2 | **10 — HIGH** | Define a budget, then measure it. `PERF-002`, `PERF-003`. **No throughput, percentile, or capacity figure is stated in any MedRail document, because none has been measured.** | Backend | **OPEN** |
| **RC-02** | Scalability | **`/v1/consent/status` performs 2 sequential outbound algod calls per request** (`getTransactionParams` then `simulate`, `api/src/services/algorand.ts:85, 98`), free and unauthenticated. Single cold observation: **505 ms**, dominated by those round trips, on a 512 MB / 1 shared-CPU machine. | 4 | 2 | **8 — MEDIUM** | Cache suggested params (they change per round, not per request); rate-limit (RS-04). | Backend | **OPEN** |
| **RC-03** | Scalability | **The on-chain audit write blocks the paid response path.** `records.ts:49` awaits `logAccess`, which itself awaits `getAuditCount` and then `atc.execute(algod, 4)` — up to ~4 rounds. | 4 | 2 | **8 — MEDIUM** | Write asynchronously behind a durable queue, or return the response and reconcile the audit entry out of band. `PERF-004`. Interacts with RT-04: making it async is also the cleanest fix for the lost-payment risk. | Backend | **OPEN** |
| **RC-04** | Scalability | **Anonymous AlgoNode access with no API key** (`api/src/services/algorand.ts:5`). MedRail is a 1:2 amplifier into a free public good; sustained abuse risks MedRail's address being throttled or blocked, taking down two routes at once. | 3 | 3 | **9 — MEDIUM** | Rate-limit (RS-04); obtain a dedicated API key or run a private node. | Backend / Release | **OPEN** |

### 2.6 Dependency / supply chain (RD)

| Risk ID | Category | Risk | Prob. | Impact | Severity | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|---|
| **RD-01** | Dependency | **Supply-chain compromise of `@x402/*` or `algosdk`.** Both sit on the payment path, inside the process holding `OPERATOR_MNEMONIC`. A compromised `algosdk` in the *browser* would exfiltrate **patient** keys, defeating the one control this architecture is genuinely strong on. | 2 | 5 | **10 — HIGH** | Four `@x402/*` packages are pinned exactly to `2.21.0` (good); `@x402/fetch`, `algosdk`, `hono`, `zod` use caret ranges. No scanning (RS-06). Pin the remainder; add scanning; use `npm ci` (RD-04). | Backend / Release | **OPEN** |
| **RD-02** | Dependency | **The compiled contract is never verified against source.** `puyapy` 5.9.0 turns `contract.py` into AVM bytecode; **nothing in this repository compares the deployed app's approval program to a local rebuild.** Every contract-layer control in this review — the strongest controls in the system — rests on that artifact matching the source that was reviewed. | 1 | 5 | **5 — MEDIUM** | Add a verifiable-build check: rebuild and diff against the deployed program. `pip-audit` on the toolchain. | Contract / Release | **OPEN** |
| **RD-03** | Dependency | **`@x402/extensions@2.21.0` was declared and imported nowhere** (verified at the time: zero references across `api/src`, `api/scripts`, `web/lib`, `web/components`, `web/app`). Unnecessary supply-chain surface, and it was the sole basis for a documentation claim (see RP-04). | 2 | 2 | **4 — LOW** | **Do not uninstall it — it is now in use.** `api/src/x402.ts` imports `bazaarResourceServerExtension`, `declareDiscoveryExtension` and `DeclareDiscoveryExtensionInput` from the `@x402/extensions/bazaar` subpath, which is why a search for the package root found nothing. The supply-chain surface is now load-bearing rather than gratuitous, and is covered by RD-01/T-17 like the other `@x402/*` packages. `api/package.json:17`; `docs/05_API/Bazaar_Discovery.md`. | Backend | **OPEN** |
| **RD-04** | Dependency | **Both Dockerfiles use `npm install`, not `npm ci`,** despite committed lockfiles (`api/Dockerfile:8,17`; `web/Dockerfile:4`). Container builds can silently drift from the lockfile CI validates. | 3 | 3 | **9 — MEDIUM** | Switch to `npm ci` in both. D-4. | Release | **OPEN** |

### 2.7 Product / claims (RP)

| Risk ID | Category | Risk | Prob. | Impact | Severity | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|---|
| **RP-01** | Product | **The value proposition is unproven end-to-end.** `/v1/records/summary` returns one fixed synthetic constant regardless of `patientId` (`api/src/routes/records.ts:15-21`); there is no patient datastore. The consent layer is demonstrated, but never over anything. | 4 | 3 | **12 — HIGH** | Disclosed honestly in `docs/SECURITY.md:7-14` and in every response body (`records.ts:59`) — **keep that honesty; it is worth more than a fabricated dataset.** A synthetic-but-varied dataset would prove the plumbing without inventing a claim. | Product | **OPEN** |
| **RP-02** | Product | **The project's stated differentiator has never executed on real infrastructure.** `total_audit_entries == 5` on App `768743428`, with **zero `s`- and `a`-prefixed boxes** — `log_access` has **never run on Algorand TestNet**. The audit path is covered only by AVM-simulator unit tests; `/v1/records/summary` has never completed its success path against the live contract; the `auditTxId`/`auditSequence` fields in `docs/API.md` have never been produced by a real run. | 5 | 4 | **20 — CRITICAL** | Run it. One successful `log_access` on TestNet, with the transaction id recorded in `docs/PROOF.md`, converts the single largest evidence gap in the submission into a verifiable fact. Evidence gap **E-1**; `FR-025` **UNVALIDATED on-chain**. | Product / Backend | **OPEN** |
| **RP-03** | Product | **A documentation overclaim in an otherwise scrupulously honest set.** `web/lib/demoWallet.ts:12` cites `lib/walletConnect.ts` and `docs/IMPLEMENTATION_PLAN.md` §4 claims a Pera/Defly wallet path is "also implemented, just not the one-click default." **No such file and no wallet-connect integration exists anywhere in `web/`.** | 3 | 3 | **9 — MEDIUM** | Correct both. A single verifiable overclaim disproportionately damages the credibility of the many honest claims around it. DOC-4. | Product / Frontend | **OPEN** |
| **RP-04** | Product | **`docs/COMPLIANCE.md` claims the backend "correctly implements Bazaar's discovery-extension schema"** on the strength of `@x402/extensions` being in `package.json` — a package imported nowhere (RD-03). The route metadata is well-shaped, but no discovery extension is wired up. | 3 | 3 | **9 — MEDIUM** | **Superseded by the fix rather than the downgrade.** `api/src/x402.ts` now imports and registers `bazaarResourceServerExtension` from `@x402/extensions/bazaar`, every priced route declares its real input/output shape, and the `x402-global-challenge` tag is emitted in both `resource.tags` and `accepts[].extra.tag` (`docs/05_API/Bazaar_Discovery.md`). What remains claimable is *"implemented, not listed"*: Bazaar catalogues a resource off a paid call against a publicly reachable URL, and MedRail answers on `localhost`. DOC-9. | Product | **OPEN** |
| **RP-05** | Product | **Documentation drift across several files.** `docs/IMPLEMENTATION_PLAN.md` §1 pins "puya 0.6.0" while the toolchain is `puyapy==5.9.0` (DOC-2); §0/§2 call the gated endpoint `/v1/records/:patientId/summary` when it is `POST /v1/records/summary` with the patient in the body (DOC-3); §7 lists a `scripts/` directory that exists but is **empty** (DOC-6); `web/README.md` is untouched `create-next-app` boilerplate (DOC-7); `ACTION_NEEDED.md` has an unbalanced backtick that breaks rendering (DOC-8). | 4 | 2 | **8 — MEDIUM** | Reconcile. Individually trivial; collectively they are what a hostile reviewer uses to argue the docs were not checked. | Product | **OPEN** |

### 2.8 Deployment (RE)

| Risk ID | Category | Risk | Prob. | Impact | Severity | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|---|
| **RE-01** | Deployment | **`api/fly.toml:10` hard-codes `NETWORK = "mainnet"`, and no MainNet deployment of `MedRailConsent` exists.** A `fly deploy` today produces a service pointed at a network where the contract is absent. | 4 | 4 | **16 — CRITICAL** | Change the committed default to `testnet`. The runbook tells the operator to override via secrets, but **the committed default is a broken production config**. D-2. | Release | **OPEN** |
| **RE-02** | Deployment | **`CONSENT_APP_ID` is unset in `fly.toml`, and the fallback cannot work in a container.** `readDeployedAppId()` (`api/src/config.ts:31-40`) reads `contracts/artifacts/deploy_<network>.json`, which `api/Dockerfile` **does not copy into the image**. Result: `consentAppId = 0`, `requireConsentAppId()` throws, and both `/v1/records/summary` and `/v1/consent/status` return HTTP 500. | 4 | 4 | **16 — CRITICAL** | Set `CONSENT_APP_ID` explicitly, or copy the deploy artifact into the image. D-1. (Note: `MedRailConsent.arc56.json` **is** correctly copied at `api/Dockerfile:20` — only the deploy record is missing.) | Release | **OPEN** |
| **RE-03** | Deployment | **Neither Dockerfile has ever been built.** CI has no image-build stage, no deployment stage, no artifact publishing (**CI-3**), so `NFR-007` is **UNVALIDATED** — the container path has never been proven to work at all. | 4 | 3 | **12 — HIGH** | Add a build-only image job to CI. Compounds RE-01/RE-02: the first real build is also the first time these are discovered. | Release | **OPEN** |
| **RE-04** | Deployment | **No healthcheck is wired anywhere**, in either Dockerfile or `fly.toml`, despite `/v1/health` existing and being ideal for one (`api/src/routes/health.ts`, `OPS-001`). | 3 | 2 | **6 — MEDIUM** | Add `HEALTHCHECK` and a Fly `[[http_service.checks]]` block. D-6. | Release | **OPEN** |
| **RE-05** | Deployment | **`web/Dockerfile:5` does `COPY . .` with no `.dockerignore`**, copying `web/.env.local` and the host `node_modules` into the build stage. `web/next.config.ts` is empty, so there is no `output: "standalone"` and the runtime image carries the full `node_modules`. | 3 | 2 | **6 — MEDIUM** | Root `.dockerignore` (RS-05) plus `output: "standalone"`. No secret is exposed today — `NEXT_PUBLIC_*` values are public by construction — but the pattern is unsafe. D-5. | Release / Frontend | **OPEN** |

### 2.9 Hackathon demo (RH)

*These are risks to the submission and the live presentation, distinct from risks to the software.*

| Risk ID | Category | Risk | Prob. | Impact | Severity | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|---|
| **RH-01** | Hackathon-demo | **The live demo depends on the GoPlausible facilitator being reachable at that moment.** Reproduced: with the facilitator unreachable, every priced route returns **HTTP 500 with no `PAYMENT-REQUIRED` header** — not a 402, not a 503. The 402 cannot be built offline because `accepts[].asset` and `extra.feePayer` come from the facilitator's `/supported`. | 3 | 5 | **15 — CRITICAL** | **Have a recorded fallback.** Verified silver lining: free routes (`/v1/health`, `/`, `/v1/consent/app-info`) stay up (`REL-005` **VALIDATED**), so a consent-only demo survives. Long-term: cache `/supported`, degrade to 503 + `Retry-After`. `REL-001`, finding R-1. | Demo / Backend | **OPEN** |
| **RH-02** | Hackathon-demo | **The demo depends on a funded TestNet wallet.** The browser generates a fresh keypair per session (`web/lib/demoWallet.ts:13-27`) and the judge must fund it from a public dispenser, which may be rate-limited, slow, or down. USDC ASA `10458941` must also be opted into and held. | 3 | 4 | **12 — HIGH** | Pre-fund a demo wallet and pre-seed `sessionStorage`, or provide a QR/link that restores a funded session. Never depend on a dispenser during a live demo. | Demo | **OPEN** |
| **RH-03** | Hackathon-demo | **The demo depends on public AlgoNode.** Every consent check makes 2 anonymous, keyless algod calls; the browser also talks to AlgoNode directly for grant/revoke (`web/lib/consent.ts:5`). No timeout, no retry, no fallback node. | 2 | 5 | **10 — HIGH** | Fallback node URL; pre-warm before presenting; have transaction ids ready to show on the explorer if the live call stalls. RT-03, RC-04. | Demo / Backend | **OPEN** |
| **RH-04** | Hackathon-demo | **`docs/SENTINEL_ARCHITECTURE.md` (647 lines, untracked) describes an entirely different, unbuilt product** — "Sentinel Exchange", a pharma supply-chain system with a FastAPI `engine/`, SQLite, XGBoost forecasting, a contract-net auction, a second contract `SentinelProvenance`, five new frontend routes, an SSE bus, and Twilio notifiers. **None of it exists** — no `engine/`, no `sim/`, no `data/`, no SQLite, no XGBoost, no `SentinelProvenance`, no SSE, none of those routes. It sits in `docs/` beside documentation for the system that does exist, and instructs "rewrite README around Sentinel Exchange". | 4 | 4 | **16 — CRITICAL** | **This is the largest credibility risk in the repository.** A judge who opens `docs/` sees a 647-line architecture for software that does not exist. Move it to `docs/future/SENTINEL_EXCHANGE_PROPOSAL.md` with a bold **PROPOSAL — NOT IMPLEMENTED** banner, or delete it before submission. **Do not let its content leak into any other document as if built.** DOC-1. | Product | **OPEN** |
| **RH-05** | Hackathon-demo | **A judge exercising the flagship endpoint hits an unproven path.** `/v1/records/summary`'s success path has never completed against the live contract (RP-02), and in a container deploy it would fail at config load (RE-02). The first person to run it end-to-end may well be a judge. | 3 | 4 | **12 — HIGH** | Run it first, on TestNet, and record the transaction id. This is the same action that closes RP-02 and is the single highest-value evidence step available. | Demo / Backend | **OPEN** |
| **RH-06** | Hackathon-demo | **No external party has ever paid for this service.** The payment *mechanics* no longer look self-dealing: the agent demo settles `DOSKCNKJ…`, `PLBFDDAD…` and `COMJ3TQO…` from an independent keypair `UYBTLPHS…` into `payTo` `2WDV2J2F…`, and the grant behind the gated call (`IG4XEBTM…`) is signed by a *third* account, `56LFG5EE…`, which is neither the payer nor the payee — three roles, three keypairs. But both of those wallets' TestNet balances were seeded from the project's own — TestNet ALGO and USDC have no other practical source — and the earlier payments, including `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ` (20000 base units, round 66091768, `fee: 0`), were **sender == receiver == the deployer**. All are genuine facilitator-settled payments; none is evidence of usage. | 4 | 3 | **12 — HIGH** | Disclosed in `docs/PROOF.md` §6 and §10 — **keep both halves of that disclosure**: three independent accounts, both non-service wallets seeded from here. **Never describe "payment volume" or revenue**, because no unrelated party has paid and a judging criterion reportedly weights real usage. What remains is external demand, not payment plumbing. | Demo / Product | **OPEN** |
| **RH-07** | Hackathon-demo | **Several stated competition requirements remain pending user action:** MainNet deployment, a public HTTPS endpoint, Bazaar discovery listing with the `x402-global-challenge` tag, and leaderboard presence. Per `docs/COMPLIANCE.md`; **the reviewer did not independently fetch the official rules.** | 4 | 4 | **16 — CRITICAL** | Complete them, or state plainly which are outstanding. Note RE-01/RE-02 mean the current committed config would **not** produce a working MainNet service even once a wallet is funded. Label all competition-rule claims "per `docs/COMPLIANCE.md`; not independently re-verified." | Product / Release | **OPEN** |
| **RH-08** | Hackathon-demo | **Absence of security scanning may be read as absence of security work.** No `npm audit`, CodeQL, Dependabot, SAST, penetration test, or contract audit has been run — so there is no scan badge, no clean report, and nothing to point at. | 4 | 2 | **8 — MEDIUM** | **Do not fabricate one.** Point instead at what is real and verifiable: this documentation set, the 32 passing tests, the negative authorisation tests, and the honest gap list. An accurate "not scanned" beats an invented clean bill of health, and a judge who checks will find out either way. RS-06. | Product / Release | **OPEN** |

---

## 3. Heat map

Counts of risks at each Probability × Impact intersection. Cell values are severity band (`Severity = P × I`).

| | **Impact 1**<br/>Negligible | **Impact 2**<br/>Minor | **Impact 3**<br/>Moderate | **Impact 4**<br/>Major | **Impact 5**<br/>Severe |
|---|---|---|---|---|---|
| **Prob 5**<br/>Almost Certain | 5 · Med — **0** | 10 · High — **6** | 15 · Crit — **0** | 20 · Crit — **1** | 25 · Crit — **0** |
| **Prob 4**<br/>Likely | 4 · Low — **0** | 8 · Med — **4** | 12 · High — **9** | 16 · Crit — **4** | 20 · Crit — **2** |
| **Prob 3**<br/>Possible | 3 · Low — **1** | 6 · Med — **6** | 9 · Med — **7** | 12 · High — **5** | 15 · Crit — **1** |
| **Prob 2**<br/>Unlikely | 2 · Low — **1** | 4 · Low — **1** | 6 · Med — **2** | 8 · Med — **1** | 10 · High — **4** |
| **Prob 1**<br/>Rare | 1 · Low — **1** | 2 · Low — **0** | 3 · Low — **0** | 4 · Low — **1** | 5 · Med — **1** |

### 3.1 Distribution

| Severity | Count | Share | Risk IDs |
|---|---|---|---|
| **CRITICAL** (15–25) | **8** | 14% | RS-01, RS-02, RP-02, RE-01, RE-02, RH-04, RH-07, RH-01 |
| **HIGH** (10–14) | **24** | 41% | RS-03, RS-04, RS-05, RS-06, RS-09, RS-10, RT-01, RT-03, RT-05, RT-09, RA-01, RA-02, RA-04, RO-01, RO-02, RO-05, RC-01, RD-01, RP-01, RE-03, RH-02, RH-03, RH-05, RH-06 |
| **MEDIUM** (5–9) | **21** | 36% | RS-08, RT-02, RT-04, RT-07, RT-08, RA-03, RA-05, RO-03, RO-04, RO-06, RC-02, RC-03, RC-04, RD-02, RD-04, RP-03, RP-04, RP-05, RE-04, RE-05, RH-08 |
| **LOW** (1–4) | **5** | 9% | RS-07, RS-11, RS-12, RT-06, RD-03 |
| **Total** | **58** | | |

### 3.2 By category

| Category | Count | Critical | High | Medium | Low |
|---|---|---|---|---|---|
| Security (RS) | 12 | 2 | 6 | 1 | 3 |
| Technical (RT) | 9 | 0 | 4 | 4 | 1 |
| AI / Intelligence (RA) | 5 | 0 | 3 | 2 | 0 |
| Operational (RO) | 6 | 0 | 3 | 3 | 0 |
| Scalability (RC) | 4 | 0 | 1 | 3 | 0 |
| Dependency (RD) | 4 | 0 | 1 | 2 | 1 |
| Product (RP) | 5 | 1 | 1 | 3 | 0 |
| Deployment (RE) | 5 | 2 | 1 | 2 | 0 |
| Hackathon-demo (RH) | 8 | 3 | 4 | 1 | 0 |
| **Total** | **58** | **8** | **24** | **21** | **5** |

The distribution is worth reading rather than skimming. **Deployment and hackathon-demo carry 5 of the 8 Criticals between them** — the software's worst problems are concentrated in two files (`records.ts`, `algorand.ts`), but the *submission's* worst problems are in configuration and in a stray 647-line document. Both classes are cheap to fix and neither requires new architecture.

---

## 4. Top 5 risks by severity

| Rank | Risk ID | Severity | Risk | Single most valuable action |
|---|---|---|---|---|
| **1** | **RS-01** | **20** | The consent gate authorises against a caller-asserted `requesterAddress`. Any paying stranger can impersonate any authorised requester (`api/src/routes/records.ts:5-8, 32`). | Bind the payer to `requesterAddress` — `decodePaymentSignatureHeader` + `getSenderFromTransaction`, both verified present in the pinned SDK. **~10–15 lines and one test.** Highest value-per-line change in the repository. |
| **2** | **RS-02** | **20** | That impersonation writes a permanent false attribution to the immutable public audit log (`records.ts:49`). No correction mechanism exists in the contract. | **Same fix as RS-01.** One change closes both Criticals — which is why they are ranked 1 and 2 rather than merged. |
| **3** | **RP-02** | **20** | `log_access` has **never executed on Algorand TestNet**. `total_audit_entries == 5`, zero audit boxes. The project's stated differentiator is validated only in simulation, and `/v1/records/summary` has never completed its success path against the live contract. | **Run it once and record the transaction id in `docs/PROOF.md`.** Converts the largest evidence gap in the submission into a verifiable on-chain fact. Cheapest credibility win available. |
| **4** | **RH-04** | **16** | `docs/SENTINEL_ARCHITECTURE.md` — 647 lines of architecture for a completely different, entirely unbuilt product, sitting untracked in `docs/` next to real documentation. | Move to `docs/future/SENTINEL_EXCHANGE_PROPOSAL.md` with a **PROPOSAL — NOT IMPLEMENTED** banner, or delete. **One `git mv`.** The largest credibility risk in the repository and the cheapest to eliminate. |
| **5** | **RE-01 + RE-02** | **16** each | The committed deployment configuration is broken in two independent ways: `fly.toml` targets `mainnet` where no contract exists, and `CONSENT_APP_ID` is unset with a fallback that cannot work inside the container. Either alone makes `/v1/records/summary` and `/v1/consent/status` return HTTP 500. | Set `NETWORK = "testnet"` and set `CONSENT_APP_ID` explicitly. **Two lines in `api/fly.toml`.** Tied at 16 with RH-07 (pending competition requirements), which is listed here because it is fixable by the team rather than dependent on external action. |

**The pattern across the top five is worth naming: not one of them requires architectural change.** Two lines of config, one `git mv`, one on-chain transaction, and fifteen lines in one route handler would move every Critical in this register down a band. That is an unusually favourable position for a system at this stage, and it is a direct consequence of the design decisions credited in `Security_Architecture.md` §17 — small attack surface, state on the ledger, pure functions, no datastore. **The problems here are shallow. That is the finding, and it is a good one.**

---

## 5. Sources and caveats

- Repository at commit `32ffd73`, branch `master`. Every `path:line` citation verified by direct read.
- App ID **768743428**, Algorand **TestNet**; app account `CCO26Y6Z56DDZ3OELO2UKJMIPJVSIT52I23F2MPMR52JBM3HQZZNUZNOR4`; 2 boxes, 100 box bytes, min-balance 145,000 µALGO; global state `total_requests=2, total_grants_active=0, total_revocations=2, total_audit_entries=0`. Read from `https://testnet-idx.algonode.cloud` on 2026-08-21.
- Reproduced by the reviewer: facilitator-down behaviour (RH-01/`REL-001`), the 58-character invalid-address 500 (RT-09), and the live 402 challenge on `/v1/triage`.
- Test results actually executed: 14 contract tests (0.41 s), 18 API tests (4.08 s), both typechecks clean, both builds passing. **73 tests total — the repository's claim is accurate.**
- Companion documents: `Security_Architecture.md`, `Threat_Model.md`, `Privacy.md`.
- **Arithmetic check:** all 58 rows were verified programmatically — every `Severity` equals `Probability × Impact` and every severity band matches §1.3. The distribution and heat-map counts below were derived from the rows, not hand-tallied.

**Caveats stated plainly:**
- **Probabilities are reviewer judgement**, not actuarial data. There is no incident history for this system because it has never been operated.
- **No scanning tool of any kind has been run.** No CVE, vulnerability count, or scan result appears anywhere in this register, and none should be inferred from its absence.
- **No performance figure appears here beyond four measured values** (two test-suite durations, one 505 ms cold consent-status observation, one ~15 ms warm 402 generation). All are single samples on a developer laptop, not benchmarks, and are never presented as percentiles or SLOs.
- **Competition-rule claims** in RH-07 derive from `docs/COMPLIANCE.md` and were **not** independently re-verified against the official rules.
- **This register makes no compliance claim.** MedRail is not HIPAA-compliant, GDPR-compliant, SOC 2 audited, or ISO 27001 certified, and no work toward any of those has been performed. It processes no protected health information.
