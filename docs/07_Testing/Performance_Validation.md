# MedRail — Performance Validation

**Purpose:** state the only performance data that exists, decompose each endpoint's latency from first principles, and specify the validation programme that would produce real numbers.

**Status of this document:** **NOT IMPLEMENTED** as a results document — **there is no performance testing in this repository.** No load test, no benchmark, no profiler run, no k6/autocannon/JMeter configuration, no throughput measurement, no concurrency measurement, no error-rate-under-load measurement. §2 records two single observations. §3 is structural analysis, explicitly not measurement. §4 onward is a **RECOMMENDED** plan. PERF-002, PERF-003 and PERF-004 are all **NOT IMPLEMENTED**, and **G-24 — no performance measurement of any kind — is open.**

**This is the one area of the review that has not moved.** Several findings elsewhere in this documentation set closed between editions; none of them was a performance finding, and nothing here has been measured since. Where a fix elsewhere changed the *shape* of a latency path — rate limiting on the free surface, the 503 on facilitator failure, the guarded audit write — that is noted below, but no figure follows from it.

**No benchmark figure appears anywhere in this document.** Any latency, throughput or capacity number a reader wants must come from executing §4, not from reading §3.

**Cross-references:** [`Test_Results.md`](Test_Results.md) §6 (evidence gaps), [`Test_Plan.md`](Test_Plan.md) §3.8, [`Test_Cases.md`](Test_Cases.md) §C.4, [`../02_Requirements/Requirements_Traceability_Matrix.md`](../02_Requirements/Requirements_Traceability_Matrix.md), [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md).

---

## 1. Requirement status

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| PERF-001 | The `402` challenge for a priced route shall be served without a per-request outbound network call. | **IMPLEMENTED** | The facilitator's `/supported` is fetched once at `x402ResourceServer` initialisation and cached in-process (`api/src/x402.ts:6-14`). One warm observation of ~15 ms is consistent with this, but a single sample does not verify the property — a test asserting zero outbound calls after warm-up does not exist. |
| PERF-002 | `GET /v1/consent/status` shall return within a defined latency budget under a defined workload. | **NOT IMPLEMENTED** | **No budget has been defined.** One cold observation of 505 ms exists. |
| PERF-003 | Paid endpoint latency shall be measured and published (p50/p95/p99) under a defined concurrent workload. | **NOT IMPLEMENTED** | No load test, no measurement, no tooling in the repository. |
| PERF-004 | The audit-log write shall not block the paid response path. | **NOT IMPLEMENTED** | `api/src/routes/records.ts` still `await`s `logAccess` inline before responding. The write is now wrapped in `try/catch` — a failure degrades to `200` with `auditStatus: "pending"` rather than throwing — which changes the *failure* behaviour, not the latency. The response still cannot be written until the chain confirms or the attempt gives up. See §5.1. |

---

## 2. The only measured data that exists

Two observations, recorded by the reviewer on 2026-08-21.

| # | Observation | Value |
|---|---|---|
| M-1 | `GET /v1/consent/status`, cold process | **505 ms** |
| M-2 | 402 generation on `POST /v1/triage`, after warm start | **~15 ms** |

### 2.1 Full methodology disclosure

| Aspect | Detail |
|---|---|
| **Sample size** | **One request each.** Not an average, not a median, not a trimmed mean. |
| Machine | A developer laptop — Windows 11, Node 20. Not a server, not a controlled environment, not isolated from other running processes. |
| Process state | M-1 was a **cold** call: first request into a freshly-started process, so it includes lazy module initialisation, the first TLS handshake to AlgoNode, and DNS resolution. M-2 was **warm**: the facilitator's payment kinds were already cached in-process. |
| Network | Live Algorand TestNet via the public AlgoNode endpoint (`https://testnet-api.algonode.cloud`), no API key, shared public infrastructure. Live GoPlausible facilitator for M-2's warm-up. |
| Clock | Wall-clock around the HTTP call, client-side. No server-side instrumentation exists — there are no metrics, no timers, and no structured logs in the application (OPS-002, OPS-003 both **NOT IMPLEMENTED**). |
| Repetition | None. Neither observation was repeated, varied, or run under concurrency. |
| What M-1 includes | Two sequential outbound algod round-trips: `algod.getTransactionParams()` (`api/src/services/algorand.ts:85`) followed by `atc.simulate(algod)` (`:98`), plus zod validation and JSON serialisation. |

### 2.2 What these numbers are not

**They are not a benchmark.** Explicitly and without qualification:

