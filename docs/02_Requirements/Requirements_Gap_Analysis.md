# MedRail — Requirements Gap Analysis

**Purpose of this document.** Convert the 29 evidence-backed findings in [`ENGINEERING_GAP_REPORT.md`](../ENGINEERING_GAP_REPORT.md) into a requirement-indexed remediation plan: for each gap, which requirement IDs it defeats, what the code does today, why that matters, the concrete change to make and in which file, and what it costs in hours.

**Status of this document.** Authored 2026-08-21 against commit `32ffd73` on branch `master`. Every gap here carries the same `G-##` identifier as the engineering gap report — no gap is renumbered, invented, or dropped. Every `path:line` citation was re-verified by reading the file. Affected requirement IDs are taken from the frozen canonical registry and from [`Requirements_Traceability_Matrix.md`](Requirements_Traceability_Matrix.md); **no new requirement IDs are allocated by this document.** No source code was modified in producing it.

---

## 1. How this document is organised

### 1.1 Severity

| Severity | Meaning |
|---|---|
| **CRITICAL** | Defeats a core security or product guarantee the project claims. Fix before any public demo. |
| **HIGH** | Causes user-visible failure, forfeits revenue, or collapses a headline claim under questioning. |
| **MEDIUM** | A real defect with bounded blast radius, or a significant absence of engineering rigour. |
| **LOW** | Correctness or hygiene issue with small practical impact. |

Severities are inherited from `ENGINEERING_GAP_REPORT.md` §2. **One deliberate re-ranking:** the five documentation defects **G-17, G-18, G-19, G-22, G-23** are recorded there as MEDIUM *as originally found*; they are ranked **LOW here** because the documentation half of each was corrected during the review and only a small code or comment residue remains. Their original severity is preserved in each entry so the two documents can be reconciled.

### 1.2 Effort

**S** ≈ under 1 hour · **M** ≈ 1–4 hours · **L** ≈ 1–3 days. Every entry additionally gives a concrete hour range for the specific change described, so the plan can be scheduled rather than merely sorted.

### 1.3 Distribution

| Severity | Count | Gaps |
|---|---|---|
| **CRITICAL** | 2 | G-01, G-02 |
| **HIGH** | 4 | G-04, G-05, G-06, G-07 |
| **MEDIUM** | 14 | G-03, G-08, G-09, G-10, G-11, G-12, G-13, G-14, G-15, G-16, G-21, G-26, G-27, G-28 |
| **LOW** | 9 | G-17, G-18, G-19, G-20, G-22, G-23, G-24, G-25, G-29 |
| **Total** | **29** | |

Five of the twenty-nine (**G-17, G-18, G-19, G-22, G-23**) are **already closed** on the documentation side. Twenty-four remain open, of which **eleven are effort S** — under an hour each.

---

## 2. CRITICAL

### G-01 — The paying identity is never bound to the asserted requester identity

| | |
|---|---|
| **Severity** | **CRITICAL** |
| **Affected requirements** | **SEC-007** (NOT IMPLEMENTED), **SEC-006** (PARTIALLY IMPLEMENTED — DEFEATED BY S-1), **SEC-008** (NOT IMPLEMENTED), **FR-039** (NOT IMPLEMENTED), **FR-010** (UNVALIDATED), **SEC-056** (NOT IMPLEMENTED) |
| **Effort** | **S** — 30–60 min (≈15 lines + two tests) |

**Description.** `POST /v1/records/summary` takes the requester identity from the request body and passes it straight to the on-chain consent check. Nothing ties that value to whoever actually paid.

**Current state.** `api/src/routes/records.ts:5-8` declares the schema:

```ts
const bodySchema = z.object({
  patientId: z.string().length(58),
  requesterAddress: z.string().length(58),   // caller-asserted, never authenticated
});
```

and `records.ts:32` calls `checkAccess(patientId, requesterAddress, SCOPE)` with it. The x402 middleware proves *a* payment settled; it never tells the handler *who* paid, and the handler never asks.

**Why it matters.** The consent gate — the product's entire thesis — provides no access control. **The discovery step is not theoretical: it was executed during this review.** One unauthenticated request,

```bash
curl -s "https://testnet-idx.algonode.cloud/v2/transactions?application-id=768743428&limit=100"
```

decoding the ARC-4 arguments of every transaction whose method selector is `8c3ad539` (`grant_access`), yields the patient as the transaction `sender` (because `contract.py:151` uses `Txn.sender` as the patient identity), the requester as application argument 0, and the scope as argument 1. **Two complete `(patient, requester, scope)` triples were recovered from the seven indexed application calls, both with scope `records:summary`** — the exact scope this endpoint checks. The `grants` box key is a sha256 digest (`contract.py:96-98`), which hides the triple *in box storage*; it does nothing to hide the transaction that created it.

An attacker pays the ordinary $0.05 and posts `{patientId: <victim>, requesterAddress: <recovered authorised requester>}`. `check_access` returns **true**, because that grant genuinely exists, and the record is served. With real PHI behind the endpoint this is a total authorisation bypass. The second-order effect is worse: `records.ts:49` passes the same forged address to `log_access`, writing a **false permanent attribution** into a trail that is trusted precisely for being on-chain (**SEC-008**).

*What the executed discovery does and does not prove.* It proves the reconnaissance step is trivial, unauthenticated and needs no privileged access. It is not a completed exploit here, because both recovered grants were subsequently revoked by `exercise_contract.py`, so `check_access` currently returns `false` for both. The attack needs an *active* grant — a property of the demo data's lifecycle, not of any control in the system. **Nothing in `api/src/routes/records.ts` would have stopped it.**

*Why it is invisible today.* The response is a fixed synthetic constant (`records.ts:15-21`), so nothing sensitive leaks in this build; and `web/components/LiveDemoPanel.tsx:38` sends `requesterAddress: wallet.address`, so in the demo the payer and the requester coincide and the flaw never manifests.

**Recommended fix.** Use the payment itself as the authentication mechanism — the property x402 already provides and MedRail was simply not reading. The reference patch in `ENGINEERING_GAP_REPORT.md` §4 is **compile-verified** (`npx tsc --noEmit`, exit 0) against the installed SDK.

1. Add **`api/src/x402Payer.ts`** exporting `payerFromRequest(c: Context): string | null` — decode the `PAYMENT-SIGNATURE` header with `decodePaymentSignatureHeader` (`@x402/core/http`), take `payload.paymentGroup[payload.paymentIndex]`, and recover the signer with `getSenderFromTransaction(decodeTransaction(raw), true)` (`@x402/avm`). Return `null` on any failure; callers must treat `null` as *unauthenticated*, never as *trusted*.
2. In **`api/src/routes/records.ts`**, immediately after schema validation at `:29`, reject with `403` unless `payerFromRequest(c) === requesterAddress`.
3. Add **`api/test/records.security.spec.ts`** with **TC-110** (pay as A, assert `requesterAddress: B`, expect `403`, no `summary` field, no audit entry attributed to B) and **TC-111** (the positive control — pay as A, assert A, expect `200` — so the fix is not a blanket deny). **TC-110 fails today: the handler returns `200` with the record.**

No new credential, session, API key or signature scheme is introduced. It also makes the audit log truthful, which is what the "immutable on-chain audit trail" claim needs in order to mean anything.

---

### G-02 — The on-chain audit write has never executed on TestNet

| | |
|---|---|
| **Severity** | **CRITICAL** |
| **Affected requirements** | **FR-012** (UNVALIDATED), **FR-025** (UNVALIDATED on-chain), **FR-010**, **FR-011** (both UNVALIDATED), **DATA-002**, **REL-006** |
| **Effort** | **S** — 15–30 min |

**Description.** The mechanism every project document presents as the differentiator has run only inside an AVM simulator.

**Current state.** Deployed application **768743428** reports, read live from `https://testnet-idx.algonode.cloud`:

```
total_requests       = 2
total_grants_active  = 0
total_revocations    = 2
total_audit_entries  = 0     <-- ZERO
```

and holds **zero `s`-prefixed and zero `a`-prefixed boxes** — only two `g` (grant) boxes, 100 total box bytes. `log_access` (`contract.py:217-236`) has never been called on Algorand TestNet.

