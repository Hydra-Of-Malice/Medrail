# Data Layer Design — Algorand Box Storage as the System of Record

**Purpose:** specify, structure by structure, the only durable state MedRail has — Algorand global state and three box maps on App ID `768743428`, plus two static reference datasets compiled into the API image — including exact key bytes, exact value encodings, mutability, write authority, minimum-balance cost, lifecycle, capacity limits, and the absence of any migration path.

**Status of this document:** **IMPLEMENTED** and, since the audit path has now executed against App `768743428`, **validated against the live TestNet ledger on both the `grants` path and the `audit_seq` / `audit_log` path** (see §2.0). Encoding and size figures for `AuditEntry` remain derived from `contract.py`, the compiled TEAL and the ARC-4 rules rather than from a decoded box, and are labelled where that matters. Defect **C-2** in §6 is confirmed by three independent on-chain measurements.

---

## 0. Scope and an explicit disclaimer

**MedRail has no database.** This section exists because "Database Design" is a document a reviewer expects to find, and the honest content of that document for this system is a specification of on-chain storage. Concretely, the following do **not** exist anywhere in the repository and are not omitted by accident:

| Absent | Checked |
|---|---|
| Relational database (Postgres/MySQL/SQLite) | no driver, no connection string, no DDL in `api/`, `web/` or `contracts/` |
| Document store / key-value cache (Mongo, Redis, DynamoDB) | no client dependency in `api/package.json` |
| ORM or query builder (Prisma, TypeORM, Drizzle, SQLAlchemy) | no dependency, no schema file |
| Migration tool or migration directory | none; and see §8, where the absence is a *structural* fact, not an oversight |
| Message queue, background worker, cron | none |
| Object storage / blob store | none; DATA-006 (encrypted off-chain payloads with on-chain pointers) is **PLANNED**, with no code |
| Server-side session or user table | none — NFR-001, **IMPLEMENTED** |

The durable state is exhaustively enumerated in §1 and §7. If a structure is not listed there, MedRail does not persist it.

---

## 1. Inventory of durable structures

| # | Structure | Location | Kind | Instances live on TestNet | Writable by |
|---|---|---|---|---|---|
| S1 | Application global state | App `768743428` | 4 × uint64 + 1 × byteslice | 1 (the app) | contract methods only |
| S2 | `grants` BoxMap | App `768743428` boxes, prefix `0x67` | fixed-size 33 B key → 17 B value | **6** | `grant_access`, `revoke_access` |
| S3 | `audit_seq` BoxMap | App `768743428` boxes, prefix `0x73` | fixed-size 33 B key → 8 B value | **1** | `log_access` |
| S4 | `audit_log` BoxMap | App `768743428` boxes, prefix `0x61` | fixed 41 B key → variable value | **5** | `log_access` |
| S5 | `interactions.json` | `api/src/data/interactions.json` | static JSON, 14 rows | 1 file | nobody at runtime |
| S6 | `SYNTHETIC_RECORD` | `api/src/routes/records.ts:17-23` | TypeScript `const` | 1 object | nobody, ever |

### 1.1 The application itself is immutable

Verified from the compiled approval program, `contracts/artifacts/MedRailConsent.approval.teal:33-36`:

```teal
txn OnCompletion
!
assert
```

The program asserts `OnCompletion == 0` (`NoOp`) for **every** call, before routing. There is no method declaring `UpdateApplication` or `DeleteApplication`, and `MedRailConsent.arc56.json:497-500` shows `bareActions: {create: [], call: []}`. Therefore:

- The approval program of App `768743428` **cannot be updated**.
- The application **cannot be deleted**.
- No account can opt in, close out, or clear state against it.

This is a genuine architectural property with real consequences, developed in §8.

---

## 2. S1 — Application global state

### 2.0 Live values, read from algod on 2026-08-21

```
GET https://testnet-api.algonode.cloud/v2/applications/768743428
schema: {"num-uint": 4, "num-byte-slice": 1}

admin                = 2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE
total_requests       = 2
total_grants_active  = 4
total_revocations    = 2
total_audit_entries  = 5

boxes: 6 with prefix 'g', 1 with prefix 's', 5 with prefix 'a'   (12 total)
```

> **Evidence gap E-1 is closed.** `total_audit_entries = 5`, one `s`-prefixed box and five `a`-prefixed boxes now exist. **`log_access` has executed on Algorand TestNet**, and `api/scripts/e2e-consent-proof.ts` reproduces the whole grant → check → paid call → audit append sequence on demand.
>
> The encoding specified in §5 from `contract.py` and the ARC-4 rules is now **confirmed by observation**. All five live audit boxes decode to exactly **101 bytes** — head 46, tail offsets `46 / 63 / 84` — carrying `scope = "records:summary"`, `endpoint = "/v1/records/summary"`, `action = "consent_checked"`, with sequences `1..5` dense for a single patient. That is the predicted layout, byte for byte, and the predicted 101-byte figure for the `consent_checked` triple (§5.4). The derivation and the ledger agree.

### 2.1 Schema

Declared at `contract.py:108-112`. Global keys are plain AVM strings (not ARC-4 encoded, not hashed).

