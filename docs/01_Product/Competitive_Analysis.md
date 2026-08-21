# MedRail — Competitive Analysis


> **⚠ Correction notice.** Parts of this document were written against a review finding that was
> later proven wrong. Settlement in x402 v2 happens **only** on a sub-400 response, so **no error
> path in MedRail can consume a settled payment** — and consent-denied calls (HTTP 403) are **not
> charged**, contrary to `API.md`, `SECURITY.md`, and the `paidButDenied` field. The audit-sequence
> race causes a **rejected transaction**, not a corrupted log. See
> [`CORRECTIONS.md`](../CORRECTIONS.md) — it supersedes any statement here that contradicts it.

**Purpose:** Position MedRail against the mechanisms that genuinely exist for machine-readable consent and for paid clinical-API access, using verifiable capability, limitation, architecture, and deployment-model comparisons.

**Status of this document:** Authored 2026-08-21. **Only the MedRail column was independently verified** — against source at commit `32ffd73`, test runs, and the public Algorand TestNet indexer. Every other column describes a *standard, protocol, or commercial model* from its public specification or from its structurally observable shape. Those columns were **not** re-verified as part of this work and are marked `[external]`. Any cell that cannot be established from a public specification is marked `[unverified]` rather than filled in.

---

## 0. Rules of engagement for this document

1. **No invented commercial facts.** No competitor pricing, funding, revenue, customer count, market share, or user number appears anywhere below. Where such a figure would strengthen the argument, the cell reads `[REQUIRES EXTERNAL VALIDATION — no source in repo]`.
2. **No named-vendor claims.** Commercial clinical APIs are compared as a *model*, not as specific products, because specific product claims cannot be verified from this repository.
3. **No claim that MedRail is better on an unverified axis.** Where MedRail's own capability is **UNVALIDATED** or **NOT IMPLEMENTED**, the comparison says so in the same cell.
4. **The honest frame.** MedRail is a hackathon-scale TestNet demonstration with 32 tests, one settled self-payment, and a critical unmitigated authorisation flaw. The comparators below are, variously, ratified international standards and running commercial businesses. This document compares *mechanisms*, not maturity. Any reading of these tables as "MedRail wins" is a misreading.

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
| **Audit trail** | Typically `AuditEvent`, held by the same server `[external]` | Issuer and resource-server logs, each held by their operator `[external]` | The organisation's own log `[external]` | On-chain, tamper-evident `[external]` | Per-patient append-only box sequence, admin-written. DATA-002 **IMPLEMENTED**; **FR-025 UNVALIDATED on-chain — `total_audit_entries == 0`; `log_access` has never executed on TestNet** |
| **Audit integrity** | Rests on trusting the audited party `[external]` | Same `[external]` | Same `[external]` | Ledger-backed `[external]` | Ledger-backed *in design*. **Unproven in practice**, and see the row below. |
| **Audit attribution correctness** | `[unverified]` | Strong — the token identifies the client `[external]` | `[unverified]` | `[unverified]` | **Broken.** The entry records the *claimed* requester, taken unauthenticated from the request body. A successful impersonation writes a false attribution into an immutable log. SEC-008 **NOT IMPLEMENTED** (S-1) |
| **Authorisation strength in practice** | n/a — a representation, not an enforcement point | **Strong** — the defining strength of C-2 `[external]` | `[unverified]` | `[unverified]` | **Weak.** The grant is real and correctly evaluated, but against a self-asserted identity: `requesterAddress` comes from the request body (`api/src/routes/records.ts:5-8`) and is never bound to the payer. SEC-006 **PARTIALLY IMPLEMENTED — DEFEATED BY S-1** |
| **Privacy of the permission itself** | Held inside a controlled system `[external]` | Not public `[external]` | Not public `[external]` | Often public, sometimes hashed `[external]` | **Public.** Grants are visible on any Algorand indexer: patient = sender, requester = ABI arg 0. Only a sha256 key, a status byte, two timestamps and constant strings are stored — no PHI (SEC-004 **IMPLEMENTED**) — but *the existence of a relationship* is public metadata, and that is what makes the S-1 enumeration attack cheap. |
| **Maturity** | Ratified international standard, widely deployed `[external]` | Ratified standard, widely deployed `[external]` | Ubiquitous `[external]` | Mixed `[unverified]` | **Hackathon-scale TestNet demonstration.** 2 grant boxes, both revoked; 0 audit entries; no MainNet deployment; no public hosting. |