**Why it matters.** Three consequences, each independently checkable by a judge in under a minute.

1. `/v1/records/summary` — the flagship consent-gated endpoint — has **never completed its success path against the live contract.** `docs/PROOF.md` §6 proves a payment against `/v1/triage` only.
2. The `auditTxId` and `auditSequence` fields documented in `docs/API.md` and returned at `records.ts:57-58` have **never been produced by a real run**.
3. FR-012 and FR-025 cannot be lifted above **UNVALIDATED** by the test suite alone, because contract tests execute on a simulator (`algorand-python-testing` 1.1.0), not the network. Simulator-passing is not on-chain proof.

There is no Part B manual procedure for a paid records call either — the gap is total, and it sits on the single most-cited claim in the repository.

**Recommended fix.** Execute the path once and record it. Nothing needs to be written; the code already exists.

1. Confirm the operator account (`OPERATOR_MNEMONIC`, the contract admin) holds ALGO and that app account `CCO26Y6Z56DDZ3OELO2UKJMIPJVSIT52I23F2MPMR52JBM3HQZZNUZNOR4` has MBR headroom above its 145,000 µALGO minimum.
2. Grant self-consent for scope `records:summary` through the web UI (`web/components/ConsentChecker.tsx` → `web/lib/consent.ts:44-68`).
3. Make one paid `POST /v1/records/summary` call — `api/scripts/e2e-proof.ts` can be repointed from `/v1/triage` (`e2e-proof.ts:56`) in two lines.
4. Add the resulting `auditTxId` as a new section in **`docs/PROOF.md`**, and re-read `total_audit_entries` from the indexer to show it at 1.
5. Add **TC-143** to a new `api/test/algorand.live.spec.ts`, gated on `RUN_LIVE=1`, so the evidence is reproducible rather than one-off.

---

## 3. HIGH

### G-04 — A facilitator outage turns every priced endpoint into HTTP 500

| | |
|---|---|
| **Severity** | **HIGH** |
| **Affected requirements** | **REL-001** (NOT IMPLEMENTED), **FR-001**, **FR-002**, **PERF-001**, **REL-005** (the property that survives), **SEC-058** |
| **Effort** | **M** — 2–4 h |

**Description.** The 402 challenge cannot be constructed offline, so the facilitator is a hard, un-degraded dependency of all three priced routes.

**Current state.** Reproduced by the reviewer with `FACILITATOR_URL` pointed at a closed port: `POST /v1/triage` returns **HTTP 500** with body `{"error":"Failed to initialize: no supported payment kinds loaded from any facilitator."}` and **no `PAYMENT-REQUIRED` header** — not a 402, not a 503, no `Retry-After`. `api/src/x402.ts:6` constructs `HTTPFacilitatorClient` with no timeout, and `:11-14` registers the scheme whose `/supported` fetch supplies `accepts[].asset` and `extra.feePayer`. Neither value is in MedRail's own config: `config.usdcAssetId` (`api/src/config.ts:49`) exists and is **never read**. Free routes were verified to still return 200, so the blast radius is exactly the three priced routes (**REL-005** holds).

**Why it matters.** A calling agent sees an opaque server error rather than a retryable signal, and in a competition scored on real payment volume, every upstream blip is forfeited revenue. It is also the mechanism behind the CI fragility in G-06: `api/test/x402-flow.spec.ts` makes a live network call at app-module import, so a facilitator outage turns into a red build with a misleading failure message.

**Recommended fix.**

1. In **`api/src/x402.ts`**, add an explicit fetch timeout to the `HTTPFacilitatorClient` construction at `:6`.
2. Cache the resolved payment kinds after the first successful `initialize()` and persist them (a small JSON file or an env-seeded default); serve the 402 from the cache when the facilitator is unreachable. `config.usdcAssetId` and a configured `feePayer` are the natural seed values, which also gives the currently-dead constant at `config.ts:49` a purpose.
3. When no cache exists, return **`503` with `Retry-After`** and a stable error code from **`api/src/app.ts:58-61`**, never a bare 500.
4. Add **TC-170** (outage ⇒ 503 + `Retry-After`) and **TC-171** (free routes still 200) to a new `api/test/reliability.spec.ts`.

---

### G-05 — The two highest-risk modules have zero test coverage

| | |
|---|---|
| **Severity** | **HIGH** |
| **Affected requirements** | **FR-010**, **FR-011**, **FR-012** (all UNVALIDATED), **SEC-006**, **SEC-007**, **SEC-008**, **NFR-011**, **REL-004**, **DATA-004**, **AI-007** |
| **Effort** | **M** — 3–4 h |

**Description.** *(Closed 2026-08-22 — `api/test/records.spec.ts` and `api/test/algorandService.spec.ts` now exist; `src/services` is at 93.18% branch coverage. Original finding retained below.)* No test exists for `api/src/routes/records.ts` or `api/src/services/algorand.ts`. All 18 API tests cover the two pure rule engines and the 402 response shape.

**Current state.** The 32 passing tests distribute as: 14 contract tests (AVM simulator), 7 triage-scorer tests, 6 interaction-checker tests, 5 x402-flow tests. `api/test/` contains exactly three spec files, none of which imports `records.js` or `algorand.js`. `web/` has **no test runner installed at all** — no Vitest, Jest, Playwright or Cypress config exists.

**Why it matters.** These two modules contain every piece of logic that can mis-authorise a caller, forfeit a sale, or reject an audit write: box-key derivation (`algorand.ts:64-79`), `simulate` reads (`:82-121`), read-then-write sequence prediction (`:158-172`), `withPatientLock` (`:123-138`), and the consent decision itself (`records.ts:32`). The traceability matrix quantifies the mismatch: the consent-gated critical path has **0 %** automated coverage while the contract's grant state machine and the rule engines have **100 %**. The 32-test count is real; it is concentrated where the risk is not.

**Recommended fix.** Four test groups, in this order:

1. **`api/test/records.security.spec.ts`** — TC-110/TC-111/TC-112/TC-113, the payer-binding regression suite for G-01. This is the single most valuable test in the repository.
2. **`api/test/records.route.spec.ts`** — TC-100 (happy path: `200`, `consentVerifiedOnChain`, `auditTxId`, `auditSequence`), TC-101 (denied ⇒ `403`, `logAccess` called once with `"consent_denied"`), TC-102 (denied path survives an audit-write rejection — the `.catch(() => undefined)` at `records.ts:37` is currently unproven), TC-103/TC-134 (success path with `logAccess` rejecting — see G-03), TC-104 (schema rejection). Technique: `vi.mock("../src/services/algorand.js")` and drive through `app.request()`.
3. **`api/test/algorand.concurrency.spec.ts`** — TC-130/TC-131/TC-133 for `withPatientLock`. **Assert that no call is rejected**, not that sequences are unique: the contract guarantees uniqueness on its own (`contract.py:224-226`), so a uniqueness assertion would pass whether or not the lock exists and would prove nothing.
4. **Box-key golden vectors** — see G-08.

---

### G-06 — CI has never run *(closed 2026-08-21; original finding retained)*

| | |
|---|---|
| **Severity** | **HIGH** |
| **Affected requirements** | **OPS-006** (PARTIALLY IMPLEMENTED), **NFR-005**, **NFR-007**, **SEC-014**, **OPS-056**, **OPS-059** |
| **Effort** | **S** — 5 min for the trigger, 30–45 min for the accompanying hardening |

**Description.** The workflow triggers on a branch that does not exist in this repository.

**Current state.** `.github/workflows/ci.yml:3-5`:

```yaml
on:
  push:
    branches: [main]
```

The repository's only branch is **`master`**, and it has no pull requests, so neither the `push` nor the `pull_request` trigger has ever fired. All three jobs (`contract`, `api`, `web`) are well-constructed and **pass locally** — API typecheck, API build, 18 vitest tests, 14 pytest tests, web typecheck and `next build` were all executed by the reviewer on 2026-08-21 and all passed.

**Why it matters.** Every project document cites CI as evidence of engineering discipline. A judge who clicks the Actions tab finds nothing. This is a genuine "the green badge is not green" finding — and it is important to state it precisely: **the pipeline is correct and the code is not failing; the pipeline has simply never fired.**

**Recommended fix.**

