# MedRail — Data Dictionary


> **⚠ Correction notice.** Parts of this document were written against a review finding that was
> later proven wrong. Settlement in x402 v2 happens **only** on a sub-400 response, so **no error
> path in MedRail can consume a settled payment** — and consent-denied calls (HTTP 403) are **not
> charged**, contrary to `API.md`, `SECURITY.md`, and the `paidButDenied` field. The audit-sequence
> race causes a **rejected transaction**, not a corrupted log. See
> [`CORRECTIONS.md`](../CORRECTIONS.md) — it supersedes any statement here that contradicts it.

**Purpose:** the authoritative field-level reference for every value MedRail stores, transmits, or is configured by — on-chain structs, global state keys, ARC-28 event payloads, every HTTP request and response field of all 8 routes, every enumeration, and every environment variable.

**Status of this document:** **IMPLEMENTED** — every row was read from source and, where the value exists on chain, checked against App ID `768743428` on 2026-08-21. Rows describing `audit_seq` / `audit_log` / `AuditEntry` are **UNVALIDATED on-chain**: those boxes have never been created (evidence gap E-1, see [`Database_Design.md`](Database_Design.md) §2.0).

**Conventions used in every table below**

- **Nullable** — for on-chain fields this is always `no`: the AVM has no null. Absence is represented by *box absence*, never by a null field.
- **Default** — the value present when the writer does not supply one, quoting the source expression.
- **Where defined** — `path:line`, always.
- **Size** — bytes on the wire / in the box for on-chain data; JSON type for HTTP data.

---

## 1. On-chain — ARC-4 structs

### 1.1 `GrantRecord` — the consent state machine's record

Declared `contracts/smart_contracts/consent/contract.py:58-63`. ARC-56 type `(uint8,uint64,uint64)`. **Total 17 bytes**, all static, no offsets.

| Field | Type | Encoding | Size | Nullable | Default | Semantic meaning | Where defined | Constraints |
|---|---|---|---|---|---|---|---|---|
| `status` | `arc4.UInt8` | 1 raw byte at offset 0 | 1 B | no | none — always written explicitly | Current state of this `(patient, requester, scope)` consent. `0` = `STATUS_NONE`, `1` = `STATUS_GRANTED`, `2` = `STATUS_REVOKED`. | `contract.py:61`; constants `contract.py:46-48` | Only `1` and `2` are ever written. **`0` is never persisted** — it is the semantic value of "no box", not a stored state. Live chain: both existing boxes hold `2`. |
| `granted_at` | `arc4.UInt64` | big-endian uint64 at offset 1 | 8 B | no | `Global.latest_timestamp` at the moment of `grant_access` | Unix seconds when consent was most recently granted. | `contract.py:62`; written `contract.py:163` | Set on every `grant_access`, including a re-grant after revoke. **Preserved verbatim by `revoke_access`** (`contract.py:188`), so it records the last *grant*, never the revocation. Live values: `1786131661`, `1786131734`. |
| `expires_at` | `arc4.UInt64` | big-endian uint64 at offset 9 | 8 B | no | `0` when `duration_seconds == 0` | Unix second at which the grant stops being valid. | `contract.py:63`; computed `contract.py:152` | **`0` is a sentinel meaning "never expires"** — it is *not* "expired at the Unix epoch". `check_access` short-circuits on it (`contract.py:207-208`). Otherwise `= Global.latest_timestamp + duration_seconds`, and validity uses strict `<` so the grant is already invalid *at* `expires_at`. Preserved verbatim by `revoke_access`, so a revoked grant retains a stale future expiry that no reader should interpret. |

> **Sentinel subtlety worth stating twice.** `expires_at == 0` and `expires_at == <past timestamp>` are opposite meanings encoded in the same field. Any consumer that treats `expires_at` as "compare against now" without first testing for zero will invert the semantics of every permanent grant in the system. Both live boxes on App `768743428` hold `expires_at = 0`.

### 1.2 `AuditEntry` — one immutable access record

Declared `contract.py:66-73`. ARC-56 type `(uint64,address,string,string,string)`. **Head 46 bytes** (confirmed by `MedRailConsent.approval.teal:736`, `pushbytes 0x002e`), variable tail.

| Field | Type | Encoding | Size | Nullable | Default | Semantic meaning | Where defined | Constraints |
|---|---|---|---|---|---|---|---|---|
| `ts` | `arc4.UInt64` | big-endian uint64, head offset 0 | 8 B | no | `Global.latest_timestamp` | Consensus timestamp of the audit write — the previous block's time, not the API's clock. | `contract.py:69`, written `contract.py:229` | Not caller-supplied; cannot be back-dated. |
| `requester` | `arc4.Address` | 32 raw bytes, head offset 8 | 32 B | no | none | The account **claimed** to have made the access. | `contract.py:70`, written `contract.py:231` | **Caller-asserted and unauthenticated.** Taken verbatim from `requesterAddress` in the HTTP body (`api/src/routes/records.ts:7`, `:49`) with only a 58-character length check. This is finding **S-1**; SEC-007/SEC-008 **NOT IMPLEMENTED**. See [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md). |
| `scope` | `arc4.String` | 2-byte tail offset in head (`0x002E`), then uint16 length + UTF-8 | 2 + n B | no | none | Consent scope under which the access was made. | `contract.py:71` | Free-form by design (DATA-003). MedRail's backend always writes the constant `"records:summary"` (`records.ts:10`), 15 bytes ⇒ 17 encoded. No contract-side length bound. |
| `endpoint` | `arc4.String` | tail offset at head+42, uint16 length + UTF-8 | 2 + n B | no | none | The HTTP route that triggered the access. | `contract.py:72` | MedRail always writes `"/v1/records/summary"` (`records.ts:11`), 19 bytes ⇒ 21 encoded. |
| `action` | `arc4.String` | tail offset at head+44, uint16 length + UTF-8 | 2 + n B | no | none | Outcome/category of the access. | `contract.py:73` | See §3.4 — **the docstring's enumeration and the code's actual values do not agree.** |

