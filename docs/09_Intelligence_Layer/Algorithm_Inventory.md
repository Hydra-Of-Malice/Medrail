# MedRail — Algorithm Inventory

**Purpose:** the complete, exhaustive inventory of every decision-making component in MedRail's intelligence layer — identifier, type, version, inputs, outputs, full decision table, complexity, dependencies, cost and status. This is the `Model_Inventory` a reviewer would look for, honestly renamed, because there are no models to inventory.

**Status of this document:** Descriptive of commit `3b387df` on branch `main`. Every table below is transcribed directly from source and is complete — no rule, keyword, weight or drug pair has been omitted or summarised. Sections marked **RECOMMENDED** describe nothing that exists.

**Cross-references:** [`Intelligence_Architecture.md`](./Intelligence_Architecture.md) · [`Processing_Pipeline.md`](./Processing_Pipeline.md) · [`Evaluation.md`](./Evaluation.md) · [`Limitations.md`](./Limitations.md) · [`../04_Data/ER_Diagram.md`](../04_Data/ER_Diagram.md) · [`../07_Testing/Test_Cases.md`](../07_Testing/Test_Cases.md)

---

## 0. Models used: none

A reviewer scanning for a model inventory should find an unambiguous answer here rather than a hedge. There is no model in MedRail. Specifically, and exhaustively:

| Thing a model inventory would normally record | Status in MedRail |
|---|---|
| Large language model | **NOT IMPLEMENTED** — none. No LLM is called, embedded, hosted, or depended on. |
| Model provider / vendor | **NOT IMPLEMENTED** — none. No provider account, no API key, no base URL, no SDK. `api/package.json:14-23` declares ten runtime dependencies: `@hono/node-server`, `@x402/avm`, `@x402/core`, `@x402/extensions`, `@x402/fetch`, `@x402/hono`, `algosdk`, `dotenv`, `hono`, `zod`. None is a model client. |
| Model identifier / version / snapshot date | **NOT IMPLEMENTED** — not applicable; there is nothing to version. |
| Context window | **NOT IMPLEMENTED** — not applicable. The only input bound is a zod `max(2000)` character cap on the triage string (`api/src/routes/triage.ts:6`). |
| Temperature / sampling parameters / seed | **NOT IMPLEMENTED** — not applicable. Output is deterministic by construction. |
| Embedding model / vector dimensionality | **NOT IMPLEMENTED** — none. No embedding is computed anywhere in the repository. |
| Vector database / index | **NOT IMPLEMENTED** — none. There is no database of any kind in this system. |
| Retrieval-augmented generation (RAG) pipeline | **NOT IMPLEMENTED** — none. No retriever, no chunker, no reranker. |
| Fine-tuning / adapters / LoRA | **NOT IMPLEMENTED** — none. No training of any kind has occurred. |
| Training data / labelled corpus | **NOT IMPLEMENTED** — none exists. |
| Inference endpoint (hosted or self-hosted) | **NOT IMPLEMENTED** — none. No GPU, no serving runtime, no model artefact on disk. |
| Model registry / artefact store | **NOT IMPLEMENTED** — none. |
| Evaluation harness / benchmark suite | **NOT IMPLEMENTED** — none. AI-005 **NOT IMPLEMENTED**; see [`Evaluation.md`](./Evaluation.md). |
| Guardrail / content-filter model | **NOT IMPLEMENTED** — none. Safety is enforced by an unconditional constant disclaimer string, not by a classifier. |
| Token spend / inference cost | Zero. There is no metered inference. |

**Independently checkable:** `grep -rEi "openai|langchain|huggingface|transformers|tensorflow|pytorch|scikit|xgboost|onnx|llama|mistral|cohere|ollama|gemini|bedrock|pinecone|weaviate|faiss|qdrant|milvus|embedding" api/src/` returns nothing. Neither `api/package.json` nor `web/package.json` declares any such package. `api/.env.example` declares seven keys — `NETWORK`, `PORT`, `FACILITATOR_URL`, `PAY_TO_ADDRESS`, `CONSENT_APP_ID`, `OPERATOR_MNEMONIC`, `OPERATOR_ADDRESS` — none of which is a model credential.

What follows is the inventory of what *does* exist: two deterministic rule engines.

---

## 1. `ALG-001` — Triage red-flag scorer

