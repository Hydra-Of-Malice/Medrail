# MedRail — Winning Strategy

**Purpose:** a ranked, effort-estimated action list for maximising this submission's standing against the Global x402 Challenge criteria, plus the narrative framing to use on stage.

**Status of this document:** Strategy, 2026-08-21. Ranking is by (judge-perception impact × feasibility), assessed by this reviewer. Judging criteria referenced (real usage, use-case quality, technical execution, long-term potential) are per `docs/COMPLIANCE.md:31-33`; **the official rules were not independently re-fetched during this review**. No prize, ranking, competitor count, or official weighting is asserted. Effort estimates are working estimates, not measurements.

Companion documents: [`Judge_Evaluation.md`](Judge_Evaluation.md), [`../02_Requirements/Requirements_Gap_Analysis.md`](../02_Requirements/Requirements_Gap_Analysis.md), [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md).

---

## 0. The one-paragraph version

**The must-fix list is closed except for one item, and that item is the whole remaining game.** M1 (bind the payer to `requesterAddress`) and M2 (`log_access` on TestNet) are both done, along with M3, M4, M5, M7 and most of M8 — 22 of the 34 tracked findings are now closed, the test count went from 32 to 73, and this reviewer's overall assessment moved from **5.4** to **6.6** (see [`Judge_Evaluation.md`](Judge_Evaluation.md) §2). What is left is not code. **There is no public URL**, so nobody outside the team can call anything, which means there is no Bazaar listing, no leaderboard presence, and — the sentence that costs the most — **no payment from anyone but the team**. `docs/08_Deployment/GO_LIVE_RUNBOOK.md` exists for exactly this. Everything in §1B needs a person with an account and a wallet, not a patch.

---

## 1. Must-fix before submission

### 1A. Done — M1 through M8, with what closed each

These were the eight items ranked highest by (impact × feasibility) in the first pass. Seven are complete. The IDs are kept because other documents reference them.

| ID | What it was | Status | What closed it |
|---|---|---|---|
| **M1** | Bind the payer to `requesterAddress` (S-1 / `SEC-007` / `FR-039`) | **DONE** | `api/src/x402Payer.ts` decodes the verified `PAYMENT-SIGNATURE` header, reads the AVM `exact` payload, and recovers the signer. `api/src/routes/records.ts:41-51` returns **403** unless `payer === requesterAddress`, *before* the consent check and before any ledger write. 6 unit tests in `api/test/x402Payer.spec.ts`; live verification by `api/scripts/verify-g01-fix.ts` (artefact: `contracts/artifacts/g01-verification.json`, `"result": "CLOSED"`). |
| **M2** | Run `log_access` on TestNet (E-1 / `FR-012` / `FR-025`) | **DONE** | `api/scripts/e2e-consent-proof.ts` performs grant → consent check → paid call → audit append in one run. `total_audit_entries` on App `768743428` now reads **5**; `total_grants_active` reads 4. Artefact: `contracts/artifacts/e2e-consent-proof.json` — grant `M26NPR32…`, payment `5DKFUULW…`, audit `4YLKLQKK…`. |
| **M3** | Stop losing settled payments on the success path (R-2 / `REL-002`) | **DONE — and the finding it was based on was wrong** | The premise was that a failed audit write would leave a caller charged with nothing to show. It could not: `@x402/hono` calls `processSettlement` **only** on a sub-400 response, so any throw or 4xx/5xx cancels settlement first. `REL-002` is **VALIDATED, satisfied by the SDK**. The real defect — a legitimate paid request turning into a 500 and throwing away the *sale* — is fixed at `records.ts:76-100`: `try/catch` around `logAccess`, 200 with `auditStatus: "pending"` and null `auditTxId`/`auditSequence`, plus a structured `audit_write_failed` log event. |
| **M4** | Fix the CI branch trigger (CI-1 / `OPS-006`) | **DONE** | `.github/workflows/ci.yml` triggers on `branches: [main, master]`, pull requests, and `workflow_dispatch`, with pip and npm caching, `npm audit --audit-level=high` on both packages, and an artifact-freshness gate that recompiles the contract and fails on `git diff --exit-code -- contracts/artifacts/`. |
| **M5** | Fix the `fly.toml` production defaults (D-1 / D-2) | **DONE** | `NETWORK = "testnet"`, `CONSENT_APP_ID = "768743428"`, a `[[http_service.checks]]` entry on `/v1/health`, and `max_machines_running = 1` with the in-process-lock reason written into the file (which also closes D-7). Both Dockerfiles use `npm ci`; `.dockerignore` added at the repo root and in `web/` (closes `SEC-015`, D-4, and H9). |
| **M6** | Deploy the API to a public HTTPS URL | **NOT DONE** | See §1B. This is now the only unfinished must-fix, and it gates three other things. |
| **M7** | Confirm the Sentinel document is relocated *and tracked* (DOC-1) | **DONE** | `docs/SENTINEL_ARCHITECTURE.md` no longer exists. The proposal lives at `docs/future/SENTINEL_EXCHANGE_PROPOSAL.md` with its "UNBUILT PROPOSAL" banner, and `docs/future/` is tracked in git. |
| **M8** | Rename "AI" to what it is | **PARTLY DONE** | `README.md` and `docs/JUDGES.md` now say "clinical-intelligence endpoints", and `JUDGES.md` names them as deterministic rule engines in its opening paragraph. **Three strings still say "AI intelligence endpoints": `api/src/app.ts:152` (the service index — the first thing an integrator fetches), `web/app/layout.tsx:18`, `web/app/page.tsx:18`.** DOC-4 is also still open: `web/lib/demoWallet.ts:12` points at a `lib/walletConnect.ts` that does not exist. |

