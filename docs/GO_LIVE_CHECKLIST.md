# MedRail — Pre-Submission Checklist

**Deadline: today, 17:00.** This is the working document for the day, not a general-purpose
runbook. It is ordered by the deadline: everything that blocks submission comes first, everything
that merely improves the submission comes after.

Requirement-by-requirement status lives in [`COMPLIANCE.md`](COMPLIANCE.md). The commands live in
[`08_Deployment/GO_LIVE_RUNBOOK.md`](08_Deployment/GO_LIVE_RUNBOOK.md). The video script lives in
[`11_Hackathon/Demo_Video_Script.md`](11_Hackathon/Demo_Video_Script.md).

---

## Where the submission actually stands

**Two of the eight submission requirements are not met. Both are hard blockers. Neither is
partially done.**

| Requirement | Status |
|---|---|
| 1 · Public GitHub repo with a proper README | ✅ Done — <https://github.com/Hydra-Of-Malice/Medrail> |
| **2 · Live and working project, deployed and accessible** | ⛔ **NOT DONE — nothing is hosted** |
| **3 · MVP demo video, ≤3 minutes, public link** | ⛔ **NOT DONE — nothing is recorded** |
| 4 · x402 payment flow live on Algorand TestNet | ✅ Done — multiple settled payments |
| 5 · An actual x402 transaction on Lora | ✅ Done — multiple, linked in the README |
| 6 · Payment through the GoPlausible facilitator | ✅ Done — live facilitator, verified, no mock |
| 7 · `@x402-avm` dependencies in `package.json` | ✅ Done — `api/` and `web/`, all `2.21.0` |
| 8 · x402 genuinely integrated, not just mentioned | ✅ Done — three routes gated in `api/src/app.ts:58-175` |

Everything already done is done for real and needs no further work today. **The entire day's work
is items 2 and 3.**

Also still not true, and not to be claimed anywhere: no MainNet deployment, no Bazaar listing, and
**no external party has paid for this service**. Payments now settle across three separate accounts
— the agent holds its own keypair, the `payTo` is another, and the grant is signed by a third that
is neither — but both of those wallets were funded from the project's own, so this is separate
parties, not external revenue. On Bazaar, keep the two halves apart: the discovery extension **is**
implemented and the `x402-global-challenge` tag **is** emitted; the **listing** is what does not
exist, and it cannot until a paid call lands against a public URL (see step D).

---

## Time budget, working backwards from 17:00

| Slot | Task | Est. | Blocking? |
|---|---|---|---|
| **A** | Pre-flight verification (tests, typecheck, build) | ~10 min | Yes — do not deploy an unverified build |
| **B** | **Deploy the API to Fly.io** | **~25 min** | **Yes — requirement 2** |
| **C** | **Deploy the frontend to Vercel** | **~10 min** | **Yes — requirement 2** |
| **D** | Prove the live URL end to end, capture new transaction IDs | ~10 min | No, but this is the strongest evidence of the day |
| **E** | **Record, edit, and upload the demo video** | **~60–90 min** | **Yes — requirement 3** |
| **F** | Update the README and docs with the live URL and video link | ~15 min | Yes — a live deploy nobody links to does not count |
| **G** | Final submission-form pass | ~10 min | Yes |

That is roughly **2.5–3 hours of committed work**. Start B before E: the video is stronger if it
shows the deployed URL, and B is the item most likely to surprise you.

---

## A · Pre-flight — before deploying anything

Run from the repo root. All must pass.

- [ ] `cd contracts && .venv/Scripts/python.exe -m pytest tests/ -q` → **28 passed**
- [ ] `cd api && npm run typecheck && npx vitest run` → **93 passed**. `npm run typecheck` is
      `tsc -p tsconfig.all.json` — the same command CI runs, covering `scripts` and `test` as well
      as `src`, so a broken proof script fails here and not in step D
- [ ] `cd web && npx tsc --noEmit -p tsconfig.json && npm run build`
- [ ] `curl -s https://facilitator.goplausible.xyz/supported` returns Algorand support — if the
      facilitator is down, every paid route is down, and you will want to know that *before* you
      start recording
- [ ] Three wallets, and they need different things. The **agent** (`UYBTLPHS…`, `AGENT_MNEMONIC`)
      needs USDC *and* ALGO — one full agent-demo run costs **$0.09 USDC**; budget ~$0.30 for a dry
      run, a backup take, and the live take. The **operator / `payTo`** (`2WDV2J2F…`) needs ALGO
      only, for the audit writes. The **patient** (`56LFG5EE…`, `PATIENT_MNEMONIC`) needs ALGO only
      and should hold no USDC — it signs grants and pays for nothing
- [ ] `cd api && npm run dev` in one terminal, then **`npm run preflight`** in another → all eight
      checks PASS, *"Ready to record."*, exit code 0. This is the single command that covers the
      facilitator, both funding accounts, the agent's USDC balance, the consent grant, the service
      index and the Bazaar declaration in one pass. Run it again after step B against the deployed
      host: `API_BASE=https://medrail-api.fly.dev npm run preflight`
