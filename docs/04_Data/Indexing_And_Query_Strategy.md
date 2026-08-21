# MedRail — Indexing and Query Strategy

**Purpose:** state exactly which queries MedRail's data layer can serve, at what cost, and which queries the product needs but cannot answer — then set out the concrete options for closing the gap.

**Status of this document:** **IMPLEMENTED** for the query catalogue in §2 (every access path was traced in source and, where possible, executed against the live TestNet endpoints on 2026-08-21). §4 is an analysis of missing capability. §6 is **RECOMMENDED** throughout — none of it exists.

---

## 1. The access paths that exist

There are exactly four ways to get data out of MedRail's data layer. There is no query language, no index, no view, no planner.

| # | Path | Available to | Complexity | Notes |
|---|---|---|---|---|
| **P1** | **In-contract box read by exact key** — `BoxMap.maybe(key)` / `.get(key, default)` | the AVM, during a method call | **O(1)** point read | The key must be computed inside the program **and** the box must be listed in the transaction's box references. Algorand allows a bounded number of box references per transaction (8), which caps any single call at a handful of boxes. |
| **P2** | **Off-chain box-name listing** — `GET /v2/applications/768743428/boxes` | anyone, algod or indexer | O(total boxes), paginated | Returns **names only**, never values. algod honours a `prefix=b64:…` filter server-side; see the caveat in §2.5. |
| **P3** | **Off-chain box-value read by exact name** — `GET /v2/applications/768743428/box?name=b64:…` | anyone, algod | **O(1)** | Requires the exact 33- or 41-byte name. |
| **P4** | **Off-chain transaction / log search** — indexer `/v2/transactions?application-id=768743428` | anyone | O(matching history) | The only path that sees ABI arguments and ARC-28 event logs. Supports time and round filters, address filters, and pagination — but **does not index ABI argument values**. |

**What does not exist, in the AVM and in this design:**

- **No box enumeration opcode.** A contract cannot list its own boxes. Anything shaped like `SELECT … WHERE` is impossible inside the program.
- **No range scan.** Box reads are exact-key only. Neighbouring keys cannot be walked from inside the AVM.
- **No secondary index.** Nothing maps a patient to their grants, a requester to their grants, or a timestamp to an audit entry.
- **No off-chain read model.** There is no indexer service, no materialised view, no cache, no database — see [`Database_Design.md`](Database_Design.md) §0.
- **No pagination over grants**, because there is nothing to page through: the names are opaque digests (§3.1).

---

## 2. Query patterns the code actually performs

Five, in total. That is the entire read workload of the running system.

### 2.1 Q1 — "Is this `(patient, requester, scope)` currently authorised?"

| | |
|---|---|
| **Trigger** | `POST /v1/records/summary` (`records.ts:32`), `GET /v1/consent/status` (`consent.ts:29`) |
| **Implementation** | `checkAccess`, `api/src/services/algorand.ts:82-100` |
| **Mechanism** | `AtomicTransactionComposer.simulate()` of the `readonly` ABI method `check_access` (selector `2db778ab`), with the grant box named in `boxes: [{appIndex: 0, name: grantBoxName(...)}]` |
| **Data-layer cost** | **one O(1) box read** (P1) |
| **Network cost** | **two sequential algod round trips** — `getTransactionParams()` at `algorand.ts:85` then `simulate()` at `:98` |
| **Chain cost** | **zero** — nothing is submitted, no fee is paid (SEC-009, **IMPLEMENTED**) |
| **Caching** | **none.** Every call hits the chain. |
| **Observed latency** | one cold sample of **505 ms** (VERIFIED_FACTS §12). A single observation on a developer laptop — not a p50, not a p95, not an SLO. No latency budget exists (PERF-002, **NOT IMPLEMENTED**). |

The key insight: this query is fast *because the answer's address is computable*. `check_access` never searches; it hashes three inputs and reads one box.

