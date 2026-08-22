# MedRail — Sequence Diagrams

**Purpose:** trace every interaction of consequence — the two payment flows, the consent lifecycle, the consent-gated read in both outcomes, one attack and its block, two degradation paths, and one autonomous agent composing most of them into a single task — at message granularity.

**Status of this document:** Descriptive of the working tree on branch `main`. Each diagram is annotated with the validation status of the path it shows. Every path here has now executed against live infrastructure or is asserted by test; diagram 7 is an attack that is **MITIGATED**, proven by a live TestNet simulation. Status labels per the project fact ledger.

**One rule governs every diagram below.** `@x402/hono` verifies the payment *before* the handler runs and commits settlement *after* it returns — and only when the returned status is below 400. On a throw it calls `cancellationDispatcher.cancel({reason: "handler_threw"})`; on any 4xx or 5xx it calls `cancel({reason: "handler_failed"})` and returns before `processSettlement` is ever reached (`@x402/hono` `dist/esm/index.mjs:203-232`). So in the diagrams, **"settled" always appears after the handler's response, never before it**, and every non-2xx branch is a branch on which the caller pays nothing.

Related: [`./LLD.md`](./LLD.md) · [`./HLD.md`](./HLD.md) · [`./Activity_Diagrams.md`](./Activity_Diagrams.md) · [`../02_Requirements/SRS.md`](../02_Requirements/SRS.md) · [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md)

**Participants used throughout**

| Alias | Real component |
|---|---|
| Client | Any x402 v2 client — `@x402/fetch`, `api/scripts/e2e-proof.ts`, or `web/lib/x402Client.ts` |
| Ag | The autonomous agent of diagram 10 — `api/scripts/agent-demo.ts`, a stock `@x402/fetch` client with no MedRail-specific code |
| API | `medrail-api`, Hono app at `api/src/app.ts` |
| Pay | `paymentMiddleware` from `@x402/hono`, wired at `api/src/app.ts:58-175` and wrapped for outage handling at `:73-105` |
| RS | `x402ResourceServer` + `ExactAvmScheme`, `api/src/x402.ts:11-14` |
| Fac | GoPlausible facilitator, `https://facilitator.goplausible.xyz` |
| Gw | `api/src/services/algorand.ts` |
| Algod | AlgoNode algod, `https://testnet-api.algonode.cloud` |
| App | `MedRailConsent`, Algorand application `768743428` |

---

## 1. Unpaid request to a priced route — the 402 challenge

**Status: VALIDATED** — `api/test/x402-flow.spec.ts` asserts the live 402 on all three priced routes (FR-001, FR-002).

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant API as MedRail API
    participant Pay as paymentMiddleware
    participant RS as x402ResourceServer
    participant Fac as GoPlausible facilitator

    Client->>API: POST /v1/triage<br/>no PAYMENT-SIGNATURE header
    API->>API: cors middleware, app.ts:22-35
    API->>Pay: route key "POST /v1/triage" is priced

    alt resourceServer not yet initialised in this process
        Pay->>RS: initialize()
        RS->>Fac: GET /supported
        Fac-->>RS: payment kinds — network, asset 10458941,<br/>extra.feePayer ZMFK2OI7...
        RS->>RS: cache kinds for the process lifetime
        Note over RS,Fac: One fetch per process. Warm 402 measured at<br/>roughly 15 ms — single observation, not a percentile.<br/>If this fetch FAILS the route returns 503 + Retry-After — see diagram 8.
    else already initialised
        Pay->>RS: use cached kinds
    end

    RS->>RS: build accepts[0] from priced("$0.02", ...)<br/>plus facilitator-supplied asset and feePayer
    RS-->>Pay: 402 challenge
    Pay-->>Client: HTTP 402<br/>body {}<br/>PAYMENT-REQUIRED base64<br/>cache-control no-store<br/>access-control-expose-headers PAYMENT-REQUIRED,PAYMENT-RESPONSE
    Note over Client: Handler never ran. zod never ran.<br/>An unpaid MALFORMED body also returns 402, not 400 —<br/>documented at api/test/x402-flow.spec.ts:48-59.
```

**Walkthrough.** CORS runs first (`api/src/app.ts:22`), then the three path-scoped rate limiters (`:44-46`), then the payment middleware inside its outage wrapper (`:50`, `:73`), then — only on success — the route modules (`:107-111`). Because the gate precedes every handler, an unpaid request never reaches zod. The challenge body is empty; the entire payload is the base64 `PAYMENT-REQUIRED` header. Decoded, it carries `x402Version: 2`, the resource URL and description, and `accepts[0]` = `{scheme: "exact", network: "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=", amount: "20000", asset: "10458941", payTo: "2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE", maxTimeoutSeconds: 300, extra: {feePayer: "ZMFK2OI7ZBD2U27ISERZC4S6LKM6WMFJPZQ4MYNJDZ2VNBNMBA67RA22AA"}}`.

**Evidence:** `api/src/app.ts:58-175`; `api/src/x402.ts:11-32`; assertions at `api/test/x402-flow.spec.ts:24` (`amount === "20000"`) and `:45` (`"50000"`).

**Note on the initialise step.** `asset` and `extra.feePayer` are **not** MedRail configuration — `priced()` sets no `asset` field at all (`api/src/x402.ts:16-19`). They come from the facilitator's `/supported`. The 402 therefore cannot be constructed offline, which makes the priced surface dependent on a third party's availability. That dependency is now *handled* rather than merely suffered: a failed fetch produces a 503 with `Retry-After: 30` and a stable error code (diagram 8). It is not *removed* — there is still no cached `/supported` fallback and no second facilitator, so REL-001 is **PARTIALLY IMPLEMENTED**. PERF-001 **IMPLEMENTED**: the cache means no per-request outbound call.

---

## 2. Full paid triage call — settle and deliver

**Status: VALIDATED on-chain.** Settled transaction `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ` (FR-003).

```mermaid
sequenceDiagram
    autonumber
    participant Client as Client — @x402/fetch
    participant API as MedRail API
    participant Pay as paymentMiddleware
    participant Fac as GoPlausible facilitator
    participant Algod as AlgoNode algod
    participant Chain as Algorand TestNet
    participant Svc as triageScorer

    Client->>API: POST /v1/triage — attempt 1, unpaid
    API-->>Client: 402 + PAYMENT-REQUIRED
    Client->>Client: ExactAvmScheme builds an axfer<br/>asset 10458941, amount 20000,<br/>payTo from accepts[0], fee paid by feePayer
    Client->>Client: signTransactions via ClientAvmSigner
    Client->>API: POST /v1/triage — attempt 2<br/>PAYMENT-SIGNATURE header

    API->>Pay: priced route, signature present
    Pay->>Fac: verify — is this payment valid for these requirements?
    Fac-->>Pay: verified · NOT yet settled

    Pay->>API: await next() — forward to the handler
    API->>API: zod parse — symptoms 1..2000 chars
    API->>Svc: scoreTriage("Sudden chest pain and shortness of breath")
    Svc-->>API: score 70, band emergency,<br/>flags cardiac chest pain + respiratory distress
    API-->>Pay: HTTP 200 + JSON + disclaimer

    Pay->>Pay: res.status is 200, below 400 — settle
    Pay->>Fac: processSettlement
    Fac->>Algod: submit the fee-sponsored group
    Algod->>Chain: broadcast
    Chain-->>Algod: confirmed at round 66091768
    Algod-->>Fac: confirmation
    Fac-->>Pay: settled — tx OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ
    Pay-->>Client: HTTP 200 + JSON + PAYMENT-RESPONSE header

    Note over Chain: type axfer · asset 10458941 · amount 20000 = $0.02 at 6 decimals<br/>fee 0, fee-sponsored · group XQzhbjBAqt0AjC5AByQsCxGbMdEuca3ZZFMyFBTb7K4=<br/>note decodes to x402-payment-v2-1786140083822<br/>in this early e2e-proof.ts run only: sender == receiver == 2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE<br/>the agent run of diagram 10 pays from an independent account