**Also closed since the first pass, beyond the M list:** rate limiting on the free and refundable surface (`api/src/rateLimit.ts`, `SEC-013`); address checksum validation and error hygiene (`api/src/validation.ts` and `app.onError`, `SEC-010`/`SEC-011`); graceful facilitator degradation with 503 + `Retry-After` (`app.ts:69-105`, `REL-001` — this was H3); a boot-time refusal to start without a valid `PAY_TO_ADDRESS`; cross-language box-key golden vectors (`NFR-011` **VALIDATED** — this was H2); a complete eight-route service index asserted by a test; both contract defects fixed in source with regression tests proven to fail against the old code (this was H5, with the redeploy correctly held back); and `npm audit` reporting **0 vulnerabilities** in both packages.

---

### 1B. What remains — and every one of these needs a person, not a patch

The four items below are sequential. None of them is a code change, which is precisely why none of them has happened yet.

---

#### M6. Deploy the API to a public HTTPS URL — **the only unfinished must-fix**

**What.** Get `medrail-api` onto a public host and point `NEXT_PUBLIC_API_BASE` at it. The full procedure is in [`../08_Deployment/GO_LIVE_RUNBOOK.md`](../08_Deployment/GO_LIVE_RUNBOOK.md); this entry says why it outranks everything else.

**Why it matters to a judge.** It is the single unlock for the criterion listed *first* in `docs/COMPLIANCE.md:33` — real usage. Today no judge can call the endpoint without cloning the repo and running processes locally, which means no third-party payments, no Bazaar listing, no leaderboard presence, and no *"someone other than me has paid for this."* Every one of those follows from a URL. It is also the difference between a demo you perform and a service that exists whether or not you are in the room — which is the same property that makes the rest of this submission's evidence discipline valuable.

**What has changed since this item was first written.** All three of its blockers are gone. `api/fly.toml` is now correct (M5), so deploying it produces a working service rather than a broken one. `.dockerignore` exists at the repo root and in `web/`, so `api/.env` and `contracts/.env` are outside the build context. Both Dockerfiles use `npm ci`, so the image cannot drift from the lockfile. The service refuses to boot without a checksum-valid `PAY_TO_ADDRESS`, so a misconfigured deploy fails loudly at startup instead of quietly at first call.

**Verification after deploy.** `curl https://<host>/v1/health` → `{"ok":true,"service":"medrail-api","network":"testnet","consentAppId":768743428,…}`. Then `curl -i -X POST https://<host>/v1/triage -d '{"symptoms":"chest pain"}'` → a 402 with a `payment-required` header. Then redeploy `web/` with `NEXT_PUBLIC_API_BASE` pointed at the new host.

**Effort.** 1–2 hours if the hosting account already exists; add an hour for first-time signup.

**Risk.** Lower than it was, but non-zero: the Dockerfile has still never been built in CI (`NFR-007` **UNVALIDATED**), so build it locally first — `docker build -f api/Dockerfile -t medrail-api .`. Set `PAY_TO_ADDRESS` and `OPERATOR_MNEMONIC` as platform secrets, **never** in `fly.toml`. And remember the machine cap is deliberate: the audit-sequence lock is in-process, so do not raise `max_machines_running` to make a dashboard look better.

