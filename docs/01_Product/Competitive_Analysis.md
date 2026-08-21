# MedRail — Competitive Analysis

**Purpose:** Position MedRail against the mechanisms that genuinely exist for machine-readable consent and for paid clinical-API access, using verifiable capability, limitation, architecture, and deployment-model comparisons.

**Status of this document:** Authored 2026-08-21. **Only the MedRail column was independently verified** — against source at commit `3b387df`, test runs, and the public Algorand TestNet indexer. Every other column describes a *standard, protocol, or commercial model* from its public specification or from its structurally observable shape. Those columns were **not** re-verified as part of this work and are marked `[external]`. Any cell that cannot be established from a public specification is marked `[unverified]` rather than filled in.

---

## 0. Rules of engagement for this document

1. **No invented commercial facts.** No competitor pricing, funding, revenue, customer count, market share, or user number appears anywhere below. Where such a figure would strengthen the argument, the cell reads `[REQUIRES EXTERNAL VALIDATION — no source in repo]`.
2. **No named-vendor claims.** Commercial clinical APIs are compared as a *model*, not as specific products, because specific product claims cannot be verified from this repository.
3. **No claim that MedRail is better on an unverified axis.** Where MedRail's own capability is **UNVALIDATED** or **NOT IMPLEMENTED**, the comparison says so in the same cell.
4. **The honest frame.** MedRail is a hackathon-scale TestNet demonstration with 73 tests, a handful of settled self-payments, five audit entries it wrote itself, and no users. The comparators below are, variously, ratified international standards and running commercial businesses. This document compares *mechanisms*, not maturity. Any reading of these tables as "MedRail wins" is a misreading.

---

## 1. The comparison set

| ID | Comparator | Why it is in scope |
|---|---|---|
| **C-1** | HL7 FHIR `Consent` resource | The standard way to *represent* a consent directive. |
| **C-2** | OAuth 2.0 / SMART-on-FHIR scopes | The standard way to *enforce* scoped machine-to-machine access to health data. |
| **C-3** | Per-organisation patient portals | What patients actually use today. |
| **C-4** | API-key + invoice clinical APIs (the model) | How paid clinical intelligence is actually sold. |
| **C-5** | Blockchain health-record projects (the category) | The nearest architectural neighbours. |
| **C-6** | Other x402 challenge entries (the category) | The direct competitive field for this submission. |
| **M** | **MedRail** (this build) | The subject. |

---

## 2. Consent representation and enforcement