```

**Walkthrough.** The two-attempt shape is the x402 protocol itself, not a MedRail retry: the client discovers the price from the 402 and re-issues with a signed payment. MedRail never inspects the signature for *validity* — it hands the header to the facilitator and acts on the verdict (TB-2). It does read the header for *identity* on the consent-gated route, which is a separate concern and the subject of diagram 7. No MedRail-specific knowledge is required of the client: stock `@x402/fetch` with `ExactAvmScheme` produced this transaction via `api/scripts/e2e-proof.ts`, and the result is committed at `contracts/artifacts/e2e-proof.json` with `httpStatus: 200`.

**Note the verify/settle split.** Verification happens before the handler and settlement after it. That is not an implementation detail: it is the reason no failure inside MedRail can consume a caller's money, and it is what every "failure" diagram below depends on.

**Honesty note.** The run diagrammed above is a **self-payment** — sender and receiver are the same address — as are all of the early proof-script runs, disclosed in `docs/PROOF.md` §6. That is no longer true of every payment: the agent run of diagram 10 settles from an **independent keypair** (`UYBTLPHS…`, which this service does not control) to the service address (`2WDV2J2F…`), with sender ≠ receiver confirmed against the public indexer (`docs/PROOF.md` §10). What has not changed is where the money came from — the agent's TestNet USDC float was seeded from the project's own wallet, because TestNet USDC has no other practical source — so none of this is third-party payment volume, and no external party has paid for the service. Each is a genuine facilitator-settled x402 transfer, and together they prove the protocol path end to end. The early runs each have a committed evidence file: `2VRBXOMH…` and `OYRQRKYA…` for `/v1/triage` (`e2e-proof.json`, which the repeatable script overwrites), `5DKFUULW…` for the consent-gated route (`e2e-consent-proof.json`), and `QZIQWHN5…` for the G-01 control call (`g01-verification.json`).

**Evidence:** `contracts/artifacts/e2e-proof.json`; `api/scripts/e2e-proof.ts:52-76`; scoring logic at `api/src/services/triageScorer.ts:53-73` (35 + 35 = 70 → `emergency`).

---

## 3. Patient grants consent — browser straight to Algorand, no backend

**Status: IMPLEMENTED** (FR-035, NFR-008); the on-chain method itself is **VALIDATED** by transaction `X2BQ5FD4MW52B75WQGDB67TEULYLN7FHVFO6ZOBNI74PNCAKVOUA`. The browser path has **no automated test**.

```mermaid
sequenceDiagram
    autonumber
    participant Patient
    participant UI as ConsentChecker
    participant Wallet as lib/demoWallet.ts
    participant Con as lib/consent.ts
    participant API as MedRail API
    participant Algod as AlgoNode algod
    participant App as MedRailConsent 768743428

    Patient->>UI: click "Grant myself access"
    UI->>Wallet: getOrCreateDemoWallet()
    Wallet->>Wallet: read sessionStorage medrail-demo-wallet-v1<br/>or algosdk.generateAccount()
    Wallet-->>UI: {address, mnemonic}

    UI->>Con: grantAccessOnChain(wallet, requester, "records:summary", 0)
    Con->>API: GET /v1/consent/app-info
    API-->>Con: {consentAppId 768743428, networkCaip2, arc56SpecUrl}
    Note over Con,API: The ONLY backend involvement — App ID discovery.<br/>No key, no transaction, no signature crosses this edge.

    Con->>Con: mnemonicToSecretKey(wallet.mnemonic) — in the browser
    Con->>Con: grantBoxName = "g" + crypto.subtle.digest SHA-256 of<br/>pubkey(patient) + pubkey(requester) + utf8(scope)
    Con->>Algod: getTransactionParams
    Algod-->>Con: suggested params
    Con->>Con: ATC addMethodCall grant_access<br/>boxes = [grantBoxName]
    Con->>Algod: atc.execute(algod, 4) — signed by the PATIENT
    Algod->>App: app call, Txn.sender is the patient
    App->>App: key = sha256(sender + requester + scope)<br/>was_active_before from prior STATUS, not existence<br/>write GrantRecord status 1<br/>total_grants_active + 1 if newly active<br/>emit AccessGranted
    App-->>Algod: confirmed
    Algod-->>Con: txId
    Con-->>UI: txId
    UI->>UI: check() then render explorer link

    Note over App: MBR for the new grant box is paid by the APP account,<br/>not the patient. True cost 22500 microALGO per box.<br/>GRANT_BOX_MBR now says 22500 in source — the deployed<br/>bytecode still returns the old 22100 until redeploy.