### 2.2 Q2 — "How many audit entries does this patient have?"

| | |
|---|---|
| **Trigger** | internal only, from `logAccess` (`algorand.ts:158`) |
| **Implementation** | `getAuditCount`, `algorand.ts:103-121` → `get_audit_count` (selector `d29268a6`), `readonly` |
| **Mechanism** | simulate, with the `audit_seq` box named |
| **Cost** | one O(1) box read; two algod round trips; zero fee |
| **Absent-box behaviour** | returns `0` — `self.audit_seq.get(patient, default=UInt64(0))` (`contract.py:240`), so it never asserts |

**No HTTP endpoint exposes this.** A caller cannot ask MedRail how many times a patient's record has been accessed; the ABI method is public and callable directly against the contract, but the API does not surface it.

### 2.3 Q3 — the read-then-write: appending an audit entry

| | |
|---|---|
| **Trigger** | `POST /v1/records/summary`, both the allowed (`records.ts:49`) and denied (`records.ts:37`) paths |
| **Implementation** | `logAccess`, `algorand.ts:146-179`, wrapped in `withPatientLock` |
| **Sequence** | ① `getTransactionParams()` (`:156`) → ② `getAuditCount(patient)`, which internally performs **its own** `getTransactionParams()` (`:106`) **and** a `simulate()` → ③ predict `seq = count + 1` (`:159`) → ④ `atc.execute(algod, 4)` submits the real `log_access` transaction and polls for confirmation |
| **Box references** | **two** must be named in advance: `audit_seq` and the *predicted* `audit_log` box (`:169-172`) |
| **Cost** | 1 box read + 2 box writes on chain; **four algod round trips plus confirmation polling**; one transaction fee paid by the operator account; 59,300 µALGO (or 58,900) of MBR permanently locked on the app account |
| **Correctness risk** | the sequence prediction is only serialised **within one Node process** (`withPatientLock`, `algorand.ts:129-138`). REL-004 is **PARTIALLY IMPLEMENTED**; `api/fly.toml` permits more than one machine (defect D-7). A wrong prediction means the contract writes a box the transaction did not reference, and the AVM rejects the call. |
| **Status** | **UNVALIDATED on-chain** — `total_audit_entries = 0`; this path has never executed on TestNet (evidence gap E-1). |

> **Inefficiency worth fixing.** `getTransactionParams()` is called twice per `logAccess`: once at `algorand.ts:156` and again inside `getAuditCount` at `algorand.ts:106`. The second result is discarded from the caller's perspective. Threading the already-fetched `suggestedParams` into `getAuditCount` removes one full network round trip from the most latency-sensitive, money-carrying path in the system. Severity **LOW**; effort: one parameter. **RECOMMENDED**.

### 2.4 Q4 — serving the ARC-56 spec

| | |
|---|---|
| **Trigger** | `GET /v1/consent/arc56` |
| **Implementation** | `app.ts:63-68` — `existsSync` then `readFileSync` then `JSON.parse`, **on every request** |
| **Cost** | a synchronous 54 KB disk read plus a JSON parse, in the event loop, per request |
| **Caching** | **none** |

The endpoint is free, unauthenticated, and unrated-limited (SEC-013, **NOT IMPLEMENTED**). Synchronous file I/O on a hot path is a small but genuine availability weakness: the file never changes at runtime, so reading and parsing it once at module load — exactly as `interactionChecker.ts:18` already does for `interactions.json` — would be strictly better. **RECOMMENDED**.

### 2.5 Q5 — box listing (available, but not used by MedRail's code)

No MedRail code performs this. It is listed because it is the only enumeration primitive the system has, and operators and third parties will use it.

Executed live on 2026-08-21:

```
GET https://testnet-api.algonode.cloud/v2/applications/768743428/boxes
→ {"boxes":[{"name":"ZxVGxI4HmhxwFbb0zjuPUZtVJ3E48U5Vot6SSTe/dpIb"},
             {"name":"Z3MvPViYxVEb1KLSbuRHJK2vLARtCJtCnfHXqNfUKH/i"}]}

GET .../boxes?prefix=b64:Zw%3D%3D    (prefix "g")  → both boxes
GET .../boxes?prefix=b64:cw%3D%3D    (prefix "s")  → {"boxes":[]}   ← confirms zero audit_seq boxes
```

> **Operational caveat, observed directly.** algod honours the `prefix` parameter. The AlgoNode **indexer** at `testnet-idx.algonode.cloud` returned *all* boxes for `prefix=b64:cw==` — i.e. it ignored the filter on this deployment. Any off-chain read model that relies on prefix-filtered box listing should use **algod**, or filter client-side after listing. This is an observation of these two specific public endpoints, not a statement about every indexer build.

### 2.6 What the API does *not* query

Eight of the contract's thirteen ABI methods are never called from `api/src/` or `web/`:

| Method | Called from `api/` or `web/`? | Called from `contracts/scripts/`? | Note |
|---|---|---|---|
| `check_access` | **yes** (`algorand.ts:90`) | yes | |
| `log_access` | **yes** (`algorand.ts:164`) | no | never executed on chain (E-1) |
| `get_audit_count` | **yes** (`algorand.ts:111`) | no | |
| `grant_access` | **yes** (`web/lib/consent.ts:58`) | yes | patient-signed |
| `revoke_access` | **yes** (`web/lib/consent.ts:79`) | yes | patient-signed |
| `create`, `fund_mbr`, `request_access` | no | yes | deploy / exercise scripts only |
| `set_admin`, `get_grant`, `get_audit_entry`, `get_grant_box_mbr`, `withdraw_excess` | **no** | **no** | reachable only by a direct ABI call from outside this repository |

`get_audit_entry` is the notable absence: **the contract can return an audit entry, but nothing in MedRail reads one back.** The system writes an audit log it never queries. Surfacing `get_audit_count` + `get_audit_entry` behind a free `GET /v1/consent/audit?patient=…` endpoint would turn a write-only artefact into a demonstrable one, and §5 explains why that read is unusually cheap to build here.

---

## 3. Why enumeration fails — the `grants` map in detail

### 3.1 The shape of the problem

The grant key is `0x67 ‖ sha256(patient ‖ requester ‖ scope)`. Listing boxes (P2) yields names like `ZxVGxI4HmhxwFbb0zjuPUZtVJ3E48U5Vot6SSTe/dpIb` — 33 bytes of which 32 are an irreversible digest. From box storage alone:

- you **cannot** tell which patient a grant belongs to;
- you **cannot** tell which requester it authorises;
- you **cannot** recover the scope;
- you **can** read `status`, `granted_at`, `expires_at` (P3), which tells you *something is authorised* but not *what*.

**To answer "does patient P grant requester R scope S?", you must already know P, R and S** — that is, you must know the answer in order to ask the question. That is the defining property of a hash-keyed store and it is not a bug; it is the trade that buys constant-size keys and no opt-in (see [`ER_Diagram.md`](ER_Diagram.md) §4).

### 3.2 The escape hatch, and its cost

The triple *is* recoverable — from transaction history (P4), not from box storage. `grant_access` publishes the patient as `sender` and the requester and scope as ABI arguments, in cleartext. The reviewer reconstructed a live box key end-to-end from public indexer data alone; see [`Data_Flow.md`](Data_Flow.md) §5.3.

So "list this patient's grants" is answerable — by scanning the application's entire transaction history, decoding every `grant_access` and `revoke_access` call, folding them into a per-triple state machine, and then confirming each surviving triple with a `check_access` point read. That is a **full history scan plus one simulate per candidate**, and it is exactly the off-chain read model that does not exist (§6.2).

### 3.3 The two maps that *are* enumerable

`audit_seq` and `audit_log` keys embed the patient's public key **verbatim, not hashed**. Consequences:

| Question | Answerable from box names alone? |
|---|---|
| Which patients have ever had an access logged? | **yes** — list `s`-prefixed boxes, strip byte 0, base32-encode with checksum |
| How many audit entries does patient P have? | **yes** — read the `audit_seq` box value (P3), no simulate needed |
| What is entry `n` for patient P? | **yes** — read box `0x61 ‖ P ‖ itob(n)` directly (P3) |

This asymmetry is worth naming precisely: **the consent map is privacy-preserving against box enumeration and the audit map is not.** Both are defeated by transaction history, so the asymmetry has little practical security value — but it does mean the audit log is far cheaper to build tooling against, which §5 exploits.

---

## 4. Queries the product needs and cannot serve

Each row states what MedRail can do *today*, with no new code.

| # | Query the product wants | On-chain box path | Off-chain path available today | Verdict |
|---|---|---|---|---|
| **N1** | "List every requester this patient has granted, with scope and expiry." | **impossible** — keys are digests | full indexer scan of app history + fold grant/revoke + `check_access` per candidate | **not served.** No code, no endpoint, no UI. This is the single most obviously missing patient-facing feature. |
| **N2** | "List every access to my record in the last 30 days." | possible but awkward: read `audit_seq`, then read entries `1..N` and filter on `ts` inside each value | indexer `/v2/transactions?application-id=768743428&after-time=…` filtered to `log_access` calls | **not served.** Box path is O(N) per patient with no time index; `ts` lives *inside* the value, so it cannot be filtered by key. |
| **N3** | "Which patients has requester R been authorised by?" | **impossible** | full history scan — the indexer does **not** index ABI argument values, so `R` cannot be used as a search key | **not served**, and expensive even off-chain. |
| **N4** | "Which grants expire in the next 7 days?" | **impossible** — requires enumerating grants first (N1) | N1 then read each box value | **not served.** Nothing sweeps or notifies on expiry; expiry is purely passive. |
| **N5** | "How many active grants does patient P hold?" | **impossible** — `total_grants_active` is global, not per-patient | as N1 | **not served.** |
| **N6** | "How much revenue did `/v1/triage` generate versus `/v1/records/summary`?" | n/a | **none** | **not servable at all.** The settlement `axfer` note is `x402-payment-v2-<millis>` (verified on tx `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ`) — it records **no resource URL and no endpoint**. There is also no off-chain request log (OPS-002/OPS-003, **NOT IMPLEMENTED**). Payments to `payTo` are visible in aggregate; **attribution per endpoint is impossible from any data MedRail retains.** For a competition judged partly on real usage, that is worth knowing. |
| **N7** | "Show every access, across all patients, ordered by time." | requires enumerating patients (possible via `s`-prefix listing) then N2 per patient | indexer scan of `log_access` transactions, which *are* time-filterable | **not served**, though the off-chain path is straightforward. |
| **N8** | "Which accesses were denied?" | read every audit entry and compare `action` | as N7 | **not served**, and note §3.4 of [`Data_Dictionary.md`](Data_Dictionary.md): the contract docstring's `action` enumeration does not list `consent_denied`, so a consumer built from the docstring would filter it out entirely. |
| **N9** | "Reconstruct the consent-request funnel: requested → granted → accessed." | `request_access` persists **nothing** | ARC-28 `AccessRequested` events | **broken today.** The event exists, but **defect C-1** emits `patient` and `requester` swapped (`contract.py:146`), so any consumer of that feed gets inverted identities. FR-024 is **PARTIALLY IMPLEMENTED** for exactly this reason. |

---

## 5. The one query shape this design is genuinely good at

`audit_log` keys are `0x61 ‖ patient ‖ itob(seq)` with a **big-endian** sequence, and `audit_seq[patient]` gives the exact upper bound. Therefore, for a fixed patient:

