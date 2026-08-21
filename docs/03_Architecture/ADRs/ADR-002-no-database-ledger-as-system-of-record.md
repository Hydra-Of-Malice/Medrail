# ADR-002: No database — Algorand box storage is the only system of record

**Status:** Accepted (rationale reconstructed)
**Date:** Not recorded as a decision date. The deciding artifacts (`contracts/smart_contracts/consent/contract.py`, `api/src/services/algorand.ts`) first appear in commit `d2a5f7f`, 2026-08-07.
**Deciders:** Not recorded in repository
**Evidence:** `contracts/smart_contracts/consent/contract.py:1-24` (module docstring); `contract.py:114-116` (the three BoxMaps); `api/src/services/algorand.ts:82-121` (all reads are `simulate()` against algod); `api/package.json:13-24` (no database, ORM, cache or queue dependency); `docs/SECURITY.md:16-25`; VERIFIED_FACTS §1, §3, §7

## Context

MedRail has exactly four kinds of state:

| State | Where it lives | Durable? |
|---|---|---|
| Consent grants — `(patient, requester, scope) → {status, granted_at, expires_at}` | Algorand box storage, `grants` BoxMap (`contract.py:114`) | yes, on-chain |
| Per-patient audit log + sequence counter | Algorand box storage, `audit_seq` / `audit_log` BoxMaps (`contract.py:115-116`) | yes, on-chain |
| Aggregate counters (`total_requests`, `total_grants_active`, `total_revocations`, `total_audit_entries`) | Algorand global state (`contract.py:109-112`) | yes, on-chain |
| Clinical rules — 11 red-flag keyword groups, 14 interaction pairs | Static TypeScript constant (`api/src/services/triageScorer.ts:32-44`) and a JSON file read once at module load (`api/src/services/interactionChecker.ts:18`) | yes, in the source tree |

There is **no fifth kind**. `api/package.json:13-24` declares no database driver, no ORM, no migration tool, no Redis client, no queue, no cache. `api/src/routes/records.ts:15-21` returns one fixed `SYNTHETIC_RECORD` constant regardless of `patientId` — there is no patient datastore to query in the first place (DATA-004).

## Problem

A conventional implementation of this product would put Postgres behind the API: a `grants` table, an `access_log` table, a `patients` table, plus Redis for the read-heavy consent check and a queue for the audit write. Should MedRail do that, or should the ledger *be* the database?

## Options considered

| Option | Pros | Cons | Why rejected |
|---|---|---|---|
| **Ledger-only: Algorand boxes are the system of record** (chosen) | One source of truth, no reconciliation problem. Consent state is independently verifiable by anyone with an indexer — the patient-ownership claim is checkable without trusting MedRail. Audit entries are append-only by construction (DATA-002) and admin-gated on-chain (SEC-001). Zero infrastructure to run, back up, patch or pay for. Deployment is one stateless container. | Every read is a network round-trip (~505 ms cold measured once for `/v1/consent/status`). Every write costs a transaction and locks minimum balance. No joins, no aggregates, no `WHERE granted_at > …`. All state is public. No transactional coupling between payment and write (see ADR-005). | — |
| **Postgres as system of record, chain as an optional anchor** | Rich queries, aggregate reporting, sub-millisecond reads, ACID with the payment record, easy migrations. | Reintroduces exactly the trust problem the product exists to solve: "the patient owns their consent" becomes "MedRail's database says so." Requires a reconciliation story between DB and chain, which is the classic dual-write bug. Adds an operational component (backup, failover, credentials) to a submission with no operations team (OPS-005…OPS-008 all **NOT IMPLEMENTED**). | Defeats the product thesis. If the authoritative answer is in Postgres, the contract is decoration. |
| **Postgres as a read cache in front of the chain** | Fast reads, aggregates and reporting; chain stays authoritative. | Needs an indexer/subscriber to stay current; the ARC-28 event feed it would consume is **defective today** (defect C-1 inverts `patient`/`requester` in `AccessRequested` — `contract.py:146`). Cache invalidation on revoke is a correctness-critical path. Roughly doubles the moving parts. | Real value, but it is an *optimisation* of the chosen design, not an alternative to it. Deferred rather than rejected on merit — see reconsideration conditions. |
| **Redis for consent-check caching only** | Would remove the two algod round-trips per `/v1/consent/status` and mitigate SEC-013 amplification. | A cached grant is a stale grant. Revocation is the security-critical transition; caching it is caching the wrong thing. | Caching an authorisation decision with no invalidation channel is worse than the latency it saves. |
| **Durable queue + worker for the audit write** | Would make REL-002 satisfiable — a settled payment could never be lost (finding R-2). | Adds a broker plus a worker process; both need to be run, monitored and backed up. | Rejected implicitly by the no-infrastructure posture. **This is the single most defensible thing the exclusion cost** — see ADR-005 and ADR-009. |

