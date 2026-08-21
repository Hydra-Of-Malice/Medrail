# ADR-007: Deterministic rule engines instead of an ML model for the clinical endpoints

**Status:** Accepted
**Date:** Not recorded as a decision date. `api/src/services/triageScorer.ts` and `docs/IMPLEMENTATION_PLAN.md` first appear in commit `d2a5f7f`, 2026-08-07.
**Deciders:** Not recorded in repository
**Evidence:** `docs/IMPLEMENTATION_PLAN.md:64-66` (§4); `api/src/services/triageScorer.ts:1-7` (header comment); `triageScorer.ts:29-31`; `triageScorer.ts:18-21` (disclaimer); `api/src/services/interactionChecker.ts:20-23`; `docs/SECURITY.md:69-76`; `api/test/triageScorer.spec.ts`; `api/test/interactionChecker.spec.ts`

## Context

MedRail markets two of its three priced endpoints as "AI intelligence endpoints": `POST /v1/triage` ($0.02) and `POST /v1/interaction-check` ($0.02). Both take clinical free text or a medication list and return a structured assessment.

**There is no LLM, no ML model, no embeddings, no vector store and no RAG anywhere in this repository.** Both endpoints are pure functions over small hard-coded tables:

- `scoreTriage(text)` lowercases the input, substring-matches against **11** `RedFlag` entries, sums their weights, caps at 100, and maps the total to one of four bands (`triageScorer.ts:53-73`). Weights range from 2 (common mild symptom) to 45 (mental-health crisis).
- `checkInteractions(meds)` compares a medication list against **14** curated interaction pairs loaded once at module load from `api/src/data/interactions.json` (`interactionChecker.ts:18, 36-55`), with severities `moderate | major | contraindicated`.

Any documentation describing these endpoints must say this plainly.

## Problem

Should the clinical endpoints be backed by a model (an LLM, or a trained classifier), or by transparent deterministic rules?

## Options considered

| Option | Pros | Cons | Why rejected |
|---|---|---|---|
| **Deterministic rule tables** (chosen) | Same input, same output, forever. The decision rule is 40 lines of readable source. Zero inference cost, zero latency, zero model dependency, zero prompt-injection surface. Unit-testable as a pure function — 13 of the repo's 32 tests cover these two files. No vendor, no API key, no rate limit, no outage. Cannot hallucinate. | Does not generalise beyond the 11 keyword groups and 14 drug pairs. Substring matching is brittle. No synonym handling, no negation handling, no severity calibration. Not clinically useful. | — |
| **LLM-backed triage** | Would generalise to arbitrary symptom text; would read impressively in a demo. | Non-deterministic, so the same symptom description can produce different urgency bands on consecutive calls — unacceptable for anything shaped like triage. Hallucination risk on medical content. Free-text clinical input would be sent to a third party, and AI-007 would be at risk. Prompt-injection surface on the highest-stakes endpoint. Per-call inference cost against a $0.02 price. Adds an availability dependency on top of the facilitator one (R-1). Unauditable: no way to answer "why did it say emergency." | An authoritative-sounding, non-deterministic health-triage endpoint is a genuine harm vector — see Rationale. |
| **Trained classifier on a labelled clinical dataset** | Deterministic given fixed weights; measurable sensitivity/specificity; defensible with evidence. | Requires a labelled dataset, an evaluation harness and clinical review — none of which exist (AI-005 **NOT IMPLEMENTED**) and none of which fit a hackathon timeline. An unvalidated classifier is *less* honest than an obviously-simple keyword table, because it looks like it was validated. | No dataset, no evaluation, no clinical sign-off. Shipping one would be overclaiming. |
| **Licensed interaction database (Lexicomp/Micromedex etc.)** | Genuinely clinically useful; comprehensive. | Licensing. `api/src/data/interactions.json` cites those products as a *class* of reference for its severity classifications, not as a licensed dataset — and the documentation must keep saying exactly that. | Not licensable for this project; the honest alternative is a small explicitly-sourced table, which is what exists. |
| **No clinical endpoints at all** | Zero harm surface. | Deletes two of the three priced endpoints and the Composite entry classification (ADR-008). | The endpoints have a legitimate role; the question is what backs them. |