- keys are **dense** — every `n` in `1..N` exists, with no gaps, because `log_access` allocates `next_seq` atomically (`contract.py:224-226`);
- keys are **lexicographically ordered by sequence**, because big-endian `itob` sorts the same way as the integer;
- the bound `N` is **one O(1) read away**.

So a per-patient audit history is not a range *scan* — it is a **dense indexed sequence**, which is strictly better:

```
N = read box  0x73 ‖ P                       ← one request, gives the exact count
for n in 1..N:
    read box  0x61 ‖ P ‖ itob(n)             ← N independent O(1) requests, parallelisable
```

No cursor, no pagination token, no scan-and-filter, no risk of missing a concurrently-inserted row. Pagination is arithmetic: entries 40–49 are simply `n = 40..49`. Reverse-chronological order is `n = N, N-1, …`, which is what a UI actually wants. Every step is a plain unauthenticated HTTP GET against algod (P3) — no simulate, no signer, no fee, and therefore **no dependency on `OPERATOR_MNEMONIC`**, unlike Q1.

**This is the cheapest high-value feature available in the data layer**, and it needs no contract change:

```
GET /v1/consent/audit?patient=<58-char>&from=<n>&limit=<k>
  → { patient, total: N, entries: [{ seq, ts, requester, scope, endpoint, action }, …] }
```

Two caveats stated plainly: it would return **zero entries for every patient today** (E-1), and it publishes the patient's full access timeline to anyone who asks — which is already true of the underlying boxes, but an endpoint makes it convenient. Status: **RECOMMENDED**, not implemented.

---

## 6. Options for closing the gap

All three are **RECOMMENDED**. None exists. They are not mutually exclusive; B is the general answer and C is the only one that changes the chain.

### 6.1 Option A — ARC-28 event indexing, off-chain

Subscribe to App `768743428`'s transaction logs and materialise `AccessRequested` / `AccessGranted` / `AccessRevoked` into a queryable store.

| | |
|---|---|
| **Serves** | N1, N3, N4, N5, N9 |
| **Chain change** | none — the events already exist and are already emitted (`contract.py:146`, `:169-176`, `:195`) |
| **Effort** | a small subscriber process plus a store; a store is a new operational dependency the project currently does not have |
| **Blockers** | **defect C-1 must be fixed first**, or every `AccessRequested` record is inverted. Fixing it requires a **contract redeploy and a new App ID**, because the application cannot be updated (`approval.teal:33-36`). |
| **Caveat** | events are *intent*, not *state*. A consumer must still fold grant/revoke into current status and confirm expiry, because `check_access` also depends on `Global.latest_timestamp`. |
| **Verified** | selectors computed and confirmed against the live chain: `AccessRequested` `99f094ee`, `AccessGranted` `4d155120` (observed in tx `X2BQ5FD4MW52B75WQGDB67TEULYLN7FHVFO6ZOBNI74PNCAKVOUA`, 95-byte log), `AccessRevoked` `36dd8db4` |

### 6.2 Option B — an off-chain read model

A materialised view rebuilt from indexer history: one row per `(patient, requester, scope)` with current status and expiry, plus one row per audit entry, plus a per-endpoint settlement ledger to serve N6.

| | |
|---|---|
| **Serves** | N1–N8, and N9 once C-1 is fixed |
| **Chain change** | none |
| **Cost** | introduces the first datastore in the project. That is a real architectural decision, not a detail: today MedRail is genuinely stateless (NFR-001, **IMPLEMENTED**), and "no database" is one of its more defensible claims. |
| **Design constraint** | the read model must be **derivable, never authoritative**. The chain stays the system of record; the view is a cache that can be dropped and rebuilt. Any design where the view can disagree with `check_access` and win has destroyed the property that makes the consent layer meaningful. |
| **Rebuild anchor** | App `768743428` was created at round **66088624**; a rebuild replays from there. |

### 6.3 Option C — a per-patient grant-list box, on chain