## Decision

The Algorand ledger is the only durable store. The API process is stateless (NFR-001): it holds no session, no user account, no persistent request state, and no local cache of chain state. All consent reads go to algod via `AtomicTransactionComposer.simulate()`; the single write path is `log_access`.

## Rationale

### What is recorded

The contract's module docstring states the intent directly (`contract.py:6-9`):

> "One contract, one on-chain source of truth for 'who touched this patient's data and were they allowed to.'"

`docs/SECURITY.md:16-25` records the corresponding data-minimisation position — only an address, a hashed key, a status byte, two timestamps and constant strings go on-chain — and records that a production version would keep real payloads client-side-encrypted in content-addressed off-chain storage with only a pointer on-chain (DATA-006, **PLANNED**).

That is the whole of the recorded rationale. It records *that* the ledger is the source of truth and *what* may be written to it. It does not record a comparison against a database, and it does not record the cost side.

### Reconstructed rationale

> **Decision rationale not documented in implementation; the reasoning below is reconstructed by review and should not be treated as historical fact.**

1. **A database would falsify the product claim.** The claim under test is "the patient controls access, and the record of access is not MedRail's to edit." A row in MedRail's Postgres satisfies neither half. Box storage satisfies both: the grant is written by a transaction the *patient* signed (SEC-003, `contract.py:151`), and the audit entry can only be appended, never mutated or deleted, by any method on the contract (DATA-002).
2. **The verification surface is the point.** The reviewer independently confirmed the live global state — `total_requests=2`, `total_grants_active=0`, `total_revocations=2`, `total_audit_entries=0` — against the public indexer, without asking MedRail anything. No database design offers that.
3. **Zero infrastructure was proportionate to the scope.** The whole system is a stateless container plus a compiled contract. There is nothing to back up (OPS-007), which is why OPS-007 is scoped as "not applicable" rather than as a failure.
4. **The stateless-API property came for free and is load-bearing.** NFR-001 is not an aspiration here; it is a structural consequence. Any horizontal scaling concern reduces to the operator-account sequencing problem (ADR-009), not to session affinity.

## Trade-offs

This decision is not cheap, and the costs are structural rather than incidental.

**1. Minimum-balance-requirement economics.** Boxes are not free storage; they lock ALGO in the application account for as long as they exist. The formula is recorded at `contract.py:50`: `2_500 + 400 * (len(key) + len(value))` µALGO.

