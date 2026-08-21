# ADR-003: Box storage rather than local state for consent grants

**Status:** Accepted
**Date:** Not recorded as a decision date. `contracts/smart_contracts/consent/contract.py` first appears in commit `d2a5f7f`, 2026-08-07.
**Deciders:** Not recorded in repository
**Evidence:** `contracts/smart_contracts/consent/contract.py:11-17` (module docstring, "Design notes that matter for reviewers"); `contract.py:114-116`; `contract.py:95-103` (key derivation subroutines); `contract.py:129-138` (`fund_mbr`); `docs/ARCHITECTURE.md:83-86`; `api/src/services/algorand.ts:63-79`; `web/lib/consent.ts:26-34`

## Context

Algorand offers three places to put application state: **global state** (limited, shared, cheap), **local state** (per-account, requires that account to have opted in to the application), and **box storage** (arbitrary key-value, owned and paid for by the application account, no opt-in by anyone).

MedRail's consent state is inherently a relation between two accounts and a string: `(patient, requester, scope) → GrantRecord`. Neither account is naturally "the owner" of that row, and the requester in the intended use case is a stranger — "a stranger's read-only AI agent calling a pay-per-call endpoint."

## Problem

Where does a `(patient, requester, scope)` grant live, given that the requester may be an arbitrary agent that has never interacted with the MedRail application before and may never do so again?

## Options considered

| Option | Pros | Cons | Why rejected |
|---|---|---|---|
| **Box storage keyed by `sha256(patient ‖ requester ‖ scope)`** (chosen) | No opt-in required from either party. Arbitrary number of grants per patient and per requester. Fixed 32-byte key regardless of scope length. App account pays and owns the storage, so no caller ever needs an ALGO balance for MedRail's own state. | Application account carries the MBR and must be topped up forever (`fund_mbr`). Keys are opaque — you cannot enumerate a patient's grants without knowing every `(requester, scope)` pair. Box references must be declared per transaction, which is the root of the sequencing race in ADR-009. | — |
| **Local state on the requester's account** | Cheapest per-record; the requester's own account carries the MBR. Naturally scoped to "grants this requester holds." | **Requires the requester to opt in to the application before any grant can exist.** For a pay-per-call endpoint whose entire premise is "any agent, anywhere, can call this," that is a blocking, ALGO-costing, transaction-signing prerequisite imposed on a party that may only ever make one call. Also caps the number of grants at the local-state schema limit. | Recorded rejection — see Rationale. It inverts the cost onto the party the product is trying to make frictionless. |
| **Local state on the patient's account** | Patient is the natural owner; patient already signs `grant_access`. | Same opt-in requirement, now on the patient. Local-state schema is fixed at creation, so the number of grants a patient may hold would be capped by a number chosen at deploy time. Storing a variable-length `scope` in local state is awkward. | Hard cap on grants per patient, fixed forever at deploy, is a design dead end. |
| **Global state only** | Cheapest, simplest. | Global state is a handful of key-value slots. It cannot hold a per-relation record set. | Physically insufficient. |
| **Off-chain store with an on-chain hash anchor** | Cheap, queryable, no MBR growth. | The grant would then be authoritative off-chain — which is exactly the trust model ADR-002 rejects. | Defeats the product thesis; also contradicts ADR-002. |

## Decision

Store grants in `BoxMap(Bytes, GrantRecord, key_prefix="g")` (`contract.py:114`), keyed by `sha256(patient.bytes ‖ requester.bytes ‖ scope.bytes)` (`contract.py:95-98`). Use the same mechanism for the audit log: `BoxMap(Account, UInt64, key_prefix="s")` for the per-patient sequence and `BoxMap(Bytes, AuditEntry, key_prefix="a")` keyed by `patient.bytes ‖ itob(seq)` (`contract.py:101-103, 115-116`). The application account funds all box MBR itself, topped up through `fund_mbr` (`contract.py:129-138`).

