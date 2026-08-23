# MedRail — Activity Diagrams

**Purpose:** show the control flow of the system's five recurring processes — request handling, the consent state machine, the audit-append decision, the operational deploy-and-prove sequence, and CI.

**Status of this document:** Descriptive of the working tree on branch `main`. Status labels per the project fact ledger. Every flow is drawn with its failure branches intact rather than smoothed over — the interesting part of a control-flow diagram is what happens when a step does not succeed.

Related: [`./Sequence_Diagrams.md`](./Sequence_Diagrams.md) · [`./LLD.md`](./LLD.md) · [`./HLD.md`](./HLD.md) · [`../02_Requirements/SRS.md`](../02_Requirements/SRS.md) · [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md)

---

## 1. Request lifecycle through the middleware stack

CORS and the payment middleware are mounted on `"*"` and run for every request; the payment middleware enforces only on the three configured route keys and passes everything else through untouched. The three rate limiters are mounted on specific paths.

```mermaid
flowchart TD
    START(["HTTP request"]) --> CORS["cors middleware<br/>origin *, methods GET POST OPTIONS<br/>allowHeaders deliberately unset<br/>app.ts:22-35"]
    CORS --> PRE{"OPTIONS preflight?"}
    PRE -->|"yes"| REFLECT["Reflect Access-Control-Request-Headers<br/>expose PAYMENT-REQUIRED, PAYMENT-RESPONSE"] --> DONE1(["204"])
    PRE -->|"no"| RLIM{"path rate-limited?<br/>consent/status 60/min · arc56 30/min<br/>records/summary 30/min · app.ts:44-46"}
    RLIM -->|"window exhausted"| C429(["HTTP 429 · Retry-After<br/>RATE_LIMITED · retryable true<br/>no facilitator call is made"])
    RLIM --> PAYMW["paymentMiddleware inside the outage wrapper<br/>app.ts:58-175, wrapped at :73-105"]

    PAYMW --> ISPRICED{"method + path in the priced map?<br/>POST /v1/triage · POST /v1/interaction-check<br/>POST /v1/records/summary"}
    ISPRICED -->|"no — the 5 free routes"| HANDLER

    ISPRICED -->|"yes"| INIT{"resourceServer already initialised?"}
    INIT -->|"no"| SUPPORTED["GET /supported from the facilitator<br/>resolves asset 10458941 and extra.feePayer"]
    SUPPORTED --> SUPOK{"fetch succeeded?"}
    SUPOK -->|"no"| C503(["HTTP 503 · Retry-After 30<br/>PAYMENT_FACILITATOR_UNAVAILABLE · retryable true<br/>structured facilitator_unavailable log"])
    SUPOK -->|"yes"| CACHE["cache payment kinds for the process lifetime<br/>PERF-001 IMPLEMENTED"]
    CACHE --> HASSIG
    INIT -->|"yes"| HASSIG

    HASSIG{"PAYMENT-SIGNATURE header present?"}
    HASSIG -->|"no"| C402(["HTTP 402 · empty body · PAYMENT-REQUIRED base64<br/>cache-control no-store<br/>HANDLER AND ZOD NEVER RUN"])
    HASSIG -->|"yes"| VERIFY["facilitator VERIFY — is this payment valid?"]
    VERIFY --> VEROK{"verified?"}
    VEROK -->|"no"| C402
    VEROK -->|"yes"| NOTYET["VERIFIED, NOT SETTLED — no money has moved"]
    NOTYET --> HANDLER

    HANDLER["route handler"] --> PARSE["parse the JSON body, falling back to an empty object<br/>then zod safeParse with algorandAddress"]
    PARSE --> VALID{"schema valid?"}
    VALID -->|"no"| C400(["HTTP 400 invalid request + zod flatten"])
    VALID -->|"yes"| LOGIC["business logic"]
    LOGIC --> THREW{"threw?"}
    THREW -->|"yes"| ONERR["app.onError · generate requestId<br/>log method, path, message, stack<br/>app.ts:113-140"]
    ONERR --> C500(["HTTP 500 INTERNAL_ERROR + requestId<br/>no exception text in the body"])
    THREW -->|"no"| OK["2xx response body composed"]

    OK --> GATE{"status below 400?"}
    C400 --> GATE
    C500 --> GATE
    GATE -->|"yes"| SETTLE(["processSettlement · 200 + PAYMENT-RESPONSE"])
    GATE -->|"no"| CANCEL(["cancellationDispatcher.cancel<br/>THE CALLER IS NOT CHARGED"])
```

**Four consequences of this ordering, all deliberate.**

