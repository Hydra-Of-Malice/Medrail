# ADR-005: The audit write is a follow-up transaction, not part of the payment's atomic group


> **⚠ Correction notice.** Parts of this document were written against a review finding that was
> later proven wrong. Settlement in x402 v2 happens **only** on a sub-400 response, so **no error
> path in MedRail can consume a settled payment** — and consent-denied calls (HTTP 403) are **not
> charged**, contrary to `API.md`, `SECURITY.md`, and the `paidButDenied` field. The audit-sequence
> race causes a **rejected transaction**, not a corrupted log. See
> [`CORRECTIONS.md`](../../CORRECTIONS.md) — it supersedes any statement here that contradicts it.

**Status:** Accepted
**Date:** Not recorded as a decision date. The rationale is recorded in `docs/IMPLEMENTATION_PLAN.md` §3, which first appears in commit `d2a5f7f`, 2026-08-07.
**Deciders:** Not recorded in repository
**Evidence:** `docs/IMPLEMENTATION_PLAN.md:45-52` (§3, the full recorded rationale); `docs/ARCHITECTURE.md:95-108`; `contracts/smart_contracts/consent/contract.py:18-23`; `contract.py:217-236`; `api/src/services/algorand.ts:140-179`; `api/src/routes/records.ts:32-49`

## Context

Algorand's `exact` x402 scheme permits a client's signed payment group to contain up to 16 top-level transactions. It is therefore *technically possible* to require the caller to bundle a `log_access` (or `check_access`) application call into the same atomic group as their USDC transfer, making "payment settled" and "access logged" a single all-or-nothing ledger event.

MedRail did not do that. The payment settles through the facilitator in the ordinary way, and then MedRail's own operator account submits `log_access` as a separate transaction (`api/src/routes/records.ts:49` → `api/src/services/algorand.ts:146-179`).

## Problem

