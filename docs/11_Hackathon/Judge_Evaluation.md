# MedRail — Adversarial Judge Evaluation


> **⚠ Correction notice.** Parts of this document were written against a review finding that was
> later proven wrong. Settlement in x402 v2 happens **only** on a sub-400 response, so **no error
> path in MedRail can consume a settled payment** — and consent-denied calls (HTTP 403) are **not
> charged**, contrary to `API.md`, `SECURITY.md`, and the `paidButDenied` field. The audit-sequence
> race causes a **rejected transaction**, not a corrupted log. See
> [`CORRECTIONS.md`](../CORRECTIONS.md) — it supersedes any statement here that contradicts it.

**Purpose:** an intentionally hostile, evidence-anchored assessment of MedRail as an entry to the Algorand Foundation Global x402 Challenge, written to surface everything a competent judge would find before they find it.

**Status of this document:** Reviewer assessment, 2026-08-21. Scores and weights below are **this reviewer's own**, not an official rubric. The four judging criteria referenced (real usage, use-case quality, technical execution, long-term potential) are taken from `docs/COMPLIANCE.md:31-33`; **the official rules were not independently re-fetched during this review**. No score, ranking, prize figure, competitor count, or official weighting is asserted anywhere in this document.

Companion documents: [`../02_Requirements/Requirements_Gap_Analysis.md`](../02_Requirements/Requirements_Gap_Analysis.md), [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md), [`Winning_Strategy.md`](Winning_Strategy.md).

---

## 0. Finding IDs used throughout

Stable IDs, referenced by every document in this set:

| ID | One line |
|---|---|
| **S-1** | `requesterAddress` is caller-asserted and never bound to the payer — the consent gate is not an access control. |
| **E-1** | `log_access` has never executed on TestNet; `total_audit_entries == 0`, zero audit boxes exist. |
| **R-1** | Facilitator outage turns every priced route into HTTP 500 (no 402, no 503, no `Retry-After`). |
| **R-2** | A settled payment can be consumed and the resource never delivered (success-path `logAccess` is unguarded). |
| **R-3** | A 58-character-but-invalid address returns HTTP 500 and leaks the internal exception message. |
| **R-4** | No timeout, retry, or circuit breaker on any algod call. |
| **C-1** | `request_access` emits its ARC-28 event with `patient` and `requester` swapped. |
| **C-2** | `GRANT_BOX_MBR` under-reports true box MBR by 400 µALGO per box. |
| **CI-1** | CI triggers on `main`; the only branch is `master`. CI has never run. |
| **D-1 / D-2** | `fly.toml` ships `NETWORK = "mainnet"` with no `CONSENT_APP_ID`; a `fly deploy` today produces a broken service. |
| **D-7** | `fly.toml` permits >1 machine while the audit-sequence lock is in-process only. |
| **DOC-1** | A 647-line architecture document for a different, unbuilt product sits in `docs/`. |
| **DOC-9** | "Implements Bazaar's discovery-extension schema" is unsupported — `@x402/extensions` is declared but imported nowhere. |

---

## 1. Scores

Scale: 0 = absent/broken, 5 = credible hackathon work, 7 = notably above the field, 9–10 = would hold up outside a hackathon. Weights are this reviewer's, chosen to approximate the four criteria in `docs/COMPLIANCE.md`.

### 1.1 Problem significance — **7 / 10** (weight 8%)

Patient control over health-record access is a real, unsolved, socially consequential problem, and the specific framing — *consent as a queryable on-chain predicate rather than a checkbox inside a vendor's database* — is the right shape of the problem.

Deducted because the instantiation is thin. `api/src/routes/records.ts:15-21` returns one hard-coded `SYNTHETIC_RECORD` constant regardless of `patientId`; there is no patient datastore, no record ingestion, no encryption pipeline (`DATA-006` is **PLANNED**, no code). The system models the *permission* to see a record without modelling a record. That is a legitimate scoping decision for a hackathon and it is disclosed honestly in `docs/SECURITY.md`, but it caps how significant the demonstrated problem can be.

### 1.2 Innovation / novelty — **6 / 10** (weight 8%)

The genuinely novel contribution is not the consent registry — those are a well-trodden category — it is the **argued** endpoint split at `docs/ARCHITECTURE.md:30-46`: a consent-gated endpoint cannot generate payment volume by construction (one patient, one doctor, a handful of calls a year), so the entry deliberately carries two open endpoints that any stranger's agent can pay for in one round trip, sharing one on-chain trust layer with the gated one. Most teams will submit either a volume play or an ownership play. Submitting both with a written argument for why is unusual.

The second real idea is composing "you paid" and "you were allowed" into a single call (`records.ts:32` then `records.ts:49`). That is a genuinely new x402 pattern.

Deducted because both ideas are currently better argued than demonstrated (see E-1, S-1), and because the "AI" half of the pitch contributes zero novelty.

### 1.3 Technical complexity — **6 / 10** (weight 8%)