- They are **not** p50, p95, p99, or any other percentile. A percentile requires a distribution; a distribution requires more than one sample.
- They are **not** an SLO, an SLA, a target, or a budget. No latency budget has ever been agreed for any MedRail endpoint.
- They are **not** comparable to each other. M-1 is a cold call that crosses the network twice; M-2 is a warm, purely local computation.
- They do **not** characterise behaviour under load, under concurrency, or under failure.
- They do **not** transfer to any other environment. Nothing has been measured on a server, in a container, or from a hosted deployment — none of which exist.

Two additional wall-clock figures exist and are also **not** performance measurements: the contract suite runs in **0.44 s** (28 tests) and the API suite in **9.99 s** (45 tests) — see [`Test_Results.md`](Test_Results.md) §2 and §3. Those are test-harness durations, and the API figure is a particularly clear illustration of why: vitest reports `tests 348ms` inside that 9.99 s total, so **97 % of the elapsed time is module import and transform**, not assertion execution. A reader who took "9.99 s" as a signal about MedRail's speed would be reading the TypeScript toolchain's startup cost.

The same caution applies across editions: the API suite grew from 18 tests to 45 and its wall time rose, which says nothing about the application. **No timing in this repository, from any source, is a performance measurement.**

---

## 3. Latency budget decomposition — structural analysis, **not measurement**

Everything in this section is derived by reading the code and the protocol, not by timing it. Each component is named with its source location so a reader can confirm the path. **No duration is asserted for any component.** The purpose is to identify *what* to measure in §4, and to make the shape of each endpoint's cost visible before any number exists.

### 3.1 Component inventory

| Component | Where it happens | Character | Under MedRail's control? |
|---|---|---|---|
| **C0 — rate-limit check** | `rateLimit.ts`, mounted ahead of the payment middleware on `/v1/consent/status`, `/v1/records/summary`, `/v1/consent/arc56` | One `Map` lookup and an integer compare. Structurally free, and it **sheds** load rather than adding it | Yes |
| **C1 — zod validation** | `routes/*.ts` `safeParse`, address fields via `validation.ts` `algorandAddress` → `algosdk.isValidAddress` | Pure CPU over a small object. The checksum decode added for SEC-010 is a base32 decode plus a 4-byte SHA-512/256 comparison — negligible, and it now rejects malformed addresses *before* any chain call, removing a wasted round-trip that previously ended in a 500 | Yes |
| **C1b — payer recovery** | `x402Payer.ts`, `/v1/records/summary` only | Base64 decode, JSON parse, and one `algosdk` transaction decode to recover the signer. Pure CPU, no I/O, no signature verification of its own — the middleware already verified the header | Yes |
| **C2 — rule evaluation** | `triageScorer.ts:53-73` (11 substring groups), `interactionChecker.ts:36-55` (14 pairs, table loaded once at import via `readFileSync`) | Pure CPU, no I/O, no allocation of significance. **Structurally negligible** relative to any network component. | Yes |
| **C3 — x402 initialisation** | `x402.ts:6-14`, first priced request only | One outbound HTTPS call to the facilitator's `/supported`; cached thereafter (PERF-001) | Partly — the cache is MedRail's, the endpoint is not |
| **C4 — facilitator verify + settle** | `@x402/hono` `paymentMiddleware`, `app.ts:37-50` | Outbound HTTPS round-trip to GoPlausible **plus** whatever that facilitator does internally, which includes submitting and confirming the payment transaction on Algorand | **No** — third party |
| **C5 — Algorand finality** | Inside C4, and again in C7 | Consensus round time; a transaction is final once included in a round | **No** — network protocol |
| **C6 — algod `getTransactionParams`** | `algorand.ts:85`, `:106`, `:156` | Outbound HTTPS round-trip to public AlgoNode. **No timeout, no retry, no circuit breaker** (`algorand.ts:5`, REL-003 **NOT IMPLEMENTED**) | Partly |
| **C7 — algod `simulate`** | `algorand.ts:98`, `:119` | Outbound HTTPS round-trip; executes the read-only method against current state. Zero fee, nothing submitted (SEC-009) | Partly |
| **C8 — `atc.execute(algod, 4)`** | `algorand.ts:175` | Submits the `log_access` transaction and **waits up to 4 rounds** for confirmation before returning or throwing | Partly — the round count is MedRail's choice; round duration is not |
| **C9 — `getAuditCount` before every write** | `algorand.ts:158` | An **additional, sequential** C6 + C7 pair executed inside `logAccess` before the write is even composed. The C6 half is redundant: `logAccess` has *already* fetched suggested params at `algorand.ts:156` and does not pass them down (**G-33**, open) | Yes — this is a design choice |
| **C10 — `withPatientLock` queueing** | `algorand.ts:123-138` | Serialises all `logAccess` calls for a given patient; a queued call waits for every prior call for that patient to settle | Yes |