```

**Walkthrough.** This is the strongest claim in the system and it holds up: the patient's private key is used only inside the browser, and the API is not on the signing or submission path. The contract enforces it structurally — `grant_access` has **no patient parameter**; the patient is `Txn.sender` (`contracts/smart_contracts/consent/contract.py:158`), so there is nothing to forge. SEC-003 **VALIDATED**.

The one nuance worth stating precisely: the browser does call `GET /v1/consent/app-info` to learn the App ID (`web/lib/consent.ts:36-41`). That is an **availability** coupling, not a trust coupling — if the API is down the panel fails, but no key is ever exposed.

**Revocation** is the mirror image (`web/lib/consent.ts:70-89` → `contract.py:185-202`), with one extra guarantee: `assert self.grants.maybe(key)[1], "no such grant"` makes revoking a non-existent grant fail atomically (FR-021 **VALIDATED**). Live revocation: `OV2J2T5VWMIQG64JYGL7JEGZKKNZNKCMNIQU6AC4PDRQYZ6ZOO5A`.

**Note on the box key.** This is the **third independent implementation** of the derivation — Python `op.sha256`, Node `node:crypto`, browser `crypto.subtle.digest`. All three are now held to one shared golden-vector fixture, `api/test/fixtures/box-key-vectors.json`, asserted by `api/test/boxKeyParity.spec.ts` on the Node and WebCrypto paths and by `contracts/tests/test_box_keys.py` on the Python one. NFR-011 **VALIDATED**; finding G-08 closed.

**Note on the MBR constant.** The 22,500 figure is the corrected one. `GRANT_BOX_MBR` originally read `2_500 + 400 * (32 + 17)` = 22,100, omitting the `BoxMap` key prefix byte; it is fixed in source with a regression test, but the redeploy is deliberately deferred because `deploy_testnet.py` uses `OnUpdate.AppendApp` and would mint a new App ID, orphaning `768743428` and every transaction cited in these documents.

---

## 4. Consent-gated record access — happy path

**Status: VALIDATED on-chain.** `api/scripts/e2e-consent-proof.ts` performs grant → check → paid call → audit append and is repeatable; `contracts/artifacts/e2e-consent-proof.json` records the run — grant `M26NPR32…`, settled payment `5DKFUULW…`, audit write `4YLKLQKK…` at sequence 1, `consentVerifiedOnChain: true`. `total_audit_entries` on app `768743428` is now **5**. FR-010, FR-012, FR-025 **VALIDATED**.

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant API as MedRail API
    participant Fac as GoPlausible facilitator
    participant Rec as routes/records.ts
    participant Gw as services/algorand.ts
    participant Algod as AlgoNode algod
    participant App as MedRailConsent

    Client->>API: POST /v1/records/summary + PAYMENT-SIGNATURE<br/>{patientId, requesterAddress}
    API->>API: rateLimit 30/min for this client — app.ts:46
    API->>Fac: verify $0.05 = 50000 microUSDC
    Fac-->>API: VERIFIED — valid, but NOT yet settled
    Note over Client,Fac: No money has moved. Settlement happens only<br/>if the handler returns a status below 400.

    API->>Rec: await next() — handler
    Rec->>Rec: zod safeParse with algorandAddress<br/>length 58 AND checksum, on both fields

    Rec->>Rec: payerFromRequest(c) — decode PAYMENT-SIGNATURE,<br/>take paymentGroup[paymentIndex], recover its sender
    Rec->>Rec: assert payer === requesterAddress<br/>records.ts:41-52 — else 403, see diagram 7
    Note over Rec: THE PAYMENT IS THE AUTHENTICATION.<br/>No token, no session, no login — the signature<br/>that paid is the signature that identifies.

    Rec->>Gw: checkAccess(patientId, requesterAddress, "records:summary")
    Gw->>Gw: getOperator() — throws without OPERATOR_MNEMONIC
    Gw->>Algod: getTransactionParams
    Algod-->>Gw: params
    Gw->>Algod: atc.simulate — check_access, box "g"+sha256(triple)
    Algod->>App: evaluate, submit nothing
    App-->>Algod: true — box exists, status 1, unexpired
    Algod-->>Gw: methodResults[0].returnValue = true
    Gw-->>Rec: true

    Rec->>Gw: logAccess(...) inside try/catch — records.ts:83-99
    Gw->>Gw: withPatientLock — serialise per patient, IN THIS PROCESS ONLY
    Gw->>Algod: getTransactionParams
    Gw->>Algod: getAuditCount — second getTransactionParams + simulate
    Algod-->>Gw: currentCount N
    Gw->>Gw: predictedSeq = N + 1<br/>boxes = ["s"+patient, "a"+patient+itob(N+1)]
    Gw->>Algod: atc.execute(algod, 4) — signed by ADMIN
    Algod->>App: log_access — assert Txn.sender == admin
    App->>App: next_seq recomputed ON-CHAIN from audit_seq<br/>write audit_seq and audit_log<br/>total_audit_entries + 1
    App-->>Algod: returns next_seq
    Algod-->>Gw: txId + sequence
    Gw-->>Rec: {txId, sequence}

    Rec-->>API: HTTP 200<br/>SYNTHETIC_RECORD + consentVerifiedOnChain true<br/>auditStatus recorded + auditTxId + auditSequence
    API->>Fac: status is 200 — processSettlement
    Fac-->>API: settled
    API-->>Client: HTTP 200 + PAYMENT-RESPONSE header
```

**Walkthrough.** Four sequential outbound calls occur *before* the response and therefore before settlement: `getTransactionParams`, then `getAuditCount`'s own `getTransactionParams` and `simulate`, then `execute` polling for up to four rounds. The audit write is inline on the paid path — PERF-004 **NOT IMPLEMENTED**, and no latency figure is measured anywhere (finding **G-24**, open). The redundant second `getTransactionParams` is finding **G-33**, also open.

**The payer binding is the step that matters.** The x402 middleware proves *a* payment settled; it does not tell the handler *whose*. `payerFromRequest` recovers the signer of `paymentGroup[paymentIndex]` — the caller's own asset transfer, as distinct from the facilitator's fee-payer legs — and the handler refuses to proceed unless that address equals the `requesterAddress` in the body. Without this the consent check would be answering a question about somebody else. See diagram 7 and [`./LLD.md`](./LLD.md) §5.2.

**What the contract protects, and how the client-side prediction stays safe.** `log_access` recomputes `next_seq` from on-chain state (`contract.py:231-233`), so a stale client-side prediction cannot corrupt the audit trail. The prediction exists only to populate the AVM's mandatory box-reference array. A stale prediction therefore produces a *rejected transaction*, not a bad record — and the handler's `try/catch` converts that rejection into a 200 with `auditStatus: "pending"` (diagram 9).

**AI-007 holds structurally.** Only the module constants `SCOPE`, `ENDPOINT` and the literal `"consent_checked"` reach the ledger (`api/src/routes/records.ts:12-13`, `:84`). No free-text clinical input is on any path to Algorand.

**The response body is a fixed constant.** `SYNTHETIC_RECORD` (`api/src/routes/records.ts:17-23`) is returned regardless of `patientId`. There is no patient datastore. DATA-004 **IMPLEMENTED**.

**Evidence:** `contracts/artifacts/e2e-consent-proof.json`; `api/src/routes/records.ts:28-112`; `api/src/services/algorand.ts:82-100`, `:146-179`; `contract.py:224-243`.

---

## 5. Consent-gated record access — denied path