**Total encoded size for the only values MedRail writes:** 101 B (`action = "consent_checked"`) or 100 B (`action = "consent_denied"`).

### 1.3 ARC-28 event structs

All three are emitted via `arc4.emit` and appear in ARC-56 `methods[].events`. The contract declares `arcs: [22, 28]`.

#### `AccessRequested` — `contract.py:76-79`

Event signature `AccessRequested(address,address,string)`; ARC-28 selector `0x99f094ee`. Head 66 bytes (confirmed: `approval.teal:7` bytecblock holds `0x0042` = 66, used at `:164`).

| Field | Type | Encoding | Size | Nullable | Default | Semantic meaning | Where defined | Constraints |
|---|---|---|---|---|---|---|---|---|
| `patient` | `arc4.Address` | 32 B, offset 0 | 32 B | no | none | *Declared* as the patient whose data is sought. | `contract.py:77` | **DEFECT C-1: actually receives `Txn.sender`, which is the requester** (`contract.py:146`). |
| `requester` | `arc4.Address` | 32 B, offset 32 | 32 B | no | none | *Declared* as the party asking. | `contract.py:78` | **DEFECT C-1: actually receives the `patient` ABI argument.** |
| `scope` | `arc4.String` | tail offset `0x0042` = 66 | 2 + n B | no | none | Scope being requested. | `contract.py:79` | Correct. |

> **DEFECT C-1 — the two address fields are emitted swapped.** `contract.py:146` reads
> `arc4.emit(AccessRequested(arc4.Address(Txn.sender), arc4.Address(patient), arc4.String(scope)))`.
> Per the method's own docstring `Txn.sender` is the *requester*, so the event labels the requester as `patient` and vice versa. Severity **MEDIUM**: no on-chain state is corrupted (`request_access` persists nothing), but every ARC-28 consumer of this feed receives inverted identities. Not caught by tests — `test_consent.py::test_request_access_emits_event_and_counts` asserts only that `total_requests == 1` and never inspects the payload. FR-024 is **PARTIALLY IMPLEMENTED** for exactly this reason. One-line fix: swap the two arguments.

#### `AccessGranted` — `contract.py:82-86`

Signature `AccessGranted(address,address,string,uint64)`; selector `0x4d155120`. Head 74 bytes (`approval.teal:311`, `pushbytes 0x004a` = 74).

| Field | Type | Encoding | Size | Nullable | Default | Semantic meaning | Where defined | Constraints |
|---|---|---|---|---|---|---|---|---|
| `patient` | `arc4.Address` | 32 B, offset 0 | 32 B | no | none | The granting patient. | `contract.py:83` | Correct — receives `Txn.sender` (`contract.py:171`), which *is* the patient here. |
| `requester` | `arc4.Address` | 32 B, offset 32 | 32 B | no | none | The account being authorised. | `contract.py:84` | Correct. |
| `scope` | `arc4.String` | tail offset `0x004A` = 74 | 2 + n B | no | none | Scope granted. | `contract.py:85` | Free-form. |
| `expires_at` | `arc4.UInt64` | big-endian, head offset 66 | 8 B | no | `0` | Expiry, same sentinel semantics as `GrantRecord.expires_at`. | `contract.py:86` | `0` = never expires. |

#### `AccessRevoked` — `contract.py:89-92`

Signature `AccessRevoked(address,address,string)`; selector `0x36dd8db4`. Head 66 bytes.

| Field | Type | Encoding | Size | Nullable | Default | Semantic meaning | Where defined | Constraints |
|---|---|---|---|---|---|---|---|---|
| `patient` | `arc4.Address` | 32 B | 32 B | no | none | The revoking patient. | `contract.py:90` | Correct — `Txn.sender` (`contract.py:195`). |
| `requester` | `arc4.Address` | 32 B | 32 B | no | none | Account being de-authorised. | `contract.py:91` | Correct. |
| `scope` | `arc4.String` | tail offset 66 | 2 + n B | no | none | Scope revoked. | `contract.py:92` | Free-form. |

> **Nothing in this repository consumes these events.** There is no ARC-28 subscriber, no indexer job, no webhook. They are emitted for third parties. That is what makes C-1 a real defect rather than a private inconsistency — the only consumer is by definition external.

### 1.4 Box map keys — as data

| Field | Type | Encoding | Size | Nullable | Default | Semantic meaning | Where defined | Constraints |
|---|---|---|---|---|---|---|---|---|
| `grants` key | bytes | `0x67 ‖ sha256(patient32 ‖ requester32 ‖ scopeUTF8)` | **33 B** | no | n/a | Identity of one consent triple. | `contract.py:114`, `:96-98` | One-way: the triple is **not** recoverable from the key. Prefix byte from ARC-56 `prefix: "Zw=="`. |
| `audit_seq` key | bytes | `0x73 ‖ patient32` | **33 B** | no | n/a | Identity of a patient's sequence counter. | `contract.py:115` | **Reversible** — patient recoverable verbatim. ARC-56 `keyType: "address"`, `prefix: "cw=="`. |
| `audit_seq` value | `UInt64` | big-endian `itob` | 8 B | no | `0` via `.get(patient, default=UInt64(0))` | Highest sequence number issued for this patient. | `contract.py:115`, read `:240` | 1-based; `next_seq = 1 if absent else seq + 1` (`contract.py:225`). Never decremented. |
| `audit_log` key | bytes | `0x61 ‖ patient32 ‖ itob(seq)` | **41 B** | no | n/a | Identity of one audit entry. | `contract.py:116`, `:101-103` | Big-endian `seq` makes the key space ordered by sequence within a patient. ARC-56 `prefix: "YQ=="`. |

---

## 2. On-chain — application global state

Declared `contract.py:108-112`. Schema fixed at creation: **4 uints, 1 byteslice** — immutable, because the application also cannot be updated (`approval.teal:33-36` asserts `OnCompletion == 0`).

