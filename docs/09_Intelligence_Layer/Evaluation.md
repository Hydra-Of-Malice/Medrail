# MedRail — Intelligence Layer Evaluation

**Purpose:** state exactly what has and has not been verified about MedRail's two rule engines, what the 13 automated tests actually establish, what a genuine clinical evaluation would require, and which failure modes follow from reading and executing the code.

**Status of this document:** Descriptive of commit `32ffd73` on branch `master`. §3 records tests that exist and pass. §4 is a **plan** for work that has **not been done**. §5 records findings obtained by executing the shipped code, and labels each as analysis or observation rather than measurement.

**Cross-references:** [`Algorithm_Inventory.md`](./Algorithm_Inventory.md) · [`Limitations.md`](./Limitations.md) · [`../07_Testing/Test_Cases.md`](../07_Testing/Test_Cases.md) · [`../07_Testing/Test_Strategy.md`](../07_Testing/Test_Strategy.md) · [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md)

---

## 1. The unambiguous statement

**No evaluation of MedRail's intelligence layer has ever been performed.**

**No labelled dataset exists.** Not a corpus of symptom descriptions with adjudicated urgency labels, not a set of medication lists with known interaction ground truth, not a held-out test split, not a single annotated example. Nothing of the kind exists in this repository or was ever assembled.

**No accuracy, sensitivity, specificity, precision, recall, F1, AUC, PPV, NPV, calibration, or agreement figure can be quoted for this system, and none is claimed anywhere in the repository.** Any such number appearing in a discussion of MedRail would be fabricated.

**AI-005 — Rule coverage, sensitivity and specificity shall be measured against a labelled clinical dataset — NOT IMPLEMENTED.** There is no dataset, no evaluation harness, no metric, and no tooling of any kind to produce one.

There is also nothing to evaluate *as a model*, because there is no model. `/v1/triage` and `/v1/interaction-check` are deterministic rule engines over 11 keyword groups and 14 drug pairs (see [`Algorithm_Inventory.md`](./Algorithm_Inventory.md)). No LLM, no ML technique, no learned parameter, no inference of any kind is involved. A repository-wide search for every major model provider, ML framework, embedding library and vector store returns zero hits outside `node_modules/`; neither `api/package.json` nor `web/package.json` declares any such dependency.

This is the honest position and it is stated first, before anything else, because every claim below depends on it not being quietly softened. The rest of this document describes what *was* verified — behavioural correctness — and is careful throughout not to let that be mistaken for the clinical validation it is not.

---

## 2. The distinction that is the whole point

| | **Behavioural correctness testing** (what exists) | **Clinical accuracy evaluation** (what does not) |
|---|---|---|
| **Question answered** | "Does the code do what the specification says?" | "Is the specification right?" |
| **Ground truth** | The rule table itself | Clinician adjudication against a real patient outcome |
| **Example** | `scoreTriage("chest pain")` returns 35, and `scoreTriage("CHEST PAIN")` returns the same 35 | Should a patient who says "chest pain" be triaged to emergency? What fraction of true emergencies does this table catch? |
| **What a failure means** | A regression — the code drifted from the table | The table is wrong, or the whole approach is inadequate |
| **Requires** | A test runner | A labelled corpus, clinicians, an IRB-equivalent review, a statistician |
| **Status in MedRail** | **13 tests, all passing** (§3) | **None. Never attempted.** (§4) |

Passing all 13 tests establishes that the engines faithfully implement their rule tables. It establishes nothing whatsoever about whether those tables produce clinically sound output. A system can pass 100% of its behavioural tests and be clinically useless — and this one is closer to that end of the spectrum than a reader of the phrase "AI triage endpoint" would assume. See §5.

---

## 3. What IS verified — the 13 automated tests

Executed by the project reviewer on 2026-08-21: `cd api && npx vitest run` ⇒ **18 passed** across 3 files in 4.08 s. Thirteen of those 18 target the intelligence layer; the remaining 5 are x402 payment-flow tests in `api/test/x402-flow.spec.ts`.