| Key (UTF-8) | Base64 (from ARC-56 `state.keys.global`) | AVM type | Bytes | Purpose | Written by | Initial value |
|---|---|---|---|---|---|---|
| `admin` | `YWRtaW4=` | byteslice, 32 B | 32 | The account permitted to call `log_access`, `set_admin`, `withdraw_excess`. Stored as the raw 32-byte public key, not the 58-char address. | `create` (`contract.py:121`), `set_admin` (`contract.py:127`) | `Txn.sender` at creation |
| `total_requests` | `dG90YWxfcmVxdWVzdHM=` | uint64 | 8 | Monotonic count of `request_access` calls. Pure telemetry. | `request_access` (`contract.py:145`) | `0` |
| `total_grants_active` | `dG90YWxfZ3JhbnRzX2FjdGl2ZQ==` | uint64 | 8 | Count of grant boxes currently in `STATUS_GRANTED`. Increments only when a grant transitions *into* active; decrements on revoke of an active grant. | `grant_access` (`contract.py:167`), `revoke_access` (`contract.py:192`) | `0` |
| `total_revocations` | `dG90YWxfcmV2b2NhdGlvbnM=` | uint64 | 8 | Monotonic count of revocations of previously-active grants. | `revoke_access` (`contract.py:193`) | `0` |
| `total_audit_entries` | `dG90YWxfYXVkaXRfZW50cmllcw==` | uint64 | 8 | Monotonic count of audit entries written across all patients. | `log_access` (`contract.py:235`) | `0` |

The ARC-56 declares `keyType: "AVMString"` for all five and `valueType: "address"` for `admin`, `"AVMUint64"` for the four counters (`MedRailConsent.arc56.json:444-471`).

### 2.2 The counter invariant, and why it is subtle

`grant_access` does not increment `total_grants_active` when the box already exists in `STATUS_GRANTED`. It keys off prior **status**, not prior **existence** (`contract.py:157-167`):

```python
was_active_before = False
if self.grants.maybe(key)[1]:
    was_active_before = self.grants.maybe(key)[0].status == arc4.UInt8(STATUS_GRANTED)
...
if not was_active_before:
    self.total_grants_active.value += 1
```

This is correct and deliberate — a box survives revocation, so "does the box exist" and "is it already counted" are different questions. FR-022, **VALIDATED** by `test_consent.py::test_regrant_after_revoke_reactivates`. The live ledger is consistent with it: 2 boxes exist, both `status = 2`, and `total_grants_active = 0`.

### 2.3 Known limits of these counters

- They are **global**, not per-patient. `total_grants_active` cannot answer "how many grants does patient X hold" — see [`Indexing_And_Query_Strategy.md`](Indexing_And_Query_Strategy.md) §3.
- `total_requests` counts calls, and `request_access` **persists nothing else at all** (`contract.py:141-146`) — it increments a counter and emits an event. It is the only method in the contract that writes no box.
- `total_grants_active` can never exceed the number of grant boxes, but the contract does not enforce that; it is an emergent property of the two write sites.
- Global state cannot underflow silently: `total_grants_active.value -= 1` on `contract.py:192` is guarded by `if was_active` and by the `assert self.grants.maybe(key)[1]` at `contract.py:182`, so the decrement is only reachable for a box that was genuinely active. AVM uint64 subtraction below zero would panic, which is the desired failure mode.

### 2.4 Global state MBR

Global state is charged to the **creator** account at application creation, not to the app account, and is not a recurring cost. The schema (`4 uints, 1 byteslice`) is fixed at creation and — because the app cannot be updated (§1.1) — **can never be changed**. Adding a sixth global key would require deploying a new application with a new App ID.

---

## 3. S2 — `grants` BoxMap

**Purpose.** The consent state machine. One box per `(patient, requester, scope)` triple, holding whether that triple is currently authorised and until when. This is the single structure that `check_access` consults, and therefore the single structure that gates `POST /v1/records/summary`.

**Declaration.** `contract.py:114` — `self.grants = BoxMap(Bytes, GrantRecord, key_prefix="g")`.

### 3.1 Key construction — exact bytes

| Offset | Length | Content | Source |
|---|---|---|---|
| 0 | 1 | `0x67` — ASCII `g`, the `BoxMap` `key_prefix` | `contract.py:114`; ARC-56 `state.maps.box.grants.prefix = "Zw=="` |
| 1 | 32 | `sha256( patient.bytes ‖ requester.bytes ‖ scope.bytes )` | `contract.py:96-98` (`grant_key` subroutine) |
| | **33** | **total key length** | live: every box name returned by algod is 33 bytes |

- `patient.bytes` and `requester.bytes` are the raw 32-byte Ed25519 public keys — **not** the 58-character base32 address, and **not** the ARC-4 `address` encoding (which happens to be identical, 32 raw bytes).
- `scope.bytes` is the raw UTF-8 of the scope string with **no length prefix**. This makes the concatenation ambiguity-free only because the two preceding fields are fixed-width; a scope-length prefix is unnecessary and correctly omitted.
- The prefix byte is prepended by `BoxMap` at the AVM level, not by `grant_key`. This is the origin of defect **C-2** (§6).

**Cross-implementation parity.** The same 33 bytes are recomputed in two other languages:

| Implementation | File | Hash API |
|---|---|---|
| Contract (canonical) | `contracts/smart_contracts/consent/contract.py:96-98` | `op.sha256` |
| Backend (Node) | `api/src/services/algorand.ts:64-69` | `node:crypto` `createHash("sha256")` |
| Frontend (browser) | `web/lib/consent.ts:26-34` | `crypto.subtle.digest("SHA-256", …)` |

NFR-011 requires these to be byte-identical, and a test now checks it. `api/test/fixtures/box-key-vectors.json` holds shared golden vectors asserted by `api/test/boxKeyParity.spec.ts` — which exercises both the Node `createHash` path and the browser `crypto.subtle` path — and by `contracts/tests/test_box_keys.py` for the Python path. All three implementations are pinned to the same fixture, so a divergence in any one of them fails a build. Status **VALIDATED**. See §9.

### 3.2 Value schema — `GrantRecord`, exactly 17 bytes

`contract.py:58-63`. All three fields are ARC-4 static types, so the encoding is a bare concatenation with no head/tail split and no offsets.

| Offset | Length | Field | ARC-4 type | Encoding |
|---|---|---|---|---|
| 0 | 1 | `status` | `arc4.UInt8` | `0` = `STATUS_NONE`, `1` = `STATUS_GRANTED`, `2` = `STATUS_REVOKED` (`contract.py:46-48`) |
| 1 | 8 | `granted_at` | `arc4.UInt64` | Unix seconds, big-endian. Set to `Global.latest_timestamp` on every `grant_access`, and **preserved verbatim** by `revoke_access` (`contract.py:188`). |
| 9 | 8 | `expires_at` | `arc4.UInt64` | Unix seconds, big-endian. **`0` is a sentinel meaning "never expires"**, not "expired at the epoch" (`contract.py:63`, `contract.py:207-208`). |
| | **17** | | | ARC-56 `returns.type` for `get_grant` is `(uint8,uint64,uint64)` |

**Live value read from the ledger, 2026-08-21:**

```
box  : ZxVGxI4HmhxwFbb0zjuPUZtVJ3E48U5Vot6SSTe/dpIb   (33 B, first byte 0x67)
value: 02 000000006a7634cd 0000000000000000            (17 B)
       └ status = 2 (REVOKED)
          └ granted_at = 1786131661 = 2026-08-07T19:41:01Z
                           └ expires_at = 0 → never expires
```

The second live box decodes identically with `granted_at = 1786131734`.

### 3.3 Mutability and write authority

| Operation | Method | Authority | Effect |
|---|---|---|---|
| Create / reactivate | `grant_access` (`contract.py:148-176`) | **`Txn.sender` *is* the patient.** The contract does not take a patient argument — it uses the signer (`contract.py:151`). SEC-003, **VALIDATED**. | Overwrites the whole 17-byte value with `status=1`, a fresh `granted_at`, and a computed `expires_at`. |
| Revoke | `revoke_access` (`contract.py:178-195`) | Same — `Txn.sender` is the patient. Asserts the box exists first (`contract.py:182`, message `"no such grant"`). | Overwrites `status` with `2`; **preserves `granted_at` and `expires_at` unchanged**. |
| Delete | — | **No method deletes a grant box.** | The box, and its MBR, persist for the lifetime of the application — which, per §1.1, is forever. |
| Read | `check_access`, `get_grant` (both `readonly=True`) | none | `check_access` returns `bool`; `get_grant` asserts existence and returns the struct. |

The value is **fully overwritten** on every write; there is no partial `box_replace` path, so no torn-write hazard exists.

### 3.4 Validity semantics

`check_access` (`contract.py:197-209`) returns `true` **iff all three hold**:

1. the box exists (`self.grants.maybe(key)[1]`);
2. `status == STATUS_GRANTED` (`1`);
3. `expires_at == 0` **or** `Global.latest_timestamp < expires_at`.

Note the strict `<`: a grant is invalid *at* its expiry second, not one second later. `Global.latest_timestamp` is the previous block's timestamp, so validity is evaluated against consensus time and not against the caller's clock. FR-019 / FR-023, **VALIDATED**.

### 3.5 MBR cost

`2_500 + 400 × (33 + 17)` = **22,500 µALGO per grant box**, charged to the application account. See §6 for the derivation and for why the contract advertises 22,100.

### 3.6 Lifecycle

```
(no box)  --grant_access-->  status=1  --revoke_access-->  status=2
              ^                                                |
              +---------------- grant_access ------------------+
                       (box reused; MBR charged once)
```

- MBR is charged **once**, at first creation. Revoke → re-grant does not charge again; the box already exists and its length is unchanged.
- `status = 0` (`STATUS_NONE`) is **never written** by any method. It exists as a named constant (`contract.py:46`) and as the semantic value of "no box", but no box ever holds it. Reviewers should not expect to find one.
- Expiry is **passive**: an expired grant's box still exists, still holds `status = 1`, and still costs 22,500 µALGO. Nothing sweeps it. `check_access` simply returns `false`.

---

## 4. S3 — `audit_seq` BoxMap

> **VALIDATED on-chain** — one instance exists on App `768743428` (§2.0).

**Purpose.** A per-patient monotonic counter, so that audit entries have a dense, gap-free sequence starting at 1 and each patient's sequence is independent of every other patient's (FR-027).

