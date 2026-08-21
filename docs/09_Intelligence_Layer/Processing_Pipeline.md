# MedRail — Intelligence Processing Pipeline

**Purpose:** trace exactly what happens to a caller's input, stage by stage, from HTTP body to JSON response, for both intelligence engines — with worked arithmetic against the real, on-chain-settled proof run so a reviewer can check every step by hand.

**Status of this document:** Descriptive of commit `3b387df` on branch `main`. The triage worked example in §4 reproduces output recorded in `contracts/artifacts/e2e-proof.json` from a genuine facilitator-settled x402 payment (tx `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ`, TestNet round 66091768) — it is verified evidence, not an invented illustration. The interaction example in §5 was produced by executing the shipped code at this commit.

**Cross-references:** [`Algorithm_Inventory.md`](./Algorithm_Inventory.md) (complete rule tables) · [`Intelligence_Architecture.md`](./Intelligence_Architecture.md) · [`Evaluation.md`](./Evaluation.md) · [`../05_API/`](../05_API/) · [`../07_Testing/Test_Cases.md`](../07_Testing/Test_Cases.md)

---

## 1. The pipeline in one line

```
HTTP body → JSON parse (fail-soft) → zod validation (fail-fast, 400) → normalise → match → score → band → assemble response → JSON
```

There is **no pre-processing beyond case folding and whitespace trimming, and no post-processing at all.** Specifically absent: no tokenisation, no stemming or lemmatisation, no stop-word removal, no spell correction, no language detection, no entity extraction, no negation scoping, no synonym expansion, no embedding, no ranking, no confidence estimation, no re-ranking, no output filtering, no truncation, no formatting pass. The complete transformation applied to caller text is `toLowerCase()` for triage (`api/src/services/triageScorer.ts:54`) and `trim().toLowerCase()` for each medication name (`api/src/services/interactionChecker.ts:33`).

## 2. What is not persisted — AI-007

**Nothing the caller sends is stored, logged, cached, forwarded, or written on-chain.**

| Potential sink | Reality |
|---|---|
| Database | None exists in this system. |
| File | Neither engine writes to disk. `interactionChecker.ts:18` is a read, at module load, of a repository file. |
| In-memory cache | None. Both engines are stateless between calls; no memoisation, no request history. |
| Application log | Logging in the API is `console.log` at startup plus three structured JSON error records — `facilitator_unavailable`, `audit_write_failed`, and the `app.onError` record carrying a generated `requestId`, method, path, message and stack (`api/src/app.ts:113-138`). **No request body is logged by any of them, and neither intelligence route logs anything at all.** OPS-002 **PARTIALLY IMPLEMENTED**: the failure paths are structured, nothing else is, and there is still no metrics, tracing or alerting (finding G-15, open). The operability gap is real; the privacy consequence is favourable — clinical text is not written to a log either. |
| Algorand ledger | The intelligence routes never call the chain. `api/src/routes/triage.ts` and `api/src/routes/interaction.ts` import only `zod`, `hono` and their service module — no `algorand.js` import exists in either file. The one route that does write on-chain (`records.ts`) logs constant strings only: `SCOPE = "records:summary"` and `ENDPOINT = "/v1/records/summary"` (`records.ts:12-13`, used at `:58` and `:84`) — and does not invoke either engine. |
| Third party | None. No model provider, no analytics, no telemetry. The only outbound call the API makes on a priced route is to the GoPlausible facilitator for payment verification and settlement, which carries the payment transaction — not the request body. |

AI-007 **IMPLEMENTED**. Note the honest scope of this claim: it is a property of the code, not of a deployment. A future operator who adds request logging, an APM agent, or a reverse-proxy access log that captures bodies would break it without touching either engine.

---

## 3. Stage-by-stage detail

### 3.1 `POST /v1/triage` — `ALG-001`

