# MedRail — Go-Live Runbook

**Purpose:** The exact commands to put MedRail on a public HTTPS URL. Every step you run yourself;
nothing here needs anything from the reviewer.

**Status of this document:** Prepared 2026-08-21. The configs are committed and corrected; the
commands below have not been executed because they require your accounts. Anything not yet verified
is marked so.

**Time:** ~25 minutes for the API, ~10 for the frontend.

---

## 0. Before you start

You need: a [Fly.io](https://fly.io) account, a [Vercel](https://vercel.com) account (or Fly again),
and the two values from `api/.env` — `PAY_TO_ADDRESS` and `OPERATOR_MNEMONIC`.

**Never put either into `fly.toml`, a Dockerfile, or git.** They go in as secrets, below.

```bash
# Sanity check before deploying anything — all four must pass.
cd contracts && .venv/Scripts/python.exe -m pytest tests/ -q     # 28 passed
cd ../api    && npx tsc --noEmit && npx vitest run               # 45 passed
cd ../web    && npx tsc --noEmit -p tsconfig.json && npm run build
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
```

Both write proof artifacts under `contracts/artifacts/`. **Paste the resulting transaction IDs into
[`../PROOF.md`](../PROOF.md)** — a settled payment against a *public* URL is materially stronger
evidence than one against localhost.

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
A hand-maintained allowlist previously broke every browser paid call; the comment at `app.ts:19-30`
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

- [`Environment_Setup.md`](Environment_Setup.md) — local setup and troubleshooting
- [`Docker.md`](Docker.md) — image analysis
- [`../PROOF.md`](../PROOF.md) — where to record your live transaction IDs
- [`../GO_LIVE_CHECKLIST.md`](../GO_LIVE_CHECKLIST.md) — competition entry checklist
