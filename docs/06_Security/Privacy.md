# MedRail — Privacy Analysis

**Purpose:** state exactly what personal data MedRail does and does not process today, analyse the irreducible tension between an immutable public ledger and modern data-protection expectations, and set out what a production version handling real health data would have to build.

**Status of this document:** authored 2026-08-21 against commit `32ffd73`, verified against source and the deployed TestNet contract (App ID `768743428`). It is a **design analysis**, not a compliance assessment, a Data Protection Impact Assessment, a legal opinion, or a certification. **MedRail is not HIPAA-compliant, not GDPR-compliant, not SOC 2 audited, and not ISO 27001 certified.** No compliance work of any kind has been performed on this system, and no such work is claimed anywhere in this document. Where regulatory concepts appear, they are used as *analytical frames* for evaluating an architecture, clearly labelled as such — never as assertions of conformance.

---

## 1. The single most important fact

**There is no real patient data in this system. There never has been. Nothing in MedRail today stores, encrypts, transmits, or protects real health information — because there is none.**

The consent-gated endpoint returns one hard-coded object, identical for every caller and every `patientId`:

```ts
// api/src/routes/records.ts:15-21
const SYNTHETIC_RECORD = {
  bloodType: "O+",
  allergies: ["penicillin"],
  chronicConditions: ["type 2 diabetes (controlled)"],
  currentMedications: ["metformin 500mg", "lisinopril 10mg"],
  lastUpdated: "2026-01-15",
};
```

`patientId` is accepted, validated for length, used to select which on-chain consent grant to check, echoed back in the response — and **never used to look up anything**, because there is nothing to look up. There is no database, no patient store, no file of records, no cache, and no ORM anywhere in this repository. `DATA-004` is **IMPLEMENTED**: the payload is synthetic and patient-independent by construction, not by policy.

Every response from this endpoint also says so in its own body (`api/src/routes/records.ts:59`):

> `"Synthetic demo data for the Global x402 Challenge — no real patient information exists in this system."`

`docs/SECURITY.md:7-14` opens with the same statement. That honesty is retained here, and it is the frame for everything below: **this document analyses a privacy architecture, it does not attest to the protection of data that does not exist.**

### 1.1 What this means for how the rest of this document should be read

Two very different questions get conflated in privacy write-ups for projects like this, and separating them is the whole job:

| Question | Answer today |
|---|---|
| *Is real patient health data protected in MedRail?* | The question does not arise. There is none. |
| *Would this architecture protect real patient health data if it existed?* | **Not as built.** The consent gate is defeated (finding S-1 / T-01), the audit log records claims rather than facts (T-02), no encryption pipeline exists (`DATA-006` **PLANNED**), and consent relationships are permanently public (§3). |

Everything in §5 is marked **RECOMMENDED / NOT IMPLEMENTED** because it answers the second question, not the first.

### 1.2 Personal data that *is* processed today

Not "none". Three categories, all real:

| Category | Data | Where | Personal data? |
|---|---|---|---|
| **Blockchain identifiers** | Algorand addresses (patient, requester, operator, `payTo`) | Public ledger, permanently; API request bodies; API responses | **Yes — pseudonymous.** A public-key identifier is a pseudonymous identifier, not anonymous data. Pseudonymisation reduces risk; it does not remove data from scope. |
| **Relationship metadata** | *That* address A granted address B access to scope S at time T, and whether it was later revoked | Public ledger, permanently | **Yes.** The relationship is the sensitive part — see §3.2. |
| **Caller-supplied free text** | `symptoms` (up to 2000 chars), `medications` (up to 20 items) | **In-memory only, for the duration of one request.** Never written to disk, never logged, never sent on-chain (`AI-007` **IMPLEMENTED**). | **Potentially — health data.** A caller can type anything into `symptoms`, including real symptoms about a real person. |

