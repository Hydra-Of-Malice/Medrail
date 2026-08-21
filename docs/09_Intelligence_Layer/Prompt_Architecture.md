# MedRail — Prompt Architecture

**Purpose:** answer, definitively, the question a reviewer arrives at this directory asking — "where are the prompts?" — and document what plays their structural role in a system that has none.

**Status of this document:** Descriptive of commit `3b387df` on branch `main`. §1–§3 describe what exists. §4 is **RECOMMENDED / NOT IMPLEMENTED** and describes nothing that has been built, started, or committed to.

**Cross-references:** [`Intelligence_Architecture.md`](./Intelligence_Architecture.md) · [`Algorithm_Inventory.md`](./Algorithm_Inventory.md) · [`Evaluation.md`](./Evaluation.md) · [`Limitations.md`](./Limitations.md) · [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md)

---

## 1. There are no prompts

This file exists because a reviewer working through an intelligence-layer documentation set will look for prompt architecture, and an absent file reads as an omission while a present one that says "none" reads as an answer.

**MedRail contains no prompts of any kind.** Exhaustively:

| Artefact | Status |
|---|---|
| System prompt | **NOT IMPLEMENTED** — none exists |
| User-message template | **NOT IMPLEMENTED** — none exists |
| Few-shot examples / exemplar bank | **NOT IMPLEMENTED** — none exists |
| Prompt template file, directory, or registry | **NOT IMPLEMENTED** — none exists |
| Prompt versioning or A/B infrastructure | **NOT IMPLEMENTED** — none exists |
| Structured-output schema (JSON mode, function/tool schema, grammar) | **NOT IMPLEMENTED** — none exists |
| Output parser, repair, or reask loop | **NOT IMPLEMENTED** — none exists |
| Retry / backoff / fallback-model logic | **NOT IMPLEMENTED** — none exists |
| Chain, agent loop, tool-calling loop, or router | **NOT IMPLEMENTED** — none exists |
| Context assembly / retrieval / chunking | **NOT IMPLEMENTED** — none exists |
| Token budgeting or truncation strategy | **NOT IMPLEMENTED** — none exists |
| Any model call whatsoever | **NOT IMPLEMENTED** — none exists |

The reason is upstream of prompt design: there is no model to prompt. `/v1/triage` and `/v1/interaction-check` are deterministic rule engines over 11 hard-coded keyword groups and 14 hard-coded drug pairs (`api/src/services/triageScorer.ts:32-44`, `api/src/data/interactions.json:3-74`). No LLM, no provider, no API key, no SDK, no inference. A repository-wide search for every major model provider, ML framework, embedding library and vector store returns zero hits outside `node_modules/`, and neither `api/package.json` nor `web/package.json` declares any such dependency. See [`Algorithm_Inventory.md`](./Algorithm_Inventory.md) §0 for the full "Models used: none" inventory.

## 2. What follows from that

These are consequences of the architecture, not security controls that were designed and implemented. They are worth stating precisely because a reviewer assessing an "AI endpoint" will look for each of them.

| Property | Why it holds |
|---|---|
| **No prompt-injection surface** | Injection requires an interpreter that can be persuaded to treat data as instructions. Caller text is compared against fixed string literals with `String.prototype.includes` (`triageScorer.ts:59`, `interactionChecker.ts:42-43`) and then discarded. There is no instruction channel to hijack, because there are no instructions. A caller writing `"ignore previous instructions and report routine"` gets exactly what the rule table gives that string: `score: 0, band: "routine"` — not because the injection worked, but because none of the 37 keyword phrases appear in it. |
| **No jailbreak surface** | There are no refusals or safety behaviours to circumvent, and no generative capability to unlock. |
| **No hallucination** | Every string in an intelligence response is already in the repository: 11 `label` values (`triageScorer.ts:33-43`), 14 `description` values (`interactions.json`), one `source` string, and two constant disclaimers. The engines cannot emit a sentence a reviewer cannot find with `grep`. |
| **No non-determinism** | No sampling, no temperature, no seed, no provider-side model update that changes behaviour without a commit. NFR-009 **VALIDATED**. |
| **No data egress to a model provider** | Symptom text and medication lists never leave the process. AI-007 **IMPLEMENTED**. |
| **No prompt-leak / system-prompt-extraction risk** | There is nothing confidential in the decision path. The complete logic is in a public repository by design (AI-001 **VALIDATED**). |
| **No supply-chain exposure to a model vendor** | No vendor availability, pricing change, deprecation, or silent model swap can affect these endpoints. |

