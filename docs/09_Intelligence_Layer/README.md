# MedRail — Intelligence Layer

**Purpose:** document the two endpoints MedRail markets as "AI intelligence endpoints" — what they actually are, how they work, what has and has not been verified about them, and where they fail.

**Status of this document:** Descriptive of commit `32ffd73` on branch `master`. Every claim carries a `path:line` citation, a transaction ID, or an explicit statement that no evidence exists.

---

## The one paragraph that matters

MedRail's `/v1/triage` and `/v1/interaction-check` endpoints contain **no artificial intelligence and no machine learning of any kind**. `/v1/triage` is a case-insensitive substring matcher over **11 hard-coded red-flag keyword groups** with fixed integer weights (`api/src/services/triageScorer.ts:32-44`). `/v1/interaction-check` is a lookup against **14 hard-coded drug-pair records** in a static JSON file (`api/src/data/interactions.json`). Both are pure functions. There is no model, no LLM, no provider, no API key, no embedding, no vector store, no retrieval, no training, no inference, and no non-determinism anywhere in the decision path. This was a deliberate choice, made before implementation and recorded at the time in [`../IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) §4: *"a hackathon health-triage endpoint that reads as authoritative medical advice is a real harm risk, not just a demo-polish issue."* The engineering case for that choice — and an honest account of what it costs — is the subject of this directory.

## Why this directory is not called `09_AI_ML`

Because there is no AI and no ML in it, and a directory named after a capability the system does not have would be the first thing a reviewer catches.

The word "AI" does appear in MedRail's own marketing copy — `README.md:3`, `api/src/app.ts:74`, `web/app/layout.tsx:18`, `web/app/page.tsx:18`, and `docs/JUDGES.md:8` all describe "x402-paid AI intelligence endpoints." That phrasing is **inaccurate** and this directory says so plainly rather than building a documentation set that props it up. What those endpoints genuinely are is *machine-readable clinical intelligence sold per-call to an autonomous agent* — the x402 use case is real and unaffected — but the intelligence is a rule table, not a model.

Two consequences follow, and both are stated throughout this directory rather than buried:

1. **Nothing here can be evaluated as a model, because nothing here is a model.** No accuracy, sensitivity, specificity, precision, recall, F1, AUC, calibration or hallucination figure exists for this system. None has ever been measured, no labelled dataset exists, and none is claimed anywhere in the repository. See [`Evaluation.md`](./Evaluation.md).
2. **The rule tables are not clinically validated.** `api/src/data/interactions.json:2` cites *"standard pharmacology references such as Lexicomp/Micromedex-class severity classifications"* as a **class** of reference. It is not a licensed dataset, not an extract from one, and has never been verified against one. See [`Limitations.md`](./Limitations.md) §3.

The honest framing is that MedRail chose a fully-inspectable deterministic component for a clinical-safety-adjacent surface, wired it behind a stable route boundary so it can be replaced by a model-backed implementation without touching the payment or consent layers (AI-008), and disclosed the trade-off. That is a defensible engineering position. Pretending it is AI would not be.

## Contents

| File | What it covers |
|---|---|
| [`Intelligence_Architecture.md`](./Intelligence_Architecture.md) | Where the layer sits, the request path, the purity/swappability property (AI-008), and an honest rule-engine vs LLM vs trained-classifier comparison including where the rule engine loses badly. |
| [`Algorithm_Inventory.md`](./Algorithm_Inventory.md) | The `Model_Inventory` analogue, honestly renamed. Complete 11-group red-flag table, complete 14-row interaction table, complexity, cost, latency, dependencies — plus a **"Models used: none"** section enumerating everything that is absent. |
| [`Processing_Pipeline.md`](./Processing_Pipeline.md) | Input → validation → normalisation → matching → scoring → banding → response, per engine, with worked arithmetic against the real proof-run output recorded in `contracts/artifacts/e2e-proof.json`. |
| [`Evaluation.md`](./Evaluation.md) | **The most important file here.** No evaluation has been performed. What the 13 automated tests do and do not establish, the evaluation plan that any clinical claim would require, and the failure modes derived from reading — and executing — the code. |
| [`Prompt_Architecture.md`](./Prompt_Architecture.md) | Exists because a reviewer will look for it. There are no prompts. What plays the role of a prompt here, and what a model-backed version would need. |
| [`Limitations.md`](./Limitations.md) | The bluntest file in the set: enumerated limitations with severity and potential harm, the safety controls that *are* enforced and tested, verbatim disclaimer text, and an appropriate/inappropriate use table. |

## Requirement IDs owned by this directory

The canonical `AI-###` requirements (AI-001…AI-008) are defined in the project requirement registry and are used unchanged here. Nine additional IDs are allocated from this directory's reserved block **AI-050…AI-069** and are marked `(new, added by 09_Intelligence_Layer)` at each point of definition — see [`Evaluation.md`](./Evaluation.md) §6 and [`Limitations.md`](./Limitations.md) §7.

## Cross-references

- [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md) — the "no model ⇒ no prompt-injection surface, no jailbreak surface" argument, and the attack surface that *does* exist.
- [`../07_Testing/Test_Cases.md`](../07_Testing/Test_Cases.md) and [`../07_Testing/Test_Strategy.md`](../07_Testing/Test_Strategy.md) — the 13 service-level tests, their coverage, and the gaps.
- [`../03_Architecture/System_Architecture.md`](../03_Architecture/System_Architecture.md) — where the intelligence layer sits in the whole system.
- [`../IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) §4 — the contemporaneous record of the safety rationale.