## Decision

Both intelligence endpoints are pure, deterministic functions over static tables checked into source. Every response carries a mandatory non-diagnostic `disclaimer` field, and that field is asserted by the test suite rather than treated as documentation.

## Rationale

### This rationale is recorded in the implementation

`docs/IMPLEMENTATION_PLAN.md:65`, verbatim:

> "`/v1/triage` is a transparent, rule-based red-flag symptom counter, not a diagnostic model. Every response carries a `\"disclaimer\"` field. **This is a deliberate safety choice, not a shortcut — a hackathon health-triage endpoint that reads as authoritative medical advice is a real harm risk, not just a demo-polish issue.**"

`api/src/services/triageScorer.ts:1-7` records the same argument at the top of the implementation itself:

> "A transparent, rule-based red-flag symptom counter — deliberately not a diagnostic model. See docs/IMPLEMENTATION_PLAN.md section 4: a hackathon 'health triage' endpoint that reads as authoritative medical advice is a real harm risk, not a demo-polish shortcut, so every response is explicit about what this is and isn't."

`triageScorer.ts:29-31` records why the table is small rather than exhaustive:

> "Deliberately small and legible rather than exhaustive: every weight here is inspectable and each keyword set maps to one widely-taught emergency warning sign (e.g. FAST for stroke, cardiac/respiratory red flags)."

`docs/SECURITY.md:69-76` records that the disclaimers are treated as a correctness property, not decoration, and points at the two spec files that assert them.

The rationale is recorded in three independent places, in the plan, in the source, and in the security notes. No reconstruction is needed.

## Trade-offs

### What is lost

- **No generalisation.** Coverage is exactly 11 keyword groups and 14 drug pairs. A symptom described in words outside those keyword sets scores 0 and returns `band: "routine"` — the same output as a genuinely routine complaint. A clinically dangerous presentation phrased unusually is indistinguishable from no symptoms at all. This is the sharpest limitation and it should never be soft-pedalled.
- **No synonyms, no negation, no morphology.** `normalized.includes(kw)` (`triageScorer.ts:59`) means "chest pains" matches "chest pain" by luck, "denies chest pain" matches as a positive, and "MI" or "angina" match nothing.
- **No severity calibration.** The weights (35, 40, 45, …) are engineering judgement, not derived from data. Their sum crossing 60 produces `band: "emergency"` (`triageScorer.ts:46-51`). AI-005 — rule coverage, sensitivity and specificity against a labelled dataset — is **NOT IMPLEMENTED**, and no such claim is made anywhere.
- **A real matching defect in the interaction checker.** `interactionChecker.ts:42-43` uses bidirectional, unanchored substring containment: `m.includes(a) || a.includes(m)`. A one- or two-character medication name is contained by many table entries — a medication literally named `"a"` is a substring of "warfarin", "aspirin" and others — producing false-positive interaction matches on short or garbage input. It survives because the covering test, `interactionChecker.spec.ts:"always includes a source citation"`, calls `checkInteractions(["a","b"])` and asserts only the disclaimer. **AI-006 NOT IMPLEMENTED.** Severity LOW-MEDIUM. Fix: token-boundary matching plus an explicit synonym or RxNorm map.
- **Editing the rules is a code change.** Both tables live in the source tree (`triageScorer.ts:32-44`) or in a JSON file read once at module load (`interactionChecker.ts:18`). A clinician cannot change a weight; an engineer must, and a redeploy must follow. Correct at 11 and 14 entries; wrong somewhere north of a few hundred.
- **The demo reads less impressively.** "It's a keyword table" is a weaker pitch than "AI-powered triage." The project accepts that cost deliberately and says so.