Add `BoxMap(Account, DynamicArray[Bytes32], key_prefix="i")` mapping a patient to the list of grant-key digests they have issued, appended in `grant_access`.

| | |
|---|---|
| **Serves** | N1, N4, N5 directly from box storage, with no history scan |
| **Chain change** | **yes — and it cannot be applied to App `768743428`.** The app is not updatable; this requires a new deployment, a new App ID, and every patient to re-grant (see [`Database_Design.md`](Database_Design.md) §8). |
| **MBR** | the index box grows by 32 bytes per grant ⇒ **+12,800 µALGO per grant**, on top of the grant box's own 22,500 — a **57% increase** in the per-grant cost |
| **Write cost** | append becomes read-modify-write of a growing box; opcode budget and box-resize cost grow with list length |
| **Hard ceiling** | Algorand's maximum box size is 32,768 bytes ⇒ ~1,024 digests per patient, after which `grant_access` fails for that patient. A hard, silent-until-hit limit on how many grants a patient may ever issue. |
| **Still incomplete** | it stores digests, so it answers "how many / which boxes", not "which requester and scope" — recovering those still needs history (§3.2) or a second, much larger, index |
| **Verdict** | the honest one: **Option C is the wrong trade for this system.** It raises per-grant cost by more than half and introduces a per-patient cap, to serve a query that Option B answers for free off-chain. Documented here because a reviewer will ask why an on-chain index was not built, and "we considered it and the MBR arithmetic says no" is a better answer than silence. |

### 6.4 Option D — free, today, no new components

| Improvement | Effort | Serves |
|---|---|---|
| Expose `GET /v1/consent/audit` using P3 box reads (§5) | small; no signer, no fee, no contract change | N2, N7, N8 per patient |
| Enumerate patients via algod `?prefix=b64:cw==` (§2.5) | trivial; already works | the patient list for N7 |
| Read the ARC-56 spec once at module load instead of per request (§2.4) | one line | availability |
| Pass `suggestedParams` into `getAuditCount` from `logAccess` (§2.3) | one parameter | removes one round trip from the money path |
| Record the resource URL in the settlement note, or keep a structured request log | small | **N6** — the revenue attribution the competition cares about |

---

## 7. Summary

| Question | Answer |
|---|---|
| How are grants looked up? | O(1) point read by a `sha256`-derived key. Fast, cheap, and impossible to enumerate. |
| Is there a range scan? | Not in the AVM. `audit_log` is a **dense indexed sequence** per patient, which is better than a range scan for the one query it serves. |
| Is there a secondary index? | No. None, anywhere. |
| Can you list a patient's grants? | **Not from box storage.** Only by replaying transaction history off-chain — which nothing in MedRail does. |
| Can you list a patient's accesses? | **Yes, cheaply** — but no endpoint exposes it, and there are zero entries today (E-1). |
| Can you attribute revenue to an endpoint? | **No.** Not on chain, not off chain. Nothing records which resource a payment bought. |
| What is the biggest missing capability? | N1 — a patient cannot see who they have authorised. The consent registry's own user cannot query their own consents. |
| What is the cheapest fix with the highest value? | The audit read endpoint of §5: no contract change, no signer, no fee, no new dependency. |

---

## 8. Cross-references

| Topic | Document |
|---|---|
| Entities, cardinalities, key derivation as integrity | [`ER_Diagram.md`](ER_Diagram.md) |
| Key/value layouts, MBR arithmetic, capacity, the no-migration constraint | [`Database_Design.md`](Database_Design.md) |
| Field-level types, the `action` enumeration drift, env vars | [`Data_Dictionary.md`](Data_Dictionary.md) |
| Public readability, the reproduced box key, S-1's enabler | [`Data_Flow.md`](Data_Flow.md) |
| The ABI as a public interface, all 13 methods with selectors | [`../05_API/API_Documentation.md`](../05_API/API_Documentation.md) |
| S-1, C-1 and their consequences for any consumer of this data | [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md) |
