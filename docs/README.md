# MedRail — Documentation

Engineering documentation for MedRail: a patient-consent layer on Algorand underneath a family of
x402-paid clinical-intelligence endpoints.

**New here?** Read [`00_EXECUTIVE_SUMMARY.md`](00_EXECUTIVE_SUMMARY.md) — the whole project in two
minutes.

---

## Reading paths

**If you are judging this submission (15 minutes)**
1. [`00_EXECUTIVE_SUMMARY.md`](00_EXECUTIVE_SUMMARY.md) — what it is, what is proven, what is not
2. [`JUDGES.md`](JUDGES.md) — the pitch and a 2-minute live demo script
3. [`PROOF.md`](PROOF.md) — every claim with a transaction ID and a command to re-check it
4. [`ENGINEERING_GAP_REPORT.md`](ENGINEERING_GAP_REPORT.md) — every weakness, found adversarially
5. [`CORRECTIONS.md`](CORRECTIONS.md) — what this review itself got wrong, and how it was caught
6. [`11_Hackathon/Judge_Evaluation.md`](11_Hackathon/Judge_Evaluation.md) — a hostile scoring of this submission

**If you are reviewing the engineering (60 minutes)**
1. [`03_Architecture/System_Architecture.md`](03_Architecture/System_Architecture.md) → [`HLD.md`](03_Architecture/HLD.md) → [`LLD.md`](03_Architecture/LLD.md)
2. [`03_Architecture/ADRs/`](03_Architecture/ADRs/) — the decisions and what each one cost
3. [`06_Security/Threat_Model.md`](06_Security/Threat_Model.md) — start at threat **T-01**
4. [`02_Requirements/Requirements_Traceability_Matrix.md`](02_Requirements/Requirements_Traceability_Matrix.md) — requirement → code → test → evidence
5. [`07_Testing/Test_Results.md`](07_Testing/Test_Results.md) — what is actually verified

**If you are integrating against the API**
1. [`05_API/API_Documentation.md`](05_API/API_Documentation.md) and [`05_API/OpenAPI.yaml`](05_API/OpenAPI.yaml)
2. [`05_API/API_Error_Catalog.md`](05_API/API_Error_Catalog.md)
3. [`04_Data/Data_Dictionary.md`](04_Data/Data_Dictionary.md)

**If you are running or deploying it**
1. [`08_Deployment/Environment_Setup.md`](08_Deployment/Environment_Setup.md)
2. [`08_Deployment/Deployment_Architecture.md`](08_Deployment/Deployment_Architecture.md) and [`Docker.md`](08_Deployment/Docker.md)
3. [`10_Operations/Incident_Response.md`](10_Operations/Incident_Response.md)

---

## Full index

### Top level

| Document | What it covers |
|---|---|
| [`00_EXECUTIVE_SUMMARY.md`](00_EXECUTIVE_SUMMARY.md) | The project in two minutes: problem, solution, evidence, maturity, roadmap |
| [`ENGINEERING_GAP_REPORT.md`](ENGINEERING_GAP_REPORT.md) | 34 verified findings — **22 closed**, both criticals resolved — with evidence, fixes, and top 10 by impact × feasibility |
| [`CORRECTIONS.md`](CORRECTIONS.md) | **Authoritative.** Three claims this review got wrong, corrected — supersedes any document that contradicts it |
| [`WINNING_ROADMAP.md`](WINNING_ROADMAP.md) | Four-phase remediation sequence; Phase 1 is ~6 hours |
| [`JUDGES.md`](JUDGES.md) | The pitch, the evidence table, and a 2-minute demo script |
| [`PROOF.md`](PROOF.md) | Evidence log — every claim with a reproduction command, including §7's disclosure of what is *not* proven |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | The original architecture narrative (superseded in depth by `03_Architecture/`) |
| [`API.md`](API.md) | The original API reference (superseded in depth by `05_API/`) |
| [`SECURITY.md`](SECURITY.md) | The original security notes (superseded in depth by `06_Security/`) |
| [`COMPLIANCE.md`](COMPLIANCE.md) | Rule-by-rule mapping to the Global x402 Challenge requirements |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | The original deployment runbook (superseded in depth by `08_Deployment/`) |
| [`GO_LIVE_CHECKLIST.md`](GO_LIVE_CHECKLIST.md) | Competition entry checklist |
| [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) | The plan the build followed, with its verified-fact table |

### 01 — Product

| Document | What it covers |
|---|---|
| [`Problem_Statement.md`](01_Product/Problem_Statement.md) | The consent gap and the agent-payment gap; why existing approaches fall short |
| [`Project_Vision.md`](01_Product/Project_Vision.md) | Vision, objectives, success criteria, maturity ladder |
| [`User_Personas.md`](01_Product/User_Personas.md) | The five parties the system actually serves |
| [`User_Journey.md`](01_Product/User_Journey.md) | End-to-end journeys for the paying agent and the consenting patient |
| [`Use_Cases.md`](01_Product/Use_Cases.md) | Formal use cases mapped to requirement IDs, including the abuse case |
| [`Scope.md`](01_Product/Scope.md) | In scope, out of scope, assumptions, constraints, dependencies |
| [`Competitive_Analysis.md`](01_Product/Competitive_Analysis.md) | Against SMART-on-FHIR, FHIR Consent, commercial clinical APIs |
| [`USP_Novelty.md`](01_Product/USP_Novelty.md) | What is genuinely novel — and what is not |