### 3.2 Per-endpoint composition

| Endpoint | Price | Path (in order) | Dominant structural cost |
|---|---|---|---|
| `POST /v1/triage` | $0.02 | C4 → C1 → C2 | **C4.** Local work is one substring scan over 11 groups. Everything else is the facilitator round-trip and the settlement it performs. |
| `POST /v1/interaction-check` | $0.02 | C4 → C1 → C2 | **C4.** Same shape; the 14-pair table is already in memory from module import. |
| `POST /v1/records/summary` | $0.05 | C0 → C4 → C1 → **C1b** → **C6 + C7** (`checkAccess`) → **C10 → C9 (C6 + C7) → C8** (`logAccess`) | **The longest path in the system by construction.** A single request performs: one facilitator settlement, a local payer recovery, then two algod round-trips for the consent check, then — inside the lock — two more algod round-trips to read the audit count, then a submitted transaction awaited for up to 4 rounds. That is **five outbound algod calls plus one on-chain confirmation plus one facilitator settlement, all sequential, all before the response is written.** C1b adds no I/O. Note the two *early-exit* paths, both of which skip everything downstream: a payer mismatch returns 403 after C1b, and a consent denial returns 403 after one submitted denial-audit transaction. |
| `GET /v1/consent/status` | free | C0 → C1 → C6 → C7 | **Two sequential algod round-trips**, now behind a 60/min fixed window. This is what M-1's 505 ms cold observation contains. |
| `GET /v1/consent/app-info` | free | C1 only | Local; reads `config` |
| `GET /v1/consent/arc56` | free | C0 → `readFileSync` + `JSON.parse` per request | Local disk; `app.ts` re-reads and re-parses the ARC-56 file on **every** request with no caching. Rate-limited 30/min, which bounds the waste without removing it |
| `GET /v1/health` | free | C1 only | Local (`routes/health.ts`). **Deliberately not rate-limited** — an orchestrator probe must never be shed, and `app.spec.ts` asserts it is not |
| `GET /` | free | none | Static object (`app.ts`) |

### 3.3 What the decomposition implies

Three structural statements, each derivable from the table above without any measurement:

1. **MedRail's own computation is not the cost.** The rule engines are substring scans over 11 and 14 static entries. Any latency of consequence is network: the facilitator, algod, and Algorand consensus. Optimising the scoring code would be optimising the wrong thing.
2. **The paid consent-gated endpoint is qualitatively different from the other two priced endpoints.** `/v1/triage` and `/v1/interaction-check` cost one facilitator round-trip; `/v1/records/summary` costs that plus five algod calls plus an awaited on-chain confirmation. Charging $0.05 versus $0.02 reflects the on-chain work honestly, but the *latency* difference is not a factor of 2.5 — it is a difference in kind. Any latency budget must be set per-endpoint, never service-wide.
3. **The free endpoint is still the cheapest to abuse, but it now has a ceiling.** `GET /v1/consent/status` is unauthenticated and unpriced, and performs two outbound algod calls per request — so it is simultaneously a denial-of-service surface for MedRail and a traffic-amplification surface pointed at public AlgoNode infrastructure. `api/src/rateLimit.ts` now caps it at **60 requests per minute per client key**, returning 429 with `Retry-After` (SEC-013 / **G-09** closed). Three things follow, and all three are reasons W1 stays in the plan rather than reasons to drop it:
   - **The cap is a number nobody has measured against.** 60/min was chosen as a plausible courtesy limit, not derived from a throughput curve. W1 is what would tell you whether it is generous, tight, or irrelevant.
   - **The client key is spoofable.** It reads the first `X-Forwarded-For` hop, which a direct caller controls. The limiter is a guard against accidental hammering and casual abuse, not a security boundary — and the source says so.
   - **It is per-process and in-memory.** Behind more than one instance it becomes per-instance rather than global. That is a weakening, not a failure, and it currently coincides with the `max_machines_running = 1` ceiling imposed for an unrelated reason (§6.2).

   The same limiter also caps the **consent-denied** path of `/v1/records/summary` at 30/min. That path is free to the caller — a 403 cancels settlement — while costing MedRail one Algorand transaction fee for the denial audit write, so it is the one route where an attacker spends nothing and the operator spends something per request. Bounding it bounds that drain.

---

## 4. Performance validation plan — **RECOMMENDED**

None of this exists. It is written to be executable.