| Dimension | C-1 · FHIR `Consent` | C-2 · OAuth2 / SMART-on-FHIR | C-3 · Patient portals | C-5 · Blockchain health projects | **M · MedRail** |
|---|---|---|---|---|---|
| **Capability** | A rich, expressive, standardised data model for a consent directive: actors, scope, period, provisions, policy references `[external]` | Scoped, short-lived, cryptographically verifiable access tokens issued after a defined authorisation flow; the mature answer for M2M health-data access `[external]` | Human-legible consent management and, usually, an access history, within one organisation `[external]` | Shared, tamper-evident consent/permission state across organisational boundaries without a central custodian `[external]` | A 3-field grant record — `status`, `granted_at`, `expires_at` — keyed by `sha256(patient‖requester‖scope)`, plus a per-patient append-only audit sequence. `contract.py:58-63`, `:95-98`. **VALIDATED** |
| **Expressiveness** | High — the richest of the set `[external]` | Medium; scope strings are the vocabulary `[external]` | `[unverified]` — varies per vendor | `[unverified]` — varies per project | **Low, deliberately.** One status byte, two timestamps, one free-form scope string (DATA-003). Everything else is out of the model. |
| **Who is the authority** | Whichever server holds the resource `[external]` | The **authorisation server**, operated by the data-holding organisation `[external]` | The organisation `[external]` | The chain / the contract `[external]` | The contract. `grant_access` / `revoke_access` take `Txn.sender` as the patient, so nobody can grant on another's behalf. `contract.py:148`, `:179`. SEC-003 **VALIDATED** |
| **Who can verify** | A party with an authenticated session to that server `[external]` | The resource server that trusts that issuer `[external]` | The organisation, and the patient in its UI `[external]` | Anyone with chain access `[external]` | **Anyone.** `check_access` is `readonly=True` and runs via `simulate()` — zero fee, nothing submitted. `contract.py:197-209`; `api/src/services/algorand.ts:82-100`. SEC-009 **IMPLEMENTED** |
| **Cost of a verification** | `[unverified]` | `[unverified]` | n/a | Varies; a chain read is typically free `[external]` | **Zero** on-chain fee. One cold end-to-end observation of **505 ms** through the HTTP endpoint — a single sample, not a benchmark |
| **Revocation** | Update the resource where it lives; propagation is a replication problem `[external]` | Token revocation at the issuer; other issuers are unaffected; issued tokens may remain valid until expiry `[external]` | Request to the organisation `[external]` | On-chain state change `[external]` | Patient-signed `revoke_access`; effective immediately for every reader. tx `OV2J2T5VWMIQG64JYGL7JEGZKKNZNKCMNIQU6AC4PDRQYZ6ZOO5A`. FR-020 **VALIDATED** |
| **Cross-organisation effect** | None inherent `[external]` | None — revoking at issuer A says nothing at issuer B `[external]` | None `[external]` | Yes, by construction `[external]` | Yes — one contract, one state, readable by anyone |
| **Counterparty onboarding** | Both parties must exist in the holding system `[external]` | The client must be **registered** with the authorisation server before it can request anything `[external]` | Both must have portal accounts `[external]` | `[unverified]` | **None.** Box storage means a `(patient, requester, scope)` triple exists with neither party opting in to the application. `contract.py:11-17` |
| **Expiry** | Supported (`period`) `[external]` | Central to the model (short-lived tokens) `[external]` | `[unverified]` | `[unverified]` | `duration_seconds > 0` ⇒ `expires_at`; `0` ⇒ never. FR-019 **VALIDATED** — **but unreachable from the UI**, which hard-codes `0` (`web/components/ConsentChecker.tsx:32`) |
| **Audit trail** | Typically `AuditEvent`, held by the same server `[external]` | Issuer and resource-server logs, each held by their operator `[external]` | The organisation's own log `[external]` | On-chain, tamper-evident `[external]` | Per-patient append-only box sequence, admin-written. DATA-002 **IMPLEMENTED**; **FR-025 VALIDATED on-chain** — `total_audit_entries = 5`, first entry at tx `4YLKLQKKWXXFW3UT5APJVYKXI7T7A6OACTAWCC5YBAN3XGOGHRVQ` |
| **Audit integrity** | Rests on trusting the audited party `[external]` | Same `[external]` | Same `[external]` | Ledger-backed `[external]` | Ledger-backed, and now demonstrated: the entries exist on a public network, in boxes whose shapes and MBR arithmetic reconcile exactly. Note what the ledger does *not* guarantee — the admin key writes the entries, so integrity against the operator rests on SEC-012, which is **NOT IMPLEMENTED** |
| **Audit attribution correctness** | `[unverified]` | Strong — the token identifies the client `[external]` | `[unverified]` | `[unverified]` | **Correct.** The entry records the requester recovered from the signature on the payment, not a name supplied by the caller: `payerFromRequest` (`api/src/x402Payer.ts`) recovers the payer and `records.ts:41-51` refuses the call on a mismatch, so an entry naming a party that did not make the request cannot be created through this endpoint. SEC-008 **VALIDATED** |
| **Authorisation strength in practice** | n/a — a representation, not an enforcement point | **Strong** — the defining strength of C-2 `[external]` | `[unverified]` | `[unverified]` | **Strong on the mechanism, narrow in what it proves.** The grant is real, correctly evaluated, and evaluated against an identity recovered from the payment signature rather than asserted by the caller (SEC-006, SEC-007 **VALIDATED**). What it proves is control of a keypair — there is no credentialing layer connecting that keypair to a clinician or an organisation, which C-2 deployments typically have around them |
| **Privacy of the permission itself** | Held inside a controlled system `[external]` | Not public `[external]` | Not public `[external]` | Often public, sometimes hashed `[external]` | **Public.** Grants are visible on any Algorand indexer: patient = sender, requester = ABI arg 0. Only a sha256 key, a status byte, two timestamps and constant strings are stored — no PHI (SEC-004 **IMPLEMENTED**) — but *the existence of a relationship* is public metadata. Enumerating the graph is still cheap; acting on it is no longer possible, because naming an authorised requester now requires holding that requester's key |
| **Maturity** | Ratified international standard, widely deployed `[external]` | Ratified standard, widely deployed `[external]` | Ubiquitous `[external]` | Mixed `[unverified]` | **Hackathon-scale TestNet demonstration.** Five audit entries, all self-generated; no MainNet deployment; no public hosting; no users. |