- [ ] Confirm `PAY_TO_ADDRESS` and `OPERATOR_MNEMONIC` are to hand — you need them for `fly secrets`
      in step B, and **neither goes into git, `fly.toml`, or the Dockerfile**

Total: **121 tests** (28 contract + 93 API), all green, before anything ships.

Every pre-flight check corresponds to a failure that is *quiet* rather than loud. An unfunded
operator does not error — the paid call still returns 200 and degrades to `auditStatus: "pending"`.
A missing consent grant does not error either — the agent politely declines to spend. On camera
both look like the product not working.

---

## B · ⛔ BLOCKER — Deploy the API (~25 min)

Full commands: [`08_Deployment/GO_LIVE_RUNBOOK.md`](08_Deployment/GO_LIVE_RUNBOOK.md) §1.

- [ ] Fly.io account created and `fly auth login` succeeds
- [ ] `fly launch --no-deploy --copy-config --config api/fly.toml --name medrail-api`
      — **from the repo root**, not from `api/`; the Dockerfile reaches into `contracts/artifacts/`
- [ ] `fly secrets set PAY_TO_ADDRESS=... OPERATOR_MNEMONIC="..." --config api/fly.toml`
      — secrets before first boot; the service refuses to start without a valid `PAY_TO_ADDRESS`
- [ ] `fly deploy --config api/fly.toml`
- [ ] `curl -s https://medrail-api.fly.dev/v1/health | jq` returns **`consentAppId: 768743428`**.
      If it returns `null`, `CONSENT_APP_ID` did not reach the container. Check `chain.warning` is
      `null` in the same response — it is sampled in the background, so if `chain` is `null` with
      `chainError: "not sampled yet"`, call it a second time
- [ ] `curl -i -X POST https://medrail-api.fly.dev/v1/triage -H "Content-Type: application/json"
      -d '{"symptoms":"chest pain"}'` returns **HTTP 402** with a payment-required header
- [ ] `GET https://medrail-api.fly.dev/` returns the machine-readable service index — this is what
      an agent discovers, so it is the single most important URL to hand a judge

**Requirement 2 is satisfied the moment a judge can open that URL and get a 402.**

---

## C · ⛔ BLOCKER — Deploy the frontend (~10 min)

Full commands: [`08_Deployment/GO_LIVE_RUNBOOK.md`](08_Deployment/GO_LIVE_RUNBOOK.md) §2.

- [ ] `cd web && vercel login && vercel link`
- [ ] `vercel env add NEXT_PUBLIC_API_BASE production` → `https://medrail-api.fly.dev`
- [ ] `vercel env add NEXT_PUBLIC_NETWORK production` → `testnet`
- [ ] `vercel --prod`
- [ ] Open the deployed URL. The network badge must read **live on testnet · app 768743428** —
      that is the proof the browser is talking to your real API, not a stub
- [ ] Click through one paid call in the browser to confirm CORS and signing work against the
      deployed API, not just localhost

Both env vars are `NEXT_PUBLIC_*` and inlined at build time — changing either needs a **redeploy**,
not just an env update.

---

## D · Prove the live URL end to end (~10 min, do it — it is cheap and it is the best evidence)

- [ ] `cd api && API_BASE=https://medrail-api.fly.dev npx tsx scripts/e2e-proof.ts`
- [ ] `API_BASE=https://medrail-api.fly.dev npx tsx scripts/e2e-consent-proof.ts`
- [ ] `API_BASE=https://medrail-api.fly.dev npx tsx scripts/agent-demo.ts` — the machine-to-machine
      centrepiece, now against a public URL
- [ ] Paste the resulting transaction IDs into [`PROOF.md`](PROOF.md)
- [ ] `curl -s "https://facilitator.goplausible.xyz/discovery/resources?limit=1000" | grep -o "medrail[^\"]*"`
      — the agent-demo run above carries the Bazaar declaration, so verifying that payment is what
      puts MedRail in the public catalogue. The record should carry `method: "POST"` and
      `accepts[0].extra.tag = "x402-global-challenge"`. Only after this may the entry be described
      as listed ([`05_API/Bazaar_Discovery.md`](05_API/Bazaar_Discovery.md) §7)

A settled payment against a **public** URL is materially stronger evidence than one against
localhost, and it costs $0.09 plus five minutes. The payer is the independent agent wallet
`UYBTLPHS…`, so sender ≠ receiver, and the grant behind the gated call was signed by `56LFG5EE…`,
which is neither the payer nor the payee — but both wallets were funded by us, so it is still not
external revenue. Say so.

---

## E · ⛔ BLOCKER — Record the demo video (~60–90 min)

Shot-by-shot script, already timed to 3:00:
[`11_Hackathon/Demo_Video_Script.md`](11_Hackathon/Demo_Video_Script.md).