1. **Settlement is last, and conditional.** `@x402/hono` verifies before the handler and settles only when the handler's status is below 400; a throw or any 4xx/5xx routes to `cancellationDispatcher.cancel(...)` instead. Every error terminal on this diagram — 429, 402, 400, 500, 503 — costs the caller nothing. REL-002 **VALIDATED — satisfied by the SDK**, an inherited property of x402 v2 rather than MedRail's own engineering.
2. **402 precedes 400.** The gate closes before any handler runs, so an unpaid malformed request returns 402. `api/test/x402-flow.spec.ts:48-59` records this in a comment and asserts `expect([400, 402]).toContain(res.status)` — documenting the ordering without freezing an incidental outcome. A *paid* malformed request returns 400 and the settlement is cancelled, so no refund path is needed.
3. **Rate limits run before the payment middleware**, so a caller who has exhausted a window cannot make MedRail talk to the facilitator either. They are scoped to the three paths that are free *to the caller*, since the priced happy paths are economically self-limiting.
4. **The two remaining error terminals are honest, not opaque.** The 503 carries a stable code, `Retry-After` and `retryable: true`, so a calling agent backs off rather than concluding the service is broken. The 500 carries a `requestId` the caller can quote and nothing else — internal exception text no longer crosses the boundary (SEC-010, SEC-011 **IMPLEMENTED**).

---

## 2. Consent state machine

Three stored status codes and **no stored expiry state**: `STATUS_NONE = 0`, `STATUS_GRANTED = 1`, `STATUS_REVOKED = 2` (`contracts/smart_contracts/consent/contract.py:46-48`). Expiry is a read-time predicate evaluated by `check_access`, never written back to the box.

```mermaid
stateDiagram-v2
    state "No box - status effectively NONE" as NoBox
    state "Granted - status 1, box exists" as Granted
    state "Revoked - status 2, box retained" as Revoked

    [*] --> NoBox
    NoBox --> Granted : grant_access, patient is Txn.sender, creates the box, app pays 22500 microALGO MBR, total_grants_active plus 1
    NoBox --> NoBox : revoke_access, the no-such-grant assert fails, transaction rejected atomically, FR-021
    Granted --> Granted : grant_access again refreshes granted_at and expires_at, was_active_before true, counter unchanged
    Granted --> Revoked : revoke_access, patient is Txn.sender, status set to 2, timestamps preserved, total_grants_active minus 1 and total_revocations plus 1
    Revoked --> Granted : grant_access again, box REUSED with no new MBR, was_active_before false, total_grants_active plus 1, FR-022 VALIDATED
    Revoked --> Revoked : revoke_access again, box exists so the assert passes, status already 2, counters unchanged

    note right of Granted
      EXPIRY IS NOT A STATE.
      check_access returns true only while expires_at == 0
      OR latest_timestamp is less than expires_at.
      Past expiry check_access returns false while the stored
      status is STILL 1, so get_grant and check_access disagree.
      The API only ever calls check_access, so it is correct.
      FR-019, FR-023.
    end note

    note right of Revoked
      Boxes are NEVER deleted. No method calls a delete.
      MBR is monotonically non-decreasing for the life of the
      application. withdraw_excess is the only outflow and
      cannot breach the minimum balance.
    end note
```

**Live state on application `768743428`:** `total_grants_active = 4` and `total_audit_entries = 5`. The grant boxes come from `contracts/scripts/exercise_contract.py`; from the repeatable proof scripts `api/scripts/e2e-consent-proof.ts` and `api/scripts/verify-g01-fix.ts`, each of which issues a real grant before making its paid call; and from `api/scripts/grant-consent.ts`, which records a patient's grant to a named agent as a standalone transaction the patient signs itself — the path used for `IG4XEBTM…`, the grant that let the independent agent of [`./Sequence_Diagrams.md`](./Sequence_Diagrams.md) §10 read a record it does not own.

**Counter semantics worth stating.** Nothing decrements `total_grants_active` on expiry, so it means "grant boxes not yet revoked", not "grants currently valid". Finding **G-32** is open on exactly that: the name promises more than the counter delivers, and anyone reading it as a dashboard would be wrong.

**Why the box is reused rather than recreated.** `grant_access` keys the counter off the prior *status*, not prior *existence* (`contract.py:163-174`), with the reasoning stated in-code. A naive `if not box.exists()` would double-count reactivations. FR-022 **VALIDATED** by `test_consent.py::test_regrant_after_revoke_reactivates`.

---

## 3. Audit-append decision flow