- Per grant box: **22,500 µALGO**, verified on-chain (app account `CCO26Y6Z56DDZ3OELO2UKJMIPJVSIT52I23F2MPMR52JBM3HQZZNUZNOR4` reports `min-balance = 145,000` with 2 boxes; 145,000 − 100,000 base = 45,000 = 2 × 22,500).
- The contract's own advertised constant is **wrong**: `contract.py:52` computes `2_500 + 400 * (32 + 17) = 22,100`, omitting the BoxMap's 1-byte `key_prefix="g"` from the key length. `get_grant_box_mbr()` therefore under-reports by 400 µALGO per box (**defect C-2**), and a backend sizing `fund_mbr` from it under-funds by ~1.8%. FR-032 is **IMPLEMENTED (incorrect value)**.
- Per audit box: **not known**. The key is 41 effective bytes (`a` prefix + 32-byte pubkey + 8-byte sequence) and `AuditEntry` is variable-length, which the contract deliberately declines to hard-code (`contract.py:53-55`) — a correct choice. But because `log_access` has **never executed on TestNet** (`total_audit_entries == 5`, zero `s`- and `a`-prefixed boxes — evidence gap **E-1**), the real per-entry MBR cost of the audit log has never been observed. **The storage cost of the system's flagship feature is unmeasured.**
- Growth is unbounded and monotonic: the audit log is append-only, so MBR consumption rises forever and the app account must be topped up forever via `fund_mbr` (`contract.py:130-138`). There is no monitoring or alerting on the headroom (REL-006 **PARTIALLY IMPLEMENTED**, OPS-005 **NOT IMPLEMENTED**). Deletion is not a feature — it is architecturally excluded.

**2. Write latency is block latency.** A write is a transaction. `atc.execute(algod, 4)` (`api/src/services/algorand.ts:175`) waits four rounds before throwing; the fact ledger's own arithmetic treats that as ~14 s, i.e. a few seconds per round. MedRail has measured no write latency of its own — no audit write has ever been submitted to a real network. The one measured figure that exists is a **single cold observation of 505 ms** for `GET /v1/consent/status`, which is two sequential algod round-trips and no write at all. There is no p50/p95/p99 for anything (PERF-003 **NOT IMPLEMENTED**).

**3. All state is public, forever.** The mitigation is that nothing sensitive is written (SEC-004, AI-007) — no name, no diagnosis, no free-text clinical input. That mitigation is doing real work and must keep doing it: the design tolerates public state *only* because the scope/endpoint/action strings are compile-time constants (`api/src/routes/records.ts:10-11`). The moment any endpoint logs caller-supplied text, this decision becomes a privacy defect. There is also no erasure path — an append-only public log is structurally incompatible with a right-to-erasure requirement, which is a real obstacle for any future regulated deployment and is why DATA-006 (off-chain encrypted payloads, on-chain pointers) is the recorded direction.

**4. No rich queries.** Boxes are a key-value store with no index and no scan. There is no way to ask "which requesters currently hold a grant from patient X", "which grants expire this week", or "show me every access in the last 24 hours" without either (a) knowing the exact key in advance, or (b) walking the app's full box list or transaction history off-chain. `check_access` and `get_grant` both require the caller to supply all three components of the key (`contract.py:198, 212`) — you cannot enumerate by patient.

**5. No aggregate reporting.** The only aggregates that exist are the four hand-maintained global counters (`contract.py:109-112`), each incremented by hand in the method that changes it. They are cheap and correct — note the deliberate `was_active_before` logic at `contract.py:157-167` that keys the active-grant counter off prior *status* rather than prior *existence* — but they are the only aggregates that will ever exist without off-chain indexing. There is no per-patient count of anything except `audit_seq`, and no time-bucketed anything.

**6. Read amplification on the paid path.** Because there is no cache and no shared suggested-params, a single successful `/v1/records/summary` performs at least six outbound algod round-trips: `getTransactionParams()` + `simulate()` for `checkAccess` (`algorand.ts:85, 98`), then `getTransactionParams()` again (`algorand.ts:156`), then `getAuditCount`'s own `getTransactionParams()` + `simulate()` (`algorand.ts:106, 119`), then submit-and-poll in `execute` (`algorand.ts:175`). Three of those are redundant fetches of the same suggested-params. None has a timeout or a retry (`new algosdk.Algodv2("", config.algodServer, "")`, `algorand.ts:5` — REL-003 **NOT IMPLEMENTED**, finding R-4). A single AlgoNode blip is a user-visible 500 on a route the caller has already paid for.

**7. Availability of reads is outsourced.** All reads go to AlgoNode's public endpoint with no API key, no timeout, no retry and no circuit breaker. `/v1/consent/status` is free, unauthenticated, and makes two of these calls per request (SEC-013), which makes MedRail a traffic amplifier against a third party it does not pay.

