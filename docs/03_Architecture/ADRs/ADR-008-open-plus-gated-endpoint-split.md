# ADR-008: Two endpoint categories — open x402-gated compute plus one consent-gated data endpoint

**Status:** Accepted
**Date:** Not recorded as a decision date. `docs/ARCHITECTURE.md` and `docs/IMPLEMENTATION_PLAN.md` first appear in commit `d2a5f7f`, 2026-08-07.
**Deciders:** Not recorded in repository
**Evidence:** `docs/ARCHITECTURE.md:30-46` ("Two endpoint categories, one reason"); `docs/IMPLEMENTATION_PLAN.md:7-12` (§0); `docs/IMPLEMENTATION_PLAN.md:37-43` (§2, entry classification); `api/src/app.ts:37-50`; `api/src/routes/records.ts:25-61`

## Context

MedRail's product claim is patient ownership of health data: a patient grants a specific requester a named scope on-chain, and only then can that requester buy access. That claim is embodied in exactly one endpoint, `POST /v1/records/summary` ($0.05), which requires both a settled x402 payment and a currently-valid grant.

The competition MedRail is entered in scores, among other things, real payment volume (per `docs/COMPLIANCE.md`; not independently re-verified in this review). MedRail registers as **Composite**: three paid endpoints sharing one `payTo` address (`docs/IMPLEMENTATION_PLAN.md:41`).

## Problem

A consent-gated endpoint cannot generate meaningful call volume by construction. Should MedRail ship only the endpoint that proves its thesis, or also ship open endpoints that anyone's agent can pay for without any prior relationship?

## Options considered

| Option | Pros | Cons | Why rejected |
|---|---|---|---|
| **Two categories: two open x402-only compute endpoints + one consent-gated data endpoint** (chosen) | The thesis is still proven by a real gated endpoint. The open endpoints are callable by any agent with USDC and no prior relationship, so the payment layer is exercised broadly. Qualifies as Composite. Both categories share one contract and one `payTo`. | Two-thirds of the priced surface has nothing to do with the product thesis. Invites the reading that the consent layer is a garnish on two generic paid endpoints. Splits testing and review attention — and in practice the *unrelated* endpoints got the tests (13) while the flagship got zero. | — |
| **Consent-gated endpoints only** | Maximum thematic coherence. Every paid call demonstrates the thesis. | Volume is bounded by the number of real patient-requester relationships, which for a hackathon submission is approximately zero. `docs/ARCHITECTURE.md:32-35` states the constraint precisely: "one patient, one doctor, a handful of calls a year." Would likely produce a submission with one payment — which, on the evidence, is what happened anyway (see Trade-offs). | Rejected on volume grounds. Recorded. |
| **Open endpoints only** | Simplest; maximum volume potential; no contract needed at all. | Deletes the entire reason MedRail exists. Would be two paid rule engines with a smart contract bolted on for decoration. | Deletes the product. |
| **One endpoint, two modes (consent optional)** | Single surface; the consent check becomes an optional escalation on the same route. | Pricing and semantics diverge sharply between the two modes; the 402 challenge would have to describe both. Conflates "pay for compute" with "pay for someone's data" in one URL, which is worse for a caller reading the API and worse for the audit story. | Muddier than an explicit split, with no benefit. |
| **Gated endpoint plus a *free* open tier** | Broad reach without pretending the free tier is part of the payment story. | Generates no payments, and the challenge is a payments challenge. Also gives away compute with no rate limiting (SEC-013). | Fails the competition constraint the split exists to satisfy. |

## Decision

Two categories, deliberately separate, sharing one contract and one `payTo` address:

| | `/v1/triage`, `/v1/interaction-check` | `/v1/records/summary` |
|---|---|---|
| Price | $0.02 each | $0.05 |
| Gate | x402 payment only | x402 payment **and** on-chain consent |
| Caller | anyone's agent, no prior relationship | a requester the patient has explicitly granted |
| Purpose | broad, repeatable payment volume | the patient-ownership proof |
| Chain state touched | none — pure compute | `check_access` (simulate) + `log_access` (real txn) |

## Rationale