**Honest conclusion on consent.** MedRail no longer loses outright to C-2 on authorisation strength — the payer binding makes the consent check a real authorisation decision, and it does so without an authorisation server, a client registry, or a token lifecycle. What C-2 still has that MedRail does not is everything *around* the check: client registration, credentialing, and the operational maturity of a deployed standard. Where MedRail is genuinely different is on four narrower axes — the patient (not an organisation) is the authority; the state is globally readable without an integration; revocation is unilateral and universal; and no counterparty needs onboarding. Each is **VALIDATED** on-chain. They are different properties, not a claim to supersede C-2.

---

## 3. Payment and access model

| Dimension | C-4 · API-key + invoice model | C-6 · Other x402 entries | **M · MedRail** |
|---|---|---|---|
| **Capability** | Mature, well-understood commercial access to clinical reference data, with entitlements, quotas, SLAs, and support `[external]` | Per-call stablecoin settlement over HTTP 402, no account required `[external — assumed by category]` | Same as C-6; MedRail is a consumer of x402, not an inventor of it |
| **Unit of commerce** | The **account** `[external]` | The **call** | The **call** |
| **Onboarding** | Contract → credentials → key provisioning; human, organisational, business-day scale `[external]` | None `[external]` | **None.** No account, no key, no registration exists in the codebase to create one |
| **Caller prerequisites** | An API key `[external]` | A funded wallet on the target chain `[external]` | An Algorand account opted in to USDC ASA `10458941` with ≥ the price. **No ALGO needed** — the facilitator supplies `extra.feePayer`, and the settled transaction carries `fee: 0` |
| **Price discovery** | Sales, docs, or a pricing page `[external]` | The 402 response `[external]` | The 402 response: `amount`, `asset`, `network`, `payTo`, `maxTimeoutSeconds`, `extra.feePayer`. FR-002 **VALIDATED**; live capture in the fact ledger §4 |
| **Price** | `[REQUIRES EXTERNAL VALIDATION — no source in repo]` | `[unverified]` | `$0.02` / `$0.02` / `$0.05` — 20000 / 20000 / 50000 µUSDC. `api/src/app.ts:50-60`, and advertised per-route with its gate at `GET /` |
| **Settlement proof to the caller** | An invoice `[external]` | A settled on-chain transaction `[external]` | `PAYMENT-RESPONSE` header carrying a transaction confirmable on any public indexer. tx `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ` |
| **Payment ↔ authorisation coupling** | Decoupled — the key grants access, the invoice settles money `[external]` | Typically the payment **is** the authorisation `[external]` | **Both, deliberately, and in an unusually literal sense.** Two open endpoints where payment is the only gate; one endpoint where payment **and** an on-chain consent check are both required — and where the payment's *signature* supplies the identity the consent check is made against (`api/src/x402Payer.ts`). The split is the product thesis ([`../JUDGES.md`](../JUDGES.md); [`../ARCHITECTURE.md`](../ARCHITECTURE.md)); the identity recovery is what makes the gated half an access control without an account system |
| **Refusal semantics** | 401/403 on a bad key, typically unbilled `[external]` | `[unverified]` | **403, unbilled.** `@x402/hono` reaches settlement only on a status below 400, so every refusal — bad payer binding, absent consent — cancels the payment. The body says so (`charged: false`) and points at the free pre-flight check (`api/src/routes/records.ts:59-70`). The residual cost falls on MedRail: a denial still submits a `logAccess` transaction the operator account pays for |
| **Refund / recovery** | Billing dispute, credits `[external]` | `[unverified]` | **Not needed on the error path, absent everywhere else.** No error path can consume a settled payment — settlement is structurally unreachable on a status ≥ 400, so REL-002 is **VALIDATED** by the SDK. There is still no refund path, retry token, or idempotency key for anything that goes wrong *after* a 200 |
| **Rate limiting / quota** | Central to the model `[external]` | `[unverified]` | **On the free and refundable surface only.** 60/min on `/v1/consent/status`, 30/min on `/v1/consent/arc56` and `/v1/records/summary`, **429** with `Retry-After` (`api/src/rateLimit.ts`). Priced happy paths are deliberately unthrottled — they are economically self-limiting. In-memory and keyed on a spoofable header: a courtesy guard, not a quota system. SEC-013 **IMPLEMENTED** |
| **Availability posture** | SLA-backed `[external]` | `[unverified]` | **No SLA, no target, no measurement** (G-24). A facilitator outage is at least classified: priced routes return **503** with `Retry-After: 30` and a `PAYMENT_FACILITATOR_UNAVAILABLE` code (REL-001 **IMPLEMENTED**); free routes stay up (REL-005 **VALIDATED**). No timeout, retry, or breaker on algod I/O (REL-003 **NOT IMPLEMENTED**) |
| **Content backing the price** | Licensed, curated, maintained clinical datasets `[external]` | `[unverified]` | **14 curated interaction pairs and 11 keyword groups.** Not a licensed dataset — the `source` field cites "Lexicomp/Micromedex-class severity classifications" as a *class of reference*, and says so in every response (DATA-005 **VALIDATED**) |
| **Decision transparency** | `[unverified]` — often proprietary | `[unverified]` | **Total.** Pure functions over static tables; the whole rule set fits on one screen. AI-001, NFR-009 **VALIDATED** |