---

#### M9. Re-run the three proof scripts against the public URL

**What.** After M6, run `api/scripts/e2e-proof.ts`, `api/scripts/e2e-consent-proof.ts` and `api/scripts/verify-g01-fix.ts` with `API_BASE` pointed at the public host, and update `docs/PROOF.md` with the resulting transaction ids.

**Why it matters to a judge.** Right now every proof in the repository was produced against `localhost`. The *transactions* are real and on a public ledger, which is most of the value — but the *service* that produced them was a laptop. Re-running against the public URL closes the last gap between "this works" and "this works, and you can reach it": a judge can then take any transaction id in `PROOF.md`, follow it to the indexer, and separately call the same endpoint themselves. That is the full evidence loop, and it costs three commands.

It also converts the strongest demo beat into something a judge can run without you. `verify-g01-fix.ts` against a public host means anyone can attempt the impersonation attack themselves and watch it be refused.

**Effort.** 20 minutes, plus a few cents of TestNet USDC.

**Risk.** Low. Each script writes its own artefact under `contracts/artifacts/`; commit the updated files so the repository and the ledger agree.

---

#### M10. List on Bazaar and apply the `x402-global-challenge` tag

**What.** Submit the public endpoint through Bazaar's own UI and apply the challenge tag.

**Why it matters to a judge.** It is an explicit entry requirement in `docs/COMPLIANCE.md:27`, currently marked pending, and the leaderboard tracks facilitator payment volume automatically once the tag is applied — so this is the step that makes any volume you generate *count*.

**Before you do it, close DOC-9 honestly.** `@x402/extensions` is declared at `api/package.json:17` and imported nowhere in `api/src/`. The route metadata is genuinely in the shape the discovery extension expects — each priced route declares `description` and `mimeType` alongside its `accepts[]` (`api/src/x402.ts:19-33`) — and `COMPLIANCE.md:27` already carries an inline correction saying the extension is not wired up. Either wire it up or remove the dependency. A declared-but-unused dependency next to a discovery claim is the kind of detail a judge checks.

**Effort.** 30 minutes, and it is gated on M6.

**Risk.** None technically. Note that this is a competition-entry action tied to the team's identity — it is deliberately left as a manual step rather than something automated on the team's behalf.

---

#### M11. Get one payment from a wallet you do not control — **the highest-value remaining item**

*(This was H1 in the first pass. It has been promoted, because after M6 it is the only thing left that changes what the team is allowed to claim.)*

**What.** Have a teammate, or any second funded TestNet account that is not the project wallet, pay $0.02 for `/v1/triage` against the public URL. Record the transaction id in `docs/PROOF.md` beside the existing ones, explicitly labelled as a third-party payment.

**Why it matters more than anything else left.** Every settled payment to date has sender == receiver == `2WDV2J2F…`. `docs/PROOF.md` volunteers that before anyone asks, which is the right posture and does not change the fact. Against a criterion named *real usage*, "one payment, and I made it to myself" is the weakest position available, and it is the one question in `Judge_Evaluation.md` §5 that cannot be answered by explaining something better. The gap between *"we have settled payments"* and *"we have settled payments, one of them from someone who isn't us"* is two cents of TestNet USDC and enormous in what it licenses you to say.

**Exact steps.** After M6: the second wallet needs TestNet ALGO (for the opt-in) and TestNet USDC. It must be **opted in to ASA `10458941` before it can hold USDC** — an Algorand protocol rule, not an app quirk; see `contracts/scripts/opt_in_usdc.py`. Then have that wallet call `/v1/triage` through any `@x402/fetch` client, or simply through the web demo with its own generated wallet. Capture the settled transaction id from the `PAYMENT-RESPONSE` header.

**Effort.** 30 minutes after M6.

**Risk.** Low. One honesty constraint: a wallet you funded and control from the same machine is not a third party, and describing it as one would forfeit exactly the credibility this submission has spent the most effort earning. If the only available second wallet is yours, say "two wallets, both mine" — that is still true and still better than one.

---

### 1C. What stays open, and should be stated plainly

Twelve findings remain open. None is a blocker for submission; all of them are better volunteered than discovered.