| Field | Type | Encoding | Size | Nullable | Default | Semantic meaning | Where defined | Constraints |
|---|---|---|---|---|---|---|---|---|
| `admin` | byteslice | raw 32-byte public key; global key is the literal UTF-8 `admin`, base64 `YWRtaW4=` | 32 B | no | `Txn.sender` at `create` | The single account permitted to call `log_access`, `set_admin` and `withdraw_excess`. | `contract.py:108`; set `:121`, `:127` | Rotatable via `set_admin` without redeploy (FR-029, **VALIDATED**). Live value `2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE` — the same account as the deployer and as `payTo`. Compromise ⇒ forge audit entries + rotate admin + drain the app account (SEC-012, **NOT IMPLEMENTED**). |
| `total_requests` | uint64 | key `total_requests`, base64 `dG90YWxfcmVxdWVzdHM=` | 8 B | no | `0` | Monotonic count of `request_access` calls. | `contract.py:109`; incremented `:145` | Pure telemetry — `request_access` persists no other state. Live value **2**. |
| `total_grants_active` | uint64 | key `total_grants_active`, base64 `dG90YWxfZ3JhbnRzX2FjdGl2ZQ==` | 8 B | no | `0` | Number of grant boxes currently in `STATUS_GRANTED`. | `contract.py:110`; `+1` at `:167`, `−1` at `:192` | Increments only on a transition *into* active — keyed off prior **status**, not prior **existence** (`contract.py:157-159`). Live value **0**, consistent with both live boxes holding `status = 2`. |
| `total_revocations` | uint64 | key `total_revocations`, base64 `dG90YWxfcmV2b2NhdGlvbnM=` | 8 B | no | `0` | Monotonic count of revocations of previously-active grants. | `contract.py:111`; `:193` | Only counts revocation of an *active* grant. Live value **2**. |
| `total_audit_entries` | uint64 | key `total_audit_entries`, base64 `dG90YWxfYXVkaXRfZW50cmllcw==` | 8 B | no | `0` | Monotonic count of audit entries across all patients. | `contract.py:112`; `:235` | **Live value `0` — evidence gap E-1. `log_access` has never run on TestNet.** |

None of these five is per-patient or per-requester; none can answer a scoped question. See [`Indexing_And_Query_Strategy.md`](Indexing_And_Query_Strategy.md) §3.

---

## 3. Enumerations

### 3.1 `GrantRecord.status`

| Name | Value | Ever written? | Where |
|---|---|---|---|
| `STATUS_NONE` | `0` | **never** — represents box absence, not a stored state | `contract.py:46` |
| `STATUS_GRANTED` | `1` | yes, by `grant_access` | `contract.py:47`, `:162` |
| `STATUS_REVOKED` | `2` | yes, by `revoke_access` | `contract.py:48`, `:187` |

### 3.2 `UrgencyBand` — triage response `band`

TypeScript union `"routine" | "soon" | "urgent" | "emergency"`, `api/src/services/triageScorer.ts:9`. Assigned by `bandFor` (`triageScorer.ts:46-51`).

| Value | Condition | Note |
|---|---|---|
| `emergency` | `score >= 60` | |
| `urgent` | `score >= 30` | |
| `soon` | `score >= 10` | |
| `routine` | otherwise (including `score == 0`) | The default when no red flag matches. |

Boundaries are inclusive-lower and evaluated top-down, so the bands partition `0..100` with no gap and no overlap. FR-006, **VALIDATED** by 4 cases in `api/test/triageScorer.spec.ts`.

### 3.3 `severity` — interaction-check match severity

TypeScript union `"moderate" | "major" | "contraindicated"`, `api/src/services/interactionChecker.ts:9`. Sourced verbatim from `api/src/data/interactions.json`; **the API never computes it**.

| Value | Rows in the table | Example pair |
|---|---|---|
| `major` | 8 | `warfarin` + `aspirin` |
| `contraindicated` | 3 | `sildenafil` + `nitroglycerin` |
| `moderate` | 3 | `clopidogrel` + `omeprazole` |

There is no ordering, ranking, or numeric mapping of severity anywhere in the code. A client that wants "worst first" must impose its own order.

### 3.4 `AuditEntry.action` — declared vs. actual

This is a genuine drift between the contract's documentation and the backend's behaviour, and it matters because `action` is the only field that classifies an audit entry.

| Value | In the contract docstring (`contract.py:73`)? | Actually written by the backend? | Where |
|---|---|---|---|
| `consent_checked` | **yes** | **yes** — the allowed path | `api/src/routes/records.ts:49` |
| `consent_denied` | **no** | **yes** — the denied path | `api/src/routes/records.ts:37` |
| `open_call` | yes | **no** — never written anywhere | `contract.py:73` only |
| `granted` | yes | **no** | `contract.py:73` only |
| `revoked` | yes | **no** | `contract.py:73` only |
| `requested` | yes | **no** | `contract.py:73` only |

> **Finding.** The docstring enumerates five values; the code emits two; only one value appears in both lists. `action` is a free-form `arc4.String` with no contract-side validation, so nothing enforces either list. A consumer building a dashboard from the docstring would never render a denied access. Severity **LOW** (documentation-vs-code drift), but it directly affects anyone consuming the audit log — which is the point of the audit log. Fix: correct the docstring to `"consent_checked" | "consent_denied"`, or implement the other three.

### 3.5 `NetworkName`

`"testnet" | "mainnet"`, `api/src/config.ts:5`. Selects four derived values (§6.2). **No MainNet deployment of `MedRailConsent` exists**, so `NETWORK=mainnet` currently yields a service pointed at a network where the contract is absent (defect D-2, since `api/fly.toml` hard-codes exactly that).

---

## 4. HTTP — the 8 routes, field by field

Base URL for all examples: `http://localhost:4021`. Full endpoint semantics live in [`../05_API/API_Documentation.md`](../05_API/API_Documentation.md); this section is the field reference only.

### 4.1 `POST /v1/triage` — $0.02

**Request body** — zod schema `api/src/routes/triage.ts:5-7`.