Real, non-trivial on-chain work: ARC-4 contract with three `BoxMap`s and a sha256-derived 32-byte grant key (`contract.py:95-103`), a per-patient monotonic audit sequence implemented as read-then-write with predicted box keys (`contract.py:217-236` / `algorand.ts:146-178`), ARC-28 event emission, a committed ARC-56 spec served over HTTP (`app.ts:63-69`), readonly methods executed via `atc.simulate()` so consent reads cost nothing (`algorand.ts:80-100`), and a per-patient promise-chain lock for sequence collisions (`algorand.ts:129-140`).

Deducted honestly: there is no database, no queue, no worker, no cache, no distributed component, no model. The whole system is ~600 lines of substance across three languages. It is *correctly-shaped* complexity, not *large* complexity.

### 1.4 Engineering quality — **7 / 10** (weight 10%)

The best-scoring dimension after evidence quality, and the score is earned by things judges rarely see:

- Comments that record *why*, including a regression post-mortem: `app.ts:25-30` explains that a hand-maintained CORS `allowHeaders` allowlist previously drifted from what `@x402/fetch` sends and broke every paid call.
- `algorand.ts:16-19` explains why ABI methods are hand-constructed rather than parsed from ARC-56 (avoiding algosdk ARC-56-vs-ARC-4 parsing drift) — a decision with a stated cost.
- `contract.py:154-159` explains why the active-grant counter keys off prior *status*, not prior *existence*. That is the kind of subtle correctness detail most submissions get wrong silently.
- `x402.ts:8-10`: only the configured network is registered, so a testnet process cannot accept a mainnet-signed payment (`NFR-002`).
- Strict TypeScript, zero errors in both `api/` and `web/`; both build clean.

Deducted for: two confirmed contract defects (C-1, C-2); **three independent implementations of the same box-key derivation** (`contract.py:96-98`, `algorand.ts:64-70`, `web/lib/consent.ts:25-33`) with **no cross-implementation test** (`NFR-011`, **UNVALIDATED**) — a change to the `"g"` prefix or the hash input silently breaks two of three; a declared-but-unimported dependency (`@x402/extensions`, DOC-9); and a committed production config that is wrong on two axes (D-1, D-2).

### 1.5 "AI" usage — **3 / 10** (weight 5%)

`api/src/services/triageScorer.ts` is substring matching over **11** hard-coded red-flag entries with fixed weights, summed and capped at 100, bucketed into four bands. `api/src/services/interactionChecker.ts` is bidirectional substring containment over a **14-row** JSON table. There is no model, no embedding, no training, no dataset, no evaluation harness, and no measured sensitivity or specificity (`AI-005`, **NOT IMPLEMENTED**).

The engineering is defensible — deterministic, inspectable, disclaimered, and unit-tested (13 of the 32 tests cover exactly these two functions). `AI-001` and `AI-002` are **VALIDATED**. But `README.md:4` and `web/app/page.tsx:18` both say "AI intelligence endpoints", and the gap between that phrase and `str.includes()` is the single easiest place for a judge to land a hit.

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

### 1.6 Scalability — **3 / 10** (weight 5%)

Audit writes serialise through `withPatientLock` (`algorand.ts:129-140`), an **in-process** `Map<string, Promise>`. `api/fly.toml:18-19` sets `auto_start_machines = true` with `min_machines_running = 1` — a floor, not a ceiling. Two machines sharing one `OPERATOR_MNEMONIC` reintroduce exactly the read-then-write race the lock exists to prevent (D-7, `REL-004` **PARTIALLY IMPLEMENTED**). The mitigation documented in `docs/SECURITY.md` is contradicted by the deployment config committed next to it.

Beyond that: no rate limiting anywhere (`SEC-013`), a free unauthenticated `/v1/consent/status` that makes two outbound algod calls per request (usable to exhaust the API *and* to amplify traffic at AlgoNode), no caching, no connection pooling, no timeouts (R-4), and no load test of any kind — no latency, throughput, or concurrency number exists anywhere in the repository (`PERF-003`, **NOT IMPLEMENTED**).

Every audit write in the entire system also funnels through one operator account, which is a global serialisation point regardless of instance count.

### 1.7 Security — **3 / 10** (weight 12%)

**S-1 alone justifies this score.** `api/src/routes/records.ts:5-8`:

```ts
const bodySchema = z.object({
  patientId: z.string().length(58),
  requesterAddress: z.string().length(58),   // caller-asserted, never authenticated
});
```

Nothing binds `requesterAddress` to the identity that paid. The x402 middleware proves *a* payment settled; it never tells the handler *who paid*, and the handler never asks. Grant transactions are public — `grant_access` has the patient as sender and the requester address as ABI arg 0, both readable from any indexer. An attacker enumerates valid `(patient, requester)` pairs from the app's own transaction history, pays the ordinary $0.05, and sends `{patientId: <victim>, requesterAddress: <authorised third party>}`. `check_access` returns `true` — the grant genuinely exists — and the record is returned. **Any paying stranger can impersonate any authorised requester.**

The second-order effect is worse than the first. `records.ts:49` writes the *claimed* requester into the immutable per-patient audit trail. A successful impersonation produces a permanent, on-chain, cryptographically-attested **false attribution** — and it is trusted precisely because it is on-chain. `SEC-008` is **NOT IMPLEMENTED**.