| Finding | One line |
|---|---|
| **G-05** | Thin direct coverage of `api/src/services/algorand.ts` — no dedicated unit-test file. The frontend has no automated tests at all. |
| **G-11** | The in-process audit lock pins deployment to one machine. |
| **G-15** | No observability: no metrics, no tracing, no alerting. |
| **G-21** | Unanchored substring matching in the interaction checker (`["a","b"]` → 5 matches). |
| **G-24** | No performance measurement of any kind. |
| **G-25** | `fund_mbr` untested; the `withdraw_excess` positive path untested. |
| **G-26** | No negation handling in the triage scorer (`"no chest pain"` → `urgent`). |
| **G-28** | The documented compile command writes artifacts to a different directory than consumers read from; the reconciling copy step is undocumented. |
| **G-29** | `config.indexerServer` is dead code. |
| **G-31** | `withdraw_excess` is unbounded in-contract. |
| **G-32** | `total_grants_active` is not decremented on expiry. |
| **G-33** | A redundant algod round-trip in `logAccess`. |

**Plus three things that are true and are not findings:** the two contract fixes (C-1, C-2) are in source and **not redeployed**, deliberately, to preserve App `768743428` and its on-chain history; there is no MainNet deployment; and nothing has been through a security review by anyone outside this team.

---

## 2. High-value if time permits

Six of these ten are done. The four that remain are all in the intelligence layer or the frontend, none of them blocks submission, and every one of them is better volunteered than discovered. IDs are kept because other documents reference them.

| # | Action | Status |
|---|---|---|
| **H1** | Get one payment from a wallet you don't control. | **PROMOTED to M11** (§1B). After the public URL, it is the highest-value remaining item in the entire document. |
| **H2** | Add a cross-implementation key-derivation test (`NFR-011`). | **DONE.** `api/test/fixtures/box-key-vectors.json` is a shared golden-vector fixture asserted by both `api/test/boxKeyParity.spec.ts` (Node `createHash` *and* browser `crypto.subtle` paths) and `contracts/tests/test_box_keys.py`. All three derivations — `contract.py:96-98`, `algorand.ts:64-70`, `web/lib/consent.ts:25-33` — are now pinned to the same vectors. `NFR-011` **VALIDATED**. |
| **H3** | Degrade gracefully when the facilitator is down (R-1, `REL-001`). | **DONE.** `api/src/app.ts:69-105` catches the initialisation failure and returns **503 + `Retry-After: 30`** with `{"error":{"code":"PAYMENT_FACILITATOR_UNAVAILABLE","retryable":true,"facilitator":"…"}}`. Every other error is re-thrown untouched; free routes are unaffected. |
| **H4** | Validate address checksums (R-3, `SEC-010`) and stop echoing exception messages (`SEC-011`). | **DONE.** `api/src/validation.ts` exports `algorandAddress`, a zod schema using `algosdk.isValidAddress`, used by `records.ts` and `consent.ts` — a 58-character non-address is now a 400. `app.onError` logs the message and stack server-side against a generated `requestId` and returns a fixed `INTERNAL_ERROR` body. |
| **H5** | Fix the two contract defects (C-1, C-2) and add tests. | **DONE IN SOURCE; REDEPLOY DEFERRED ON PURPOSE.** `request_access` now emits `AccessRequested(patient, Txn.sender, scope)` in the correct field order, and `GRANT_BOX_MBR` is `2_500 + 400 * (33 + 17)` = **22,500** µALGO. Three regression tests in `contracts/tests/test_consent.py`, each verified to fail against the old code. App `768743428` still runs the pre-fix bytecode — `deploy_testnet.py` uses `OnUpdate.AppendApp`, so redeploying would mint a new App ID and discard the on-chain history. **Raise this before a judge finds it** (`Judge_Evaluation.md` §5, Q1). |
| **H6** | Frontend smoke test. | **OPEN.** Still no Vitest, Jest, Playwright or Cypress config anywhere in `web/`. One Playwright test that loads `/`, asserts the network badge resolves and the pricing table renders three priced rows would remove the answer "none" from *"how do you test the frontend?"* — and the frontend is now also the one surface that cannot demonstrate the payer-binding control. ~2 hrs, low risk. |
| **H7** | Handle negation in the triage scorer (G-26). | **OPEN, and still the highest-value item in this section.** `scoreTriage("I have no chest pain")` returns `{"score":35,"band":"urgent","matchedFlags":["possible cardiac chest pain"]}` — measured, not inferred. A judge can type that into your demo box in eight seconds and watch a clinical system escalate a patient who explicitly denied the symptom. Add a leading-negator check (`no`, `not`, `denies`, `without`, `ruled out`) within a few tokens before a matched phrase, plus a test per negator. ~3–4 hrs, low risk — pure function, 7 existing tests to re-run. **Until it is fixed, show it yourself** (§4, move 2). |
| **H8** | Anchor the interaction match and fix the test that hides it (`AI-006` / G-21). | **OPEN.** `checkInteractions(["a","b"])` → `flagged: true`, **5 matches**; `checkInteractions(["in","as"])` → **4 matches** including `warfarin+aspirin` and `metformin+iodinated contrast`. Worse, `api/test/interactionChecker.spec.ts`'s *"always includes a source citation and disclaimer"* case calls that exact input and asserts only `source.length > 0` and the disclaimer — so the suite executes the defect on every CI run and cannot see it. Fix the matcher (token boundary or minimum-length guard) **and** change that test to assert `flagged === false` for garbage input. ~1–2 hrs, low risk. |
| **H9** | Add `.dockerignore` and switch to `npm ci` (`SEC-015`, D-4). | **DONE.** `.dockerignore` at the repo root and in `web/`; both Dockerfiles use `npm ci`. |
| **H10** | Pin the multi-instance contradiction shut (D-7, `REL-004`). | **DONE.** `api/fly.toml` sets `max_machines_running = 1` with the reason — the in-process `withPatientLock` and the client-predicted box-reference array — written into the file and cross-referenced to G-11. It is now a *stated constraint* rather than a contradiction. |

