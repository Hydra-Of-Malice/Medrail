# ADR-009: An in-process per-patient lock for audit-log sequencing

**Status:** Accepted
**Date:** Not recorded as a decision date. `api/src/services/algorand.ts` first appears in commit `d2a5f7f`, 2026-08-07.
**Deciders:** Not recorded in repository
**Evidence:** `api/src/services/algorand.ts:123-138` (the lock and its recorded comment); `algorand.ts:146-179` (`logAccess`, read-then-write); `algorand.ts:169-172` (box references); `contracts/smart_contracts/consent/contract.py:217-236`; `docs/SECURITY.md:49-60`; `api/fly.toml:14-19`

## Context

`log_access` writes an audit entry at a per-patient sequence number. The contract assigns that number itself (`contract.py:224-226`):

```python
seq, existed = self.audit_seq.maybe(patient)
next_seq = UInt64(1) if not existed else seq + 1
self.audit_seq[patient] = next_seq
self.audit_log[audit_key(patient, next_seq)] = AuditEntry(...)
```

But the AVM requires every box a program touches to be declared in the transaction's box-reference array *before* execution. The backend therefore has to **predict** the sequence number in order to name the right box (`api/src/services/algorand.ts:158-172`):

```ts
const currentCount = await getAuditCount(patient);   // simulated read
const predictedSeq = currentCount + 1n;
// ...
boxes: [
  { appIndex: 0, name: auditSeqBoxName(patient) },
  { appIndex: 0, name: auditLogBoxName(patient, predictedSeq) },
],
```

That is a read-then-write across a network round-trip. Two concurrent calls for the same patient read the same count and predict the same box.

## Problem

How should concurrent `log_access` calls for the same patient be prevented from colliding on the same predicted box key?

## Options considered

| Option | Pros | Cons | Why rejected |
|---|---|---|---|
| **In-process per-patient promise chain** (chosen) | Zero infrastructure. ~10 lines (`algorand.ts:129-138`). Correct for a single process, which is the deployment shape the project actually tested. Per-patient granularity, so unrelated patients still write concurrently. | Protects one process only. Any second instance sharing the operator account reintroduces the race. Unbounded `Map` growth. No test covers it. | — |
| **On-chain self-assignment of the sequence — i.e. remove the prediction** | **The correct fix.** Eliminates the race at its source rather than serialising around it. Correct under any number of writers, in any process, in any region, with no coordination. | Requires the box reference problem to be solved on-chain — e.g. a fixed-size or content-addressed audit key that does not depend on a counter the caller must guess, or an explicit `seq` argument the contract validates and rejects on mismatch (turning a silent race into a clean retryable error). Needs a contract change and a redeploy: new App ID, and the existing App `768743428` and its two grant boxes are left behind. | Not rejected on merit. Deferred as disproportionate for the build (recorded, `docs/SECURITY.md:57-60`), and correctly identified there as one of the two production answers. **This is what should be done.** |
| **Distributed lock (Redis, etcd, a database advisory lock)** | Works across instances immediately, no contract change. | Adds the exact infrastructure ADR-002 exists to exclude, plus lock-expiry and fencing-token semantics. Introduces a new single point of failure in front of an already fragile write path (R-2). | Recorded rejection: "would be disproportionate engineering for a hackathon audit log" (`docs/SECURITY.md:57-58`). Also solves a symptom, not the cause. |
| **Single-writer queue in front of the operator account** | Restores the single-writer invariant that makes the in-process lock sound, while allowing the API to scale horizontally. Would also give the durable retry that R-2 needs (ADR-005). | A broker plus a worker — infrastructure, again. Adds an asynchronous hop to a path that currently returns `auditTxId` synchronously. | Deferred, and recorded as the other production answer (`docs/SECURITY.md:59-60`). It is the option that fixes two findings at once. |
| **Pin the API to exactly one machine** | Free. Makes the in-process lock genuinely sufficient. Nothing to build. | Caps availability at one instance and makes every deploy a gap in service. Contradicts `api/fly.toml`'s current settings. | Not chosen, but not considered either — and it is the cheapest way to make the current design *true* rather than merely intended. See Trade-offs. |
| **Accept the risk without a lock** | Nothing to build. | Concurrent writes for the same patient would fail — and on the success path a failed write is HTTP 500 after a settled payment (R-2). | Rejected: the lock is cheap and the failure is money-losing. |