Nothing sensitive leaks in this build only because the response is a fixed constant (`records.ts:15-21`) and because the demo always sends payer == requester (`LiveDemoPanel.tsx:38`). The flaw is invisible on stage and fatal in production.

Also open: `SEC-010` (length-only address validation → R-3), `SEC-011` (`app.ts:60` returns `err.message` verbatim to unauthenticated callers), `SEC-012` (a single hot `OPERATOR_MNEMONIC` in an env var that is simultaneously the contract admin — compromise means forged audit entries, `set_admin` lockout, and `withdraw_excess` drain; no multisig, no HSM, no rotation runbook), `SEC-013`, `SEC-014` (no `npm audit`, no `pip-audit`, no CodeQL, no Dependabot), `SEC-015` (no `.dockerignore` anywhere; `api/.env` and `contracts/.env`, both holding live mnemonics, sit inside the root build context — one careless `COPY api/ ./api/` from a leaked secret).

Credited, and genuinely good: no patient private key ever reaches the backend — `grant_access`/`revoke_access` are signed client-side in `web/lib/consent.ts:41-60` and submitted straight to AlgoNode (`NFR-008`, **IMPLEMENTED**, verified true). `log_access` and `withdraw_excess` are admin-gated on-chain (`contract.py:222`, `contract.py:258`) with both rejection paths unit-tested (`SEC-001`, `SEC-002`, **VALIDATED**). No PHI reaches the ledger (`SEC-004`). No `.env` is tracked by git (`SEC-005`, **VALIDATED**). These are real controls and they should be said out loud — they just do not offset a broken front door.

### 1.8 UX — **6 / 10** (weight 5%)

One route (`web/app/page.tsx`), dark, dense, and honest. A visitor with no wallet gets a browser-generated TestNet keypair and can attempt a real payment in two clicks (`web/lib/demoWallet.ts`). Settled transactions render as clickable Lora links (`LiveDemoPanel.tsx:154-163`). The failure path is explained rather than hidden: `LiveDemoPanel.tsx:165-170` tells the user that a real payment *was* constructed and signed and that settlement was rejected for want of TestNet USDC, with a dispenser link. That is better failure UX than most production software.

Deducted: the mnemonic is stored as plaintext JSON in `sessionStorage` (bounded to play money, disclosed in the UI, but any XSS on the page exfiltrates it); there is no wallet-connect path at all (see DOC-4 below); and the consent panel demonstrates self-granting only (`ConsentChecker.tsx:32` — wallet address as both patient and requester), which is precisely the configuration in which S-1 cannot manifest.

### 1.9 Reliability — **3 / 10** (weight 7%)

Four independent single points of failure, all reproduced:

- **R-1:** with the facilitator unreachable, the first request to a priced route fails inside `x402ResourceServer.initialize()` and the caller gets **HTTP 500 with no `PAYMENT-REQUIRED` header** — not a 402, not a 503, no `Retry-After`. Root cause is structural: `accepts[].asset` and `extra.feePayer` come from the facilitator's `/supported`, not from MedRail config (`x402.ts:16-32` deliberately omits `asset`), so the 402 cannot be constructed offline. There is no timeout, retry, circuit breaker, or cached-`/supported` fallback. `REL-001` **NOT IMPLEMENTED**.
- **R-2:** the asymmetry at `records.ts:37` vs `records.ts:49` is the sharpest finding in the file. The **denied** path wraps `logAccess` in `.catch(() => undefined)`. The **allowed** path does not. If that on-chain write throws — operator out of ALGO, app account out of box MBR, algod 5xx, validity window expiry — the request falls to `app.onError` and returns **HTTP 500 after the payment has already settled**. The caller paid $0.05 and receives nothing, with no refund path, no retry token, and no record that they are owed anything. `REL-002` **NOT IMPLEMENTED**.
- **R-3:** `GET /v1/consent/status?patient=AAAA…(58 chars)` returns 500 with `{"error":"wrong checksum for address"}`. A client input error reported as a server error, plus internal-detail disclosure.
- **R-4:** `algorand.ts:5` — `new algosdk.Algodv2("", config.algodServer, "")`. No timeout. No retry. `atc.execute(algod, 4)` at `algorand.ts:175` waits four rounds and throws. One AlgoNode blip is a user-visible 500 on two endpoints.

Credited: `REL-005` is **VALIDATED** — free endpoints stay up with the facilitator down, so blast radius is bounded to the three priced routes.

### 1.10 Demonstrability — **7 / 10** (weight 10%)

What can be shown live, right now, and checked by a judge on their own laptop against public infrastructure:

- App **768743428**, created round **66088624**, `deleted: false`, verified this morning against `testnet-idx.algonode.cloud`. Not a screenshot.
- A settled x402 payment: `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ`, `axfer`, asset `10458941`, amount **20000** base units, confirmed round **66091768**, `fee: 0`.
- A full consent lifecycle as four real transactions (`5XIADMCG…`, `X2BQ5FD4…`, `OV2J2T5V…`, plus funding `KYH3H5CG…`).
- A live 402 with a decodable `PAYMENT-REQUIRED` header carrying the real asset id and real fee-payer address.

