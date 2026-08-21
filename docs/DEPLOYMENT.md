# MedRail — Deployment Runbook

Read `docs/IMPLEMENTATION_PLAN.md` §5 first if you haven't: this document is split cleanly into
steps already done for you against TestNet, and steps that need your own MainNet wallet /
hosting accounts and are therefore yours to run.

## Verify everything (no funds, no accounts needed)

```bash
# Contract: compile + unit test
cd contracts
.venv/Scripts/python.exe -m puyapy smart_contracts/consent/contract.py --out-dir artifacts
.venv/Scripts/python.exe -m pytest tests/ -v          # expect 28 passed

# API: typecheck, build, unit + structural tests
cd ../api
npm install
npx tsc --noEmit
npm run build
npx vitest run                                         # expect 45 passed

# Frontend: typecheck + production build
cd ../web
npm install
npx tsc --noEmit -p tsconfig.json
npm run build
```

## Stage 1 — TestNet (done — App ID `768743428`; here's exactly how it was run)

1. **Toolchain.** `contracts/.venv` (Python 3.12+) with `requirements-dev.txt` installed;
   `api/node_modules` and `web/node_modules` via `npm install`. All pinned exact versions are in
   `contracts/requirements.txt`, `contracts/requirements-dev.txt`, `api/package.json`,
   `web/package.json` — every package version was verified live against the real npm/PyPI
   registries during planning, not assumed (`docs/IMPLEMENTATION_PLAN.md` §1).
2. **Deployer account.** A dedicated TestNet keypair lives in `contracts/.env`
   (`DEPLOYER_ADDRESS` / `DEPLOYER_MNEMONIC`), generated fresh for this project — never a
   personal wallet.
   - **ALGO** (fees + box MBR): **https://lora.algokit.io/testnet/fund** — free email login, no
     wallet needed. Every legacy unauthenticated faucet is dead as of this writing.
   - **USDC** (to actually pay an endpoint): Lora's own USDC option just forwards to
     **https://faucet.circle.com** (pick network "Algorand Testnet" specifically — it defaults
     to a different chain). Circle rate-limits per IP; if you hit that, the independent
     alternative is **https://testnet.folks.finance/faucet** (needs an Algorand wallet connected
     + a CAPTCHA — a human-in-the-loop step, not something to automate).
   - **The receiving account must opt in to the USDC asset before it can receive any transfer**
     — this is an Algorand protocol rule (every account must explicitly opt in to every ASA), not
     an app-specific quirk, and it trips up first-time faucet sends. Run this once, before your
     first USDC transfer:
     ```bash
     .venv/Scripts/python.exe scripts/opt_in_usdc.py
     ```
3. **Deploy.**
   ```bash
   cd contracts
   .venv/Scripts/python.exe scripts/deploy_testnet.py
   ```
   Writes `contracts/artifacts/deploy_testnet.json` (App ID, app address, transaction IDs). The
   API (`api/src/config.ts`) reads this file automatically — no manual `CONSENT_APP_ID` needed
   for local TestNet dev. Note for a MainNet re-run: the contract's `create` method requires
   `create="require"`, so the deploy call must target that ABI method explicitly
   (`create_params=AppClientMethodCallCreateParams(method="create")` in
   `scripts/deploy_testnet.py`) — a bare/no-method create call will fail with an AVM
   `ApplicationArgs index` error.
4. **Exercise it for real.**
   ```bash
   .venv/Scripts/python.exe scripts/exercise_contract.py
   ```
   Funds two fresh throwaway accounts from the deployer, runs a real
   request → grant → check → revoke cycle, prints every transaction ID — see the real results in
   `docs/PROOF.md` §5. If a call ever fails with `txn dead: round X outside of Y--Z`, that's a
   transaction-validity-window timeout from sequential network round-trips, not a logic bug —
   the scripts already set a generous `validity_window` on every call for exactly this reason.
5. **Prove the payment flow.**
   ```bash
   cd ../api
   npx tsx src/index.ts &            # or npm run dev
   npx tsx scripts/e2e-proof.ts      # needs a TestNet account holding both ALGO and USDC
   ```
   Produces `contracts/artifacts/e2e-proof.json` with a real settled transaction ID — see the
   real result in `docs/PROOF.md` §6.