The flagship mechanism, and the one with the most failure branches. It has executed on live TestNet — `total_audit_entries = 5`, first write `4YLKLQKK…` at sequence 1.

```mermaid
flowchart TD
    A(["POST /v1/records/summary · payment VERIFIED, not yet settled"]) --> B["zod safeParse with algorandAddress<br/>length 58 AND checksum"]
    B --> C{"valid shape?"}
    C -->|"no"| C400(["400 · settlement cancelled · caller not charged"])
    C -->|"yes"| PB["payerFromRequest — decode PAYMENT-SIGNATURE,<br/>recover the signer of paymentGroup at paymentIndex"]
    PB --> PBQ{"payer equals requesterAddress?"}
    PBQ -->|"no, or no payer at all"| C403(["403 requesterAddress must match the payer<br/>settlement cancelled · no chain call is made"])
    PBQ -->|"yes"| D["checkAccess via simulate<br/>the requester is now proven, not asserted"]
    D --> E{"granted?"}

    E -->|"NO"| F["logAccess with action consent_denied<br/>records.ts:58 · .catch swallows any failure"]
    F --> G(["403 + charged false + hint<br/>settlement cancelled · returned whether<br/>or not the audit write succeeded"])

    E -->|"YES"| H["logAccess action=consent_checked<br/>records.ts:83-99 · INSIDE try/catch"]
    H --> I["withPatientLock — chain onto this patient's queue<br/>IN-PROCESS ONLY, algorand.ts:123-138"]
    I --> J["getTransactionParams — outbound 1"]
    J --> K["getAuditCount — outbound 2 and 3<br/>its own getTransactionParams plus simulate · G-33"]
    K --> L["predictedSeq = currentCount + 1<br/>boxes = ['s'+patient, 'a'+patient+itob(predictedSeq)]"]
    L --> M["atc.execute(algod, 4) — outbound 4, admin-signed"]

    M --> N{"contract asserts Txn.sender == admin"}
    N -->|"not admin"| FAIL1["transaction rejected — SEC-001"]
    N -->|"admin"| O["next_seq recomputed ON-CHAIN from audit_seq<br/>NOT from the client prediction"]
    O --> P{"is the box the contract needs<br/>in the declared reference array?"}
    P -->|"no — stale prediction, lost race · G-11"| FAIL2["transaction rejected<br/>audit trail INTACT, ledger not corrupted"]
    P -->|"yes"| Q{"app account has MBR headroom?<br/>18900 for a new audit_seq box<br/>plus 59300 for the log box"}
    Q -->|"no"| FAIL3["transaction rejected — REL-006"]
    Q -->|"yes"| R["write audit_seq and audit_log<br/>total_audit_entries plus 1"]
    R --> S(["200 · record · auditStatus recorded<br/>auditTxId + auditSequence · THEN settle"])

    FAIL1 --> T
    FAIL2 --> T
    FAIL3 --> T
    M -->|"operator out of ALGO · algod 5xx · 4-round timeout"| T
    T["throws — caught by the try/catch"] --> U["auditStatus = pending<br/>structured audit_write_failed log line"]
    U --> V(["200 · record · auditStatus pending<br/>auditTxId and auditSequence null<br/>THEN settle — the sale is kept"])
```

**Both branches are guarded, and they degrade differently on purpose.** The denied branch swallows the failure because it has nothing to report to the caller; the allowed branch catches it and *reports* it, in a field the caller can read. Before that guard existed, an unguarded `await` on the success path turned a transient chain error into a 500 — and because settlement is cancelled on a 5xx, what that 500 destroyed was **the sale**, not the caller's money. MedRail did the work, held a valid grant, and earned nothing. Trading an unrecoverable 500 for a delivered resource with a flagged audit entry is the better bargain on both sides.

**What `"pending"` promises, and what it does not.** It is an accurate label on a degraded response, not eventual consistency. There is no outbox, no retry scheduler and no replay, so a pending entry stays pending; the only trace is the `audit_write_failed` line on stdout, which nothing collects (finding **G-15**). The value of the field is that the degradation is **visible instead of silent** — a consumer needing a provable audit entry checks one field rather than inferring it from a null.

**What the contract protects.** `log_access` recomputes `next_seq` from on-chain state (`contract.py:231-233`), so a stale client-side prediction **cannot** corrupt or overwrite the audit trail. The prediction exists only because the AVM requires every touched box to be declared in advance. A lost race therefore yields a *rejected transaction*, not a bad record — and the `try/catch` converts that rejection into `auditStatus: "pending"`.