| Field | Type | Encoding | Size | Nullable | Default | Semantic meaning | Where defined | Constraints |
|---|---|---|---|---|---|---|---|---|
| `symptoms` | `string` | JSON string, UTF-8 | 1–2000 chars | **no — required** | none | Free-text symptom description from the caller. | `triage.ts:6` | `z.string().min(1).max(2000)`. **Never persisted anywhere** — not on chain, not to disk, not to logs (AI-007). Lower-cased in memory at `triageScorer.ts:54` and discarded when the response is written. |

Unknown extra properties are **ignored**, not rejected — the schema is a plain `z.object` with no `.strict()`.

**Response body `200`** — `TriageResult`, `api/src/services/triageScorer.ts:11-16`.

| Field | Type | Encoding | Size | Nullable | Default | Semantic meaning | Where defined | Constraints |
|---|---|---|---|---|---|---|---|---|
| `score` | `number` | JSON integer | 0–100 | no | `0` when nothing matches | Sum of the weights of all matched red-flag groups, capped at 100. | `triageScorer.ts:12`, computed `:58-65` | `Math.min(100, Σ weights)`. Deterministic; identical input always yields identical output (NFR-009). Not a clinical severity measure (AI-003). |
| `band` | `UrgencyBand` | JSON string enum | — | no | `"routine"` | Bucketed urgency, §3.2. | `triageScorer.ts:13` | Derived purely from `score`. |
| `matchedFlags` | `string[]` | JSON array of labels | 0–11 items | no — may be `[]` | `[]` | Human-readable labels of the red-flag groups that matched, in table order. | `triageScorer.ts:14`, `:60` | Values are the 11 fixed `label` strings at `triageScorer.ts:33-43`: `possible cardiac chest pain` (w 35), `respiratory distress` (35), `possible stroke (FAST signs)` (40), `loss of consciousness` (30), `severe bleeding` (30), `mental health crisis` (45), `possible anaphylaxis` (40), `severe pain, unclear source` (20), `high fever` (12), `persistent vomiting` (10), `common mild symptom` (2). Matching is case-insensitive substring containment on the lower-cased input. |
| `disclaimer` | `string` | JSON string | fixed | no | the `DISCLAIMER` constant | Non-diagnostic warning, present on **every** response. | `triageScorer.ts:18-21` | Constant text; asserted by `triageScorer.spec.ts`. FR-009 / AI-002, **VALIDATED**. |

### 4.2 `POST /v1/interaction-check` — $0.02

**Request body** — `api/src/routes/interaction.ts:5-7`.

| Field | Type | Encoding | Size | Nullable | Default | Semantic meaning | Where defined | Constraints |
|---|---|---|---|---|---|---|---|---|
| `medications` | `string[]` | JSON array of strings | **2–20 items**, each ≥ 1 char | **no — required** | none | The medication list to check. | `interaction.ts:6` | `z.array(z.string().min(1)).min(2).max(20)`. Names are `trim()`-ed and lower-cased in memory (`interactionChecker.ts:32-34`) and **never persisted** (AI-007). No RxNorm/ATC normalisation, no synonym map. |

**Response body `200`** — `InteractionCheckResult`, `api/src/services/interactionChecker.ts:25-30`.

| Field | Type | Encoding | Size | Nullable | Default | Semantic meaning | Where defined | Constraints |
|---|---|---|---|---|---|---|---|---|
| `flagged` | `boolean` | JSON bool | — | no | `false` | `true` iff at least one table pair matched. | `interactionChecker.ts:26`, `:50` | Exactly `matches.length > 0`. |
| `matches` | `object[]` | JSON array | 0–14 items | no — may be `[]` | `[]` | The matched reference rows. | `interactionChecker.ts:27`, `:45` | Order follows `interactions.json` file order, **not** severity. |
| `matches[].drugs` | `[string, string]` | JSON 2-tuple | 2 items | no | none | The canonical reference names — **not** the caller's spelling. | `interactionChecker.ts:27` | Echoed verbatim from the table, so a caller who sent `"Warfarin 5mg"` sees `"warfarin"` back. |
| `matches[].severity` | enum | JSON string | — | no | none | §3.3. | `interactionChecker.ts:9` | From the table only. |
| `matches[].description` | `string` | JSON string | — | no | none | Free-text mechanism/consequence. | `interactions.json` | Verbatim from the table. |
| `source` | `string` | JSON string | fixed | no | `DATA.source` | Provenance of the reference table. | `interactionChecker.ts:52`; value at `interactions.json:2` | Present on **every** response and asserted by `interactionChecker.spec.ts` (DATA-005 / AI-004, **VALIDATED**). Names a *reference class* ("Lexicomp/Micromedex-class severity classifications"), **not** a licensed dataset. |
| `disclaimer` | `string` | JSON string | fixed | no | the `DISCLAIMER` constant | Non-diagnostic warning. | `interactionChecker.ts:20-23` | FR-009, **VALIDATED**. |

> **Matching-rule caveat (AI-006, NOT IMPLEMENTED).** `interactionChecker.ts:42-43` uses unanchored bidirectional containment: `normalized.some(m => m.includes(a) || a.includes(m))`. A one-character medication name is contained by many table entries, so `["a","b"]` produces false positives. The existing test for this input asserts only the disclaimer, so the behaviour is uncovered.

### 4.3 `POST /v1/records/summary` — $0.05 + on-chain consent

**Request body** — `api/src/routes/records.ts:5-8`.

| Field | Type | Encoding | Size | Nullable | Default | Semantic meaning | Where defined | Constraints |
|---|---|---|---|---|---|---|---|---|
| `patientId` | `string` | JSON string, base32 Algorand address | **exactly 58 chars** | **no — required** | none | Selects **which grant is checked**. | `records.ts:6` | `z.string().length(58)` — **length only, no checksum**. SEC-010 **NOT IMPLEMENTED**; a 58-char non-address produces HTTP 500 `"wrong checksum for address"` (finding R-3). **It does not select data**: `records.ts:55` returns the same `SYNTHETIC_RECORD` for every value (DATA-004). |
| `requesterAddress` | `string` | JSON string, base32 Algorand address | **exactly 58 chars** | **no — required** | none | The identity claimed to be making the request. | `records.ts:7` | Same length-only validation. **Never authenticated against the payer** — finding **S-1**, SEC-007 **NOT IMPLEMENTED**. Written verbatim into the immutable audit log (`records.ts:49` → `AuditEntry.requester`). |