1. **`.github/workflows/ci.yml:5`** — change to `branches: [main, master]`, or rename the branch. One line.
2. While in the file: add `cache:` to `actions/setup-node` and `actions/setup-python` (CI-4); add `npm audit --audit-level=high` and `pip-audit` steps (G-16); add a coverage upload (`@vitest/coverage-v8`, `pytest-cov`) so a baseline exists (TC-202); add the artifact-diff step from G-28.
3. Add **TC-200** as a pipeline assertion that the workflow runs on the repository's actual default branch.

---

### G-07 — The committed production configuration is broken

| | |
|---|---|
| **Severity** | **HIGH** |
| **Affected requirements** | **NFR-004** (IMPLEMENTED — breaks in container), **NFR-007** (UNVALIDATED), **NFR-012**, **OPS-050**, **OPS-051**, **SEC-050** |
| **Effort** | **S** — 10–20 min |

**Description.** A `fly deploy` from the committed configuration produces a service that cannot work.

**Current state.** Three defects compound:

- **`api/fly.toml:10`** hardcodes `NETWORK = "mainnet"`, but **no MainNet deployment of `MedRailConsent` exists** and `contracts/artifacts/` contains no `deploy_mainnet.json`.
- **`api/fly.toml:9-12`** sets no `CONSENT_APP_ID`.
- **`api/Dockerfile:16-20`** copies only `package.json`, `dist`, `src/data` and `MedRailConsent.arc56.json`. The deploy artifact that `api/src/config.ts:31-40` falls back on is **not** in the image — and copying it would not help: with `WORKDIR /app/api` (`api/Dockerfile:22`) the resolved path is `/app/contracts/artifacts/deploy_<network>.json`, and with `NETWORK=mainnet` that is **`deploy_mainnet.json`, a file that has never existed**.

So `config.consentAppId` is `0`, `requireConsentAppId()` (`config.ts:61-68`) throws, and both `/v1/records/summary` and `/v1/consent/status` return **500**. Compounding it, `config.ts:42` is an unchecked `as NetworkName` cast, so a typo in `NETWORK` yields `undefined` CAIP-2, asset id and algod URL rather than a boot failure (**SEC-050**).

**Why it matters.** The one configuration file a reviewer opens to check deployment readiness is the one that would not work.

**Recommended fix.**

1. **`api/fly.toml:9-12`** — set `NETWORK = "testnet"` and `CONSENT_APP_ID = "768743428"` in `[env]` until a MainNet deployment exists. Document the MainNet cutover as an explicit override rather than a committed default.
2. **`api/src/config.ts:42`** — replace the cast with `z.enum(["testnet","mainnet"]).parse(process.env.NETWORK ?? "testnet")` so an unrecognised value refuses to boot (closes SEC-050 in the same edit).
3. Optionally copy the deploy artifact into the image at `api/Dockerfile:20`, but treat explicit configuration as the primary mechanism (**OPS-050**).
4. Add **TC-203**: build both images, run the API image, and assert `GET /v1/health` returns `200` with the expected `network` and a non-null `consentAppId`. This single test catches D-1 and D-2 together and lifts **NFR-007** out of **UNVALIDATED**.

---

## 4. MEDIUM

### G-03 — Consent denials are documented as charged, are not, and cost MedRail a fee to answer

| | |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected requirements** | **FR-011** (UNVALIDATED), **REL-002** (VALIDATED — the property that makes this true), **SEC-013**, **REL-006**, **OPS-061**, **FR-012** |
| **Effort** | **S** — 20–40 min |

**Description.** Three documents and one response field assert that a consent-denied call is billed. It is not. The economics run the exact opposite way.

**Current state.** `@x402/hono`'s payment middleware (`node_modules/@x402/hono/dist/esm/index.mjs:203-232`) reaches settlement only on a successful handler response:

```js
case "payment-verified":                    // verified — money has NOT moved yet
  try { await next(); }
  catch (error) { await cancellationDispatcher.cancel({reason:"handler_threw"}); throw error; }
  if (c.res.status >= 400) {                // ANY 4xx or 5xx
    await cancellationDispatcher.cancel({reason:"handler_failed"});
    return;                                 // returns BEFORE processSettlement
  }
  ... await httpServer.processSettlement(...)   // reachable only when status < 400
```

`/v1/records/summary`'s denial returns **403** (`records.ts:45`), so settlement is cancelled and **the caller pays nothing**. Meanwhile `records.ts:37` submits a real `logAccess` transaction recording the denied attempt, whose Algorand fee **MedRail's operator account pays**.

| | Documented | Actual |
|---|---|---|
| Caller pays | $0.05 | **nothing** |
| MedRail pays | nothing | **one Algorand transaction fee** |
| Net | MedRail earns $0.05 | **MedRail pays to say no** |

The claim appears at `records.ts:43` (`charged: false`), in the comment at `records.ts:34-36` ("the fee already paid covers this on-chain verification regardless of outcome"), in `docs/API.md`, and in `docs/SECURITY.md` under a heading reading *"consent-denied calls are not charged"*.

**Why it matters.** Two distinct problems. First, **the API's billing contract is documented wrongly**, which an integrator discovers only by reconciling their own ledger. Second, any stranger can invoke the denial path repeatedly at **zero cost to themselves and non-zero cost to MedRail** — and because **SEC-013** (rate limiting) does not exist, that is an unbounded fee-drain against the operator account. If the operator account empties, `log_access` stops working **for everyone**, which also takes out FR-012's success path.

A smaller residual from the withdrawn R-2 finding survives and is worth fixing in the same edit: the denied path wraps the audit write defensively (`records.ts:37`, `.catch(() => undefined)`) while the success path does not (`records.ts:49`, unguarded `await`). A transient chain failure — operator out of ALGO, algod 5xx, validity-window expiry, or the box-reference rejection of G-11 — therefore turns a legitimate, authorised, payable request into a 500. **The severity is availability and revenue-forgone, not caller-harm**: the caller is not charged.

**Recommended fix.** The billing half is a product decision, not a bug fix. Pick one:

- **Charge for denials as documented** — in **`api/src/routes/records.ts:38-46`**, return `200` with `{granted: false, …}` instead of `403`. Settlement then proceeds and the documented rationale becomes true. This changes the public API contract and must be reflected in `docs/API.md` and `05_API/OpenAPI.yaml`.
- **Keep `403`** — correct `docs/API.md` and `docs/SECURITY.md`, delete the misleading `charged` field at `records.ts:43` and the stale comment at `:34-36`, and treat the denied-path audit write as a cost to be rate-limited under G-09.

Independently of that choice, **guard the success path**: wrap `records.ts:49` in `try/catch` and degrade to `200` with `auditStatus: "pending"` rather than a 500 that silently voids a legitimate sale. Three lines. Add **TC-103** and **TC-134** to pin it, and **TC-102** to prove the denied path's existing `.catch` actually works.

---

### G-08 — Three unsynchronised implementations of the same box-key derivation

| | |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected requirements** | **NFR-011** (UNVALIDATED), **DATA-001**, **FR-010**, **FR-013**, **FR-035** |
| **Effort** | **M** — 2–3 h |

**Description.** `sha256(patient ‖ requester ‖ scope)` with prefix `"g"` is implemented independently in three languages, and nothing compares them.

**Current state.**

| Implementation | Location | Hash primitive |
|---|---|---|
| Contract (AVM) | `contract.py:95-98`, prefix at `:114` | `op.sha256` |
| Node backend | `api/src/services/algorand.ts:64-69` | `node:crypto` `createHash("sha256")` |
| Browser client | `web/lib/consent.ts:26-34` | `crypto.subtle.digest("SHA-256")` |

The `audit_seq` (`"s"`) and `audit_log` (`"a"` ‖ pubkey ‖ `itob(seq)`) derivations are duplicated between `contract.py:101-103`/`:115-116` and `algorand.ts:72-79`. **No test compares any pair.**

**Why it matters.** If any one drifts — a prefix change, a different concatenation order, a scope-encoding difference — consent lookups silently return `false` instead of erroring. The failure mode is *"the patient's grant mysteriously doesn't work"*: the hardest class of bug to diagnose, and the worst possible one to hit live on stage.