| # | Stage | Code | Behaviour |
|---|---|---|---|
| 0 | **Payment gate** | `api/src/app.ts:50-61` | Unpaid requests never reach the handler: the x402 middleware returns `402` with a `PAYMENT-REQUIRED` header and an empty JSON body. FR-001 **VALIDATED**. The middleware never inspects the request body, so the intelligence layer is entirely downstream of settlement. |
| 1 | **Body parse (fail-soft)** | `routes/triage.ts:12` | `await c.req.json().catch(() => ({}))`. Malformed JSON does **not** throw — it becomes `{}` and falls through to validation, which rejects it. This is why a bad body yields 400 rather than 500. |
| 2 | **Schema validation (fail-fast)** | `routes/triage.ts:5-7,13-15` | `z.object({symptoms: z.string().min(1).max(2000)}).safeParse(...)`. On failure: HTTP 400 `{error: "invalid request", details: <zod flatten>}`. **The engine is never invoked with invalid input.** |
| 3 | **Normalisation** | `triageScorer.ts:54` | `symptomText.toLowerCase()`. That is the entire normalisation step. No trim, no punctuation stripping, no whitespace collapsing, no Unicode normalisation. |
| 4 | **Matching** | `triageScorer.ts:58-63` | For each of the 11 groups in table order: `flag.keywords.some((kw) => normalized.includes(kw))`. A group that matches contributes `flag.label` once to `matched` and `flag.weight` once to `score`, regardless of how many of its keywords matched. |
| 5 | **Scoring** | `triageScorer.ts:61,65` | `score += flag.weight` per matched group, then `score = Math.min(100, score)`. |
| 6 | **Banding** | `triageScorer.ts:46-51,69` | `bandFor(score)` — top-down thresholds `≥60 emergency`, `≥30 urgent`, `≥10 soon`, else `routine`. |
| 7 | **Response assembly** | `triageScorer.ts:67-72` | `{score, band, matchedFlags: matched, disclaimer: DISCLAIMER}`. The disclaimer is a module constant appended unconditionally on **every** return path — there is only one return path. |
| 8 | **Serialisation** | `routes/triage.ts:17` | `c.json(result)` — verbatim, no field is added, removed, reordered or rewritten by the route. |

### 3.2 `POST /v1/interaction-check` — `ALG-002`

| # | Stage | Code | Behaviour |
|---|---|---|---|
| −1 | **Table load (once, at process start)** | `interactionChecker.ts:18` | `JSON.parse(readFileSync(path.join(__dirname, "..", "data", "interactions.json"), "utf-8"))`. Synchronous, at module import, exactly once per process. A missing or malformed file is a boot failure, not a request failure. |
| 0 | **Payment gate** | `api/src/app.ts:50-61` | As above. |
| 1 | **Body parse (fail-soft)** | `routes/interaction.ts:12` | Identical pattern to triage. |
| 2 | **Schema validation (fail-fast)** | `routes/interaction.ts:5-7,13-15` | `z.object({medications: z.array(z.string().min(1)).min(2).max(20)})`. On failure: HTTP 400 `{error: "invalid request — provide at least 2 medications", details: ...}`. Note the absence of a per-item length cap (AI-059). |
| 3 | **Normalisation** | `interactionChecker.ts:32-34,37` | `medications.map(normalize)` where `normalize(name) = name.trim().toLowerCase()`. Trim *and* lowercase — one more transformation than triage applies. Nothing else: no dose stripping, no unit stripping, no brand→generic mapping, no deduplication. |
| 4 | **Matching** | `interactionChecker.ts:40-47` | For each of the 14 pairs in table order, normalise both table drug names, then test `hasA` and `hasB` independently with `normalized.some((m) => m.includes(x) \|\| x.includes(m))`. Both must be true for the pair to match. See [`Algorithm_Inventory.md`](./Algorithm_Inventory.md) §2.5 for why the second clause is the source of AI-006. |
| 5 | **Result assembly** | `interactionChecker.ts:45` | The **table's** `drugs`, `severity` and `description` are pushed — never the caller's spelling. A caller who submits `"Aspirin 81mg"` gets `drugs: ["warfarin","aspirin"]` back. |
| 6 | **Response assembly** | `interactionChecker.ts:49-54` | `{flagged: matches.length > 0, matches, source: DATA.source, disclaimer: DISCLAIMER}`. Both `source` (DATA-005 / AI-004) and `disclaimer` (FR-009 / AI-002) are appended unconditionally on the single return path. |
| 7 | **Serialisation** | `routes/interaction.ts:17` | `c.json(result)` — verbatim. |

There is no scoring stage and no banding stage in `ALG-002`. `flagged` is a bare emptiness test on the match list (`interactionChecker.ts:50`); it carries no confidence and no aggregate severity. A response with one `moderate` match and a response with three `contraindicated` matches both report `flagged: true`, and the caller must inspect `matches` to tell them apart.

---

## 4. Worked example — triage, from the settled proof run

This is the exact request the end-to-end proof script sent, and the exact response recorded on disk after a real x402 payment settled on Algorand TestNet.