## Rationale

### This rationale is recorded in the implementation

`contracts/smart_contracts/consent/contract.py:12-17`, verbatim:

> "Box storage, not local state: local state would require every requester to opt in to this app, which makes no sense for a stranger's read-only AI agent calling a pay-per-call endpoint. Boxes let any (patient, requester, scope) triple exist without either side opting in to anything except the box's own MBR cost, which the app account itself funds (see `fund_mbr`)."

`docs/ARCHITECTURE.md:83-86` records the same reasoning independently, in the same terms.

The funding decision has its own recorded rationale at `contract.py:131-137`:

> "Boxes are owned by the app account, not by callers, so the app must carry enough balance to create them; this keeps every other method's signature simple."

That second sentence is the load-bearing part: because the app self-funds, `grant_access` takes no accompanying payment transaction and can be a plain single-transaction app call — which is what lets `web/lib/consent.ts:55-64` construct a patient's grant with an ordinary `AtomicTransactionComposer` call and nothing else.

No reconstruction is needed for this ADR. The rationale is recorded, consistent across two independent documents, and matches the code.

### Key-derivation scheme

| BoxMap | Prefix | Key | Effective key length | Value |
|---|---|---|---|---|
| `grants` | `g` (0x67) | `sha256(patient ‖ requester ‖ scope)` | 33 B (1 + 32) | `GrantRecord{uint8, uint64, uint64}` = 17 B |
| `audit_seq` | `s` (0x73) | patient public key | 33 B (1 + 32) | `UInt64` = 8 B |
| `audit_log` | `a` (0x61) | `patient ‖ itob(seq)` | 41 B (1 + 32 + 8) | `AuditEntry` — variable length |

Three properties of this scheme are worth naming:

1. **Hashing gives a fixed-length key from a variable-length input.** `scope` is a free-form string (DATA-003), so the raw concatenation is unbounded; `sha256` bounds it at 32 bytes and therefore bounds the MBR at a compile-time constant. This is why `get_grant_box_mbr()` can exist at all.
2. **Hashing also makes the key opaque.** You cannot read a patient's or requester's address out of a grant box name. This is a small privacy benefit and a large usability cost: there is no way to list a patient's grants (see Trade-offs).
3. **The audit key is deliberately *not* hashed** (`contract.py:101-103`) — it is `patient ‖ itob(seq)`, which is enumerable, so `get_audit_count` + `get_audit_entry(patient, seq)` can walk a patient's history. The two key schemes make opposite trade-offs on purpose, and the contract is right to do so.

### MBR funding by the app account

`fund_mbr` (`contract.py:129-138`) is callable by **anyone** and asserts only that the payment's receiver is the application address. That is deliberate: it means a third party — a hosting provider, a sponsor, a patient advocacy org — can keep the registry solvent without holding the admin key. It is also unauthenticated in the other direction: there is no way to get funds back out except `withdraw_excess`, which is admin-only (`contract.py:254-259`), so a donor cannot reclaim an overpayment. Neither is a defect; both are consequences worth stating.

## Trade-offs