**Recommended fix.** A shared golden-vector fixture, consumed by all three.

1. Create **`contracts/tests/fixtures/box_keys.json`** with fixed inputs — a fixed 58-character patient address, a fixed requester address, `scope = "records:summary"`, `seq = 1` — and the expected 33-byte grant key, 33-byte `audit_seq` key and 41-byte `audit_log` key, each as a reviewed hex literal.
2. Assert it in **`contracts/tests/test_consent.py`** (TC-120, TC-123, TC-124), **`api/test/algorand.keys.spec.ts`** (TC-121) and a jsdom test for `web/lib/consent.ts` (TC-122). ~20 lines each.
3. Add **TC-125** as a drift guard that fails the build with a diff naming the offending implementation.

This is the cheapest high-value structural test available in the repository.

---

### G-09 — No rate limiting anywhere

| | |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected requirements** | **SEC-013** (NOT IMPLEMENTED), **NFR-001** (the reason it is hard), **REL-006**, **PERF-002**, **SEC-054** |
| **Effort** | **S** — 30–45 min |

**Description.** No rate-limit middleware exists in `api/src/app.ts`, and two free surfaces are abusable at zero cost to the caller.

**Current state.** `GET /v1/consent/status` (`api/src/routes/consent.ts:19-31`) is free, unauthenticated, and performs **two sequential algod calls** per request — `getTransactionParams()` at `algorand.ts:85` then `atc.simulate()` at `:98`. The single cold observation was 505 ms.

**Why it matters — and this is sharper than the original finding.** Three abuses, not two:

1. **Exhausting the MedRail API** — free, unauthenticated, two outbound round trips per request.
2. **Amplifying traffic at public AlgoNode infrastructure** using MedRail as an unwitting relay, with no API key and no rate agreement (assumption A-3).
3. **Draining MedRail's operator account.** Per **G-03**, a consent-denied `/v1/records/summary` call is **free to the caller** (403 cancels settlement) and costs MedRail **one Algorand transaction fee** for the denial audit write at `records.ts:37`. That is a fee-burning endpoint any stranger can invoke in a loop — and if the operator account empties, `log_access` stops working for everyone, taking FR-012 down with it. The priced routes are economically self-limiting; **this one is not, because the denial is not priced.**

**Recommended fix.**

1. Add per-IP rate limiting middleware in **`api/src/app.ts`**, mounted before the route registrations at `:52-56`. Scope it to the unpaid surface: `/v1/consent/status`, `/v1/consent/app-info`, `/v1/consent/arc56`, `/v1/health`, `/`.
2. **Additionally rate-limit the denial path of `/v1/records/summary`** — either by throttling the `logAccess` denial write, or by removing it (a denied call arguably should not consume an on-chain write at all), or by resolving G-03 in favour of charging for denials, which makes the write self-funding.
3. Add **TC-176** (1000 rapid free requests ⇒ `429` on the excess).

---

### G-10 — A malformed address returns 500 and leaks the internal error

| | |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected requirements** | **SEC-010** (NOT IMPLEMENTED), **SEC-011** (NOT IMPLEMENTED), **FR-038** (PARTIALLY IMPLEMENTED), **FR-013**, **OPS-003** |
| **Effort** | **S** — 30 min |

**Description.** zod validates address length only; the checksum failure surfaces as a server error carrying the internal exception text.

**Current state.** Reproduced: `GET /v1/consent/status?patient=AAAA…(58 chars)&requester=<valid>&scope=records:summary` returns **`500 {"error":"wrong checksum for address"}`**. The schemas at `api/src/routes/consent.ts:6-10` and `api/src/routes/records.ts:5-8` use `.length(58)` with no `.refine`; `algosdk.decodeAddress` then throws inside `pubkey()` at `algorand.ts:48-50`; and `api/src/app.ts:58-61` echoes `err.message` verbatim to an unauthenticated caller.

**Why it matters.** Two separate defects in one reproduction. A client input error reported as a server error corrupts error-rate monitoring and misleads integrators. Independently, echoing internal exception messages to anonymous callers is an information-disclosure pattern that leaks progressively more as the codebase grows — today it is an algosdk string; tomorrow it is a stack frame or a file path.

**Recommended fix.**

1. Add `.refine(algosdk.isValidAddress)` to **all four** address fields: `api/src/routes/consent.ts:7-8` and `api/src/routes/records.ts:6-7`.
2. Change **`api/src/app.ts:58-61`** to log the detail server-side (structured, per G-15) and return a generic body with a stable error code.
3. Add **TC-172** (58-char invalid address ⇒ `400`) and **TC-173** (`onError` never echoes internal text).

---

### G-11 — The in-process lock contradicts the multi-machine deployment config

| | |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected requirements** | **REL-004** (PARTIALLY IMPLEMENTED), **FR-012**, **FR-027**, **OPS-055**, **DATA-002** (**not** affected — see below) |
| **Effort** | **S** — 10 min to pin · **M** — 1–2 h for the retry |

**Description.** `withPatientLock` serialises audit writes within one process; the platform configuration permits more than one process.

**Current state.** `api/src/services/algorand.ts:123-138` is an in-process per-patient promise chain (`patientQueues: Map<string, Promise<unknown>>`). `api/fly.toml:17-19` sets `auto_start_machines = true` with `min_machines_running = 1` — a **floor, not a ceiling**. `docs/SECURITY.md` correctly discloses that the lock protects only a single process; the deployment config then permits multiple.

**Precise failure mode — corrected during the review.** The **contract already self-assigns the sequence**: `contract.py:224-226` reads its own `audit_seq` box, computes `next_seq`, and writes both boxes itself. Nothing trusts a caller-supplied sequence. `predictedSeq` (`algorand.ts:158-159`) exists **only** to populate the AVM box-reference array at `:169-172`, because Algorand requires every box a transaction touches to be declared in advance. A losing racer therefore declares a box name that does not match the box the contract goes on to write, and **the AVM rejects the transaction**.

**Why it matters.** The classification is **availability / denial of service, not tampering** — audit-log integrity is *stronger* than the original framing implied, and **DATA-002** is not at risk from this gap. What it costs is the sale: a rejected `logAccess` on the unguarded success path at `records.ts:49` becomes an HTTP 500 (**G-03**). It remains the hard horizontal-scaling blocker.

**Recommended fix.** The sequencing is already correct on-chain, so **do not "move sequencing on-chain"** — it is there.

1. **Short term:** pin to one machine in **`api/fly.toml:17-19`** (set an explicit maximum) and document the constraint (**OPS-055**). 10 minutes.
2. **Correct fix:** make the box reference resilient in **`api/src/services/algorand.ts:153-178`** — on a box-reference rejection, retry once with a refreshed `getAuditCount`, and/or declare a small window of candidate box names.
3. Pair with G-03's `try/catch` guard so a rejection never forfeits a payable request.
4. Add **TC-130** (10 concurrent writes, **all resolve** — assert no rejection, not sequence uniqueness), **TC-131** (bypass the lock, assert at least one rejection, proving the lock is load-bearing), **TC-132** (two module instances collide), **TC-133** (a rejection does not poison the queue). TC-131 requires exporting the inner write closure or making the lock injectable — a small prerequisite refactor.

---

### G-12 — `request_access` emits its event with `patient` and `requester` swapped

| | |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected requirements** | **FR-024** (PARTIALLY IMPLEMENTED), **DATA-003**, **OPS-061** |
| **Effort** | **S** — 5 min code + 20 min test · **M** for the deferred redeploy |

**Description.** The emitted ARC-28 event labels the requester as the patient and vice versa.

**Current state.** `contract.py:146`:

```python
arc4.emit(AccessRequested(arc4.Address(Txn.sender), arc4.Address(patient), arc4.String(scope)))
```

`AccessRequested` is declared `patient, requester, scope` at `contract.py:76-79`, and `Txn.sender` is the **requester** per the method's own docstring at `:142-144`. **Confirmed against the compiled spec**, not only the source: `contracts/artifacts/MedRailConsent.arc56.json` declares the argument order `patient, requester, scope`. `AccessGranted` (`:169-176`) and `AccessRevoked` (`:195`) are emitted **correctly** — there `Txn.sender` genuinely is the patient. Only `request_access` is defective.

