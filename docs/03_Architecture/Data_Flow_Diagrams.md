# MedRail — Data Flow Diagrams

**Purpose:** trace every data item through the system, name the trust boundary it crosses, and classify its sensitivity.

**Status of this document:** Descriptive of the working tree on branch `main`. Classic DFD notation. **The data stores shown are the complete set**: three Algorand BoxMaps, Algorand global state, two static in-process reference tables, one static artefact file served from disk, and the browser's `sessionStorage`. There is no database, cache, queue, log store, session store or object store anywhere in this system. Status labels per the project fact ledger.

Related: [`./Component_Diagram.md`](./Component_Diagram.md) · [`./Sequence_Diagrams.md`](./Sequence_Diagrams.md) · [`./LLD.md`](./LLD.md) · [`../04_Data/`](../04_Data/) · [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md) · [`../02_Requirements/SRS.md`](../02_Requirements/SRS.md)

**Notation**

| Symbol | Meaning |
|---|---|
| Rectangle | External entity — actor or external system, outside MedRail's control |
| Circle | Process — a transformation MedRail performs |
| Cylinder | Data store |
| Subgraph | Trust boundary; labels carry the boundary id from [`./System_Architecture.md`](./System_Architecture.md) §3 |

**Data-store inventory — this is the whole list**

| ID | Store | Location | Durability | Who can read it |
|---|---|---|---|---|
| **D1** | `grants` BoxMap, prefix `g` | Algorand app `768743428` | Permanent, replicated by the network | **Anyone on earth** |
| **D2** | `audit_seq` BoxMap, prefix `s` | Same | Permanent | Anyone — populated, one box per audited patient |
| **D3** | `audit_log` BoxMap, prefix `a` | Same | Permanent, append-only | Anyone — populated, `total_audit_entries = 5` |
| **D4** | Global state: `admin` + 4 counters | Same | Permanent | Anyone |
| **D5** | `api/src/data/interactions.json` | API process memory, `readFileSync` at module load | Immutable for the process lifetime | Process only; content is published in every response's `source` field |
| **D6** | `RED_FLAGS` constant array | Compiled into the API bundle | Immutable | Process only; labels are published in `matchedFlags` |
| **D7** | `contracts/artifacts/MedRailConsent.arc56.json` | Container filesystem | Immutable | Anyone, via `GET /v1/consent/arc56` — deliberately public |
| **D8** | `sessionStorage["medrail-demo-wallet-v1"]` | The visitor's browser tab | Destroyed on tab close | The tab, and any script that achieves XSS on the page |

---

## 1. Level 0 — context diagram

```mermaid
flowchart TB
    subgraph TBExt["TB-1 — public internet · nothing authenticated"]
        A1["Paying caller<br/>or autonomous agent"]
        A2["Patient<br/>holds an Algorand key"]
    end

    P0((("MedRail<br/>x402 resource server<br/>+ on-chain consent registry")))

    subgraph TBOps["Operator zone"]
        A3["MedRail operator<br/>holds OPERATOR_MNEMONIC<br/>= contract admin"]
    end

    subgraph TB2["TB-2 — third-party settlement"]
        E1["GoPlausible facilitator"]
    end

    subgraph TB34["TB-3 / TB-4 — public chain infrastructure"]
        E2["AlgoNode algod"]
        E3[("Algorand ledger<br/>D1 grants · D2 audit_seq · D3 audit_log · D4 global state<br/>WORLD-READABLE, PERMANENT")]
    end

    A1 -->|"free-text symptoms · medication list · addresses<br/>PAYMENT-SIGNATURE header"| P0
    P0 -->|"score + band + flags · interaction matches<br/>synthetic record · consent boolean · disclaimers<br/>PAYMENT-RESPONSE header"| A1

    A2 -->|"signs grant_access / revoke_access IN THE BROWSER"| E2
    P0 -->|"App ID lookup only — no key, no signature"| A2

    A3 -->|"admin mnemonic, injected as an env var"| P0

    P0 -->|"payment header for verify and settle"| E1
    E1 -->|"settlement verdict + settled tx id"| P0
    E1 -->|"submits the fee-sponsored payment group"| E2

    P0 -->|"simulate check_access — nothing submitted<br/>execute log_access — admin-signed"| E2
    E2 -->|"grant validity · audit sequence · tx id"| P0
    E2 <--> E3
```