| Field | Value |
|---|---|
| **Identifier** | `ALG-001` |
| **Name** | Triage red-flag keyword scorer |
| **Type** | **Deterministic rule engine.** Weighted keyword-group substring matcher with a summed integer score and fixed threshold banding. Not a model; not statistical; no learned parameters. |
| **Implementation** | `api/src/services/triageScorer.ts:53-73` (entry point `scoreTriage`) |
| **Decision table location** | `api/src/services/triageScorer.ts:32-44` — 11 `RedFlag` records, in source |
| **Version** | No version field exists on the module or on the rule table. The only version identifier is the git commit (`3b387df`) and the package version `medrail-api@0.1.0` (`api/package.json:3`). **This is a real gap** — a clinical rule table with no version identifier cannot be referenced by a response or pinned by a caller. See §5. |
| **Exposed at** | `POST /v1/triage`, priced **$0.02** (20000 µUSDC), x402-gated only, no consent check (`api/src/app.ts:52`, `api/src/routes/triage.ts:11`) |
| **Purpose** | Score free-text symptom description against a small set of widely-taught emergency warning signs and return an ordinal urgency band. **Not** a diagnosis, **not** a clinical severity measure (AI-003 **IMPLEMENTED**). |
| **Status** | **VALIDATED** as a behavioural specification — FR-004, FR-005, FR-006, FR-009, NFR-009, AI-001, AI-002 all **VALIDATED** by `api/test/triageScorer.spec.ts` (7 tests). **NOT VALIDATED** clinically — AI-005 **NOT IMPLEMENTED**; no accuracy figure exists. |

### 1.1 Input

| Property | Constraint | Enforced at |
|---|---|---|
| Field name | `symptoms` | `api/src/routes/triage.ts:6` |
| Type | `string` | `z.string()` |
| Minimum length | 1 character | `.min(1)` |
| Maximum length | 2000 characters | `.max(2000)` |
| Encoding / language | Not constrained. No language detection, no charset restriction. English keyword phrases only — see [`Limitations.md`](./Limitations.md) §3. |
| On violation | HTTP 400 `{error: "invalid request", details: <zod flatten>}` — **before** the engine is reached | `api/src/routes/triage.ts:13-15` |
| On unparseable JSON body | `c.req.json().catch(() => ({}))` yields `{}`, which fails the schema ⇒ HTTP 400 | `api/src/routes/triage.ts:12` |

### 1.2 Output

`TriageResult`, defined at `api/src/services/triageScorer.ts:11-16`, serialised verbatim by `routes/triage.ts:17`:

| Field | Type | Guarantee |
|---|---|---|
| `score` | `number` | Integer in `[0, 100]`. Lower bound from the empty-match case; upper bound enforced by `Math.min(100, score)` at `triageScorer.ts:65`. |
| `band` | `"routine" \| "soon" \| "urgent" \| "emergency"` | Closed union (`triageScorer.ts:9`). Always derived from `score` via `bandFor` (`triageScorer.ts:69`), so it can never disagree with `score`. |
| `matchedFlags` | `string[]` | Zero to eleven entries, each an exact `label` string from the table in §1.3. Order follows table order, not severity. Each group appears **at most once** regardless of how many of its keywords matched. |
| `disclaimer` | `string` | Constant, unconditional. Verbatim text in [`Limitations.md`](./Limitations.md) §6. AI-002 / FR-009. |

### 1.3 Complete decision table — all 11 red-flag groups

Transcribed in full from `api/src/services/triageScorer.ts:32-44`. Nothing is omitted. Keywords are matched as **literal lowercase substrings of the whole input**, not as tokens.

