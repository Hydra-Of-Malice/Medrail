# MedRail — Architecture Decision Records

Twelve records covering the decisions that shape this system: what state exists and where it lives, how payment is verified, who may write the audit log, what backs the clinical endpoints, and how the whole thing is packaged and observed. Each record names what the decision costs, not only what it buys.

## Index

| ADR | Title | Status | Rationale recorded? | Requirements affected |
|---|---|---|---|---|
| [001](ADR-001-backend-framework.md) | Hono + TypeScript on Node 20 as the x402 resource server | Accepted (rationale reconstructed) | **No** — reconstructed. Only the SDK-verification table (`docs/IMPLEMENTATION_PLAN.md:29-32`) and a pricing-locality comment (`api/src/app.ts:35-36`) are recorded. | FR-001, FR-002, NFR-005, NFR-006, NFR-011, SEC-011, SEC-013, OPS-002, OPS-003 |
| [002](ADR-002-no-database-ledger-as-system-of-record.md) | No database — Algorand box storage is the only system of record | Accepted (rationale reconstructed) | **Partly** — the intent is recorded (`contract.py:6-9`, `docs/SECURITY.md:16-25`); the comparison against a database and the entire cost side are reconstructed. | NFR-001, DATA-001, DATA-002, DATA-003, DATA-006, SEC-004, SEC-009, REL-002, REL-003, REL-006, PERF-002, PERF-003, PERF-004, OPS-007, FR-032 |
| [003](ADR-003-box-storage-over-local-state.md) | Box storage rather than local state for consent grants | Accepted | **Yes** — `contract.py:12-17` and `docs/ARCHITECTURE.md:83-86`, independently and consistently. | FR-018…FR-023, FR-030, FR-032, DATA-001, DATA-003, NFR-011, REL-004, REL-006 |
| [004](ADR-004-x402-v2-exact-scheme-with-external-facilitator.md) | x402 v2 `exact` scheme with an external facilitator (GoPlausible) | Accepted | **Yes** — facilitator choice, single-network registration, the omitted `asset` field and the trust model are all recorded (`docs/ARCHITECTURE.md:115-118`, `api/src/x402.ts:9-10, 17-19`, `docs/SECURITY.md:84-87`). Consequences R-1 / S-1 are reviewer findings. | FR-001, FR-002, FR-003, FR-039, NFR-002, NFR-012, SEC-006, SEC-007, REL-001, REL-005, PERF-001, OPS-006 |
| [005](ADR-005-audit-write-as-follow-up-transaction.md) | The audit write is a follow-up transaction, not part of the payment's atomic group | Accepted | **Yes** — the fullest recorded rationale in the repo: `docs/IMPLEMENTATION_PLAN.md:45-52`, `docs/ARCHITECTURE.md:95-108`, `contract.py:18-23`, `api/src/services/algorand.ts:141-144`. The trade-off is stated in the source documents. | FR-003, FR-012, FR-025, SEC-001, SEC-008, REL-002, PERF-004 |
| [006](ADR-006-admin-only-audit-log.md) | `log_access` is admin-only | Accepted | **Yes** — `contract.py:18-23`; the centralisation cost is recorded too (`docs/SECURITY.md:40-47`). | SEC-001, SEC-002, SEC-008, SEC-012, FR-025, FR-026, FR-027, FR-029, FR-031, DATA-002 |
| [007](ADR-007-deterministic-rule-engines-instead-of-an-ml-model.md) | Deterministic rule engines instead of an ML model | Accepted | **Yes** — recorded three times, as a harm argument: `docs/IMPLEMENTATION_PLAN.md:65`, `api/src/services/triageScorer.ts:1-7, 29-31`, `docs/SECURITY.md:69-76`. | FR-004…FR-009, NFR-009, AI-001…AI-008, DATA-005 |
| [008](ADR-008-open-plus-gated-endpoint-split.md) | Two endpoint categories — open x402-gated compute plus one consent-gated data endpoint | Accepted | **Yes** — and recorded in unusually candid terms: `docs/ARCHITECTURE.md:32-36`, `docs/IMPLEMENTATION_PLAN.md:9`. | FR-001…FR-012, FR-039, SEC-006, SEC-007, PERF-002, PERF-003, PERF-004, DATA-003 |
| [009](ADR-009-in-process-per-patient-lock-for-audit-sequencing.md) | An in-process per-patient lock for audit-log sequencing | Accepted | **Yes** — recorded as a known limitation, with both correct production fixes named: `api/src/services/algorand.ts:123-128`, `docs/SECURITY.md:49-60`. | REL-002, REL-004, FR-025, FR-027, NFR-011, SEC-008 |
| [010](ADR-010-client-side-key-custody-and-the-demo-wallet.md) | Client-side key custody, and the browser-generated demo wallet | Accepted | **Yes** — `docs/SECURITY.md:28-38`, `docs/ARCHITECTURE.md:133-138`, `web/lib/consent.ts:43`. The signer-abstraction asymmetry is review analysis. | NFR-008, SEC-003, SEC-005, FR-033, FR-034, FR-035, FR-036, FR-037 |
| [011](ADR-011-deployment-target-docker-and-fly-io.md) | Deployment target — a root-context Docker image on Fly.io | Accepted (rationale reconstructed) | **Partly** — the root build context is recorded (`api/Dockerfile:1-3`) and the prepare-don't-execute boundary is recorded (`docs/IMPLEMENTATION_PLAN.md:75`); the platform choice is not. | NFR-004, NFR-007, FR-015, SEC-015, SEC-016, OPS-001, OPS-006 |
| [012](ADR-012-observability-strategy.md) | Observability strategy | **Proposed (RECOMMENDED, not implemented)** | **No** — nothing in the repository discusses observability. | OPS-001…OPS-006, OPS-008, SEC-010, SEC-011, SEC-014, REL-002, REL-006 |