**How the flow finally got exercised on TestNet.** `log_access` has exactly one caller in the repository: `api/src/routes/records.ts`. Reaching it requires **both** a settled $0.05 payment **and** a live grant for the `records:summary` scope, and for a long time no script did both — `contracts/scripts/exercise_contract.py` stops at `revoke_access`, and `api/scripts/e2e-proof.ts` pays only `/v1/triage`. `api/scripts/e2e-consent-proof.ts` closes that gap: it grants consent from a funded account, makes the paid call, and writes `contracts/artifacts/e2e-consent-proof.json` with the grant, payment and audit transaction ids. It is repeatable, and FR-012 and FR-025 are now **VALIDATED on-chain**.

---

## 4. Operational flow — deploy, exercise, prove

The three Python scripts and one TypeScript script that produced every on-chain artefact in this repository.

```mermaid
flowchart TD
    subgraph S0["Stage 0 — prerequisites, manual"]
        A1["contracts/.env — DEPLOYER_ADDRESS, DEPLOYER_MNEMONIC<br/>gitignored, never tracked — SEC-005 VALIDATED"]
        A2["Fund the deployer from lora.algokit.io/testnet/fund"]
        A3["scripts/opt_in_usdc.py — AssetOptInParams for ASA 10458941<br/>zero-value prerequisite, not a transfer"]
    end

    subgraph S1["Stage 1 — compile"]
        B1["python -m puyapy smart_contracts/consent/contract.py --out-dir artifacts"]
        B2["artifacts: approval.teal · clear.teal · MedRailConsent.arc56.json<br/>generated AND committed"]
    end

    subgraph S2["Stage 2 — deploy · scripts/deploy_testnet.py"]
        C1{"NETWORK env — defaults to testnet<br/>mainnet requires an explicit opt-in"}
        C2["require_algo(300000) — refuse to proceed underfunded"]
        C3["AppFactory.deploy — IDEMPOTENT per app_name + creator<br/>on_schema_break Fail, on_update AppendApp"]
        C4{"operation_performed == Create?"}
        C5["fund the app account with 5 ALGO for box MBR<br/>tx KYH3H5CG2CCUPUUTJIBX47WD4RWSUV3QWTEUJQRQFYLWO5YAO3QA"]
        C6["skip re-funding — preserve the prior fund_txid"]
        C7["write artifacts/deploy_testnet.json<br/>app_id 768743428 · create_txid null on a re-run"]
    end

    subgraph S3["Stage 3 — exercise · scripts/exercise_contract.py"]
        D1["create two throwaway accounts, fund each with 1 ALGO"]
        D2["request_access — 5XIADMCGFP5I7H7AS656RXZS7MFEEPCVJGLA7T3SVE6XDEYSGFFA"]
        D3["grant_access — X2BQ5FD4MW52B75WQGDB67TEULYLN7FHVFO6ZOBNI74PNCAKVOUA"]
        D4["check_access — asserts True"]
        D5["revoke_access — OV2J2T5VWMIQG64JYGL7JEGZKKNZNKCMNIQU6AC4PDRQYZ6ZOO5A"]
        D6["check_access — asserts False"]
        D7["NEVER CALLS log_access — root cause of E-1"]
    end

    subgraph S4["Stage 4 — prove payment · api/scripts/e2e-proof.ts"]
        E1["start the API locally with api/.env loaded"]
        E2["stock @x402/fetch + ExactAvmScheme, no MedRail-specific code"]
        E3["POST /v1/triage — 402 then signed retry then 200"]
        E4["write artifacts/e2e-proof.json<br/>OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ"]
        E5["ONLY /v1/triage — never the consent-gated route"]
    end

    subgraph S5["Stage 5 — NOT PERFORMED"]
        F1["MainNet deployment — NOT DONE"]
        F2["Public HTTPS hosting — NOT DONE, no container ever built"]
        F3["Bazaar discovery listing — NOT DONE"]
        F4["A paid /v1/records/summary call producing an audit entry — NOT DONE"]
    end

    A1 --> A2 --> A3 --> B1 --> B2 --> C1
    C1 --> C2 --> C3 --> C4
    C4 -->|"yes"| C5 --> C7
    C4 -->|"no — already existed"| C6 --> C7
    C7 --> D1 --> D2 --> D3 --> D4 --> D5 --> D6 --> D7
    C7 --> E1 --> E2 --> E3 --> E4 --> E5
    D7 -.->|"gap"| F4
    E5 -.->|"gap"| F4
```

**Why `create_txid` is `null`.** `deploy_testnet.py` records it only when `operation_performed == Create`. The run captured in the repository was an idempotent re-run against the already-deployed application, so the field is null while `fund_txid` is preserved from the prior run by explicit design (the script reads the existing file before rewriting it). The application genuinely exists — verified independently on the indexer at round 66088624 with `deleted: false`. State this rather than glossing it.