**Response body `200`** (consent valid) — `records.ts:51-60`.

| Field | Type | Encoding | Size | Nullable | Default | Semantic meaning | Where defined | Constraints |
|---|---|---|---|---|---|---|---|---|
| `patientId` | `string` | echo of request | 58 | no | — | Echo. | `records.ts:52` | |
| `requesterAddress` | `string` | echo of request | 58 | no | — | Echo of the **claimed** requester. | `records.ts:53` | |
| `scope` | `string` | JSON string | fixed | no | `"records:summary"` | The scope that was checked. | `records.ts:10`, `:54` | Hard-coded constant; the client cannot choose a scope. |
| `summary` | `object` | JSON object | fixed | no | `SYNTHETIC_RECORD` | The record payload. | `records.ts:15-21`, `:55` | Identical for every patient. |
| `summary.bloodType` | `string` | JSON string | — | no | `"O+"` | — | `records.ts:16` | Constant. |
| `summary.allergies` | `string[]` | JSON array | 1 item | no | `["penicillin"]` | — | `records.ts:17` | Constant. |
| `summary.chronicConditions` | `string[]` | JSON array | 1 item | no | `["type 2 diabetes (controlled)"]` | — | `records.ts:18` | Constant. |
| `summary.currentMedications` | `string[]` | JSON array | 2 items | no | `["metformin 500mg","lisinopril 10mg"]` | — | `records.ts:19` | Constant. |
| `summary.lastUpdated` | `string` | `YYYY-MM-DD` | 10 | no | `"2026-01-15"` | — | `records.ts:20` | Constant string, not a date type, never recomputed. |
| `consentVerifiedOnChain` | `boolean` | JSON bool | — | no | `true` | Literal `true` on this path. | `records.ts:56` | Hard-coded — it is a statement that the code reached this branch, not an independently checkable proof. |
| `auditTxId` | `string` | Algorand transaction ID, base32 | 52 | no | — | The transaction that wrote the audit entry. | `records.ts:57`; produced `algorand.ts:177` | **UNVALIDATED — never produced by a real run** (E-1). Verifiable at `https://lora.algokit.io/testnet/transaction/{auditTxId}` when it exists. |
| `auditSequence` | **`string`** | **decimal string, not a JSON number** | — | no | — | The per-patient sequence number assigned by the contract. | `records.ts:58`, `.toString()`; source `algorand.ts:176` | **Returned as a string deliberately: the underlying value is a `uint64` (`bigint` in Node), which exceeds JSON's safe-integer range and is not serialisable by `JSON.stringify`.** Clients must parse it as an integer, not read it as a number. Also **UNVALIDATED** (E-1). |
| `disclaimer` | `string` | JSON string | fixed | no | constant | States the data is synthetic. | `records.ts:59` | |

**Response body `403`** (paid, consent denied) — `records.ts:38-46`.

| Field | Type | Nullable | Default | Semantic meaning | Where defined |
|---|---|---|---|---|---|
| `error` | `string` | no | `"no valid consent grant from this patient for this requester and scope"` | Reason. | `records.ts:40` |
| `patientId` | `string` | no | echo | Echo. | `records.ts:41` |
| `requesterAddress` | `string` | no | echo | Echo. | `records.ts:42` |
| `paidButDenied` | `boolean` | no | `true` | **Explicit signal that the payment settled and the caller received no record.** Deliberate: the fee covers the on-chain verification regardless of outcome (`records.ts:34-36`). | `records.ts:43` |

Note the asymmetry between the two paths: on the denied path the audit write is `.catch(() => undefined)` (`records.ts:37`), on the allowed path it is not (`records.ts:49`). That asymmetry is finding **R-2**.

### 4.4 `GET /v1/consent/status` — free

**Query parameters** — `api/src/routes/consent.ts:6-10`.

| Field | Type | Encoding | Size | Nullable | Default | Semantic meaning | Where defined | Constraints |
|---|---|---|---|---|---|---|---|---|
| `patient` | `string` | query string, base32 address | exactly 58 | **no — required** | none | Patient half of the triple. | `consent.ts:7` | Length only; R-3 applies. |
| `requester` | `string` | query string, base32 address | exactly 58 | **no — required** | none | Requester half. | `consent.ts:8` | Length only; R-3 applies. |
| `scope` | `string` | query string | ≥ 1 char | **no — required** | none | Consent scope. | `consent.ts:9` | `z.string().min(1)`. **Free-form, no whitespace trim, no case folding** (DATA-003). `"records:summary "` is a different grant from `"records:summary"` and will silently return `granted: false`. |

**Response `200`** — `consent.ts:30`.

| Field | Type | Nullable | Default | Semantic meaning | Where defined | Constraints |
|---|---|---|---|---|---|---|
| `patient` | `string` | no | echo | Echo. | `consent.ts:30` | |
| `requester` | `string` | no | echo | Echo. | `consent.ts:30` | |
| `scope` | `string` | no | echo | Echo. | `consent.ts:30` | |
| `granted` | `boolean` | no | — | Live on-chain validity, from a simulated `check_access`. | `consent.ts:29`; `algorand.ts:82-100` | `true` iff box exists **and** `status == 1` **and** (`expires_at == 0` or `now < expires_at`). Read via `AtomicTransactionComposer.simulate()` — zero fee, nothing submitted (SEC-009). **Requires `OPERATOR_MNEMONIC` to be set** even though the endpoint is free and unauthenticated, because the simulated call needs a sender and signer (`algorand.ts:8-14`). |

### 4.5 `GET /v1/consent/app-info` — free

**Response `200`** — `consent.ts:33-40`.