Both suites are pure-function tests: no network, no mocks, no fixtures, no fake timers, no seeded randomness. They run offline and complete in milliseconds.

### 3.1 `api/test/triageScorer.spec.ts` — 7 tests

| # | Line | Test name | Property established | Requirement |
|---|---|---|---|---|
| 1 | `:5` | *flags nothing for a benign, unrelated sentence* | No group matches ordinary non-clinical English; asserts `score === 0`, `band === "routine"`, and `matchedFlags` empty. Establishes there is no spurious baseline score. | FR-004 |
| 2 | `:12` | *flags a single mild symptom as low urgency* | Group 11 (weight 2) contributes, and asserts `0 < score < 10` ⇒ still `routine`. Establishes the low-weight group does not escalate the band on its own, and pins the lower band boundary from below. | FR-005, FR-006 |
| 3 | `:19` | *flags chest pain plus breathing difficulty as emergency* | Two red-flag groups co-occurring reach `emergency`, and both labels appear in `matchedFlags`. This is the additive-scoring property. | FR-004, FR-005, FR-006 |
| 4 | `:26` | *flags stroke warning signs distinctly* | Group 3 is reachable and labelled distinctly from groups 1 and 2 — i.e. `matchedFlags` is a genuine per-group discriminator, not a single blob. | FR-004 |
| 5 | `:32` | *caps the score at 100 even with many overlapping flags* | With 7 groups matching (raw sum 255), the returned `score` is exactly 100. This is the only test guarding the `Math.min(100, …)` invariant at `triageScorer.ts:65`. | FR-005 |
| 6 | `:40` | *always includes the non-diagnostic disclaimer* | The response's `disclaimer` contains `"not a diagnosis"`. **Safety text is asserted as a correctness property** — deleting the disclaimer breaks the build, not just the tone. | **FR-009, AI-002** |
| 7 | `:45` | *is case-insensitive* | `scoreTriage("chest pain")` and `scoreTriage("CHEST PAIN")` return equal scores — the `toLowerCase()` at `triageScorer.ts:54` is load-bearing and guarded. | NFR-009 |

### 3.2 `api/test/interactionChecker.spec.ts` — 6 tests

| # | Line | Test name | Property established | Requirement |
|---|---|---|---|---|
| 8 | `:5` | *flags nothing for unrelated medications* | `["ibuprofen", "vitamin d"]` ⇒ `flagged: false`, zero matches. Establishes that a table drug (`ibuprofen`, present in pair 2) does **not** flag without its partner — the conjunction `hasA && hasB` at `interactionChecker.ts:44` is real. | FR-007 |
| 9 | `:11` | *flags the classic warfarin + aspirin bleeding-risk pair* | A known table entry is retrievable, and its `severity` is surfaced as `"major"`. | FR-007 |
| 10 | `:17` | *flags a contraindicated pair (sildenafil + nitroglycerin)* | The highest severity tier is reachable and correctly labelled `"contraindicated"`. | FR-007 |
| 11 | `:23` | *matches case-insensitively and with partial names* | `["Warfarin", "Aspirin 81mg"]` flags. Establishes both the `toLowerCase()` and the dose-tolerant substring behaviour — this is the *intended* half of the matching rule whose *unintended* half is AI-006. | FR-008 |
| 12 | `:28` | *finds multiple simultaneous interactions in a longer list* | A 4-item list yields ≥ 2 matches — the scan is exhaustive over the table, not first-match-wins. | FR-007 |
| 13 | `:33` | *always includes a source citation and disclaimer* | `source` is non-empty and `disclaimer` contains `"not a comprehensive clinical database"`. Provenance and safety text are correctness properties. | **FR-009, AI-002, AI-004, DATA-005** |

### 3.3 What these 13 tests do NOT establish — stated explicitly