## Decision

Serialise `log_access` calls per patient inside the process with a promise chain (`api/src/services/algorand.ts:129-138`):

```ts
const patientQueues = new Map<string, Promise<unknown>>();
function withPatientLock<T>(patient: string, fn: () => Promise<T>): Promise<T> {
  const prior = patientQueues.get(patient) ?? Promise.resolve();
  const next = prior.then(fn, fn);
  patientQueues.set(patient, next.catch(() => undefined));
  return next;
}
```

Note `prior.then(fn, fn)` — the chain proceeds on both fulfilment and rejection, so one failed write does not wedge that patient's queue permanently. That detail is correct and easy to get wrong.

## Rationale

### This limitation is recorded in the implementation

`api/src/services/algorand.ts:123-128`, verbatim:

> "`log_access` predicts its own audit-log box key from the current sequence number (read-then-write), so two concurrent calls for the same patient could race and collide on the same predicted box. A per-patient queue keeps this backend's own calls strictly ordered; it does not protect against a second, independently-run backend sharing the same operator account — noted as a known limitation in docs/SECURITY.md."

`docs/SECURITY.md:49-60` records the same, and goes further — it names both correct production fixes and states why neither was built:

> "Scoped out of this build as a known limitation rather than solved with a distributed lock, which would be disproportionate engineering for a hackathon audit log; a production version would either move the sequencing fully on-chain (have the contract self-assign the next sequence number rather than trusting the caller's prediction) or run a single-writer queue in front of the operator account."

This is a well-documented, correctly-scoped limitation. The engineering judgement in it is sound. The problem is not the decision — it is that the deployment configuration silently invalidates its precondition.

### What the repository does not record: the precise failure mode

*Analysis by review; the repository records only that concurrent calls "could race and collide on the same predicted box" (`algorand.ts:125-127`).*

The contract already self-assigns the sequence (`contract.py:224-226`), so the on-chain counter cannot be corrupted by a race. The race is in the **box reference**. If two writers both read count `n` and both declare `auditLogBoxName(patient, n+1)`:

1. The first transaction executes: the contract writes `audit_seq = n+1` and `audit_log[patient‖itob(n+1)]`. The declared reference matches. Success.
2. The second transaction executes: the contract computes `next_seq = n+2` and attempts to write `audit_log[patient‖itob(n+2)]` — a box **not** declared in its reference array. The program fails and the transaction is rejected.

So the failure mode is a **rejected transaction**, not a corrupted log — the on-chain state stays consistent. That is the good news. The bad news is what a rejected transaction does at the call site: on the success path of `api/src/routes/records.ts:49` the throw propagates to `app.onError` and the caller gets **HTTP 500 after their $0.05 has settled** (finding **R-2**, ADR-005). The sequencing race and the lost-payment finding are the same incident seen from two layers.

A secondary hazard: `getAuditCount` is a `simulate()` read against a possibly-stale round (`algorand.ts:103-121`). Even a single writer can mispredict if it reads before a prior write of its own has been committed to the round the simulation resolves against. The in-process lock makes this unlikely by construction — it only releases after `atc.execute` confirms — but it is not eliminated by the lock, only by on-chain self-assignment.

## Trade-offs

**1. The precondition is contradicted by the deployment config — finding D-7 / REL-004.**

`api/fly.toml:14-19`:

```toml
[http_service]
  internal_port = 4021
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1
```

`min_machines_running = 1` is a **floor, not a ceiling**, and `auto_start_machines = true` permits Fly to bring up additional machines. Nothing in the configuration pins the service to a single instance. So the one assumption the lock depends on — "this backend is the only writer" — is not enforced anywhere, and the very config file shipped for production quietly permits its violation. `docs/SECURITY.md` says the race is mitigated; `api/fly.toml` says it might not be. **REL-004 is PARTIALLY IMPLEMENTED.**