**Honest conclusion on payment.** MedRail's payment model is not differentiated from other x402 entries — it is the same protocol, the same SDK line (`@x402/*` 2.21.0), and the same facilitator that the challenge designates. Against C-4 it is differentiated on onboarding and unit-of-commerce, and *undifferentiated or worse* on everything a paying customer would actually rely on: quota, SLA, refunds, support, and data quality. The content behind the price is 25 hard-coded rules.

---

## 4. Architecture

| Dimension | C-2 · OAuth2/SMART | C-4 · API-key model | C-5 · Blockchain health | **M · MedRail** |
|---|---|---|---|---|
| **Shape** | Authorisation server + resource server + registered client `[external]` | Gateway + key store + metering + billing `[external]` | Chain + contracts + off-chain storage + indexers `[external]` | **1 contract + 1 stateless HTTP server + 1 static frontend.** No database, cache, queue, worker, or model exists anywhere. |
| **Where authoritative state lives** | The authorisation server's datastore `[external]` | The vendor's datastore `[external]` | On-chain `[external]` | **Algorand box storage only.** `api/src/config.ts` holds config; `api/src/data/interactions.json` and `SYNTHETIC_RECORD` are static. NFR-001 **IMPLEMENTED** |
| **Server-side per-caller state** | Sessions, tokens, client registrations `[external]` | Accounts, keys, usage counters `[external]` | `[unverified]` | **None.** Every call repeats the full 402 handshake |
| **Trust anchors** | The authorisation server `[external]` | The vendor `[external]` | The chain `[external]` | Three: the **facilitator** (settlement verdict — the standard x402 trust model, correctly framed in [`../SECURITY.md`](../SECURITY.md)); **AlgoNode** (chain view); and the **operator's admin key** (audit writes). The third is the weakest — see below |
| **Single points of failure** | The authorisation server `[external]` | The gateway `[external]` | `[unverified]` | **Three.** Facilitator — classified as a 503 with `Retry-After`, but the dependency is unchanged. AlgoNode — no timeout or retry (REL-003); on the gated route a failure now degrades to `auditStatus: "pending"` rather than an error, but `/v1/consent/status` has no such cushion. Operator key — unmitigated (SEC-012) |
| **Privileged-key blast radius** | Scoped by design `[external]` | `[unverified]` | `[unverified]` | **Wide.** One hot mnemonic in an env var is simultaneously the contract admin: it can forge arbitrary audit entries, rotate `set_admin` to lock out the owner, and drain the app account via `withdraw_excess`. Acknowledged in [`../SECURITY.md`](../SECURITY.md); SEC-012 **NOT IMPLEMENTED** |
| **Atomicity of payment + authorisation + audit** | n/a | n/a | `[unverified]` | **Not atomic.** Payment settles through the facilitator, then the backend submits `log_access` as a follow-up transaction. A deliberate interoperability trade-off — a generic x402 client cannot know MedRail's App ID or method signature, so bundling would break off-the-shelf callers ([`../ARCHITECTURE.md`](../ARCHITECTURE.md); [`../IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) §3). Stated plainly rather than hidden |
| **Data-model coupling** | Tight to FHIR `[external]` | Vendor-specific `[external]` | `[unverified]` | **Loose.** `scope` is a free-form string, so a new endpoint needs no contract change (DATA-003). Cost: no scope vocabulary is published, and `SCOPE` is hard-coded to `"records:summary"` in the only consumer (`records.ts:12`) |
| **Third-party integrability** | Register a client `[external]` | Obtain a key `[external]` | Read the chain `[external]` | **`GET /v1/consent/arc56` serves the compiled ARC-56 spec over HTTP**, so an integrator can build ABI calls against App `768743428` without cloning this repository (`api/src/app.ts:141-147`); `GET /` supplies the App ID, network, CAIP-2 id and spec URL alongside every route with its price and gate. FR-015, FR-017 **IMPLEMENTED** |
| **Internal consistency risk** | `[unverified]` | `[unverified]` | `[unverified]` | **Bounded.** Box-key derivation is still implemented three times — `contract.py:95-98`, `api/src/services/algorand.ts:63-79`, `web/lib/consent.ts:26-34` — but all three are now asserted against one shared golden-vector fixture (`api/test/fixtures/box-key-vectors.json`) from both the TypeScript and Python sides. NFR-011 **VALIDATED** |
| **Test posture** | `[unverified]` | `[unverified]` | `[unverified]` | **73 tests: 28 contract (AVM simulator) + 45 API.** `routes/records.ts` is covered by `x402Payer.spec.ts` and `app.spec.ts`; box-key parity is covered across three runtimes; the end-to-end composition and the impersonation defence are covered by two live scripts. **`services/algorand.ts` still has no dedicated unit-test file** (G-05), and there are **zero frontend tests**. No coverage measurement and no load test (G-24); `npm audit --audit-level=high` runs in CI and both packages report 0 vulnerabilities |