**Deliberate MainNet friction.** Both Python scripts default `NETWORK` to `testnet` and reject anything other than `testnet`/`mainnet`, so a bare run can never accidentally touch MainNet. `deploy_testnet.py` also changes its funding-hint text on MainNet to "a real ALGO purchase … this is MainNet, real funds". Good operational hygiene, recorded in the script docstrings.

**Nothing here is automated.** CI runs none of these stages (CI-3), `scripts/` at the repository root is empty (DOC-6), and there is no deployment stage anywhere in the pipeline.

---

## 5. CI pipeline flow

`.github/workflows/ci.yml` — three jobs, all `ubuntu-latest`, all independent and parallel.

```mermaid
flowchart TD
    TRIG{"trigger"}
    TRIG -->|"push to branches main"| DEAD["THE REPOSITORY HAS NO main BRANCH.<br/>Its only branch is master.<br/>NO PUSH HAS EVER TRIGGERED THIS WORKFLOW.<br/>CI-1 · HIGH · OPS-006 PARTIALLY IMPLEMENTED"]
    TRIG -->|"pull_request"| RUN["would run — but the repo has no PRs"]

    RUN --> J1 & J2 & J3

    subgraph J1["job: contract"]
        A1["actions/checkout@v4"]
        A2["setup-python 3.12 — no cache: CI-4"]
        A3["pip install -r requirements-dev.txt<br/>puyapy==5.9.0, algorand-python-testing==1.1.0"]
        A4["python -m puyapy smart_contracts/consent/contract.py"]
        A5["pytest tests/ -q — 28 tests, passes locally in 0.15 s"]
        A1-->A2-->A3-->A4-->A5
    end

    subgraph J2["job: api"]
        B1["actions/checkout@v4"]
        B2["setup-node 20 — no cache: CI-4"]
        B3["npm ci — lockfile respected HERE but not in the Dockerfile: D-4"]
        B4["npx tsc --noEmit — strict, passes locally"]
        B5["npm run build"]
        B6["npx vitest run — 93 tests, 2.35 s locally"]
        B7{"x402-flow.spec.ts reaches facilitator.goplausible.xyz"}
        B8["A THIRD-PARTY OUTAGE = RED BUILD with a misleading failure<br/>CI-2 · tests are not hermetic"]
        B1-->B2-->B3-->B4-->B5-->B6-->B7-->B8
    end

    subgraph J3["job: web"]
        C1["actions/checkout@v4"]
        C2["setup-node 20 — no cache"]
        C3["npm ci"]
        C4["npx tsc --noEmit -p tsconfig.json — passes locally"]
        C5["next build with NEXT_PUBLIC_API_BASE and NEXT_PUBLIC_NETWORK<br/>compiles in 6.3 s, 2 static routes both prerendered"]
        C6["NO TEST STEP — the frontend has zero tests of any kind"]
        C1-->C2-->C3-->C4-->C5-->C6
    end

    A5 --> END
    B8 --> END
    C6 --> END
    END{"pipeline ends here"}
    END --> MISSING["ABSENT FROM THE PIPELINE — CI-3<br/>no pip-audit / Dependabot / CodeQL — SEC-014<br/>coverage measured, but no threshold gate<br/>no container image build in CI — both images built by hand, 2026-08-22<br/>no artifact publishing<br/>no deployment stage"]
```

**The precise statement of CI-1, which matters because it is easy to overstate.** The workflow is correct in content and every job it defines passes locally: API typecheck **PASS**, API build **PASS**, API tests **93 passed**, contract tests **28 passed**, web typecheck **PASS**, web build **PASS**. The problem is the trigger, not the code. `on.push.branches` is `[main]` while the repository's only branch is `master`, so the workflow has never fired on a push, and the repository has no pull requests for the `pull_request` trigger to catch. **The green badge is not green — it has never run.** The fix is one line, either way round: rename the branch, or change the trigger.

**CI-2 is a design consequence, not an accident.** `api/test/x402-flow.spec.ts` imports `api/src/app.ts`, whose payment middleware fetches `/supported` from the live facilitator — the same coupling that produces R-1 at runtime. Hermetic tests would need a stubbed facilitator client, which the SDK's `HTTPFacilitatorClient` seam makes straightforward. **RECOMMENDED**, not present.

**CI-4** — neither `setup-node` nor `setup-python` declares a `cache:` key, so every run re-downloads all dependencies. Low severity, pure wall-clock cost.