**Status: VALIDATED** — FR-011. The denial audit write executes on-chain like any other `log_access` call, and the denial response shape is fixed by `api/src/routes/records.ts:59-71`.

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant API as MedRail API
    participant Fac as GoPlausible facilitator
    participant Rec as routes/records.ts
    participant Gw as services/algorand.ts
    participant App as MedRailConsent

    Client->>API: POST /v1/records/summary + PAYMENT-SIGNATURE
    API->>Fac: verify $0.05
    Fac-->>API: VERIFIED — not settled
    API->>Rec: handler, body valid, payer matches requesterAddress

    Rec->>Gw: checkAccess(patient, requester, "records:summary")
    Gw->>App: simulate check_access
    alt no grant box exists
        App-->>Gw: false
    else box exists but status is 2 REVOKED
        App-->>Gw: false
    else box granted but latest_timestamp >= expires_at
        App-->>Gw: false — stored status is STILL 1, expiry is read-time only
    end
    Gw-->>Rec: false

    Rec->>Gw: logAccess(..., "consent_denied") wrapped in .catch(() => undefined)
    Note over Rec,Gw: records.ts:58 — a failure here is swallowed and the<br/>caller still receives a coherent 403. The allowed path<br/>at records.ts:83-99 is guarded too, but reports the<br/>failure as auditStatus pending instead of hiding it.
    alt on-chain write succeeds
        Gw->>App: log_access "consent_denied"
        App-->>Gw: sequence
    else on-chain write fails
        Gw-->>Rec: swallowed, execution continues
    end

    Rec-->>API: HTTP 403<br/>{error, patientId, requesterAddress,<br/>charged false, hint to the free pre-flight}
    API->>API: status 403 is >= 400 — cancel, do NOT settle
    API-->>Client: HTTP 403 · no PAYMENT-RESPONSE header · caller charged nothing
```

**Walkthrough.** The caller is refused and **pays nothing**. A 403 is a status at or above 400, so `@x402/hono` cancels settlement and never calls `processSettlement`; the response says so in the body with `charged: false`, and the `hint` field points at the free `GET /v1/consent/status` pre-flight so an integrator can avoid the round trip entirely. An earlier revision of this endpoint returned `charged: false` and the documents described the denial as charged — both were wrong about the SDK's own behaviour, and the field no longer exists.

**The cost that does exist is MedRail's.** The denial audit write is a real Algorand transaction whose fee the operator account pays, so a stranger can make MedRail spend a fee to be told "no", for free. That is why this priced route is nonetheless rate-limited to 30 requests per minute per client (`api/src/app.ts:46`): the denied path is a free surface hiding inside a paid endpoint. Finding **G-03 closed** — response and documents corrected, cost bounded.

**Recording the denial is the point, not a side effect.** A refused attempt is exactly the event a patient most wants to see on their own consent trail; a log of successful reads only is a weaker artefact.

**Three distinct denial causes collapse to one `false`.** No grant, a revoked grant, and an expired grant are indistinguishable in the response. A caller cannot tell "you were never granted" from "your grant lapsed yesterday". That is arguably correct privacy behaviour — distinguishing them would leak the existence of grants — but the repository does not record a rationale, so it should be read as a consequence of `check_access`'s boolean return type rather than as a deliberate privacy control.

**Note the expiry subtlety.** For an expired grant the stored status remains `STATUS_GRANTED`; expiry is evaluated at read time and never written back (`contract.py:205-209`). `get_grant` and `check_access` will disagree. The API only ever calls `check_access`, so it is correct.

---

## 6. Free consent read via `simulate`

**Status: IMPLEMENTED** (FR-013). Manually exercised by the reviewer — one cold observation at **505 ms**, a single sample and not a percentile. `api/test/app.spec.ts` covers this route's validation and rate-limit behaviour; the granted-path chain read itself has no automated test.

```mermaid
sequenceDiagram
    autonumber
    participant Caller as Any caller — unauthenticated, unpaid
    participant API as MedRail API
    participant Pay as paymentMiddleware
    participant Con as routes/consent.ts
    participant Gw as services/algorand.ts
    participant Algod as AlgoNode algod
    participant App as MedRailConsent

    Caller->>API: GET /v1/consent/status?patient=&requester=&scope=
    API->>API: rateLimit 60/min per client — app.ts:44
    alt window exhausted
        API-->>Caller: 429 + Retry-After<br/>{"error":{"code":"RATE_LIMITED","retryable":true}}
    end
    API->>Pay: not in the priced route map — pass through untouched
    Pay->>Con: handler
    Con->>Con: zod with algorandAddress — length 58 AND<br/>algosdk.isValidAddress checksum, scope min 1
    alt shape or checksum invalid
        Con-->>Caller: 400 invalid query + zod field errors<br/>NO chain call is made
    end

    Con->>Gw: checkAccess(patient, requester, scope)
    Gw->>Gw: requireConsentAppId() — CONSENT_APP_ID is set in fly.toml
    Gw->>Gw: getOperator() — throws without OPERATOR_MNEMONIC
    Note over Gw: A FREE, UNAUTHENTICATED endpoint transitively requires<br/>the contract ADMIN private key to be loaded. algorand.ts:8-14, :84

    Gw->>Algod: getTransactionParams — outbound call 1
    Algod-->>Gw: params
    Gw->>Gw: grantBoxName — decodeAddress cannot throw now,<br/>the checksum was validated at the boundary
    Gw->>Algod: atc.simulate — outbound call 2
    Algod->>App: evaluate check_access
    App-->>Algod: bool
    Algod-->>Gw: methodResults[0].returnValue
    Gw-->>Con: returnValue === true — strict, so undefined means DENIED
    Con-->>Caller: 200 {patient, requester, scope, granted}
