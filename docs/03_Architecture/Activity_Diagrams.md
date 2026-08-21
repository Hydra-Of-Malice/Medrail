# MedRail — Activity Diagrams


> **⚠ Correction notice.** Parts of this document were written against a review finding that was
> later proven wrong. Settlement in x402 v2 happens **only** on a sub-400 response, so **no error
> path in MedRail can consume a settled payment** — and consent-denied calls (HTTP 403) are **not
> charged**, contrary to `API.md`, `SECURITY.md`, and the `paidButDenied` field. The audit-sequence
> race causes a **rejected transaction**, not a corrupted log. See
> [`CORRECTIONS.md`](../CORRECTIONS.md) — it supersedes any statement here that contradicts it.

**Purpose:** show the control flow of the system's five recurring processes — request handling, the consent state machine, the audit-append decision, the operational deploy-and-prove sequence, and CI.

**Status of this document:** Descriptive of commit `32ffd73` on branch `master`. Status labels per the project fact ledger. Two of the five flows contain a defect that is drawn explicitly rather than smoothed over: the audit-append flow (R-2) and the CI flow (CI-1).

Related: [`./Sequence_Diagrams.md`](./Sequence_Diagrams.md) · [`./LLD.md`](./LLD.md) · [`./HLD.md`](./HLD.md) · [`../02_Requirements/SRS.md`](../02_Requirements/SRS.md) · [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md)

---

## 1. Request lifecycle through the middleware stack

Both middlewares are mounted on `"*"` and therefore run for every request; the payment middleware enforces only on the three configured route keys and passes everything else through untouched.

```mermaid
flowchart TD
    START(["HTTP request"]) --> CORS["cors middleware<br/>origin *, methods GET POST OPTIONS<br/>allowHeaders deliberately unset<br/>app.ts:20-33"]
    CORS --> PRE{"OPTIONS preflight?"}
    PRE -->|"yes"| REFLECT["Reflect Access-Control-Request-Headers<br/>expose PAYMENT-REQUIRED, PAYMENT-RESPONSE"] --> DONE1(["204"])
    PRE -->|"no"| PAYMW["paymentMiddleware<br/>app.ts:37-50"]

    PAYMW --> ISPRICED{"method + path in the priced map?<br/>POST /v1/triage · POST /v1/interaction-check<br/>POST /v1/records/summary"}
    ISPRICED -->|"no — the 4 free routes and /"| HANDLER

    ISPRICED -->|"yes"| INIT{"resourceServer already initialised?"}
    INIT -->|"no"| SUPPORTED["GET /supported from the facilitator<br/>resolves asset 10458941 and extra.feePayer"]
    SUPPORTED --> SUPOK{"fetch succeeded?"}
    SUPOK -->|"no"| ERR500A(["HTTP 500 · no PAYMENT-REQUIRED<br/>no 503, no Retry-After<br/>FINDING R-1 · REL-001 NOT IMPLEMENTED"])
    SUPOK -->|"yes"| CACHE["cache payment kinds for the process lifetime<br/>PERF-001 IMPLEMENTED"]
    CACHE --> HASSIG
    INIT -->|"yes"| HASSIG

    HASSIG{"PAYMENT-SIGNATURE header present?"}
    HASSIG -->|"no"| C402(["HTTP 402 · empty body · PAYMENT-REQUIRED base64<br/>cache-control no-store<br/>HANDLER AND ZOD NEVER RUN"])
    HASSIG -->|"yes"| SETTLE["facilitator verify + settle"]
    SETTLE --> SETOK{"settled?"}
    SETOK -->|"no"| C402
    SETOK -->|"yes"| PAID["MONEY HAS MOVED — everything below is post-settlement"]
    PAID --> HANDLER

    HANDLER["route handler"] --> PARSE["parse the JSON body, falling back to an empty object<br/>then zod safeParse"]
    PARSE --> VALID{"schema valid?"}
    VALID -->|"no"| C400(["HTTP 400 invalid request + zod flatten<br/>on a priced route the caller has ALREADY PAID"])
    VALID -->|"yes"| LOGIC["business logic"]
    LOGIC --> THREW{"threw?"}
    THREW -->|"yes"| ONERR["app.onError<br/>console.error(err)<br/>app.ts:58-61"]
    ONERR --> ERR500B(["HTTP 500 with err.message returned in the body<br/>internal text disclosed — SEC-011 NOT IMPLEMENTED"])
    THREW -->|"no"| OK(["HTTP 200 + JSON<br/>+ PAYMENT-RESPONSE on a priced route"])
```