**Reading the context.** Two data paths reach the ledger and they are deliberately separate. Consent *writes* originate in the patient's browser and never touch MedRail's process. Audit *writes* originate in MedRail's process under the operator key and never touch a patient key. The operator zone is drawn as its own boundary because `OPERATOR_MNEMONIC` is the single most valuable data item in the system — it is simultaneously the audit-writer, the admin-rotator and the fund-withdrawer (SEC-012 **NOT IMPLEMENTED**).

Note what does **not** flow into MedRail: no patient private key ever crosses any boundary into `api/src` — there is no ingress path for one (NFR-008 **IMPLEMENTED**, verified by reading every route).

---

## 2. Level 1 — major flows across all eight endpoints

```mermaid
flowchart TB
    subgraph EXT["TB-1 — untrusted"]
        CALLER["Paying caller / agent"]
        BROWSER["Browser<br/>MedRail Web"]
        PATIENT["Patient"]
        THIRD["Any third party<br/>indexer, explorer, integrator"]
    end

    subgraph APIZONE["MedRail API process — stateless · identity comes from the payment, not a session"]
        P1((("P1<br/>CORS · rate limit ·<br/>payment gate")))
        P2((("P2<br/>triage<br/>scoring")))
        P3((("P3<br/>interaction<br/>checking")))
        P4((("P4<br/>consent gate +<br/>record release")))
        P5((("P5<br/>consent<br/>status read")))
        P6((("P6<br/>audit<br/>append")))
        P8((("P8<br/>health · index ·<br/>ARC-56 spec")))
        D5[("D5 interactions.json<br/>14 pairs, read once at module load")]
        D6[("D6 RED_FLAGS<br/>11 weighted rule groups")]
        D7[("D7 MedRailConsent.arc56.json<br/>on disk")]
        SECRET{{"OPERATOR_MNEMONIC<br/>env var · admin key"}}
    end

    subgraph CLIENTZONE["Browser storage"]
        D8[("D8 sessionStorage<br/>medrail-demo-wallet-v1<br/>PLAINTEXT MNEMONIC")]
        P7((("P7<br/>browser consent<br/>signing")))
    end

    subgraph FACZONE["TB-2"]
        FAC["GoPlausible facilitator"]
    end

    subgraph CHAINZONE["TB-3 / TB-4 — public and permanent"]
        ALGOD["AlgoNode algod"]
        D1[("D1 grants — prefix g")]
        D2[("D2 audit_seq — prefix s")]
        D3[("D3 audit_log — prefix a")]
        D4[("D4 global state")]
    end

    CALLER -->|"1 · POST /v1/triage with symptoms + payment"| P1
    CALLER -->|"2 · POST /v1/interaction-check with a medication list + payment"| P1
    CALLER -->|"3 · POST /v1/records/summary with patientId and requesterAddress + payment"| P1
    CALLER -->|"4 · GET /v1/consent/status — FREE, UNAUTHENTICATED, 60/min"| P5
    CALLER -->|"5 · GET /v1/health · GET / · GET /v1/consent/app-info<br/>GET /v1/consent/arc56 — FREE"| P8
    BROWSER --> P1
    BROWSER --> P5

    P1 <-->|"PAYMENT-SIGNATURE out · settlement verdict in"| FAC
    FAC -->|"settles the USDC axfer"| ALGOD

    P1 -->|"symptom free text"| P2
    P1 -->|"medication list"| P3
    P1 -->|"addresses only + the payer recovered<br/>from PAYMENT-SIGNATURE"| P4

    D6 --> P2
    D5 --> P3
    D7 --> P8

    P2 -->|"score · band · matchedFlags · disclaimer"| CALLER
    P3 -->|"flagged · matches · source · disclaimer"| CALLER
    P8 -->|"liveness · network · App ID · ABI spec"| CALLER

    P4 -->|"check_access via simulate"| ALGOD
    P5 -->|"check_access via simulate"| ALGOD
    ALGOD --> D1
    P4 --> P6
    P6 -->|"log_access via execute, ADMIN-SIGNED"| ALGOD
    ALGOD --> D2
    ALGOD --> D3
    ALGOD --> D4
    SECRET -.->|"signs every simulate AND every execute"| P4
    SECRET -.-> P5
    SECRET -.-> P6

    P4 -->|"SYNTHETIC_RECORD + auditStatus + auditTxId + auditSequence"| CALLER
    P5 -->|"patient · requester · scope · granted boolean"| CALLER

    PATIENT --> P7
    D8 <--> P7
    P7 -->|"grant_access / revoke_access — PATIENT-SIGNED, bypasses the API"| ALGOD
    P7 -.->|"GET /v1/consent/app-info — App ID discovery only"| P8

    D1 -->|"grants are PUBLIC — patient as sender, requester as ABI arg 0"| THIRD
    D3 -->|"audit entries are PUBLIC"| THIRD
    D4 -->|"counters are PUBLIC"| THIRD
    THIRD -.->|"harvest (patient, requester) pairs — reconnaissance still works,<br/>but a harvested pair is no longer usable — see P4"| CALLER
```