- **Nothing about clinical correctness.** Every assertion is checked against the rule table, which is also the thing under test. The tests cannot detect a wrong weight, a missing red flag, or a wrong severity tier, because the table is the oracle.
- **Nothing about coverage.** No test asks what fraction of real emergency presentations the 11 groups would catch. See §6.
- **Nothing about false positives.** Test 13 is the closest, and it is where the gap is sharpest: it calls `checkInteractions(["a", "b"])` at `interactionChecker.spec.ts:34` and then asserts **only** `source.length > 0` and a `disclaimer` substring. It never inspects `flagged` or `matches`. Executing that exact input at commit `32ffd73` returns **`flagged: true` with 5 matches**, including a `major` bleeding-risk description — for an input containing no medication at all. The suite drives straight through the AI-006 defect on every run and reports green. This is the single most instructive fact about the current test coverage, and it is exactly the kind of thing a hostile reviewer should find documented rather than discover.
- **Nothing about negation, synonyms, spelling, or language.** No test exercises any of them. §5 does, and the results are poor.
- **Nothing about the routes.** These are service-level tests. `api/test/x402-flow.spec.ts` asserts the 402 shape but does not exercise a paid 200 through either engine. The only end-to-end evidence for `/v1/triage` is the manual proof run recorded in `contracts/artifacts/e2e-proof.json`; `api/scripts/e2e-proof.ts` is not run by CI. `/v1/interaction-check` has **no** end-to-end evidence at all.
- **Nothing measured under load.** No latency, throughput, or concurrency figure exists for these endpoints. PERF-003 **NOT IMPLEMENTED**.

### 3.4 One further caveat about the green badge

`.github/workflows/ci.yml` triggers on `push: branches: [main]`, but this repository's only branch is `master` (finding CI-1). These 13 tests pass — verified locally on 2026-08-21 — but **no push to this repository has ever triggered CI**. The tests are real and green; the automation around them has never actually run. This belongs in an evaluation document because "our tests pass in CI" would be an overclaim.

---

## 4. Evaluation Plan — what a clinical claim would actually require

**Status: RECOMMENDED / NOT IMPLEMENTED.** Nothing in this section has been done, started, scoped with a clinician, or budgeted. It is presented as a plan precisely so that the gap between it and §3 is legible.

**AI-053 — A labelled evaluation corpus with clinician-adjudicated ground truth shall exist before any accuracy, sensitivity or specificity claim is made about either engine — NOT IMPLEMENTED** *(new, added by 09_Intelligence_Layer)*.

### 4.1 Step 1 — build a labelled corpus (the expensive part)

| Requirement | Detail |
|---|---|
| **Source material** | Free-text symptom descriptions written the way real users write them, not the way the rule table is phrased. Sampling from a triage-line transcript corpus or a nurse-advice-line log — under an appropriate data-use agreement — is the realistic route. Synthesising examples from the rule table would produce a corpus that trivially validates the table and measures nothing. |
| **Ground truth** | Each item labelled with the disposition a qualified clinician would assign, on a scale that maps onto the four bands. An established triage scale (Manchester Triage System, ESI, or an equivalent) should be adopted rather than inventing one, so labels are comparable to published work. |
| **Adjudication** | At least two independent clinician raters per item, with a documented adjudication procedure for disagreements. |
| **Inter-rater agreement** | Cohen's or Fleiss' κ reported for the label set itself, **before** any system metric is computed. If clinicians do not agree with each other, no system score against those labels is interpretable, and reporting one would be misleading. |
| **Scale** | Enough items for a usable confidence interval on the safety-critical metric, stratified so that each of the 11 red-flag categories and the true-emergency class are adequately represented. Rare-but-critical classes drive the required size; a corpus that is 95% routine cannot measure emergency sensitivity. |
| **Splits** | A development split used while iterating on rules, and a **held-out test split touched exactly once, at the end**. Any table tuned against the test split invalidates the reported figure. |
| **Expertise and effort** | Clinician time for labelling and adjudication, a data-use agreement and privacy review for the source material, and statistical review of the sampling design. This is a multi-person, multi-month programme, not a sprint task. That is the honest reason it has not been done. |