---

## 3. Do not bother

Explicitly out of scope. Each of these will feel productive and will cost you the items in §1.

| Action | Why not |
|---|---|
| **Deploy to MainNet before the finals** | It is real money and it is literally the act of entering under your identity. More practically: MainNet has none of your evidence on it — no App ID with history, no consent lifecycle, no settled payment. You would be trading a fully-evidenced TestNet story for an empty MainNet one. `docs/COMPLIANCE.md:70-75` already frames this correctly as a deliberate, principled deferral. **Keep that framing.** |
| **Redeploy the contract to fix C-1/C-2** | Now more true than when it was written, because there is more history to lose. A new App ID invalidates `768743428` everywhere, orphans four active grant boxes, resets all four global counters — including `total_audit_entries = 5`, which took M2 to produce — and destroys the "created at round 66088624, verifiable on any indexer" story along with the source-to-chain bytecode verification. The defects are worth ~0.1 of a point; the deployed history is the backbone of the evidence set. **This is already done the right way: fixed in source, three regression tests proven to fail against the old code, redeploy deliberately deferred.** Say that out loud before a judge asks — see `Judge_Evaluation.md` §5, Q1. |
| **Add a real ML model to the triage endpoint** | You would replace an honest, inspectable, unit-tested rule engine with an unvalidated model you cannot explain under questioning, in a *clinical* context, days before a demo. Every question would get harder. The deterministic design is a defensible position — see §4. |
| **Build the Orchestrator entry type** | `docs/ARCHITECTURE.md:144-150` already scopes it honestly as not built. It is a real agent loop with budget management, and starting it now guarantees it is half-finished at submission. "Described, not pretended" is a strong answer; "started, not working" is not. |
| **Anything from `docs/future/SENTINEL_EXCHANGE_PROPOSAL.md`** | A different product. It has been correctly quarantined with an "UNBUILT PROPOSAL" banner. Leave it there. |
| **A database, cache, queue, or background worker** | The system genuinely does not need one — the only durable state is on Algorand and two static tables. Adding infrastructure to look serious adds failure modes and answers no question anyone is asking. "There is no database, and here is why that is correct" is a better answer than any schema you could produce this week. |
| **Load testing / publishing latency percentiles** | You have exactly two measured latencies (a 505 ms cold `/v1/consent/status`, a ~15 ms warm 402) and no benchmark harness. Publishing p50/p95/p99 from a laptop invites a methodology question you would lose. `PERF-003` is **NOT IMPLEMENTED** — say so; it is more credible than a number you cannot defend. |
| **A polished pitch deck** | The demo *is* the deck, and it is now a good one: a live attack refused, then a consent-gated paid call that returns a record and an audit transaction id. Time spent on slides is time not spent on M6, and M6 is the thing that makes any of it reachable. |
| **More endpoints for volume** | Tempting, given the volume thesis, and wrong right now: more endpoints on an unhosted API generate exactly zero volume. Get the URL up (M6) and one third-party payment (M11) first. Breadth after reach. |