Deducted hard for two things. **Nothing is publicly hosted** — no URL a judge can hit without cloning the repo and running three processes. And **the flagship gated endpoint's success path has never completed end-to-end** (E-1): the one beat that would prove the differentiator cannot currently be demonstrated at all.

### 1.11 Business potential — **4 / 10** (weight 6%)

$0.02 per call for keyword matching over 11 rules has no moat and no pricing power; the same function is a free npm package. The asset with actual commercial value is the consent registry plus the audit trail — a neutral, patient-signed, queryable permission substrate that a health system could point at without trusting MedRail. That is a real thing to sell. But it is monetised at $0.05 per read, which is the wrong revenue model for it (the value is in being the registry of record, not in charging per lookup), and the endpoint that would prove it does not authenticate its callers (S-1).

No customer, no pilot, no letter of intent, no MainNet, no distribution channel, and one payment — which the payer made to themselves.

### 1.12 Social impact — **5 / 10** (weight 4%)

The thesis — patients hold a revocable, publicly-auditable key to their own records, and every access leaves a trail the patient can read without asking permission — is genuinely worth building, and the architecture supports it rather than gesturing at it (`SEC-003` **VALIDATED**: only `Txn.sender` can grant or revoke on their own behalf; `contract.py:149-151`, `contract.py:179-181`).

Held to 5 because nothing here has touched a real patient, a clinician, a health system, or a regulator; there is no clinical validation and none is claimed; and the audit trail that carries most of the social value has never been written (E-1).

### 1.13 Competitive differentiation — **6 / 10** (weight 6%)

Against the field this entry is likely to face, three things stand out: an argued rather than assumed endpoint strategy (`docs/ARCHITECTURE.md:30-46`); off-the-shelf x402 client compatibility as a *defended* decision rather than an accident (`docs/ARCHITECTURE.md:95-108` explains why `log_access` is deliberately not bundled into the client's signed payment group — bundling would require every caller to know MedRail's app id and method signature and would break `@x402/fetch` compatibility); and a compliance document that contains a "What this document does not claim" section (`docs/COMPLIANCE.md:68-75`).

Held to 6 because the differentiator does not currently work (S-1) and has never run (E-1). Differentiation you can only describe is worth roughly half of differentiation you can execute on stage.

### 1.14 Evidence quality — **8 / 10** (weight 6%)

The highest score here, and it is deserved. `docs/PROOF.md` gives a reproduction command for essentially every claim it makes, then independently re-verifies the result against the public indexer rather than trusting the deploy script or the facilitator response (`PROOF.md:95-99`, `PROOF.md:132-141`). `PROOF.md:143-147` volunteers that the settled payment was a self-payment before anyone asks. `COMPLIANCE.md` distinguishes "✅ Done" from "⏳ Pending — user action" line by line and states plainly that no MainNet transaction has been made and none will be. This is materially rarer and more valuable than teams realise; it converts every other claim in the repository from assertion into checkable fact.

Deducted three points for three specific failures of the same discipline:

- **E-1.** Every evidence-bearing document presents the on-chain audit log as the differentiator. `total_audit_entries == 0` and there are zero `s`- or `a`-prefixed boxes on the deployed app — confirmed live against the indexer during this review. The mechanism is evidenced only in an AVM simulator. `FR-012` and `FR-025` are **UNVALIDATED on-chain**.
- **DOC-9.** `COMPLIANCE.md:27` claims the backend's metadata "is already in the shape Bazaar's discovery extension expects (see `@x402/extensions` dependency)". `@x402/extensions` is declared in `api/package.json` and imported **nowhere** in `api/src/`. A dependency in a manifest is not an implementation.
- **DOC-4.** `web/lib/demoWallet.ts:12` points at `lib/walletConnect.ts`, which does not exist, and `docs/IMPLEMENTATION_PLAN.md` §4 claims a real-wallet (Pera/Defly) path "is also implemented, just not the one-click default." **It is not implemented.** There is no wallet-connect code anywhere in `web/`. In a documentation set that is otherwise scrupulous, this is the one clear overclaim, and it is the one a judge who greps for `walletConnect` will find in ten seconds.

---

## 2. Weighted overall

| # | Dimension | Weight | Score | Contribution |
|---|---|---:|---:|---:|
| 1 | Problem significance | 8% | 7 | 0.56 |
| 2 | Innovation / novelty | 8% | 6 | 0.48 |
| 3 | Technical complexity | 8% | 6 | 0.48 |
| 4 | Engineering quality | 10% | 7 | 0.70 |
| 5 | "AI" usage | 5% | 3 | 0.15 |
| 6 | Scalability | 5% | 3 | 0.15 |
| 7 | Security | 12% | 3 | 0.36 |
| 8 | UX | 5% | 6 | 0.30 |
| 9 | Reliability | 7% | 3 | 0.21 |
| 10 | Demonstrability | 10% | 7 | 0.70 |
| 11 | Business potential | 6% | 4 | 0.24 |
| 12 | Social impact | 4% | 5 | 0.20 |
| 13 | Competitive differentiation | 6% | 6 | 0.36 |
| 14 | Evidence quality | 6% | 8 | 0.48 |
| | **Overall** | **100%** | | **5.4 / 10** |