### 4.2 Step 2 — metrics that actually matter for a triage screen

Reporting overall accuracy for a triage screen is close to meaningless, because the class distribution is heavily skewed toward `routine`: a system that returns `routine` unconditionally would score well on accuracy and be actively dangerous. The metrics that matter are asymmetric:

| Metric | Why it matters here | Target-setting note |
|---|---|---|
| **Sensitivity (recall) for the emergency class** | **This is the safety-critical metric.** A missed emergency — a true emergency scored `routine` — is the harmful error. It is the error this system is currently most prone to, because its failure mode is silent non-matching (§5.2, §5.3). | Any target must be set by clinicians against the intended use, not chosen by engineers. |
| **Specificity** | Drives alert fatigue and over-referral. A screen that flags everything is ignored, which converts into missed emergencies indirectly. | Trades against sensitivity; the operating point is a clinical decision. |
| **Negative predictive value at the operating prevalence** | The number that answers the question a user actually has: "it said routine — how much should I trust that?" Depends on prevalence, so it must be reported *with* the prevalence assumed. | |
| **Per-category sensitivity** | Aggregate sensitivity hides category-level blindness. Each of the 11 groups needs its own figure — a system that catches 9 categories well and is blind to stroke has an acceptable-looking aggregate and an unacceptable failure. | |
| **Confusion matrix over the 4 bands** | Not all errors are equal. `emergency` → `urgent` is a different failure from `emergency` → `routine`, and a flat error rate conflates them. An ordinal-weighted measure (e.g. quadratic-weighted κ) captures the ordering. | |
| **Calibration of score→band** | Is `score ≥ 60` the right emergency cut-point? The current thresholds (`triageScorer.ts:46-51`) and the weights behind them have **no documented derivation** — see AI-055 in §6. Calibration would either justify them or move them. | |
| **Agreement with the clinician labels vs. clinician-clinician agreement** | The realistic ceiling. A system cannot meaningfully exceed the agreement clinicians achieve with each other on the same items. | |

For `ALG-002` the framing differs: it is a lookup, not a classifier, so the meaningful measures are **recall against a reference interaction database** (what fraction of clinically significant pairs in a real prescription corpus does a 14-row table catch — see §6) and **precision on realistic medication-list input**, which is where the AI-006 defect would show up quantitatively.

### 4.3 Step 3 — protocol

1. Freeze the rule tables and record the commit hash and a table version (which does not currently exist — AI-057).
2. Run the frozen engines over the held-out split with no human in the loop.
3. Report every metric in §4.2 **with confidence intervals**, alongside the inter-rater κ from §4.1 and the label prevalence.
4. Report the failure inventory: every item where the system said `routine` and the clinicians said `emergency`, categorised by cause (no matching keyword, negation, synonym, spelling, language, context).
5. Publish the corpus construction method, the exclusions, and the operating point chosen — or state plainly that the result does not support clinical use.
6. Re-run on every change to either rule table, as a gate.

### 4.4 What the result would most likely be

Stated as an expectation from code reading, not as a measurement, and not as a substitute for doing the work: a matcher over 37 fixed English phrases with no negation, synonym, or spelling handling would be expected to show **poor sensitivity on free-text input written by real users**, because the dominant failure mode is silent non-matching. §5.2 and §5.3 demonstrate this qualitatively on hand-chosen inputs. The purpose of the evaluation would be to quantify how poor — and the reason to state this expectation up front is that a reader should not be surprised by the answer, and should not be given the impression the evaluation is a formality.

---

## 5. Known failure modes derived from the code

**Method and status:** each finding below was derived by reading the implementation, then confirmed by executing the shipped code (`api/src/services/triageScorer.ts`, `api/src/services/interactionChecker.ts`) at commit `32ffd73` on 2026-08-21 with hand-chosen inputs. These are **analytical findings confirmed by observation on selected inputs** — they demonstrate that a failure mode exists. They are **not** measurements: no rate, frequency, or population-level figure is implied by any of them, because no representative sample was used and none exists.