**Why it matters.** Any ARC-28 event consumer — an indexer, a subscriber, a future notification service — receives inverted data. The existing test `test_request_access_emits_event_and_counts` (TC-003) asserts only `total_requests == 1` and never inspects the payload, which is why the defect survived a green suite and a live TestNet run (TC-051).

**Recommended fix.**

1. **`contracts/smart_contracts/consent/contract.py:146`** — swap the two arguments.
2. Add **TC-150** to `contracts/tests/test_consent.py`, decoding the event and asserting `patient == the patient argument` and `requester == Txn.sender`. **This test fails today.**
3. **Do not redeploy to ship it before the finals.** `contracts/scripts/deploy_testnet.py:93` uses `OnUpdate.AppendApp`, which creates a *new application* rather than updating in place, so a redeploy mints a new App ID and **invalidates `768743428` everywhere it is cited**. Fix in source; redeploy afterwards, bundled with G-20.

---

### G-13 — No `.dockerignore`; secrets sit in the build context

| | |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected requirements** | **SEC-015** (NOT IMPLEMENTED), **OPS-052**, **SEC-005** (the property that currently holds), **NFR-007** |
| **Effort** | **S** — 15 min |

**Description.** No `.dockerignore` exists anywhere, and the API image builds from the repository root.

**Current state.** `api/Dockerfile:1-3` documents that the build context is the repo root, so `api/.env` and `contracts/.env` — both containing **live mnemonics** — are inside the context sent to the daemon. `web/Dockerfile:5` does a bare `COPY . .`, pulling in `web/.env.local` and the host `node_modules`.

**Why it matters.** **No secret lands in a published layer today**: `api/Dockerfile:7-20` copies only explicit paths, and today `web/.env.local` holds only `NEXT_PUBLIC_*` values. The margin is one careless `COPY api/ ./api/` wide. It also ships `contracts/.venv/` and both `node_modules/` trees into every build context, which is slow.

**Recommended fix.** Add a root **`.dockerignore`** and a **`web/.dockerignore`** excluding `.env*`, `node_modules`, `.venv`, `.next`, `dist`, `.git`. Add `gitleaks` over the build context as part of **TC-204**.

---

### G-14 — Non-reproducible container builds

| | |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected requirements** | **NFR-007** (UNVALIDATED), **OPS-053**, **SEC-014** |
| **Effort** | **S** — 10 min |

**Description.** Both Dockerfiles install with `npm install` despite committed lockfiles that CI validates with `npm ci`.

**Current state.** `api/Dockerfile:8` and `:17`; `web/Dockerfile:4`. `package-lock.json` is committed in both packages, and `.github/workflows/ci.yml` uses `npm ci`.

**Why it matters.** The image can silently drift from the dependency set CI verified — the classic "works in CI, broken in prod" divergence, and a supply-chain weakness that also undermines any conclusion drawn from the G-27 scan.

**Recommended fix.** Change all three lines to `npm ci`, and `npm ci --omit=dev` in the API runtime stage at `api/Dockerfile:17`. Adopt `output: "standalone"` in `web/next.config.ts` so the runtime image stops carrying the full dev-inclusive tree (which is also what makes G-27 ship).

---

### G-15 — No observability of any kind

| | |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected requirements** | **OPS-002**, **OPS-003**, **OPS-004**, **OPS-005** (all NOT IMPLEMENTED), **OPS-001** (implemented but unwired), **OPS-054**, **OPS-060**, **OPS-061**, **REL-006**, **PERF-002**, **PERF-003** |
| **Effort** | **M** — 3–4 h |

**Description.** The only logging is `console.log` at boot and `console.error(err)` in the error handler. No structured logs, no request ids, no metrics, no tracing, no alerting.

**Current state.** `api/src/app.ts:59` is the entire error-logging surface. `/v1/health` (`api/src/routes/health.ts:6-14`) exists and is wired to **no probe** — no `HEALTHCHECK` in `api/Dockerfile`, no `[[http_service.checks]]` in `api/fly.toml:14-19`.

**Why it matters.** The operator cannot answer any of the questions that determine whether the system is working: how many payments settled, how much revenue arrived at `payTo`, is the operator account about to run out of ALGO (which turns every paid records call into a G-03 lost sale), is the app account short of box MBR (**REL-006**), is the facilitator degraded (**G-04**). **G-03 in particular is undetectable without logs** — a forfeited sale looks exactly like no traffic.

**Recommended fix.**

1. Add request-id middleware and structured JSON logging in **`api/src/app.ts`**, with an explicit **never-log list**: mnemonics, `PAYMENT-SIGNATURE` contents, and raw symptom text (which would otherwise violate the spirit of **AI-007** off-chain).
2. Correlate the HTTP request id with the settlement transaction and the audit transaction it produced (**OPS-061**) — `records.ts:57` already returns `auditTxId` to the caller; nothing records it server-side.
3. Add a chain-native canary polling the operator balance and `total_audit_entries` (**OPS-005**, **OPS-060**); `api/scripts/e2e-proof.ts` is most of one already.
4. Wire `HEALTHCHECK` in **`api/Dockerfile`** and `[[http_service.checks]]` in **`api/fly.toml`** to `/v1/health` (**OPS-054**).

---

### G-16 — No dependency vulnerability scanning

| | |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected requirements** | **SEC-014** (NOT IMPLEMENTED), **OPS-006**, **NFR-007** |
| **Effort** | **S** — 20 min |

**Description.** No `npm audit`, `pip-audit`, Dependabot or CodeQL anywhere in the pipeline.

**Current state.** `.github/workflows/ci.yml` has three jobs; none scans. The project pulls a large transitive tree — `@x402/*` (4 packages), `algosdk`, `next@16.3.0`, `algokit-utils`, `py-algorand-sdk`, `puyapy` — with no standing signal on known vulnerabilities.

**Why it matters.** The absence is not theoretical: **the first scan ever run against this repository returned a finding** (G-27).

**Recommended fix.** Add `npm audit --audit-level=high` to both Node jobs and `pip-audit` to the contract job in **`.github/workflows/ci.yml`**; enable Dependabot. Combine with **TC-204**.

---

### G-27 — A high-severity advisory ships in the frontend's production dependency tree

| | |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected requirements** | **SEC-014** (NOT IMPLEMENTED), **OPS-053**, **NFR-007** |
| **Effort** | **S** — 15 min |

**Description.** `nanoid@3.3.17` — [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8), *custom generators can loop indefinitely when size is zero*, severity **high** — is present in both packages, and in one of them it reaches the runtime image.

**Current state — measured, not inferred.** `npm audit` reports **1 high** in each package. The dependency paths differ, and the distinction is what matters:

| Package | Path | Ships to runtime? |
|---|---|---|
| `api/` | `vitest → vite → postcss → nanoid` | **No** — devDependency chain; `api/Dockerfile:17` installs the runtime stage with `--omit=dev` |
| `web/` | `next@16.3.0 → postcss → nanoid` | **Yes** — production dependency, and `web/Dockerfile:14` copies the full `node_modules` into the runtime image |

**Why it matters.** Practical exploitability here is low: the vulnerable path is a build-time CSS toolchain reached through Next's own bundling, not something a caller can drive. But it is a real, **currently-shipping** high-severity advisory that no process in this repository would have surfaced, and it is precisely the class of finding a security-minded judge checks for with one command.

**Recommended fix.** Run `npm audit fix` in both packages (the advisory reports a fix as available), re-run the scan, and commit both updated lockfiles. Pair with G-16 so the next one is caught automatically, and with G-14's `output: "standalone"` so `web`'s runtime image stops carrying the dev-inclusive tree at all.

---

### G-21 — Unanchored substring matching fabricates severe interaction warnings

| | |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected requirements** | **AI-006** (NOT IMPLEMENTED), **AI-052** (RECOMMENDED), **AI-058** (RECOMMENDED), **FR-007**, **FR-008**, **AI-004**, **DATA-005** |
| **Effort** | **M** — 2–3 h |

**Description.** Medication matching is symmetric and unanchored, so a one- or two-character token matches many table entries.

**Current state.** `api/src/services/interactionChecker.ts:42-43`:

```ts
const hasA = normalized.some((m) => m.includes(a) || a.includes(m));
const hasB = normalized.some((m) => m.includes(b) || b.includes(m));
```

**Measured by execution on 2026-08-21:** `checkInteractions(["a","b"])` returns `flagged: true` with **five** matches — `warfarin+aspirin` (major), `warfarin+ibuprofen` (major), `warfarin+naproxen` (major), `maoi+sertraline` (**contraindicated**), `simvastatin+clarithromycin` (major). `checkInteractions(["in","as"])` returns four, including `warfarin+aspirin` and `simvastatin+clarithromycin`.

**Why it matters.** A drug-interaction endpoint that fabricates major and contraindicated warnings from two-character input is a correctness problem in a clinical-adjacent context, and it is trivially reproducible by a judge at a keyboard. Worse for the assurance story: the existing test `interactionChecker.spec.ts "always includes a source citation and disclaimer"` (**TC-027**) **calls exactly `checkInteractions(["a","b"])`** and asserts only the disclaimer — **the suite exercises the defect on every green run and never notices it.** That is the precise illustration of why the 32-test count overstates the assurance the suite provides.

**Recommended fix.**

1. **`api/src/services/interactionChecker.ts:42-43`** — match on token boundaries, enforce a minimum token length, and add an explicit synonym/RxNorm map (**AI-052**).
2. Add **TC-180** (`["a","b"]` ⇒ `flagged === false`) and **TC-185** (`["in","as"]` ⇒ `flagged === false`) — both fail today (**AI-058**).
3. Add **TC-181** (`["Aspirin 81mg","Warfarin sodium"]` still flags) so the fix does not regress the legitimate partial-name case that **FR-008** requires and TC-025 asserts.

---

### G-26 — No negation handling in the triage scorer

| | |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected requirements** | **AI-090** (NOT IMPLEMENTED, new), **AI-050** (NOT IMPLEMENTED, new), **AI-003**, **AI-006**, **AI-051**, **AI-054**, **NFR-009** (unaffected — see below), **FR-004**, **FR-006** |
| **Effort** | **S** — 20 min to disclose and pin · **M** — 2–4 h for the proper fix |

**Description.** The scorer is a plain substring scan with no negation handling of any kind, so a denied symptom is scored as if it were present.

**Current state.** `api/src/services/triageScorer.ts:58-63` is an unqualified `normalized.includes(kw)` over 11 keyword groups. **Measured by execution on 2026-08-21:** `scoreTriage("I have no chest pain")` returns `{score: 35, band: "urgent", matchedFlags: ["possible cardiac chest pain"]}`. `"denies chest pain"` and `"chest pain resolved"` behave identically. Adjacent measured failures: `"heart attack"`, `"MI"`, `"SOB"` all score **0 / routine** (**AI-051**), and `"dolor de pecho"` scores **0 / routine** (**AI-054**).

**Why it matters.** A triage endpoint that escalates a *denied* symptom to `urgent` is the most quotable failure in the system and the first thing a curious judge will type. The disclaimer (`triageScorer.ts:18-21`, asserted by TC-020) is a genuine mitigation and the harm is bounded — but the behaviour must be **disclosed rather than discovered**. Note the nuance: **NFR-009 still holds** — the engine is deterministic and fully inspectable, and does exactly what the source says — but **AI-003** ("do not present the score as a clinical severity measure") is materially weakened when a negation inflates the band.

**Recommended fix.**

1. **Short term (already partly done):** the limitation is documented in `09_Intelligence_Layer/Limitations.md`. Add **TC-186** to `api/test/triageScorer.spec.ts` pinning the current behaviour, so a future change is a deliberate one.
2. **Proper fix:** negation-scope detection, or replace bare substrings at `triageScorer.ts:33-43` with per-flag phrase patterns. Requirement **AI-090** is the acceptance criterion: `scoreTriage("I have no chest pain")` ⇒ `score 0`, `band "routine"`, `matchedFlags` empty.
3. If negation is judged out of scope for this build, state that in the response payload and in `docs/API.md` rather than leaving it silent — that is what **AI-090** demands as the alternative.

---

### G-28 — The documented compile command writes to the wrong directory, and CI never checks the result

| | |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected requirements** | **OPS-006** (PARTIALLY IMPLEMENTED), **NFR-010**, **FR-015**, **OPS-056**, **OPS-059** |
| **Effort** | **S** — 45 min |

**Description.** Three linked problems: a documented command that populates a directory nothing reads, an undocumented copy step that the real build depends on, and no CI verification that the committed spec matches the source.

**Current state — reproduced end to end.** `puyapy` resolves `--out-dir` relative to the *source file*, so

```bash
python -m puyapy smart_contracts/consent/contract.py --out-dir artifacts
```

writes to `contracts/smart_contracts/consent/artifacts/` — **not** `contracts/artifacts/`, which is what `contracts/scripts/deploy_testnet.py` and the `/v1/consent/arc56` route (`api/src/app.ts:63-69`) read. That command appears verbatim at `README.md:142`, `docs/DEPLOYMENT.md:12`, `docs/PROOF.md:11` and **`.github/workflows/ci.yml:22`**. The committed artifacts prove a copy step happened: `contracts/artifacts/MedRailConsent.approval.puya.map` declares `"sources": ["../contract.py"]`, which resolves correctly only from `smart_contracts/consent/artifacts/`.

**Why it matters.** (a) A fresh clone following the Quickstart populates a directory nothing reads; it only appears to work because the artifacts are committed. (b) The committed source maps carry a path stale relative to their own location, so debugger and source-map tooling cannot resolve the source. (c) Most seriously, **CI compiles the contract and never compares the output to the committed ARC-56 spec**, so contract source and deployed spec can silently diverge — exactly how a fix to G-12 or G-20 could merge while the spec still describes the old contract. The build *is* byte-reproducible (verified with `cmp` on all four artifacts), which is what makes the missing check cheap to add and worth adding.

**Recommended fix.**

1. Point `deploy_testnet.py` and `api/src/app.ts:64` at `smart_contracts/consent/artifacts/` and drop the copy entirely — which also fixes the stale source-map path. Alternatively, document the copy step, since it is what actually reproduces the committed bytes.
2. **Do not simply switch to `--out-dir ../../artifacts`:** it targets the right directory but makes `puyapy` embed an absolute machine-specific path (`D:/MedRail/contracts/...`) in the source maps, breaking byte-reproducibility.
3. Add to **`.github/workflows/ci.yml`** after the compile step at `:22`: recompile, then `git diff --exit-code contracts/artifacts/`.

---

## 5. LOW

### G-20 — `GRANT_BOX_MBR` under-reports the true box cost

| | |
|---|---|
| **Severity** | **LOW** |
| **Affected requirements** | **FR-032** (IMPLEMENTED — incorrect value, defect C-2), **REL-006**, **FR-030** |
| **Effort** | **S** — 5 min code · redeploy deferred |

**Description.** A public ABI method whose only purpose is to be a right number returns a wrong one.

**Current state.** `contract.py:52` computes `2_500 + 400 * (32 + 17)` = **22,100** µALGO, returned by `get_grant_box_mbr()` at `:248-252`. The Algorand box MBR formula is `2500 + 400 * (len(key) + len(value))`, and the *effective* key includes the `BoxMap`'s 1-byte `key_prefix="g"` (`contract.py:114`), so the real key length is 33, not 32 ⇒ true cost **22,500** µALGO. **Verified on-chain:** app account `CCO26Y6Z56DDZ3OELO2UKJMIPJVSIT52I23F2MPMR52JBM3HQZZNUZNOR4` reports `min-balance = 145000` with `total-boxes = 2`; 145,000 − 100,000 (base account MBR) = 45,000 = 2 × 22,500.

**Why it matters.** The method is advertised at `contract.py:250-251` as *"a compile-time constant the backend can quote when sizing `fund_mbr` calls"*. A caller trusting it under-funds by 400 µALGO per box, ~1.8 %. Small in magnitude — but it is a wrong number in a method whose entire contract is to be a right one, and **FR-032 has no test** (TC-153 absent).

*The audit-log MBR is deliberately not hard-coded* (`contract.py:53-55`) because `AuditEntry` is variable-length. That is correct and is not a defect.