---

## 4. Narrative strategy — framing the rule engines pre-emptively, not defensively

The facts about `triageScorer.ts` and `interactionChecker.ts` do not change. Whether they help you or hurt you depends entirely on **who says them first**.

**The failure mode.** You say "AI-powered triage." A judge opens the file, finds `String.includes` over 11 phrases, and asks where the AI is. You then explain that deterministic rules are the right choice in a clinical path. Every word of that is true — and it lands as a retreat, because it arrived as an answer instead of a claim. The judge's takeaway is not "sound engineering judgement," it is "caught them." And having caught one thing, they start looking for others — which is expensive for you specifically, because auditability is the strongest thing you have.

**The winning move.** Say it first, in the first thirty seconds, as a design position:

> "Two of the three endpoints are deterministic rule engines — eleven weighted red-flag phrases and a fourteen-row interaction table. No model. That's deliberate: an opaque model in a clinical triage path is a liability you can't audit, and you can read our entire decision logic in ninety seconds. Every response carries a non-diagnostic disclaimer, and there's a unit test that fails if the disclaimer disappears — we treat it as a correctness property, not a legal footer. The engines sit behind a route boundary, so swapping in a model later doesn't touch the payment or consent layers."

Same facts. Now it is a thesis. Three things make it work: you named the limitation before it was found; you gave a *reason* rather than an excuse; and you cited a test — the disclaimer assertion in both spec files is real and it is the detail that turns "we wrote a disclaimer" into "we enforce one."

**Four supporting moves.**

1. **Finish renaming it in the repo** (M8). `README.md` and `docs/JUDGES.md` are done. `api/src/app.ts:152`, `web/app/layout.tsx:18` and `web/app/page.tsx:18` still say "AI intelligence endpoints" — and the service index is what an integrator fetches first. If your landing page says "AI" and your mouth says "deterministic rule engine," the landing page wins, because the judge reads it after you leave.
2. **Own the negation defect out loud, and cite the measurement.** `scoreTriage("I have no chest pain")` → score 35, band `urgent`. This is measured, and it is eight seconds of typing away from any judge with access to your demo box. The framing that works: *"Here's the cost of choosing transparent rules over a model — it has no notion of negation, and I'd rather show you than have you find it. It's a screening trigger, not a diagnosis, which is why every response ships a disclaimer that a unit test enforces."* Naming your own worst case is the only move that makes the rest of the argument credible. Then fix it (H7).
3. **Publish the rules.** Serve the 11 red-flag entries and the 14 interaction pairs from a free endpoint. "Our decision logic is public. That's the point, not an oversight." It costs an hour and it makes the transparency claim checkable rather than rhetorical — and it is only credible *after* move 2, because publishing rules you haven't audited is worse than not publishing them.
4. **Have the upgrade path in your pocket, not in your pitch.** `AI-008` is **IMPLEMENTED (by construction)** — both services are pure functions behind a route boundary. Mention it only when asked. Volunteering it makes the current version sound like a placeholder; holding it makes it sound like an option.

**The wider principle, and it applies to every finding in `Judge_Evaluation.md`:** this submission's single most valuable asset is that its claims survive checking. `docs/PROOF.md` gives a reproduction command for everything it asserts and re-verifies against the public indexer rather than the tool that produced it. `docs/COMPLIANCE.md:68-75` has a "What this document does not claim" section. `PROOF.md:143-147` volunteers the self-payment caveat before anyone asks. That posture is worth more than any individual feature, and it is fragile — one unvolunteered overclaim discredits the whole set. **Disclose everything you would be embarrassed to have found. It is not humility; it is the highest-return move available to you.**

---

## 5. What to say when asked about X

Answers are written to be said out loud, in one breath, without notes. Every one of them is true as of this revision — several of them used to be confessions and are now demonstrations, and those are marked.