### 4.1 What to measure

| Metric | Definition | Applies to |
|---|---|---|
| **Latency p50 / p95 / p99 / max** | Server-side time from first byte in to last byte out, per endpoint | All 8 endpoints, separately |
| **Throughput** | Sustained successful requests per second at a fixed concurrency | All endpoints |
| **Error rate under load** | Non-2xx (excluding intended 402/403) as a fraction of total, by status code | All endpoints |
| **Settlement success rate** | Payments presented ÷ payments settled by the facilitator | The 3 priced endpoints |
| **Settlement latency** | Time inside the x402 middleware (C4), isolated from handler time | The 3 priced endpoints |
| **algod call latency** | `getTransactionParams` (C6) and `simulate` (C7) timed independently | `/v1/consent/status`, `/v1/records/summary` |
| **On-chain confirmation latency** | Time in `atc.execute(algod, 4)` (C8), and the rate of 4-round exhaustion | `/v1/records/summary` |
| **Per-patient audit-write throughput** | Successful `logAccess` calls per second for a **single** patient | `logAccess` directly |
| **Lock wait time** | Time spent queued in `withPatientLock` before work begins (C10) | `logAccess` directly |
| **Sequence collision rate** | Distinct sequence numbers ÷ concurrent writes | `logAccess` directly |

Note the last three cannot be obtained from an HTTP load test alone. They need the harness in §4.3.

### 4.2 Workload model

| Scenario | Endpoint mix | Concurrency | Duration | Purpose |
|---|---|---|---|---|
| **W1 — free-read baseline** | 100 % `GET /v1/consent/status` | ramp 1 → 50 | 5 min | Establish the two-algod-call cost curve and determine where AlgoNode begins to throttle. **Requires the rate limiter to be raised or bypassed for the run** — 60/min per client key will otherwise cap the ramp at about 1 rps and the run will measure the limiter, not the endpoint. Run it twice: once bypassed, to find the real ceiling, and once at the production limit, to confirm the limiter sheds cleanly under a flood rather than degrading |
| **W2 — 402 challenge** | 100 % unpaid `POST /v1/triage` | ramp 1 → 200 | 5 min | Verify PERF-001 holds under load (no per-request outbound call) and find the pure-Node ceiling |
| **W3 — paid open endpoint** | 100 % paid `POST /v1/triage` | 1 → 10 | 10 min | Isolate facilitator settlement latency and settlement success rate |
| **W4 — paid consent-gated** | 100 % paid `POST /v1/records/summary`, **distinct patients** | 1 → 10 | 10 min | The full five-algod-call path with no lock contention |
| **W5 — paid consent-gated, single patient** | 100 % paid `POST /v1/records/summary`, **one patient** | 1 → 10 | 10 min | Directly measures the `withPatientLock` serialisation ceiling (§5.2) |
| **W6 — realistic mix** | 60 % triage, 20 % interaction-check, 15 % consent-status, 5 % records-summary | steady 20 | 15 min | A composite figure for the whole service |
| **W7 — soak** | W6 mix | steady 5 | 4 h | Detect memory growth in `patientQueues` (`algorand.ts:129` — a `Map` that is written on every call and **never pruned**) |
| **W8 — dependency failure** | W6 mix with the facilitator unreachable, then AlgoNode unreachable | steady 10 | 5 min each | Characterise the two dependency failures under load. The facilitator case now has a defined answer — 503 with `Retry-After: 30` on priced routes, free routes unaffected (**G-04** closed) — so this run is about whether that answer *holds under load* or whether the failing initialisation queues and amplifies. The AlgoNode case has no defined answer at all: there is no timeout, retry or circuit breaker (REL-003), so this is where the queue-depth question is settled |

**W3, W4 and W5 spend real TestNet USDC on every request.** They must be budgeted, run against TestNet only, and funded from a dedicated account. This is a real constraint on how large a paid load test can be, and it should be stated to anyone reading the resulting numbers.

### 4.3 Tooling