**Recommended fix.** **`contracts/smart_contracts/consent/contract.py:52`** — change to `400 * (33 + 17)`. Add **TC-153**, which fails today. Requires a redeploy to take effect: bundle with G-12 and **defer past the finals**, because `deploy_testnet.py:93` uses `OnUpdate.AppendApp` and a redeploy would mint a new App ID, invalidating `768743428` everywhere it is cited.

---

### G-29 — Dead configuration: `indexerServer` is declared but never used

| | |
|---|---|
| **Severity** | **LOW** |
| **Affected requirements** | **OPS-057** (NOT IMPLEMENTED), **NFR-003**, **NFR-012** |
| **Effort** | **S** — 5 min |

**Description.** `api/src/config.ts:51` computes `indexerServer` from a per-network map, and **no module in `api/src` or `api/scripts` references it** — verified: the only match anywhere in the API package is the definition itself. The running service never calls an indexer; every chain read goes through algod via `simulate` (`algorand.ts:98`, `:119`).

**Why it matters.** Harmless today, but it is configuration that implies a capability the service does not have. It also matters for dependency documentation: the AlgoNode **indexer** is a **verification-only** dependency used by humans and scripts checking the ledger, **not a runtime dependency of the API**. Documenting it as a runtime dependency would overstate the service's external coupling.

**The same defect exists one line earlier and is worth fixing in the same edit:** `config.usdcAssetId` (`api/src/config.ts:49`) is likewise defined and never read — the asset id in the live 402 comes from the facilitator's `/supported`, which is exactly why **G-04** exists.

**Recommended fix.** Either remove both fields from **`api/src/config.ts:49,51`**, or wire them up: `indexerServer` is the natural home for the audit-log listing that box storage cannot serve (see `04_Data/Indexing_And_Query_Strategy.md`), and `usdcAssetId` is the natural seed for G-04's offline 402 fallback. Making `algodServer`/`indexerServer` env-overridable at the same time closes **OPS-057**.

---

### G-24 — No performance measurement of any kind

| | |
|---|---|
| **Severity** | **LOW-MEDIUM** *(as recorded in `ENGINEERING_GAP_REPORT.md` §2)* |
| **Affected requirements** | **PERF-002**, **PERF-003**, **PERF-004** (all NOT IMPLEMENTED), **PERF-001**, **OPS-003** |
| **Effort** | **M** — 2–4 h |

**Description.** No load test, no benchmark, no latency instrumentation, no tooling.

**Current state.** The only data points in existence are two single observations by the reviewer: **505 ms** for a cold `GET /v1/consent/status` and **~15 ms** for a warm 402 on `/v1/triage`. Neither is a percentile, a throughput or an SLO, and neither may be presented as one.

**Why it matters.** The project makes no performance claims, which is the honest position — but it also cannot answer *"how does this behave under load"*, and the structural bottleneck is real and predictable: `records.ts:49` puts an inline `await logAccess` — Algorand confirmation latency, `atc.execute(algod, 4)` waiting 4 rounds at `algorand.ts:175` — on the paid response path, serialised per patient by `withPatientLock` (**PERF-004**).

**Recommended fix.** Define a latency budget for `/v1/consent/status` and the three priced routes (**PERF-002**), then measure with k6 or autocannon (**PERF-003**). Move the audit write off the response path (**PERF-004**) — which also removes the G-03 failure mode entirely. See `07_Testing/Performance_Validation.md`.

---

### G-25 — `fund_mbr` untested; `withdraw_excess` has only a negative test

| | |
|---|---|
| **Severity** | **LOW** |
| **Affected requirements** | **FR-030** (IMPLEMENTED, untested), **FR-031** (PARTIALLY IMPLEMENTED), **SEC-002**, **REL-006** |
| **Effort** | **S** — 45 min |

**Description.** Two fund-handling contract methods with no positive-path coverage.

**Current state.** `contracts/tests/test_consent.py` covers `withdraw_excess` rejection for a non-admin (`test_withdraw_excess_admin_only`, TC-014) but **never a successful withdrawal**, and never exercises `fund_mbr` (`contract.py:129-138`) at all.

**Why it matters.** `withdraw_excess` submits an inner `itxn.Payment(..., fee=0)` at `contract.py:259`, which depends on fee pooling from the outer transaction — an **untested assumption in a method that moves money**. `fund_mbr`'s only guard is `assert payment.receiver == Global.current_application_address` at `:138`, and nothing asserts that it rejects a payment addressed elsewhere.

**Recommended fix.** Add to **`contracts/tests/test_consent.py`**: **TC-154** (grouped payment to the app account succeeds), **TC-155** (payment to a different receiver asserts), **TC-156** (successful `withdraw_excess`: inner payment to `self.admin.value` with `fee = 0`, app balance decreases, fee-pooling condition satisfied).

---

### G-17 — `@x402/extensions` is declared but never imported

| | |
|---|---|
| **Severity** | **LOW** *(MEDIUM as originally found; documentation half corrected)* |
| **Affected requirements** | **NFR-010**, **FR-002**, **SEC-014** |
| **Effort** | **S** — 10 min |

**Current state.** `@x402/extensions@2.21.0` is declared at `api/package.json:17` and **imported nowhere** in `api/src`, `api/scripts`, `web/lib`, `web/components` or `web/app` — verified by exhaustive grep. `docs/COMPLIANCE.md` had cited that dependency as evidence that "the backend correctly implements Bazaar's discovery-extension schema".

**Why it matters.** An unused dependency presented as implemented functionality. A judge who greps for the import finds nothing, and the credibility cost lands on every *other* claim in that document — most of which are genuinely well-evidenced. It is also one more unscanned transitive tree (**SEC-014**).

**Recommended fix.** **Documentation corrected during the review** — the COMPLIANCE.md claim now describes route-metadata shape rather than an implemented extension. **Remaining:** either integrate the extension properly or remove the dependency from `api/package.json:17` and re-run `npm install`.

---

### G-18 — `walletConnect.ts` is referenced but does not exist

| | |
|---|---|
| **Severity** | **LOW** *(MEDIUM as originally found; documentation half corrected)* |
| **Affected requirements** | **FR-033**, **FR-034**, **FR-035**, **NFR-008**, **NFR-010** |
| **Effort** | **S** for the comment · **M** — 2–4 h for the consent-path refactor |

**Current state.** `web/lib/demoWallet.ts:12` points at `lib/walletConnect.ts` for "production usage". No such file exists; there is **no wallet-connect integration anywhere in `web/`**. `docs/IMPLEMENTATION_PLAN.md` §4 had claimed the real-wallet path "is also implemented, just not the one-click default".

**Why it matters.** This is the one place where an otherwise scrupulously honest document overclaims, and a judge can falsify it in ten seconds. There is a second-order inaccuracy that matters more architecturally: `docs/ARCHITECTURE.md` says adding a real wallet is *"a signer-object change, not an architecture change."* That holds for the **payment** path — `web/lib/x402Client.ts:6` takes a `ClientAvmSigner`, and `web/lib/demoWallet.ts:39-45` implements that interface. **It is false for the consent path:** `web/lib/consent.ts:50` and `:71` call `algosdk.mnemonicToSecretKey(wallet.mnemonic)`, and a real wallet has **no mnemonic to surrender**. `grantAccessOnChain`/`revokeAccessOnChain` would need a genuine refactor to accept a signer.

**Recommended fix.** **Documentation corrected during the review** (the plan text now says **NOT IMPLEMENTED**, and the "signer swap" claim is scoped to the payment path). **Remaining:** (a) correct the comment at `web/lib/demoWallet.ts:12`; (b) refactor `web/lib/consent.ts:44-89` to accept a `ClientAvmSigner`-shaped signer rather than a `DemoWallet`, mirroring `x402Client.ts`.

---

### G-19 — A 647-line architecture document for an unbuilt product sat in `docs/`

| | |
|---|---|
| **Severity** | **LOW** *(MEDIUM as originally found; corrected)* |
| **Affected requirements** | **NFR-010** |
| **Effort** | **S** — done |