Should the on-chain audit write be atomic with the payment (bundled into the client's signed group), or a follow-up transaction submitted by MedRail after settlement confirms?

## Options considered

| Option | Pros | Cons | Why rejected |
|---|---|---|---|
| **Follow-up transaction from MedRail's admin account** (chosen) | Works with any off-the-shelf x402 client — `@x402/fetch`, `@x402/axios`, another team's agent — because the caller only ever constructs what `paymentRequirements` describes. No app ID, no ABI method signature, no box references leak into the client's problem. MedRail controls when and what is logged. | Not atomic. Two transactions, moments apart. A settled payment with a failed audit write is representable, and it happens (finding R-2). MedRail's operator must hold ALGO and be online. Adds ≥4 algod round-trips to the paid path. | — |
| **Bundle the consent app-call into the client's payment group** | True ledger-level atomicity: either the payment and the audit entry both land, or neither does. REL-002 satisfied by construction. | Requires every caller to know MedRail's App ID, the `log_access` ABI signature, and the exact box references — including a *predicted* audit sequence number (ADR-009), which the client cannot compute without reading chain state first. Generic x402 clients cannot do this. `log_access` is admin-only, so the client could not sign it anyway without the contract being rewritten to accept caller-signed writes — which would destroy SEC-001. | **Recorded rejection.** See Rationale. Incompatible with off-the-shelf x402 clients, and structurally incompatible with the admin-only audit gate (ADR-006). |
| **Log asynchronously after responding (fire-and-forget)** | Removes the write from the response path (would satisfy PERF-004). The caller is never 500'd by a chain failure. | The response would claim `consentVerifiedOnChain: true` and return `auditTxId` before the write is confirmed — or omit those fields entirely, weakening the evidence story. Silent audit loss with no error surface at all. | Trades a visible failure for an invisible one, with no durable store (ADR-002) to retry from. |
| **Durable outbox: record the intent, respond, retry the write** | Correct answer to R-2. Payment is never consumed without either delivery or a recoverable record. | Needs a durable store and a worker — the infrastructure ADR-002 excludes. | Rejected implicitly by ADR-002. **This is the missing pairing that turns a reasonable decision into a real defect** — see Trade-offs. |
| **Do not log at all** | No failure mode. | Deletes the differentiator. The audit trail *is* the product claim. | Not a serious option. |

## Decision

The facilitator verifies and settles the payment through the standard x402 flow. Immediately afterwards, MedRail's own operator account — already registered as `admin` on the contract — submits `log_access` as a separate application call. For `/v1/records/summary` this is preceded by a free, simulated `check_access` read.

## Rationale

### This rationale is recorded in the implementation

`docs/IMPLEMENTATION_PLAN.md:45-52` (§3) is the primary record. The core argument, verbatim from `:49`:

> "Generic x402 clients (`@x402/fetch`, `@x402/axios`, or any other team's agent calling our endpoint) only know how to construct the payment transaction(s) described in `paymentRequirements`. They have no way to know our app ID or method signature. Requiring a custom multi-transaction group would make the endpoint incompatible with off-the-shelf x402 clients — directly against 'cheap and frequent beats expensive and rare' and against broad leaderboard reach."

And the trade-off is recorded in the same section, at `:51`, without softening:

> "Trade-off, stated plainly: this is not fully atomic at the raw ledger level (payment and audit-log write are two separate transactions, moments apart, both real and both on TestNet/MainNet). The mitigation is that `log_access` is admin-gated and only ever called by our backend directly after a facilitator-confirmed settlement, so there's no path to a logged access without a real paid+settled transaction preceding it."

`docs/ARCHITECTURE.md:95-108` records the same argument independently. The contract's own module docstring points at it (`contract.py:22-23`), and so does the `logAccess` docstring in the backend (`api/src/services/algorand.ts:141-144`). Four places, consistent, with the trade-off named in all the substantive ones. This is unusually good decision hygiene and should be credited as such.

`docs/IMPLEMENTATION_PLAN.md:52` also records the upgrade path: full atomicity becomes available "once we control both ends of a call (e.g., the future orchestrator agent), where we can add a custom-app-call leg to the payment group ourselves." That is correct — the constraint is the *stranger* client, not the protocol.

### One thing the recorded rationale understates

The recorded mitigation covers one direction only. It establishes that **there is no logged access without a settled payment**. It says nothing about the other direction: **there can be a settled payment without a logged access**, and on the success path that failure is not caught. See Trade-offs.

## Trade-offs

**1. Non-atomicity is real and the asymmetry is one-directional.** The mitigation (`log_access` is admin-only, called only after settlement) prevents forged audit entries attesting to unpaid access. It does not prevent paid access going unrecorded. Both halves matter for an audit trail whose value proposition is completeness.

**2. Finding R-2 (HIGH, correctness/money) is the direct consequence of this design not being paired with an outbox or a retry.**

`api/src/routes/records.ts` handles the two paths asymmetrically:

```ts
// denied path — defensive (line 37)
await logAccess(patientId, requesterAddress, SCOPE, ENDPOINT, "consent_denied").catch(() => undefined);

// allowed path — not defensive (line 49)
const logResult = await logAccess(patientId, requesterAddress, SCOPE, ENDPOINT, "consent_checked");
```

If the write on line 49 throws — operator out of ALGO, app account out of box MBR, algod 5xx, validity-window expiry, or a mispredicted audit sequence (ADR-009) — the request falls through to `app.onError` (`api/src/app.ts:58-61`) and returns **HTTP 500 after the payment has already settled**. The caller has paid $0.05 and receives nothing: no record, no `auditTxId`, no refund path, no retry token, and no server-side record of the fact (there is no durable store and no structured logging — OPS-002 **NOT IMPLEMENTED**). REL-002 is **NOT IMPLEMENTED**.

The asymmetry is worth naming precisely because it shows the failure was not a blind spot about error handling in general: the *rejection* path was made defensive deliberately, and the *success* path — the one where money has definitely been taken and something is definitely owed — was not.

Note also that the defensive `.catch(() => undefined)` on the denied path silently discards the failure. The caller is still charged and still gets `paidButDenied: true`, but the on-chain denial record that `docs/SECURITY.md:62-67` presents as the justification for charging may not exist. Nothing anywhere records that it failed.

**3. The write blocks the response.** `await logAccess(...)` is inline before `c.json(...)`, so the caller waits for a real Algorand transaction — submit plus up to 4 rounds of confirmation polling (`api/src/services/algorand.ts:175`) — on every successful paid call. PERF-004 is **NOT IMPLEMENTED**. This is the cost of returning `auditTxId` and `auditSequence` in the response body (`records.ts:57-58`), which is itself a genuine evidence feature. The two goals are in tension and the current code resolves it in favour of evidence over latency, without recording that it did.

**4. The operator account becomes a runtime dependency of a paid endpoint.** Every successful `/v1/records/summary` requires the operator to hold ALGO and the app account to hold MBR headroom. Neither is monitored (OPS-005, REL-006). An operator running out of ALGO manifests as R-2 on every subsequent paid call.

**5. This path has never run on a real network.** `total_audit_entries == 0` on the deployed application and there are zero `s`- or `a`-prefixed boxes (evidence gap **E-1**). The follow-up write is covered only by AVM-simulator unit tests (`contracts/tests/test_consent.py`, 2 cases). FR-012 and FR-025 are **UNVALIDATED**; there is no test of `api/src/routes/records.ts` at all. So the mechanism this ADR describes is architecturally sound and has never been demonstrated end to end against live infrastructure.

## Consequences

**Positive**
- Any off-the-shelf x402 client can call every MedRail endpoint. This is the whole point, and it holds.
- SEC-001 **VALIDATED** — keeping the write server-side is what makes the admin gate viable (ADR-006).
- FR-003 **VALIDATED** — the payment flow is exactly the standard one, proven by transaction `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ`.
- The upgrade path to real atomicity is identified and correctly scoped (orchestrator, where MedRail controls the client).

**Negative**
- REL-002 **NOT IMPLEMENTED** — finding R-2. A settled payment can be consumed with nothing delivered and nothing recorded.
- PERF-004 **NOT IMPLEMENTED** — the audit write blocks the paid response path.
- FR-012 **UNVALIDATED**, FR-025 **UNVALIDATED on-chain** — evidence gap E-1.
- SEC-008 **NOT IMPLEMENTED** — separately, whatever gets logged is the *claimed* requester (finding S-1, see ADR-004/ADR-008). A follow-up write does not fix attribution, and an atomic one would not have either.

**Neutral**
- The recorded justification for charging denied requests (`docs/SECURITY.md:62-67`) is coherent and stated in the response body itself (`paidButDenied: true`). It is a defensible product decision, not an oversight — subject to the caveat in Trade-offs (2) that the denial record may silently fail to be written.

## Conditions for future reconsideration

- **Fix R-2 without adopting an outbox first**: wrap line 49 so that a write failure still returns the record with an explicit `auditWriteFailed: true` and a null `auditTxId`, rather than a 500. The caller paid; deliver something. This is a small change and does not require infrastructure.
- **Then decide whether an outbox is warranted.** If a settled payment is ever actually lost, ADR-002's exclusion of a durable queue should be revisited for this one path.
- **Move `log_access` off the response path** (PERF-004) only once a durable retry exists — asynchronous logging without durability converts a visible failure into a silent one.
- **Revisit atomicity when MedRail controls the client**, i.e. the orchestrator entry type described at `docs/IMPLEMENTATION_PLAN.md:43` and `docs/ARCHITECTURE.md:144-150`. Note that atomicity would still require either caller-signed audit writes (destroying SEC-001) or MedRail signing a leg of the group — the latter is the workable shape.
- **Execute the path on TestNet at least once** and record the transaction id. Closing E-1 costs one script run and converts the project's central differentiator from **UNVALIDATED** to demonstrated.