**Declaration.** `contract.py:115` — `self.audit_seq = BoxMap(Account, UInt64, key_prefix="s")`.

### 4.1 Key construction

| Offset | Length | Content |
|---|---|---|
| 0 | 1 | `0x73` — ASCII `s` (ARC-56 `prefix: "cw=="`) |
| 1 | 32 | the patient's public key, **verbatim, not hashed** |
| | **33** | total |

Because `BoxMap`'s key type is `Account` rather than `Bytes`, algopy uses `Account.bytes` directly. ARC-56 records `keyType: "address"` for this map and `keyType: "AVMBytes"` for the other two — a small but real difference that a client library will honour when decoding box names.

**Consequence:** this map is *reversible*. Anyone listing `s`-prefixed boxes recovers the exact set of patients who have ever had an access logged. `grants` does not leak this, because its key body is a digest. See [`Data_Flow.md`](Data_Flow.md) §5.

### 4.2 Value schema

8 bytes, big-endian uint64 (native `algopy.UInt64`, stored as `itob`). ARC-56: `valueType: "uint64"`.

Semantics: **the highest sequence number issued so far**, i.e. `audit_log[patient ‖ itob(n)]` exists for every `1 ≤ n ≤ audit_seq[patient]`. A missing box reads as `0` via `self.audit_seq.get(patient, default=UInt64(0))` (`contract.py:240`), which is why `get_audit_count` never asserts.

### 4.3 Mutability, authority, MBR

| Property | Value |
|---|---|
| Written by | `log_access` only (`contract.py:226`) |
| Authority | `assert Txn.sender == self.admin.value` (`contract.py:222`) — SEC-001, **VALIDATED** |
| Mutation | overwrite in place with `prior + 1`; never decremented, never deleted |
| Value size | constant 8 bytes ⇒ **MBR is charged once and never changes** |
| MBR | `2_500 + 400 × (33 + 8)` = **18,900 µALGO**, once per patient, forever |

### 4.4 Lifecycle

Created on the first `log_access` for a patient; then incremented on every subsequent one. Never deleted. `next_seq` is computed as `UInt64(1) if not existed else seq + 1` (`contract.py:225`), so sequences are 1-based, not 0-based.

---

## 5. S4 — `audit_log` BoxMap

> **VALIDATED on-chain** — five instances exist on App `768743428` (§2.0). The `auditTxId` and `auditSequence` fields documented in [`../05_API/API_Documentation.md`](../05_API/API_Documentation.md) are produced by real runs; the byte-level tail layout below is still derived from the ARC-4 rules rather than from a decoded box.

**Purpose.** The append-only, per-patient access ledger — the structure MedRail's product story rests on. One box per access event.

**Declaration.** `contract.py:116` — `self.audit_log = BoxMap(Bytes, AuditEntry, key_prefix="a")`.

### 5.1 Key construction

| Offset | Length | Content | Source |
|---|---|---|---|
| 0 | 1 | `0x61` — ASCII `a` (ARC-56 `prefix: "YQ=="`) | `contract.py:116` |
| 1 | 32 | patient public key, verbatim | `contract.py:103` (`audit_key`) |
| 33 | 8 | `itob(seq)` — big-endian uint64 | `contract.py:103` |
| | **41** | total | |

Big-endian sequence encoding is not incidental: it makes the key space **lexicographically ordered by sequence within a patient**, which is the one range-scan-shaped property this data layer has. See [`Indexing_And_Query_Strategy.md`](Indexing_And_Query_Strategy.md) §5.

### 5.2 Value schema — `AuditEntry`, variable length

`contract.py:66-73`. Two static fields inline, three dynamic strings in the tail. Head = **46 bytes**.

| Offset | Length | Field | ARC-4 type | Note |
|---|---|---|---|---|
| 0 | 8 | `ts` | `uint64` | `Global.latest_timestamp` at write |
| 8 | 32 | `requester` | `address` (`byte[32]`) | **proved against the payment signer** — see §5.5 |
| 40 | 2 | offset of `scope` | `uint16` BE | `0x002E` = 46 |
| 42 | 2 | offset of `endpoint` | `uint16` BE | |
| 44 | 2 | offset of `action` | `uint16` BE | |
| 46 | 2 + n | `scope` | `string` | uint16 length + UTF-8 |
| … | 2 + n | `endpoint` | `string` | |
| … | 2 + n | `action` | `string` | |

The 46-byte head offset is confirmed in the compiled program: `MedRailConsent.approval.teal:736` emits `pushbytes 0x002e` when constructing the `AuditEntry` tail pointers.

**Concrete size for the only strings MedRail's API writes** (`records.ts:10-11`, `records.ts:37`, `records.ts:49`):

| `action` | `scope` | `endpoint` | Value bytes | Key bytes | Box footprint |
|---|---|---|---|---|---|
| `consent_checked` (15) | `records:summary` (15) | `/v1/records/summary` (19) | 46 + 17 + 21 + 17 = **101** | 41 | **142** |
| `consent_denied` (14) | `records:summary` (15) | `/v1/records/summary` (19) | 46 + 17 + 21 + 16 = **100** | 41 | **141** |

### 5.3 Mutability and authority