**Honest conclusion on consent.** Against C-2 on authorisation strength, MedRail loses outright today: OAuth2 verifies who the client is; MedRail asks the client who it is. Where MedRail is genuinely different is on *four* narrower axes — the patient (not an organisation) is the authority; the state is globally readable without an integration; revocation is unilateral and universal; and no counterparty needs onboarding. Those four are real, and each is **VALIDATED** on-chain. They do not compensate for S-1; they are simply different properties.

---

## 3. Payment and access model

| Dimension | C-4 · API-key + invoice model | C-6 · Other x402 entries | **M · MedRail** |
|---|---|---|---|
| **Capability** | Mature, well-understood commercial access to clinical reference data, with entitlements, quotas, SLAs, and support `[external]` | Per-call stablecoin settlement over HTTP 402, no account required `[external — assumed by category]` | Same as C-6; MedRail is a consumer of x402, not an inventor of it |
| **Unit of commerce** | The **account** `[external]` | The **call** | The **call** |
| **Onboarding** | Contract → credentials → key provisioning; human, organisational, business-day scale `[external]` | None `[external]` | **None.** No account, no key, no registration exists in the codebase to create one |
| **Caller prerequisites** | An API key `[external]` | A funded wallet on the target chain `[external]` | An Algorand account opted in to USDC ASA `10458941` with ≥ the price. **No ALGO needed** — the facilitator supplies `extra.feePayer`, and the settled transaction carries `fee: 0` |
| **Price discovery** | Sales, docs, or a pricing page `[external]` | The 402 response `[external]` | The 402 response: `amount`, `asset`, `network`, `payTo`, `maxTimeoutSeconds`, `extra.feePayer`. FR-002 **VALIDATED**; live capture in the fact ledger §4 |
| **Price** | `[REQUIRES EXTERNAL VALIDATION — no source in repo]` | `[unverified]` | `$0.02` / `$0.02` / `$0.05` — 20000 / 20000 / 50000 µUSDC. `api/src/app.ts:37-50` |
| **Settlement proof to the caller** | An invoice `[external]` | A settled on-chain transaction `[external]` | `PAYMENT-RESPONSE` header carrying a transaction confirmable on any public indexer. tx `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ` |
| **Payment ↔ authorisation coupling** | Decoupled — the key grants access, the invoice settles money `[external]` | Typically the payment **is** the authorisation `[external]` | **Both, deliberately.** Two open endpoints where payment is the only gate; one endpoint where payment **and** an on-chain consent check are both required. This split is the product thesis ([`../JUDGES.md`](../JUDGES.md); [`../ARCHITECTURE.md`](../ARCHITECTURE.md)) |
| **Refusal semantics** | 401/403 on a bad key, typically unbilled `[external]` | `[unverified]` | **403 after a settled payment**, with `paidButDenied: true` — the fee covers a real on-chain verification either way. Deliberate and disclosed (`api/src/routes/records.ts:34-46`; [`../SECURITY.md`](../SECURITY.md)) |
| **Refund / recovery** | Billing dispute, credits `[external]` | `[unverified]` | **None.** No refund path, no retry token, no idempotency key. On the success path a failed audit write returns 500 *after* settlement (R-2). REL-002 **NOT IMPLEMENTED** |
| **Rate limiting / quota** | Central to the model `[external]` | `[unverified]` | **None anywhere.** SEC-013 **NOT IMPLEMENTED** |
| **Availability posture** | SLA-backed `[external]` | `[unverified]` | **No SLA, no target, no measurement.** With the facilitator down all three priced routes return 500 with no `PAYMENT-REQUIRED` and no `Retry-After` (R-1); free routes stay up (REL-005 **VALIDATED**) |
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
| **Single points of failure** | The authorisation server `[external]` | The gateway `[external]` | `[unverified]` | **Three, all unmitigated.** Facilitator (R-1 ⇒ 500), AlgoNode (R-4 ⇒ 500, no timeout or retry), operator key (SEC-012) |
| **Privileged-key blast radius** | Scoped by design `[external]` | `[unverified]` | `[unverified]` | **Wide.** One hot mnemonic in an env var is simultaneously the contract admin: it can forge arbitrary audit entries, rotate `set_admin` to lock out the owner, and drain the app account via `withdraw_excess`. Acknowledged in [`../SECURITY.md`](../SECURITY.md); SEC-012 **NOT IMPLEMENTED** |
| **Atomicity of payment + authorisation + audit** | n/a | n/a | `[unverified]` | **Not atomic.** Payment settles through the facilitator, then the backend submits `log_access` as a follow-up transaction. A deliberate interoperability trade-off — a generic x402 client cannot know MedRail's App ID or method signature, so bundling would break off-the-shelf callers ([`../ARCHITECTURE.md`](../ARCHITECTURE.md); [`../IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) §3). Stated plainly rather than hidden |
| **Data-model coupling** | Tight to FHIR `[external]` | Vendor-specific `[external]` | `[unverified]` | **Loose.** `scope` is a free-form string, so a new endpoint needs no contract change (DATA-003). Cost: no scope vocabulary is published, and `SCOPE` is hard-coded to `"records:summary"` in the only consumer (`records.ts:10`) |
| **Third-party integrability** | Register a client `[external]` | Obtain a key `[external]` | Read the chain `[external]` | **`GET /v1/consent/arc56` serves the compiled ARC-56 spec over HTTP**, so an integrator can build ABI calls against App `768743428` without cloning this repository (`api/src/app.ts:63-69`). FR-015 **IMPLEMENTED** |
| **Internal consistency risk** | `[unverified]` | `[unverified]` | `[unverified]` | **Real.** Box-key derivation is implemented three times — `contract.py:95-98`, `api/src/services/algorand.ts:63-79`, `web/lib/consent.ts:26-34` — with **no cross-implementation test**. NFR-011 **UNVALIDATED**, severity MEDIUM |
| **Test posture** | `[unverified]` | `[unverified]` | `[unverified]` | 32 tests: 14 contract (AVM simulator, 0.41 s) + 18 API (4.08 s). **Zero coverage on `routes/records.ts` and `services/algorand.ts`** — the two highest-risk modules — and **zero frontend tests**. No coverage measurement, no load test, no security scanning |