**Current state.** `docs/SENTINEL_ARCHITECTURE.md` (untracked, 647 lines) described "Sentinel Exchange" — a FastAPI engine, a SQLite database, XGBoost forecasting, a contract-net auction, a second smart contract `SentinelProvenance`, five new frontend routes, an SSE bus, Twilio/WhatsApp notifiers. **None of it exists**, and it instructed "rewrite README around Sentinel Exchange".

**Why it matters.** A judge browsing `docs/` found a detailed architecture for a system that does not exist, adjacent to documentation for one that does, and had to decide which documents to believe. This was the largest single credibility risk in the repository.

**Recommended fix.** **Corrected during the review:** relocated to `docs/future/SENTINEL_EXCHANGE_PROPOSAL.md` with a prominent **UNBUILT PROPOSAL — NOT IMPLEMENTED** banner enumerating exactly what is absent. **Remaining:** none. Do not absorb any of its content into other documents as if built.

---

### G-22 — `web/README.md` was `create-next-app` boilerplate

| | |
|---|---|
| **Severity** | **LOW** |
| **Affected requirements** | **NFR-010** |
| **Effort** | **S** — done |

**Current state.** It still said "bootstrapped with `create-next-app`" and linked the Next.js tutorial, in a repository whose root README is otherwise carefully written — the visible seam where care ran out.

**Recommended fix.** **Corrected during the review:** replaced with a frontend-specific README describing `web/lib/*` and `web/components/*`. **Remaining:** none.

---

### G-23 — Stale details in `IMPLEMENTATION_PLAN.md`

| | |
|---|---|
| **Severity** | **LOW** |
| **Affected requirements** | **NFR-010**, **FR-010**, **FR-011**, **FR-012** |
| **Effort** | **S** — done |

**Current state.** Three drifts: §1 listed compiler "puya 0.6.0" while the project pins `puyapy==5.9.0` (`contracts/requirements-dev.txt`); §0 and §2 called the gated endpoint `/v1/records/:patientId/summary` when the implementation is `POST /v1/records/summary` with the patient in the body (`api/src/routes/records.ts:11`, `:25`); §7 listed a `scripts/` directory for "repo-level orchestration" that exists but is **empty**.

**Why it matters.** Small drifts — but this is the document other documents cite as their source of verified facts, so errors in it propagate.

**Recommended fix.** **All three corrected during the review.** **Remaining:** none. (the repo-root `ACTION_NEEDED.md`'s unbalanced-backtick rendering bug and `docs/ARCHITECTURE.md`'s "both categories write to the same audit log" sentence were corrected at the same time.)

---

## 6. Top 10 by Impact × Feasibility

Ranked by what most improves technical credibility per hour spent. The ordering is inherited from `ENGINEERING_GAP_REPORT.md` §3; the requirement IDs and hour estimates are added here.

| Rank | Gap | Severity | Primary requirements closed | Effort | Hours | Why it ranks here |
|---|---|---|---|---|---|---|
| **1** | **G-01** — bind payer to requester | **CRITICAL** | SEC-007, SEC-008, FR-039, SEC-006, FR-010 | **S** | 0.5–1.0 | ~15 lines converts the project's biggest vulnerability into its strongest talking point. The reference patch is compile-verified. Highest value-per-line change available. |
| **2** | **G-02** — execute `log_access` on TestNet once | **CRITICAL** | FR-012, FR-025 | **S** | 0.25–0.5 | Turns the headline mechanism from simulator-only into a checkable transaction id. Nothing needs to be written — the code path exists. |
| **3** | **G-03** — guard the success-path audit write, then make billing docs and code agree | **MEDIUM** | FR-011, REL-002 (locked in), SEC-013 (partly) | **S** | 0.33–0.66 | Three lines stop a legitimate sale being voided by a transient chain failure; correcting the denial-billing claim removes a documented-vs-actual mismatch a judge can reproduce. |
| **4** | **G-06** — fix the CI branch trigger | **HIGH** | OPS-006, NFR-005 | **S** | 0.1 | One line makes the CI evidence real instead of theoretical. |
| **5** | **G-07** — fix `fly.toml` defaults | **HIGH** | NFR-004, OPS-050, OPS-051, SEC-050 | **S** | 0.2–0.33 | The deployment config a reviewer opens should not be one that cannot work. |
| **6** | **G-04** — graceful facilitator degradation | **HIGH** | REL-001 | **M** | 2–4 | Removes a hard third-party dependency from the demo's critical path and from CI. |
| **7** | **G-05** — test `records.ts` and `algorand.ts` | **HIGH** | FR-010, FR-011, FR-012, REL-004, NFR-011 | **M** | 3–4 | Moves coverage from 0 % to meaningful on the critical path; the G-01 regression test is part of this. |
| **8** | **G-08** — box-key golden vectors | **MEDIUM** | NFR-011, DATA-001 | **M** | 2–3 | Cheap insurance against the worst-diagnosed failure mode in the system. |
| **9** | **G-10** — address validation + error hygiene | **MEDIUM** | SEC-010, SEC-011, FR-038 | **S** | 0.5 | Removes a 500-on-client-error and an information leak in one small change. |
| **10** | **G-15** — minimal observability | **MEDIUM** | OPS-002…OPS-005, OPS-061 | **M** | 3–4 | Without it, G-03's forfeited sales are undetectable and operator-balance exhaustion is invisible until it breaks the demo. |

**Just below the top ten: G-21 and G-26.** Both are genuine correctness defects in the rule engines and both are trivially reproducible by a judge at a keyboard. The mitigation that matters before submission is **disclosure** — already done in `09_Intelligence_Layer/Limitations.md` — plus the two pinning tests (TC-180, TC-186, ~20 min), rather than a rewrite of the matching logic under time pressure.

**Already closed:** G-17, G-18, G-19, G-22, G-23 on the documentation side. **Deliberately deferred:** G-12 and G-20 are one-line contract fixes that require a redeploy, and `deploy_testnet.py:93`'s `OnUpdate.AppendApp` would mint a **new App ID**, invalidating `768743428` everywhere it is cited. Fix in source now; redeploy after the finals, bundled.

---

## 7. What closing the top three costs

**Roughly two hours, and it is the highest-leverage two hours available in this repository.**

**G-01** is one new file (`api/src/x402Payer.ts`, ~15 lines, compile-verified against the installed SDK) plus a six-line guard in `api/src/routes/records.ts` after the schema check at `:29`, plus TC-110 and TC-111 — **45 minutes**. **G-02** is funding the operator account, granting self-consent through the existing UI, repointing `api/scripts/e2e-proof.ts:56` at `/v1/records/summary`, running it once, and pasting the resulting `auditTxId` into `docs/PROOF.md` — **20 minutes**, most of it waiting for confirmations. **G-03** is a `try/catch` around `records.ts:49` degrading to `200 { auditStatus: "pending" }`, plus deleting the `charged` field at `:43` and the stale comment at `:34-36`, plus the corresponding two-sentence corrections in `docs/API.md` and `docs/SECURITY.md` — **25 minutes**.

**Total: about one and a half hours of work, two with a careful re-read.** What it buys is disproportionate. Today the flagship claim — *"payment plus on-chain patient consent"* — is defeated by a body field an attacker chooses (G-01), and its central mechanism has a global counter reading zero on the public ledger (G-02). After those two changes, the consent gate becomes an actual access control whose authorisation decision is bound to a cryptographic signature, and the audit trail becomes a transaction id anyone can resolve on `lora.algokit.io`. G-03 removes the last documented-vs-actual contradiction in the paid path. **The two CRITICAL findings and the sharpest MEDIUM one all fall to changes measured in lines, not days** — which is precisely why they should not survive to the demo.

---

## 8. Cross-references

- Evidence-backed findings register with the full reference patch: [`../ENGINEERING_GAP_REPORT.md`](../ENGINEERING_GAP_REPORT.md)
- Requirement-by-requirement evidence: [`Requirements_Traceability_Matrix.md`](Requirements_Traceability_Matrix.md)
- Requirement statements and rationale: [`SRS.md`](SRS.md)
- The missing tests, written to be implementable: [`../07_Testing/Test_Cases.md`](../07_Testing/Test_Cases.md) Part C
- Threat model and the S-1 exploit chain: [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md)
- Prioritised remediation sequence: [`../WINNING_ROADMAP.md`](../WINNING_ROADMAP.md)