```

**Walkthrough.** Nothing is submitted and no fee is paid — `simulate` is evaluated by the node and discarded. SEC-009 **IMPLEMENTED**. The strict `=== true` comparison (`api/src/services/algorand.ts:99`) makes the read fail closed: an ambiguous result denies.

**Three properties of this endpoint that a reviewer should notice.**

1. **It amplifies, and the amplification is now capped.** One inbound request still produces two outbound AlgoNode calls with no authentication, but the route is limited to 60 requests per minute per client key (`api/src/rateLimit.ts`, wired at `api/src/app.ts:44`), returning **429** with `Retry-After` past the window. SEC-013 **IMPLEMENTED**; finding **G-09 closed**. Two honest limitations: the client key is the first `X-Forwarded-For` hop and is spoofable by a direct caller, and the buckets are per-process — this is a courtesy guard, not a security boundary.
2. **A malformed address is a 400, and reveals nothing.** `api/src/validation.ts` exports `algorandAddress`, a zod schema chaining `.length(58)` with `.refine(algosdk.isValidAddress)`, and both query fields use it. A 58-character string with a bad checksum is rejected at the boundary with a field error naming the checksum — no `getTransactionParams` round trip is spent, and `algosdk.decodeAddress` is never reached. `app.onError` separately no longer echoes `err.message`: it logs the detail server-side against a generated `requestId` and returns `{"code":"INTERNAL_ERROR","retryable":true,"requestId":"…"}`. SEC-010, SEC-011 **IMPLEMENTED**; finding **G-10 closed**, with `api/test/app.spec.ts` asserting that the body does not contain `"wrong checksum for address"`.
3. **It depends on the admin key.** See the note in the diagram. `simulate` still requires a sender and a signer, so the free endpoint is not operable without the most sensitive secret in the system. This one is unchanged and worth restating: SEC-012 **NOT IMPLEMENTED** — there is no KMS and no scoping of that key.

---

## 7. Requester impersonation — the attack, and the control that blocks it

> ### **STATUS: MITIGATED.** Verified live against TestNet.
> SEC-006, SEC-007, SEC-008 and FR-039 **IMPLEMENTED**. Finding **G-01 closed**. The control is `api/src/x402Payer.ts` plus the guard at `api/src/routes/records.ts:41-52`. The proof is `api/scripts/verify-g01-fix.ts`, which runs the attack below against the live service and records the outcome in `contracts/artifacts/g01-verification.json` — attack blocked with a 403, control call still 200.

```mermaid
sequenceDiagram
    autonumber
    actor Att as Attacker — an ordinary paying stranger
    participant Idx as Any public Algorand indexer
    participant API as MedRail API
    participant Fac as GoPlausible facilitator
    participant Rec as routes/records.ts
    participant App as MedRailConsent

    rect rgb(255, 235, 235)
    Note over Att,Idx: RECONNAISSANCE — costs nothing, needs no access, still works
    Att->>Idx: list application transactions for app 768743428
    Idx-->>Att: grant_access calls — sender is the PATIENT,<br/>ABI arg 0 is the REQUESTER, both in the clear
    Att->>Att: harvest real (patient, requester) pairs<br/>selector 8c3ad539 identifies grant_access
    end

    rect rgb(255, 235, 235)
    Note over Att,App: ATTEMPT — one ordinary payment, no forgery, no key theft
    Att->>API: POST /v1/records/summary + a VALID payment from the ATTACKER<br/>{patientId: victim, requesterAddress: authorised third party}
    API->>Fac: verify the attacker's own $0.05 payment
    Fac-->>API: VERIFIED — genuinely valid, and NOT yet settled
    API->>Rec: handler
    Rec->>Rec: zod passes — both fields are valid addresses
    end

    rect rgb(235, 245, 255)
    Note over Rec: THE CONTROL — records.ts:41-52
    Rec->>Rec: payerFromRequest(c) — decode PAYMENT-SIGNATURE,<br/>take paymentGroup[paymentIndex],<br/>getSenderFromTransaction on the signed axfer
    Rec->>Rec: payer is the ATTACKER<br/>requesterAddress is the AUTHORISED THIRD PARTY<br/>they differ
    Rec-->>API: HTTP 403 requesterAddress must match<br/>the address that signed the payment<br/>body echoes both addresses
    Note over Rec,App: check_access is NEVER called.<br/>log_access is NEVER called — no forged attribution<br/>can reach the patient's immutable audit trail.
    API->>API: status 403 is >= 400 — cancel settlement
    API-->>Att: HTTP 403 · attacker charged nothing · no record released
    end
```

**Walkthrough.** No cryptography is broken and no key is stolen. The attacker pays honestly with their own wallet and simply *claims* to be someone else. That claim is now checkable, because under x402 the payment is itself a signed transaction: the account that paid is recoverable from the header the middleware already verified, at the cost of one decode and no extra round trip. The contract still answers the question it is asked — "did patient P grant requester R scope S?" — truthfully; the API no longer lets the caller choose R.

Reconnaissance still works, and always will: grants are **necessarily** public. `grant_access` carries the patient as `sender` and the requester as ABI argument 0, and the method selector `8c3ad539` is verified on-chain. The transparency that makes the consent layer auditable also publishes the target list. What has changed is that a harvested pair is no longer usable — knowing that R is authorised does not let you *be* R.

**The second-order effect was always the worse half, and it is the half the control removes.** `logAccess` writes the requester into the per-patient audit log. A successful impersonation would have inscribed a **false attribution into an immutable record that is trusted precisely because it is on-chain** — worse than having no audit trail, because a wrong record carries more authority than a missing one. Since the 403 is returned before `checkAccess`, no impersonated call reaches `log_access` at all.

**The live proof, and why the control call matters as much as the attack.** `api/scripts/verify-g01-fix.ts` grants a third party consent, pays with a different key, and asserts the third party's address:

| | Asserted requester | Payer | Result |
|---|---|---|---|
| **attack** | `NHUPYHPA…LLVA6AM` — genuinely granted | `2WDV2J2F…TI64GE` — someone else | **403**, `blocked: true` |
| **control** | `2WDV2J2F…TI64GE` | `2WDV2J2F…TI64GE` | **200**, record released, settled `QZIQWHN5…LVSQ`, audit `OYNWBHJT…NBGA` |

A check that rejects everything is not a control, it is an outage — so the script proves both directions. Six unit tests in `api/test/x402Payer.spec.ts` pin the recovery itself, including a payment group with facilitator fee-payer legs ahead of the caller's transfer, which is the case a naïve `paymentGroup[0]` implementation gets wrong.

**What remains true about the synthetic record.** `SYNTHETIC_RECORD` is a fixed constant (`records.ts:17-23`) and `web/components/LiveDemoPanel.tsx:38` sends `requesterAddress: wallet.address`, so in the demo payer and requester coincide anyway. Neither of those is the control — the payer binding is. What they mean is that there is nothing sensitive behind the control yet.

**Related, lower severity.** `patientId` is still caller-asserted, but it only selects which grant is checked, and a grant naming a patient who did not issue it does not exist. It is not independently exploitable.

Full analysis in [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md) and [`./LLD.md`](./LLD.md) §5.2.

---

## 8. Degradation — facilitator unreachable

**Status: HANDLED.** Finding **G-04 closed**; REL-001 **PARTIALLY IMPLEMENTED** — the outage is reported honestly, but no redundancy exists. REL-005 **VALIDATED**.

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant API as MedRail API
    participant Wrap as outage wrapper, app.ts:73-105
    participant Pay as paymentMiddleware
    participant RS as x402ResourceServer
    participant Fac as GoPlausible facilitator — DOWN
    participant Health as routes/health.ts

    Client->>API: POST /v1/triage
    API->>Wrap: priced route
    Wrap->>Pay: try { await payment(c, next) }
    Pay->>RS: initialize()
    RS->>Fac: GET /supported
    Fac--xRS: connection refused / timeout — NO TIMEOUT IS SET
    RS-->>Pay: throw "Failed to initialize: no supported payment kinds<br/>loaded from any facilitator."
    Pay-->>Wrap: exception propagates
    Wrap->>Wrap: match /no supported payment kinds/i<br/>or /Failed to initialize/i — anything else RETHROWS
    Wrap->>Wrap: log structured event facilitator_unavailable<br/>with facilitator URL and path
    Wrap-->>Client: HTTP 503 · Retry-After 30<br/>{"error":{"code":"PAYMENT_FACILITATOR_UNAVAILABLE",<br/>"retryable":true,"facilitator":"..."}}
    Note over Client,Wrap: A retryable outage now reads as retryable.<br/>Stable code, explicit Retry-After, no internal<br/>exception text — a calling agent can back off<br/>instead of giving up on a broken service.

    rect rgb(235, 250, 235)
    Note over Client,Health: BLAST RADIUS IS BOUNDED — verified
    Client->>API: GET /v1/health
    API->>Health: not a priced route, middleware passes through
    Health-->>Client: HTTP 200 {ok true, service medrail-api, network, consentAppId}
    Note over Health: GET /, GET /v1/consent/app-info also verified 200.<br/>REL-005 VALIDATED. Free routes survive.
    end
```