**8. A surprising coupling: free reads require the operator private key.** `checkAccess` and `getAuditCount` are `readonly` and cost nothing, but `atc.simulate()` still needs a sender and a signer, so both call `getOperator()` (`algorand.ts:83-84, 104-105`), which throws if `OPERATOR_MNEMONIC` is unset (`algorand.ts:8-14`). The *free, unauthenticated* consent-status endpoint therefore has a hard dependency on a hot admin key being loaded in the process.

## Consequences

**Positive**
- NFR-001 **IMPLEMENTED** — no server-side session, account or persistent request state.
- DATA-001 **VALIDATED**, DATA-002 **IMPLEMENTED**, DATA-003 **IMPLEMENTED** — collision-resistant keying, append-only audit, free-form scope needing no contract change for a new endpoint.
- SEC-004 **IMPLEMENTED**, SEC-009 **IMPLEMENTED** — no PHI on-chain; consent reads submit nothing and cost nothing.
- OPS-007 is **NOT APPLICABLE** for stateful components — there are none. The only irreplaceable local secret is the operator mnemonic, for which no backup or rotation procedure is documented.
- Independent verifiability: the live consent lifecycle (`5XIADMCGFP5I7H7AS656RXZS7MFEEPCVJGLA7T3SVE6XDEYSGFFA`, `X2BQ5FD4MW52B75WQGDB67TEULYLN7FHVFO6ZOBNI74PNCAKVOUA`, `OV2J2T5VWMIQG64JYGL7JEGZKKNZNKCMNIQU6AC4PDRQYZ6ZOO5A`) was confirmed by a third party against the public indexer without MedRail's cooperation.

**Negative**
- REL-002 **NOT IMPLEMENTED** — with no queue and no outbox, a settled payment can be consumed with nothing delivered (finding R-2). This is the direct price of excluding the durable-queue option. See ADR-005.
- REL-003 **NOT IMPLEMENTED**, REL-004 **PARTIALLY IMPLEMENTED** — every chain call is a bare network call, and write sequencing is only in-process (ADR-009).
- PERF-002, PERF-003, PERF-004 **NOT IMPLEMENTED** — no budget, no measurement, and the audit write blocks the paid response path (`api/src/routes/records.ts:49`).
- REL-006 **PARTIALLY IMPLEMENTED** — MBR growth is unbounded, the advertised per-box cost is wrong (C-2), and nothing watches the headroom.
- FR-032 **IMPLEMENTED (incorrect value)** — defect C-2.

**Neutral**
- The rule tables are static files, not data. Changing a red-flag weight or an interaction pair is a code change and a redeploy (`triageScorer.ts:32-44`, `api/src/data/interactions.json`). For 11 rules and 14 pairs that is the right call; it stops being right at roughly the point a clinician rather than an engineer needs to edit them (see ADR-007).

## Conditions for future reconsideration

- **If read latency or SEC-013 amplification becomes a real problem**, add a read-through cache or an indexer-backed projection — but keep the chain authoritative, and fix defect C-1 (`contract.py:146`, inverted event fields) first, because a projection built on the current ARC-28 event feed would ingest inverted `patient`/`requester` data.
- **If a settled payment is ever actually lost to R-2**, the durable-outbox option is no longer disproportionate. That is the trigger to add the one piece of infrastructure this ADR excluded.
- **If aggregate reporting is required** (per-patient access history in a UI, operational dashboards, billing reconciliation), an off-chain indexer becomes necessary. This does not overturn this ADR; it layers on top of it.
- **If real PHI is ever introduced**, this ADR must be revisited alongside DATA-006: an append-only public log has no erasure path, and that is a hard constraint, not a tuning parameter.
- **If MBR growth outpaces funding**, either move older audit entries to off-chain content-addressed storage with on-chain pointers (DATA-006) or accept a bounded log — but note that a *deletable* audit log contradicts the immutability claim this whole design is built on.