| # | Source line | Keywords (exact, complete) | Weight | Label emitted |
|---|---|---|---|---|
| 1 | `:33` | `chest pain`, `chest pressure`, `crushing pain` | **35** | `possible cardiac chest pain` |
| 2 | `:34` | `can't breathe`, `cannot breathe`, `difficulty breathing`, `shortness of breath` | **35** | `respiratory distress` |
| 3 | `:35` | `face drooping`, `slurred speech`, `one side weak`, `sudden confusion` | **40** | `possible stroke (FAST signs)` |
| 4 | `:36` | `losing consciousness`, `passed out`, `unresponsive`, `fainted` | **30** | `loss of consciousness` |
| 5 | `:37` | `severe bleeding`, `won't stop bleeding`, `heavy blood loss` | **30** | `severe bleeding` |
| 6 | `:38` | `suicidal`, `want to die`, `self harm`, `end my life` | **45** | `mental health crisis` |
| 7 | `:39` | `severe allergic reaction`, `throat closing`, `anaphylaxis`, `swelling face` | **40** | `possible anaphylaxis` |
| 8 | `:40` | `severe abdominal pain`, `worst pain of my life` | **20** | `severe pain, unclear source` |
| 9 | `:41` | `high fever`, `fever over 104`, `fever over 40` | **12** | `high fever` |
| 10 | `:42` | `persistent vomiting`, `can't keep anything down` | **10** | `persistent vomiting` |
| 11 | `:43` | `mild headache`, `runny nose`, `sore throat`, `mild cough` | **2** | `common mild symptom` |

**Table totals:** 11 groups · **37 distinct keyword phrases** · weights summing to **299** if every group matched.

### 1.4 Scoring and banding

```
score  = Σ over groups g where any keyword of g is a substring of lowercase(input) : weight(g)
score  = min(100, score)                                  triageScorer.ts:65
```

Note the semantics precisely: `flag.keywords.some(...)` at `triageScorer.ts:59` means a group contributes its weight **once**, not once per matching keyword. Matching three stroke keywords still adds 40, not 120.

| Band | Condition | Source |
|---|---|---|
| `emergency` | `score >= 60` | `triageScorer.ts:47` |
| `urgent` | `score >= 30` | `triageScorer.ts:48` |
| `soon` | `score >= 10` | `triageScorer.ts:49` |
| `routine` | otherwise (i.e. `score < 10`, including 0) | `triageScorer.ts:50` |

Thresholds are evaluated top-down, so the first satisfied condition wins. FR-006 **VALIDATED** by four band cases in `triageScorer.spec.ts`.

**Structural consequences of these numbers**, stated because they follow arithmetically and a reviewer will check them:

- The cap binds readily. Any four of groups 1–7 sum to at least 130, so `score: 100` is reached long before all eleven groups match. `triageScorer.spec.ts:32-38` exercises this with seven matching groups: `35 + 35 + 40 + 30 + 30 + 45 + 40 = 255`, capped to **100**.
- `emergency` requires at least **two** matched groups. The largest single weight is 45 (group 6), below the 60 threshold. No single red flag — including a stroke or an anaphylaxis signal — reaches `emergency` alone.
- The four lowest-weight groups (8, 9, 10, 11) sum to `20 + 12 + 10 + 2 = 44`, which is `urgent`. So an `urgent` band is reachable from accumulated non-emergency findings, but `emergency` is **not** reachable from those four groups alone. The accumulation concern is real up to `urgent` and bounded there — see [`Evaluation.md`](./Evaluation.md) §5.4.
- Groups 9, 10 and 11 alone sum to `12 + 10 + 2 = 24` ⇒ `soon`. Three unremarkable findings escalate the band above `routine` with no interaction modelling whatsoever.

### 1.5 Complexity, cost and latency

| Property | Value |
|---|---|
| **Time complexity** | `O(F · K · n · m)` where `F = 11` groups, `K ≤ 4` keywords per group, `n ≤ 2000` input characters, `m ≤ 24` keyword characters. All four factors are constant-bounded, so the work per call is bounded by a fixed ceiling: at most **37** `String.prototype.includes` calls (`.some()` short-circuits on the first match within a group, so 37 is the worst case, reached when nothing matches). |
| **Space complexity** | `O(n)` for the lowercased copy at `triageScorer.ts:54`, plus a `matched` array of at most 11 strings. No allocation grows with call volume. |
| **External calls** | None. No network, no filesystem, no process, no clock. |
| **State** | None. No caching, no memoisation, no counters, no accumulators between calls. |
| **Cost per invocation** | **Zero marginal.** No metered dependency of any kind. Revenue per call is $0.02 (`api/src/app.ts:52`), of which none is variable cost. |
| **Latency** | **No measurement exists in this repository and none is claimed.** No load test, no benchmark, no profiling harness. What can honestly be said is structural: the work is bounded local computation with no I/O, so this function cannot be the source of a network-dependent tail. The full 18-test API suite — dominated by a live facilitator call in `x402-flow.spec.ts`, not by these functions — completes in 4.08 s (measured 2026-08-21). PERF-003 **NOT IMPLEMENTED**. |
| **Dependencies** | None beyond the JavaScript standard library (`String.prototype.toLowerCase`, `String.prototype.includes`, `Math.min`, `Array.prototype.some/push`). Zero npm packages are imported by `triageScorer.ts`. |
| **Failure modes** | The function cannot throw for any input satisfying the zod schema. There is no branch that can produce an exception, no parse step, and no external call. Any HTTP 5xx on `/v1/triage` originates outside this module. |