**Walkthrough.** The root cause is architectural, not incidental: because `priced()` sets no `asset` (`api/src/x402.ts:16-19`) and `extra.feePayer` also comes from the facilitator, MedRail literally cannot construct a 402 without a successful `/supported` fetch. That has not changed. What has changed is what the caller is told.

**Why the status code is the whole fix.** An opaque 500 with an internal exception message tells a calling agent "this service is broken", and a well-built agent stops calling. A 503 carrying `Retry-After: 30`, `retryable: true` and a stable `PAYMENT_FACILITATOR_UNAVAILABLE` code tells it "try again shortly" — which is the truth, since the condition is a third party's transient unavailability rather than a defect in MedRail. For an API whose intended consumers are autonomous agents, the difference between those two answers is the difference between a paused integration and an abandoned one.

**The wrapper is deliberately narrow.** It matches two specific initialisation-failure messages and **rethrows everything else**, so a genuine payment error still surfaces as a payment error rather than being laundered into a 503. That narrowness is the part most likely to need maintenance: if the SDK changes its message text, the match stops firing and the old 500 returns. A stable error class from `@x402/core` would be a better hook, and none is exported today.

**What is still missing, in order of value.** A timeout on the `/supported` fetch; a cached last-known-good payment-kinds response persisted across restarts; a circuit breaker so a dead facilitator is not re-attempted on every request; and a second facilitator. None exists — which is why REL-001 is partial rather than closed.

**Note that `/v1/health` returns 200 throughout.** It reports only its own liveness and never probes the facilitator or algod (`api/src/routes/health.ts:6-14`), so a green health check is fully compatible with 100% of the revenue path being down. `api/fly.toml` now wires a platform health check to `/v1/health` every 30 seconds, which restarts a dead process but will not notice a dead facilitator. OPS-001 **IMPLEMENTED** but shallow, and finding **G-15** (no metrics, tracing or alerting) remains open — the `facilitator_unavailable` event is written to stdout and nothing consumes it.

**Same mechanism, second consequence.** `api/test/x402-flow.spec.ts` reaches the live facilitator, so a GitHub runner's network or a GoPlausible outage produces a red build with a misleading failure.

---

## 9. Degradation — the audit write fails on an authorised, paid request

**Status: HANDLED.** Finding **G-03** closed. REL-002 **VALIDATED — satisfied by the SDK**: settlement is structurally unreachable on an error response, so no failure here can consume the caller's money.

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant API as MedRail API
    participant Fac as GoPlausible facilitator
    participant Rec as routes/records.ts
    participant Gw as services/algorand.ts
    participant Algod as AlgoNode algod
    participant App as MedRailConsent

    Client->>API: POST /v1/records/summary + PAYMENT-SIGNATURE
    API->>Fac: verify $0.05 = 50000 microUSDC
    Fac-->>API: VERIFIED — no money has moved yet

    API->>Rec: await next() — handler
    Rec->>Rec: payer === requesterAddress — authorised caller
    Rec->>Gw: checkAccess(...)
    Gw-->>Rec: true — access IS authorised
    Rec->>Gw: logAccess(..., "consent_checked")<br/>records.ts:83-99 — inside try/catch

    Gw->>Algod: atc.execute(algod, 4)
    alt operator account out of ALGO
        Algod--xGw: insufficient funds
    else app account out of box MBR
        App--xGw: balance below minimum
    else algod 5xx or network blip
        Algod--xGw: no timeout, no retry — REL-003 open
    else validity window expires after 4 rounds
        Algod--xGw: transaction not confirmed
    else lost cross-process race — G-11
        App--xGw: predicted box "a"+patient+itob(N+1) not in the<br/>reference array because the contract wrote N+2
    end

    Gw-->>Rec: throws
    Rec->>Rec: catch — auditStatus = "pending"<br/>log structured event audit_write_failed
    Rec-->>API: HTTP 200 · the record · consentVerifiedOnChain true<br/>auditStatus pending · auditTxId null · auditSequence null

    API->>Fac: status is 200, below 400 — processSettlement
    Fac-->>API: settled
    API-->>Client: HTTP 200 + PAYMENT-RESPONSE header

    rect rgb(235, 250, 235)
    Note over Client,App: OUTCOME — the caller receives what they paid for.<br/>Access WAS authorised. Only the bookkeeping failed,<br/>and the response says so in a field rather than silently.
    end

    rect rgb(255, 245, 225)
    Note over Rec,App: WHAT THE OLD CODE DID — an unguarded await threw,<br/>the handler returned 500, and the SDK CANCELLED settlement.<br/>The caller kept their money and got nothing.<br/>What was destroyed was the SALE, not the payment.
    end