The third category deserves a blunt note. `POST /v1/triage` accepts arbitrary free text and a user may well type genuine clinical information into a public demo. MedRail's handling of it is, by accident of minimalism, close to ideal: `scoreTriage` is a pure function, the string is never persisted, never logged (there is no application logging at all — `OPS-002` **NOT IMPLEMENTED**), and never leaves the process. It exists in memory for the duration of one HTTP request and is then garbage-collected.

That is a genuine privacy property and it is worth crediting: **the safest place for sensitive free text is nowhere, and MedRail puts it nowhere.** It is a consequence of having no datastore rather than a designed control, but the outcome is the same. The one caveat is TLS in transit, which depends on `force_https` (`api/fly.toml:16`) being honoured at the edge on a deployment that has not yet happened.

---

## 2. What touches the public ledger — exhaustive

Everything below is written to Algorand and is **public and permanent**. This list is complete; it was derived by reading every write path in the contract.

### 2.1 What IS on-chain

| Item | Type / size | Written by | Source |
|---|---|---|---|
| Patient address | 32-byte public key (as `Txn.sender`) | `grant_access`, `revoke_access` | `contract.py:151, 181` |
| Requester address | 32-byte public key (ABI arg, cleartext) | `grant_access`, `revoke_access`, `request_access` | `contract.py:149, 179, 141` |
| Grant box key | 32-byte SHA-256 of `patient ‖ requester ‖ scope` | `grant_access` | `contract.py:96-98` |
| Grant status | 1 byte — `0` none / `1` granted / `2` revoked | `grant_access`, `revoke_access` | `contract.py:46-48, 161-165` |
| `granted_at` | uint64 Unix timestamp | `grant_access` | `contract.py:163` |
| `expires_at` | uint64 Unix timestamp (`0` = never) | `grant_access` | `contract.py:164` |
| Audit `ts` | uint64 Unix timestamp | `log_access` | `contract.py:229` |
| Audit `requester` | 32-byte address, cleartext | `log_access` | `contract.py:230` |
| Audit `scope` / `endpoint` / `action` | ARC-4 strings — **constants in this build**: `"records:summary"`, `"/v1/records/summary"`, `"consent_checked"` \| `"consent_denied"` | `log_access` | `api/src/routes/records.ts:10-11, 37, 49` |
| Global counters | 4 uint64s: requests, active grants, revocations, audit entries | all mutating methods | `contract.py:109-112` |
| ARC-28 events | `AccessRequested`, `AccessGranted`, `AccessRevoked` — addresses + scope | `arc4.emit` | `contract.py:146, 169-176, 195` |
| Admin address | 32-byte address in global state | `create`, `set_admin` | `contract.py:121, 127` |
| Payment transactions | Sender, receiver, USDC amount, asset id, note `x402-payment-v2-<ms>` | the facilitator | tx `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ` |

**Total on-chain footprint today:** 2 grant boxes, 100 box bytes, and **zero audit entries** — `total_audit_entries == 5` on App `768743428`, verified live. `log_access` has never executed on TestNet (evidence gap **E-1**).

### 2.2 What is NEVER on-chain

Verified by reading every `arc4.emit`, every box write, and every ABI argument the API passes:

- No patient name, date of birth, national identifier, address, phone number, or email
- No diagnosis, condition, ICD code, or clinical finding
- No free-text symptoms — the `symptoms` string from `/v1/triage` reaches no ledger write path
- No medication list — the `medications` array from `/v1/interaction-check` reaches no ledger write path
- No triage score, band, or matched red flags
- No interaction-check result
- **None of the `SYNTHETIC_RECORD` fields**, synthetic though they are
- No IP address, user agent, session identifier, or device fingerprint (none is collected at all)

`SEC-004` and `AI-007` are both **IMPLEMENTED**. The only free-text strings that ever reach the ledger are the three route constants at `api/src/routes/records.ts:10-11` and the literals `"consent_checked"` / `"consent_denied"` at `:37, :49`.

**This is the single most consequential privacy decision in the design, and it was made correctly.** Everything on Algorand is public and permanent; a system that put clinical content there — even encrypted — would be making an irreversible bet on a cipher. MedRail put references and metadata there and nothing else. `docs/SECURITY.md:16-25` states this accurately.