---

## 2. `ALG-002` — Drug-interaction pair checker

| Field | Value |
|---|---|
| **Identifier** | `ALG-002` |
| **Name** | Drug-interaction reference-table lookup |
| **Type** | **Deterministic rule engine.** Exhaustive scan of a static pair table with bidirectional unanchored substring matching on normalised names. Not a model; no learned parameters; no similarity metric, no fuzzy distance, no embedding. |
| **Implementation** | `api/src/services/interactionChecker.ts:36-55` (entry point `checkInteractions`) |
| **Decision table location** | `api/src/data/interactions.json:3-74` — 14 pair records, read once at module load by `readFileSync` (`interactionChecker.ts:18`) |
| **Version** | `interactions.json` has **no version field, no edition, no revision date, and no per-entry citation** — only a single `source` string at `:2`. As with `ALG-001`, the only version identifier is the git commit. **This is a real gap for a file that functions as a clinical reference.** See §5 and AI-057. |
| **Exposed at** | `POST /v1/interaction-check`, priced **$0.02** (20000 µUSDC), x402-gated only, no consent check (`api/src/app.ts:42`, `api/src/routes/interaction.ts:11`) |
| **Purpose** | Report whether any pair in a submitted medication list appears in a small curated table of well-documented severe interactions, with a severity tier and an explanation. **Not** a comprehensive interaction database. |
| **Status** | **VALIDATED** as a behavioural specification — FR-007, FR-008, FR-009, DATA-005, AI-004 **VALIDATED** by `api/test/interactionChecker.spec.ts` (6 tests). **NOT VALIDATED** clinically. **AI-006 NOT IMPLEMENTED** — the matcher produces false positives on short names; see §2.5 and [`Evaluation.md`](./Evaluation.md) §5.5. |

### 2.1 Input

| Property | Constraint | Enforced at |
|---|---|---|
| Field name | `medications` | `api/src/routes/interaction.ts:6` |
| Type | `string[]` | `z.array(z.string().min(1))` |
| Minimum items | 2 | `.min(2)` — a single medication cannot interact with itself |
| Maximum items | 20 | `.max(20)` |
| Per-item minimum length | 1 character | `z.string().min(1)` |
| Per-item **maximum** length | **None.** No upper bound is declared on an individual medication name, unlike the 2000-character cap on the triage string. | `interaction.ts:6` — see AI-059 in §5 |
| Ordering / duplicates | Not constrained. Duplicates and arbitrary order are accepted; the matcher is order-independent. |
| On violation | HTTP 400 `{error: "invalid request — provide at least 2 medications", details: <zod flatten>}` — **before** the engine is reached | `api/src/routes/interaction.ts:13-15` |

### 2.2 Output

`InteractionCheckResult`, defined at `api/src/services/interactionChecker.ts:25-30`, serialised verbatim by `routes/interaction.ts:17`:

| Field | Type | Guarantee |
|---|---|---|
| `flagged` | `boolean` | Exactly `matches.length > 0` (`interactionChecker.ts:50`). Carries no confidence, probability, or threshold. |
| `matches` | `Array<{drugs: [string, string], severity, description}>` | Zero to fourteen entries. `drugs`, `severity` and `description` are the **unmodified** table values, not the caller's spelling (`interactionChecker.ts:45`). Order follows table order, not severity — a `moderate` match can precede a `contraindicated` one. |
| `severity` | `"moderate" \| "major" \| "contraindicated"` | Closed union (`interactionChecker.ts:9`). Three tiers only; no numeric grading, no dose-dependence, no onset/timing dimension. |
| `source` | `string` | The single provenance string from `interactions.json:2`, verbatim. DATA-005 / AI-004. |
| `disclaimer` | `string` | Constant, unconditional. Verbatim text in [`Limitations.md`](./Limitations.md) §6. AI-002 / FR-009. |