| Tier | Tool | Why |
|---|---|---|
| HTTP load (W1, W2, W6, W7, W8) | **k6** or **autocannon** | Neither is currently in the repository. k6 is preferred: scripted scenarios, per-request tagging, built-in percentile reporting, thresholds as pass/fail gates. autocannon is the lighter option if the team wants to stay entirely in Node. |
| Paid load (W3, W4, W5) | **A custom Node harness** wrapping `@x402/fetch`'s `wrapFetchWithPayment`, modelled on `api/scripts/e2e-proof.ts` | k6 cannot sign Algorand payments. The harness must manage a funded TestNet account and a nonce/ordering strategy, and record per-request settlement outcomes. |
| Contract path (per-patient throughput, lock wait, collisions) | **A scripted concurrent `logAccess` harness** calling `services/algorand.ts` directly | The constraint is an in-process lock plus chain confirmation, neither of which is visible through HTTP. This harness is also the natural home for TC-130…TC-134 in [`Test_Cases.md`](Test_Cases.md) — the correctness and performance questions are the same experiment. |
| Server-side timing | **Structured logging with request ids, plus a metrics exporter** | **OPS-002 is PARTIALLY IMPLEMENTED**: `api/src/app.ts` emits structured JSON for two events (`audit_write_failed`, `facilitator_unavailable`) and `app.onError` attaches a generated `requestId`. That is enough to correlate a *failure*, not to time a *path* — there is no per-request span, no timer, and no metrics exporter (OPS-003 **NOT IMPLEMENTED**, **G-15** open). Without them every measurement is client-side and cannot attribute time to C4 vs C6 vs C8. **This is a prerequisite, not an optional extra** — build it before running §4.2. |

### 4.4 Environment requirements

A measurement is worthless without a stated environment. None of these exist today.

| Requirement | Current state |
|---|---|
| A dedicated, non-laptop host for the API — fixed CPU/memory, no competing workload | **Does not exist.** No hosted deployment of any kind. |
| A container image built from `api/Dockerfile`, so the tested artefact is the shipped artefact | **Never built** (NFR-007 **UNVALIDATED**, TC-203). The Dockerfile and `api/fly.toml` are now correct — `npm ci`, `.dockerignore`, `NETWORK`, `CONSENT_APP_ID`, `/v1/health` check — so the remaining work is to run the build, not to fix it |
| Load generator on a separate host from the system under test | Not established |
| A funded TestNet account with sufficient USDC (ASA `10458941`) and ALGO for the run's duration | Ad hoc |
| An operator account with ALGO headroom, and app-account MBR headroom for every audit box the run will create | App account holds 5 ALGO against a min-balance of 550,400 µALGO — roughly 4.45 ALGO of headroom, or about 31,000 further audit boxes at 142 bytes each. MBR headroom is **unmonitored** (REL-006 **PARTIALLY IMPLEMENTED**, and **G-15** means nothing alerts on it). Note a wrinkle for anyone sizing a run from the contract's own advertised constant: `get_grant_box_mbr` is corrected to 22,500 µALGO in source, but **App `768743428` still runs the pre-fix bytecode and returns 22,100** — under-reporting by 400 µALGO per grant box |
| Recorded versions: Node, algosdk, `@x402/*`, contract App ID, facilitator, algod endpoint | Available but not captured per-run |
| Baseline persistence and run-over-run comparison | **Does not exist** |

### 4.5 Pass criteria — **decisions the team must make, not values this document asserts**

No latency target has ever been agreed for MedRail. The following are the decisions that must be taken *before* the first run, so that results can be judged rather than merely reported. **Each is deliberately left blank.**

| # | Decision | Considerations the team must weigh |
|---|---|---|
| D-P1 | p95 latency target for `GET /v1/consent/status` | Two sequential algod round-trips over shared public infrastructure. The single cold observation was 505 ms; a warm figure is unknown. Any target must be set against a *measured* warm distribution, not against M-1. Related and separate: the 60/min rate limit was chosen without a throughput curve behind it, so W1 should be used to decide whether it is the right number as well as what the endpoint costs. |
| D-P2 | p95 latency target for `POST /v1/triage` and `/v1/interaction-check` | Dominated by the facilitator round-trip (C4), which is outside MedRail's control. The target is really a target for an acceptable *third-party* dependency, and should be expressed as such. |
| D-P3 | p95 latency target for `POST /v1/records/summary` | Contains an awaited on-chain confirmation (C8). Any target below Algorand's confirmation time is unachievable without the PERF-004 fix in §5.1. Decide the fix first, then the target. |
| D-P4 | Minimum acceptable settlement success rate | A settlement failure is a failed payment and the caller receives nothing — but they are also not charged, because `@x402/hono` settles only on a sub-400 response. The related question worth measuring is the **`auditStatus: "pending"` rate**: a request that succeeds for the caller while failing to record the access is a silent data-integrity event, and it is the one outcome that currently produces no metric and no alert (**G-15**). |
| D-P5 | Maximum acceptable error rate under W6 | Must exclude intended 402/403 from the numerator. |
| D-P6 | Target concurrency the service must sustain | Bounded today by §6's hard scaling blocker, not by CPU. |
| D-P7 | Per-patient audit-write rate the design must support | Structurally capped — see §5.2. If the required rate exceeds the cap, the contract-side fix in §6 is mandatory, not optional. |
| D-P8 | Behaviour required when the facilitator is unavailable | **Decided and implemented:** priced routes return `503` with `Retry-After: 30` and `{"error":{"code":"PAYMENT_FACILITATOR_UNAVAILABLE","retryable":true,"facilitator":"…"}}`, free routes are unaffected (**G-04** / REL-001 closed in code). What remains open is the *quantitative* half: how long the retry advice should be, whether MedRail should cache the last-known payment kinds and serve a 402 from them instead, and how the 503 path behaves under sustained load. W8 is the run that informs all three. |