### 2.3 The design contains one latent hazard worth naming

`scope`, `endpoint`, and `action` are **free-form ARC-4 strings** (`DATA-003` — deliberately, so new endpoints need no contract change), and `log_access` writes whatever it is given. Today the API passes only constants. Nothing in the contract prevents a future caller — or a compromised admin key (T-03) — from writing arbitrary free text into a permanent public box under a patient's address.

The control that keeps clinical text off-chain today is therefore **the API's discipline, not the contract's design**. That is fine now and is a real constraint on any future feature. `AI-007` should be treated as an invariant to be tested, not a property to be assumed.

---

## 3. The permanent public ledger — analysis of the tension

This section analyses a genuine, unresolvable architectural tension. It is **not** a compliance assessment and reaches no compliance conclusion.

### 3.1 The three properties, stated plainly

Algorand, like every public blockchain, provides:

1. **Publicity.** Every transaction, every box, and every global-state value is readable by anyone, without permission, without cost, and without leaving a trace. The reviewer read App `768743428`'s complete state and transaction history from `https://testnet-idx.algonode.cloud` with no credentials.
2. **Permanence.** Nothing can be deleted. No contract method deletes a grant box or an audit entry — `revoke_access` sets `status = STATUS_REVOKED` and leaves the box in place (`contract.py:186-190`), which is deliberate and correct for auditability. There is no `boxDelete` anywhere in `contract.py`.
3. **Retroactivity.** Archival nodes and indexers retain history indefinitely. Data written today is readable in a decade, by parties who do not exist yet, under laws not yet written.

These are the properties that make the audit log *credible*. They are the same properties that make it *unerasable*. **This is a genuine trade, not an oversight, and it cannot be engineered away — only designed around.**

### 3.2 Consequences, concretely

**(a) Consent relationships are publicly observable, in cleartext.** The grant *box key* is a SHA-256 digest (`contract.py:96-98`), which conceals the triple from someone browsing box names. The *transaction that created it* is not hashed: the patient is `Txn.sender` and the requester is ABI argument 0, both plainly readable. Anyone can query the indexer for calls to App `768743428` with selector `8c3ad539` and enumerate every `(patient, requester, scope)` relationship the app has ever contained.

Hashing the box key is still worth doing — it gives fixed-length keys and prevents enumeration by box listing — but it must not be described as privacy. **The relationship is public because the transaction is public.**

**(b) The relationship metadata is itself sensitive, independent of any record contents.** "Patient X granted `oncology:records` access to Clinic Y on 4 March, and revoked it on 11 March" reveals a great deal without revealing a single clinical fact: that a relationship existed, what specialty it concerned, when it started, and that it ended abruptly. In a production system where `scope` names a specialty and requester addresses are identifiable organisations, the graph of who requested whose records **is** the medical history, at low resolution.

This is threat **T-21**, rated MEDIUM as-built and HIGH in production, and it is **NOT MITIGATED** because for on-chain data it is not mitigable.

**(c) A revoked grant leaves a permanent record that it existed.** Revocation changes a status byte. The `granted_at` timestamp survives, the box survives, the original `grant_access` transaction survives, and the `AccessGranted` and `AccessRevoked` events both survive. **Withdrawing consent stops future access; it does not and cannot un-publish the fact that consent was once given.** A patient who grants and immediately revokes has published a permanent record of having done so.

**(d) An audit entry can never be deleted or corrected.** `DATA-002` (append-only) is **IMPLEMENTED** and is exactly what an audit log should do. It also means a *wrong* entry is permanent. Because of finding S-1, the requester recorded is the one the caller *claimed* to be (`api/src/routes/records.ts:49`), so an impersonation permanently and unerasably attributes an access to an innocent party (**T-02**). There is no correction mechanism, no supersession record, and no annotation facility in the contract.

**(e) Address reuse compounds everything.** A single patient address used across multiple grants links all of them. Combined with any off-chain disclosure that binds that address to a person — one exchange KYC record, one public donation, one social-media post — every consent relationship that address ever entered becomes attributable, retroactively and permanently.