### 5.1 The matcher is a literal, whole-phrase substring test

`triageScorer.ts:59` is `normalized.includes(kw)` — nothing more. There is no tokenisation, so keywords match across word boundaries and only as exact phrases. The clearest illustration is in the real proof-run input itself: `"Sudden chest pain and shortness of breath"` contains the word "sudden", and group 3 contains the keyword `sudden confusion`, but no stroke flag is raised, because the literal phrase is absent. Everything below follows from this one design property.

### 5.2 No negation handling — AI-050 **NOT IMPLEMENTED**

| Input | Score | Band | Flags |
|---|---|---|---|
| `"chest pain"` | 35 | `urgent` | possible cardiac chest pain |
| `"no chest pain"` | **35** | **`urgent`** | possible cardiac chest pain |
| `"denies chest pain"` | **35** | **`urgent`** | possible cardiac chest pain |

A negated symptom scores identically to an asserted one. Clinical free text is dense with negation — "no chest pain, no shortness of breath" is one of the most common sentences in a medical note — so this is not an edge case, it is the normal shape of the input domain. **Direction of error: false positive.** Less dangerous than the converse, but it means the score is not measuring what its name says it measures.

### 5.3 No synonym, lay-term, abbreviation or misspelling coverage — AI-051 **NOT IMPLEMENTED**

| Input | Score | Band |
|---|---|---|
| `"heart attack"` | **0** | **`routine`** |
| `"MI"` | **0** | **`routine`** |
| `"SOB"` | **0** | **`routine`** |
| `"chest pian"` (transposition) | **0** | **`routine`** |

**This is the most serious failure mode in the system.** *"I think I'm having a heart attack"* — the single most direct way a person in the English-speaking world describes a cardiac emergency — returns `score: 0, band: "routine", matchedFlags: []`. The two clinical abbreviations a healthcare worker would type most naturally (`MI`, `SOB`) do the same. A one-character typo defeats the match entirely.

**Direction of error: false negative — the harmful direction.** The system is silent rather than wrong, and its output is indistinguishable from the output for genuinely benign input. Nothing in the response signals low confidence or non-recognition. Mitigation is entirely external: the unconditional disclaimer (`triageScorer.ts:18-21`) and the fact that this is a demonstration endpoint returning synthetic-grade output, not a deployed clinical service. See [`Limitations.md`](./Limitations.md) §2.

### 5.4 No multilingual support — AI-054 **NOT IMPLEMENTED**

`"dolor de pecho"` (Spanish, "chest pain") ⇒ **0 / `routine`**. All 37 keyword phrases are English. Non-English input is not detected, not rejected, and not distinguished from benign English input — it silently receives the same `routine` output. The endpoint is publicly reachable and unauthenticated, so nothing prevents a non-English caller from receiving it.

### 5.5 Unanchored bidirectional matching produces false positives — AI-006 **NOT IMPLEMENTED**

`interactionChecker.ts:42-43` tests `m.includes(a) || a.includes(m)` with no length floor and no token anchoring. The first clause is the deliberate, tested feature that lets `"Aspirin 81mg"` match `aspirin`. The second clause is the defect.

| Input | `flagged` | Matches | Note |
|---|---|---|---|
| `["a", "b"]` | **true** | **5** — warfarin+aspirin, warfarin+ibuprofen, warfarin+naproxen, maoi+sertraline, simvastatin+clarithromycin | Contains no medication |
| `["i", "n"]` | **true** | **12 of 14** | Common letters match almost the whole table |

Severity **LOW–MEDIUM**: it cannot invent a pair that is not in the table, and the direction of error is a false positive, which is the safer direction for a screening tool. But a caller passing a truncated or unsanitised field receives an alarming `contraindicated` or `major` warning with a fully-populated clinical description, for input that means nothing.