### 4.6 Reporting

Every published performance figure must carry: the workload id (W1…W8), sample count, concurrency, duration, environment description, software versions, the App ID and network, and the date. A number without those is not a result. **This document contains no such figures precisely because none of that context exists yet.**

---

## 5. Known structural bottlenecks

Identified by reading the code. Each is a hypothesis about where time goes, stated with its mechanism — **none has been measured.**

### 5.1 The audit write is inline on the paid response path — PERF-004

```ts
// api/src/routes/records.ts — the write is guarded, but still awaited
try {
  const logResult = await logAccess(patientId, requesterAddress, SCOPE, ENDPOINT, "consent_checked");
  auditTxId = logResult.txId;
  auditSequence = logResult.sequence.toString();
} catch (err) {
  auditStatus = "pending";
  // structured audit_write_failed event, then fall through to a 200
}
```

`logAccess` submits a real transaction and waits for confirmation via `atc.execute(algod, 4)` (`algorand.ts:175`). **Algorand's confirmation latency is therefore directly inside the user's critical path**, and `/v1/records/summary` cannot respond faster than the chain confirms — no matter how fast MedRail's own code is. The 4-round wait is also the failure timeout, roughly 14 seconds on Algorand, and it is the worst-case contribution of C8 to the endpoint's latency.

**What the `try/catch` changed, and what it did not.** It changed the *failure* behaviour: a rejected or timed-out write now yields `200` with `auditStatus: "pending"` and null `auditTxId`/`auditSequence`, plus a structured `audit_write_failed` event, instead of throwing. That matters — an authorised, paying caller no longer loses their response to a transient chain problem. It changed nothing about *latency*: the request still waits the full 4 rounds before giving up, so the guard converts a slow failure into a slow success rather than into a fast one. **PERF-004 remains NOT IMPLEMENTED.**

The response returns `auditTxId` and `auditSequence` to the caller, so the coupling is not accidental — it is a deliberate choice to give the caller a receipt. That is a defensible product decision, but it must be recognised as the decision that sets the endpoint's latency floor.

**Options, each with a cost:** respond immediately and return a poll URL for the audit receipt; submit without awaiting confirmation and return the transaction id optimistically; or keep the current behaviour and set D-P3 accordingly. Note the `auditStatus` field already gives the response shape somewhere to say "not yet", which is most of what an asynchronous design needs from the API contract — the field was added for failure handling and happens to be the same field an async write would use. The choice belongs to the team; this document records that it has not been made.

### 5.2 `withPatientLock` serialises all audit writes for a patient

```ts
// api/src/services/algorand.ts:123-138 (comment + function)
function withPatientLock<T>(patient: string, fn: () => Promise<T>): Promise<T> {
  const prior = patientQueues.get(patient) ?? Promise.resolve();
  const next = prior.then(fn, fn);
  ...
}
```

Every `logAccess` for a given patient waits for the previous one to fully settle — including its on-chain confirmation. **Per-patient audit-write throughput is therefore capped at roughly one write per confirmation round**, regardless of how much CPU or how many connections the API has. Writes for *different* patients are independent (the queue is keyed by address), so the cap is per-patient, not service-wide.

**Why the lock is needed — stated precisely, because the obvious explanation is wrong.** The contract self-assigns the sequence number: `log_access` reads its own `audit_seq` box, computes `next_seq`, and returns it (`contracts/smart_contracts/consent/contract.py:224-236`). The backend's `predictedSeq` (`algorand.ts:158-159`) exists **only to populate the AVM box-reference array** (`:169-172`), because Algorand requires every box a transaction touches to be declared in advance. So an unserialised race does **not** corrupt or misorder the log — the contract still assigns correctly. What it does is get the *second* transaction **rejected**: both callers declare box `a‖patient‖itob(n+1)`, the first write consumes `n+1`, and the second is assigned `n+2` — a box it never declared.