| Field | Type | Nullable | Default | Semantic meaning | Where defined | Constraints |
|---|---|---|---|---|---|---|
| `network` | `"testnet" \| "mainnet"` | no | `"testnet"` | Active network. | `config.ts:42`, `consent.ts:35` | From `NETWORK`. |
| `networkCaip2` | `string` | no | derived | CAIP-2 chain id used in x402 `accepts[].network`. | `config.ts:8-13` | TestNet `algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=`; MainNet `algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=`. |
| `consentAppId` | `number \| null` | **yes — `null`** | `null` when unset/zero | Deployed `MedRailConsent` App ID. | `consent.ts:37`, `config.ts:56` | `config.consentAppId || null` — so `0` surfaces as `null`, not `0`. Live: `768743428`. `web/lib/consent.ts:39` treats a falsy value as "not deployed yet". |
| `arc56SpecUrl` | `string` | no | `"/v1/consent/arc56"` | Relative path to the ARC-56 spec. | `consent.ts:38` | Hard-coded relative path; the client must resolve it against the API base. |

### 4.6 `GET /v1/consent/arc56` — free

Returns the parsed contents of `contracts/artifacts/MedRailConsent.arc56.json` verbatim (`app.ts:63-69`), or `{"error": "ARC-56 spec not found — has the contract been compiled?"}` with status `404` when the file is absent. Top-level keys of the served document: `name`, `structs`, `methods`, `arcs` (`[22, 28]`), `networks` (**empty object — the deployed App ID is *not* recorded here**), `state`, `bareActions`, `sourceInfo`.

### 4.7 `GET /v1/health` — free

**Response `200`** — `api/src/routes/health.ts:6-14`.

| Field | Type | Nullable | Default | Semantic meaning | Where defined | Constraints |
|---|---|---|---|---|---|---|
| `ok` | `boolean` | no | `true` | Liveness. | `health.ts:8` | **Always literally `true`** — it is not a dependency check. It does not probe algod, the facilitator, or the contract. A healthy `ok: true` is fully compatible with every priced endpoint returning 500 (finding R-1). |
| `service` | `string` | no | `"medrail-api"` | Service identifier. | `health.ts:9` | Fixed. |
| `network` | `"testnet" \| "mainnet"` | no | `"testnet"` | Active network. | `health.ts:10` | |
| `consentAppId` | `number \| null` | **yes** | `null` when unset | App ID. | `health.ts:11` | `config.consentAppId \|\| null`. |
| `time` | `string` | no | — | Server wall-clock at response time. | `health.ts:12` | `new Date().toISOString()` — ISO-8601 UTC with milliseconds, e.g. `2026-08-21T09:14:02.115Z`. |

### 4.8 `GET /` — free service index

**Response `200`** — `app.ts:71-84`.

| Field | Type | Nullable | Default | Semantic meaning | Where defined | Constraints |
|---|---|---|---|---|---|---|
| `service` | `string` | no | `"MedRail"` | — | `app.ts:73` | |
| `description` | `string` | no | fixed | — | `app.ts:74` | |
| `endpoints` | `string[]` | no | **5 items** | Advertised routes. | `app.ts:75-81` | **Incomplete: lists 5 of the 8 routes.** `GET /v1/consent/app-info`, `GET /v1/consent/arc56` and `GET /` itself are omitted. FR-017 is **IMPLEMENTED**, but a client that discovers MedRail through this index cannot find the ARC-56 spec that `arc56SpecUrl` points at. |
| `docs` | `string` | no | `"see repo docs/API.md"` | Pointer to documentation. | `app.ts:82` | A repo-relative hint, not a URL — not resolvable by a machine client. |

### 4.9 Shared error-response fields

Produced by four route handlers and by the global error handler.

| Field | Type | Nullable | Default | Semantic meaning | Where defined | Constraints |
|---|---|---|---|---|---|---|
| `error` | `string` | no | route-specific | Human-readable message. | `triage.ts:14`, `interaction.ts:14`, `records.ts:28`/`:40`, `consent.ts:26`, `app.ts:60`, `app.ts:66` | **No machine-readable error code exists anywhere.** Clients must match on prose. |
| `details` | `object` | only present on zod failures | — | zod `.flatten()` output. | same four route files | Shape is `{ formErrors: string[], fieldErrors: Record<string, string[]> }` — verified against the installed zod 3.25.76. Example: `{"formErrors":[],"fieldErrors":{"symptoms":["Required"]}}`. |
| `details.formErrors` | `string[]` | no | `[]` | Object-level (non-field) issues. | zod | Empty for every schema in this codebase, since none uses `.refine()` at the object level. |
| `details.fieldErrors` | `Record<string,string[]>` | no | `{}` | Per-field messages, keyed by field name. | zod | Real messages: `"Required"`, `"String must contain exactly 58 character(s)"`, `"String must contain at least 1 character(s)"`, `"Array must contain at least 2 element(s)"`. |

Full catalogue including every 500 path: [`../05_API/API_Error_Catalog.md`](../05_API/API_Error_Catalog.md).

### 4.10 x402 protocol headers

| Header | Direction | Encoding | Nullable | Semantic meaning | Where defined | Constraints |
|---|---|---|---|---|---|---|
| `PAYMENT-REQUIRED` | response, on `402` | base64 JSON | present only on 402 | The payment challenge: `x402Version`, `error`, `resource`, `accepts[]`. | emitted by `@x402/hono` middleware wired at `app.ts:37-50` | Exposed to browsers via `exposeHeaders` (`app.ts:31`). The `402` **body is `{}`** — the payload is header-only. |
| `PAYMENT-SIGNATURE` | request | base64 JSON `PaymentPayload` | optional | The signed payment presented by the client. | `@x402/core/http` | Read case-insensitively by the middleware. **MedRail's own handlers never decode it** — that omission is finding S-1. |
| `PAYMENT-RESPONSE` | response, on success | base64 JSON `SettleResponse` | present only after settlement | `{success, transaction, network, payer?, amount?, errorReason?, errorMessage?}`. | `@x402/core` | Exposed via `app.ts:31`. `transaction` is the settled ASA transfer id — e.g. `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ`. |
| `Cache-Control` | response, on `402` | `no-store` | — | Prevents caching of a challenge. | `@x402/core` | Observed on the live 402. |
| `Access-Control-Allow-Origin` | response | `*` | — | CORS. | `app.ts:23` | Wide open by design (NFR-006). |
| `Access-Control-Expose-Headers` | response | `PAYMENT-REQUIRED,PAYMENT-RESPONSE` | — | Makes the two x402 headers readable by browser JS. | `app.ts:31` | |