### What is gained

- **Determinism.** Same input, same output, always. NFR-009 **VALIDATED**, AI-001 **VALIDATED**.
- **Auditability.** The entire decision procedure is 40 lines. `matchedFlags` (`triageScorer.ts:70`) returns exactly which rules fired, so every score is self-explaining. There is no "why did the model say that."
- **Testability.** 13 of the repo's 32 tests are pure-function tests over these two files, running in milliseconds with no network and no fixtures. Compare this with the flagship gated endpoint, `api/src/routes/records.ts`, which has **zero** tests.
- **Zero inference cost and zero latency.** No model to host, no tokens to buy, nothing to rate-limit — which matters when the price is $0.02.
- **Zero model risk.** No hallucination, no drift, no version pinning, no deprecation, no vendor outage. MedRail already has one third-party availability coupling (the facilitator, finding R-1); it does not have a second.
- **No prompt-injection surface.** Free-text symptom input never reaches an interpreter. This matters more than usual here because `api/src/routes/records.ts` writes to a public ledger; an injectable path plus an on-chain writer is a materially worse combination.
- **Free-text clinical input never leaves the process and never reaches the chain.** AI-007 **IMPLEMENTED** — only constant `scope`/`endpoint`/`action` strings are logged on-chain (`records.ts:10-11`), and triage/interaction bodies are never logged at all.
- **Explicit provenance.** Every interaction response carries the table's `source` string, describing "Lexicomp/Micromedex-class severity classifications" as a class of reference rather than a licensed dataset. DATA-005 **VALIDATED**, AI-004 **VALIDATED**.
- **The swap is cheap if it is ever wanted.** Both services are pure functions behind a route boundary, so a model-backed implementation would not touch the payment or consent layers. AI-008 **IMPLEMENTED (by construction)**.

## Consequences

**Positive**
- FR-004 … FR-009 all **VALIDATED**.
- AI-001, AI-002, AI-004 **VALIDATED**; AI-003, AI-007, AI-008 **IMPLEMENTED**.
- NFR-009 **VALIDATED** — deterministic and fully inspectable.
- The two open endpoints have no external dependency of any kind, which is why they are the only priced routes whose *logic* cannot fail (their 402 gate still can — R-1).

**Negative**
- AI-005 **NOT IMPLEMENTED** — no dataset, no evaluation harness, no sensitivity/specificity figure. None is claimed, and none should be.
- AI-006 **NOT IMPLEMENTED** — unanchored bidirectional substring matching produces false positives on short or malformed names.
- Coverage is bounded at 11 rules and 14 pairs; there is no path to clinical usefulness without replacing the approach.

**Neutral**
- The disclaimers are load-bearing rather than decorative, and are enforced by tests. This is the right structure and should be preserved if the implementation is ever swapped.
- Both endpoints are stateless and touch no chain state, which is why `docs/ARCHITECTURE.md:44-46` corrects itself: the open endpoints do **not** currently write to the audit log. They are pure compute.

## Conditions for future reconsideration

- **Fix AI-006 now** — token-boundary matching in `interactionChecker.ts:42-43` plus a test that asserts `checkInteractions(["a","b"])` returns `flagged: false`. This is a small change and the current test actively conceals the bug.
- **If a model is ever introduced**, it must not be introduced without: a labelled evaluation set, published sensitivity/specificity (AI-005), determinism or explicit variance disclosure, and clinical review. The disclaimer discipline and the "no free text on-chain" property (AI-007) must survive the change.
- **If the rule tables outgrow source control** — roughly, when a non-engineer needs to edit them — move them to a versioned data artifact with review, not to a database (ADR-002 still applies to state; rules are not state).
- **Do not reconsider on demo-impressiveness grounds.** The recorded rationale is a harm argument, not a scope argument, and it does not become less true with more time.