### This rationale is recorded in the implementation

`docs/ARCHITECTURE.md:32-36`, verbatim:

> "The Global x402 Challenge's leaderboard scores real, sustained payment volume. A consent-gated 'only the patient's own doctor can call this' endpoint cannot generate that volume by construction — one patient, one doctor, a handful of calls a year. So MedRail deliberately splits into two categories that share one on-chain trust layer."

`docs/IMPLEMENTATION_PLAN.md:9` records the same in the plan written before implementation:

> "Open, stateless, x402-gated intelligence endpoints — `/v1/triage`, `/v1/interaction-check`. Anyone's agent can call these for a few cents. No consent lookup, no login, no API key. **These exist to generate genuine, broad, recurring call volume — the thing the Global x402 Challenge's leaderboard actually measures.**"

The rationale is recorded, and it is recorded in the least flattering possible terms — the documentation states outright that two of the three endpoints exist to score points. That candour is unusual and is the main reason the split reads as a considered design rather than a dodge.

## Is the split intellectually honest, or a hedge?

The brief asks this to be argued fairly both ways. Both readings have real support.

### The case that it is a hedge

- **The thesis endpoint is the least finished thing in the repo.** `/v1/records/summary` has **zero automated tests** — no test of `api/src/routes/records.ts` exists — while the two "volume" endpoints have 13 between them. The flagship's own success path has never completed end to end against the live contract: `total_audit_entries == 5` on application `768743428`, so `log_access` has **never executed on TestNet** (evidence gap **E-1**). FR-010, FR-011 and FR-012 are all **UNVALIDATED**.
- **The payment evidence still leans toward the volume half.** The first payments ever settled were against `/v1/triage`, an open endpoint (`docs/PROOF.md` §6, transaction `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ`), and they were self-payments — the deployer paying itself. The gated route has since been paid too, once by an independently keyed agent (`COMJ3TQO…`, sender `UYBTLPHS…` ≠ receiver `2WDV2J2F…`, `docs/PROOF.md` §10), which blunts this bullet without retiring it: that agent's TestNet float was seeded from the project's own wallet, so no external party has paid for either half of the split.
- **The gate does not actually gate.** Finding **S-1**: `requesterAddress` is read from the request body (`api/src/routes/records.ts:5-8, 32`) and is never bound to the identity that paid. Any paying stranger can assert an authorised requester's address — grants are public on-chain, so the pairs are readable from any indexer — and `check_access` returns true because that grant genuinely exists. **SEC-006 is DEFEATED; SEC-007 and FR-039 are NOT IMPLEMENTED.** The endpoint that carries the entire product claim is, today, an ordinary $0.05 paid endpoint with an extra latency cost.
- **The claim that both categories share the audit trail is not currently true.** `docs/ARCHITECTURE.md:44-46` says "Both categories write to the same audit log" and then corrects itself in the same sentence — "they currently don't — they're pure compute." Since `total_audit_entries == 5`, *neither* category has written to it on a real network. The first half of that sentence must never be quoted without the correction (**DOC-5**).
- **The two open endpoints are not health-data endpoints in any load-bearing sense.** They touch no patient, no consent, no chain state. Structurally, the same two rule engines could sit under any brand.

### The case that it is honest engineering

- **The reasoning is stated, not concealed.** A hedge dressed as a design decision does not typically write "these exist to generate volume — the thing the leaderboard actually measures" into the plan and the architecture doc. The split is legible enough to criticise precisely because it was documented.
- **The volume constraint is real, not an excuse.** A consent-gated endpoint genuinely cannot produce sustained payment volume: it requires a patient to have signed a grant to a specific requester first. That is a structural property of the product, not a scoping shortcut.
- **The open endpoints exercise the integration that matters.** The x402 payment path, the 402 challenge shape, the facilitator settlement and the fee-sponsorship flow are all validated *through* the open endpoints (FR-001, FR-002, FR-003 **VALIDATED**). Without them, the payment layer would have as little evidence as the consent layer has now.
- **The shared substrate is real, even if unexercised.** One contract, one `payTo`, one `SCOPE`-parameterised audit method. `DATA-003` (free-form scope) means adding a scoped endpoint needs no contract change. The plumbing genuinely is shared; what is missing is a call site, not a design.
- **The Composite classification is honestly claimed and Orchestrator is explicitly not claimed** (`docs/IMPLEMENTATION_PLAN.md:43`), even though claiming it would have been easy and unverifiable.

