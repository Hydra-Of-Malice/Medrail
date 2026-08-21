# MedRail — Winning Strategy


> **⚠ Correction notice.** Parts of this document were written against a review finding that was
> later proven wrong. Settlement in x402 v2 happens **only** on a sub-400 response, so **no error
> path in MedRail can consume a settled payment** — and consent-denied calls (HTTP 403) are **not
> charged**, contrary to `API.md`, `SECURITY.md`, and the `paidButDenied` field. The audit-sequence
> race causes a **rejected transaction**, not a corrupted log. See
> [`CORRECTIONS.md`](../CORRECTIONS.md) — it supersedes any statement here that contradicts it.

**Purpose:** a ranked, effort-estimated action list for maximising this submission's standing against the Global x402 Challenge criteria, plus the narrative framing to use on stage.

**Status of this document:** Strategy, 2026-08-21. Ranking is by (judge-perception impact × feasibility), assessed by this reviewer. Judging criteria referenced (real usage, use-case quality, technical execution, long-term potential) are per `docs/COMPLIANCE.md:31-33`; **the official rules were not independently re-fetched during this review**. No prize, ranking, competitor count, or official weighting is asserted. Effort estimates are working estimates, not measurements.

Companion documents: [`Judge_Evaluation.md`](Judge_Evaluation.md), [`../02_Requirements/Requirements_Gap_Analysis.md`](../02_Requirements/Requirements_Gap_Analysis.md), [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md).

---

## 0. The one-paragraph version

Two defects are worth more than everything else on this list combined. **S-1** (the consent gate does not authenticate its caller) is ~15 lines plus a test, and it converts your most dangerous question into your best demo beat. **E-1** (`log_access` has never run on TestNet) is *one successful API call* away from closing, and it is the difference between "our differentiator is proven in a simulator" and "here is the transaction id." Together they are under three hours and move this reviewer's overall assessment from **5.4** to roughly **6.1** — see `Judge_Evaluation.md` §2. Do them first, in that order, before touching anything else. Everything below item 3 is optional by comparison.

---

## 1. Must-fix before submission

Ranked by (impact × feasibility). Do them in this order — the ordering encodes dependencies.

---

### M1. Bind the payer to `requesterAddress` (closes S-1 / `SEC-007` / `FR-039`)

**What.** In `api/src/routes/records.ts`, recover the address that actually signed the settled payment and reject with 403 unless it equals the caller-asserted `requesterAddress`.

**Why it matters to a judge.** This is the single question that collapses your demo: *"how do you know the caller is the requester?"* Today the answer is "we don't." Grants are public on-chain — `grant_access` carries the patient as sender and the requester as ABI arg 0 — so any stranger can enumerate valid pairs from the app's own transaction history, pay $0.05, and read as an authorised requester. Worse, `records.ts:49` then writes that fabricated identity into the immutable per-patient audit trail: a permanent, on-chain, *false* attribution, trusted precisely because it is on-chain. Fixing it does two things at once — it removes your worst answer, and it gives you a new demo beat ("watch me pay as one wallet, claim to be another, and get refused before the record is touched") that no competing entry will have.

**Exact change.** Both APIs are present in the installed SDK at `2.21.0`. `@x402/core/http` exports `decodePaymentSignatureHeader`; `@x402/avm` exports `getSenderFromTransaction`. In `records.ts`, after the zod parse at line 30 and **before** `checkAccess` at line 32:

1. Read the `PAYMENT-SIGNATURE` request header.
2. `decodePaymentSignatureHeader` it, then `getSenderFromTransaction` on the payment transaction to recover the payer address.
3. If the payer cannot be recovered, return `402` (not 500) — the payment middleware should have guaranteed one, so this is a defensive branch, not a normal path.
4. If `payer !== requesterAddress`, return `403` with an explicit body: `{ error: "payer does not match requesterAddress", payer, requesterAddress, paidButDenied: true }`. **Do not write an audit entry on this path** — a rejected impersonation attempt has no legitimate requester to attribute it to, and writing one would pollute the patient's trail with attacker-chosen data.

The equivalent framing-level alternative is `x402HTTPResourceServer`'s `ProtectedRequestHook` (`.onProtectedRequest(...)`, exported from `@x402/hono`), which stashes the verified payer on the Hono context so every priced route gets it for free. Prefer that if you intend to add more gated routes; prefer the in-handler version if you want the smallest, most reviewable diff before submission. **For a submission deadline, take the in-handler version.**

**Effort.** 10–15 lines of handler code. 30–45 minutes including the test below.