### 2.3 Complete decision table — all 14 interaction pairs

Transcribed in full from `api/src/data/interactions.json`. Nothing is omitted, abbreviated, or paraphrased.

| # | JSON line | Drug A | Drug B | Severity | Description (verbatim) |
|---|---|---|---|---|---|
| 1 | `:5` | `warfarin` | `aspirin` | **major** | Combined anticoagulant/antiplatelet effect substantially increases bleeding risk. |
| 2 | `:10` | `warfarin` | `ibuprofen` | **major** | NSAIDs increase bleeding risk and can displace warfarin from protein binding. |
| 3 | `:15` | `warfarin` | `naproxen` | **major** | NSAIDs increase bleeding risk and can displace warfarin from protein binding. |
| 4 | `:20` | `maoi` | `ssri` | **contraindicated** | Risk of serotonin syndrome; generally contraindicated in combination. |
| 5 | `:25` | `maoi` | `sertraline` | **contraindicated** | Risk of serotonin syndrome; generally contraindicated in combination. |
| 6 | `:30` | `lisinopril` | `spironolactone` | **moderate** | ACE inhibitor plus potassium-sparing diuretic raises hyperkalemia risk; monitor potassium. |
| 7 | `:35` | `simvastatin` | `clarithromycin` | **major** | Strong CYP3A4 inhibition raises statin levels substantially; increased rhabdomyolysis risk. |
| 8 | `:40` | `simvastatin` | `erythromycin` | **major** | CYP3A4 inhibition raises statin levels; increased myopathy/rhabdomyolysis risk. |
| 9 | `:45` | `sildenafil` | `nitroglycerin` | **contraindicated** | Severe, potentially life-threatening hypotension; nitrates and PDE5 inhibitors must not be combined. |
| 10 | `:50` | `metformin` | `iodinated contrast` | **moderate** | Risk of contrast-induced nephropathy compounding lactic acidosis risk; typically held around contrast studies. |
| 11 | `:55` | `clopidogrel` | `omeprazole` | **moderate** | CYP2C19 inhibition may reduce clopidogrel's antiplatelet effect. |
| 12 | `:60` | `methotrexate` | `trimethoprim` | **major** | Additive antifolate effect increases risk of bone marrow suppression. |
| 13 | `:65` | `lithium` | `hydrochlorothiazide` | **major** | Thiazide diuretics reduce lithium clearance, raising toxicity risk. |
| 14 | `:70` | `digoxin` | `amiodarone` | **major** | Amiodarone raises digoxin levels; dose reduction and monitoring typically required. |

**Table totals:** 14 pairs · **24 distinct drug tokens** · severity distribution: **8 major**, **3 contraindicated**, **3 moderate**.

Note that four "drugs" in the table are not individual agents: `maoi` and `ssri` (`:20`) are drug *classes*, and `iodinated contrast` (`:50`) is an agent class. Because matching is on literal substrings and no drug-to-class vocabulary exists, a caller submitting `"phenelzine"` (an MAOI) or `"fluoxetine"` (an SSRI) matches **nothing**. This is a coverage limitation, not a matcher bug, and it is enumerated in [`Limitations.md`](./Limitations.md) §3.

### 2.4 Provenance — read this precisely

The `source` field returned on every response is, verbatim from `api/src/data/interactions.json:2`:

> "Widely-taught, textbook-level severe drug-interaction pairs (e.g. standard pharmacology references such as Lexicomp/Micromedex-class severity classifications). Not exhaustive and not a substitute for a pharmacist or prescriber review."

**What this string does and does not assert.** It names Lexicomp and Micromedex as a *class* of reference whose severity vocabulary (`moderate` / `major` / `contraindicated`) the table borrows. It is **not** a licence, **not** an extract, **not** a derived dataset, and **not** a verification claim. No entry in this table has been checked against a Lexicomp or Micromedex record, no edition or revision date is cited, and no per-entry citation exists. The pairs are well-known textbook examples; that is the honest description, and it is what the string itself says. Any reading of this field as "sourced from Lexicomp" would be a misreading, and this document states so explicitly so that no reader has to guess. See AI-057 in §5.

### 2.5 Matching semantics — and the known defect