**Source of the input:** `api/scripts/e2e-proof.ts:59` — `body: JSON.stringify({ symptoms: "Sudden chest pain and shortness of breath" })`
**Source of the recorded output:** `contracts/artifacts/e2e-proof.json`, produced by that run, alongside `"settledTransaction": "OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ"` and `"httpStatus": 200`.

### Request

```http
POST /v1/triage
PAYMENT-SIGNATURE: <signed exact-scheme AVM payment, 20000 µUSDC of ASA 10458941>
Content-Type: application/json

{"symptoms": "Sudden chest pain and shortness of breath"}
```

### Stage 2 — validation

41 characters, non-empty, ≤ 2000. Passes `routes/triage.ts:6`. The engine is invoked.

### Stage 3 — normalisation

```
"Sudden chest pain and shortness of breath"
  → toLowerCase() →
"sudden chest pain and shortness of breath"
```

One character changed: `S` → `s`. No trim (there is no leading or trailing whitespace), no other transformation.

### Stage 4 — matching, all 11 groups evaluated in table order

| # | Group (label) | Keyword tested | Present in normalised input? | Contribution |
|---|---|---|---|---|
| 1 | possible cardiac chest pain | `chest pain` | **Yes** — characters 8–17 | **+35** |
| 2 | respiratory distress | `can't breathe` → no · `cannot breathe` → no · `difficulty breathing` → no · `shortness of breath` | **Yes** — characters 22–40 | **+35** |
| 3 | possible stroke (FAST signs) | `face drooping` · `slurred speech` · `one side weak` · `sudden confusion` | **No** | 0 |
| 4 | loss of consciousness | `losing consciousness` · `passed out` · `unresponsive` · `fainted` | No | 0 |
| 5 | severe bleeding | `severe bleeding` · `won't stop bleeding` · `heavy blood loss` | No | 0 |
| 6 | mental health crisis | `suicidal` · `want to die` · `self harm` · `end my life` | No | 0 |
| 7 | possible anaphylaxis | `severe allergic reaction` · `throat closing` · `anaphylaxis` · `swelling face` | No | 0 |
| 8 | severe pain, unclear source | `severe abdominal pain` · `worst pain of my life` | No | 0 |
| 9 | high fever | `high fever` · `fever over 104` · `fever over 40` | No | 0 |
| 10 | persistent vomiting | `persistent vomiting` · `can't keep anything down` | No | 0 |
| 11 | common mild symptom | `mild headache` · `runny nose` · `sore throat` · `mild cough` | No | 0 |

**Group 3 is the instructive row.** The input begins with the word "Sudden", and group 3 contains the keyword `sudden confusion`. It does **not** match, because matching is on whole literal phrases, not on tokens — `"sudden chest pain and shortness of breath".includes("sudden confusion")` is `false`. A reader who assumed word-level matching would predict a stroke flag here and be wrong.

Note also that only two of the eleven groups short-circuit early; the other nine exhaust their keyword lists. Total `includes` calls for this input: 1 (group 1, first keyword hits) + 4 (group 2, fourth keyword hits) + 4 + 4 + 3 + 4 + 4 + 2 + 3 + 2 + 4 = **35** of the 37 possible.

### Stage 5 — scoring, explicitly

```
score = 0
score = 0  + 35   (group 1, possible cardiac chest pain)   = 35
score = 35 + 35   (group 2, respiratory distress)          = 70
score = min(100, 70)                                       = 70
```

**35 + 35 = 70.** The cap at `triageScorer.ts:65` does not bind.

### Stage 6 — banding

`bandFor(70)` at `triageScorer.ts:46-51`, evaluated top-down:

```
70 >= 60  →  true   →  return "emergency"
```

The remaining thresholds (`>= 30`, `>= 10`) are never reached.

### Stage 7/8 — response

```json
{
  "score": 70,
  "band": "emergency",
  "matchedFlags": ["possible cardiac chest pain", "respiratory distress"],
  "disclaimer": "MedRail triage is a transparent keyword heuristic for hackathon demonstration only. It is not a diagnosis, not a substitute for professional medical judgment, and must never be the basis for a real care decision. If this were real and urgent, call emergency services."
}
```

This is byte-for-byte the `responseBody` recorded in `contracts/artifacts/e2e-proof.json`. The pipeline above reproduces it deterministically, and anyone can re-derive it from the table at `triageScorer.ts:32-44` with a pencil.

### What this example does and does not prove

It proves the pipeline is real, that a paid call end-to-end produced this output, and that the arithmetic is checkable. It proves **nothing** about whether `emergency` is the clinically correct band for a patient who says this. That question requires an evaluation that has never been performed — see [`Evaluation.md`](./Evaluation.md).

