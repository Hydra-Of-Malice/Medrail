# MedRail — Documentation Index

Every document in this project, linked. **Click any row to open it.**

MedRail is a patient-consent layer on Algorand underneath a family of x402-paid clinical-intelligence
endpoints. Live on TestNet as App [`768743428`](https://lora.algokit.io/testnet/application/768743428).

**Start here:** [Executive Summary](00_EXECUTIVE_SUMMARY.md) — the whole project in two minutes.

---

## Quick paths

| I want to… | Read, in order |
|---|---|
| **Judge this submission** (15 min) | [Executive Summary](00_EXECUTIVE_SUMMARY.md) → [For Judges](JUDGES.md) → [Evidence Log](PROOF.md) → [Judge Evaluation](11_Hackathon/Judge_Evaluation.md) |
| **Review the engineering** (60 min) | [System Architecture](03_Architecture/System_Architecture.md) → [HLD](03_Architecture/HLD.md) → [LLD](03_Architecture/LLD.md) → [ADRs](03_Architecture/ADRs/README.md) → [Threat Model](06_Security/Threat_Model.md) |
| **Integrate against the API** | [API Documentation](05_API/API_Documentation.md) → [OpenAPI Spec](05_API/OpenAPI.yaml) → [Error Catalogue](05_API/API_Error_Catalog.md) → [Bazaar Discovery](05_API/Bazaar_Discovery.md) |
| **Run or deploy it** | [Environment Setup](08_Deployment/Environment_Setup.md) → [Go-Live Runbook](08_Deployment/GO_LIVE_RUNBOOK.md) → [Incident Response](10_Operations/Incident_Response.md) |
| **See what is proven** | [Evidence Log](PROOF.md) → [Agent Run Facts](AGENT_RUN_FACTS.md) → [Test Results](07_Testing/Test_Results.md) |
| **See what is still weak** | [Engineering Gap Report](ENGINEERING_GAP_REPORT.md) → [Requirements Gap Analysis](02_Requirements/Requirements_Gap_Analysis.md) |
| **Run the demo** | [Demo Script](11_Hackathon/Demo_Script.md) → [Demo Runbook](11_Hackathon/Demo_Runbook.md) |

---

## Overview

| Document | What it covers |
|---|---|
| [Executive Summary](00_EXECUTIVE_SUMMARY.md) | The project in two minutes: problem, solution, evidence, maturity, roadmap |
| [For Judges](JUDGES.md) | The pitch, the evidence table, and a 2-minute demo script |
| [Evidence Log](PROOF.md) | Every claim with a transaction ID and a command to reproduce it |
| [Agent Run Facts](AGENT_RUN_FACTS.md) | The canonical machine-to-machine run: the three accounts, every transaction ID, and what may and may not be claimed |
| [Engineering Gap Report](ENGINEERING_GAP_REPORT.md) | 34 findings — 22 closed, 12 open — with evidence, severities and fixes |
| [Winning Roadmap](WINNING_ROADMAP.md) | Four-phase remediation plan; Phase 1 complete |
| [Compliance](COMPLIANCE.md) | Rule-by-rule mapping to the Global x402 Challenge requirements |
| [Go-Live Checklist](GO_LIVE_CHECKLIST.md) | Competition entry checklist |
| [Implementation Plan](IMPLEMENTATION_PLAN.md) | The plan the build followed, with its verified-fact table |

### Original narrative documents

Written during the build and kept for continuity. Each is superseded in depth by a numbered section.

| Document | Superseded in depth by |
|---|---|
| [Architecture](ARCHITECTURE.md) | [03 — Architecture](#03--architecture) |
| [API Reference](API.md) | [05 — API](#05--api) |
| [Security Notes](SECURITY.md) | [06 — Security](#06--security) |
| [Deployment Runbook](DEPLOYMENT.md) | [08 — Deployment](#08--deployment) |

---

## 01 — Product

| Document | What it covers |
|---|---|
| [Problem Statement](01_Product/Problem_Statement.md) | The consent gap and the agent-payment gap; why existing approaches fall short |
| [Project Vision](01_Product/Project_Vision.md) | Vision, objectives, success criteria, maturity ladder |
| [User Personas](01_Product/User_Personas.md) | The five parties the system actually serves |
| [User Journey](01_Product/User_Journey.md) | End-to-end journeys for the paying agent and the consenting patient |
| [Use Cases](01_Product/Use_Cases.md) | Formal use cases mapped to requirement IDs, including the abuse case |
| [Scope](01_Product/Scope.md) | In scope, out of scope, assumptions, constraints, dependencies |
| [Competitive Analysis](01_Product/Competitive_Analysis.md) | Against SMART-on-FHIR, FHIR Consent, and commercial clinical APIs |
| [USP & Novelty](01_Product/USP_Novelty.md) | What is genuinely novel — and what is not |

## 02 — Requirements

| Document | What it covers |
|---|---|
| [Software Requirements Specification](02_Requirements/SRS.md) | Full SRS, 17 sections, every requirement with acceptance criteria and evidence |
| [Requirements Traceability Matrix](02_Requirements/Requirements_Traceability_Matrix.md) | Requirement → design → code → test → evidence, forward and reverse |
| [Requirements Gap Analysis](02_Requirements/Requirements_Gap_Analysis.md) | Prioritised gaps by severity with recommended fixes |
| [Requirements Registry](02_Requirements/Requirements_Registry.md) | The frozen canonical ID registry every other document cites |

ID prefixes: `FR` functional · `NFR` non-functional · `SEC` security · `PERF` performance ·
`REL` reliability · `OPS` operability · `DATA` data · `AI` intelligence layer.

## 03 — Architecture

| Document | What it covers |
|---|---|
| [System Architecture](03_Architecture/System_Architecture.md) | Architectural style, context and container diagrams, why there is no database |
| [High-Level Design](03_Architecture/HLD.md) | Components, boundaries, protocols, synchronous flows |
| [Low-Level Design](03_Architecture/LLD.md) | Module-level design: the contract, chain integration, x402 wiring, the routes |
| [Component Diagram](03_Architecture/Component_Diagram.md) | Component graphs plus dependency and failure-impact tables |
| [Sequence Diagrams](03_Architecture/Sequence_Diagrams.md) | Nine flows including the rejected attack path and both failure paths |
| [Activity Diagrams](03_Architecture/Activity_Diagrams.md) | Request lifecycle, consent state machine, CI pipeline |
| [Data Flow Diagrams](03_Architecture/Data_Flow_Diagrams.md) | DFD levels 0–2 with trust boundaries and data classification |

### Architecture Decision Records

[**ADR Index**](03_Architecture/ADRs/README.md) — each record separates *recorded* rationale from
*reconstructed* rationale, and states what the decision cost.

| ADR | Decision |
|---|---|
| [ADR-001](03_Architecture/ADRs/ADR-001-backend-framework.md) | Backend framework — Hono + TypeScript on Node 20 |
| [ADR-002](03_Architecture/ADRs/ADR-002-no-database-ledger-as-system-of-record.md) | No database — the ledger is the system of record |
| [ADR-003](03_Architecture/ADRs/ADR-003-box-storage-over-local-state.md) | Box storage over local state |
| [ADR-004](03_Architecture/ADRs/ADR-004-x402-v2-exact-scheme-with-external-facilitator.md) | x402 v2 `exact` scheme with an external facilitator |
| [ADR-005](03_Architecture/ADRs/ADR-005-audit-write-as-follow-up-transaction.md) | Audit write as a follow-up transaction, not an atomic group |
| [ADR-006](03_Architecture/ADRs/ADR-006-admin-only-audit-log.md) | Admin-only audit log |
| [ADR-007](03_Architecture/ADRs/ADR-007-deterministic-rule-engines-instead-of-an-ml-model.md) | Deterministic rule engines instead of an ML model |
| [ADR-008](03_Architecture/ADRs/ADR-008-open-plus-gated-endpoint-split.md) | The open plus consent-gated endpoint split |
| [ADR-009](03_Architecture/ADRs/ADR-009-in-process-per-patient-lock-for-audit-sequencing.md) | In-process per-patient lock for audit sequencing |
| [ADR-010](03_Architecture/ADRs/ADR-010-client-side-key-custody-and-the-demo-wallet.md) | Client-side key custody and the demo wallet |
| [ADR-011](03_Architecture/ADRs/ADR-011-deployment-target-docker-and-fly-io.md) | Deployment target — Docker and Fly.io |
| [ADR-012](03_Architecture/ADRs/ADR-012-observability-strategy.md) | Observability strategy (proposed) |

## 04 — Data

| Document | What it covers |
|---|---|
| [Database Design](04_Data/Database_Design.md) | Algorand box storage as the system of record; MBR economics |
| [ER Diagram](04_Data/ER_Diagram.md) | Entity model and physical box-key byte layout |
| [Data Dictionary](04_Data/Data_Dictionary.md) | Every field, on-chain and over HTTP |
| [Data Flow](04_Data/Data_Flow.md) | Lineage, retention, visibility, and what is publicly readable |
| [Indexing & Query Strategy](04_Data/Indexing_And_Query_Strategy.md) | Query patterns the design serves — and the ones it cannot |

## 05 — API

| Document | What it covers |
|---|---|
| [API Documentation](05_API/API_Documentation.md) | All eight routes plus the 13-method on-chain ABI |
| [OpenAPI Specification](05_API/OpenAPI.yaml) | OpenAPI 3.1, authored from the implementation |
| [API Error Catalogue](05_API/API_Error_Catalog.md) | Every error the API can produce, with cause and retryability |
| [Bazaar Discovery](05_API/Bazaar_Discovery.md) | How the service declares itself to the x402 Bazaar catalogue, and what still has to happen before it is listed |

## 06 — Security

| Document | What it covers |
|---|---|
| [Security Architecture](06_Security/Security_Architecture.md) | Controls by domain, each with an honest status |
| [Threat Model](06_Security/Threat_Model.md) | STRIDE register across 35 threats |
| [Privacy](06_Security/Privacy.md) | What reaches the permanent public ledger, and the tensions that creates |
| [Risk Register](06_Security/Risk_Register.md) | Technical, security, operational and demo risks |

## 07 — Testing

| Document | What it covers |
|---|---|
| [Test Strategy](07_Testing/Test_Strategy.md) | The testing philosophy and the pyramid as it actually is |
| [Test Plan](07_Testing/Test_Plan.md) | Per-level plan, CI execution, environment matrix |
| [Test Cases](07_Testing/Test_Cases.md) | The full case catalogue, existing and missing |
| [Test Results](07_Testing/Test_Results.md) | Real results only, plus an explicit evidence-gaps section |
| [Performance Validation](07_Testing/Performance_Validation.md) | A measurement plan — no invented benchmarks |

## 08 — Deployment

| Document | What it covers |
|---|---|
| [**Go-Live Runbook**](08_Deployment/GO_LIVE_RUNBOOK.md) | **Exact commands to deploy publicly** — Fly.io, Vercel, secrets, verification, MainNet |
| [Deployment Architecture](08_Deployment/Deployment_Architecture.md) | Actual vs intended topology; environment-variable reference |
| [Environment Setup](08_Deployment/Environment_Setup.md) | Local setup with real troubleshooting |
| [Docker](08_Deployment/Docker.md) | Both Dockerfiles analysed line by line |
| [CI/CD](08_Deployment/CI_CD.md) | The pipeline, its history, and the recommended production version |
| [Rollback Strategy](08_Deployment/Rollback_Strategy.md) | Including why a deployed contract cannot be rolled back |

## 09 — Intelligence Layer

Deliberately **not** named `09_AI_ML`, because there is no AI or ML in this system —
[see why](09_Intelligence_Layer/README.md).

| Document | What it covers |
|---|---|
| [Overview](09_Intelligence_Layer/README.md) | What this layer is, and the naming decision |
| [Intelligence Architecture](09_Intelligence_Layer/Intelligence_Architecture.md) | Where it sits; rule engine vs model, compared fairly |
| [Algorithm Inventory](09_Intelligence_Layer/Algorithm_Inventory.md) | Both engines in full, plus an explicit "models used: none" |
| [Processing Pipeline](09_Intelligence_Layer/Processing_Pipeline.md) | Input to output, with worked arithmetic |
| [Evaluation](09_Intelligence_Layer/Evaluation.md) | What is verified, what is not, and what real evaluation would require |
| [Prompt Architecture](09_Intelligence_Layer/Prompt_Architecture.md) | There are no prompts — and why that is a security property |
| [Limitations](09_Intelligence_Layer/Limitations.md) | Enumerated failure modes and appropriate-use boundaries |

## 10 — Operations

| Document | What it covers |
|---|---|
| [Monitoring](10_Operations/Monitoring.md) | What an operator can see today, and the blind spots |
| [Logging](10_Operations/Logging.md) | Current state plus a design with an explicit never-log list |
| [Incident Response](10_Operations/Incident_Response.md) | Runbooks for the failure modes that actually exist |
| [Disaster Recovery](10_Operations/Disaster_Recovery.md) | Key custody is the real risk; RPO/RTO are not established |

## 11 — Hackathon

| Document | What it covers |
|---|---|
| [Judge Evaluation](11_Hackathon/Judge_Evaluation.md) | Adversarial scoring; why this could win and why it could lose |
| [Winning Strategy](11_Hackathon/Winning_Strategy.md) | Ranked actions by judge-perception impact |
| [Demo Script](11_Hackathon/Demo_Script.md) | 2-minute and 5-minute runs of show |
| [**Demo Video Script**](11_Hackathon/Demo_Video_Script.md) | **Shot-by-shot script for the 3-minute submission video** |
| [Demo Runbook](11_Hackathon/Demo_Runbook.md) | Pre-flight checklist and failure fallbacks |
| [Pitch Architecture](11_Hackathon/Pitch_Architecture.md) | How to present the design, plus a hard-question Q&A bank |

## Future work

| Document | What it covers |
|---|---|
| [Sentinel Exchange Proposal](future/SENTINEL_EXCHANGE_PROPOSAL.md) | **Unbuilt proposal** for a different product. Nothing in it exists in this repository. Retained for design continuity only. |

---

## Conventions

**Status labels.** Every capability claim carries one:

| Label | Meaning |
|---|---|
| **VALIDATED** | Implemented *and* covered by a passing test or on-chain evidence |
| **IMPLEMENTED** | Code exists and was read; no test proves it works |
| **UNVALIDATED** | Implemented, but the evidence is insufficient |
| **PARTIALLY IMPLEMENTED** | Some of it exists |
| **PLANNED** | Intended; no code |
| **NOT IMPLEMENTED** | Absent |
| **RECOMMENDED** | A recommendation — never something that exists |

**Evidence.** Non-obvious claims cite a `path/to/file.ts:line`, a transaction ID, or a command that
reproduces them. Where evidence does not exist, the documents say so rather than omitting the question.

**No invented numbers.** No latency percentile, throughput figure, uptime, accuracy metric or market
statistic appears anywhere unless it was measured. The only measured figures in the entire set are
the test-suite durations and two single latency observations, all labelled as such.