### 3.3 Mapping against data-protection expectations — as an analysis of tension

The frames below are used because they are the clearest available vocabulary for these concerns, **not** because any assessment against them has been performed. No regulator has reviewed this system, no DPIA exists, and no conclusion of compliance or non-compliance is drawn.

| Expectation | The tension | Analytical verdict |
|---|---|---|
| **Right to erasure** (GDPR Art. 17) | Personal data on an immutable public ledger cannot be deleted by anyone, including its controller. Even a nominal controller with the admin key cannot erase a grant box, an audit entry, or a historical transaction. | **Irreconcilable for on-chain data.** The recognised design response is to ensure nothing on-chain *is* personal data — which is why §5's recommended architecture keeps everything off-chain except an opaque pointer. Rotating pseudonyms and destroying the off-chain data and its key ("crypto-erasure") is the closest available analogue, and whether that satisfies erasure is a live legal question this document does not attempt to answer. |
| **Data minimisation** (Art. 5(1)(c)) | Genuinely well served *for content*: only an address, a hash, a status byte, two timestamps, and three constant strings are written (§2.1). **Not** served for *metadata*: the relationship graph is published in full, in cleartext, forever, for every grant. | **Partially aligned, with a real gap on metadata.** The content minimisation is a design strength (§2.2). The metadata publication is inherent to the chosen substrate. |
| **Storage limitation** (Art. 5(1)(e)) | "Kept no longer than necessary" is structurally impossible on a permanent ledger. | **Irreconcilable for on-chain data.** Same response as erasure. |
| **Purpose limitation** (Art. 5(1)(b)) | Data published to a public ledger can be re-used by anyone for any purpose. The controller has no technical means to constrain downstream processing. | **Not enforceable by the architecture.** |
| **Integrity and confidentiality** (Art. 5(1)(f)) | Integrity: **strong** — consensus-backed, tamper-evident, append-only. Confidentiality: **absent by design** for anything on-chain. | **Split verdict.** MedRail bought integrity at the price of confidentiality and mitigated the cost by putting almost nothing on-chain. |
| **Lawful basis / consent quality** (Art. 6, 7, 9) | On-chain consent is cryptographically verifiable, patient-signed (`contract.py:151`), timestamped, optionally time-limited (`FR-019`), and revocable by the patient without asking anyone's permission. That is a genuinely strong consent record. | **A real strength of the design — undermined by S-1.** A consent record that the enforcement layer does not actually enforce (T-01) does not deliver the protection it documents. |
| **Accountability** (Art. 5(2)) | The on-chain audit log is exactly the kind of demonstrable record accountability envisages. | **Undermined twice.** It has never executed on-chain (`total_audit_entries == 5`, **E-1**), and when it does, it records claimed rather than verified identities (T-02). |
| **HIPAA Privacy / Security Rule frames** | Not applicable in any operative sense: no PHI, no covered entity, no business associate agreement, no designated privacy or security official, no workforce training, no risk analysis of record. | **Not applicable — no PHI exists.** §6 lists what would be needed. |

**The honest summary.** MedRail's privacy design gets the hard, irreversible decision right — **no clinical content on the ledger** — and leaves the metadata problem unsolved, which is the harder residual and the one that cannot be solved on-chain at all. The consent mechanism itself is well constructed and would be a genuine asset in a production system, *if* the API actually enforced it. It does not (S-1).

---

## 4. Data-subject rights against the actual architecture

An honest verdict per right, against the system as built. Note that most of these are hypothetical: with synthetic data and throwaway TestNet addresses, there is no identified data subject to exercise them.