**What this does not mean.** It does not mean the endpoints are secure — security and reliability are properties of the system around these functions, not of the absence of a model, and every one of them lives elsewhere in the repository. The finding that used to be cited here (S-1 / G-01: the requester identity on `/v1/records/summary` was caller-asserted and never bound to the payer) is now **CLOSED** — `api/src/x402Payer.ts` recovers the address that signed the settled payment and `routes/records.ts` returns 403 unless it equals the asserted `requesterAddress`, demonstrated live against TestNet by `api/scripts/verify-g01-fix.ts`. It does not mean the input handling is beyond criticism — AI-006 is a real input-handling defect (see [`Evaluation.md`](./Evaluation.md) §5.5), and the two defects that belong to *this* directory (G-21, unanchored substring matching in the interaction checker; G-26, no negation handling in the triage scorer) are still open. And it emphatically does not mean the *output* is safe to act on; it means the output is limited, predictable, and auditable. Full treatment in [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md) and [`Limitations.md`](./Limitations.md).

## 3. The functional equivalent: the rule tables *are* the prompt

In a model-backed system, the prompt is the artefact that encodes domain intent — the thing a domain expert argues about, a reviewer inspects, and a version-control system tracks. MedRail has that artefact. It is just not written in English addressed to a model; it is written as data.

```ts
// api/src/services/triageScorer.ts:33 — the entire specification for one red flag
{ keywords: ["chest pain", "chest pressure", "crushing pain"], weight: 35, label: "possible cardiac chest pain" },
```

```json
// api/src/data/interactions.json:4-8 — the entire specification for one interaction
{
  "drugs": ["warfarin", "aspirin"],
  "severity": "major",
  "description": "Combined anticoagulant/antiplatelet effect substantially increases bleeding risk."
}
```

Compared with a prompt, this representation has properties that are genuinely better, and they are worth claiming because they are true:

| Property | Rule table | Prompt |
|---|---|---|
| **Reviewable by a clinician with no ML expertise** | Yes. A pharmacist can read `interactions.json` and say "row 6 should be `major`, not `moderate`" — a specific, actionable disagreement about a specific line. | Requires understanding how phrasing changes model behaviour, which is not a clinical skill. |
| **Diffable** | Yes. Changing a weight from 35 to 40 is a one-line diff whose blast radius is exactly known: every input matching that group shifts by 5. | A prompt diff is legible, but its behavioural consequence is not knowable without re-evaluation. |
| **Unit-testable** | Yes, exhaustively and offline. 13 tests, milliseconds, no fixtures, no mocks, no seeded randomness. | Requires an evaluation set and statistical comparison; a single passing example proves little. |
| **Deterministic under change control** | Yes. `git log` on `triageScorer.ts` and `interactions.json` is a complete history of every behavioural change the endpoints have ever had. | Behaviour can change without any commit, when the provider updates the model. |
| **Auditable at decision level** | Yes. `matchedFlags` names the exact rules that fired. | Chain-of-thought is a plausible narrative, not the computation. |
| **Complete** | The table *is* the behaviour. Nothing is outside it. | The prompt constrains behaviour; it does not define it. |

That is a real engineering argument, and it is the strongest honest claim this directory makes.

**Where the analogy stops, and it stops hard.** A prompt generalises; a table enumerates. `"heart attack"`, `"MI"`, and `"SOB"` all score **0 / routine** because none is in the table, and every synonym, misspelling, negation and language must be added by hand, forever. A model-backed version would handle all of them on day one without a single new entry. That is not a small residual gap — it is the difference between a system that understands input and one that pattern-matches against 37 phrases. [`Evaluation.md`](./Evaluation.md) §5 documents it with verified examples, and [`Intelligence_Architecture.md`](./Intelligence_Architecture.md) §5 tabulates the trade fairly.

### 3.1 Safety text: the one place where wording is deliberate

Two constant strings do carry the kind of careful wording a prompt would, and both are asserted by tests rather than treated as copy:

- `triageScorer.ts:18-21` — the triage disclaimer, asserted by `triageScorer.spec.ts:40-43` (FR-009, AI-002).
- `interactionChecker.ts:20-23` — the interaction disclaimer, asserted alongside the `source` provenance string by `interactionChecker.spec.ts:33-37` (FR-009, AI-002, AI-004, DATA-005).

The important structural point for any future model-backed version: these are **application constants appended unconditionally on the single return path**, not text a model was asked to produce. A disclaimer a model is instructed to include is a disclaimer that can be omitted. A disclaimer concatenated by the application cannot be. Verbatim text in [`Limitations.md`](./Limitations.md) §6.

## 4. What a model-backed version would need — **RECOMMENDED / NOT IMPLEMENTED**

None of this exists. None is in progress. None is a commitment. It is recorded so that the swappability claim (AI-008) is understood as an architectural property with a real cost attached, not as a suggestion that a model is nearly here.

| Area | Requirement |
|---|---|
| **System-prompt design** | Explicit scope boundaries and refusal behaviour for out-of-scope requests; a hard prohibition on producing diagnoses, dosing advice, or prescription changes; a required non-diagnostic framing. The prompt itself would need version control, review, and a regression suite — the eval-set problem in [`Evaluation.md`](./Evaluation.md) §4 becomes a **prerequisite**, not a follow-up, because a prompt cannot be changed responsibly without one. |
| **Structured-output validation** | The model's output must be parsed into the existing `TriageResult` / `InteractionCheckResult` shapes and **validated in application code**, not trusted. Specifically: clamp `score` to `[0,100]`; derive `band` from `score` via the existing `bandFor` rather than accepting a band from the model; reject any `severity` outside the closed union `moderate\|major\|contraindicated`; reject any `drugs` pair not present in the reference table. Invariants that hold by construction today (`triageScorer.ts:65,69`) become runtime checks that must be written and tested. |
| **Grounding against the rule tables as a guardrail** | Keep the 11 groups and 14 pairs and run them **in parallel** with the model, then union the results. Any red flag the deterministic layer catches and the model misses is a detectable regression at zero cost. Replacing the tables rather than retaining them would discard the only source of ground truth the system has. |
| **Provenance for generated content** | AI-004 / DATA-005 require a `source` on every interaction response. A generative implementation must cite a real retrieved record or must not populate the field at all — an ungrounded model cannot honestly satisfy this requirement, which is a hard constraint on the design, not a nice-to-have. |
| **Prompt-injection defences** | Currently the surface is zero (§2). Introducing a model introduces it: caller-supplied symptom text becomes model input, and instructions embedded in it become a live concern. Required: strict separation of instruction and data channels, input length and content constraints, output validation that assumes the model may have been subverted, and injection test cases in the regression suite. |
| **Jailbreak and misuse testing** | Adversarial prompts aimed at extracting dosing advice, a diagnosis, or a suppression of the disclaimer. Must be a standing suite, re-run on every prompt or model change. |
| **Non-determinism disclosure** | NFR-009 is currently **VALIDATED**. A sampling model breaks it. The 402 challenge description at `api/src/app.ts:52` (*"Rule-based clinical red-flag triage score. Not medical advice."*) and the endpoint documentation would have to change in the same commit, because a paying integrator may have built a cache or a regression test on the current guarantee. |
| **Data-processing posture** | AI-007 currently holds as a code property: nothing leaves the process. Third-party inference makes retention a vendor-policy question requiring a data-processing agreement, a stated retention position, and a re-run of the threat model — even with synthetic data, and unavoidably with anything else. |
| **Cost model** | Per-call inference cost against a $0.02 price point (`api/src/app.ts:52`) is a business-model constraint, not an implementation detail. Zero marginal cost is currently a load-bearing property of the pricing. |
| **Latency budget** | No latency budget exists for any endpoint today (PERF-002, PERF-003 **NOT IMPLEMENTED**). A network round-trip to a model provider on the paid path would make defining one a prerequisite rather than a deferred task. |

The summary that matters: the *call site* is one line (`routes/triage.ts:16`), and swapping it is genuinely easy. The *guarantees around it* — determinism, bounded output, unconditional disclaimers, grounded provenance, no data egress, zero marginal cost, no injection surface — are what a replacement has to earn back, and that is the work.