Field-level detail of the `accepts[]` entry — from the live capture in `../PROOF.md` and VERIFIED_FACTS §4:

| Field | Type | Value on `/v1/triage` | Origin |
|---|---|---|---|
| `scheme` | `string` | `"exact"` | `api/src/x402.ts:22` |
| `network` | `string` | `algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=` | `config.ts:11` |
| `amount` | `string` | `"20000"` (`"50000"` for `/v1/records/summary`) | derived from the `"$0.02"` price string by the scheme's money parser |
| `asset` | `string` | `"10458941"` | **fetched from the facilitator's `/supported` at startup — not from MedRail config** |
| `payTo` | `string` | `2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE` | `config.ts:53` (`PAY_TO_ADDRESS`) |
| `maxTimeoutSeconds` | `number` | `300` | SDK default |
| `extra.feePayer` | `string` | `ZMFK2OI7ZBD2U27ISERZC4S6LKM6WMFJPZQ4MYNJDZ2VNBNMBA67RA22AA` | **facilitator-supplied** — callers need USDC but not ALGO |

The last two rows are why finding **R-1** exists: `asset` and `extra.feePayer` cannot be constructed offline, so a facilitator outage makes the 402 itself unbuildable and the request 500s.

---

## 5. Static reference data

### 5.1 `api/src/data/interactions.json`

| Field | Type | Encoding | Size | Nullable | Default | Semantic meaning | Where defined | Constraints |
|---|---|---|---|---|---|---|---|---|
| `source` | `string` | JSON string | 1 value | no | — | Provenance statement, echoed into every `/v1/interaction-check` response. | `interactions.json:2` | Names a reference *class*, not a licensed product. Asserted by test (DATA-005). |
| `pairs` | `array` | JSON array | **14 items** | no | — | The reference table. | `interactions.json:3-74` | Fixed at build time; read once with `readFileSync` at `interactionChecker.ts:18`. |
| `pairs[].drugs` | `[string, string]` | JSON 2-tuple | 2 | no | — | Canonical lowercase drug names. | each row | Already lowercase in the file; `normalize()` (`interactionChecker.ts:32-34`) trims and lower-cases both sides at match time anyway. |
| `pairs[].severity` | enum | JSON string | — | no | — | §3.3. | each row | `moderate` \| `major` \| `contraindicated`. |
| `pairs[].description` | `string` | JSON string | — | no | — | Mechanism and clinical consequence. | each row | Free text; returned verbatim. |

### 5.2 `SYNTHETIC_RECORD`

Fully specified in §4.3 (response fields) — it is a TypeScript `const` at `api/src/routes/records.ts:15-21` with **exactly one instance for the whole system**, returned regardless of `patientId`. There is no patient datastore of any kind (DATA-004).

---

## 6. Configuration — every environment variable

**No secret value appears in this document.** `api/.env`, `contracts/.env` and `web/.env.local` exist on disk but are gitignored and untracked (SEC-005, **VALIDATED**).

### 6.1 API process — `api/src/config.ts`, `api/.env.example`

| Variable | Type | Encoding | Nullable | Default | Semantic meaning | Where defined | Constraints |
|---|---|---|---|---|---|---|---|
| `NETWORK` | enum | `"testnet"` \| `"mainnet"` | yes | `"testnet"` | Selects CAIP-2 id, USDC ASA id, algod and indexer URLs. | `config.ts:42` | **Not validated** — an unrecognised value silently yields `undefined` for all four derived values rather than failing fast. `api/fly.toml` hard-codes `"mainnet"` (defect D-2), for which no contract deployment exists. |
| `PORT` | number | decimal string | yes | `4021` | HTTP listen port. | `config.ts:46` | `Number(...)`; a non-numeric value becomes `NaN` with no guard. |
| `FACILITATOR_URL` | string | absolute URL | yes | `https://facilitator.goplausible.xyz` | x402 facilitator base URL. | `config.ts:47` | Contacted once at `x402ResourceServer.initialize()`. **No timeout, no retry, no cached fallback** — unreachable ⇒ HTTP 500 on all three priced routes (R-1, REL-001 **NOT IMPLEMENTED**). |
| `PAY_TO_ADDRESS` | string | 58-char base32 | yes | `OPERATOR_ADDRESS`, else `""` | Address x402 payments settle to; appears as `accepts[].payTo`. | `config.ts:53` | Live value equals the deployer/admin address, so the payee, the contract admin and the deployer are **one account**. Not validated for shape. An empty string would produce a 402 advertising an empty `payTo`. |
| `CONSENT_APP_ID` | number | decimal string | yes | `readDeployedAppId(network)`, else `0` | The `MedRailConsent` App ID. | `config.ts:56`, fallback `:31-40` | Fallback reads `../contracts/artifacts/deploy_{network}.json` **relative to `process.cwd()`**. That file is **not copied into the Docker image** (defect D-1), and `api/fly.toml` does not set the variable, so in a container `consentAppId` is `0` and `requireConsentAppId()` throws ⇒ 500 on `/v1/records/summary` and `/v1/consent/status`. NFR-004 **IMPLEMENTED (breaks in container)**. |
| `OPERATOR_MNEMONIC` | **secret** | 25-word Algorand mnemonic | yes | `""` | The contract admin key. Signs `log_access`, and is also the sender/signer for every simulated read. | `config.ts:58`; used `algorand.ts:9-13` | **Single hot key in an environment variable, simultaneously the contract admin.** Compromise ⇒ forge audit entries, rotate `set_admin`, drain the app account via `withdraw_excess`. No multisig, no HSM, no rotation runbook (SEC-012, **NOT IMPLEMENTED**). Also required by the *free, unauthenticated* `/v1/consent/status`. |
| `OPERATOR_ADDRESS` | string | 58-char base32 | yes | unset | Used **only** as the fallback for `PAY_TO_ADDRESS`. | `config.ts:53` | Never cross-checked against the address derived from `OPERATOR_MNEMONIC`; a mismatch is silent. |