**Five observations a reviewer should take from Level 1.**

1. **No flow reaches a database, because there is none.** Every persistent arrow terminates in D1–D4 on the public ledger. D5, D6 and D7 are read-only reference data loaded once and never written.
2. **`OPERATOR_MNEMONIC` fans out to three processes, including a free one.** P5 serves the free, unauthenticated `GET /v1/consent/status`, and it cannot run without the admin key, because `simulate` still requires a sender and signer (`api/src/services/algorand.ts:8-14`, `:84`). SEC-012 **NOT IMPLEMENTED**.
3. **The dotted arrow from D1 back to the caller is reconnaissance that no longer converts.** Grants are necessarily public, so the transparency that makes the consent layer auditable also publishes every `(patient, requester)` pair. What has changed is that P4 now recovers the payer from `PAYMENT-SIGNATURE` and refuses the request unless it equals the asserted `requesterAddress` — so knowing that R is authorised does not let a caller *be* R. See [`./Sequence_Diagrams.md`](./Sequence_Diagrams.md) §7.
4. **P6 has executed against the live chain.** D2 and D3 hold boxes on application `768743428` and `total_audit_entries` is 5. First live write: `4YLKLQKKWXXFW3UT5APJVYKXI7T7A6OACTAWCC5YBAN3XGOGHRVQ`.
5. **D8 holds a plaintext key in the browser.** Any XSS on the demo page exfiltrates it. Bounded to TestNet play money, disclosed in-code (`web/lib/demoWallet.ts:10-12`) and in the UI (`web/components/DemoWalletCard.tsx:74-77`).

---

## 3. Level 2 — workflow A: paid intelligence call

`POST /v1/triage` and `POST /v1/interaction-check`. **The point of this diagram is what does *not* flow.**