**Test to add (do not skip this — the test is half the value).** `api/test/records.spec.ts`, the first test that file will ever contain: construct a request whose `PAYMENT-SIGNATURE` is signed by wallet A while the body claims `requesterAddress: B`, assert `403`, and assert that no `log_access` was attempted. Then a positive case: payer == requester, assert the consent check runs. This is also the moment `routes/records.ts` stops being the largest untested surface in the repository.

**Risk.** Low, and bounded. The demo path is unaffected — `web/components/LiveDemoPanel.tsx:38` already sends `requesterAddress: wallet.address`, the same wallet that signs the payment, so payer and requester already coincide in every UI flow. The only callers that break are the ones that *should* break. **One caveat:** verify the header name casing your Hono context returns (`c.req.header("PAYMENT-SIGNATURE")` vs lowercase) against a live 402 round-trip before you rely on it — a silently-undefined header would turn every gated call into a 402. Test this against a real request, not a mock.

---

### M2. Run `log_access` on TestNet — get the audit story a transaction id (closes E-1 / `FR-012` / `FR-025`)

**What.** Make exactly one successful `POST /v1/records/summary` call against a self-granted consent, so a real `log_access` transaction lands on app `768743428`.

**Why it matters to a judge.** Every document you have written presents the on-chain audit log as the differentiator. Right now `total_audit_entries == 0` and there are zero `s`- or `a`-prefixed boxes on the deployed app — verified live during this review. Because every *other* claim you make comes with a transaction id, this absence is conspicuous rather than forgivable: you have trained the judge to expect a link and then don't have one. After this fix, `curl https://testnet-idx.algonode.cloud/v2/applications/768743428` returns `total_audit_entries = 1` and the box inventory grows an `s`- and an `a`-prefixed box. That is the whole story, told by the ledger, without you in the room.

