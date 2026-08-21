# MedRail — Intelligence Layer Limitations

**Purpose:** state, without hedging, everything MedRail's intelligence endpoints cannot do, the harm each limitation could cause if the system were used for real, and the safety controls that are actually implemented and enforced against them.

**Status of this document:** Descriptive of commit `3b387df` on branch `main`. Every limitation is derived from source and, where marked, confirmed by executing the shipped code. Severity ratings are the author's assessment of *harm if this system were used to make a real care decision* — which it must not be. Nothing here is aspirational; sections marked **RECOMMENDED** describe nothing that exists.

**Cross-references:** [`Evaluation.md`](./Evaluation.md) · [`Algorithm_Inventory.md`](./Algorithm_Inventory.md) · [`Intelligence_Architecture.md`](./Intelligence_Architecture.md) · [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md) · [`../07_Testing/Test_Cases.md`](../07_Testing/Test_Cases.md) · [`../IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) §4

---

## 1. The three sentences that govern everything below

1. **This is not a medical device, a diagnostic tool, clinical decision support, or a triage system.** It is a keyword counter and a table lookup, built as a hackathon demonstration of paid machine-to-machine API access on Algorand.
2. **It has never been clinically validated.** No evaluation has been performed, no labelled dataset exists, and no accuracy, sensitivity or specificity figure can be quoted (AI-005 **NOT IMPLEMENTED**). See [`Evaluation.md`](./Evaluation.md).
3. **There is no AI or ML in it.** No model, no LLM, no embeddings, no vector store, no inference. Two deterministic rule engines over 11 keyword groups and 14 drug pairs. See [`Algorithm_Inventory.md`](./Algorithm_Inventory.md) §0.

---

## 2. Enumerated limitations

Severity is **harm if used for a real care decision**. Every row is a property of the shipped code.

### L-01 — Not a diagnostic tool, and not decision support · **CRITICAL**

The triage endpoint returns a number and one of four band labels. It performs no differential reasoning, considers no history, examines nothing, and has no concept of a patient. `POST /v1/records/summary` returns a fixed synthetic constant. Nothing in this system diagnoses anything.

**Harm if misused:** a user or an autonomous agent treating `band: "routine"` as reassurance, or `band: "emergency"` as a clinical finding, would be acting on output with no clinical basis. **Control:** unconditional disclaimer (§6); AI-003 **IMPLEMENTED**.

### L-02 — Never clinically validated · **CRITICAL**

No labelled corpus, no clinician adjudication, no held-out evaluation, no metric. The 11 weights and 4 band thresholds have no documented derivation; nobody has ever measured whether they produce sound output.

**Harm if misused:** any confidence placed in the output is unfounded — not "probably approximately right", but *unmeasured*. **Control:** stated plainly in this document, in [`Evaluation.md`](./Evaluation.md) §1, and in the response disclaimer. AI-005 **NOT IMPLEMENTED**; AI-053 **NOT IMPLEMENTED**.

### L-03 — No synonyms, lay terms, abbreviations, or misspelling tolerance · **CRITICAL**

Verified at commit `3b387df`: `"heart attack"` ⇒ **0 / routine**. `"MI"` ⇒ **0 / routine**. `"SOB"` ⇒ **0 / routine**. `"chest pian"` ⇒ **0 / routine**.

The single most direct way a person describes a cardiac emergency in plain English produces the same output as a request to book an annual checkup. **This is the worst property of the system**, because the error direction is a **false negative** and the output carries no signal that anything went unrecognised.

**Harm if misused:** a genuine emergency silently classified `routine`. **Control:** none in code. The only mitigations are the disclaimer and the fact that this is a demonstration endpoint. AI-051 **NOT IMPLEMENTED**.

### L-04 — No negation handling · **HIGH**

Verified: `"no chest pain"` ⇒ **35 / urgent**, identical to `"chest pain"`. `"denies chest pain"` ⇒ **35 / urgent**. Clinical text is dense with negation; this is the normal shape of the input domain, not an edge case.

**Harm if misused:** unwarranted escalation, and a score that does not measure what its name implies. Direction is false-positive, which is the safer direction, but it makes the number unreliable in both directions when combined with L-03. AI-050 **NOT IMPLEMENTED**.

### L-05 — English only · **HIGH**

Verified: `"dolor de pecho"` ⇒ **0 / routine**. All 37 keyword phrases are English. Non-English input is not detected, not rejected, and is indistinguishable in the output from benign English input. The endpoint is publicly reachable and unauthenticated.

**Harm if misused:** silent false negative for any non-English speaker. AI-054 **NOT IMPLEMENTED**.

### L-06 — Not comprehensive; absence of a flag means nothing · **CRITICAL**

Eleven red-flag groups and fourteen drug pairs. Whole domains of emergency presentation are absent — obstetric, paediatric, sepsis, trauma, toxicological, ophthalmic, diabetic among them. The interaction table is a teaching-scale sample: four of its 24 tokens are drug *classes* (`maoi`, `ssri`, `iodinated contrast`) with no class-to-member vocabulary, so naming an actual MAOI or SSRI by its generic name matches nothing.

**The statement that matters:** `flagged: false` means *"none of these 14 specific pairs was found"*. `matchedFlags: []` means *"none of these 37 phrases appeared"*. **Neither is evidence of safety, and neither is clearance.**

**Harm if misused:** a medication list read as "cleared" when it was merely not in a fourteen-row table. **Control:** the interaction disclaimer says exactly this (§6); DATA-005 / AI-004 **VALIDATED**.

### L-07 — Interaction table is not a licensed or verified dataset · **HIGH**

`api/src/data/interactions.json:2` cites *"standard pharmacology references such as Lexicomp/Micromedex-class severity classifications"* as a **class** of reference. Read precisely: it borrows the severity vocabulary (`moderate` / `major` / `contraindicated`). It is **not** a licence, **not** an extract, **not** derived from those products, and **not** verified against them. No entry has been checked against a Lexicomp or Micromedex record. No edition, revision date, table version, or per-entry citation exists.

**Harm if misused:** a reviewer or integrator reading "Lexicomp" and inferring a validated commercial dataset. That inference would be wrong, and this document exists partly to prevent it. AI-057 **NOT IMPLEMENTED**.

### L-08 — No context of any kind · **HIGH**

Neither schema accepts age, sex, pregnancy status, comorbidity, medication history, dose, route, frequency, duration, or organ function. `"chest pain"` scores 35 for a four-year-old and for an eighty-year-old with known coronary disease. `["warfarin","aspirin"]` returns the same `major` result whether the aspirin is 81 mg cardioprotective — often deliberately co-prescribed and monitored — or 650 mg analgesic, and whether it is a single dose or chronic therapy. Much of real interaction significance is dose- and duration-dependent and is simply not representable here.

**Harm if misused:** clinically inappropriate output for the patient in front of the user, in both directions. AI-056 **NOT IMPLEMENTED**.

### L-09 — Three severity tiers, no grading, no ordering · **MEDIUM**

`moderate | major | contraindicated` (`interactionChecker.ts:9`). No numeric grade, no onset/timing, no management guidance, no dose-dependence. `flagged` is a bare emptiness test (`interactionChecker.ts:50`): one `moderate` match and three `contraindicated` matches both report `flagged: true`. `matches` is returned in **table order, not severity order**, so a caller reading `matches[0]` may get a `moderate` finding while a `contraindicated` one sits below it.

**Harm if misused:** an integrator surfacing only the first match understates severity. **Control:** none. Callers must inspect the full array.

### L-10 — Triage score has no probabilistic meaning · **MEDIUM**

`score: 70` is the sum of two integers a developer chose. It is not a probability, a percentage, a risk, or a severity measure. There is no documented reason chest pain is 35 and stroke is 40, why the emergency cut-point is 60, or why the cap is 100 rather than the table maximum of 299.

**Consequence:** the score must not be averaged, compared arithmetically across patients, re-thresholded at a custom cut-point, or fed into a downstream calculation. A 70 is not "twice as urgent" as a 35. AI-003 **IMPLEMENTED** (the system does not *claim* it is a severity measure), but a numeric field named `score` invites the misreading, and that is flagged here rather than left to the disclaimer. AI-055 **NOT IMPLEMENTED**.

### L-11 — Additive weights, no interaction modelling · **MEDIUM**

Verified: `"severe abdominal pain and high fever and persistent vomiting"` ⇒ `20 + 12 + 10 = 42` ⇒ **urgent**. Three individually non-emergency findings escalate the band because three integers summed past a threshold, with no clinical reasoning. Bounded, precisely: the four lowest-weight groups sum to 44, so `urgent` is reachable from mild-to-moderate findings but `emergency` is **not** — that requires at least one high-weight group plus one other. At the top end the cap discards information: seven matched groups (raw 255) and any other capped input are indistinguishable at `score: 100`.

### L-12 — Unanchored medication matching produces false positives · **LOW–MEDIUM**

`interactionChecker.ts:42-43` tests `m.includes(a) || a.includes(m)` with no length floor and no token anchoring. Verified: `["a","b"]` ⇒ `flagged: true` with **5 matches** including a `major` bleeding-risk description; `["i","n"]` ⇒ **12 of 14 pairs**. Input containing no medication produces alarming clinical output.

Worse, it is **exercised but never asserted**: `interactionChecker.spec.ts:33-37` calls `checkInteractions(["a","b"])` and checks only `source` and `disclaimer`, so the suite drives through this defect green on every run. AI-006 **NOT IMPLEMENTED**; AI-052 and AI-058 **RECOMMENDED**.

### L-13 — No per-item length cap on medication names · **LOW**

`api/src/routes/interaction.ts:6` bounds the array to 20 items but sets no maximum length on an individual name, unlike the 2000-character cap on the triage string. The only ceiling on per-call work is the HTTP body limit, not an application constraint. AI-059 **PARTIALLY IMPLEMENTED**. Rate limiting now exists (`api/src/rateLimit.ts`; SEC-013 **IMPLEMENTED**) but is deliberately scoped to the free and refundable surface — `/v1/consent/status`, `/v1/consent/arc56`, `/v1/records/summary` — and not to this route, on the reasoning that a caller must settle $0.02 per request here, so the endpoint is economically self-limiting. That reasoning holds for cost; it does not bound the per-call work an unusually long medication name can cause.

### L-14 — `/v1/records/summary` returns a fixed synthetic constant · **INFORMATIONAL — disclosed by design**

`api/src/routes/records.ts:17-23` defines one `SYNTHETIC_RECORD` — blood type `O+`, allergies `["penicillin"]`, chronic conditions `["type 2 diabetes (controlled)"]`, medications `["metformin 500mg","lisinopril 10mg"]`, `lastUpdated "2026-01-15"` — returned **identically for every `patientId`**. There is no patient datastore, and there are no real patients in this system. DATA-004 **IMPLEMENTED**.

This is honestly disclosed in the response itself, in `docs/SECURITY.md`, and in `docs/IMPLEMENTATION_PLAN.md:67`. It is listed here so no reader mistakes the endpoint for a data-retrieval capability. **Note that this endpoint used to carry the repository's one CRITICAL security finding (S-1 / G-01 — the requester identity was caller-asserted and never bound to the payer). It is now CLOSED**: `api/src/x402Payer.ts` recovers the address that signed the settled payment from the verified `PAYMENT-SIGNATURE` header, and the route returns 403 unless that address equals the asserted `requesterAddress` — verified live against TestNet by `api/scripts/verify-g01-fix.ts`, which grants a third party consent, pays with a different key, and confirms the rejection. The control is documented in [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md), not here. What remains true of this limitation is narrower and still worth stating: there is nothing sensitive behind the gate, so the gate has never had anything to protect. That is a fact about the demo, and it is independent of the control now in front of it.

### L-15 — No evaluation, monitoring, or feedback loop in operation · **MEDIUM**

No metrics are exported, no tracing exists, and nothing alerts (OPS-003 **NOT IMPLEMENTED**; finding G-15 remains open). Structured JSON logging exists only for three failure events — `facilitator_unavailable`, `audit_write_failed`, and the generic `app.onError` record carrying a generated `requestId` — so OPS-002 is **PARTIALLY IMPLEMENTED**, and none of those events concerns the intelligence layer, which logs nothing at all. No mechanism captures whether output was ever appropriate. If a rule were wrong, nothing in the system would surface it. Combined with L-02, there is neither an up-front nor an ongoing quality signal.

### L-16 — Rule tables are unversioned · **LOW**

Neither engine nor `interactions.json` carries a version, edition or revision date. The only version identifier is the git commit. A caller cannot pin a table version, a response cannot cite one, and a future evaluation could not be attributed to a specific table state. AI-057 **NOT IMPLEMENTED**.

---

## 3. Severity summary

| ID | Limitation | Severity | Error direction |
|---|---|---|---|
| L-01 | Not a diagnostic tool or decision support | **CRITICAL** | — |
| L-02 | Never clinically validated | **CRITICAL** | — |
| L-03 | No synonyms / lay terms / abbreviations / misspellings | **CRITICAL** | **False negative** |
| L-06 | Not comprehensive; absence of a flag means nothing | **CRITICAL** | **False negative** |
| L-04 | No negation handling | HIGH | False positive |
| L-05 | English only | HIGH | **False negative** |
| L-07 | Interaction table not licensed or verified | HIGH | Misattribution of authority |
| L-08 | No patient or prescription context | HIGH | Both |
| L-09 | Three severity tiers, unordered results | MEDIUM | Understatement |
| L-10 | Score has no probabilistic meaning | MEDIUM | Misinterpretation |
| L-11 | Additive weights, no interaction modelling | MEDIUM | False positive (bounded) |
| L-15 | No evaluation, monitoring, or feedback loop | MEDIUM | — |
| L-12 | Unanchored medication matching | LOW–MEDIUM | False positive |
| L-13 | No per-item length cap | LOW | Resource |
| L-16 | Rule tables unversioned | LOW | Traceability |
| L-14 | Fixed synthetic record | INFORMATIONAL | Disclosed by design |

Four **CRITICAL** rows, and three of the four are false-negative failures. A safety screen should fail toward over-referral; this one fails toward silence. That is the honest summary of what the limitations add up to.

---

## 4. Safety controls that ARE implemented and enforced

Not mitigations for the limitations above — none of these makes the output clinically sound. They are the controls that prevent the system from *presenting* limited output as authoritative.

| Control | Mechanism | Status | Evidence |
|---|---|---|---|
| **Mandatory disclaimer on every response** | A module constant concatenated unconditionally on the single return path of each engine. Not conditional, not caller-suppressible, not generated. | **VALIDATED** — AI-002, FR-009 | `triageScorer.ts:18-21,71`; `interactionChecker.ts:20-23,53` |
| **Disclaimer tested as a correctness property** | A developer who deletes the disclaimer breaks the build, not just the tone. | **VALIDATED** | `triageScorer.spec.ts:40-43`; `interactionChecker.spec.ts:33-37` |
| **Mandatory source citation** | Every interaction response carries the provenance string, unconditionally, and it is asserted by a test. | **VALIDATED** — AI-004, DATA-005 | `interactionChecker.ts:52`; `interactions.json:2`; `interactionChecker.spec.ts:35` |
| **Disclosure *before* payment** | The x402 `PAYMENT-REQUIRED` challenge names the method in its resource description — *"Rule-based clinical red-flag triage score. Not medical advice."* An agent evaluating whether to spend $0.02 learns it is rule-based before paying, not after. | **VALIDATED** | `api/src/app.ts:52`; live 402 capture in the project fact ledger §4 |
| **Transparent, inspectable logic** | The complete decision surface is 11 keyword groups and 14 pairs, readable in one screen by a clinician with no software background. No opaque component in the decision path. | **VALIDATED** — AI-001, NFR-009 | `triageScorer.ts:32-44`; `interactions.json:3-74` |
| **Deterministic output** | Same input, same output, forever. No sampling, no clock, no provider that can change behaviour without a commit. | **VALIDATED** — NFR-009 | `triageScorer.spec.ts:45-49` (case-insensitivity); structural otherwise |
| **No clinical free text on-chain** | The intelligence routes never touch the ledger. The one route that does writes constant `scope`/`endpoint`/`action` strings only. Symptom text and medication lists cannot reach a public, immutable, permanent ledger. | **IMPLEMENTED** — AI-007, SEC-004 | `records.ts:12-13,58,84`; no `algorand.js` import in `triage.ts` or `interaction.ts` |
| **No input retention** | Neither engine writes, logs, caches or forwards its input. No database exists. The only application logging is `console.log` at boot and `console.error(err)` on failure. | **IMPLEMENTED** | `triageScorer.ts:53-73`; `interactionChecker.ts:36-55`; `api/src/app.ts:59` |
| **Synthetic data only** | No real patient data exists anywhere in the system. | **IMPLEMENTED** — DATA-004 | `records.ts:13-21` |
| **Output drawn only from repository strings** | The engines cannot emit a sentence that is not already committed to git. No hallucination is possible because no generation occurs. | **IMPLEMENTED** | `triageScorer.ts:33-43`; `interactions.json` |

### 4.1 The deliberate refusal, recorded at the time

The most important control is a decision, not a mechanism: **MedRail deliberately did not build an authoritative-sounding AI triage endpoint.** The rationale was recorded before implementation, in `docs/IMPLEMENTATION_PLAN.md:65`:

> `/v1/triage` is a transparent, rule-based red-flag symptom counter, not a diagnostic model. Every response carries a `"disclaimer"` field. This is a deliberate safety choice, not a shortcut — a hackathon health-triage endpoint that reads as authoritative medical advice is a real harm risk, not just a demo-polish issue.

and for the interaction endpoint at `docs/IMPLEMENTATION_PLAN.md:66`:

> `/v1/interaction-check` checks against a small, explicitly-sourced table of well-documented, textbook-level severe interaction pairs (not a comprehensive clinical database). Same disclaimer discipline.

The same reasoning is repeated in the source file header (`triageScorer.ts:1-7`) and in `docs/SECURITY.md:71-76`, which additionally records that the disclaimer is "treated as a correctness requirement in the test suite … not just documentation."

The engineering argument, stated fairly: a generative triage endpoint shipped on a hackathon timeline with no evaluation set and no clinical review would produce fluent, confident, unverifiable advice. Its failure mode would be a plausible hallucination, and a reviewer would have no way to audit it because there would be nothing to read. This system's failure mode is a silent miss — verifiably worse at *understanding* input (L-03, L-05), but auditable line by line, deterministic, and incapable of asserting something that is not in the repository.

**That argument justifies the choice of component. It does not make the component clinically useful, and this document does not claim it does.**

---

## 5. What is deliberately *not* claimed

| Claim not made | Why it is worth stating |
|---|---|
| Any accuracy, sensitivity, specificity, precision, recall, F1 or AUC figure | None has been measured; AI-005 **NOT IMPLEMENTED** |
| That the rule tables are clinically validated or expert-reviewed | They have not been reviewed by any clinician |
| That the interaction table derives from Lexicomp, Micromedex, or any licensed dataset | It does not — see L-07 |
| That the system uses AI, ML, an LLM, embeddings, or RAG | It does not — see [`Algorithm_Inventory.md`](./Algorithm_Inventory.md) §0 |
| That the endpoints are HIPAA-, GDPR-, SOC 2- or ISO-compliant, certified, or audited | No compliance work has been performed and no real PHI exists |
| That the system is production-ready for clinical use | It is not, and no part of this repository claims otherwise |
| Any latency, throughput or availability figure for these endpoints | No load test or benchmark exists; PERF-003 **NOT IMPLEMENTED** |

---

## 6. The disclaimer text, verbatim

Quoted exactly as it appears in source, so a reviewer can diff this document against the code.

**Triage — `api/src/services/triageScorer.ts:18-21`**, returned on every `/v1/triage` response:

> "MedRail triage is a transparent keyword heuristic for hackathon demonstration only. It is not a diagnosis, not a substitute for professional medical judgment, and must never be the basis for a real care decision. If this were real and urgent, call emergency services."

**Interaction check — `api/src/services/interactionChecker.ts:20-23`**, returned on every `/v1/interaction-check` response:

> "MedRail interaction-check compares against a small, explicitly-sourced reference table of well-documented severe interactions — it is not a comprehensive clinical database and must never replace a pharmacist or prescriber review before making a medication decision."

**Provenance — `api/src/data/interactions.json:2`**, returned as `source` on every interaction response:

> "Widely-taught, textbook-level severe drug-interaction pairs (e.g. standard pharmacology references such as Lexicomp/Micromedex-class severity classifications). Not exhaustive and not a substitute for a pharmacist or prescriber review."

**Records — `api/src/routes/records.ts:110`**, returned on every successful `/v1/records/summary` response:

> "Synthetic demo data for the Global x402 Challenge — no real patient information exists in this system."

**Pre-payment resource description — `api/src/app.ts:52`**, carried in the `PAYMENT-REQUIRED` header of every 402 on `/v1/triage`:

> "Rule-based clinical red-flag triage score. Not medical advice."

---

## 7. Appropriate and inappropriate use

### Appropriate

| Use | Why it is fine |
|---|---|
| Demonstrating x402 machine-to-machine payment against a real facilitator and real TestNet USDC | The payment flow is genuine and independently verifiable on-chain; the payload's clinical value is irrelevant to what is being demonstrated |
| A deterministic, zero-cost, always-available payload for testing an x402 client or agent integration | Fixed input ⇒ fixed output makes it an ideal fixture |
| A teaching example of a transparent rule engine, or of documenting a limited component honestly | The tables are legible and the limitations are enumerated |
| Benchmarking the payment path without confounding it with model latency or cost | No inference on the path |
| A worked example of building an intelligence layer that is swappable for a model-backed one (AI-008) | The architectural property is real |
| Illustrating patient-controlled consent and on-chain audit as a design pattern | That is the substantive contribution of the project |

### Inappropriate — do not do these

| Use | Why not |
|---|---|
| Any real clinical triage, screening, or care decision | L-01, L-02, L-03, L-06. Not validated; fails silently toward false negatives |
| Deciding whether to seek emergency care | L-03. `"heart attack"` returns `routine` |
| Checking a real patient's medication list for safety | L-06, L-07, L-08, L-12. Fourteen pairs, no dose, no context, false positives on short names |
| Reading `flagged: false` as clearance | L-06. It means "not in this 14-row table", nothing more |
| Reading `band: "routine"` as reassurance | L-03, L-05. Also the output for a heart attack described in plain English, and for Spanish input |
| Feeding `score` into any downstream calculation, average, or custom threshold | L-10. Uncalibrated ordinal artefact of chosen integers |
| Presenting output to a patient or clinician as clinical information | L-01. The disclaimer must travel with the output |
| Stripping or suppressing the disclaimer or `source` fields when relaying the response | AI-002, AI-004. They are the controls; removing them removes the safety posture |
| Citing MedRail as evidence that a drug pair is safe, or that a symptom is benign | L-06, L-07. Absence of a finding is not a finding |
| Deploying this to serve real patients | Every row above. The intelligence layer, not the payment or consent layer, is what disqualifies it |

**For integrators:** if you relay these responses to a human, relay `disclaimer` and `source` with them. They are unconditional in the response for a reason, and dropping them is the most likely way this system causes harm.

---

## 8. Responsible-disclosure framing for a health-adjacent demonstration

MedRail is a hackathon submission in a domain where an over-claimed demonstration causes real harm even when the software never touches a patient — because a plausible-looking health AI shapes what people believe such systems can do. The posture adopted here, stated so it can be held to:

1. **Label the mechanism, not just the disclaimer.** Every response says it is a heuristic; the `PAYMENT-REQUIRED` challenge says "rule-based" *before* payment; this directory publishes the complete decision tables. A reader never has to infer what is inside.
2. **State the absence of evaluation as prominently as any capability.** [`Evaluation.md`](./Evaluation.md) opens with it. A capability claim and its evidence gap should not live in different documents at different reading depths.
3. **Name the failure modes, including the embarrassing ones.** `"heart attack"` ⇒ `routine` and `["a","b"]` ⇒ five flagged interactions are both documented here, with the observation that the second is exercised by a passing test that never asserts on it. A limitation a reviewer discovers is worse than one the authors published.
4. **Do not let "AI" in marketing copy stand uncorrected in the technical documentation.** `README.md:3`, `api/src/app.ts:152`, `web/app/layout.tsx:18`, `web/app/page.tsx:18` and `docs/JUDGES.md:8` all say "AI intelligence endpoints." That phrasing is inaccurate. **RECOMMENDED:** change it to "rule-based intelligence endpoints" or "deterministic clinical rule endpoints" in all five places. Until that happens, this directory is the correction, and it is named `09_Intelligence_Layer` rather than `09_AI_ML` for exactly this reason.
5. **Keep synthetic data synthetic and say so in-band.** No real patient data exists; `records.ts:110` says so in the response body, not only in a document.
6. **Keep clinical text off the immutable ledger.** AI-007 is a design constraint, not an afterthought: nothing written on-chain can be retracted, so nothing clinical is written.
7. **Report defects against this system to the repository's issue tracker.** The rule tables and both engines are public and in one directory; a clinician who disagrees with a weight or a severity tier can cite the exact line. That is the intended review path, and it is the practical benefit of choosing an inspectable component.