**And the test suite runs straight through it.** `interactionChecker.spec.ts:33-37` calls `checkInteractions(["a", "b"])` — this exact input — and asserts only that `source` is non-empty and that `disclaimer` contains a substring. It never touches `flagged` or `matches`. The behaviour is exercised on every run and asserted against never. **AI-058 RECOMMENDED**: add a regression test asserting that a single-character or garbage medication list flags nothing. **AI-052 RECOMMENDED**: anchor matching at token boundaries or resolve names through a normalised vocabulary.

### 5.6 Additive weights with no interaction modelling

Weights are summed independently (`triageScorer.ts:61`); no rule models how symptoms combine, and no combination is treated as more (or less) than the sum of its parts. Verified consequences:

| Input | Arithmetic | Score | Band |
|---|---|---|---|
| `"high fever and persistent vomiting and mild headache and sore throat"` | 12 + 10 + 2 | 24 | `soon` |
| `"severe abdominal pain and high fever and persistent vomiting"` | 20 + 12 + 10 | 42 | **`urgent`** |

Three or four individually non-emergency findings escalate the band with no clinical reasoning behind the escalation — the band moved because three integers happened to sum past a threshold. Note the two boundaries of this concern, stated precisely rather than for maximum alarm:

- Groups 9, 10 and 11 alone sum to 24, so `soon` is reachable from unremarkable findings.
- The four lowest-weight groups (8, 9, 10, 11) sum to `20 + 12 + 10 + 2 = 44`, which is `urgent` — but **cannot** reach the 60 `emergency` threshold. `emergency` requires at least one of the seven high-weight groups plus one other, since the largest single weight is 45.

Conversely, the additive model with a hard cap discards information at the top end: `triageScorer.spec.ts:32-38` matches 7 groups for a raw 255, reported as 100 — identical to any other input reaching the cap. A patient matching 7 red flags and one matching 3 severe ones are indistinguishable in the output.

### 5.7 The score has no probabilistic meaning — AI-055 **NOT IMPLEMENTED**

`score: 70` is not a 70% probability of anything. It is the sum of two integers a developer chose, on a scale defined by nothing but the other integers in the same table. There is no documented derivation for why chest pain is 35 and stroke is 40, why the emergency cut-point is 60 rather than 55, or why the maximum is 100 rather than the natural table maximum of 299. The numbers are internally consistent and externally uninterpreted.

The consequence for a consumer: **the score is ordinal at best and should not be arithmetically compared across patients, averaged, thresholded at a custom cut-point, or fed into a downstream calculation.** A score of 70 is not "twice as urgent" as 35. AI-003 — the system shall not present the triage score as a clinical severity measure — is **IMPLEMENTED** in the sense that the disclaimer and band names avoid claiming it is one, but a numeric field called `score` invites exactly this misreading, and this document flags it rather than relying on the disclaimer to do all the work.

### 5.8 No context of any kind — AI-056 **NOT IMPLEMENTED**

Neither request schema accepts age, sex, pregnancy status, comorbidity, medication history, dose, route, frequency, duration, or renal/hepatic function. `"chest pain"` scores 35 for a 4-year-old and for an 80-year-old with known coronary disease. `["warfarin", "aspirin"]` returns the same `major` result whether the aspirin is 81 mg cardioprotective (often deliberately co-prescribed and monitored) or 650 mg analgesic, and whether it is a one-off or chronic. Dose- and duration-dependence is where much of real interaction significance lives, and none of it is representable.

### 5.9 Summary of failure directions

| Failure mode | Direction | Severity | Requirement |
|---|---|---|---|
| No synonym / lay-term / abbreviation / spelling coverage | **False negative** | **HIGH** | AI-051 |
| Non-English input silently scored `routine` | **False negative** | **HIGH** | AI-054 |
| No negation handling | False positive | MEDIUM | AI-050 |
| Unanchored medication matching | False positive | LOW–MEDIUM | AI-006, AI-052 |
| Additive accumulation across unrelated findings | False positive (bounded below `emergency`) | LOW–MEDIUM | AI-055 |
| Score cap discards top-end discrimination | Information loss | LOW | — |
| Score has no calibrated meaning | Misinterpretation | MEDIUM | AI-055 |
| No patient or prescription context | Both | **HIGH** | AI-056 |