```ts
// interactionChecker.ts:32-34
function normalize(name: string): string { return name.trim().toLowerCase(); }

// interactionChecker.ts:42-43
const hasA = normalized.some((m) => m.includes(a) || a.includes(m));
const hasB = normalized.some((m) => m.includes(b) || b.includes(m));
```

The match is **bidirectional** and **unanchored**. `m.includes(a)` is what makes `"Aspirin 81mg"` match `aspirin` — a deliberate, tested tolerance for dose-annotated names (`interactionChecker.spec.ts:23-26`, FR-008 **VALIDATED**). But the second clause, `a.includes(m)`, means a *table entry containing the caller's string* also counts as a match, with no minimum length.

**AI-006 — Matching shall not produce false positives on short or malformed medication names — NOT IMPLEMENTED.** Verified by executing the shipped code at commit `3b387df` on 2026-08-21:

| Input | Result | Why |
|---|---|---|
| `["a", "b"]` | `flagged: true`, **5 matches** — warfarin+aspirin, warfarin+ibuprofen, warfarin+naproxen, maoi+sertraline, simvastatin+clarithromycin | `"warfarin".includes("a")` is true, `"ibuprofen".includes("b")` is true, and so on |
| `["i", "n"]` | `flagged: true`, **12 of the 14 pairs** | `i` and `n` are common letters; only pairs whose both members lack one of them escape |
| `["warfarin", "aspirin"]` | `flagged: true`, 1 match | correct behaviour |
| `["metformin 500mg", "lisinopril 10mg"]` | `flagged: false` | correct behaviour |

Severity: **LOW–MEDIUM**. It cannot fabricate a *pair* that is not in the table, and it produces false positives rather than false negatives, which is the safer direction for a screening tool. But `flagged: true` with a `contraindicated` description returned for the input `["a","b"]` is plainly wrong, and a caller passing an unsanitised or truncated field would receive alarming, unfounded output.

**It is exercised but never asserted.** `interactionChecker.spec.ts:33-37` literally calls `checkInteractions(["a", "b"])` and then asserts only that `source` is non-empty and that `disclaimer` contains a substring. It never inspects `flagged` or `matches`, so the test suite runs directly through this defect on every CI run without detecting it. That is the single most instructive line in the test suite and is discussed further in [`Evaluation.md`](./Evaluation.md) §3.

**Fix (RECOMMENDED, not implemented):** anchor matching at token boundaries, or resolve names through a normalised vocabulary (RxNorm-style) before comparison, and require a minimum match length. Add the regression test described as AI-058 in §5.

### 2.6 Complexity, cost and latency

| Property | Value |
|---|---|
| **Time complexity** | `O(P · D · M)` where `P = 14` pairs, `D = 2` drugs per pair, `M ≤ 20` medications, with two `includes` calls per comparison — a worst case of `14 × 2 × 20 × 2 = 1120` substring tests, reduced in practice by `.some()` short-circuiting. Each test is `O(len(m) · len(drug))`. **`len(m)` is not bounded by the schema** (§2.1), so the only ceiling on per-call work is the HTTP body size limit, not an application constraint. See AI-059. |
| **Space complexity** | `O(M)` for the normalised copy at `interactionChecker.ts:37`, plus a `matches` array of at most 14 records. The 75-line table is loaded once per process, not per call. |
| **External calls** | One synchronous `readFileSync` at **module load only** (`interactionChecker.ts:18`). Zero I/O per request. |
| **Startup consideration** | Because the read is at import time and unguarded, a missing or malformed `dist/data/interactions.json` is a **process-start failure**, not a per-request error. The Dockerfile copies `api/src/data` → `dist/data` for exactly this reason. This is fail-fast and correct behaviour, but it is worth knowing that this file is a hard boot dependency. |
| **State** | None between calls. `DATA` is module-scoped and read-only by convention (not frozen with `Object.freeze`). |
| **Cost per invocation** | **Zero marginal.** Revenue per call $0.02 (`api/src/app.ts:42`), no variable cost. |
| **Latency** | **No measurement exists and none is claimed.** PERF-003 **NOT IMPLEMENTED**. |
| **Dependencies** | `node:fs`, `node:url`, `node:path` — Node standard library only, and all three used solely at import time. Zero npm packages. |
| **Failure modes** | After successful module load, the function cannot throw for any schema-valid input. All parsing happens at import. |