| Right | Verdict | Analysis |
|---|---|---|
| **Access** (Art. 15) | **Partially satisfiable, and better than most systems** | On-chain data is *self-serve*: `check_access`, `get_grant`, `get_audit_count`, `get_audit_entry` are all `readonly` and callable by anyone for free (`contract.py:197, 211, 238, 242`), and `GET /v1/consent/status` exposes the same for free (`api/src/routes/consent.ts:19-31`). A patient can read their complete consent state and audit trail without asking MedRail for anything and without MedRail's cooperation. **That is a stronger access right than a subject-access request to a typical health IT vendor.** Gaps: there is no "list all my grants" query (grants are keyed by hash, so you must already know the triple), no per-patient index, and no human-readable export. And **there is nothing else to access** — no profile, no records, no logs (`OPS-002`), because none exists. |
| **Rectification** (Art. 16) | **Not satisfiable for on-chain data** | Nothing can be corrected. A grant's `granted_at` is fixed at write. An audit entry is immutable by design (`DATA-002`). If S-1 causes a false attribution (T-02), **there is no mechanism to correct it** — not by the patient, not by the operator, not by the admin key. The contract has no supersession, annotation, or correction method. This is the sharpest single consequence of combining an unauthenticated identity claim with an immutable log. Consent state itself *can* be changed forward (`revoke_access`, re-grant per `FR-022`), but that is alteration going forward, not rectification of the record. |
| **Erasure** (Art. 17) | **Not satisfiable for on-chain data. Trivially satisfiable off-chain, because there is no off-chain data.** | Nothing on Algorand can be deleted (§3.1). The API holds nothing to erase: no database, no logs, no cache, no session store, no backups (`OPS-007` is "not applicable" precisely because the only durable state is on a ledger nobody can delete). The best available analogue — destroy the off-chain content and its key, leaving an unresolvable on-chain pointer — is described in §5 and is **NOT IMPLEMENTED**. Whether crypto-erasure satisfies Art. 17 is unsettled and outside this document's competence. |
| **Portability** (Art. 20) | **Structurally excellent, practically unfinished** | Consent state is in a documented, open, machine-readable, vendor-neutral format. The ARC-56 application spec is served publicly at `GET /v1/consent/arc56` (`api/src/app.ts:63-69`, `FR-015`) specifically so third parties can build their own ABI calls without MedRail's cooperation. **A patient's consent state is portable because it was never in MedRail's custody in the first place** — it is on a public chain, readable by any client, with the schema published. That is real portability, not a vendor's export button. What is missing: no export endpoint, no standard health-data format (FHIR or otherwise), and nothing to port *besides* consent state. |
| **Objection / restriction** (Art. 18, 21) | **Satisfiable for future access; not for past processing** | `revoke_access` is self-service, patient-signed, requires no intermediary, and takes effect at the next `check_access` (`contract.py:178-195`; `FR-020` **VALIDATED**, tx `OV2J2T5VWMIQG64JYGL7JEGZKKNZNKCMNIQU6AC4PDRQYZ6ZOO5A`). Revocation is genuinely under the patient's unilateral control, which is the design's strongest privacy claim and it is true. **But:** revocation cannot un-publish the grant's existence (§3.2c); a patient who has lost their key can never revoke (**T-35**, and grants default to `duration_seconds == 0`, i.e. perpetual); and because of S-1 a revocation is only as effective as an enforcement layer that currently authorises on a self-asserted identity. |
| **Right not to be subject to automated decision-making** (Art. 22) | **Low exposure, by architecture** | The triage and interaction endpoints produce scores and flags, not decisions, and both carry a non-diagnostic disclaimer asserted by tests (`FR-009`, `AI-002` **VALIDATED**). More importantly, there is **no model** — the logic is 11 keyword rules and a 14-pair table, fully readable in source (`AI-001` **VALIDATED**), so the "meaningful information about the logic involved" that Art. 22 contemplates is simply the source file. That is an unusually strong position. The residual concern is not the algorithm but its consumers: an autonomous agent may treat `band: "routine"` as an authoritative all-clear (**T-A2**, **T-24**). |
| **Right to be informed** (Art. 13, 14) | **Not addressed** | There is no privacy notice, no notice at collection, no cookie banner (no cookies exist), no data-processing disclosure, and no controller identification anywhere in the web app or the API. `GET /` returns a service index (`api/src/app.ts:236-292`) with no privacy information. Appropriate for a synthetic-data demo; **mandatory before real data**. |

