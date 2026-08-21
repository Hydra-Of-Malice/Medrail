# MedRail — Corrections to this documentation set

**Purpose:** Authoritative record of claims that were asserted during the 2026-08-21 engineering
review and later found to be wrong. This page supersedes any contradicting statement elsewhere in
`docs/`.

**Status of this document:** Authoritative.

> **Update 2026-08-21 (later).** C-2's *behaviour* has since been fixed in code: the denial path
> now returns `charged: false` with a pointer to the free pre-flight check, and the misleading
> `paidButDenied` field is gone. `API.md` and `SECURITY.md` carry corrected banners. The analysis
> below stands as the record of what was wrong and why. Where a document in this set contradicts a correction
below, the correction is right and the document is stale. Affected documents carry a banner
pointing here.

**Why this page exists.** The review's own fact ledger was wrong twice. Both errors propagated into
documents written against it. Silently editing thirty files would hide that a correction happened;
this page keeps the record legible. A review that cannot correct itself in public is not a review.

---

## C-1 — No error path in this system can consume a settled payment

**Superseded claim (WRONG):** *"`/v1/records/summary` awaits `logAccess` unguarded on the success
path, so a failure returns HTTP 500 **after the payment has already settled** — the caller has paid
$0.05 and receives nothing, with no refund path."* This was tracked as **R-2 / REL-002** and was
repeated in the HLD, several ADRs, the use cases, the user journey, the SRS, and elsewhere.

**What is actually true.** `@x402/hono`'s payment middleware
(`node_modules/@x402/hono/dist/esm/index.mjs:203-232`) reaches settlement only on a successful
handler response:

```js
case "payment-verified":                    // verified — money has NOT moved yet
  try { await next(); }                     // run the route handler
  catch (error) {
    await cancellationDispatcher.cancel({ reason: "handler_threw" });
    throw error;                            // no settlement
  }
  if (c.res.status >= 400) {                // ANY 4xx or 5xx
    await cancellationDispatcher.cancel({ reason: "handler_failed" });
    return;                                 // returns BEFORE processSettlement
  }
  ... await httpServer.processSettlement(...)   // reachable only when status < 400
```

`processSettlement` is the call that moves money, and it is structurally unreachable on a 4xx or
5xx. **Verification and settlement are distinct phases, and every error path in MedRail lands in
the phase before money moves.**

**Consequences:**
- A 500 from a failed `logAccess` on the success path does **not** charge the caller.
- A paid-but-malformed request returning 400 does **not** charge the caller.
- The 403 consent denial does **not** charge the caller either — see C-2.

This is a real and non-obvious strength of the x402 v2 design that MedRail inherits for free, and
it should be credited as such rather than treated as a gap.

**What survives from R-2.** A genuine but smaller issue: the asymmetric error handling in
`api/src/routes/records.ts` (denied path wraps `logAccess` in `.catch(() => undefined)` at `:37`;
success path awaits it unguarded at `:49`) means a transient chain failure turns a legitimate,
authorised, payable request into a 500 — so the sale is **lost**, not mis-billed. Guarding it and
degrading to `200` with `auditStatus: "pending"` remains the right fix. The severity is
availability and revenue-forgone, not caller-harm.

---

## C-2 — Consent-denied calls are NOT charged, contrary to three documents and one response field

**Superseded claim (WRONG):** *"`/v1/records/summary` charges the x402 fee whether or not the
consent check succeeds. The fee covers a real on-chain lookup either way."*

This appears in [`API.md`](API.md), in [`SECURITY.md`](SECURITY.md) under the heading *"consent-denied
calls are still charged"*, in the response field `paidButDenied: true`
(`api/src/routes/records.ts:43`), and consequently throughout `01_Product/` and `03_Architecture/`.

**What is actually true.** The denial returns HTTP **403**. Per C-1, any status ≥ 400 cancels
settlement. **The caller pays nothing.**

**And the economics run the other way.** Before returning 403, the handler submits a real
`logAccess` transaction (`records.ts:37`) recording the denied attempt — an Algorand transaction
whose fee is paid by **MedRail's own operator account**. So a consent-denied call is:

| | Documented | Actual |
|---|---|---|
| Caller pays | $0.05 | **nothing** |
| MedRail pays | nothing | **one Algorand transaction fee** |
| Net | MedRail earns $0.05 | **MedRail pays to say no** |