### 02 — Requirements

| Document | What it covers |
|---|---|
| [`SRS.md`](02_Requirements/SRS.md) | Full software requirements specification with stable IDs |
| [`Requirements_Traceability_Matrix.md`](02_Requirements/Requirements_Traceability_Matrix.md) | Requirement → design → code → test → evidence, forward and reverse |
| [`Requirements_Gap_Analysis.md`](02_Requirements/Requirements_Gap_Analysis.md) | Prioritised gaps by severity with recommended fixes |

Requirement ID prefixes: `FR` functional · `NFR` non-functional · `SEC` security · `PERF`
performance · `REL` reliability · `OPS` operability · `DATA` data · `AI` intelligence layer.

### 03 — Architecture

| Document | What it covers |
|---|---|
| [`System_Architecture.md`](03_Architecture/System_Architecture.md) | Architectural style, context, containers, why there is no database |
| [`HLD.md`](03_Architecture/HLD.md) | Components, boundaries, protocols, flows |
| [`LLD.md`](03_Architecture/LLD.md) | Module-level design: the contract, `algorand.ts`, the x402 wiring, the routes |
| [`Component_Diagram.md`](03_Architecture/Component_Diagram.md) | Component graphs and dependency/failure-impact tables |
| [`Sequence_Diagrams.md`](03_Architecture/Sequence_Diagrams.md) | Nine flows including the attack path and both failure paths |
| [`Activity_Diagrams.md`](03_Architecture/Activity_Diagrams.md) | Request lifecycle, consent state machine, CI pipeline |
| [`Data_Flow_Diagrams.md`](03_Architecture/Data_Flow_Diagrams.md) | DFD levels 0–2 with trust boundaries and data classification |
| [`ADRs/`](03_Architecture/ADRs/) | 12 decision records, each distinguishing recorded from reconstructed rationale |

### 04 — Data

| Document | What it covers |
|---|---|
| [`Database_Design.md`](04_Data/Database_Design.md) | Algorand box storage as the system of record; MBR economics |
| [`ER_Diagram.md`](04_Data/ER_Diagram.md) | Entity model and physical box-key byte layout |
| [`Data_Dictionary.md`](04_Data/Data_Dictionary.md) | Every field, on-chain and over HTTP |
| [`Data_Flow.md`](04_Data/Data_Flow.md) | Lineage, retention, visibility, and what is publicly readable |
| [`Indexing_And_Query_Strategy.md`](04_Data/Indexing_And_Query_Strategy.md) | Query patterns the design serves — and the ones it cannot |

### 05 — API

| Document | What it covers |
|---|---|
| [`API_Documentation.md`](05_API/API_Documentation.md) | All eight routes plus the 13-method on-chain ABI |
| [`OpenAPI.yaml`](05_API/OpenAPI.yaml) | OpenAPI 3.1 specification, authored from the implementation |
| [`API_Error_Catalog.md`](05_API/API_Error_Catalog.md) | Every error the API can produce, with cause and retryability |

### 06 — Security

| Document | What it covers |
|---|---|
| [`Security_Architecture.md`](06_Security/Security_Architecture.md) | Controls by domain, each with an honest status |
| [`Threat_Model.md`](06_Security/Threat_Model.md) | STRIDE register; start at **T-01** |
| [`Privacy.md`](06_Security/Privacy.md) | What reaches the permanent public ledger, and the tensions that creates |
| [`Risk_Register.md`](06_Security/Risk_Register.md) | Technical, security, operational, and demo risks |

### 07 — Testing

| Document | What it covers |
|---|---|
| [`Test_Strategy.md`](07_Testing/Test_Strategy.md) | The pyramid as it actually is |
| [`Test_Plan.md`](07_Testing/Test_Plan.md) | Per-level plan and the CI defects |
| [`Test_Cases.md`](07_Testing/Test_Cases.md) | All 32 existing cases plus the missing ones (TC-100+) |
| [`Test_Results.md`](07_Testing/Test_Results.md) | Real results only, plus an explicit evidence-gaps section |
| [`Performance_Validation.md`](07_Testing/Performance_Validation.md) | A measurement plan — no invented benchmarks |

### 08 — Deployment

| Document | What it covers |
|---|---|
| [`Deployment_Architecture.md`](08_Deployment/Deployment_Architecture.md) | Actual vs intended topology; env-var reference |
| [`GO_LIVE_RUNBOOK.md`](08_Deployment/GO_LIVE_RUNBOOK.md) | **Exact commands to deploy publicly** — Fly.io + Vercel, secrets, verification, MainNet |
| [`Environment_Setup.md`](08_Deployment/Environment_Setup.md) | Setup runbook with real troubleshooting |
| [`Docker.md`](08_Deployment/Docker.md) | Both Dockerfiles analysed, with corrected versions |
| [`CI_CD.md`](08_Deployment/CI_CD.md) | The pipeline, why it has never run, and a recommended replacement |
| [`Rollback_Strategy.md`](08_Deployment/Rollback_Strategy.md) | Including why a deployed contract cannot be rolled back |