```mermaid
flowchart LR
    subgraph TB1["TB-1 — untrusted caller"]
        C["Caller"]
    end

    subgraph API["MedRail API process — nothing here persists"]
        direction TB
        A1((("A1<br/>CORS")))
        A2((("A2<br/>payment gate")))
        A3((("A3<br/>zod validate")))
        A4((("A4<br/>score or match")))
        A5((("A5<br/>attach disclaimer")))
        DS1[("D6 RED_FLAGS<br/>11 groups, weights 2 to 45")]
        DS2[("D5 interactions.json<br/>14 pairs + source string")]
    end

    subgraph TB2["TB-2 — facilitator"]
        F["GoPlausible"]
    end

    subgraph TB34["TB-3 / TB-4 — the public ledger"]
        L[("D1 · D2 · D3 · D4")]
        PAY["USDC axfer 20000 base units<br/>settled tx, PUBLIC"]
    end

    C -->|"d1 free-text symptoms, 1 to 2000 chars<br/>OR d2 medication list, 2 to 20 items"| A1
    C -->|"d3 PAYMENT-SIGNATURE header"| A1
    A1 --> A2
    A2 -->|"d3 forwarded verbatim"| F
    F -->|"d4 verify verdict, then settlement + settled tx id<br/>settlement only if the handler returns below 400"| A2
    F --> PAY
    A2 -->|"d1 or d2 — reaches the handler ONLY after a VERIFIED payment"| A3
    A3 -->|"validated d1 or d2"| A4
    DS1 --> A4
    DS2 --> A4
    A4 -->|"d5 score, band, matchedFlags<br/>OR d6 flagged, matches, source"| A5
    A5 -->|"d5 or d6 + d7 disclaimer + d4 PAYMENT-RESPONSE"| C

    NOFLOW["NO EDGE EXISTS FROM A3, A4 OR A5 TO ANY DATA STORE.<br/>Free-text symptoms and medication lists are never persisted,<br/>never logged and never written on-chain.<br/>AI-007 IMPLEMENTED — structurally, not by policy."]
```

**AI-007, demonstrated structurally rather than asserted.** These two endpoints touch no data store other than D5 and D6, both read-only. `scoreTriage` and `checkInteractions` are pure functions: they take a string or an array, consult a constant table, and return an object (`api/src/services/triageScorer.ts:53-73`, `api/src/services/interactionChecker.ts:36-55`). Neither imports the chain gateway; neither has a code path to `logAccess`. The free-text clinical input has **nowhere to go** — it is garbage-collected with the request. This is a structural guarantee, not a policy.

**What is public about this flow.** Only the payment: an axfer of 20000 base units of ASA `10458941` to the configured `payTo`, permanently visible — for example transaction `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ`, and `2VRBXOMH…` from a later repeat run. The payment reveals *that* someone paid MedRail $0.02 and *when*; it reveals nothing about the symptoms.

**Residual privacy exposure worth naming.** The symptoms are in the API process's memory and in TLS-terminated transit for the request's lifetime. No handler logs the request body, and the two structured log events that now exist — `audit_write_failed` and `facilitator_unavailable` — carry addresses, an endpoint constant and an error message, never caller free text. `app.onError` logs the method, path, error message and stack against a generated `requestId`, again never the body. So the absence of a PHI sink here is real but shallow: it holds because no request logging exists (OPS-002 **NOT IMPLEMENTED**), not because a redaction control enforces it. If structured request logging is ever added, that is the moment this property could silently break.

---

## 4. Level 2 — workflow B: consent-gated record access

`POST /v1/records/summary`. Every data item annotated with the boundary it crosses.

