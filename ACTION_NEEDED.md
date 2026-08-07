# One thing I need from you

Everything below is blocked on **~1 minute of your time** — the rest of the build continues without it.

## Fund the TestNet deployer account

I checked every option: the classic unauthenticated Algorand TestNet faucet (`bank.testnet.algorand.network`) is dead — it hard-redirects to Lora, which now requires an email login. The `algokit dispenser` API needs a personal auth token from the same login. Every third-party faucet I found is either suspended or points back to the same login-gated one. There is currently no way to get TestNet ALGO without a login from *someone's* account, and it shouldn't be mine.

**What to do:**

1. Go to **https://lora.algokit.io/testnet/fund**
2. Log in with any email (no wallet needed, it's just anti-abuse for free play-money)
3. Paste this address and request funds (10 ALGO is the max per request — request it twice if you can, that gives comfortable headroom):

   ```
   2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE
   ```

This is a **TestNet** address — the ALGO it receives has zero real-world value, isn't linked to any exchange, and can't be moved to MainNet. The private key lives only in `contracts/.env` (gitignored, never committed).

## Once it's funded

Tell me, or just let me notice it — I'll periodically check the balance. Once funded I will, without further input:

```bash
cd contracts
.venv/Scripts/python.exe scripts/deploy_testnet.py      # deploys MedRailConsent for real
.venv/Scripts/python.exe scripts/exercise_contract.py    # runs a live grant/check/revoke cycle
```

Both scripts are already written and dry-run-verified against the real network up to the point where they need a balance — see `docs/IMPLEMENTATION_PLAN.md` if you want the detail.

## Everything else is not blocked

I'm continuing straight on to the backend API, frontend, and documentation while this waits. MainNet deployment is a separate, later step that needs your own funded MainNet wallet — that one's described in `docs/DEPLOYMENT.md` and is deliberately never something I'll do for you (real money, and it's the actual act of entering the competition under your identity).