---

## 5. Deployment model

| Dimension | C-1/C-2 | C-3 | C-4 | C-5 | C-6 | **M · MedRail** |
|---|---|---|---|---|---|---|
| **Typical topology** | Deployed inside or alongside an EHR `[external]` | Vendor SaaS `[external]` | Vendor SaaS `[external]` | Public chain + hosted gateways `[external]` | A hosted HTTPS endpoint + a chain `[external]` | A hosted HTTPS endpoint + Algorand. **Nothing is hosted today** |
| **Who operates it** | The provider organisation `[external]` | The vendor `[external]` | The vendor `[external]` | Mixed `[external]` | The entrant `[external]` | The operator (P-4) |
| **Network** | n/a | n/a | n/a | Varies `[external]` | Algorand MainNet expected for the challenge `[external]` | **TestNet only.** App `768743428`. **No MainNet deployment of `MedRailConsent` exists** |
| **Public endpoint** | `[external]` | `[external]` | `[external]` | `[external]` | Required by the challenge `[external]` | **None.** `api/Dockerfile` and `api/fly.toml` exist and are now internally consistent — `NETWORK = "testnet"`, `CONSENT_APP_ID = "768743428"`, a `/v1/health` check — but nothing has been deployed and the images have never been built by CI |
| **Reproducible builds** | `[unverified]` | `[unverified]` | `[unverified]` | `[unverified]` | `[unverified]` | **Yes at the dependency level.** Both Dockerfiles use `npm ci` against committed lockfiles. Unproven at the image level: never built in CI (NFR-007) |
| **Secret hygiene in the build** | `[unverified]` | `[unverified]` | `[unverified]` | `[unverified]` | `[unverified]` | **Good.** No `.env` is tracked by git (SEC-005 **VALIDATED**), and `.dockerignore` files now exist at the repository root and in `web/`, so `api/.env` and `contracts/.env` no longer enter the build context (SEC-015) |
| **CI** | `[unverified]` | `[unverified]` | `[unverified]` | `[unverified]` | `[unverified]` | Runs on `push` to `main` and `master` plus `workflow_dispatch`, with pip and npm caching, `npm audit --audit-level=high` on both packages, and an artifact-freshness gate (`git diff --exit-code -- contracts/artifacts/` after recompiling). **No deployment stage, no coverage gate, no image build** |
| **Health probing** | `[unverified]` | `[unverified]` | SLA-backed `[external]` | `[unverified]` | `[unverified]` | `GET /v1/health` exists and `api/fly.toml` now wires a check to it |
| **Horizontal scaling** | `[unverified]` | `[unverified]` | `[unverified]` | `[unverified]` | `[unverified]` | **Deliberately pinned to one machine.** `withPatientLock` is in-process only, and `api/fly.toml` sets `max_machines_running = 1` to match. The constraint is explicit rather than removed (G-11) |
| **Discovery** | Registry / conformance statements `[external]` | Vendor docs `[external]` | Vendor docs `[external]` | `[unverified]` | Bazaar + `x402-global-challenge` tag `[external]` | **Not listed.** `@x402/extensions` is declared but imported nowhere (DOC-9); listing is pending operator action |