**Counterfactual.** Closing S-1 and E-1 — and nothing else — moves security 3→6, demonstrability 7→9, differentiation 6→7, evidence quality 8→9, for an overall of **≈6.1 / 10**. Roughly 0.7 points, about a 13% relative gain, for what is measured in `Winning_Strategy.md` as **under three hours of work**. Nothing else in the backlog comes close to that ratio. That fact alone should determine the next three hours of this team's time.

---

## 3. Why this could win

There is a real case, and it is stronger than the score above suggests, because several of these things are hard to fake and most competing entries will not have them.

**1. A deployed contract a judge can verify without your help.** App `768743428`, created at round `66088624`, `deleted: false`, admin set, 5 ALGO funded, two grant boxes live. That is checkable from any public indexer in one `curl`, with no reliance on your slides, your laptop, your uptime, or your honesty:

```
curl -s https://testnet-idx.algonode.cloud/v2/applications/768743428
```

Independently confirmed during this review. A judge who runs that command has verified you without trusting you — that is a different category of evidence from a demo video.

**2. A real settled payment with the full unit-conversion story intact.** Transaction `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ`: `axfer`, asset `10458941` (TestNet USDC, 6 decimals), amount **20000** base units — exactly `$0.02`, and *nothing in this repository hardcodes either the asset id or that conversion*. `api/src/x402.ts:16-32` deliberately omits an `asset` field so the SDK's money parser resolves it from the facilitator's live `/supported`. The 20000 in that transaction is the protocol working, not a constant you typed. `fee: 0` proves fee sponsorship worked: the caller needed USDC and no ALGO. Most teams cannot narrate their own payment at this resolution.

**3. 32 passing tests across two toolchains, including AVM-simulator contract tests.** 14 contract tests via `algorand-python-testing` 1.1.0 (0.41s), 18 API tests via vitest (4.08s). Both suites were executed and confirmed during this review, and every job the CI workflow would run passes locally: `tsc --noEmit` clean in `api/` and `web/`, both builds green. The contract tests cover the negative paths that matter — non-admin `log_access` rejection, non-admin `withdraw_excess` rejection, revoking a non-existent grant, expiry via `patch_global_fields`, and per-patient sequence isolation. Testing your rejection paths is a maturity signal.

**4. Evidence discipline that is genuinely rare.** `docs/PROOF.md` is not a claims list, it is a reproduction script: every section is a command plus an independently-checkable artifact, and where the artifact could be doubted it is re-verified against the public indexer rather than the tool that produced it. `docs/COMPLIANCE.md:68-75` has a "What this document does not claim" section. `PROOF.md:143-147` volunteers the self-payment caveat unprompted. Judges spend most of their time discounting other people's claims; a submission that pre-discounts its own buys credibility that transfers to everything else it says. **This is your most underrated asset. Lead with it.**

**5. A defensible architectural thesis, written down and argued.** `docs/ARCHITECTURE.md:30-46` states the problem — a consent-gated endpoint cannot generate leaderboard volume by construction — and solves it with a two-category catalogue sharing one trust layer. It names the trade-off, picks a side, and explains why. Most hackathon architecture documents describe what was built. This one argues for it. That is the difference between a project and a position.

**6. Off-the-shelf client compatibility as a deliberate, defended decision.** `docs/ARCHITECTURE.md:95-108` is the strongest paragraph in the repository. The `exact` AVM scheme permits up to 16 transactions in a client's signed group, so bundling a consent app-call with the payment was *available* — and was rejected, because a generic `@x402/fetch` client only knows how to build the transaction described in `paymentRequirements`. Requiring callers to know MedRail's app id and method signature would make the endpoint uncallable by any other team's agent, which directly contradicts the volume strategy. The document then names the cost of that choice (the audit write is not atomic with the payment) and states the mitigation. Identifying a tempting-but-wrong design, rejecting it for a stated reason, and owning the residual cost is exactly the reasoning judges are trying to detect.

---

## 4. Why this could lose

Ranked by how much damage each does when a competent judge finds it.

**1. The consent gate does not gate (S-1).** One question — *"how do you know the caller is the requester?"* — collapses the entire consent demonstration. `records.ts:7` takes `requesterAddress` from the request body and never checks it against the payer; `records.ts:32` then checks a genuine on-chain grant against a fabricated identity. Because grants are public on the ledger, valid `(patient, requester)` pairs are enumerable from the app's own history, so any stranger who pays $0.05 can read as any authorised requester and pin a false attribution into the patient's immutable audit trail. The demo hides this only because `LiveDemoPanel.tsx:38` always sends payer == requester. **This is the #1 thing to fix and it is roughly 10–15 lines.**