**Exact steps.**
1. Fund the operator account (the address in `api/.env`'s `OPERATOR_ADDRESS`, which is also the contract `admin`) with TestNet ALGO via https://lora.algokit.io/testnet/fund. It needs fees plus box MBR headroom. The app account already holds 5 ALGO with 145,000 µALGO min-balance, so app-side MBR is fine.
2. Confirm `CONSENT_APP_ID=768743428` and `OPERATOR_MNEMONIC` are set in `api/.env`, then `cd api && npm run dev`.
3. Grant consent to yourself. Easiest path: open the web app, click **Grant myself access** in the consent panel (`web/components/ConsentChecker.tsx:30-35` — patient and requester are both the demo wallet, scope `records:summary`). Note the returned transaction id.
4. Call the endpoint as that same wallet, with the demo wallet holding TestNet USDC so the $0.05 actually settles. In the UI: select **Consent-gated record summary**, leave the patient field blank so it defaults to the wallet address, click pay.
5. Confirm: the response body carries a non-null `auditTxId` and `auditSequence: "1"`, and the indexer now reports `total_audit_entries = 1`.
6. **Record it.** Add the `log_access` transaction id to `docs/PROOF.md` as a new row and replace the §7 evidence-gap section with the closed result. Do the same in `Demo_Script.md` beat 6.

**Effort.** Minutes of work once the operator account is funded; budget 30–45 minutes end to end including funding latency, the USDC opt-in if the demo wallet has not done it, and updating the two documents.

**Risk.** Low, but two real trip hazards. **(a)** The demo wallet must be opted in to USDC ASA `10458941` *before* it can receive or hold TestNet USDC — an Algorand protocol rule, not an app quirk; see `contracts/scripts/opt_in_usdc.py`. **(b)** If `logAccess` throws, R-2 means you get a 500 *after* the payment settles, so a failed attempt costs $0.05 and produces nothing. Do **M3** first if you can, or accept that a retry costs another five cents. **Do M1 before M2** so the first audit entry ever written on-chain is a correctly-attributed one — you do not want your inaugural immutable record to be one produced by unauthenticated input.

---

### M3. Stop losing settled payments on the success path (closes R-2 / `REL-002`)

**What.** Guard the success-path `logAccess` in `api/src/routes/records.ts:49` the way the denied path at line 37 already is.

**Why it matters to a judge.** The asymmetry is visible in a ten-second read of one file, and it is a *money* defect: today, if the on-chain write throws — operator out of ALGO, algod 5xx, validity window expiry — the request falls to `app.onError` and returns HTTP 500 **after the caller's $0.05 has settled**. No refund, no retry token, no record they are owed anything. Judges use money questions to separate people who thought about production from people who thought about demos, and this one has a written answer either way; make it the good one.

**Exact change.** Replace the bare `await` with a caught form: keep the settled payment honoured by returning the resource regardless, and surface the audit outcome explicitly rather than silently.

```ts
const logResult = await logAccess(patientId, requesterAddress, SCOPE, ENDPOINT, "consent_checked")
  .catch((err) => {
    console.error("audit write failed after settled payment", { patientId, endpoint: ENDPOINT, err });
    return null;
  });
```

then in the response body: `auditTxId: logResult?.txId ?? null`, `auditSequence: logResult?.sequence.toString() ?? null`, and add `auditWriteFailed: logResult === null`. Do **not** silently swallow it — an unflagged null is worse than a 500 because it looks like success.

**Effort.** ~10 lines. 15 minutes.

**Risk.** Very low. Note the honest trade-off out loud when asked: you are choosing "deliver the resource, flag the missing audit entry" over "refuse and refund," because there is no refund mechanism in x402 v2 `exact` — settlement is final. Saying that in one sentence demonstrates you understand the protocol's constraints, not just its happy path.

---

### M4. Fix the CI branch trigger (closes CI-1 / `OPS-006`)

**What.** `.github/workflows/ci.yml:5` reads `branches: [main]`. The repository's only branch is `master`.

**Why it matters to a judge.** A judge who opens the Actions tab sees an empty run history. "We have CI" then becomes a claim rather than a fact, and — given how much of this submission's credibility rests on claims-that-check-out — an unbacked claim costs more here than it would elsewhere. The code is fine: all three jobs pass locally, `tsc --noEmit` clean in both `api/` and `web/`, both builds green. Only the trigger is wrong.

**Exact change.** `branches: [main, master]`. Then push once so a run actually appears. Two words.

**Effort.** 2 minutes plus one push.

**Risk.** One thing to know before you push: the `api` job runs `npx vitest run`, and `api/test/x402-flow.spec.ts` makes a **live HTTP call to `facilitator.goplausible.xyz` at app-module import** (CI-2). Your first-ever CI run therefore depends on a third-party service being reachable from a GitHub runner. If it is down at that moment your first visible run is red, which is worse than empty. Push when you can watch it, and if it fails for that reason, say so in the README rather than leaving a red badge unexplained.

---

### M5. Fix the `fly.toml` production defaults (closes D-1 / D-2)

**What.** `api/fly.toml:10` hardcodes `NETWORK = "mainnet"`, and the file sets no `CONSENT_APP_ID`. No MainNet deployment of `MedRailConsent` exists. `contracts/artifacts/deploy_testnet.json` is not copied into the image, so the `config.ts:31-40` fallback cannot fire in a container.

**Why it matters to a judge.** A `fly deploy` today produces a service pointed at a network where the contract does not exist, with no App ID — so `requireConsentAppId()` throws and both `/v1/records/summary` and `/v1/consent/status` return HTTP 500 on first call. This is also the config a judge reads when they ask "is this deployable?" A committed production config that would fail on first use undercuts the deployment story more than having no config at all.

**Exact change.**
- `api/fly.toml`: set `NETWORK = "testnet"` (deploy what actually exists), and add `CONSENT_APP_ID = "768743428"` to the `[env]` block — it is a public identifier, not a secret.
- Add a `[[http_service.checks]]` entry pointing at `/v1/health` — the endpoint exists (`api/src/routes/health.ts`) and is wired to nothing (D-6, `OPS-001`). Two lines, and it makes the health endpoint mean something.
- Add a comment above `[env]` naming exactly which values become MainNet at cutover, so the file documents the switch instead of pre-assuming it.

**Effort.** 10 minutes.

**Risk.** None. This makes the committed default *match reality*; MainNet remains a documented, deliberate, user-performed cutover per `docs/DEPLOYMENT.md` Stage 3.

---

### M6. Deploy the API to a public HTTPS URL

**What.** Get `medrail-api` onto a public host and point `NEXT_PUBLIC_API_BASE` at it.

**Why it matters to a judge.** This is the single unlock for the criterion listed *first* in `docs/COMPLIANCE.md:33` — real usage. Today no judge can call your endpoint without cloning the repo and running three processes, which means: no third-party payments, no Bazaar listing, no leaderboard presence, no "someone other than me has paid for this." Every one of those follows from a URL. It is also the difference between a demo you perform and a service that exists whether or not you are in the room.

**Exact change.** Do **M5 first** (deploying the current `fly.toml` produces a broken service). Then, from the repo root: `fly launch` under your own account, set `PAY_TO_ADDRESS` and `OPERATOR_MNEMONIC` as secrets (**never** in `fly.toml`), `fly deploy -c api/fly.toml`. Verify with `curl https://<host>/v1/health` → expect `{"ok":true,"service":"medrail-api","network":"testnet","consentAppId":768743428,...}`, and `curl -i -X POST https://<host>/v1/triage -d '{"symptoms":"chest pain"}'` → expect a 402 with a `payment-required` header. Then redeploy `web/` with `NEXT_PUBLIC_API_BASE` pointed at it.

**Effort.** 1–2 hours if the Fly account already exists; add an hour for first-time signup and DNS.

**Risk.** Medium, and it is the one item here with real unknowns. The Dockerfile has **never been built in CI** (`NFR-007` is **UNVALIDATED**), it uses `npm install` rather than `npm ci` so the build can drift from the lockfile (D-4), and there is no `.dockerignore` anywhere in the repo — the `api/Dockerfile` build context is the **repo root**, which today ships `api/.env` and `contracts/.env` (both containing live mnemonics) into the build context. They are not `COPY`'d into any layer, so nothing leaks from today's image, but the margin is one careless `COPY api/ ./api/` wide. **Add a `.dockerignore` at the repo root before your first public build** (`.env`, `.env.local`, `**/node_modules`, `contracts/.venv`, `.git`) — that is ten minutes and it closes `SEC-015`. Build locally first: `docker build -f api/Dockerfile -t medrail-api .`

---

### M7. Confirm the Sentinel document is relocated *and tracked* (closes DOC-1)

**What.** `SENTINEL_ARCHITECTURE.md` — 647 lines describing "Sentinel Exchange," a pharma supply-chain product with a FastAPI engine, a SQLite database, XGBoost forecasting, a second contract, five new frontend routes and an SSE bus, **none of which exists** — has been moved to `docs/future/SENTINEL_EXCHANGE_PROPOSAL.md` (673 lines) with a bold "⚠ UNBUILT PROPOSAL — NOT IMPLEMENTED" banner enumerating exactly what is absent. That is the correct remedy and it is already done.

**Why it still needs a checklist item.** `git status` currently shows `docs/future/` as **untracked**. Untracked files do not ship — and neither do untracked deletions. If the relocation is not committed, a judge cloning your repository could still find the original at `docs/SENTINEL_ARCHITECTURE.md`, a 647-line architecture for a system that isn't there, sitting beside documents for one that is, ending with an instruction to "rewrite README around Sentinel Exchange." That single file would force a judge to re-evaluate every other document in the folder — and the evidence discipline in `PROOF.md` and `COMPLIANCE.md` is your most valuable asset.

**Exact change.** Verify `docs/SENTINEL_ARCHITECTURE.md` no longer exists; `git add docs/future/ && git commit`; then `git ls-files docs/ | grep -i sentinel` and confirm the only hit is the `future/` path. Grep the rest of `docs/` for stray references to Sentinel, `SentinelProvenance`, `/radar`, `/exchange`, or `/zero-waste`.

**Effort.** 10 minutes.

**Risk.** None. Deleting it outright is also acceptable — the banner version is strictly better if you can defend it in one sentence, which you can: *"that's a proposal for a different product built on the same substrate; it's labelled unbuilt on line one and filed under `future/`."*

---

### M8. Rename "AI" to what it is, in the two places a judge reads first

**What.** `README.md:4` and `web/app/page.tsx:18` both say "AI intelligence endpoints." `api/src/services/triageScorer.ts` is substring matching over 11 hardcoded phrases; `interactionChecker.ts` is a 14-row lookup table.

**Why it matters to a judge.** The gap is discoverable in under a minute, and once a judge catches one overclaim they audit everything else — which is expensive for you specifically, because auditing is exactly what the rest of your documentation set survives. The accurate name is also the stronger one: "deterministic clinical rule engine" sounds like a decision; "AI" sounds like a hope.

**Exact change.** Replace "AI intelligence endpoints" with "deterministic clinical rule engines" in `README.md:4`, `web/app/page.tsx:18`, and the `LiveDemoPanel.tsx:12` label ("AI symptom triage score" → "Red-flag triage score"). While you are there, fix DOC-4: `web/lib/demoWallet.ts:12` references `lib/walletConnect.ts`, which **does not exist**, and `docs/IMPLEMENTATION_PLAN.md` §4 claims a Pera/Defly wallet path "is also implemented" — **it is not**. Correct both to say the signer object implements the same `ClientAvmSigner` interface a real wallet library would, so swapping one in is a signer change rather than an architecture change — which is true, defensible, and still a good line.

**Effort.** 20 minutes.

**Risk.** None. Also downgrade `COMPLIANCE.md:27`'s Bazaar claim (DOC-9): `@x402/extensions` is declared in `api/package.json` and imported **nowhere** in `api/src/`. "Route metadata is in the shape the discovery extension expects" is true and defensible; "implements the discovery extension" is not.

---

## 2. High-value if time permits

Ranked. Each is genuinely worth doing; none is worth doing before §1 is complete.

| # | Action | Why a judge cares | Effort | Risk |
|---|---|---|---|---|
| **H1** | **Get one payment from a wallet you don't control.** Have a teammate, or any second funded TestNet account, pay $0.02 for `/v1/triage`. Record the tx id in `docs/PROOF.md` beside the existing one. | Turns "one payment, self-paid" into "payments from more than one party." Against the *real usage* criterion this is the single highest-leverage sentence you can change, and it costs two cents. Requires M6 (public URL) to be meaningful. | 30 min after M6 | Low |
| **H2** | **Add a cross-implementation key-derivation test** (`NFR-011`). Three independent implementations of `sha256(patient‖requester‖scope)` exist: `contract.py:96-98`, `api/src/services/algorand.ts:64-70`, `web/lib/consent.ts:25-33`. No test checks they agree. | Silent, total breakage if any one changes — a grant written by the browser becomes unreadable by the backend, with no error, just `false`. A single test asserting all three produce identical bytes for a fixed triple is the cheapest insurance in the repo, and it is a genuinely impressive thing to point at. | 1 hr | Low |
| **H3** | **Degrade gracefully when the facilitator is down** (R-1, `REL-001`). Today a facilitator outage 500s every priced route with no `PAYMENT-REQUIRED` header. Cache the `/supported` response after first successful fetch and serve a `503` + `Retry-After` when it cannot be refreshed. | Directly answers "what happens when GoPlausible goes down?" — a question a judge *will* ask because it is the one dependency you cannot control. Also fixes CI-2 (your CI depends on a third party being reachable). | 2–3 hrs | Medium — touches the x402 initialisation path; test the happy path carefully afterwards |
| **H4** | **Validate address checksums** (R-3, `SEC-010`) and stop echoing exception messages (`SEC-011`). Add `.refine(algosdk.isValidAddress)` to all four address fields; change `app.ts:60` to return a generic message and log the detail server-side. | Two small findings that both read as carelessness. A 58-character garbage address returning `{"error":"wrong checksum for address"}` with a 500 is a client error reported as a server error *and* internal detail disclosure to an unauthenticated caller. | 45 min | Low |
| **H5** | **Fix the two contract defects** (C-1, C-2) and add tests. C-1: `contract.py:146` emits `AccessRequested` with `patient` and `requester` swapped — any ARC-28 consumer gets inverted data. C-2: `contract.py:52` computes `400 * (32 + 17)`; the effective box key includes the 1-byte `"g"` prefix, so it should be `400 * (33 + 17)` = 22,500, confirmed on-chain (app account min-balance 145,000 − 100,000 base = 45,000 = 2 × 22,500). | Both are one-line fixes with a genuinely good story attached: "we verified our own advertised MBR constant against the deployed app's actual min-balance and found it 400 µALGO light." Volunteering a defect you found by checking your own arithmetic against the ledger is a strong signal. | 1 hr including redeploy | **Medium-high** — redeploying gives you a **new App ID**, invalidating `768743428` in every document, both existing grant boxes, and the deployed-contract story. **Do not redeploy before the finals.** Fix in source, add the tests, and present it as a known, diagnosed, one-line defect held back from redeploy on purpose |
| **H6** | **Frontend smoke test.** There is currently zero frontend testing of any kind — no Vitest, Jest, Playwright, or Cypress config exists. One Playwright test that loads `/`, asserts the network badge resolves and the pricing table renders three priced rows would close the most conspicuous coverage hole. | "32 tests" becomes "33 tests across three toolchains." More importantly it removes the answer "none" from *"how do you test the frontend?"* | 2 hrs | Low |
| **H7** | **Handle negation in the triage scorer.** **Measured 2026-08-21:** `scoreTriage("I have no chest pain")` returns `{"score":35,"band":"urgent","matchedFlags":["possible cardiac chest pain"]}`. Add a leading-negator check (`no`, `not`, `denies`, `without`, `ruled out`) within a few tokens before a matched phrase, and a test per negator. | **This is the highest-value item in §2 and arguably belongs in §1.** It is eight seconds of typing for a judge, in your own demo box, and it produces a clinical system escalating a patient who explicitly denied the symptom. If they find it, your deterministic-design argument collapses; if you show it first, it becomes your best evidence of self-awareness. | 3–4 hrs | Low — pure function, 7 existing tests to re-run |
| **H8** | **Anchor the interaction match and fix the test that hides it** (`AI-006`). **Measured:** `checkInteractions(["a","b"])` → `flagged: true`, **5 matches**. `checkInteractions(["in","as"])` → **4 matches**, including `warfarin+aspirin`, `simvastatin+clarithromycin`, `simvastatin+erythromycin`, `metformin+iodinated contrast`. Two two-letter strings produce four severe warnings. Worse: `api/test/interactionChecker.spec.ts`'s *"always includes a source citation and disclaimer"* case **calls `checkInteractions(["a","b"])` and asserts only `source.length > 0` and the disclaimer** — the suite runs the defect every time and cannot see it. | Two findings for the price of one. A judge typing `a, b` into your demo gets five severe interactions on stage. And a judge who opens the one test file covering that module finds a test that executes the bug and asserts on the wrong property — which is worse than no test, because it reads as coverage. Fix the matcher (token-boundary or minimum-length guard) **and** change that test to assert `flagged === false` for garbage input. | 1–2 hrs | Low — re-run `interactionChecker.spec.ts`; one case currently depends on the loose behaviour |
| **H9** | **Add `.dockerignore` and switch to `npm ci`** (`SEC-015`, D-4). No `.dockerignore` exists anywhere; `api/.env` and `contracts/.env` sit inside the root build context. | Rolled into M6 if you deploy; keep it listed separately in case you don't. | 15 min | None |
| **H10** | **Pin the multi-instance contradiction shut** (D-7, `REL-004`). `withPatientLock` (`algorand.ts:129-140`) is in-process; `fly.toml:18-19` permits more than one machine. Either set an explicit single-machine ceiling, or document the constraint in `fly.toml` itself. | Only matters if a judge reads both files — but if they do, they have found `docs/SECURITY.md` claiming a mitigation that the adjacent deployment config defeats. One comment plus one config line makes it a *stated constraint* instead of a contradiction. | 15 min | None |

---

## 3. Do not bother

Explicitly out of scope. Each of these will feel productive and will cost you the items in §1.

| Action | Why not |
|---|---|
| **Deploy to MainNet before the finals** | It is real money and it is literally the act of entering under your identity. More practically: MainNet has none of your evidence on it — no App ID with history, no consent lifecycle, no settled payment. You would be trading a fully-evidenced TestNet story for an empty MainNet one. `docs/COMPLIANCE.md:70-75` already frames this correctly as a deliberate, principled deferral. **Keep that framing.** |
| **Redeploy the contract to fix C-1/C-2** | A new App ID invalidates `768743428` everywhere, orphans both grant boxes, resets all four global counters, and destroys the "created at round 66088624, verifiable on any indexer" story. The defects are worth ~0.1 of a point; the deployed history is worth far more. Fix in source, test, and disclose. |
| **Add a real ML model to the triage endpoint** | You would replace an honest, inspectable, unit-tested rule engine with an unvalidated model you cannot explain under questioning, in a *clinical* context, days before a demo. Every question would get harder. The deterministic design is a defensible position — see §4. |
| **Build the Orchestrator entry type** | `docs/ARCHITECTURE.md:144-150` already scopes it honestly as not built. It is a real agent loop with budget management, and starting it now guarantees it is half-finished at submission. "Described, not pretended" is a strong answer; "started, not working" is not. |
| **Anything from `docs/future/SENTINEL_EXCHANGE_PROPOSAL.md`** | A different product. It has been correctly quarantined with an "UNBUILT PROPOSAL" banner. Leave it there. |
| **A database, cache, queue, or background worker** | The system genuinely does not need one — the only durable state is on Algorand and two static tables. Adding infrastructure to look serious adds failure modes and answers no question anyone is asking. "There is no database, and here is why that is correct" is a better answer than any schema you could produce this week. |
| **Load testing / publishing latency percentiles** | You have exactly two measured latencies (a 505 ms cold `/v1/consent/status`, a ~15 ms warm 402) and no benchmark harness. Publishing p50/p95/p99 from a laptop invites a methodology question you would lose. `PERF-003` is **NOT IMPLEMENTED** — say so; it is more credible than a number you cannot defend. |
| **A polished pitch deck** | The demo *is* the deck. Time spent on slides is time not spent closing E-1, and E-1 is the thing that makes the demo land. |
| **More endpoints for volume** | Tempting, given the volume thesis, and wrong right now: more endpoints on an unhosted API generate zero volume, while every one of them inherits S-1's pattern. Get the URL up (M6) and one third-party payment (H1) first. Breadth after reach. |

---

## 4. Narrative strategy — framing the rule engines pre-emptively, not defensively

The facts about `triageScorer.ts` and `interactionChecker.ts` do not change. Whether they help you or hurt you depends entirely on **who says them first**.

**The failure mode.** You say "AI-powered triage." A judge opens the file, finds `String.includes` over 11 phrases, and asks where the AI is. You then explain that deterministic rules are the right choice in a clinical path. Every word of that is true — and it lands as a retreat, because it arrived as an answer instead of a claim. The judge's takeaway is not "sound engineering judgement," it is "caught them." And having caught one thing, they start looking for others — which is expensive for you specifically, because auditability is the strongest thing you have.

**The winning move.** Say it first, in the first thirty seconds, as a design position:

> "Two of the three endpoints are deterministic rule engines — eleven weighted red-flag phrases and a fourteen-row interaction table. No model. That's deliberate: an opaque model in a clinical triage path is a liability you can't audit, and you can read our entire decision logic in ninety seconds. Every response carries a non-diagnostic disclaimer, and there's a unit test that fails if the disclaimer disappears — we treat it as a correctness property, not a legal footer. The engines sit behind a route boundary, so swapping in a model later doesn't touch the payment or consent layers."

Same facts. Now it is a thesis. Three things make it work: you named the limitation before it was found; you gave a *reason* rather than an excuse; and you cited a test — the disclaimer assertion in both spec files is real and it is the detail that turns "we wrote a disclaimer" into "we enforce one."

**Four supporting moves.**

1. **Rename it in the repo** (M8). If your README says "AI" and your mouth says "deterministic rule engine," the README wins — the judge reads it after you leave.
2. **Own the negation defect out loud, and cite the measurement.** `scoreTriage("I have no chest pain")` → score 35, band `urgent`. This is measured, and it is eight seconds of typing away from any judge with access to your demo box. The framing that works: *"Here's the cost of choosing transparent rules over a model — it has no notion of negation, and I'd rather show you than have you find it. It's a screening trigger, not a diagnosis, which is why every response ships a disclaimer that a unit test enforces."* Naming your own worst case is the only move that makes the rest of the argument credible. Then fix it (H7).
3. **Publish the rules.** Serve the 11 red-flag entries and the 14 interaction pairs from a free endpoint. "Our decision logic is public. That's the point, not an oversight." It costs an hour and it makes the transparency claim checkable rather than rhetorical — and it is only credible *after* move 2, because publishing rules you haven't audited is worse than not publishing them.
4. **Have the upgrade path in your pocket, not in your pitch.** `AI-008` is **IMPLEMENTED (by construction)** — both services are pure functions behind a route boundary. Mention it only when asked. Volunteering it makes the current version sound like a placeholder; holding it makes it sound like an option.

**The wider principle, and it applies to every finding in `Judge_Evaluation.md`:** this submission's single most valuable asset is that its claims survive checking. `docs/PROOF.md` gives a reproduction command for everything it asserts and re-verifies against the public indexer rather than the tool that produced it. `docs/COMPLIANCE.md:68-75` has a "What this document does not claim" section. `PROOF.md:143-147` volunteers the self-payment caveat before anyone asks. That posture is worth more than any individual feature, and it is fragile — one unvolunteered overclaim discredits the whole set. **Disclose everything you would be embarrassed to have found. It is not humility; it is the highest-return move available to you.**

---

## 5. What to say when asked about X

Answers are written to be said out loud, in one breath, without notes. Every one of them is true.

| Question | What to say |
|---|---|
| **"How do you know the caller is the requester?"** | *After M1:* "We decode the `PAYMENT-SIGNATURE` header, recover the address that actually signed the settled payment, and 403 unless it matches the claimed requester. Here — I'll pay from this wallet and claim to be that one." *Before M1:* "We don't yet. It's the top item on our list, it's about fifteen lines, and today it's contained because the record is a fixed synthetic constant. That's containment, not a control, and I'm not going to call it one." |
| **"Show me an audit entry on-chain."** | *After M2:* "Transaction `<id>` — and `total_audit_entries` on app 768743428 reads 1, check it on any indexer." *Before M2:* "I can't. It's implemented with two passing simulator tests, but it has never executed on TestNet — `total_audit_entries` is zero. Everything else here has a transaction id; this doesn't yet." |
| **"Where's the AI?"** | "There isn't one, deliberately. Two deterministic rule engines — eleven weighted phrases, fourteen interaction pairs, both pure functions, both unit-tested, both carrying a disclaimer a test enforces. An opaque model in a clinical triage path is a liability you can't audit. This one you can read in ninety seconds. And I'll give you the cost before you find it: type 'I have no chest pain' and it scores thirty-five, urgent — substring matching has no notion of negation. It's a screening trigger, not a diagnosis, and it's on our fix list." |
| **"What if I type a negation?"** *(or a judge types it live)* | "It escalates — thirty-five, urgent. Measured, not guessed. That's the honest limit of substring matching and it's why every response carries a non-diagnostic disclaimer that a unit test enforces. The fix is a leading-negator check; it's scoped and it's a few hours." **Never act surprised — if you've read this table you knew.** |
| **"Your interaction checker flags `a, b`."** | "Five matches, yes — the containment test is unanchored in both directions. And the part that should bother you more: our own test file calls exactly that input and only asserts the disclaimer, so the suite runs the defect every time and can't see it. Token-boundary matching fixes the code; changing that test to assert `flagged === false` fixes the blind spot." |
| **"Why does this need a blockchain?"** | "Because the patient has to be able to revoke access *without asking the party holding the data*, and anyone has to be able to verify the grant without trusting us. Put the consent table in our Postgres and 'the patient owns it' is a marketing claim about our own database. On-chain it's a checkable fact — `check_access` is a free simulated read anyone can run, and the patient signs grants with their own key. Our backend never sees that key." |
| **"Isn't this just a paywall?"** | "A paywall sits in front of something that also works without it. Remove x402 from MedRail and there is no rate limiting, no metering, and no monetisation — the paid call *is* the unit of the product. And for the gated endpoint the payment and the authorisation are the same round trip: you pay for the compute, and the same call proves you were allowed to see it." |
| **"What happens when the facilitator goes down?"** | *Before H3:* "Every priced route returns a 500 with no `PAYMENT-REQUIRED` header — we reproduced it. The free endpoints stay up, so blast radius is the three priced routes. It's a structural dependency: the asset id and fee-payer address come from the facilitator's `/supported`, not our config, so we literally can't build a 402 offline. Fix is to cache `/supported` and return 503 with `Retry-After`." *After H3:* "We cache the supported-kinds response and return a 503 with `Retry-After` rather than a 500. Free endpoints are unaffected." |
| **"How does this scale?"** | "Honestly: not yet, and I can tell you exactly where it breaks. Audit writes serialise through an in-process per-patient lock, so a second instance sharing the operator account reintroduces the sequence race. There's no rate limiting, and `/v1/consent/status` is free and makes two algod calls per request. The real fix is a durable sequence source or per-patient sharding, and we haven't built it. What *does* scale is the read path — consent checks are simulated, zero-fee, and stateless." |
| **"What stops the admin forging audit entries?"** | "Nothing, and that's the honest limitation. `log_access` is admin-only, the operator mnemonic lives in an environment variable, and that same key can rotate the admin and drain the app account. The right answer is a multisig admin so no single key can write the log, plus a hardware-backed operator key. We documented it as a known limitation rather than pretending it's solved. What the chain *does* guarantee today is that entries are append-only and can't be quietly edited afterwards — that's a smaller claim than 'trustworthy audit trail' and it's the one that's actually true." |
| **"Has anyone other than you ever paid for this?"** | *Before H1:* "No. One payment, TestNet, and I paid myself — it's disclosed in our proof log before anyone asks. It proves the pipeline settles: real facilitator, real `axfer`, 20000 base units, fee-sponsored, confirmed on the indexer. It doesn't prove demand. The reason there's no volume is there's no public URL yet — that's a deployment gap, not a design gap." *After H1:* "Yes — here are two transactions from two different wallets, one of them not mine." |
| **"What's the business model at $0.02 a call?"** | "Not the triage endpoint. Eleven keyword rules aren't worth two cents and I won't argue they are — the price is there to make the metering real. The asset is the consent registry: a neutral, patient-signed, publicly-queryable permission substrate that a health system can point at without trusting us. That's infrastructure you charge for by being the registry of record, not by the lookup. What we've built is the smallest honest proof that the substrate works." |
| **"Why is the audit write not atomic with the payment?"** | "It could be — the `exact` AVM scheme allows up to sixteen transactions in the client's signed group. We chose not to, because a generic `@x402/fetch` client only knows how to build the transaction described in `paymentRequirements`. Requiring callers to know our app id and method signature would make us uncallable by anyone else's agent, which kills the whole open-endpoint strategy. So it's two transactions moments apart, admin-gated, submitted only after the facilitator confirms settlement. It's a real trade and we took the compatibility side." |
| **"You have 32 tests — what do they cover?"** | "Fourteen contract tests in the AVM simulator, including the negative paths — non-admin `log_access` rejection, revoking a grant that doesn't exist, expiry, per-patient sequence isolation. Eighteen API tests, thirteen on the two rule engines and five asserting the real 402 shape against the live facilitator. And I'll tell you the gap: zero tests on `routes/records.ts` and zero on `services/algorand.ts` — the two highest-risk modules in the repo. That's the coverage hole, and it's the honest answer." |
| **"What's `SENTINEL_EXCHANGE_PROPOSAL.md`?"** | "A design proposal for a different product on the same substrate. It's never been built — the first line of the file says so and lists what's absent — and it lives under `docs/future/` for exactly that reason. It's not part of this submission." |
| **"Is this production ready?"** | "No, and I'd distrust anyone who said yes about a hackathon build. It's demo ready: every claim on the critical path has a transaction id you can check without me. It is not beta ready — no public host until today, no auth binding on the gated endpoint until this week, no coverage on the two riskiest modules. I can hand you the list; it's written down." |