---

## 3. Components deliberately **not** in this inventory

To pre-empt the obvious question about the third priced endpoint:

| Component | Why it is not an algorithm |
|---|---|
| `POST /v1/records/summary` (`api/src/routes/records.ts`) | Contains no scoring, matching, or inference. It performs an on-chain consent check and returns a **fixed synthetic constant** (`records.ts:17-23`) that is identical for every `patientId`. DATA-004 **IMPLEMENTED**. It is a consent-gated lookup, not intelligence. Its access control — the payer-binding check that rejects a `requesterAddress` the payment signature does not support (`api/src/x402Payer.ts`, formerly finding S-1 / G-01, now **CLOSED**) — belongs to [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md), not here. |
| `GET /v1/consent/status`, `GET /v1/consent/app-info`, `GET /v1/consent/arc56`, `GET /v1/health`, `GET /` | Free endpoints; no decision logic. |
| `MedRailConsent` smart contract | A deterministic state machine over box storage. Documented in [`../03_Architecture/`](../03_Architecture/). |

---

## 4. Inventory summary

| ID | Component | Type | Rules | Marginal cost | Deterministic | Clinically validated |
|---|---|---|---|---|---|---|
| `ALG-001` | Triage red-flag scorer | Deterministic rule engine | 11 groups / 37 keyword phrases | Zero | Yes | **No** |
| `ALG-002` | Drug-interaction lookup | Deterministic rule engine | 14 pairs / 24 drug tokens | Zero | Yes | **No** |
| — | Any model of any kind | — | — | — | — | **Does not exist** |

Total decision surface of MedRail's entire "AI" layer: **25 rules**.

---

## 5. Requirements newly allocated by this directory

Allocated from the reserved block **AI-050…AI-069**. Each is `(new, added by 09_Intelligence_Layer)`. None redefines an existing ID.

| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| AI-050 | Negation in symptom text shall suppress or invert the matched red-flag group. | **NOT IMPLEMENTED** | `triageScorer.ts:59` is a bare `includes`; verified `"no chest pain"` ⇒ score 35, band `urgent` |
| AI-051 | Common lay terms, clinical abbreviations and synonyms shall resolve to the same red-flag group as their canonical phrase. | **NOT IMPLEMENTED** | verified `"heart attack"`, `"MI"`, `"SOB"` ⇒ score 0, band `routine` |
| AI-052 | Medication-name matching shall be anchored at token boundaries or resolved through a normalised vocabulary. | **RECOMMENDED** | fix for AI-006; `interactionChecker.ts:42-43` |
| AI-053 | A labelled evaluation corpus with clinician-adjudicated ground truth shall exist before any accuracy, sensitivity or specificity claim is made about either engine. | **NOT IMPLEMENTED** | no dataset, no harness; see [`Evaluation.md`](./Evaluation.md) §4 |
| AI-054 | Non-English symptom input shall be recognised, or explicitly rejected rather than silently scored `routine`. | **NOT IMPLEMENTED** | verified `"dolor de pecho"` ⇒ score 0, band `routine` |
| AI-055 | The triage score shall carry a documented, calibrated interpretation rather than being an uninterpreted ordinal artefact of chosen weights. | **NOT IMPLEMENTED** | weights at `triageScorer.ts:33-43` have no stated derivation |
| AI-056 | Patient context (age, pregnancy, comorbidity) and prescription context (dose, route, duration) shall be accepted and used in scoring and interaction matching. | **NOT IMPLEMENTED** | no such field exists in either request schema |
| AI-057 | Every rule-table entry shall carry a per-entry citation to a named reference edition, and the table shall carry a version and revision date. | **NOT IMPLEMENTED** | `interactions.json:2` carries one collective, class-level provenance string and no version field |
| AI-058 | A regression test shall assert that a single-character or garbage medication list flags no interaction. | **RECOMMENDED** | `interactionChecker.spec.ts:33-37` calls exactly this input and asserts nothing about `flagged` |
| AI-059 | Every free-text field accepted by an intelligence endpoint shall have an explicit maximum length. | **PARTIALLY IMPLEMENTED** | `triage.ts:6` caps at 2000 chars; `interaction.ts:6` caps array length at 20 but sets **no per-item maximum** |