### Assessment

The split is a legitimate design decision, recorded with unusual candour, whose credibility currently depends on evidence the project has not produced. The gap is not that the split exists — it is that the half that justifies the split is the untested, unexecuted, and (via S-1) unenforced half. Fixing S-1 and executing `log_access` once on TestNet would move this from "arguably a hedge" to "defensible on evidence" at a cost measured in hours.

## Trade-offs

- **Review attention followed the easy half.** Pure functions are easy to test and got tested; the chain-integrated route is hard to test and got nothing. The split made that divergence possible.
- **Two gates, two failure modes, one price table.** Callers now face an endpoint that can return 403 `charged: false` after charging. `docs/SECURITY.md:62-67` records this as a considered choice ("settlement is cancelled on any status >= 400, so a denial costs the caller nothing"), and it is stated in the response body. It is still a surprising billing semantic that only exists because one endpoint has a second gate.
- **Latency divergence.** The open endpoints are pure compute; the gated one performs at least six algod round-trips on the success path (ADR-002, Trade-off 6) and blocks on a real transaction (PERF-004 **NOT IMPLEMENTED**). Same API, order-of-magnitude different behaviour, with no documented budget for either (PERF-002, PERF-003 **NOT IMPLEMENTED**).
- **Narrative cost.** A reviewer must be told twice: once that MedRail is about patient consent, once that two-thirds of its paid surface is not. Every document has to carry that explanation.
- **The tension is genuinely unresolvable at this scope.** There is no design that both proves patient ownership and generates volume with no real patients. The split is a reasonable answer to an unreasonable constraint; it is not a clever one.

## Consequences

**Positive**
- FR-001, FR-002, FR-003, FR-004 … FR-009 **VALIDATED** through the open endpoints.
- Composite entry classification is honestly supported by three priced endpoints on one `payTo` (`api/src/app.ts:41-46`, `api/src/config.ts:53`).
- DATA-003 **IMPLEMENTED** — a future scoped endpoint needs no contract change.

**Negative**
- FR-010, FR-011, FR-012 **UNVALIDATED** — no test of `routes/records.ts`, and E-1.
- SEC-006 **DEFEATED**, SEC-007 / FR-039 **NOT IMPLEMENTED** — the consent gate is not an access control (S-1).
- PERF-002, PERF-003, PERF-004 **NOT IMPLEMENTED** for the gated path.
- DOC-5 — the "both categories write to the audit log" sentence is a standing accuracy hazard in `docs/ARCHITECTURE.md:44-46`.

**Neutral**
- Pricing ($0.02 / $0.02 / $0.05) is declared in one object (`api/src/app.ts:37-50`), with a recorded rationale at `:35-36`: pricing should be auditable at a glance. That holds regardless of how the split is judged.

## Conditions for future reconsideration

- **Fix S-1 before anything else in this ADR is defensible.** Bind the payer to `requesterAddress` using `decodePaymentSignatureHeader` + `getSenderFromTransaction`, or `@x402/hono`'s `ProtectedRequestHook`. Until then the gated endpoint does not demonstrate the thing the split exists to demonstrate.
- **Execute `log_access` once on TestNet and record the transaction id.** Closes E-1 and converts FR-012 / FR-025 from **UNVALIDATED** to evidenced.
- **Add tests for `api/src/routes/records.ts`.** It is the only route with no coverage and the only one that matters to the thesis.
- **Correct DOC-5** so no document repeats "both categories write to the same audit log" without the correction.
- **If the open endpoints ever begin touching patient-specific data**, they must join the gated category rather than logging under a new scope — the split is defined by whether a specific patient's data is involved, not by price.
- **If real patient-requester relationships ever exist at volume**, the justification for the open endpoints weakens and the split should be re-argued on its merits rather than inherited.