| Property | Value |
|---|---|
| Written by | `log_access` only (`contract.py:228-234`) |
| Authority | **admin only** — `assert Txn.sender == self.admin.value` (`contract.py:222`). SEC-001, **VALIDATED** by `test_consent.py::test_log_access_rejects_non_admin`. |
| Mutation | **none.** No method writes an existing `audit_log` key: `log_access` always writes at `next_seq`, which by construction has never been used. DATA-002, **IMPLEMENTED**. |
| Deletion | none. No `box_del` anywhere in the contract. |
| Read | `get_audit_entry` (`readonly=True`), asserting existence with `"no such audit entry"` |

The append-only property is a *consequence of the sequence discipline*, not an explicit guard. There is no `assert not self.audit_log.maybe(key)[1]` before the write. If the sequence counter were ever wrong — the exact failure mode R6 / REL-004 describes — the write would silently overwrite an existing entry rather than fail. **Adding that one-line existence assertion would convert a silent overwrite into an atomic failure and is the cheapest available hardening of the append-only claim. Status: RECOMMENDED, not implemented.**

### 5.4 MBR cost

Because the value is variable-length, the contract deliberately does **not** hard-code an audit box MBR (comment at `contract.py:53-55`). That is correct. For MedRail's own fixed string triple:

- `consent_checked`: `2_500 + 400 × (41 + 101)` = **59,300 µALGO**
- `consent_denied`: `2_500 + 400 × (41 + 100)` = **58,900 µALGO**

Note that a *caller-supplied* `scope`/`endpoint`/`action` would change this. `log_access` is admin-only, so in practice only the MedRail backend chooses these strings, and it hard-codes them. But nothing in the contract bounds their length, so an admin can create an arbitrarily expensive box (up to the 32 KB AVM box limit — an entry with maximal strings would lock roughly `2_500 + 400 × (41 + 32768)` ≈ 13.1 ALGO). That is an admin-only self-harm, not an external attack surface, but it is worth stating.

### 5.5 The field that is not what it looks like

`requester` is written from the `requester` ABI argument, which the MedRail backend takes from `requesterAddress` in the HTTP request body. That value used to be accepted on the caller's word. It is now bound to the payment: `api/src/x402Payer.ts` decodes the verified `PAYMENT-SIGNATURE` header, recovers the address that signed the payment transaction, and `records.ts:41-51` returns **403** unless the two match — before any chain call is made. SEC-007 and SEC-008 are **IMPLEMENTED**, verified live against TestNet by `api/scripts/verify-g01-fix.ts`.

The data-layer principle is worth naming precisely, because it survives the fix: *the immutable audit log is exactly as trustworthy as its least-authenticated field*. Immutability guarantees that nobody can change what was written; it says nothing about whether what was written was true. What changed is where the guarantee comes from — the field is now authenticated at the API boundary by an unforgeable signature, rather than accepted as a claim. What has **not** changed is that the guarantee is off-chain: `log_access` is admin-only, so the contract trusts whatever its admin writes. A compromised operator key still forges entries (SEC-012). Detail in [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md).

### 5.6 Sequence prediction, the backend side

`log_access` allocates the sequence itself, atomically, inside the AVM. But the *backend* must name both boxes in the transaction's box references **before** submitting, so `api/src/services/algorand.ts:158-172` performs a read-then-write:

```ts
const currentCount = await getAuditCount(patient);   // simulate() read
const predictedSeq = currentCount + 1n;
... boxes: [ auditSeqBoxName(patient), auditLogBoxName(patient, predictedSeq) ]
```

If the prediction is wrong, the contract writes to a box the transaction did not reference and the AVM rejects the call — a **rejected transaction, not a corrupted log**. `withPatientLock` (`algorand.ts:129-138`) serialises this per patient — **within one Node process only**. REL-004 is **PARTIALLY IMPLEMENTED**: `api/fly.toml` now sets `max_machines_running = 1`, deliberately, so the in-process lock is the whole lock and the race cannot occur. Defect D-7 is closed at the cost of horizontal scale — the deployment cannot be scaled out until the sequence prediction moves off the process (G-11, open).

---

## 6. MBR economics, and defect C-2 in full

### 6.1 The formula

Algorand charges the **application account** a minimum-balance increase for each box it holds:

```
box_mbr(key, value) = 2_500 + 400 × ( len(key) + len(value) )        [µALGO]
```

`len(key)` is the length of the **complete box name as stored by the protocol**, which for an algopy `BoxMap` includes the `key_prefix`. This is the whole of the defect.

The app account also carries the ordinary base account minimum of **100,000 µALGO**. Boxes are owned by the app account, which is why `fund_mbr` exists (`contract.py:129-138`) — it lets anyone top the app account up, asserting only that the payment's receiver is the application address. It does not check the amount, does not record it, and does not require the sender to be the admin.

### 6.2 Per-structure cost

| Structure | Key len | Value len | MBR (µALGO) | Charged |
|---|---|---|---|---|
| `grants` box | 33 | 17 | **22,500** | once per `(patient, requester, scope)`, permanently |
| `audit_seq` box | 33 | 8 | **18,900** | once per patient, permanently |
| `audit_log` box (`consent_checked`) | 41 | 101 | **59,300** | once per successful access, permanently |
| `audit_log` box (`consent_denied`) | 41 | 100 | **58,900** | once per denied access, permanently |
| App account base | — | — | 100,000 | once |