**Three consequences of this ordering, all deliberate or documented.**

1. **402 precedes 400.** The gate closes before any handler runs, so an unpaid malformed request returns 402. `api/test/x402-flow.spec.ts:48-59` records this in a comment and asserts `expect([400, 402]).toContain(res.status)` — documenting the ordering without freezing an incidental outcome.
2. **A paid malformed request still returns 400, after payment.** No refund path exists. Not currently a listed finding; recorded here because it is the same class of problem as R-2.
3. **The 500 branches are the system's two reliability findings.** `ERR500A` is R-1 (facilitator); `ERR500B` covers R-3 (address checksum), R-4 (algod timeout) and R-2 (post-settlement audit failure).

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

**Live state on application `768743428`:** `total_requests = 2`, `total_grants_active = 0`, `total_revocations = 2`, `total_audit_entries = 0`, with **2 grant boxes present, both in the Revoked state**. The counters indicate `contracts/scripts/exercise_contract.py` was run twice; the second run's transaction ids are not recorded in the repository.

**Counter semantics worth stating.** Nothing decrements `total_grants_active` on expiry, so it means "grant boxes not yet revoked", not "grants currently valid". Anyone reading the counters as a dashboard should know that.

**Why the box is reused rather than recreated.** `grant_access` keys the counter off the prior *status*, not prior *existence* (`contract.py:156-167`), with the reasoning stated in-code. A naive `if not box.exists()` would double-count reactivations. FR-022 **VALIDATED** by `test_consent.py::test_regrant_after_revoke_reactivates`.

---

## 3. Audit-append decision flow

This is the flow that E-1 says has never run on live infrastructure.

```mermaid
flowchart TD
    A(["POST /v1/records/summary · payment ALREADY SETTLED"]) --> B["zod safeParse — length 58 only, no checksum"]
    B --> C{"valid shape?"}
    C -->|"no"| C400(["400 · caller already paid"])
    C -->|"yes"| D["checkAccess via simulate<br/>NOTE: requesterAddress is caller-asserted — S-1"]
    D --> E{"granted?"}

    E -->|"NO"| F["logAccess with action consent_denied<br/>records.ts:37 WRAPPED IN A CATCH THAT SWALLOWS THE ERROR"]
    F --> G(["403 + paidButDenied true<br/>returned whether or not the audit write succeeded"])

    E -->|"YES"| H["logAccess action=consent_checked<br/>records.ts:49 NOT WRAPPED"]
    H --> I["withPatientLock — chain onto this patient's queue<br/>IN-PROCESS ONLY, algorand.ts:123-138"]
    I --> J["getTransactionParams — outbound 1"]
    J --> K["getAuditCount — outbound 2 and 3<br/>its own getTransactionParams plus simulate"]
    K --> L["predictedSeq = currentCount + 1<br/>boxes = ['s'+patient, 'a'+patient+itob(predictedSeq)]"]
    L --> M["atc.execute(algod, 4) — outbound 4, admin-signed"]

    M --> N{"contract asserts Txn.sender == admin"}
    N -->|"not admin"| FAIL1["transaction rejected — SEC-001"]
    N -->|"admin"| O["next_seq recomputed ON-CHAIN from audit_seq<br/>NOT from the client prediction"]
    O --> P{"is the box the contract needs<br/>in the declared reference array?"}
    P -->|"no — stale prediction, lost cross-process race D-7"| FAIL2["transaction rejected<br/>audit trail INTACT, ledger not corrupted"]
    P -->|"yes"| Q{"app account has MBR headroom?<br/>18900 for a new audit_seq box<br/>plus 59300 for the log box"}
    Q -->|"no"| FAIL3["transaction rejected — REL-006"]
    Q -->|"yes"| R["write audit_seq and audit_log<br/>total_audit_entries plus 1"]
    R --> S(["200 + record + auditTxId + auditSequence"])

    FAIL1 --> T
    FAIL2 --> T
    FAIL3 --> T
    M -->|"operator out of ALGO · algod 5xx · 4-round timeout"| T
    T["throws — NO .catch() on this path"] --> U["app.onError"]
    U --> V(["HTTP 500 AFTER A SETTLED PAYMENT<br/>FINDING R-2 · REL-002 NOT IMPLEMENTED<br/>no refund, no retry token, no idempotency key"])
```