**2. The headline mechanism has never run on-chain (E-1).** `total_audit_entries == 0`; zero `s`- or `a`-prefixed boxes exist on app `768743428`; verified against the live indexer during this review. `docs/ARCHITECTURE.md`, `docs/SECURITY.md` and `docs/JUDGES.md` all present the on-chain audit log as the differentiator. It exists in the contract, it is unit-tested in a simulator, and it has never once executed against real infrastructure. `/v1/records/summary` — the flagship endpoint — has never completed its success path end-to-end. The `auditTxId` and `auditSequence` fields documented in `docs/API.md` have never been produced by a real run. In a submission whose entire posture is "everything here is checkable," the one unchecked thing is the thing the pitch is built on.

**3. Nothing is publicly hosted; no MainNet; one payment, self-paid.** No public HTTPS URL, no Bazaar listing, no leaderboard presence, no MainNet deployment — all **pending**, all honestly labelled as such in `docs/COMPLIANCE.md:22-29`, and all still absent. Exactly **one** settled payment exists, on TestNet, with sender == receiver == `2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE`. Against a criterion explicitly named as *real usage*, "one payment, and I made it to myself" is the weakest possible position. Honesty about it helps; it does not fix it.

**4. A 647-line architecture document for a different, unbuilt product (DOC-1).** `SENTINEL_ARCHITECTURE.md` described "Sentinel Exchange" — a pharma supply-chain system with a FastAPI `engine/`, a SQLite database, XGBoost forecasting, a contract-net auction, a second `SentinelProvenance` contract, five new frontend routes, an SSE bus, and Twilio/WhatsApp notifiers. **None of it exists.** It also instructed the reader to "rewrite README around Sentinel Exchange." A judge browsing `docs/` would have found a detailed architecture for a system that isn't there, sitting beside documents for one that is, and would then have had to re-evaluate every other document in the folder.

*Current state:* the file has been relocated to `docs/future/SENTINEL_EXCHANGE_PROPOSAL.md` (673 lines) with a bold "⚠ UNBUILT PROPOSAL — NOT IMPLEMENTED" banner enumerating exactly what is absent. That is the right remedy. **Verify before submission that the relocation is committed and that no stale copy remains at `docs/SENTINEL_ARCHITECTURE.md`.** Both `docs/01_Product/`, `docs/03_Architecture/` and `docs/future/` are currently untracked (`git status`); untracked files do not ship, and untracked *deletions* do not either.

**5. "AI endpoints" are keyword matching over 11 rules and a 14-row table.** Defensible — but only if you say it first. If a judge extracts it from you, the honest deterministic-by-design argument reads as a retreat. If you volunteer it in the first thirty seconds, it reads as a design position. Same facts, opposite outcome. See the narrative section of `Winning_Strategy.md`.

**6. Zero tests on the two highest-risk modules — and one test that runs a defect without noticing.** `api/src/routes/records.ts` — the consent-gated flagship, the one with the money and the security finding — has **no test**. `api/src/services/algorand.ts` — box-key derivation, `withPatientLock`, `checkAccess`, `logAccess` — has **no test**. Also no cross-implementation test that the Python, Node and browser key derivations agree (`NFR-011`), no test asserting `request_access` event field order (which is why C-1 survives), and **no frontend test of any kind** (no Vitest/Jest/Playwright/Cypress config exists).

The sharper version of this finding is qualitative, not quantitative. `api/test/interactionChecker.spec.ts`'s *"always includes a source citation and disclaimer"* case calls `checkInteractions(["a","b"])` — measured to return **five** spurious major/contraindicated matches — and asserts only that a source string is non-empty and the disclaimer is present. The suite executes the defect on every run and is structurally incapable of seeing it. "32 tests" is true and it is a respectable number; it is also 32 tests concentrated on the two pure functions that carry the least risk, at least one of which is asserting on the wrong property of its own output.

**7. CI has never run (CI-1).** `.github/workflows/ci.yml:5` triggers on `push: branches: [main]`. The repository's only branch is `master`, and it has no PRs. No push has ever triggered this workflow and none will. All three jobs pass locally — the code is fine, the trigger is wrong — but a judge who clicks the Actions tab sees an empty history, and "we have CI" becomes a claim rather than a fact. It is a one-word fix that has not been made.

**8. Reliability failures that cost the caller money.** R-1: facilitator outage → HTTP 500 on every priced route, no `PAYMENT-REQUIRED`, no `Retry-After`. R-2: a failed audit write after settlement → HTTP 500 with the caller's $0.05 already spent and no refund path. The asymmetry between `records.ts:37` (defensive on rejection) and `records.ts:49` (undefended on success) is the kind of detail that makes a reviewer wonder what else was written from the happy path outward.

**9. `fly.toml` ships a broken production default (D-1, D-2).** `api/fly.toml:10` sets `NETWORK = "mainnet"` and the file sets no `CONSENT_APP_ID`. No MainNet deployment of `MedRailConsent` exists. `contracts/artifacts/deploy_testnet.json` is not copied into the image, so `config.ts:56`'s fallback cannot fire in a container. A `fly deploy` today produces a service pointed at a network where the contract does not exist, with no App ID — meaning `/v1/records/summary` and `/v1/consent/status` both 500 on first call. The deployment path that has never been exercised is committed in a state that would fail on first use.

---