### 6.2 API — derived, not settable

| Value | Type | Derived from | Where | Notes |
|---|---|---|---|---|
| `networkCaip2` | string | `NETWORK` | `config.ts:8-13, 48` | Registered as the only accepted x402 network (`x402.ts:11-14`), so a payment signed for the other network is rejected (NFR-002). |
| `usdcAssetId` | string | `NETWORK` | `config.ts:15-19, 49` | `10458941` / `31566704`. **Currently unused in the 402 path** — the advertised `asset` comes from the facilitator (§4.10). |
| `algodServer` | string | `NETWORK` | `config.ts:21-24, 50` | AlgoNode public endpoint, **no API key, no timeout, no retry** (`algorand.ts:5`; R-4, REL-003 **NOT IMPLEMENTED**). |
| `indexerServer` | string | `NETWORK` | `config.ts:26-29, 51` | Declared but **not referenced anywhere in `api/src/`** — dead configuration. |

### 6.3 Proof script — `api/scripts/e2e-proof.ts`

| Variable | Type | Nullable | Default | Semantic meaning | Where defined |
|---|---|---|---|---|---|
| `API_BASE` | string | yes | `http://localhost:4021` | Target API. | `e2e-proof.ts:24` |
| `ALGOD_URL` | string | yes | `https://testnet-api.algonode.cloud` | algod for signing. | `e2e-proof.ts:25` |
| `PROOF_MNEMONIC` | **secret** | yes | falls back to `DEPLOYER_MNEMONIC` from `contracts/.env` | Funded TestNet account that pays. | `e2e-proof.ts:26` |

### 6.4 Web client — `web/lib/config.ts`, `web/.env.example`

| Variable | Type | Nullable | Default | Semantic meaning | Where defined | Constraints |
|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_API_BASE` | string | yes | `http://localhost:4021` | API base URL. | `web/lib/config.ts:1` | `NEXT_PUBLIC_*` ⇒ **inlined into the client bundle at build time**. Never put a secret here. |
| `NEXT_PUBLIC_NETWORK` | enum | yes | `"testnet"` | Selects algod URL and explorer links. | `web/lib/config.ts:2` | Same build-time inlining. |

Derived in the browser: `ALGOD_URL` (`config.ts:4-5`), `EXPLORER_TX_URL` / `EXPLORER_ADDRESS_URL` (`:7-11`), `FUND_URL` (`:13`, TestNet dispenser).

### 6.5 Browser-side stored data

| Field | Type | Encoding | Nullable | Default | Semantic meaning | Where defined | Constraints |
|---|---|---|---|---|---|---|---|
| `medrail-demo-wallet-v1` | JSON string | `sessionStorage` value | yes | absent until first use | `{address: string, mnemonic: string}` — a throwaway TestNet keypair generated in the browser. | `web/lib/demoWallet.ts:3`, `:14-31` | **Plaintext mnemonic in `sessionStorage`.** Any XSS on the demo page exfiltrates it. Impact bounded to TestNet play money; disclosed in-code and in the UI. Cleared by `clearDemoWallet()` (`:33-35`) and by closing the tab. |

> **Doc defect DOC-4.** `web/lib/demoWallet.ts:12` says production usage goes through a real wallet "(see `lib/walletConnect.ts`)". **That file does not exist.** There is no wallet-connect integration anywhere in `web/`. The comment, and the corresponding claim in `../IMPLEMENTATION_PLAN.md` §4, overclaim.

### 6.6 Contract scripts

| Variable | Type | Nullable | Default | Semantic meaning | Where defined |
|---|---|---|---|---|---|
| `NETWORK` | enum | yes | `"testnet"` | Target network; validated and rejected if not `testnet`/`mainnet`. | `contracts/scripts/deploy_testnet.py:40-42`, `exercise_contract.py:32-34` |
| `DEPLOYER_MNEMONIC` | **secret** | **no** — `SystemExit` if missing | none | Deployer/admin key, read from `contracts/.env` via `dotenv_values`. | `deploy_testnet.py:54-57` |
| `DEPLOYER_ADDRESS` | string | yes | unset | Convenience only. | `contracts/.env` |

Note these scripts read `contracts/.env` **directly by path**, not from the process environment — so exporting `DEPLOYER_MNEMONIC` in a shell has no effect.

### 6.7 Deployment-declared variables

| Source | Variables set | Note |
|---|---|---|
| `api/fly.toml` `[env]` | `NETWORK="mainnet"`, `PORT="4021"`, `FACILITATOR_URL=…` | **`CONSENT_APP_ID` is not set** (D-1) and `NETWORK="mainnet"` targets a network with no deployed contract (D-2). |
| `.github/workflows/ci.yml` (web job) | `NEXT_PUBLIC_API_BASE=http://localhost:4021`, `NEXT_PUBLIC_NETWORK=testnet` | Build-time only. |

---

## 7. Cross-references

| Topic | Document |
|---|---|
| Entities, cardinalities, key-derivation-as-integrity | [`ER_Diagram.md`](ER_Diagram.md) |
| Key/value layouts, MBR economics, capacity, migrations | [`Database_Design.md`](Database_Design.md) |
| Provenance, retention and public visibility of each field | [`Data_Flow.md`](Data_Flow.md) |
| What can and cannot be queried | [`Indexing_And_Query_Strategy.md`](Indexing_And_Query_Strategy.md) |
| Endpoint semantics, x402 flow, ABI as public interface | [`../05_API/API_Documentation.md`](../05_API/API_Documentation.md) |
| Every error the API can emit | [`../05_API/API_Error_Catalog.md`](../05_API/API_Error_Catalog.md) |
| S-1, C-1, and the admin-key blast radius | [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md) |