```mermaid
flowchart TB
    subgraph TB1["TB-1 — untrusted · identity is proven by the payment, not asserted"]
        C["Caller — pays, and asserts an identity<br/>the payment must corroborate"]
    end

    subgraph API["MedRail API process"]
        direction TB
        B1((("B1<br/>rate limit +<br/>payment gate")))
        B2((("B2<br/>zod validate<br/>length 58 AND checksum")))
        B2b((("B2b<br/>recover payer from<br/>PAYMENT-SIGNATURE<br/>reject unless it equals<br/>requesterAddress")))
        B3((("B3<br/>derive grant box key<br/>g + sha256 triple")))
        B4((("B4<br/>check_access<br/>via simulate")))
        B5((("B5<br/>branch on the verdict")))
        B6((("B6<br/>predict audit seq<br/>+ declare box refs")))
        B7((("B7<br/>log_access<br/>via execute")))
        B8((("B8<br/>compose response")))
        SR[("SYNTHETIC_RECORD<br/>fixed constant, patient-independent<br/>DATA-004 IMPLEMENTED")]
        KEY{{"OPERATOR_MNEMONIC — signs B4 and B7"}}
    end

    subgraph TB2["TB-2"]
        F["GoPlausible facilitator"]
    end

    subgraph TB34["TB-3 / TB-4 — PERMANENT AND WORLD-READABLE"]
        AL["AlgoNode algod"]
        D1S[("D1 grants — read only")]
        D2S[("D2 audit_seq — read then write")]
        D3S[("D3 audit_log — APPEND ONLY")]
        D4S[("D4 total_audit_entries")]
    end

    C -->|"e1 patientId 58 chars<br/>e2 requesterAddress 58 chars — asserted<br/>e3 PAYMENT-SIGNATURE"| B1
    B1 -->|"e3"| F
    F -->|"e4 VERIFIED — nothing settled yet"| B1
    B1 -->|"e1 e2 e3"| B2
    B2 -->|"e1 e2 e3"| B2b
    B2b -->|"e13 payer recovered from<br/>paymentGroup at paymentIndex"| B2b
    B2b -->|"403 if e13 does not equal e2 — settlement cancelled"| C
    B2b -->|"e1 e2, now corroborated"| B3
    KEY -.-> B4
    KEY -.-> B7
    B3 -->|"e5 33-byte box key"| B4
    B4 -->|"e5 as a box reference"| AL
    AL --> D1S
    D1S -->|"e6 grant status + expiry, evaluated on-chain"| AL
    AL -->|"e7 boolean"| B5

    B5 -->|"DENIED — e1 e2 + constants, write wrapped in .catch"| B6
    B5 -->|"ALLOWED — e1 e2 + constants, write wrapped in try/catch"| B6
    B6 -->|"reads current sequence"| D2S
    B6 -->|"e8 predicted box name a+patient+itob(seq)"| B7
    B7 -->|"e1 e2 + e9 scope + e10 endpoint + e11 action<br/>ADMIN-SIGNED"| AL
    AL -->|"writes"| D2S
    AL -->|"appends AuditEntry — ts, requester, scope, endpoint, action"| D3S
    AL -->|"increments"| D4S
    AL -->|"e12 audit tx id + sequence"| B8

    SR --> B8
    B8 -->|"200 · synthetic record · consentVerifiedOnChain · auditStatus<br/>recorded with e12, or pending with nulls<br/>OR 403 · charged false — settlement cancelled"| C

    D3S -->|"the requester recorded here is the account that PAID<br/>SEC-008 IMPLEMENTED"| TB1
```

**The flow that used to be missing is now the centre of the diagram.** Process **B2b** is the arrow from `e3` — the payment signature, which carries the payer's identity — into the authorisation decision. `payerFromRequest` decodes the header, takes `paymentGroup[paymentIndex]` (the caller's own asset transfer, not the facilitator's fee-payer legs), and recovers its sender; the handler then refuses with 403 unless that address equals `e2`. Because the payment is a signed transaction, this costs one decode and no extra round trip: **under x402 the money and the identity are the same artefact**, which is why an on-chain consent grant can be enforced by an off-chain API without any session, token or login. FR-039, SEC-006, SEC-007, SEC-008 **IMPLEMENTED**.

**What actually lands on the permanent public record.** Exactly five fields, from `AuditEntry` (`contracts/smart_contracts/consent/contract.py:69-76`): a timestamp, the requester address, and three strings that are **module constants**, not caller input — `scope = "records:summary"`, `endpoint = "/v1/records/summary"`, `action = "consent_checked" | "consent_denied"` (`api/src/routes/records.ts:12-13`, `:58`, `:84`). SEC-004 **IMPLEMENTED**. And the requester address written there is now provably the account that paid, so the audit trail records a fact rather than a claim.