### 6.3 DEFECT C-2 — `GRANT_BOX_MBR` under-reports by 400 µALGO per box

`contracts/smart_contracts/consent/contract.py:52`:

```python
GRANT_BOX_MBR = 2_500 + 400 * (32 + 17)     # = 22_100
```

The comment on line 51 says *"Grant key = 32 bytes (sha256)"*. The sha256 digest is indeed 32 bytes, but the **box key** is 33 — `BoxMap(..., key_prefix="g")` prepends `0x67`. Correct value: `2_500 + 400 × (33 + 17) = 22_500`.

**Three independent on-chain confirmations, all read on 2026-08-21:**

| # | Measurement | Value | Implication |
|---|---|---|---|
| 1 | App account `min-balance` with `total-boxes = 2` | `145000` | `145000 − 100000 = 45000 = 2 × 22500`. Not `2 × 22100 = 44200`. |
| 2 | App account `total-box-bytes` | `100` | `2 × (33 + 17) = 100`. `2 × (32 + 17)` would be `98`. |
| 3 | Box names returned by `/v2/applications/768743428/boxes` | both 33 bytes, first byte `0x67` | the prefix is part of the stored key |

**The wrong value is baked into the deployed bytecode.** The compiler constant-folded the whole method; `MedRailConsent.approval.teal:39-44`:

```teal
main_get_grant_box_mbr_route@15:
    pushbytes 0x151f7c750000000000005654
    log
```

`0x151f7c75` is the ARC-4 return prefix; `0x0000000000005654` is `22100`. So `get_grant_box_mbr()` on App `768743428` returns 22,100 and — because the application cannot be updated (§1.1) — **will return 22,100 for as long as the application exists**.

| Attribute | Assessment |
|---|---|
| Severity | **LOW** in magnitude — 400 µALGO per box, ~1.8% under-funding |
| Severity | **MEDIUM** in kind — it is an incorrect value published through a public ABI method whose docstring advertises it as *"a compile-time constant the backend can quote when sizing `fund_mbr` calls"* (`contract.py:250-251`) |
| Blast radius today | **None observed.** No code path in `api/` or `web/` calls `get_grant_box_mbr`; the app was funded with a flat 5 ALGO. A third-party integrator following the ABI would under-fund. |
| Fix | one character: `400 * (33 + 17)` |
| Fix cost | **requires a redeploy and a new App ID** — the app is not updatable |
| Requirement | FR-032 — **IMPLEMENTED (incorrect value)**; REL-006 — **PARTIALLY IMPLEMENTED** |

The contract's decision *not* to hard-code an audit-box MBR (`contract.py:53-55`) is, by contrast, correct — `AuditEntry` is variable-length and no single constant would be right. That is not a defect and should not be reported as one.

### 6.4 MBR is locked, not spent

A point that materially changes how the app account should be operated: box MBR raises the account's **minimum balance floor**. The ALGO is not consumed; it is immobilised. Since no contract method deletes a box, and the application can never be deleted, **every µALGO ever locked by a box on App `768743428` is locked permanently**. `withdraw_excess` (`contract.py:254-259`) can only move funds *above* the floor — the AVM rejects an inner payment that would breach the minimum balance — so it is not an escape hatch for MBR.

Operationally this means the app account's ALGO requirement is monotonically non-decreasing in the number of grants and audit entries ever created, and `fund_mbr` is a permanent subscription rather than a one-time setup step. There is **no monitoring or alerting on app-account headroom** (OPS-005, **NOT IMPLEMENTED**).

---

## 7. Capacity and cost model

### 7.1 Inputs (all measured, none assumed)

| Quantity | Value | Source |
|---|---|---|
| App account balance | 5,000,000 µALGO (5 ALGO) | funded by tx `KYH3H5CG2CCUPUUTJIBX47WD4RWSUV3QWTEUJQRQFYLWO5YAO3QA`, round 66088626 |
| App account base MBR | 100,000 µALGO | Algorand protocol |
| Currently locked by boxes | 450,400 µALGO (6 grants, 1 `audit_seq`, 5 `audit_log`) | `min-balance = 550400`, `total-boxes = 12`, `total-box-bytes = 1051` |
| Free headroom right now | **4,449,600 µALGO** | `5,000,000 − 550,400` |

### 7.2 Capacity of the current 5 ALGO balance

| Scenario | Formula | Capacity |
|---|---|---|
| Grant boxes only, counted from an empty app | `⌊(5,000,000 − 100,000) / 22,500⌋` | **217 grants total** |
| …of which remain fundable from today's headroom | `⌊4,449,600 / 22,500⌋` | **197 more grants** |
| Audit entries for a **new** patient, from today | `⌊(4,449,600 − 18,900) / 59,300⌋` | **74 entries** |
| First audit entry for a **new** patient | `18,900 + 59,300` | **78,200 µALGO** (0.0782 ALGO) |
| Each subsequent entry for that patient | `59,300` | **0.0593 ALGO** |
| 100 audit entries for one patient | `18,900 + 100 × 59,300 = 5,948,900` | **exceeds the current balance** — 5 ALGO cannot fund 100 accesses for a single patient |
| Mixed: `P` patients × `E` entries each | `P × (18,900 + E × 59,300) ≤ 4,449,600` | e.g. `P=10, E=7` fits (4,340,000); `P=10, E=8` does not (4,933,000) |