The false-negative rows are the ones that matter, and they are the ones this system is structurally worst at. That is the opposite of the profile a safety screen should have, and it is stated here rather than buried.

---

## 6. Coverage analysis

Order-of-magnitude framing only. **No count of real-world clinical presentations or drug interactions is quoted here, because producing one would require a reference source this review has not consulted, and inventing one would be worse than saying nothing.**

### 6.1 Triage — 11 groups, 37 keyword phrases

The 11 groups map onto widely-taught emergency warning signs — the FAST stroke mnemonic, cardiac and respiratory red flags, anaphylaxis, major haemorrhage, loss of consciousness, and a mental-health crisis group. As a *teaching set of the most commonly taught red flags*, the selection is defensible and the in-code comment says exactly that: *"Deliberately small and legible rather than exhaustive"* (`triageScorer.ts:29-31`).

As *coverage of clinical presentation*, the framing is this: an established triage scale of the kind referenced in §4.1 discriminates across the full breadth of emergency presentation using structured discriminator flowcharts, and a working clinical vocabulary contains many orders of magnitude more terms than 37 phrases. **Eleven categories cannot cover emergency presentation, and MedRail does not claim they do.** Whole domains are simply absent — obstetric emergencies, paediatric-specific presentations, sepsis, trauma mechanism, toxicological exposure, ophthalmic and testicular emergencies, and diabetic emergencies among them. And within the covered categories, the 37 phrases are the *canonical* phrasings, not the phrasings people actually use (§5.3).

The honest reading: **absence of a flag carries essentially no information.** It means "none of these 37 phrases appeared", not "no emergency present". `matchedFlags: []` and `band: "routine"` are the system's response to a benign checkup request, to a heart attack described in plain English, and to Spanish input alike.

### 6.2 Interactions — 14 pairs, 24 drug tokens

A published interaction reference covers a space defined by the product of the marketed-drug set with itself, filtered to clinically significant pairs — a space that is orders of magnitude larger than 14 rows on any plausible accounting. Four of the 24 tokens are classes rather than agents (`maoi`, `ssri`, `iodinated contrast`), and with no class→member vocabulary, a caller who names an actual MAOI or SSRI by its generic name matches nothing (see [`Algorithm_Inventory.md`](./Algorithm_Inventory.md) §2.3).

The table is a **teaching-scale sample**: fourteen textbook pairs chosen for recognisability, exactly as `interactions.json:2` and the endpoint's own disclaimer describe. It is not a subset of a licensed database, has not been verified against one, and carries no version, edition, or per-entry citation (**AI-057 NOT IMPLEMENTED**).

The honest reading, and the most important sentence in this section: **`flagged: false` means "none of these 14 pairs was present", and nothing more. It is not evidence of safety and must never be read as clearance.** The disclaimer at `interactionChecker.ts:20-23` says this in the response itself; this document says it again because it is the single easiest thing for a consumer of the API to get wrong.

---

## 7. What would make this document able to report a number

For a future maintainer, in dependency order:

1. **AI-053** — build the labelled corpus (§4.1). Everything else is blocked on this. It is the expensive, slow, clinician-dependent step, and there is no shortcut that produces a trustworthy number.
2. **AI-057** — version the rule tables so a reported figure can be pinned to a specific table.
3. **AI-058** — add the missing false-positive regression test. Cheap, immediate, and closes the most embarrassing gap in the current suite.
4. **AI-052** — fix the unanchored matcher, so precision measurement is not dominated by a known bug.
5. **AI-050 / AI-051 / AI-054** — add negation, synonym and language handling, or explicitly scope the endpoint to a narrower input contract and reject what it cannot handle rather than silently scoring it `routine`.
6. Run the §4.3 protocol and report the result **whatever it is**, including if it does not support the endpoint's continued existence in its current form.

Until step 1 exists, the correct answer to "how accurate is it?" is the one given at the top of this document: **unknown, unmeasured, and not claimed.**