### 09 — Intelligence Layer

Deliberately **not** named `09_AI_ML`, because there is no AI or ML in this system. See
[`09_Intelligence_Layer/README.md`](09_Intelligence_Layer/README.md) for that naming decision.

| Document | What it covers |
|---|---|
| [`README.md`](09_Intelligence_Layer/README.md) | What this layer is, and why the directory is named this way |
| [`Intelligence_Architecture.md`](09_Intelligence_Layer/Intelligence_Architecture.md) | Where it sits; rule engine vs LLM vs classifier, compared fairly |
| [`Algorithm_Inventory.md`](09_Intelligence_Layer/Algorithm_Inventory.md) | Both engines in full, plus an explicit "models used: none" |
| [`Processing_Pipeline.md`](09_Intelligence_Layer/Processing_Pipeline.md) | Input to output, with worked arithmetic |
| [`Evaluation.md`](09_Intelligence_Layer/Evaluation.md) | What is verified, what is not, and what real evaluation would require |
| [`Prompt_Architecture.md`](09_Intelligence_Layer/Prompt_Architecture.md) | There are no prompts — and why that is a security property |
| [`Limitations.md`](09_Intelligence_Layer/Limitations.md) | Enumerated failure modes and appropriate-use boundaries |

### 10 — Operations

| Document | What it covers |
|---|---|
| [`Monitoring.md`](10_Operations/Monitoring.md) | What an operator can see today, and the blind spots |
| [`Logging.md`](10_Operations/Logging.md) | Current state, plus a design with an explicit never-log list |
| [`Incident_Response.md`](10_Operations/Incident_Response.md) | Runbooks for the failure modes that actually exist |
| [`Disaster_Recovery.md`](10_Operations/Disaster_Recovery.md) | Key custody is the real DR risk; RPO/RTO are not established |

### 11 — Hackathon

| Document | What it covers |
|---|---|
| [`Judge_Evaluation.md`](11_Hackathon/Judge_Evaluation.md) | Adversarial scoring; why this could win and why it could lose |
| [`Winning_Strategy.md`](11_Hackathon/Winning_Strategy.md) | Ranked actions by judge-perception impact |
| [`Demo_Script.md`](11_Hackathon/Demo_Script.md) | 2-minute and 5-minute runs of show |
| [`Demo_Runbook.md`](11_Hackathon/Demo_Runbook.md) | Pre-flight checklist and failure fallbacks |
| [`Pitch_Architecture.md`](11_Hackathon/Pitch_Architecture.md) | How to present the design, plus a hard-question Q&A bank |

### future/

| Document | What it covers |
|---|---|
| [`SENTINEL_EXCHANGE_PROPOSAL.md`](future/SENTINEL_EXCHANGE_PROPOSAL.md) | **UNBUILT PROPOSAL.** A design for a different product. Nothing in it exists in this repository. Retained for design continuity only. |

---

## Conventions used throughout

**Status labels.** Every capability claim carries one:

| Label | Meaning |
|---|---|
| **VALIDATED** | Implemented *and* covered by a passing test or on-chain evidence |
| **IMPLEMENTED** | Code exists and was read; no test proves it works |
| **UNVALIDATED** | Implemented, but the evidence is insufficient |
| **PARTIALLY IMPLEMENTED** | Some of it exists |
| **PLANNED** | Intended; no code |
| **NOT IMPLEMENTED** | Absent |
| **RECOMMENDED** | A reviewer's recommendation — never something that exists |

**Evidence.** Non-obvious claims cite a `path/to/file.ts:line`, a transaction ID, or a command that
reproduces them. Where evidence does not exist, the documents say so rather than omitting the
question.

**No invented numbers.** No latency percentile, throughput figure, uptime, accuracy metric, or
market statistic appears anywhere in this documentation unless it was measured or verified. The
only measured figures in the entire set are two test-suite durations and two single latency
observations, all four of which are labelled as such.

---

## Provenance

Sections `01`–`11`, the executive summary, the gap report, and the roadmap were produced by a
full-repository engineering and security review on **2026-08-21**. That review read every source
file, executed both test suites and all four builds, exercised the API against a deliberately
unreachable facilitator and against malformed input, and re-queried the deployed contract's global
state, box inventory, account balance, and all five cited transactions against
`testnet-idx.algonode.cloud`.

The pre-existing top-level documents (`JUDGES.md`, `PROOF.md`, `ARCHITECTURE.md`, `API.md`,
`SECURITY.md`, `COMPLIANCE.md`, `DEPLOYMENT.md`, `GO_LIVE_CHECKLIST.md`, `IMPLEMENTATION_PLAN.md`)
were written during the build and were retained. Where the review found them to contradict the
code, they were corrected in place and the correction is listed in
[`ENGINEERING_GAP_REPORT.md`](ENGINEERING_GAP_REPORT.md) §5. **No source code was modified by the
review** — code findings are reported with their fixes, not applied.