---

## 5. RECOMMENDED production privacy architecture

**Every element in this section is RECOMMENDED and NOT IMPLEMENTED. None of it exists in the repository. `DATA-006` is PLANNED, meaning documented as a design direction with no code (`docs/SECURITY.md:16-25`). Nothing here should be read as describing MedRail's current behaviour.**

The design direction is already implicit in the contract: `grants` and `audit_log` store references and metadata, never payloads (`contract.py:58-73`). The box-storage design anticipates content living elsewhere. What follows is what "elsewhere" would need to be.

### 5.1 Client-side envelope encryption — **RECOMMENDED / NOT IMPLEMENTED**

- Clinical content is encrypted **in the patient's client, before it leaves the device**, under a per-record content key (AEAD — AES-256-GCM or XChaCha20-Poly1305).
- The content key is wrapped separately for each authorised requester's public key. Granting access = publishing one wrapped key; revoking = ceasing to publish new ones and rotating the content key. **A requester's key is never derivable from the ledger.**
- **The server never holds plaintext or an unwrapped key at any point.** This is the load-bearing property: it makes the service operator technically incapable of reading patient data, which is a stronger guarantee than a policy commitment and the only one that survives operator compromise (**T-03**).
- Crypto-erasure: destroying the content key renders the ciphertext permanently unrecoverable, which is the closest available approximation to erasure for immutable storage.
- **Reality check:** none of this exists. There is no encryption code anywhere in MedRail. Building it correctly — key hierarchy, rotation on revocation, forward secrecy, recovery for a patient who loses a device — is a substantial project, not a feature.

### 5.2 Off-chain content-addressed storage — **RECOMMENDED / NOT IMPLEMENTED**

- Encrypted payloads live off-chain (IPFS, S3 with object-lock, or a dedicated encrypted store). **Only a content hash or CID goes on-chain.**
- The on-chain pointer is opaque: it identifies a ciphertext blob and reveals nothing about its content, its size class, or its subject.
- The store is deletable, which is what makes §5.1's crypto-erasure meaningful and gives the architecture *any* erasure story at all.
- **Consequence to accept honestly:** this reintroduces an off-chain component that must be secured, backed up, and audited — the very things this system currently avoids by having no datastore. Privacy here is bought with operational complexity, not for free.

### 5.3 Pseudonymous, per-relationship rotating identifiers — **RECOMMENDED / NOT IMPLEMENTED**

- A patient uses a **distinct address per requester relationship**, so on-chain grants cannot be correlated into a single patient's graph. Directly targets **T-21** and §3.2(e).
- Address rotation on a schedule, so a one-time deanonymisation does not retroactively expose the entire history.
- Off-chain, encrypted mapping from real identity to the current pseudonym set, held by the patient.
- **Honest limits:** this reduces correlation; it does not eliminate it. Timing analysis, funding-source analysis (every address needs ALGO or a fee sponsor), and requester-side correlation all remain. And it multiplies box-MBR cost (**T-14**) — every extra relationship is another ~22,500 µALGO box. Privacy costs money here, literally and measurably.

### 5.4 Scope minimisation and default expiry — **RECOMMENDED / NOT IMPLEMENTED (partly available today)**

- `scope` strings should be **opaque scope identifiers, not descriptive labels.** `"records:summary"` is harmless; `"oncology:genetic-markers"` published permanently in cleartext is not (§3.2b). An indirection table mapping opaque ids to meanings, held off-chain, costs almost nothing and removes the most sensitive metadata leak.
- **Default every grant to a finite `duration_seconds`.** The contract already supports this and it is tested (`FR-019` **VALIDATED**) — `duration_seconds == 0` means never expires, and that is the current default in practice. A bounded default makes grants self-healing, limits the window of a compromised requester, and mitigates **T-35** (a patient who loses their key can never revoke a perpetual grant, but a bounded one lapses on its own). **This is the single cheapest privacy improvement available: it is a default value, not a feature.**
- Per-field or per-category scopes rather than whole-record access.