## 5. The five questions a judge will ask that this team cannot currently answer well

### Q1 — "How do you know the caller is actually that requester?"

**Verbatim.** *"You take `requesterAddress` from the request body. What stops me from paying five cents and putting someone else's address in there?"*

**Why it is dangerous.** It is one sentence, it needs no setup, and the answer is "nothing." Worse, it is asked *after* the consent demo lands, so it converts your strongest moment into your weakest. And there is a follow-up that hurts more: *"so your immutable audit log records whoever the caller says they are?"* — yes. The blockchain guarantees the entry cannot be altered; it guarantees nothing about whether it was true when written.

**Best honest answer available today.** "You're right, and it's the top item on our fix list. In this build the record is a fixed synthetic constant, so nothing sensitive is behind it — but that's containment, not a control. The binding is available: `@x402/core/http` exports `decodePaymentSignatureHeader` and `@x402/avm` exports `getSenderFromTransaction`, so we can recover the payer from the signed payment transaction and 403 unless it equals `requesterAddress`. It's about fifteen lines in one handler. We haven't shipped it yet."

**What to build to make the answer strong.** Ship the binding, add one regression test that pays as A and asserts 403 for `requesterAddress = B`, then re-record the demo so the flow *shows* the 403. The answer becomes: "Watch — I pay from this wallet, I claim to be that one, and I get a 403 with my money refused before the record is touched." That converts the worst question in the set into the best beat in the demo. Tracked as `SEC-007` / `FR-039`.

---

### Q2 — "Show me an audit-log entry on-chain."

**Verbatim.** *"You've told me three times that the on-chain audit trail is the differentiator. Pull one up on the explorer."*

**Why it is dangerous.** There is nothing to pull up. `total_audit_entries == 0`; there are zero `a`-prefixed boxes on app `768743428`. Every other claim in the deck is backed by a transaction ID, which makes this one absence conspicuous rather than forgivable — you have trained the judge to expect a link, and then you don't have one. If you improvise ("it's covered by tests"), you have just told a judge that your headline mechanism is simulator-only, in your own words, on stage.

**Best honest answer available today.** "I can't — it has never executed on TestNet. It's implemented and it has two passing simulator tests, but `total_audit_entries` is zero on the deployed app and I'm not going to pretend otherwise. Everything else in this submission has a transaction ID; this one doesn't yet."

**What to build.** One successful `/v1/records/summary` call against a self-granted consent, with the operator account funded and `CONSENT_APP_ID` set. That produces a real `log_access` transaction, increments `total_audit_entries` to 1, and creates the first `s`- and `a`-prefixed boxes. **Minutes, not hours** — the code path exists and is unchanged. Then the answer becomes a link. Do S-1 first so the entry that gets written is a correctly-attributed one.

---

### Q3 — "Your API 500s after my payment settles. Who refunds me?"

**Verbatim.** *"Walk me through what happens if your `log_access` call fails right after the facilitator confirms my payment."*

**Why it is dangerous.** It is a money question, and money questions are how judges separate people who have thought about production from people who have thought about demos. The finding is right there in the diff: `records.ts:37` guards the denied path with `.catch(() => undefined)`, and `records.ts:49` leaves the success path bare. A reviewer who spots that asymmetry concludes the code was written happy-path-first — and then starts looking for the same pattern elsewhere.

**Best honest answer available today.** "You don't get refunded. The request falls through to `app.onError` and you get a 500 with your five cents already spent. We guarded the rejection path and missed the success path — that's a real defect, it's `REL-002`, and it's in the fix list."

**What to build.** Wrap the success-path `logAccess` so the resource is still returned when the audit write fails, with `auditTxId: null` and an explicit `auditWriteFailed: true` in the response body, and log the failure server-side with the settled transaction id so it is recoverable. That converts the answer to: "You get your record, plus a flag telling you the audit write is pending, plus a server-side record keyed to your settlement so we can reconcile it. We never take money without delivering." Roughly 10 lines.

---

### Q4 — "Where's the AI? And why is a keyword match worth two cents?"

**Verbatim.** *"You call these AI intelligence endpoints. I read `triageScorer.ts`. It's `String.includes` over eleven hardcoded phrases. Where's the AI, and what am I paying for?"*

**Why it is dangerous.** Not because the design is bad — deterministic rules are the *right* choice for a clinical triage path — but because the word "AI" is in `README.md:4` and on the landing page, and the gap between the marketing noun and the implementation is discoverable in under a minute. Once a judge catches one overclaim they audit everything else, and this submission's greatest asset is that its claims survive auditing.

**The follow-up that actually hurts, and it takes eight seconds to land:** *"What does it say if I type 'I have no chest pain'?"* Measured answer: score **35**, band **`urgent`**. A judge can run that in your own demo box while you are still explaining the design. If they find it, the deterministic-rules argument dies on the spot, because you will be defending a system that escalates a negation. If **you** show it first, it becomes the sharpest evidence you have that you understand your own limitations.