```

**Walkthrough.** Every listed cause is a real, reachable failure mode of `atc.execute`. The operator account's ALGO balance and the app account's MBR headroom are both unmonitored and unalerted (OPS-005 **NOT IMPLEMENTED**, finding **G-15**); there is no timeout or retry on `Algodv2` (`api/src/services/algorand.ts:5`, REL-003). `withPatientLock` serialises only within one process, and `api/fly.toml` now pins `max_machines_running = 1` so that assumption holds in the deployed configuration — at the cost of pinning MedRail to a single machine, which is finding **G-11**, open as a scaling constraint.

**The correction worth stating plainly.** An earlier revision of this document described this path as a settled payment lost to a 500 — the caller paying $0.05 and receiving nothing, with no refund path. That was **factually wrong**. `@x402/hono` calls `processSettlement` only when the handler returns a status below 400; a throw triggers `cancellationDispatcher.cancel({reason: "handler_threw"})` and a 4xx or 5xx triggers `cancel({reason: "handler_failed"})`, both of which return before settlement. There was never a way for an error response in this service to consume a caller's money. Credit for that belongs to x402 v2's protocol design, not to MedRail.

**What was genuinely at stake was the sale.** A legitimate, authorised, paid-for request that failed only at the bookkeeping step returned a 500 and earned nothing — MedRail did the work, held a valid grant, and cancelled its own settlement over a transient chain error. The `try/catch` at `records.ts:83-99` trades that for a delivered resource carrying `auditStatus: "pending"`, which is plainly the better bargain for both sides.

**What `"pending"` does and does not promise.** It is an accurate label on a degraded response, not eventual consistency. There is no durable outbox, no queue and no replay: a `"pending"` entry stays pending, and the only trace is the structured `audit_write_failed` event on stdout. The remaining options, in ascending order of cost:

| Option | Effect | Cost |
|---|---|---|
| Current: 200 with `auditStatus: "pending"` and a structured failure log | Resource delivered, the gap is visible to the caller and greppable by an operator | Implemented. No reconciliation. |
| Retry the write out of band | Audit eventually consistent | Requires durable local state, which the "no database" architecture does not have |
| Durable outbox with idempotent replay | Correct | A datastore, i.e. a change in architectural style |
| Bundle the audit call into the client's payment group | Fully atomic | Breaks off-the-shelf x402 client compatibility — explicitly rejected in `docs/ARCHITECTURE.md:95-108` |

The trade-off between "no database" and "never lose an audit entry" is genuine and consciously unresolved in this build. See [`./HLD.md`](./HLD.md) §5 and [`./ADRs/ADR-005-audit-write-as-follow-up-transaction.md`](./ADRs/ADR-005-audit-write-as-follow-up-transaction.md).

---

## 10. An autonomous agent completes a clinical task — discover, decide, pay, verify

> ### **STATUS: VALIDATED on TestNet.** Executed end to end, output captured, every payment settled.
> Produced by `api/scripts/agent-demo.ts`. This is a **manual verification script, not an automated test**, and it does **not** run in CI. It is the only diagram in this document whose subject is a *caller* rather than the service: everything below is one client with no MedRail account, no API key and no prior relationship, driving diagrams 1, 2, 4 and 6 in sequence to finish a single piece of work. Three roles appear in it, held by three separate accounts — the agent that pays (`UYBTLPHS…`, its own keypair), the patient that granted consent (`56LFG5EE…`, its own keypair), and the service that is paid (`2WDV2J2F…`). No account holds two of those roles.

```mermaid
sequenceDiagram
    autonumber
    participant Ag as Agent — agent-demo.ts
    participant API as MedRail API
    participant Fac as GoPlausible facilitator
    participant Gw as services/algorand.ts
    participant Algod as AlgoNode algod
    participant App as MedRailConsent 768743428

    Note over Ag: Given ONE task and ONE base URL.<br/>No account · no API key · no MedRail constants in the source.<br/>Signs with its own keypair UYBTLPHS… — the service does not hold it.

    rect rgb(235, 245, 255)
    Note over Ag,API: 1 — DISCOVER · costs nothing · proves nothing · asks for nothing
    Ag->>API: GET /
    API-->>Ag: 8 endpoints as method · path · price · gate<br/>contract appId 768743428 · network · networkCaip2 · arc56SpecUrl<br/>x402 version 2 · scheme exact · facilitator URL
    Ag->>Ag: reads the prices back out of the index<br/>triage $0.02 · interaction-check $0.02 · records/summary $0.05<br/>notes records/summary is gated by x402 PLUS on-chain consent
    Note over Ag,API: The agent now knows what exists, what it costs, and<br/>what is conditional. None of it was compiled in.
    end

    rect rgb(240, 240, 240)
    Note over Ag,Fac: 2 — TRIAGE $0.02 · the full x402 handshake, shown once
    Ag->>API: POST /v1/triage — unpaid
    API-->>Ag: 402 + PAYMENT-REQUIRED
    Ag->>Ag: ExactAvmScheme builds and signs an axfer<br/>asset 10458941 · amount 20000 · fee paid by the facilitator
    Ag->>API: POST /v1/triage + PAYMENT-SIGNATURE
    API->>Fac: verify
    Fac-->>API: verified · nothing settled yet
    API->>API: scoreTriage(...) — pure function over a static table, no model
    API->>Fac: handler returned 200 — processSettlement
    Fac-->>API: settled · tx DOSKCNKJ…FYKIA · sender UYBTLPHS… ≠ receiver 2WDV2J2F…
    API-->>Ag: 200 band=EMERGENCY score=70 + PAYMENT-RESPONSE
    end

    rect rgb(240, 240, 240)
    Note over Ag,Fac: 3 — INTERACTION CHECK $0.02 · same handshake, abbreviated
    Ag->>API: POST /v1/interaction-check + PAYMENT-SIGNATURE<br/>after its own 402 round trip
    API->>Fac: verify · then settle on the 200
    Fac-->>API: settled · tx PLBFDDAD…P7NVHQ
    API-->>Ag: 200 MAJOR — warfarin + aspirin
    Note over Ag: Two medications on board change the management of a<br/>suspected cardiac event. The agent needs the record.
    end

    rect rgb(235, 250, 235)
    Note over Ag,App: 4 — FREE PRE-FLIGHT · the step that avoids a wasted $0.05
    Ag->>API: GET /v1/consent/status — patient · requester · scope records:summary
    API->>Gw: checkAccess(patient, requester, scope)
    Gw->>Algod: atc.simulate — nothing submitted, no fee
    Algod->>App: evaluate check_access
    App-->>Algod: true
    Algod-->>Gw: returnValue true
    Gw-->>API: true
    API-->>Ag: 200 granted=true · cost $0.00
    alt granted is false
        Ag->>Ag: DECLINE — report the two paid findings and stop<br/>agent-demo.ts:194-197
        Note over Ag,App: No 402 requested · no payment signed · no money moved.<br/>THE AGENT NEVER PAYS TO BE TOLD NO.
    end
    end

    rect rgb(240, 240, 240)
    Note over Ag,App: 5 — GATED CALL $0.05 · the spend is now justified
    Ag->>API: POST /v1/records/summary + PAYMENT-SIGNATURE<br/>requesterAddress is the agent's OWN address
    API->>Fac: verify 50000 microUSDC
    Fac-->>API: verified · not settled
    API->>API: payerFromRequest — the payer must equal requesterAddress<br/>otherwise 403, see diagram 7
    API->>Gw: checkAccess — the server's own read, not the agent's word for it
    Gw->>App: simulate check_access
    App-->>Gw: true
    API->>Gw: logAccess(...) — audit append, signed by the ADMIN key
    Gw->>Algod: atc.execute
    Algod->>App: log_access — assert Txn.sender == admin
    App-->>Algod: next_seq recomputed on-chain
    Algod-->>Gw: audit appended · tx E6ZTGEAO… · txId returned to the caller
    Gw-->>API: txId + sequence
    API->>Fac: handler returned 200 — processSettlement
    Fac-->>API: settled · tx COMJ3TQO…GRK36A · round 66563944
    API-->>Ag: 200 · consentVerifiedOnChain true<br/>auditStatus recorded · auditTxId · the synthetic summary
    end

    rect rgb(255, 250, 235)
    Note over Ag,App: 6 — REPORT
    Ag->>Ag: one assessment, plus its own ledger<br/>$0.02 + $0.02 + $0.05 = $0.09 across 3 settled transactions<br/>zero accounts created · zero API keys issued · zero invoices
    end