### 7.3 Per-call economics of `POST /v1/records/summary`

| Item | Amount | Account charged | Recoverable? |
|---|---|---|---|
| Revenue collected | 50,000 µUSDC ($0.05) | credited to `payTo` = `2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE` | n/a |
| Audit box MBR locked | 59,300 µALGO (allowed) / 58,900 (denied) | **app account** | **no** — permanent |
| First-access-per-patient extra | 18,900 µALGO | **app account** | **no** — permanent |
| `log_access` transaction fee | the network's suggested fee, fetched at `algorand.ts:156` (Algorand's protocol minimum is 1,000 µALGO) | **operator account** | no — spent |

Two distinct balances therefore drain in different ways on every paid, consent-gated call: the **app account's MBR headroom** (locked, monotonic) and the **operator account's ALGO** (spent, per transaction). Neither is monitored (G-15, open). Both are single points of failure for FR-012: if either is exhausted, `logAccess` throws. The HTTP consequence is now bounded — `records.ts:83-99` catches it and returns **200 with the record and `auditStatus: "pending"`**, so an exhausted balance costs MedRail the audit entry, not the sale; and because settlement only happens on a sub-400 response, it never cost the caller anything even before that guard existed. REL-002 is **VALIDATED**, satisfied by the SDK. But the *data-layer* problem is untouched: a `"pending"` access is permanently missing from the patient's on-chain trail unless an operator replays it, and nothing watches either balance to prevent it. This is a capacity problem before it is a code problem, and it is still open.

### 7.4 What would need to change to scale

None of these exist; all are **RECOMMENDED**.

| Lever | Effect |
|---|---|
| Shorten the constant strings (`scope`, `endpoint`, `action`) or replace them with a `uint8` enum | `action` as `uint8` saves 17 bytes ⇒ 6,800 µALGO per entry (~11%). Replacing all three with enums saves ~49 bytes ⇒ ~19,600 µALGO per entry (~33%). Costs the free-form scope property (DATA-003) — a real trade-off, not a free win. |
| Batch N accesses into one box | Amortises the 2,500 µALGO fixed component and the 41-byte key across N entries. Complicates the append-only argument. |
| Write only a digest on-chain, keep the entry off-chain | Reduces MBR to a constant, but relocates the trust anchor; and off-chain storage does not exist (DATA-006, **PLANNED**). |
| Automated `fund_mbr` top-up driven by a headroom alert | Currently no monitoring, no alert, no automation (OPS-005). |

---

## 8. Migrations — there are none, and there cannot be

This is not "we haven't got round to it". It is a structural property of the deployment.

### 8.1 What determines box layout

| Layer | Where it is fixed |
|---|---|
| Key prefixes `g`/`s`/`a` | compiled into the approval program (`approval.teal:7` bytecblock, `:701`, `:766`) |
| Key composition (`sha256`, concatenation order, `itob`) | compiled into the approval program |
| Value encodings (`GrantRecord` 17 B, `AuditEntry` head 46 B) | compiled into the approval program |
| Global state schema (4 uints, 1 byteslice) | fixed at `ApplicationCreate`, immutable by protocol |

### 8.2 Why no migration is possible

1. **The application cannot be updated.** `approval.teal:33-36` asserts `OnCompletion == 0` for every call; no method declares `UpdateApplication`. There is no way to ship a new approval program to App `768743428`.
2. **The global schema is immutable by protocol** even for an updatable app — `num-uint` and `num-byte-slice` are set at creation and cannot change.
3. **There is no box-rewrite method.** Nothing iterates boxes; the AVM cannot enumerate them from inside the program anyway.
4. Therefore any change to `GrantRecord`, to `AuditEntry`, to a key prefix, to the hash input order, or to the global schema requires **deploying a new application with a new App ID**, and the old app's boxes stay where they are, with their MBR locked, forever.

### 8.3 What a "migration" would actually look like

An off-chain, re-signature-driven re-issuance:

1. Deploy `MedRailConsent` v2 → new App ID.
2. Point `CONSENT_APP_ID` at it (`api/src/config.ts:56`) and update `contracts/artifacts/deploy_testnet.json`.
3. **Grants cannot be copied.** `grant_access` requires the patient's signature (`contract.py:151`), by design (SEC-003). Every patient must re-grant on the new app. There is no admin-side import path and adding one would destroy the property that makes the consent claim meaningful.
4. **Audit history cannot be copied faithfully.** `log_access` stamps `ts = Global.latest_timestamp` (`contract.py:229`) — the new entries would carry migration timestamps, not original ones. Copying would produce a *plausible but false* audit trail, which is worse than a gap. The honest move is to record the v1 App ID as the historical anchor and start v2 at sequence 1.
5. The old app remains readable forever (it cannot be deleted), so v1 history stays independently verifiable on chain. That is the one genuine consolation.

### 8.4 The practical implication for the current build