- **The application account is now a perpetual liability.** Every grant that has ever been created — including revoked ones, because `revoke_access` sets `status = STATUS_REVOKED` and rewrites the box rather than deleting it (`contract.py:186-190`) — holds 22,500 µALGO forever. The two grant boxes on the live deployment are both revoked (`total_grants_active = 0`, `total_revocations = 2`) and both still cost MBR. There is no reclamation path short of a contract method that deletes boxes, which the design does not have and arguably should not have.
- **The advertised MBR is wrong.** `contract.py:52` computes `2_500 + 400 * (32 + 17) = 22,100`, omitting the 1-byte `key_prefix` from the key length. Verified on-chain the true figure is **22,500** (app account min-balance 145,000 with 2 boxes = 100,000 base + 2 × 22,500). Defect **C-2**: `get_grant_box_mbr()` under-reports by 400 µALGO per box; a backend sizing `fund_mbr` from it under-funds by ~1.8%. Fix is `400 * (33 + 17)` at `contract.py:52`. FR-032 is **IMPLEMENTED (incorrect value)**.
- **The audit-box MBR is unknown, not merely unstated.** Declining to hard-code it (`contract.py:53-55`) is correct, because `AuditEntry` carries three ARC-4 dynamic strings. But no audit box has ever been created on TestNet (`total_audit_entries == 5`, evidence gap **E-1**), so the real cost has never been observed. Anyone planning capacity for this system is planning against an unmeasured number.
- **No enumeration.** Because grant keys are hashed, `check_access` and `get_grant` require the caller to already know all three key components (`contract.py:198, 212`). A patient cannot ask the contract "who can see my records?" — the answer must be reconstructed off-chain from transaction history or ARC-28 events, and the event feed is currently defective (C-1, `contract.py:146`).
- **The key derivation is now implemented three times, and nothing checks that they agree.** Python (`contract.py:95-98`), Node (`api/src/services/algorand.ts:63-69`, `createHash("sha256")`), browser (`web/lib/consent.ts:26-34`, `crypto.subtle.digest`). A change to the prefix, the concatenation order or the hash input silently breaks the other two, and the failure mode is not a type error — it is a grant that appears not to exist. NFR-011 is **UNVALIDATED**: there is no cross-implementation test anywhere in the repo. This is the highest-value missing test in the project after `routes/records.ts`.
- **Box references must be declared per transaction, which creates the sequencing race.** Every call must name the boxes it will touch (`api/src/services/algorand.ts:95, 116, 169-172`). For grants this is harmless because the key is fully determined by the arguments. For the audit log it is not, because the sequence number is only known at execution time — see ADR-009.

## Consequences

**Positive**
- FR-018, FR-019, FR-020, FR-021, FR-022, FR-023 all **VALIDATED**, three of them against real TestNet transactions.
- DATA-001 **VALIDATED** — collision-resistant digest keying.
- DATA-003 **IMPLEMENTED** — scope is a free-form string, so adding `/v1/health-score` or any other scoped endpoint needs no contract change and no redeploy.
- FR-030 **IMPLEMENTED** — anyone may top up the app account's MBR reserve. (Untested: no test covers `fund_mbr`.)
- No caller — patient or requester — ever needs to opt in to the application. A requester with only USDC and no prior relationship can be granted access.

**Negative**
- FR-032 **IMPLEMENTED (incorrect value)** — defect C-2.
- NFR-011 **UNVALIDATED** — triple-implemented key derivation with no cross-check.
- REL-004 **PARTIALLY IMPLEMENTED** — box references plus a predicted sequence number is the mechanism behind the audit race (ADR-009).
- REL-006 **PARTIALLY IMPLEMENTED** — MBR grows monotonically; nothing monitors it.

**Neutral**
- The opposite key schemes (hashed for grants, plain for audit) are a deliberate asymmetry, not an inconsistency.
- Revoked grants retain their box and their MBR. This is what makes re-granting cheap and makes the `was_active_before` counter logic (`contract.py:157-167`) necessary and correct.

## Conditions for future reconsideration

- Fix defect C-2 (`contract.py:52` → `400 * (33 + 17)`) before anyone sizes a `fund_mbr` call from `get_grant_box_mbr()`.
- Add a cross-implementation test asserting that the Python, Node and browser derivations produce byte-identical box names for the same inputs (closes NFR-011). This is cheap and should not wait for a reconsideration trigger.
- If patients need to see "who can access my data," the enumeration gap becomes a product requirement, and either an off-chain index (built on a *fixed* C-1 event feed) or an additional non-hashed index BoxMap is needed.
- If MBR growth becomes the binding cost, revisit whether revoked grants should be deletable — noting that deletability weakens the auditability claim and must be weighed against it, not assumed to be an improvement.