Any stranger can invoke this repeatedly at zero cost to themselves and non-zero cost to MedRail.
Combined with the absence of rate limiting (**SEC-013**), that is a fee-drain vector against the
operator account — and if the operator account empties, `log_access` stops working for *everyone*.

**The fix is a product decision, not a bug fix.** Either:
- **Charge for denials as documented** — return `200` with `{granted: false, ...}` instead of `403`.
  Settlement then proceeds and the documented rationale becomes true. This changes the API contract.
- **Keep `403`** — then correct `API.md` and `SECURITY.md`, remove the misleading `paidButDenied`
  field, and treat the denied-path audit write as a cost to be rate-limited.

Tracked as **G-03** in [`ENGINEERING_GAP_REPORT.md`](ENGINEERING_GAP_REPORT.md), with the full
reasoning in that document's §9.

---

## C-3 — The audit-sequence race causes a rejected transaction, not a corrupted log

**Superseded claim (WRONG):** *"`log_access` predicts its own sequence number, so concurrent
writers could corrupt or misorder the audit log; the fix is to move sequence assignment on-chain."*

**What is actually true.** The contract **already** self-assigns the sequence
(`contracts/smart_contracts/consent/contract.py`, `log_access`): it reads its own `audit_seq` box,
computes `next_seq`, and writes both boxes itself. Nothing trusts a caller-supplied sequence.

The client-side `predictedSeq` (`api/src/services/algorand.ts:160-172`) exists only to populate the
AVM **box-reference array** — Algorand requires every box a transaction touches to be declared in
advance. A losing racer declares a box name that does not match what the contract writes, and the
AVM **rejects the transaction**.

**Consequences:**
- The threat is **availability / denial of service**, not **tampering**. Audit-log integrity is
  *stronger* than the original framing implied.
- The correct fix is box-reference resilience (retry with a refreshed `getAuditCount`, or declare a
  window of candidate box names), **not** a contract change.
- Combined with C-1, a rejected write on the success path costs MedRail the sale, not the caller
  their money.

Tracked as **G-11**, with the reasoning in [`ENGINEERING_GAP_REPORT.md`](ENGINEERING_GAP_REPORT.md) §7.

---

## Where the stale framing may still appear

These documents were written against the superseded ledger and may still contain the old wording.
Their *other* content is unaffected; only claims touching payment loss, denial billing, or
audit-log corruption should be read through this page:

`00_EXECUTIVE_SUMMARY.md` · `01_Product/Competitive_Analysis.md` · `01_Product/Use_Cases.md` ·
`01_Product/User_Journey.md` · `01_Product/User_Personas.md` · `01_Product/USP_Novelty.md` ·
`02_Requirements/SRS.md` · `03_Architecture/HLD.md` · `03_Architecture/LLD.md` ·
`03_Architecture/Sequence_Diagrams.md` · `03_Architecture/Data_Flow_Diagrams.md` ·
`03_Architecture/Activity_Diagrams.md` · `03_Architecture/ADRs/ADR-005…` · `ADR-008…` · `ADR-009…` ·
`04_Data/*` · `05_API/API_Documentation.md` · `06_Security/*` · `07_Testing/*` · `08_Deployment/*` ·
`10_Operations/*` · `11_Hackathon/*`

Requirement **REL-002** ("a settled payment shall never be consumed without delivering the resource
or recording a recoverable failure") should now be read as **satisfied by the SDK**, not as
**NOT IMPLEMENTED**. The requirement that replaces it in practice is the inverse: *a legitimate,
payable request should not be turned into a 500 by a transient chain failure.*

---

## Method note

Both C-1 and C-2 were found by reading the installed SDK rather than the project's own
documentation — which is the reason to read installed dependencies at all. C-3 was found by
re-reading the contract source after an inconsistency was raised while cross-checking ADR-009.

None of the three was discoverable from the project's documentation, and two of them contradict it.
That is worth stating plainly: **`docs/API.md` and `docs/SECURITY.md` describe billing behaviour
that the code does not implement**, and no test covers the route in question (`FR-010`, `FR-011`,
`FR-012` — all **UNVALIDATED**). A test asserting "a denied request is billed" would have failed on
day one and surfaced this immediately.