---

## 5. Deployment model

| Dimension | C-1/C-2 | C-3 | C-4 | C-5 | C-6 | **M · MedRail** |
|---|---|---|---|---|---|---|
| **Typical topology** | Deployed inside or alongside an EHR `[external]` | Vendor SaaS `[external]` | Vendor SaaS `[external]` | Public chain + hosted gateways `[external]` | A hosted HTTPS endpoint + a chain `[external]` | A hosted HTTPS endpoint + Algorand. **Nothing is hosted today** |
| **Who operates it** | The provider organisation `[external]` | The vendor `[external]` | The vendor `[external]` | Mixed `[external]` | The entrant `[external]` | The operator (P-4) |
| **Network** | n/a | n/a | n/a | Varies `[external]` | Algorand MainNet expected for the challenge `[external]` | **TestNet only.** App `768743428`. **No MainNet deployment of `MedRailConsent` exists** |
| **Public endpoint** | `[external]` | `[external]` | `[external]` | `[external]` | Required by the challenge `[external]` | **None.** `api/Dockerfile` and `api/fly.toml` exist but have never been built by CI; a `fly deploy` today yields a service on `NETWORK = "mainnet"` (D-2) with no `CONSENT_APP_ID` (D-1) ⇒ two routes 500 |
| **Reproducible builds** | `[unverified]` | `[unverified]` | `[unverified]` | `[unverified]` | `[unverified]` | **No.** Both Dockerfiles use `npm install`, not `npm ci`, despite committed lockfiles (D-4) |
| **Secret hygiene in the build** | `[unverified]` | `[unverified]` | `[unverified]` | `[unverified]` | `[unverified]` | **Partial.** No `.env` is tracked by git (SEC-005 **VALIDATED**), but there is **no `.dockerignore` anywhere**, and `api/Dockerfile`'s build context is the repository root, so `api/.env` and `contracts/.env` enter it. Nothing `COPY`s them into a layer today (D-3, SEC-015) |
| **CI** | `[unverified]` | `[unverified]` | `[unverified]` | `[unverified]` | `[unverified]` | 3 jobs that **all pass locally** — but the workflow triggers on `main` and the only branch is `master`, so **CI has never run** (CI-1). No deployment stage, no security scanning, no coverage gate, no image build (CI-3) |
| **Health probing** | `[unverified]` | `[unverified]` | SLA-backed `[external]` | `[unverified]` | `[unverified]` | `GET /v1/health` exists and is ideal for a probe — and is **wired to nothing** in either Dockerfile or `fly.toml` (D-6) |
| **Horizontal scaling** | `[unverified]` | `[unverified]` | `[unverified]` | `[unverified]` | `[unverified]` | **Unsafe as configured.** `withPatientLock` is in-process only while `api/fly.toml` permits more than one machine (D-7) |
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
| 7 | **The contract is a public integration surface**, not an internal dependency: the ARC-56 spec is served over HTTP. | `api/src/app.ts:63-69` | FR-015 **IMPLEMENTED** |
| 8 | **Evidence-first documentation.** Every claim resolves to a path, transaction, or command. | [`../PROOF.md`](../PROOF.md) | NFR-010 **IMPLEMENTED** |