### 5.5 What must NOT be built

Stated because the wrong instinct is common: **do not encrypt clinical data and put the ciphertext on-chain.** Permanence turns every cipher into a bet on cryptography holding for the lifetime of the data — decades, for a health record, against an adversary who can harvest now and decrypt later. Off-chain storage with an on-chain pointer is not a convenience choice; it is the only design where a key compromise is survivable.

---

## 6. Before one byte of real PHI — the checklist

Nothing on this list is optional. Every item is **NOT IMPLEMENTED** today. This is a technical and organisational prerequisite list, not a compliance certification path — legal and regulatory review is a separate exercise this document does not attempt.

### 6.1 Blocking security defects — fix before anything else

- [ ] **Bind the payer to `requesterAddress`** (finding S-1 / T-01, `SEC-007`, `FR-039`). Without this, the consent layer provides **no protection whatsoever** against a paying stranger, and every downstream privacy control is decoration. ~15 lines.
- [ ] **Fix false audit attribution** (T-02, `SEC-008`) — a consequence of the above, and the reason it cannot wait: the record is permanent.
- [ ] **Protect the operator key** commensurate with its authority (`SEC-012`): multisig or HSM, role separation (`SEC-055`), a written rotation runbook. One hot key in an environment variable must not hold audit-write authority over real health records.
- [ ] **Address checksum validation and generic error responses** (`SEC-010`, `SEC-011`).
- [ ] **Rate limiting on every public route** (`SEC-013`) — currently a free, unauthenticated consent oracle with no throttle.
- [ ] **Dependency scanning in a CI that actually runs** (`SEC-014`, and CI-1 first — the workflow triggers on `main` while the branch is `master`).
- [ ] **`.dockerignore`** so live mnemonics stop entering the Docker build context (`SEC-015`).

### 6.2 Privacy architecture — §5 in full

- [ ] Client-side envelope encryption; the server must be technically incapable of reading plaintext (§5.1).
- [ ] Off-chain content-addressed storage; only opaque pointers on-chain (§5.2, `DATA-006`).
- [ ] Per-relationship rotating pseudonymous identifiers (§5.3, `SEC-056`).
- [ ] Opaque scope identifiers; bounded default grant duration (§5.4).
- [ ] A documented, tested key-recovery path for a patient who loses their device — **without** which §5.1 converts every device loss into permanent loss of the patient's own records (**T-35**).

### 6.3 Data governance — none of this exists

- [ ] Named data controller and, where applicable, processor; documented roles.
- [ ] A **Data Protection Impact Assessment**. This document is an input to one; it is not one.
- [ ] Records of processing activities.
- [ ] A privacy notice, presented before collection, in the web app and at the API (`GET /` currently returns a service index with no privacy information).
- [ ] Lawful basis established for each processing purpose, including the Art. 9 condition for health data.
- [ ] Retention and deletion schedules for every off-chain store.
- [ ] Data-subject-request procedures with defined response times and an owner.
- [ ] Sub-processor register and agreements — note that **GoPlausible and AlgoNode are third parties in the data path today** (a settlement payload and a `(patient, requester, scope)` triple respectively), with no contract, no DPA, and no assessment.
- [ ] Cross-border transfer analysis — a public blockchain is replicated globally by definition, and this is not a solved question.
- [ ] Breach notification procedure. **Currently impossible to execute**: with no logging, metrics, or alerting (`OPS-002`–`OPS-005`), a breach could not be detected, scoped, or reported within any regulatory window.

### 6.4 Operational readiness