```

**What the three transaction ids are.** Three settled payments, each from the agent's account (`UYBTLPHS…`) to the service's (`2WDV2J2F…`):

| Step | What it bought | Transaction |
|---|---|---|
| 2 | `/v1/triage` — $0.02 | `DOSKCNKJRXIMY2UDSDZ377LKPZQIZJW5JHCGUAGKOYV6KUCFYKIA` |
| 3 | `/v1/interaction-check` — $0.02 | `PLBFDDADW576IUCH62HGGYI4AJQNO3QXSENNDIBKAORWVMP7NVHQ` |
| 5 | `/v1/records/summary` — $0.05 | `COMJ3TQOGTKP6LXDJS7HZY7B45QZJQWXXJ23HQ3IDDQYD7GRK36A` |

Step 5 also produced an audit append on `768743428` and returned its id to the agent in the response body: `E6ZTGEAOTLJQDYOUVBYJYL7LKTXHBGXGVTBKN3SR2NUPWJ2PIGQA`, confirmed at round 66563942. Its `requester` argument decodes to the agent's address — the entry attributes the access to the party that actually paid for it.

Each resolves at `https://lora.algokit.io/testnet/transaction/<TXID>`. Full record in [`../07_Testing/Test_Results.md`](../07_Testing/Test_Results.md) §5.7.

**Three provisioning steps precede the run and are not part of it.** `api/scripts/provision-agent-wallet.ts` created the agent's wallet — funding `YKGXFTZU…`, the agent's own USDC opt-in `KOALP5W2…`, and a $1.00 float `3ODGZ44Z…`. `api/scripts/provision-patient-wallet.ts` created the patient's wallet `56LFG5EE…`, funded with 150,000 µALGO in `GCYA23PH…`, so that the grant would come from an account that is neither the payer nor the payee. And `api/scripts/grant-consent.ts` recorded the patient's grant to that specific agent, `IG4XEBTM…`, signed by the patient and submitted straight to Algorand with the backend out of the path.

**An earlier run of the same script, before the agent had a wallet of its own,** settled `POAQNSOP…`, `W3Z55BZY…` and `5CO5XV7M…` with audit append `5HYV5B2L…`. Those transactions are real and remain checkable; in that configuration a single account was payer, patient and `payTo` at once.

**Walkthrough.** Steps 2, 3 and 5 are diagrams 2 and 4 verbatim — nothing in the service behaves differently because the caller is a program. What is new is step 1 and step 4, and neither of them is a payment.

**Step 1 is why the agent needs no documentation.** The only MedRail-specific value in `agent-demo.ts` is `API_BASE`. The endpoint paths it calls, the prices it pays, the fact that one route is consent-gated, the App ID it could verify against, and the ARC-56 URL it would need in order to do so are all read out of `GET /` at runtime (`agent-demo.ts:144-158`). A price change on the server changes what the agent pays, with no client release. See [`./System_Architecture.md`](./System_Architecture.md) §2.3.

**Step 4 is the sharpest beat in the flow, and the argument is economic rather than technical.** The gated endpoint costs $0.05 and can refuse. The oracle that decides whether it will refuse costs nothing and answers the same question against the same contract state. An agent that reads `gate` in step 1 finds `GET /v1/consent/status` sitting next to it in the same index, and can therefore turn a possible loss into a free answer. The `alt` branch is not decoration — `agent-demo.ts:194-197` returns early and reports on the two findings it already paid for.

Note precisely what the pre-flight does and does not save, because a denial is **already** free to the caller (diagram 5: a 403 cancels settlement). What it saves is a round trip, a chain fee that MedRail pays for the `consent_denied` audit write, and an entry on the patient's own audit trail recording an attempt that was never going to succeed. The agent that checks first leaves no such trace. That is the free route earning its place in the index rather than merely being cheap.

**Step 5 shows the composition the project exists for, from the outside.** One HTTP request is simultaneously a settled USDC payment, an on-chain authorisation read and an immutable audit append — and the agent receives the audit transaction id in its own response body, so it can confirm on a public explorer that it was recorded as having read the record. That is a caller being handed the evidence against itself, which is a stronger property than a service promising to keep logs.

**Honest limits, the same ones that govern every other diagram here.**

1. **It is not an automated test.** No runner invokes it, nothing asserts on its output, and CI never executes it. It proves the path works when run; it does not protect the path from regressing. [`../07_Testing/Test_Plan.md`](../07_Testing/Test_Plan.md) §3.5.1 sizes the conversion.
2. **The API was a local process.** Nothing is publicly hosted, so "an agent discovered the service" means an agent was pointed at `http://localhost:4021`. Discovery from a public URL has never happened, because there is no public URL.
3. **The payer is independent; the money is not external.** The agent signs with its own `AGENT_MNEMONIC` (`agent-demo.ts:37`) — keypair `UYBTLPHS…`, which this service does not hold — so all three settlements have sender `UYBTLPHS…` and receiver `2WDV2J2F…`, confirmed on the checked transactions against `testnet-idx.algonode.cloud` at rounds 66563930 and 66563944, `fee: 0` and facilitator-sponsored. What that does *not* demonstrate is demand: the agent's TestNet USDC float was seeded from the project's own wallet, because TestNet USDC has no other practical source. No external or unrelated party has paid for this service.
4. **The patient is a third account, not a second role on an existing one.** `PATIENT_ADDRESS` names `56LFG5EE…` (`agent-demo.ts:50`), a wallet with its own keypair that is neither the payer nor the payee, and that patient granted this specific agent access on-chain in `IG4XEBTM…`, signing for itself. The requester asserted at step 5 is the agent's own address, the grant belongs to someone else, and the payer binding of diagram 7 therefore does real work here rather than holding trivially. What three separate keypairs still do not buy is a patient with an independent motive: that wallet's TestNet ALGO was funded from the project's own account in `GCYA23PH…`, for the same reason as the agent's float in limit 3.
5. **There is nothing behind the gate.** `SYNTHETIC_RECORD` is a fixed constant (`api/src/routes/records.ts:17-23`) returned regardless of `patientId`, and neither priced compute endpoint contains a model — `scoreTriage` and `checkInteractions` are pure functions over static tables. The agent paid real money for a real authorisation decision over a placeholder record.
6. **The evidence file is the run's own account of itself.** Like `e2e-proof.ts`, `e2e-consent-proof.ts`, `verify-g01-fix.ts` and both provisioning scripts, this one now writes to `contracts/artifacts/` — `agent-run.json`, produced by `writeArtifact` (`agent-demo.ts:81-101`, called from `report()` at `:259-267`) with the agent and patient addresses, the three payments and their explorer links, the total, and the audit transaction id. Addresses only; no key material is written. But it is written by the same process it describes and asserts nothing, so it is a record, not an attestation. The check that does not depend on MedRail is still reading the transaction ids above off the public indexer.