6. **Prove the consent-gated composition** (the flagship path — payment *and* on-chain consent
   *and* an on-chain audit append, in one call).
   ```bash
   API_BASE=http://localhost:4021 npx tsx scripts/e2e-consent-proof.ts
   ```
   Grants consent on-chain from the payer to itself for scope `records:summary`, then makes the
   paid `$0.05` call. Produces `contracts/artifacts/e2e-consent-proof.json` with the grant,
   payment, and audit transaction IDs — see `docs/PROOF.md` §9. Requires the app account to hold
   enough ALGO for box MBR (it is funded with 5 ALGO at deploy).

## Stage 2 — Public hosting (your accounts, not performed for you)

MedRail ships ready-to-deploy configs; standing up the actual public URL needs your own hosting
login.

- **API:** `api/Dockerfile` (build from the **repo root**: `docker build -f api/Dockerfile -t medrail-api .`)
  and `api/fly.toml` (`fly deploy -c api/fly.toml` from the repo root, after `fly launch`/`fly auth login`
  under your own account). Set `NETWORK=mainnet`, `PAY_TO_ADDRESS`, `CONSENT_APP_ID`,
  `OPERATOR_MNEMONIC` as secrets — never commit them.
- **Frontend:** `web/Dockerfile`, or simplest, Vercel (`vercel --prod` under your own account) with
  `NEXT_PUBLIC_API_BASE` pointed at your deployed API's public URL.

## Stage 3 — MainNet (real money — your wallet, your action, deliberately)

This is the literal act of entering the competition under your identity. Nothing here is run on
your behalf; see `docs/IMPLEMENTATION_PLAN.md` §5 for why.

1. Fund a **MainNet** Algorand account with a small amount of real ALGO (a few dollars covers
   contract creation + box MBR + transaction fees many times over) and, separately, the small
   amount of real USDC you intend to use for the one required proof-of-life payment.
2. Deploy the contract:
   ```bash
   cd contracts
   NETWORK=mainnet .venv/Scripts/python.exe scripts/deploy_testnet.py   # network-parameterized, same script
   ```
   *(Rename/parameterize as `deploy.py --network mainnet` if you'd rather not reuse the TestNet
   script name for a MainNet run — the logic is identical, only the network config differs.)*
3. Set `NETWORK=mainnet`, `CONSENT_APP_ID=<new App ID>`, `PAY_TO_ADDRESS`, `OPERATOR_MNEMONIC` on
   your deployed API (Stage 2).
4. Make one real payment against your live MainNet endpoint to confirm USDC receipt — the
   `web/` demo's "Pay and call live" flow works unmodified against MainNet once
   `NEXT_PUBLIC_NETWORK=mainnet` and `NEXT_PUBLIC_API_BASE` point at it, or reuse
   `api/scripts/e2e-proof.ts` with a MainNet-funded account and `ALGOD_URL=https://mainnet-api.algonode.cloud`.
5. **Submit to Bazaar with the `x402-global-challenge` tag** — this is the actual competition
   entry action. Do this through Bazaar's own UI (linked from `https://x402.goplausible.xyz`) at
   submission time; the exact tagging flow may have evolved since this was written, so check the
   current UI rather than relying on this document for that one step.

## Environment variable reference

| File | Variable | Notes |
|---|---|---|
| `contracts/.env` | `DEPLOYER_ADDRESS`, `DEPLOYER_MNEMONIC` | Dedicated deployer key. Gitignored. |
| `api/.env` | `NETWORK`, `PORT`, `FACILITATOR_URL`, `PAY_TO_ADDRESS`, `CONSENT_APP_ID`, `OPERATOR_MNEMONIC`, `OPERATOR_ADDRESS` | See `api/.env.example`. |
| `web/.env.local` | `NEXT_PUBLIC_API_BASE`, `NEXT_PUBLIC_NETWORK` | See `web/.env.example`. |

Never commit `.env` / `.env.local` — enforced by the root `.gitignore`.