- [ ] Structured logging with request correlation ids — a prerequisite for detecting misuse of real data, and currently absent entirely (`OPS-002`).
- [ ] Audit logging of access to the off-chain store, separate from the on-chain consent log.
- [ ] Monitoring and alerting on operator balance, app-account MBR headroom, and settlement failure rate (`OPS-005`).
- [ ] Defined RPO and RTO (`OPS-008` — **never established; no targets are invented here**).
- [ ] Backup and restore for every off-chain store (`OPS-007` is currently "not applicable" only because no such store exists).
- [ ] Tests for the two highest-risk modules: **`api/src/routes/records.ts` and `api/src/services/algorand.ts` currently have zero test coverage** between them, and they carry every finding in §6.1.
- [ ] An integration test running the API against a deployed contract — and an actual on-chain `log_access` execution, since `total_audit_entries == 5` means the audit path **has never run on real infrastructure** (**E-1**).

### 6.5 Independent assurance

- [ ] External security assessment / penetration test. **None has been performed.**
- [ ] Smart-contract audit by a firm specialising in Algorand/AVM. **None has been performed.**
- [ ] Cryptographic review of the §5.1 design before implementation, not after.
- [ ] Clinical safety review of the intelligence layer — an 11-rule keyword scorer and a 14-pair interaction table have **no measured sensitivity or specificity** (`AI-005` **NOT IMPLEMENTED**), and none is claimed.

---

## 7. Summary verdict

| Question | Answer |
|---|---|
| Does MedRail process real patient health data? | **No.** One fixed synthetic constant, patient-independent (`api/src/routes/records.ts:15-21`). |
| Does MedRail process personal data at all? | **Yes** — pseudonymous blockchain addresses and consent relationship metadata, both permanently public; plus caller-supplied free text held in memory for one request and never persisted. |
| Is any clinical content on the ledger? | **No.** Verified against every write path (§2.2). This is the design's strongest privacy decision. |
| Can on-chain data be erased? | **No.** By design, irreversibly, for anyone including the operator. |
| Are consent relationships private? | **No.** Every grant publicly and permanently reveals `(patient, requester, scope)` (**T-21**). The hashed box key does not change this — the transaction is cleartext. |
| Does the consent mechanism protect access today? | **No.** Finding S-1 / **T-01**: the consent gate authorises against a caller-asserted identity. The mechanism is sound; its enforcement is defeated. |
| Is MedRail HIPAA / GDPR compliant, or audited? | **No, to all.** No compliance work of any kind has been performed. No such claim is made anywhere in this repository. |
| Would this architecture protect real PHI as built? | **No.** §6 lists what would first be required — and §6.1 alone is blocking. |
| Is the *direction* sound? | **Yes, with one blocking defect.** Patient-signed consent, no key custody by the backend, no clinical content on-chain, and no datastore to breach are genuinely good foundations. They are undermined by an enforcement layer that does not check who is asking. |

---

## 8. Sources

- Repository at commit `32ffd73`, branch `master`; all `path:line` citations verified by direct read.
- App ID **768743428**, Algorand **TestNet**. Live state read from `https://testnet-idx.algonode.cloud` on 2026-08-21: 2 grant boxes, 100 box bytes, `total_audit_entries = 5`.
- Consent lifecycle transactions: `5XIADMCGFP5I7H7AS656RXZS7MFEEPCVJGLA7T3SVE6XDEYSGFFA` (request), `X2BQ5FD4MW52B75WQGDB67TEULYLN7FHVFO6ZOBNI74PNCAKVOUA` (grant), `OV2J2T5VWMIQG64JYGL7JEGZKKNZNKCMNIQU6AC4PDRQYZ6ZOO5A` (revoke).
- `docs/SECURITY.md:7-25` — the existing, accurate statement that no real patient data exists and that the encryption architecture describes a design rather than a deployed control. Independently re-verified; it holds.
- Companion documents: `Security_Architecture.md` (control-by-control status), `Threat_Model.md` (T-01, T-02, T-21, T-35 in full), `Risk_Register.md`.

**Final restatement, because it is the claim most likely to be misread:** MedRail makes **no** compliance claim. It is not HIPAA-compliant, not GDPR-compliant, not SOC 2 audited, and not ISO 27001 certified. It handles no protected health information. Every element of §5 is **RECOMMENDED** and **NOT IMPLEMENTED**. This document analyses an architecture; it certifies nothing.