---

## 5. Worked example — interaction check

**Input:** `{"medications": ["warfarin", "aspirin"]}` — the pair asserted by `api/test/interactionChecker.spec.ts:11-15`.

### Stage 2 — validation

Array of 2 items, each ≥ 1 character, 2 ≤ 2 ≤ 20. Passes `routes/interaction.ts:6`.

### Stage 3 — normalisation

```
["warfarin", "aspirin"]  →  map(trim().toLowerCase())  →  ["warfarin", "aspirin"]
```

Unchanged — the input was already trimmed and lowercase.

### Stage 4 — matching, all 14 pairs evaluated in table order

For each pair the engine computes `hasA` and `hasB` over the normalised list. Both must hold.

| # | Pair (table) | `hasA` | `hasB` | Match |
|---|---|---|---|---|
| 1 | `warfarin` + `aspirin` | ✅ `"warfarin".includes("warfarin")` | ✅ `"aspirin".includes("aspirin")` | **YES** |
| 2 | `warfarin` + `ibuprofen` | ✅ | ❌ neither `warfarin` nor `aspirin` contains, or is contained by, `ibuprofen` | no |
| 3 | `warfarin` + `naproxen` | ✅ | ❌ | no |
| 4 | `maoi` + `ssri` | ❌ | ❌ | no |
| 5 | `maoi` + `sertraline` | ❌ | ❌ | no |
| 6 | `lisinopril` + `spironolactone` | ❌ | ❌ | no |
| 7 | `simvastatin` + `clarithromycin` | ❌ | ❌ | no |
| 8 | `simvastatin` + `erythromycin` | ❌ | ❌ | no |
| 9 | `sildenafil` + `nitroglycerin` | ❌ | ❌ | no |
| 10 | `metformin` + `iodinated contrast` | ❌ | ❌ | no |
| 11 | `clopidogrel` + `omeprazole` | ❌ | ❌ | no |
| 12 | `methotrexate` + `trimethoprim` | ❌ | ❌ | no |
| 13 | `lithium` + `hydrochlorothiazide` | ❌ | ❌ | no |
| 14 | `digoxin` + `amiodarone` | ❌ | ❌ | no |

`matches.length = 1`, so `flagged = 1 > 0 = true` (`interactionChecker.ts:50`).

A detail worth noting for anyone reasoning about cost: `hasA` and `hasB` are both evaluated unconditionally at `interactionChecker.ts:42-43` before the `&&` at `:44`. There is no early exit on a failed `hasA`, so all 14 pairs pay for both scans. For this two-medication input that is `14 × 2 × 2 × 2 = 112` substring tests in the worst case, reduced by `.some()` short-circuiting within each scan.

### Stage 6 — response

```json
{
  "flagged": true,
  "matches": [
    {
      "drugs": ["warfarin", "aspirin"],
      "severity": "major",
      "description": "Combined anticoagulant/antiplatelet effect substantially increases bleeding risk."
    }
  ],
  "source": "Widely-taught, textbook-level severe drug-interaction pairs (e.g. standard pharmacology references such as Lexicomp/Micromedex-class severity classifications). Not exhaustive and not a substitute for a pharmacist or prescriber review.",
  "disclaimer": "MedRail interaction-check compares against a small, explicitly-sourced reference table of well-documented severe interactions — it is not a comprehensive clinical database and must never replace a pharmacist or prescriber review before making a medication decision."
}
```

`severity` and `description` are copied verbatim from `api/src/data/interactions.json:6-7`. `source` is `interactions.json:2`. `disclaimer` is the module constant at `interactionChecker.ts:20-23`.

### The same pipeline, with input that exposes the defect

Run the identical stages on `{"medications": ["a", "b"]}` — the exact input used by `interactionChecker.spec.ts:34`:

- Stage 2: passes. Two items, each ≥ 1 character.
- Stage 3: `["a", "b"]`, unchanged.
- Stage 4, pair 1: `hasA` asks whether any of `["a","b"]` satisfies `m.includes("warfarin") || "warfarin".includes(m)`. For `m = "a"`, the second clause `"warfarin".includes("a")` is **true**. `hasA = true`. `hasB` likewise: `"aspirin".includes("a")` is **true**. **Pair 1 matches.**
- Repeating across the table yields **5 matches** — pairs 1, 2, 3, 5 and 7 — verified by executing the shipped code at commit `3b387df` on 2026-08-21.
- Stage 6: `flagged: true`, with five populated `description` strings including a **major** bleeding-risk warning, returned for an input containing no medication at all.