The lock therefore buys **availability, not integrity**. That distinction matters for both the load test and the test suite: see TC-130/TC-131 in [`Test_Cases.md`](Test_Cases.md), where the assertion with teeth is "all N concurrent calls succeed", not "the sequence numbers are unique" — the latter holds with or without the lock.

The ceiling is real regardless, and is exactly what workload W5 exists to measure.

Secondary observation: `patientQueues` is a `Map` that is written on every call and **never pruned** (`algorand.ts:129`, `:133`). Each distinct patient address adds a permanent entry. Not a bottleneck at demo scale; it is why W7 (soak) is in the plan.

### 5.3 `getAuditCount` adds two sequential round-trips before every write

`logAccess` calls `getAuditCount(patient)` (`algorand.ts:158`) before composing its transaction. `getAuditCount` performs its **own** `getTransactionParams` (`:106`) followed by its **own** `simulate` (`:119`). So each audit write costs two extra sequential algod round-trips before the transaction is even built, and those round-trips sit **inside** the per-patient lock — they extend the serialised critical section for every queued caller, not just the current one.

**Half of that is free to remove and has not been removed.** `logAccess` already fetched suggested params at `algorand.ts:156`, immediately before calling `getAuditCount`, and does not pass them down — so the same `getTransactionParams` call is made twice, back to back, on every audit write. This is **G-33**, open. It is the smallest performance defect in this document and the only one with a fix that requires no design decision: pass the params through.

The `simulate` half cannot be removed without changing how the audit box is addressed — see §6.3.

### 5.4 The facilitator round-trip is unavoidable and outside MedRail's control

Every priced request requires the facilitator to verify and settle (C4). GoPlausible's internal latency, its own algod dependency, and its availability are all third-party properties. MedRail has **no timeout, no retry, no circuit breaker and no cached fallback** around it — a facilitator outage produces HTTP 500 rather than a graceful 503 (R-1), and the same coupling makes the API test suite non-hermetic (CI-2).

This is the standard x402 trust and latency model, not a MedRail defect. It should be measured and reported *separately* from MedRail's own handler time (which requires the server-side instrumentation in §4.3), so that a slow facilitator is never mistaken for a slow application.

### 5.5 Minor, but real

| Item | Location | Note |
|---|---|---|
| ARC-56 spec re-read per request | `app.ts:63-69` | `readFileSync` + `JSON.parse` on every `GET /v1/consent/arc56`, uncached. Small file, free endpoint, trivially cacheable. |
| No connection reuse configuration | `algorand.ts:5`, `web/lib/consent.ts:5` | `new algosdk.Algodv2("", server, "")` with default agent behaviour; no explicit keep-alive tuning. |
| No timeout anywhere on chain I/O | `algorand.ts:5` | R-4. Under load this is a queue-depth problem, not just a latency problem: slow upstream calls accumulate in-flight requests with nothing to shed them. |

---

## 6. Scalability analysis

### 6.1 What would scale

The API tier is **stateless** in the conventional sense (NFR-001 **IMPLEMENTED**): no database, no session store, no cache, no queue, no local file writes on the request path. All durable state lives in Algorand box storage. A stateless HTTP tier of this shape is normally trivial to scale horizontally — add machines behind a load balancer.

### 6.2 The hard scaling blocker — REL-004 / D-7

**It does not scale horizontally, because `withPatientLock` is in-process.**

```ts
// api/src/services/algorand.ts:129
const patientQueues = new Map<string, Promise<unknown>>();
```

The mechanism that keeps concurrent audit writes *available* is a `Map` in one Node process. What makes them collide is **not** the sequence number itself — the contract assigns that correctly on its own (`contract.py:224-236`) — but the fact that Algorand requires every box a transaction touches to be **declared in advance**. `logAccess` therefore has to guess which audit box the contract will write to: it reads the current count and declares `a‖patient‖itob(count + 1)` as a box reference (`algorand.ts:158-159`, `:169-172`).

Put two instances behind a load balancer, both using the same operator account, and two concurrent requests for the same patient land on different machines. Neither queue knows about the other. Both read count `n`. Both declare box `n+1`. The first executes and the contract consumes `n+1`. The second executes, the contract correctly assigns `n+2` — and the write **fails, because box `n+2` was never declared in that transaction**.

**The failure mode is a rejected transaction, not a corrupted log.** The audit trail's integrity is never at risk; its *availability* is. And per finding R-2, that rejection on the success path of `records.ts` returns HTTP 500 **after the payment has settled** — the caller has paid $0.05 and receives nothing (TC-134).