Defect **C-2** (§6.3) is a one-character fix in source that **cannot be shipped to App `768743428` at all**. Any correction requires a new deployment, a new App ID, a config change, and re-granting by every patient. For a hackathon submission with six grants and five audit entries, all of them the project's own, that cost is still negligible — which makes *now* the cheapest moment this defect will ever be fixable, and every audit entry written makes it slightly less so. Stated plainly because it stops being cheap the instant a grant that is not ours exists. This is the same reasoning that keeps the §5.5-era contract fixes unshipped: `deploy_testnet.py` uses `OnUpdate.AppendApp`, which mints a *new* App ID rather than upgrading in place, so any redeploy discards App `768743428`'s history.

---

## 9. S5 and S6 — the static reference datasets

These are the only two data sources that are not on chain. Neither is mutable at runtime; neither is user-specific; neither is persisted anywhere.

### 9.1 S5 — `api/src/data/interactions.json`

| Property | Value |
|---|---|
| Purpose | Reference table backing `POST /v1/interaction-check` |
| Format | JSON: `{ source: string, pairs: InteractionPair[] }` |
| Rows | **14** interaction pairs |
| Row shape | `{ drugs: [string, string], severity: "moderate" \| "major" \| "contraindicated", description: string }` (`interactionChecker.ts:7-11`) |
| Severity distribution | 8 `major`, 3 `contraindicated`, 3 `moderate` |
| Loaded | **once, synchronously, at module load** — `readFileSync` at `interactionChecker.ts:18`. Never re-read; a file edit requires a process restart. |
| Mutability at runtime | none. There is no write path, no admin endpoint, no reload. |
| Provenance | the `source` field is returned verbatim in every response and is asserted by `interactionChecker.spec.ts` (DATA-005, **VALIDATED**). It cites *"standard pharmacology references such as Lexicomp/Micromedex-class severity classifications"* — a **reference class**, not a licensed dataset. MedRail does not ship, license, or claim any commercial drug database. |
| Deployment | copied to `dist/data` by `api/Dockerfile`; the path resolution at `interactionChecker.ts:18` (`__dirname/../data`) matches |
| Known weakness | matching is unanchored bidirectional substring containment (`m.includes(a) \|\| a.includes(m)`, `interactionChecker.ts:42-43`), so a 1–2 character medication name matches many rows. AI-006, **NOT IMPLEMENTED**. |

### 9.2 S6 — `SYNTHETIC_RECORD`

| Property | Value |
|---|---|
| Purpose | The entire payload of `POST /v1/records/summary` |
| Definition | `api/src/routes/records.ts:17-23`, a module-level `const` |
| Contents | `bloodType: "O+"`, `allergies: ["penicillin"]`, `chronicConditions: ["type 2 diabetes (controlled)"]`, `currentMedications: ["metformin 500mg", "lisinopril 10mg"]`, `lastUpdated: "2026-01-15"` |
| Cardinality | **exactly one**, for all patients |
| Selected by `patientId`? | **No.** `patientId` selects which *grant* is checked (`records.ts:53`); it does not select data. `records.ts:105` returns the same constant regardless. |
| Mutability | none — it is a compile-time constant |
| Requirement | DATA-004, **IMPLEMENTED** |

**There is no patient datastore.** No table, no file, no fixture directory, no seeded records. This is disclosed in `../SECURITY.md` and must stay disclosed: the consent gate in this build protects a constant. That is worth remembering when reading any claim about the gate's strength — the gate is now a genuine authorisation check (§5.5), but nothing behind it is sensitive, so it has never been tested by an adversary with something to gain.

---

## 10. Summary table — every durable structure at a glance

| Structure | Key bytes | Value bytes | MBR (µALGO) | Writer | Auth | Deletable | Live count |
|---|---|---|---|---|---|---|---|
| Global state | n/a | 4×8 + 32 | creator-charged at create | contract methods | per-method | no | 1 |
| `grants` | 33 (`0x67` + sha256) | 17 (fixed) | 22,500 | `grant_access`, `revoke_access` | patient = `Txn.sender` | **no** | **6** |
| `audit_seq` | 33 (`0x73` + pubkey) | 8 (fixed) | 18,900 | `log_access` | admin only | **no** | **1** |
| `audit_log` | 41 (`0x61` + pubkey + itob) | 100–101 for MedRail's strings | 58,900–59,300 | `log_access` | admin only | **no** | **5** (all 101 B, `consent_checked`) |
| `interactions.json` | n/a | 14 rows | n/a | nobody at runtime | n/a | n/a | 1 file |
| `SYNTHETIC_RECORD` | n/a | 1 object | n/a | nobody | n/a | n/a | 1 const |

---

## 11. Cross-references

| Topic | Document |
|---|---|
| Entity relationships, cardinalities, and why integrity means key derivation | [`ER_Diagram.md`](ER_Diagram.md) |
| Field-by-field types, sentinels, enums, defaults and constraints | [`Data_Dictionary.md`](Data_Dictionary.md) |
| Where each value originates, what transforms it, and who can read it | [`Data_Flow.md`](Data_Flow.md) |
| Query patterns available vs. required | [`Indexing_And_Query_Strategy.md`](Indexing_And_Query_Strategy.md) |
| The ABI as a public interface, and the HTTP surface | [`../05_API/API_Documentation.md`](../05_API/API_Documentation.md) |
| Payer binding, false audit attribution, admin-key blast radius | [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md) |
