# MedRail — Go-Live Runbook

**Purpose:** The exact commands to put MedRail on a public HTTPS URL. Every step you run yourself;
nothing here needs anything from the reviewer.

**Status of this document:** Prepared 2026-08-21, re-verified against the repository 2026-08-22 —
`api/fly.toml`, `api/Dockerfile` and the health-check path all match what is written below.

**The API image has been built and run locally, and it works.** That is the part of §1 that could
have surprised you, and it no longer can:

```
docker build -f api/Dockerfile -t medrail-api .        # from the repo root
docker run -p 4031:4021 -e NETWORK=testnet -e CONSENT_APP_ID=768743428   -e PAY_TO_ADDRESS=… -e OPERATOR_MNEMONIC=… medrail-api
```

Verified in that container on 2026-08-22: `/v1/health` returns `consentAppId: 768743428` with a live
`chain` block, `GET /` advertises all 8 endpoints, `/v1/consent/arc56` returns 200, and
`POST /v1/triage` returns a 402 carrying `resource.tags` with `x402-global-challenge`,
`accepts[0].extra.tag`, and `extensions.bazaar.info.input.method: "POST"`.

What remains unexecuted is only what needs *your* accounts: `fly auth login`, `fly deploy`, and the
Vercel steps. Anything else not yet verified is marked so below.

---

## ⛔ Why this runbook is urgent today

**Sections 1 and 2 below are one of the two hard blockers on the submission.** Requirement 2 of the
organisers' list — *"live and working project, deployed and accessible"* — is **not met**. MedRail
runs on `localhost:4021` and nowhere else. There is no URL a judge can open.

| Blocker | This runbook | Estimated time |
|---|---|---|
| **Requirement 2 — API not deployed** | **§1 · API → Fly.io** | **~25 min** |
| **Requirement 2 — frontend not deployed** | **§2 · Frontend → Vercel** | **~10 min** |
| **Requirement 3 — no demo video** | Not this document → [`../11_Hackathon/Demo_Video_Script.md`](../11_Hackathon/Demo_Video_Script.md) | **~60–90 min** including a backup take |

Do §1 and §2 **before** recording. The video is materially stronger when it shows a public URL
instead of localhost, and the deploy is the step more likely to surprise you.

**§3 (Bazaar listing)** and **§4 (MainNet)** are *not* on the organisers' submission requirement
list and are **not** for today. Sections 0–2 and 5–6 are.

Ordered plan for the whole day: [`../GO_LIVE_CHECKLIST.md`](../GO_LIVE_CHECKLIST.md).
Requirement-by-requirement status: [`../COMPLIANCE.md`](../COMPLIANCE.md).

---

## 0. Before you start