---

## 6. Where MedRail actually stands

### 6.1 Genuine advantages — each verified

| # | Advantage | Evidence | Status |
|---|---|---|---|
| 1 | **The patient is the authority, not an organisation.** Both mutating consent methods take `Txn.sender` as the patient. | `contract.py:148`, `:179`; tx `X2BQ5FD4…`, `OV2J2T5V…` | SEC-003 **VALIDATED** |
| 2 | **No key ever reaches the backend.** Grant/revoke are signed client-side against AlgoNode. | `web/lib/consent.ts:44-89`; no key-ingress path in `api/src` | NFR-008 **IMPLEMENTED** |
| 3 | **Anyone can verify a permission, for free, without an integration.** | `contract.py:197-209`; `atc.simulate()` at `algorand.ts:98` | SEC-009 **IMPLEMENTED** |
| 4 | **Neither party needs to onboard.** Box storage, not local state. | `contract.py:11-17`, `:114-116` | **IMPLEMENTED** |
| 5 | **Zero-onboarding paid access.** No account, no key, no contract; the price is discovered from the 402. | `api/src/x402.ts`; tx `OYRQRKYA…` | FR-001…FR-003 **VALIDATED** |
| 6 | **Fully inspectable decision logic.** No opaque model in the path. | `triageScorer.ts:32-44`; `interactions.json` | AI-001, NFR-009 **VALIDATED** |
| 7 | **The contract is a public integration surface**, not an internal dependency: the ARC-56 spec is served over HTTP, and `GET /` publishes the App ID, network, and every route with its price and gate. | `api/src/app.ts:141-177` | FR-015, FR-017 **IMPLEMENTED** |
| 8 | **Evidence-first documentation.** Every claim resolves to a path, transaction, or command. | [`../PROOF.md`](../PROOF.md) | NFR-010 **IMPLEMENTED** |
| 9 | **The payment supplies the identity.** The requester is recovered from the signature on the payment rather than asserted in the body, so the consent check is an authorisation decision with no account system behind it. | `api/src/x402Payer.ts`; `contracts/artifacts/g01-verification.json` | FR-039, SEC-007, SEC-008 **VALIDATED** |
| 10 | **A refusal is free to the caller.** Settlement is unreachable on any status ≥ 400, so a failed authorisation or a malformed body costs nothing — a property of x402 v2 rather than of MedRail, and stated as such. | `@x402/hono`; `records.ts:59-70` | REL-002 **VALIDATED** |

### 6.2 Genuine disadvantages — each verified

| # | Disadvantage | Against | Status |
|---|---|---|---|
| 1 | **Nobody but the author has ever used it.** Every settled payment is a self-payment; all five audit entries were written by this project's own scripts; nothing is publicly hosted, on MainNet, or listed on Bazaar. | C-3, C-4, C-6, decisively | The single largest gap |
| 2 | **No identity layer above the keypair.** The payer binding proves control of an address; nothing connects an address to a person, a clinician, or a licence. | C-2, C-3 | No mechanism exists, planned or otherwise |
| 3 | **The consent model is minimal** — a status byte and two timestamps against FHIR's full provision model. | C-1 | By design; still a gap |
| 4 | **The permission graph is public metadata.** Enumerable by anyone, forever. | C-1, C-2, C-3 | Inherent to the design. No longer exploitable for impersonation, but still a disclosure |
| 5 | **No quota, SLA, or support.** The rate limiter is in-memory, per-instance, and keyed on a spoofable header. | C-4 | SEC-013 **IMPLEMENTED** as a courtesy guard, not as a quota system |
| 6 | **The priced content is 25 hard-coded rules**, unvalidated against any clinical dataset, with unanchored substring matching that false-positives on short inputs. | C-4 | AI-005, AI-006 **NOT IMPLEMENTED** (G-21); honestly disclosed in every response |
| 7 | **No observability of any kind.** Structured JSON logs exist and nothing consumes them — no metrics, no tracing, no alerting, no performance measurement. | All | G-15, G-24 |
| 8 | **The deployed contract runs pre-fix bytecode.** Two source defects (swapped `AccessRequested` args, an under-reported `GRANT_BOX_MBR`) are fixed and tested but not live, because redeploying via `OnUpdate.AppendApp` would mint a new App ID and discard the history every proof rests on. | C-5, on rigour | G-12, G-20 — fixed in source, redeploy deferred by design |
| 9 | **No timeout, retry, or circuit breaker on chain I/O**, and no dedicated test coverage for the module that performs it. | All | REL-003, G-05 |
| 10 | **A 647-line architecture document for a different, unbuilt product sits in `docs/`.** | C-6, on credibility | DOC-1, **HIGH** |