### 6.2 Genuine disadvantages — each verified

| # | Disadvantage | Against | Status |
|---|---|---|---|
| 1 | **The gate is not an access control.** Any paying stranger can impersonate any authorised requester by naming them in the request body. | C-2, decisively | SEC-006 **DEFEATED BY S-1**; SEC-007, SEC-008, FR-039 **NOT IMPLEMENTED** |
| 2 | **The audit trail has never been written on-chain.** `total_audit_entries == 0`. | C-1, C-3, C-5 | FR-025 **UNVALIDATED on-chain** |
| 3 | **The consent model is minimal** — a status byte and two timestamps against FHIR's full provision model. | C-1 | By design; still a gap |
| 4 | **The permission graph is public metadata.** Which is precisely what makes S-1 cheap to execute. | C-1, C-2, C-3 | Inherent to the design |
| 5 | **No quota, SLA, refund path, or support.** A failed audit write after settlement loses the caller's money. | C-4 | REL-002, SEC-013 **NOT IMPLEMENTED** |
| 6 | **The priced content is 25 hard-coded rules**, unvalidated against any clinical dataset. | C-4 | AI-005 **NOT IMPLEMENTED**; honestly disclosed in every response |
| 7 | **Three unmitigated single points of failure**, none with a timeout, retry, or breaker. | All | R-1, R-4, SEC-012 |
| 8 | **Nothing is deployed publicly, and the committed production config is broken.** | C-6 | D-1, D-2 |
| 9 | **CI has never run.** | C-6 | CI-1 |
| 10 | **A 647-line architecture document for a different, unbuilt product sits in `docs/`.** | C-6, on credibility | DOC-1, **HIGH** |

### 6.3 Against other x402 challenge entries specifically

The competitive field is `[unverified]` — no entrant list was fetched and none is in this repository. What can be said structurally:

| Axis | MedRail's position |
|---|---|
| **Payment mechanics** | **Undifferentiated.** Same protocol, same `@x402/*` 2.21.0 SDK line, same designated facilitator. |
| **Domain substance** | Differentiated: a real deployed smart contract with 13 ABI methods and 14 unit tests, rather than a paywall over a stateless function. |
| **Composition** | The plausible differentiator: payment, on-chain authorisation, and audit append in one call. **Two legs proven, one never executed.** |
| **Volume strategy** | The open/gated split is a deliberate answer to a structural problem — a consent-gated-only design cannot generate leaderboard volume, since it requires a pre-existing patient–requester relationship. Whether other entrants reasoned this way is `[unverified]`. |
| **Evidence discipline** | Likely a differentiator; every claim is transaction-linked. Undercut by DOC-1, DOC-4, DOC-9. |
| **Actual payment volume** | **One settled payment, sender == receiver.** Not volume, and must never be described as such. |
| **Entry classification** | **Composite** — three priced endpoints, one `payTo` (FR-101). Orchestrator explicitly not claimed. |

---

## 7. What would change this analysis

| Change | Effect |
|---|---|
| Implement FR-039 / SEC-007 payer↔requester binding (~10–15 lines using `decodePaymentSignatureHeader` from `@x402/core/http` and `getSenderFromTransaction` from `@x402/avm`, both present in the installed SDK) | Removes disadvantage 1. MedRail becomes comparable to C-2 on authorisation strength while keeping advantages 1–4. **The single highest-value change available.** |
| Execute `/v1/records/summary` successfully once against App `768743428` and record the `auditTxId` | Removes disadvantage 2 and completes the composition claim in [`./USP_Novelty.md`](./USP_Novelty.md). |
| Cache the facilitator's `/supported` and degrade to `503` + `Retry-After` | Removes one of three single points of failure and closes REL-001. |
| Relocate or banner `docs/SENTINEL_ARCHITECTURE.md` | Removes the largest credibility risk in the repository. |
| Fix the CI trigger (`main` → `master`) | Makes the existing green suite actually mean something. |
| Cross-implementation box-key derivation test | Closes NFR-011, the most likely source of a silent future break. |

---

## 8. Related documents

[`./Problem_Statement.md`](./Problem_Statement.md) · [`./Project_Vision.md`](./Project_Vision.md) · [`./User_Personas.md`](./User_Personas.md) · [`./User_Journey.md`](./User_Journey.md) · [`./Use_Cases.md`](./Use_Cases.md) · [`./Scope.md`](./Scope.md) · [`./USP_Novelty.md`](./USP_Novelty.md) · [`../ARCHITECTURE.md`](../ARCHITECTURE.md) · [`../COMPLIANCE.md`](../COMPLIANCE.md) · [`../SECURITY.md`](../SECURITY.md)