| Question | What to say |
|---|---|
| **"How do you know the caller is the requester?"** *(this one flipped)* | "The payment *is* the authentication. The `PAYMENT-SIGNATURE` header carries a signed Algorand transaction, so we decode it, recover the address that actually signed it, and 403 unless it matches the claimed requester — before the consent check, before anything touches the ledger. No API keys, no tokens, nothing to rotate; the identity was already in the envelope. **Here, let me show you** — I'll grant a third party access, pay with a different key, claim to be them, and get refused. Then the same call with matching identity returns the record and an audit transaction id." *(Run `api/scripts/verify-g01-fix.ts`. This is the strongest fifteen seconds in the demo.)* |
| **"Show me an audit entry on-chain."** | "Transaction `4YLKLQKK…`, sequence 1 — and `total_audit_entries` on App 768743428 reads five. Check it on any indexer; you don't need me. The whole flow is one script: `e2e-consent-proof.ts` grants consent, checks it, makes the paid call, and appends the audit entry, and it prints four clickable Lora links." |
| **"What happens if the audit write fails after I've paid?"** | "You can't be charged for a failure — x402 settles only on a sub-400 response, so any error cancels settlement before the money moves. That's the SDK, not something we wrote. What *we* fixed is the other half: a failed audit write used to turn a legitimate paid request into a 500 and throw the sale away. Now you get your record with `auditStatus: \"pending\"`, a null `auditTxId`, and a structured `audit_write_failed` event on our side. We deliver what you paid for and we tell you exactly what didn't happen." |
| **"Where's the AI?"** | "There isn't one, deliberately. Two deterministic rule engines — eleven weighted phrases, fourteen interaction pairs, both pure functions, both unit-tested, both carrying a disclaimer a test enforces. An opaque model in a clinical triage path is a liability you can't audit. This one you can read in ninety seconds. And I'll give you the cost before you find it: type 'I have no chest pain' and it scores thirty-five, urgent — substring matching has no notion of negation. It's a screening trigger, not a diagnosis, and it's on our fix list as G-26." |
| **"What if I type a negation?"** *(or a judge types it live)* | "It escalates — thirty-five, urgent. Measured, not guessed. That's the honest limit of substring matching and it's why every response carries a non-diagnostic disclaimer that a unit test enforces. The fix is a leading-negator check; it's scoped and it's a few hours." **Never act surprised — if you've read this table you knew.** |
| **"Your interaction checker flags `a, b`."** | "Five matches, yes — the containment test is unanchored in both directions, finding G-21. And the part that should bother you more: our own test file calls exactly that input and only asserts the disclaimer, so the suite runs the defect every time and can't see it. Token-boundary matching fixes the code; changing that test to assert `flagged === false` fixes the blind spot. Both are written down and both are open." |
| **"Is the contract you fixed the contract that's running?"** | "No, and that's on purpose. Our deploy script uses `OnUpdate.AppendApp`, which mints a *new* application — redeploying would give us a new App ID and abandon 768743428 along with its whole history: the consent lifecycle, the settled payments, five audit entries. Both defects are non-exploitable, one's an event field order and one under-estimates box MBR by 400 µALGO a box. They're fixed in `contract.py`, they're covered by three regression tests, and we ran those tests against the old code first to watch them go red. The fixed source is what ships to MainNet." **Say this before they ask.** |
| **"Why does this need a blockchain?"** | "Because the patient has to be able to revoke access *without asking the party holding the data*, and anyone has to be able to verify the grant without trusting us. Put the consent table in our Postgres and 'the patient owns it' is a marketing claim about our own database. On-chain it's a checkable fact — `check_access` is a free simulated read anyone can run, and the patient signs grants with their own key. Our backend never sees that key." |
| **"Isn't this just a paywall?"** | "A paywall sits in front of something that also works without it. Remove x402 from MedRail and there is no rate limiting, no metering, and no monetisation — the paid call *is* the unit of the product. And for the gated endpoint the payment and the authorisation are literally the same round trip: the transaction you signed to pay is the transaction that proves who you are." |
| **"What happens when the facilitator goes down?"** | "You get a 503 with `Retry-After: 30` and a `PAYMENT_FACILITATOR_UNAVAILABLE` code, not a 500 — which matters, because our callers are agents: `retryable: true` plus a `Retry-After` means come back, an opaque 500 means the endpoint is dead. Free endpoints are unaffected. It's a structural dependency we can't remove — the asset id and fee-payer address come from the facilitator's `/supported`, not our config, so we genuinely cannot build a 402 offline. What we can do is say so honestly in the response." |
| **"How does this scale?"** | "Honestly: it doesn't yet, and I can tell you exactly where it stops. The audit-write lock is in-process, so we pinned the deployment to a single machine on purpose — `max_machines_running = 1`, with the reason written into `fly.toml`. Rate limiting exists on the free surface, but it's in-memory, so behind two instances it'd be per-instance. And we have **no performance data at all** — no latency, no throughput, no load test. I'd rather tell you that than quote you a number from a laptop. The real fix is a durable sequence source or per-patient sharding, and we haven't built it. What *does* scale today is the read path: consent checks are simulated, zero-fee and stateless." |
| **"How would you know if this broke at 3am?"** | "We wouldn't. That's finding G-15 and it's open. There's a `/v1/health` endpoint wired as the platform health check, and three structured JSON error events — facilitator unavailable, audit write failed, and a generic internal error with a request id — but nothing consumes them. No metrics, no tracing, no alerting. It's the main thing between this and something I'd call operable, and it's in our own gap report rather than waiting for you to find it." |
| **"What stops the admin forging audit entries?"** | "Nothing, and that's the honest limitation. `log_access` is admin-only, the operator mnemonic lives in an environment variable, and that same key can rotate the admin and drain the app account. The right answer is a multisig admin so no single key can write the log, plus a hardware-backed operator key. We documented it as a known limitation rather than pretending it's solved. What the chain *does* guarantee today is that entries are append-only and can't be quietly edited afterwards — and that the requester named in each entry is the address that actually signed the payment, which is a stronger claim than we could make a week ago." |
| **"Has anyone other than you ever paid for this?"** | *Before M11:* "No. Every settled payment so far is one of ours — TestNet, sender equals receiver — and it's disclosed in our proof log before anyone asks. Those transactions prove the pipeline settles: real facilitator, real `axfer`, 20000 base units, fee-sponsored, confirmed on the indexer, plus the full consent-gated composition with an audit entry on-chain. They don't prove demand and I won't claim they do. The reason there's no external volume is that there's no public URL yet — that's a deployment gap, not a design gap." *After M11:* "Yes — here are two transactions from two different wallets, and one of them isn't mine." |
| **"What's the business model at $0.02 a call?"** | "Not the triage endpoint. Eleven keyword rules aren't worth two cents and I won't argue they are — the price is there to make the metering real. The asset is the consent registry: a neutral, patient-signed, publicly-queryable permission substrate that a health system can point at without trusting us. That's infrastructure you charge for by being the registry of record, not by the lookup. What we've built is the smallest honest proof that the substrate works — and it now works end to end, with a transaction id at every step." |
| **"Why is the audit write not atomic with the payment?"** | "It could be — the `exact` AVM scheme allows up to sixteen transactions in the client's signed group. We chose not to, because a generic `@x402/fetch` client only knows how to build the transaction described in `paymentRequirements`. Requiring callers to know our app id and method signature would make us uncallable by anyone else's agent, which kills the whole open-endpoint strategy. So it's two transactions moments apart, admin-gated, submitted only after the facilitator confirms settlement. The residual risk is that the second one can fail after the money moves — which is why the response carries `auditStatus`, and why the caller gets the record either way." |
| **"You have 73 tests — what do they cover?"** | "Twenty-eight contract tests in the AVM simulator, including the negative paths — non-admin `log_access` rejection, revoking a grant that doesn't exist, expiry, per-patient sequence isolation — and three regression tests for two defects we found in our own contract, which we ran against the old code first to confirm they fail. Forty-five API tests: thirteen on the rule engines, six on recovering the payer from a payment signature, seven asserting our advertised route list matches what's actually mounted, fourteen on cross-language box-key parity against a shared golden-vector fixture that the Python suite reads too, and five asserting the real 402 shape against the live facilitator. And I'll tell you the gap: `services/algorand.ts` still has no dedicated test file, and the frontend has none at all. That's the coverage hole, and it's the honest answer." |
| **"What's `SENTINEL_EXCHANGE_PROPOSAL.md`?"** | "A design proposal for a different product on the same substrate. It's never been built — the first line of the file says so and lists what's absent — and it lives under `docs/future/` for exactly that reason. It's not part of this submission." |
| **"Is this production ready?"** | "No, and I'd distrust anyone who said yes about a hackathon build. It's demo ready without a carve-out: every claim on the critical path has a transaction id you can check without me, including the one that used to be missing. It is not beta ready, and the reason is short — there's no public host yet, there's no observability, and we've never measured performance. I can hand you the list; it's written down, it's twelve items, and none of them is a surprise to us." |