This is not hypothetical configuration drift. `api/fly.toml` sets `auto_start_machines = true` with `min_machines_running = 1` — a floor, not a ceiling — so the committed deployment configuration **permits** more than one machine. `docs/SECURITY.md` describes the in-process lock as the mitigation for this race. **The deployment configuration contradicts the stated mitigation** (defect **D-7**). Nothing tests either side; TC-130, TC-131 and TC-132 in [`Test_Cases.md`](Test_Cases.md) exist to make both observable.

| Scaling axis | Verdict |
|---|---|
| Vertical (bigger machine) | Ineffective — the constraint is network and consensus latency, not CPU |
| Horizontal, endpoints without audit writes (`/v1/triage`, `/v1/interaction-check`, `/v1/health`, `/v1/consent/*`) | **Works.** These are read-only or pure-compute; nothing shared. Note `/v1/consent/status` scales the *amplification* problem too (§3.3, SEC-013). |
| Horizontal, `/v1/records/summary` | **Broken.** Any instance count above one reintroduces the box-reference collision, surfacing as rejected writes and — through R-2 — as 500s after settlement. |
| Per-patient audit write rate | **Capped at roughly one per confirmation round** regardless of instance count (§5.2) |

### 6.3 The correct fix — remove the need to predict the box reference

The sequence number is **already** the contract's to assign, and it already returns it (`contract.py:224-236`, consumed at `algorand.ts:176`). Nothing needs to move into the contract. The problem is narrower and more mechanical: **the client must name the audit box before the contract has decided which one it is.**

Three directions, in increasing order of cost:

| Approach | Mechanism | Trade-off |
|---|---|---|
| **Declare a small window of candidate boxes** | Reference `n+1 … n+k` for a small `k`, so a caller that loses a race still has the box it lands on declared | Cheapest and requires no contract change; consumes box-reference slots and only tolerates `k-1` concurrent losers |
| **Restructure the audit box key so it does not embed the sequence** | Key by something the caller already knows (for example a caller-supplied unique id, with the sequence stored *inside* the entry) | Removes the guess entirely and removes the `getAuditCount` pre-read (§5.3); requires a contract change and redeployment |
| **Bounded retry on box-reference rejection** | Catch the rejection, re-read the count, re-declare, resubmit | No contract change; adds latency exactly when contention is highest, and needs care not to double-write |

Whichever is chosen, the payoff is the same:

| Consequence | Effect |
|---|---|
| The `getAuditCount` pre-read (§5.3) can be dropped or shortened | Up to two fewer sequential algod round-trips per write, inside the critical section |
| `withPatientLock` stops being load-bearing | The per-patient serialisation ceiling (§5.2) is removed |
| Horizontal scaling becomes safe | D-7 and REL-004 are closed at the source rather than mitigated in one process |
| Correctness stops depending on deployment topology | The mitigation no longer contradicts `fly.toml` |

Two of the three options require a contract change and therefore a redeployment and a new App ID — which is precisely why the decision should be taken before, not after, any MainNet deployment. **REL-004 is PARTIALLY IMPLEMENTED today; the windowed-reference and retry options can improve it from the API tier alone, but only the key restructuring closes it.**

---

## 7. Summary for a reviewer

| Question | Answer |
|---|---|
| Are there performance test results? | **No.** None exist. |
| Are there any measured latency figures? | **Two single observations**, fully disclosed in §2 with their methodology: 505 ms cold `GET /v1/consent/status`, ~15 ms warm 402 generation. Single samples on a developer laptop. Not percentiles, not a benchmark. |
| Is there a latency budget or SLO? | **No.** None has ever been defined (PERF-002). §4.5 lists the eight decisions that must be taken before one can be. |
| Is there load-testing tooling in the repository? | **No.** |
| Where is the latency? | Structurally: the facilitator round-trip and, for `/v1/records/summary`, five sequential algod calls plus an awaited on-chain confirmation. MedRail's own computation is negligible. **This is analysis, not measurement.** |
| Does the service scale horizontally? | **Not for `/v1/records/summary`.** The in-process `withPatientLock` cannot serialise across instances, and each write must declare a *predicted* audit-box reference that a losing racer will not have declared — while `api/fly.toml` permits multiple machines (REL-004 / D-7). The failure mode is a **rejected transaction, not a corrupted log**; through R-2 it surfaces as a 500 after the payment has settled. The fix is to stop predicting the box reference (§6.3) — sequence assignment is already the contract's job and already correct. |
| What should be measured first? | W1 and W5: the free endpoint's real warm distribution (because it is the unauthenticated amplification surface), and the single-patient audit-write ceiling (because it is the hard architectural limit). |