- [ ] Work through that document's "Before you hit record" list — funded wallet, facilitator
      reachable, large terminal font, browser tabs pre-opened, notifications off
- [ ] **Record a clean backup take of the agent demo first.** It spends real TestNet USDC each run;
      if anything breaks on the live take you cut to the backup and nobody can tell
- [ ] Record the full take. Structure: problem (0:25) → **the agent does it live (1:10)** → prove it
      on Lora (0:30) → the 403 impersonation rejection (0:30) → close (0:25)
- [ ] **Check the runtime is ≤ 3:00.** If over, cut in the order the script gives — App-ID tab
      first, then the control run, then the interaction-check narration. **Never cut** the discovery
      step, the free consent check before spending, or the 403
- [ ] Upload to YouTube (**unlisted or public**) or Google Drive (**"Anyone with the link"**)
- [ ] **Open the link in a private/incognito window.** A video the judges cannot open is a video
      that does not exist — this is the single most common way this requirement fails
- [ ] If the deploy in B/C is done, show the **live URL** in the video, not localhost

---

## F · Update the docs with the new links (~15 min)

A deployment nobody can find and a video nobody is linked to do not count as submitted.

- [ ] `README.md` — add the live API URL and the live web URL near the top
- [ ] `README.md` — add the video link
- [ ] `README.md` "Known limitations" — the line *"Nothing is publicly hosted"* becomes false the
      moment B lands. Fix it. **Do not** delete the neighbouring lines that are still true: no
      MainNet, no Bazaar listing, synthetic record data, single-machine pinning, no observability
- [ ] `README.md` "Known limitations" — the payment line is already correct as written (*"No
      external party has paid for this service…"*). **Leave it.** Do not upgrade it to a claim of
      third-party revenue on the strength of the agent run; the agent's float came from us
- [ ] [`COMPLIANCE.md`](COMPLIANCE.md) — flip rows 2 and 3 from ⛔ to ✅ with the actual links, and
      empty out the "What is still missing" block for the two items that are now done
- [ ] [`PROOF.md`](PROOF.md) — the transaction IDs from step D
- [ ] Commit and push. **Verify the pushed README renders on GitHub** — the Mermaid architecture
      diagram is a submission requirement and it must render, not show as a code block

---

## G · Final submission pass (~10 min)

Check each against [`COMPLIANCE.md`](COMPLIANCE.md) before you submit:

- [ ] Repo URL is public — open it logged out
- [ ] README shows problem + solution, local run/test instructions, the architecture diagram, at
      least one TestNet x402 transaction link, and the **USP** section
- [ ] Live project URL opens, logged out, from a different network if you can manage it
- [ ] Video link opens logged out, and is **≤ 3:00**
- [ ] At least one Lora transaction link pasted into the submission form itself
- [ ] Facilitator named: `https://facilitator.goplausible.xyz`
- [ ] Entry type stated: **Composite** — three priced endpoints, one `payTo` address
- [ ] Nothing in the submission claims MainNet, a Bazaar listing, or third-party revenue

---

## Deliberately not today

These are real, and none of them is a submission requirement. Do not let any of them consume the
hours that items 2 and 3 need.

- **MainNet deployment.** Real funds, a separate decision, and explicitly not on the new
  requirement list. The procedure is written and waiting:
  [`08_Deployment/GO_LIVE_RUNBOOK.md`](08_Deployment/GO_LIVE_RUNBOOK.md) §4.
- **Bazaar listing.** Also not on the new requirement list, and no longer a code task: the
  discovery extension is wired (`api/src/x402.ts` registers `bazaarResourceServerExtension`) and the
  `x402-global-challenge` tag is emitted on every 402. Listing follows from the paid call in step D
  against the public URL — so if B and D both land, check for it, and if they do not, say
  *"implemented, not listed"* and nothing stronger.
- **Redeploying the contract.** `deploy_testnet.py` uses `OnUpdate.AppendApp`, which mints a **new**
  App ID rather than updating in place. A redeploy today invalidates `768743428` in every document,
  every Lora link, and every existing grant and audit entry. The two known contract defects are
  fixed in source and covered by tests, held back from deployment on purpose. **Do not redeploy.**
- **Closing the remaining 12 gap-report findings.** They are documented with severities in
  [`ENGINEERING_GAP_REPORT.md`](ENGINEERING_GAP_REPORT.md). Honestly listing them is worth more
  today than half-fixing two of them.

---

## If you run out of time

Priority order, if it comes to triage:

1. **The deploy (B + C).** A judge who can open a URL and get a 402 has verified most of the
   submission themselves.
2. **The video (E).** Record it against localhost if the deploy is fighting you — a 3-minute video
   of the agent paying for three services is far better than no video. Say it is running locally.
3. Everything else.

Do **not** submit with a deploy or a video that "mostly works" and hope. A broken link reads worse
than an honest note that a component runs locally — and this project's whole argument is that it
does not overstate what it has.