**The right-hand side is proven.** D2, D3 and the `total_audit_entries` increment have all occurred on TestNet — `total_audit_entries = 5`, first write `4YLKLQKK…` — and `api/scripts/e2e-consent-proof.ts` reproduces the whole path on demand. FR-010, FR-011, FR-012 **VALIDATED**. What is still thin is *unit* coverage: `routes/records.ts` is exercised by `api/test/app.spec.ts` and `api/test/x402Payer.spec.ts` at its boundaries, and `services/algorand.ts` has no dedicated unit-test file at all (finding **G-05**, open).

---

## 5. Data classification

Sensitivity scale: **Public** (on a public ledger or intended for publication) · **Pseudonymous** (an identifier, not directly identifying, but linkable and permanent) · **Caller-sensitive** (potentially health-related content supplied by the caller) · **Secret** (compromise causes direct loss).

| Item | Classification | Boundaries crossed | Persisted where | Retention | Controls present | Gaps |
|---|---|---|---|---|---|---|
| Free-text symptoms (`d1`) | **Caller-sensitive** | TB-1 inbound only | **Nowhere** | Request lifetime | Never logged, never persisted, never reaches the chain; 2000-char cap | Held in process memory and in TLS transit. AI-007 **IMPLEMENTED** structurally, not by an explicit redaction control |
| Medication list (`d2`) | **Caller-sensitive** | TB-1 inbound only | **Nowhere** | Request lifetime | Same | Same |
| Triage / interaction result (`d5`, `d6`) | Caller-sensitive, derived | TB-1 outbound only | Nowhere | Request lifetime | Always carries a non-diagnostic disclaimer, asserted by test (FR-009, AI-002 **VALIDATED**) | — |
| `patientId` (`e1`) | **Pseudonymous, permanent** | TB-1 → TB-3 → TB-4 | D2, D3 keys; D1 key input | **Forever** | Only the SHA-256 digest of the triple appears in D1's key; the raw address appears in D2/D3 keys. Validated for length **and** checksum by `algorandAddress` before any chain call (SEC-010, SEC-011 **IMPLEMENTED**) | Still caller-chosen, but it only selects which grant is checked — a grant naming a patient who did not issue it does not exist |
| `requesterAddress` (`e2`) | **Pseudonymous, permanent** | TB-1 → TB-3 → TB-4 | D3 value, **in the clear** | **Forever** | Asserted by the caller, then **corroborated against the payer** recovered from `PAYMENT-SIGNATURE`; a mismatch is a 403 before any chain call (SEC-006, SEC-007, SEC-008 **IMPLEMENTED**) | Permanent and linkable once written. The value is now provably the paying account, so a false attribution cannot be induced by a caller |
| `scope`, `endpoint`, `action` (`e9`–`e11`) | **Public** | TB-1 → TB-4 | D3 value | Forever | Module constants, never caller-derived | — |
| `PAYMENT-SIGNATURE` (`e3`) | **Secret in transit, bearer-equivalent** | TB-1 → TB-2 | Nowhere in MedRail | Request lifetime | HTTPS; forwarded verbatim to the facilitator; never logged. Also **read locally, read-only**, by `payerFromRequest` to recover the payer (`e13`) | No replay defence implemented by MedRail; the facilitator and the AVM handle that. `payerFromRequest` returns `null` on any decode failure and callers must treat `null` as unauthenticated |
| Settled transaction id (`e12`, `d4`) | **Public** | TB-2 → TB-1, and TB-4 | Algorand ledger | Forever | Deliberately published — the proof artefact | Links payer to endpoint and timestamp forever. Inherent to x402 |
| Grant record — status, `granted_at`, `expires_at` | **Public** | TB-4 | D1 | Forever | 17 bytes; no PHI | The `(patient, requester)` relationship is inferable from the transaction that created it. That is inherent to an auditable on-chain consent registry and cannot be removed; what it no longer buys an observer is the ability to *use* the pair |
| Global counters | **Public** | TB-4 | D4 | Forever | — | — |
| Synthetic record | **Not sensitive by construction** | TB-1 outbound | D-none, a code constant | — | Fixed, patient-independent; response carries an explicit disclaimer (DATA-004 **IMPLEMENTED**) | Would become the most sensitive item in the system the moment real data replaced it. The authorisation control that would then be load-bearing already exists — what is absent is encryption at rest, key management and a retention policy (DATA-006 **PLANNED**) |
| `OPERATOR_MNEMONIC` | **Secret — highest value** | Never crosses a boundary | Env var + process memory, memoised for the process lifetime | Process lifetime | Gitignored and verified untracked (SEC-005 **VALIDATED**) | Single hot key, no multisig, no HSM, no rotation policy or runbook. Grants audit forgery + `set_admin` + `withdraw_excess`. SEC-012 **NOT IMPLEMENTED**. Also sits in the repo-root Docker build context (SEC-015 **NOT IMPLEMENTED**, D-3) |
| `DEPLOYER_MNEMONIC` | **Secret** | Never crosses a boundary | `contracts/.env` | — | Gitignored, untracked | Same build-context exposure (D-3) |
| Demo wallet mnemonic (D8) | **Secret, TestNet-only** | Never leaves the browser tab | `sessionStorage`, **plaintext** | Tab lifetime | `sessionStorage` rather than `localStorage`; TestNet only; disclosed in-code and in the UI | Any XSS on the page exfiltrates it. Impact bounded to play money |
| ARC-56 spec (D7) | **Public by intent** | TB-1 outbound | Container filesystem | Image lifetime | Served at `GET /v1/consent/arc56` so third parties can build their own calls (FR-015) | — |
| Interaction table (D5) | **Public by intent** | TB-1 outbound, as `source` | Process memory | Process lifetime | Provenance string in every response (DATA-005, AI-004 **VALIDATED**) | Cites a reference *class*, not a licensed dataset — stated as such |