This is the sharpest thing in this ADR: the limitation was identified correctly, documented honestly, and then undermined by a nineteen-line config file that nobody reconciled against it.

**2. Zero test coverage.** There is no test of `withPatientLock`, no test of box-name derivation, and no test of `api/src/services/algorand.ts` at all. It is the highest-risk module in the repository and the least covered. A concurrency test here would be cheap (two overlapping `logAccess` calls against a stubbed algod) and would document the invariant.

**3. Unbounded map growth.** `patientQueues` (`algorand.ts:129`) never evicts. One entry per distinct patient address seen since process start, retained for the process lifetime, each holding a settled promise. Small per entry, unbounded in aggregate, and reachable by an unauthenticated caller supplying arbitrary 58-character addresses. Not urgent; not nothing.

**4. Serialisation is a throughput ceiling per patient.** Every audit write for one patient waits for the previous one to confirm on-chain — submit plus up to four rounds (`algorand.ts:175`). For the intended usage (a handful of accesses per patient) this is invisible. For any burst against one patient it is a queue whose service time is block time. No measurement of this exists (PERF-003 **NOT IMPLEMENTED**).

**5. The lock protects sequencing, not correctness of content.** Serialising writes does nothing about *what* is written. The `requesterAddress` written to the log is still caller-asserted (finding S-1, SEC-008 **NOT IMPLEMENTED**). A perfectly ordered log of false attributions is still a false log.

## Consequences

**Positive**
- REL-004 **PARTIALLY IMPLEMENTED** — correct for the single-process deployment that was actually tested, at essentially zero cost.
- FR-027 **VALIDATED** — per-patient sequence isolation is enforced on-chain and unit-tested (`test_consent.py::test_audit_log_sequence_increments_per_patient`); the lock protects the client-side prediction, not the on-chain invariant.
- The `prior.then(fn, fn)` construction prevents a failed write from permanently blocking that patient's queue.
- The limitation is disclosed in both source and security documentation, so it is a known risk rather than a latent one.

**Negative**
- REL-004 is not satisfied under the shipped `fly.toml` (D-7). The documented mitigation and the documented deployment configuration disagree.
- Contributes directly to REL-002 **NOT IMPLEMENTED** — a mispredicted sequence is one of the ways R-2 fires.
- No test coverage of the lock, the derivation, or the module (**test gap**, and the module is the riskiest in the repo).
- Never exercised on a real network: `total_audit_entries == 5`, zero `s`/`a`-prefixed boxes (**E-1**). The race has never had the opportunity to occur.

**Neutral**
- Per-patient rather than global granularity is the right choice: unrelated patients are genuinely independent, and a global lock would have serialised the whole service behind block time.

## Conditions for future reconsideration

- **Immediately, at zero cost:** either pin the deployment to one machine, or stop claiming the race is mitigated. `api/fly.toml` and `docs/SECURITY.md:49-60` must agree. This is a config edit or a documentation edit, and today neither has been made.
- **Before horizontal scaling of any kind**, adopt one of the two recorded production fixes. Prefer **on-chain self-assignment**: it removes the invariant instead of defending it, and it does not add infrastructure. The mechanism is to stop making the box key depend on a number the caller must guess — either accept `seq` as an argument the contract validates and rejects on mismatch (turning the race into a clean, retryable error rather than an opaque failure), or key the audit box by something the caller already knows.
- **If a durable retry is added for R-2** (ADR-005), the single-writer queue option fixes both findings at once and becomes the better trade.
- **Add a concurrency test** for `withPatientLock` and a cross-implementation test for the box-name derivations (NFR-011) — neither depends on any of the above and both should happen regardless.
- **Bound `patientQueues`** (LRU or delete-on-settle) if the service is ever exposed to sustained unauthenticated traffic.