### 6.3 Against other x402 challenge entries specifically

The competitive field is `[unverified]` — no entrant list was fetched and none is in this repository. What can be said structurally:

| Axis | MedRail's position |
|---|---|
| **Payment mechanics** | **Undifferentiated.** Same protocol, same `@x402/*` 2.21.0 SDK line, same designated facilitator. |
| **Domain substance** | Differentiated: a real deployed smart contract with 13 ABI methods and 28 unit tests, rather than a paywall over a stateless function. |
| **Composition** | The plausible differentiator: payment, on-chain authorisation, and audit append in one call. **All three legs proven on TestNet, in a single repeatable run.** |
| **Use of the payment as a credential** | Possibly a differentiator, `[unverified]` against the field: the requester's identity is recovered from the payment signature rather than asserted, so the gated endpoint authorises without an account system. Whether other entrants bind payer to a domain identity is unknown. |
| **Volume strategy** | The open/gated split is a deliberate answer to a structural problem — a consent-gated-only design cannot generate leaderboard volume, since it requires a pre-existing patient–requester relationship. Whether other entrants reasoned this way is `[unverified]`. |
| **Evidence discipline** | Likely a differentiator; every claim is transaction-linked, and the two live verification scripts (`e2e-consent-proof.ts`, `verify-g01-fix.ts`) write their raw output to `contracts/artifacts/`. Undercut by DOC-1, DOC-4, DOC-9. |
| **Actual payment volume** | **Zero third-party payments.** Every settled payment has sender == receiver. Not volume, and must never be described as such. |
| **Entry classification** | **Composite** — three priced endpoints, one `payTo` (FR-101). Orchestrator explicitly not claimed. |

---

## 7. What would change this analysis

| Change | Effect |
|---|---|
| **A payment from an account that is not the project's own** | Removes disadvantage 1, the only one that matters commercially. Nothing in the codebase blocks it; it needs a public endpoint and a caller. |
| **Publish the endpoint** | The Fly configuration is correct and unused. Until something is reachable, every other advantage in §6.1 is a property of a repository rather than of a service. |
| **An identity layer above the address** — clinician credentialing, or a verifiable-credential attestation bound to the requester key | Removes disadvantage 2 and is the precondition for any real clinical deployment. No design exists. |
| **Expose the audit trail** — an endpoint and a UI over `get_audit_count` / `get_audit_entry` | Five entries exist on-chain with no way for a patient to read them, which is the patient-facing half of the ownership story told but not shown. |
| **Observability** — metrics, tracing, alerting over the existing structured logs | Closes G-15. Today a silently failing audit write (`auditStatus: "pending"`) would be invisible. |
| **Redeploy the contract** once a new App ID is acceptable | Lands the C-1 and C-2 source fixes on-chain (G-12, G-20), at the cost of the history every proof in this document set cites. |
| **Relocate or banner `docs/SENTINEL_ARCHITECTURE.md`** | Removes the largest credibility risk in the repository (DOC-1). |

---

## 8. Related documents

[`./Problem_Statement.md`](./Problem_Statement.md) · [`./Project_Vision.md`](./Project_Vision.md) · [`./User_Personas.md`](./User_Personas.md) · [`./User_Journey.md`](./User_Journey.md) · [`./Use_Cases.md`](./Use_Cases.md) · [`./Scope.md`](./Scope.md) · [`./USP_Novelty.md`](./USP_Novelty.md) · [`../ARCHITECTURE.md`](../ARCHITECTURE.md) · [`../COMPLIANCE.md`](../COMPLIANCE.md) · [`../SECURITY.md`](../SECURITY.md)