**The asymmetry is the finding.** Both branches call the same function against the same infrastructure with the same failure modes. The denied branch swallows failure and still returns a coherent 403; the allowed branch does not. The perverse result is that refusing service is the better-engineered outcome.

**What the contract protects.** `log_access` recomputes `next_seq` from on-chain state (`contract.py:224-226`), so a stale client-side prediction **cannot** corrupt or overwrite the audit trail. The prediction exists only because the AVM requires every touched box to be declared in advance. A lost race therefore yields a *rejected transaction*, not a bad record — which on the allowed path is exactly R-2.

**Why this flow has never executed on TestNet — the causal explanation for E-1.** `log_access` has exactly one caller in the entire repository: `api/src/routes/records.ts` (verified by grep across `contracts/scripts`, `api`, `web`). Reaching it requires **both** a settled $0.05 payment **and** a live grant for the `records:summary` scope. Neither operational script does that: `contracts/scripts/exercise_contract.py` exercises `request_access` → `grant_access` → `check_access` → `revoke_access` and stops, and `api/scripts/e2e-proof.ts` pays only `/v1/triage`. **No script exercises the audit path.** That is why `total_audit_entries = 0` and why the flagship mechanism is **UNVALIDATED on-chain**. The gap is one script away from closing: grant consent from a funded account, then run the paid `/v1/records/summary` call against it.

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
        A5["pytest tests/ -v — 14 tests, passes locally in 0.41 s"]
        A1-->A2-->A3-->A4-->A5
    end

    subgraph J2["job: api"]
        B1["actions/checkout@v4"]
        B2["setup-node 20 — no cache: CI-4"]
        B3["npm ci — lockfile respected HERE but not in the Dockerfile: D-4"]
        B4["npx tsc --noEmit — strict, passes locally"]
        B5["npm run build"]
        B6["npx vitest run — 18 tests, 4.08 s locally"]
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
    END --> MISSING["ABSENT FROM THE PIPELINE — CI-3<br/>no npm audit / pip-audit / Dependabot / CodeQL — SEC-014<br/>no coverage measurement or gate<br/>no container image build — api/Dockerfile has NEVER been built<br/>no artifact publishing<br/>no deployment stage"]
```

**The precise statement of CI-1, which matters because it is easy to overstate.** The workflow is correct in content and every job it defines passes locally: API typecheck **PASS**, API build **PASS**, API tests **18 passed**, contract tests **14 passed**, web typecheck **PASS**, web build **PASS**. The problem is the trigger, not the code. `on.push.branches` is `[main]` while the repository's only branch is `master`, so the workflow has never fired on a push, and the repository has no pull requests for the `pull_request` trigger to catch. **The green badge is not green — it has never run.** The fix is one line, either way round: rename the branch, or change the trigger.

**CI-2 is a design consequence, not an accident.** `api/test/x402-flow.spec.ts` imports `api/src/app.ts`, whose payment middleware fetches `/supported` from the live facilitator — the same coupling that produces R-1 at runtime. Hermetic tests would need a stubbed facilitator client, which the SDK's `HTTPFacilitatorClient` seam makes straightforward. **RECOMMENDED**, not present.

**CI-4** — neither `setup-node` nor `setup-python` declares a `cache:` key, so every run re-downloads all dependencies. Low severity, pure wall-clock cost.