**Best honest answer available today.** "There is no model. Two deterministic rule engines: eleven weighted red-flag phrases and a fourteen-row interaction table, both pure functions, both unit-tested, both carrying a non-diagnostic disclaimer that a test asserts as a correctness property. We chose that deliberately — an opaque model in a clinical triage path is a liability, and this one you can read in ninety seconds and audit line by line. Here's what that costs us: type 'I have no chest pain' and it scores thirty-five, urgent — substring matching has no notion of negation, and I'd rather show you that than have you find it. It's a screening trigger, not a diagnosis, and the disclaimer on every response says so. What you're paying for is the metered call. And the engine sits behind a route boundary, so swapping in a model doesn't touch the payment or consent layers."

**What to build.** Four things, all cheap. (1) Rename the endpoints in `README.md` and `web/app/page.tsx` from "AI intelligence" to "deterministic clinical rule engines" — the accurate name is also the more confident one. (2) Add negation detection, even crudely: a leading-negator check (`no`, `denies`, `without`, `ruled out`) within a few tokens before a matched phrase. Half a day, and it removes the worst live demo failure available to a judge. (3) Fix the unanchored substring match (`AI-006`) so `["a","b"]` stops emitting five severe warnings, **and fix the test that calls it** so the suite stops silently exercising the defect. (4) Publish the rule table itself as a free endpoint: "our decision logic is public; that's the point."

---

### Q5 — "Has anyone other than you ever paid for this?"

**Verbatim.** *"Real usage is the first judging criterion. How many payments have you had, and from whom?"*

**Why it is dangerous.** It goes at the criterion listed first in `docs/COMPLIANCE.md:33`, the answer is "one, from myself," and the honest disclosure already sitting at `PROOF.md:143-147` means you cannot even be surprised by it. Everything about the entry — the open-endpoint split, the off-the-shelf client compatibility, the $0.02 price — is architected *for* volume, which makes zero external volume read as a strategy that was designed but never launched.

**Best honest answer available today.** "One payment, on TestNet, and I paid myself — it's disclosed in our proof log at section 6 before anyone asks. What that transaction proves is that the pipeline settles: real facilitator, real `axfer`, 20000 base units, fee-sponsored, independently confirmed on the indexer. What it does not prove is demand, and I'm not going to claim it does. The reason there's no volume is that we have no public URL yet — the endpoint runs on my laptop. That's a deployment gap, not a design gap, and it's a today problem, not a rewrite."

**What to build.** In priority order: (a) get the API onto a public HTTPS URL — this is the single unlock for every usage claim; (b) close S-1 first so an open endpoint is safe to expose; (c) get a second, unrelated wallet to make one real payment so "someone other than me has paid" becomes true, and record its transaction id in `docs/PROOF.md` alongside the first; (d) then MainNet and the Bazaar tag. The gap between "one self-payment" and "two payments, one from a third party" is small in volume and enormous in what it lets you say.

---

## 6. Maturity verdict

**The ladder as used here:**

| Level | Definition |
|---|---|
| **Hackathon Ready** | Builds and shows something. Claims exceed what can be reproduced on demand. |
| **Demo Ready** | Every claim on the critical path can be reproduced live, on demand, in front of a skeptic, with artifacts they can check independently. Known defects exist and are disclosed. |
| **Beta Ready** | Publicly reachable, authenticated where it matters, degrades gracefully, has coverage on its risky modules, and does not lose money on a failure path. |
| **Production Ready** | Beta plus operability: monitoring, alerting, key management, incident response, defined RPO/RTO. |

### Verdict: **Demo Ready**, with one carve-out that must be stated.

**Why Demo Ready and not Hackathon Ready.** The core claims are not assertions. App `768743428` is verifiable from any public indexer without the team present. Transaction `OYRQRKYA…` is a real settled `axfer` of 20000 base units with `fee: 0`. The consent lifecycle is four real confirmed transactions. 32 tests pass and were re-run during this review. `docs/PROOF.md` gives a reproduction command for each. That is a materially higher standard than most entries reach, and the honesty discipline in `COMPLIANCE.md` and `PROOF.md` is a genuine differentiator, not a consolation prize.

**Why not Beta Ready — and the gap is not close.** No public URL. S-1 means the flagship endpoint has no access control. R-2 means a settled payment can be consumed without delivering. R-1 means a third-party outage 500s every priced route. Zero tests on the two highest-risk modules. CI has never run. `fly.toml` ships a config that would fail on first deploy. Any one of these is disqualifying for Beta; there are six.

**The carve-out, stated plainly.** For the two open endpoints, `Demo Ready` is accurate — they have been paid for, end to end, with a checkable transaction id. **For `/v1/records/summary` — the consent-gated flagship, the endpoint the entire pitch is built around — the honest rating is `Hackathon Ready`.** That path has never completed successfully outside an AVM simulator (E-1), has zero automated tests, and its authorisation check does not authorise anything (S-1). The submission's strongest narrative rests on its weakest-evidenced component.

**Both halves of that carve-out are fixable in under a working day**, and `Winning_Strategy.md` sequences exactly how. Fix S-1 and E-1 and the verdict becomes an unqualified **Demo Ready** with a credible line of sight to Beta. Do not inflate it past that before the public URL exists and the two highest-risk modules have tests.