### 5.1 The one-way property that matters most

Caller-sensitive content flows **inbound only** and terminates inside the process. Pseudonymous identifiers flow **inbound and onward to a permanent public record**. The system is designed so that the two never mix, and the design holds — the audit entry's only variable field is an address, and its three strings are compile-time constants.

Two conditions would strain it, and they are not symmetrical.

1. **Adding structured request logging** without an explicit body-redaction rule would create the first durable sink for `d1`/`d2`. Two structured events now exist (`audit_write_failed`, `facilitator_unavailable`) and neither carries caller free text, but that is a property of how they were written, not of an enforced rule. OPS-002 remains **NOT IMPLEMENTED**, so there is no sink today — and no policy that would stop one being added.
2. **Replacing `SYNTHETIC_RECORD` with real data** is the larger step, and the honest position on it has changed. The authorisation control that would have to hold now exists and is proven: the payer is bound to the asserted requester, so a stranger cannot read a record by naming an authorised party, and the audit trail records the account that actually paid rather than a claim. What remains true is that the endpoint currently returns a fixed constant, so **nothing sensitive sits behind that control yet** — the risk is deferred, not exercised. Turning it on would additionally require encryption at rest, key management, a retention policy, a breach-notification process and a regulatory posture, **none of which exists in this repository**.

`docs/SECURITY.md` describes off-chain encrypted storage with on-chain content-address pointers as the eventual direction for real clinical payloads. **DATA-006 is PLANNED — no encryption pipeline exists in this repository**, and no HIPAA, GDPR or SOC-2 status is claimed anywhere.