You need: a [Fly.io](https://fly.io) account, a [Vercel](https://vercel.com) account (or Fly again),
and the two values from `api/.env` — `PAY_TO_ADDRESS` and `OPERATOR_MNEMONIC`.

**Never put either into `fly.toml`, a Dockerfile, or git.** They go in as secrets, below.

### Top up the operator account first — 30 seconds, and it prevents a live failure

Every `log_access` costs the operator 1,000 µALGO. At the last check the operator
(`2WDV2J2F…`) held **101,000 µALGO spendable — about 101 more audit writes**. That is enough for a
demo and not much more, and if it reaches zero the symptom is not an error: the paid call still
returns 200 and silently degrades to `auditStatus: "pending"`.

```bash
# What it holds right now
curl -s "https://testnet-api.algonode.cloud/v2/accounts/<PAY_TO_ADDRESS>"   | jq '{amount, min: .["min-balance"], spendable: (.amount - .["min-balance"])}'
```

Top it up at the TestNet dispenser — <https://lora.algokit.io/testnet/fund> — which needs a browser
and is free. Do the same for the application account `CCO26Y6Z56DDZ3OELO2UKJMIPJVSIT52I23F2MPMR52JBM3HQZZNUZNOR4`
if its spendable balance drops below about 25,000 µALGO, since that is what pays for each new box.

Once the API is running, `/v1/health` reports both figures and warns for you — see §1.5.

`api/.env` also holds `AGENT_MNEMONIC`, the independent wallet the agent demo pays from. **That one
stays local.** It is a client-side key belonging to the caller, not to the service — the server has
no use for it, and shipping it as a deploy secret would hand the service control of the account whose
independence is the point (see [`../PROOF.md`](../PROOF.md) §10).

```bash
# Sanity check before deploying anything — all of these must pass.
cd contracts && .venv/Scripts/python.exe -m pytest tests/ -q     # 28 passed
cd ../api    && npm run typecheck && npx vitest run              # typecheck covers src, scripts and test
cd ../web    && npx tsc --noEmit -p tsconfig.json && npm run build
```

### `npm run preflight` — run this before you record, and again after deploying

```bash
cd api && npm run dev              # in one terminal
npm run preflight                  # in another
API_BASE=https://medrail-api.fly.dev npm run preflight   # after §1
```

Eight checks, exit code 1 if any of them blocks you. Every one corresponds to something that has
actually gone wrong here, and — this is the point — each fails *quietly* on camera rather than
loudly: an unfunded operator turns a 200 into `auditStatus: "pending"` with no error, a missing
consent grant turns the flagship agent run into a polite decline, an unreachable facilitator turns
every priced route into a 503. None of those look like infrastructure. They look like the product
not working.

```
  [PASS] API reachable                      testnet
  [PASS] Consent contract configured        App 768743428
  [PASS] Audit trail affordable             ~96 writes left (operator 96000 µALGO, app 3866300 µALGO)
  [PASS] Service index                      8 endpoints advertised
  [PASS] Facilitator reachable              https://facilitator.goplausible.xyz
  [PASS] 402 challenge                      HTTP 402 · challenge tag present · bazaar declaration present
  [PASS] Agent wallet funded                $0.71 USDC — about 7 full runs
  [PASS] Consent grant active               56LFG5EE… → UYBTLPHS… for records:summary

  Ready to record.
```

---

## 1. API → Fly.io

`api/fly.toml` is committed and its defaults are now correct: `NETWORK=testnet`,
`CONSENT_APP_ID=768743428`, a `/v1/health` check, and `max_machines_running = 1` (deliberate — the
audit-write lock is in-process; see [`../ENGINEERING_GAP_REPORT.md`](../ENGINEERING_GAP_REPORT.md)
G-11).

```bash
# From the REPO ROOT. The Dockerfile reaches into contracts/artifacts, so the
# build context must be the root, not api/.
cd /path/to/MedRail

# 1.1 Install and authenticate (once)
#   Windows: iwr https://fly.io/install.ps1 -useb | iex
#   macOS/Linux: curl -L https://fly.io/install.sh | sh
fly auth login

# 1.2 Create the app WITHOUT deploying (so secrets exist before first boot)
fly launch --no-deploy --copy-config --config api/fly.toml --name medrail-api

# 1.3 Secrets — never committed
fly secrets set \
  PAY_TO_ADDRESS="<your PAY_TO_ADDRESS>" \
  OPERATOR_MNEMONIC="<your 25-word operator mnemonic>" \
  --config api/fly.toml

# 1.4 Deploy
fly deploy --config api/fly.toml

# 1.5 Verify
fly status --config api/fly.toml
curl -s https://medrail-api.fly.dev/v1/health | jq
```

`/v1/health` also returns a `chain` block — the operator's spendable µALGO, the application
account's spendable µALGO, and `estimatedAuditWritesRemaining`. **Read it before you record
anything.** If `warning` is non-null, the audit trail is about to stop working: the paid call will
still return 200 and quietly degrade to `auditStatus: "pending"`, which is exactly the failure you
do not want on camera. The read is stale-while-revalidate, so it never delays the health check; a
`chainError` instead of a `chain` just means no sample has landed yet.

**`/v1/health` must return `consentAppId: 768743428`.** If it returns `null`, `CONSENT_APP_ID` did
not reach the container — set it explicitly (`fly secrets set CONSENT_APP_ID=768743428`). The
service now refuses to boot at all without a valid `PAY_TO_ADDRESS`, so a boot failure there is the
expected, loud behaviour rather than a silent one.

### 1.6 Prove the live URL end to end

```bash
curl -i -X POST https://medrail-api.fly.dev/v1/triage \
  -H "Content-Type: application/json" \
  -d '{"symptoms":"Sudden chest pain and shortness of breath"}'
# expect: HTTP/2 402 with a payment-required header

cd api
API_BASE=https://medrail-api.fly.dev npx tsx scripts/e2e-proof.ts
API_BASE=https://medrail-api.fly.dev npx tsx scripts/e2e-consent-proof.ts

# The machine-to-machine centrepiece — an agent that discovers the service from
# GET /, checks the FREE consent oracle before spending, and pays for three
# services. $0.09 across 3 settled transactions. Now against a public URL.
API_BASE=https://medrail-api.fly.dev npx tsx scripts/agent-demo.ts
```

These write proof artifacts under `contracts/artifacts/`. **Paste the resulting transaction IDs into
[`../PROOF.md`](../PROOF.md)** — a settled payment against a *public* URL is materially stronger
evidence than one against localhost.

Two different payers are involved here, and the distinction matters when you write the results up.
`e2e-proof.ts` and `e2e-consent-proof.ts` pay from `PROOF_MNEMONIC`, which is the project's own
account and also owns `PAY_TO_ADDRESS` — those runs are **self-payments**. `agent-demo.ts` pays from
`AGENT_MNEMONIC`, an independently generated wallet (`UYBTLPHS…`) that the service does not control,
so those settlements move between **distinct accounts**; the indexer will show sender ≠ receiver.
Either way they are real, settled, on a public ledger — and **neither is external revenue**: the
agent's TestNet USDC float was seeded from the project's own wallet, because TestNet USDC has no
other practical source. No unrelated party has paid for this service, and nothing here should be
described as if one had.

The agent and patient wallets and the consent grant between them are one-time setup and already
done — recorded in [`../PROOF.md`](../PROOF.md) §10 and [`../AGENT_RUN_FACTS.md`](../AGENT_RUN_FACTS.md).
Re-run these only if a wallet is lost or drained, and note that new addresses invalidate every
transaction ID currently cited in the documentation:

```bash
npx tsx scripts/provision-agent-wallet.ts            # mints, funds and USDC-opts-in a new agent wallet
npx tsx scripts/provision-patient-wallet.ts          # mints and funds a new patient wallet (ALGO only)
npx tsx scripts/grant-consent.ts <newAgentAddress>   # the patient grants that agent records:summary
```

Also confirm the discovery surface, since it is what an agent — and a judge — hits first:

```bash
curl -s https://medrail-api.fly.dev/ | jq '.endpoints, .x402'
```

---

## 2. Frontend → Vercel

```bash
cd web
vercel login
vercel link
vercel env add NEXT_PUBLIC_API_BASE production   # https://medrail-api.fly.dev
vercel env add NEXT_PUBLIC_NETWORK production    # testnet
vercel --prod
```

Both variables are `NEXT_PUBLIC_*` and are **inlined at build time**, so changing either requires a
redeploy, not just an env update. Neither is a secret.

Open the deployed URL: the network badge should read **live on testnet · app 768743428**, which
proves the browser is talking to your real API.

### CORS

Already handled. `api/src/app.ts` sets `origin: "*"` and leaves `allowHeaders` unset so Hono
reflects whatever the browser's preflight requests — which is what a payment-signing client needs.
A hand-maintained allowlist previously broke every browser paid call; the comment at `app.ts:22-35`
records that.

---

## 3. Bazaar listing (competition entry)

Do this through Bazaar's own UI, linked from <https://x402.goplausible.xyz>, with your public API
URL and the tag **`x402-global-challenge`**. This is the act of entering under your identity, so it
is yours to perform. Check the current UI rather than trusting a written flow — it may have changed.

---

## 4. MainNet — only when you choose to

**Real funds. Read this whole section before running anything.**

```bash
# 4.1 Fund a MainNet account with a small amount of ALGO and USDC.
#     The account must OPT IN to USDC (ASA 31566704) before it can receive any:
cd contracts
NETWORK=mainnet .venv/Scripts/python.exe scripts/opt_in_usdc.py

# 4.2 Deploy the contract (same script, network-parameterised; refuses to touch
#     MainNet unless NETWORK is set explicitly)
NETWORK=mainnet .venv/Scripts/python.exe scripts/deploy_testnet.py
#     -> writes contracts/artifacts/deploy_mainnet.json with the NEW App ID

# 4.3 Point the deployed API at MainNet
fly secrets set NETWORK=mainnet CONSENT_APP_ID=<new App ID> --config api/fly.toml

# 4.4 One real payment to confirm USDC receipt
cd ../api
API_BASE=https://medrail-api.fly.dev ALGOD_URL=https://mainnet-api.algonode.cloud \
  npx tsx scripts/e2e-proof.ts
```

**Pre-flight checklist**

- [ ] MainNet account funded with ALGO (contract creation + box MBR + fees) and USDC
- [ ] Account opted in to USDC ASA `31566704`
- [ ] `deploy_mainnet.json` written, new App ID recorded
- [ ] App account funded — box MBR is **22,500 µALGO per grant box** (use this figure, not the
      contract's `get_grant_box_mbr()`, until the C-2 fix is redeployed)
- [ ] `fly secrets` updated with the new App ID **and** `NETWORK=mainnet`
- [ ] `/v1/health` reports the MainNet App ID
- [ ] One real payment settled and visible on a MainNet explorer

**Do not redeploy the contract before the finals.** `deploy_testnet.py` uses
`OnUpdate.AppendApp`, which creates a *new* application rather than updating in place — a redeploy
mints a new App ID and invalidates `768743428` in every document, along with its grants and audit
history. The two known contract defects (C-1, C-2) are fixed in source and covered by tests, held
back from deployment deliberately.

---

## 5. Rollback

| Component | How |
|---|---|
| API | `fly releases --config api/fly.toml`, then `fly deploy --image <previous>` |
| Config | `fly secrets set KEY=old-value` — takes effect on the next boot |
| Frontend | Vercel dashboard → previous deployment → *Promote to Production* |
| Contract | **No rollback exists.** Re-point `CONSENT_APP_ID` at a different app; box state does not migrate. See [`Rollback_Strategy.md`](Rollback_Strategy.md) |

---

## 6. After going live — the things that will actually break

None of these is hypothetical; each maps to a verified finding.

| Watch | Why | Check |
|---|---|---|
| **Operator ALGO balance** | At zero, every `log_access` fails and `/v1/records/summary` degrades to `auditStatus: "pending"` | `curl "https://testnet-idx.algonode.cloud/v2/accounts/<operator>"` |
| **App account MBR headroom** | Grant and audit boxes stop being created | Same query on `CCO26Y6Z…`; needs ≥22,500 µALGO free per new grant |
| **Facilitator reachability** | Priced routes return `503` + `Retry-After` (no longer an opaque 500) | `curl https://facilitator.goplausible.xyz/supported` |
| **`payTo` receipts** | The only signal that the service is earning | Watch the `payTo` address on an explorer |

Rate limits are now in place on the free and refundable surface (60/min on
`/v1/consent/status`, 30/min on `/v1/records/summary` and `/v1/consent/arc56`), which closes the
fee-drain vector where denied calls cost the caller nothing and cost you a chain fee.

---

## Cross-references

- [`../GO_LIVE_CHECKLIST.md`](../GO_LIVE_CHECKLIST.md) — **the ordered plan for submission day**
- [`../COMPLIANCE.md`](../COMPLIANCE.md) — requirement-by-requirement status, including what is still missing
- [`../11_Hackathon/Demo_Video_Script.md`](../11_Hackathon/Demo_Video_Script.md) — **the other blocker:** shot-by-shot script for the 3-minute video
- [`Environment_Setup.md`](Environment_Setup.md) — local setup and troubleshooting
- [`Docker.md`](Docker.md) — image analysis
- [`../PROOF.md`](../PROOF.md) — where to record your live transaction IDs

## After §1 and §2 land

Update the documents that currently say nothing is hosted — a deploy nobody links to does not
count as submitted:

- `README.md` — add the live API and web URLs near the top; the "Known limitations" line *"Nothing
  is publicly hosted"* becomes false. Leave the neighbouring lines alone: no MainNet, no Bazaar
  listing, synthetic record data, single-machine pinning and no observability are all still true.
- [`../COMPLIANCE.md`](../COMPLIANCE.md) — flip requirement 2 from ⛔ to ✅ with the real URL.
- [`../GO_LIVE_CHECKLIST.md`](../GO_LIVE_CHECKLIST.md) — tick §B and §C.