The existing test calls precisely this input and asserts only `source.length > 0` and a substring of `disclaimer` (`interactionChecker.spec.ts:35-36`). It therefore executes the defect on every CI run without observing it. AI-006 **NOT IMPLEMENTED**; the missing assertion is filed as AI-058 **RECOMMENDED**.

---

## 6. Error paths

Neither engine has an error path, because neither can fail on schema-valid input. Every failure mode on these two routes is upstream:

| Failure | HTTP | Where |
|---|---|---|
| No payment presented | `402` + `PAYMENT-REQUIRED` header, empty JSON body | `api/src/app.ts:50-61` (x402 middleware) — FR-001 **VALIDATED** |
| Facilitator unreachable at first priced request | `503` + `Retry-After: 30`, body `{"error":{"code":"PAYMENT_FACILITATOR_UNAVAILABLE","retryable":true,"facilitator":"…"}}` | The `accepts[].asset` and `extra.feePayer` values come from the facilitator's `/supported`, so the 402 genuinely cannot be constructed offline — but a caller is now told *"try again shortly"* rather than *"this is broken"*. `api/src/app.ts:69-105` catches exactly that initialisation failure and converts it; every other error is re-thrown untouched. Formerly finding R-1 / G-04, now **CLOSED**; REL-001 **IMPLEMENTED**. This is still the most likely way a caller sees a failure on these endpoints. |
| Malformed JSON body | `400` (via the fail-soft `{}` + schema rejection) | `routes/triage.ts:12-15`, `routes/interaction.ts:12-15` |
| Schema violation (empty string, >2000 chars, <2 or >20 medications, empty medication name) | `400` with a zod `flatten()` detail object | same |
| Engine throws | Does not occur. No branch in either engine can raise for schema-valid input. | `triageScorer.ts:53-73`, `interactionChecker.ts:36-55` |

Note that the zod `details` object is echoed to the caller. For these two routes that is deliberate, harmless field-level feedback. The sibling issue on the *error handler* — which previously returned `err.message` verbatim to unauthenticated callers (SEC-011, finding R-3) — is fixed: `app.onError` (`api/src/app.ts:113-138`) now logs the message and stack server-side against a generated `requestId` and returns a fixed body, `{"error":{"code":"INTERNAL_ERROR","message":"An internal error occurred. Quote the requestId when reporting this.","retryable":true,"requestId":"…"}}`. Address fields are also checksum-validated up front (`api/src/validation.ts`), so a 58-character non-address is a 400 rather than a 500 raised deep in the call path. SEC-010 and SEC-011 **IMPLEMENTED**; see [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md).

---

## 7. Pipeline stages that do not exist — **NOT IMPLEMENTED**

Enumerated so that no reviewer has to infer their presence from the word "pipeline".

| Stage a language pipeline would normally have | Status |
|---|---|
| Tokenisation / sentence splitting | **NOT IMPLEMENTED** |
| Stemming / lemmatisation | **NOT IMPLEMENTED** |
| Stop-word removal | **NOT IMPLEMENTED** |
| Spelling correction / fuzzy matching / edit distance | **NOT IMPLEMENTED** — `"chest pian"` scores 0 |
| Negation detection and scoping | **NOT IMPLEMENTED** — AI-050; `"no chest pain"` scores 35 |
| Synonym / abbreviation expansion | **NOT IMPLEMENTED** — AI-051; `"heart attack"`, `"MI"`, `"SOB"` all score 0 |
| Language detection / translation | **NOT IMPLEMENTED** — AI-054; `"dolor de pecho"` scores 0 |
| Named-entity recognition (symptom, drug, dose) | **NOT IMPLEMENTED** |
| Drug-name normalisation (RxNorm, brand→generic, class→member) | **NOT IMPLEMENTED** — AI-052 **RECOMMENDED** |
| Confidence / probability estimation | **NOT IMPLEMENTED** — AI-055; the score is an ordinal sum of chosen integers, not a probability |
| Output guardrail or content filter | **NOT IMPLEMENTED** — unnecessary, since output is drawn only from 25 fixed strings in the repository |
| Caching / memoisation | **NOT IMPLEMENTED** — and unnecessary, since the computation is bounded and local |
| Prompt construction, model call, retry, structured-output parsing | **NOT IMPLEMENTED** — see [`Prompt_Architecture.md`](./Prompt_Architecture.md) |