**Eight** of the twelve ADRs document a rationale that is genuinely recorded in the repository. Three are reconstructed in whole or in part. One proposes work that does not exist.

## The recorded-vs-reconstructed convention

An ADR written after the fact is only useful if it distinguishes what the authors actually decided from what a reviewer infers they must have decided. This set keeps those apart explicitly. Where the repository records a rationale — in a module docstring, an in-code comment, or a design document — it is quoted verbatim with a `file:line` citation and presented as the decision rationale. Where it does not, the ADR carries this exact line before any reasoning:

> **Decision rationale not documented in implementation; the reasoning below is reconstructed by review and should not be treated as historical fact.**

...and the reconstruction follows in a clearly separated subsection. Where a decision is partly recorded, the two are split within the Rationale section and the status is conservatively marked *"(rationale reconstructed)"* — under-claiming recorded provenance rather than over-claiming it. Consequences, trade-offs and defects are review findings throughout, including in the ADRs whose rationale is recorded; a recorded rationale explains why a choice was made, not what it later cost.

## Conventions used throughout

- **Status labels** (**IMPLEMENTED**, **VALIDATED**, **UNVALIDATED**, **PARTIALLY IMPLEMENTED**, **NOT IMPLEMENTED**, **PLANNED**, **RECOMMENDED**) follow the project-wide vocabulary.
- **Requirement IDs** (`FR-`, `NFR-`, `SEC-`, `PERF-`, `REL-`, `OPS-`, `AI-`, `DATA-`) are the canonical registry IDs. **No ADR in this set allocates a new requirement ID.**
- **Finding IDs** referenced here are from the technical review: `S-1` (consent gate is not an access control), `R-1` (facilitator outage ⇒ HTTP 500 on all priced routes), `R-2` (a settled payment can be lost), `R-3` (malformed address ⇒ 500 with an internal message), `R-4` (no timeout or retry on chain I/O), `C-1` / `C-2` (contract defects), `D-1`…`D-7` (deployment defects), `CI-1`…`CI-4` (pipeline defects), `DOC-1`…`DOC-9` (doc-vs-reality gaps), `E-1` (evidence gap: `log_access` has never executed on TestNet).
- **Dates** are recorded as "Not recorded" wherever no document or commit dates the decision. Every deciding artifact in this repository first appears in commit `d2a5f7f` (2026-08-07); that is a commit date, not a decision date, and is labelled as such.
- **Deciders** are "Not recorded in repository" in every ADR. No authorship attribution exists for any decision here.

## Cross-cutting threads

Several findings appear in more than one ADR because they are consequences of more than one decision. The shortest path through them:

- **S-1 — the consent gate is not an access control.** Introduced in ADR-004 (the payment proves *a* payment, not *whose*), consumed in ADR-006 (a false attribution is written to the permanent log), and assessed in ADR-008 (it is the reason the gated endpoint does not yet demonstrate the thesis the endpoint split exists to demonstrate).
- **R-2 — a settled payment can be lost.** ADR-002 excluded the durable queue that would prevent it; ADR-005 is the design whose success path is unguarded; ADR-009 supplies one of the ways it fires; ADR-012 is why nobody would notice.
- **E-1 — `log_access` has never executed on TestNet.** `total_audit_entries == 5` on application `768743428`. This makes the mechanism described in ADR-005, ADR-006 and ADR-009 architecturally sound and, on real infrastructure, unproven. It is the cheapest evidence gap in the project to close.
