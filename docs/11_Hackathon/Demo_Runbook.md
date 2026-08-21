# MedRail — Demo Runbook

**Purpose:** the operational procedure for running the MedRail demo without failing on stage — pre-flight checks at T-24h / T-1h / T-5min, exact start-up sequence, and a failure-mode table with detection, fallback, and the exact words to say.

**Status of this document:** Operational runbook, 2026-08-21. Every verification command below was executed against live public infrastructure during authoring and produced the stated output, except those marked ⚠ which depend on local state (a running API, a funded wallet). Assumes TestNet only — no MainNet, public hosting, Bazaar listing, or leaderboard presence is involved. Companion to [`Demo_Script.md`](Demo_Script.md), which contains the beats and the words; this document contains everything that has to be true before those work.

Related: [`Judge_Evaluation.md`](Judge_Evaluation.md), [`Winning_Strategy.md`](Winning_Strategy.md), [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md).

---

## 0. The three facts that break demos

Read these before the checklist. Everything else is detail.

1. **An Algorand account cannot receive an ASA it has not opted in to.** This is a protocol rule, not an app quirk. Your demo wallet must opt in to USDC ASA `10458941` *before* any faucet send will land. Miss this and the faucet appears to work, the balance stays zero, and you find out on stage. `contracts/scripts/opt_in_usdc.py` does it for the deployer; the browser demo wallet needs its own opt-in.
2. **The 402 cannot be constructed offline.** `accepts[].asset` and `extra.feePayer` come from the facilitator's `/supported`, fetched at initialisation — not from MedRail config (`api/src/x402.ts:16-32` deliberately omits `asset`). If `facilitator.goplausible.xyz` is unreachable, **every priced route returns HTTP 503 with `Retry-After: 30`** and code `PAYMENT_FACILITATOR_UNAVAILABLE` (`api/src/app.ts:69-105`). Free routes are unaffected. That is a much better failure than the opaque 500 it used to be — but it is still four of your eight beats gone. **Check it at T-5min, not T-24h.**
3. **ALGO, not USDC, is your funding constraint.** The project wallet `2WDV2J2F…` currently holds **$20.00 of TestNet USDC** (20,000,000 base units) — roughly a thousand $0.02 calls or four hundred $0.05 ones, so payments are not going to run out. It holds **0.984 ALGO** with 0.464 locked as minimum balance, leaving about **0.52 ALGO of spendable headroom**. Every `grant_access` and `revoke_access` pays its own fee out of that (payments are fee-sponsored; consent transactions are not), and the operator account pays a fee for every audit write. Rehearsing burns ALGO faster than USDC. **Check the ALGO balance at T-1h, not just the USDC one.**

---

## 1. T-24h — the day before

Anything here that fails needs a day to fix. Run all of it.

### 1.1 Verify the deployed contract is intact

```bash
curl -s https://testnet-idx.algonode.cloud/v2/applications/768743428 | python -c "
import sys, json, base64
a = json.load(sys.stdin)['application']
print('created-at-round:', a['created-at-round'], '| deleted:', a['deleted'])
for kv in a['params']['global-state']:
    k = base64.b64decode(kv['key']).decode()
    if kv['value']['type'] == 2:
        print(f'{k:22} = {kv[\"value\"][\"uint\"]}')
"
```

**Expected** (verified live 2026-08-21):
```
created-at-round: 66088624 | deleted: False
total_requests         = 2
total_revocations      = 2
total_audit_entries    = 5
total_grants_active    = 4
```

- `deleted: False` — **must** be false. If it is true the demo has no contract and you are rebuilding, not rehearsing.
- `total_audit_entries` — **must be ≥ 5.** This is the counter Beat 8 lands on, and it is the single number that carries the differentiator. If it ever reads 0, you are pointed at the wrong App ID.
- `total_grants_active` — expect 4 or more. It is **not** decremented when a grant expires (finding G-32, open), so it drifts upward over time. Do not present it as a live count of currently-valid grants; it counts grants that were made active and not explicitly revoked.

> **Note on what this App ID is running.** App `768743428` executes the **pre-fix bytecode**: two contract defects (C-1, the swapped `AccessRequested` event fields; C-2, the 400 µALGO MBR under-estimate) are fixed in `contracts/contract.py` with regression tests, and deliberately **not** redeployed, because `deploy_testnet.py` uses `OnUpdate.AppendApp` and would mint a new App ID — discarding every transaction id in your evidence log. Neither defect affects the demo. **Know this cold**, because it is the sharpest question a prepared judge can ask; the answer is in `Demo_Script.md`'s risk register.

### 1.2 Verify app-account balance and box headroom

```bash
curl -s https://testnet-idx.algonode.cloud/v2/accounts/CCO26Y6Z56DDZ3OELO2UKJMIPJVSIT52I23F2MPMR52JBM3HQZZNUZNOR4 \
| python -c "
import sys, json
a = json.load(sys.stdin)['account']
print('balance    :', a['amount'], 'uALGO')
print('min-balance:', a['min-balance'], 'uALGO')
print('headroom   :', a['amount'] - a['min-balance'], 'uALGO')
print('boxes      :', a.get('total-boxes'), '/', a.get('total-box-bytes'), 'bytes')
"
```

**Expected** (verified live 2026-08-21):
```
balance    : 5000000 uALGO
min-balance: 550400 uALGO
headroom   : 4449600 uALGO
boxes      : 12 / 1051 bytes
```

**Threshold:** headroom must exceed ~50,000 µALGO to create the boxes a new grant plus audit write needs. 4.45 ALGO is ample. If headroom ever drops below ~200,000 µALGO, top up via `fund_mbr` before the demo.

**Box inventory, so you can read the number rather than trust it:** 12 boxes — **6** `g`-prefixed grant boxes, **5** `a`-prefixed audit-entry boxes, and **1** `s`-prefixed per-patient sequence box. In base64 the prefixes render as `Z…` for `g`, `Yd…` for `a`, and `c…` for `s`. The five audit boxes are the on-chain form of `total_audit_entries = 5`; if the counter and the box count ever disagree, something is wrong with the App ID you are querying, not with the contract.

> **Known defect, worth knowing but not fixing today:** the contract's `get_grant_box_mbr()` **as deployed** returns **22,100** µALGO per grant box (it computes `400 * (32 + 17)`), while the true cost is **22,500** — the effective box key includes the 1-byte `"g"` prefix. It is fixed in source (`400 * (33 + 17)`) with a regression test, and **the deployed app still runs the old value on purpose** (finding C-2; see §1.1). It under-quotes by 1.8% and will not break this demo. **Do not redeploy to fix it** — a new App ID destroys every transaction id in your evidence log.

### 1.3 Verify the facilitator is alive and speaks what you expect

```bash
curl -s --max-time 15 https://facilitator.goplausible.xyz/supported | head -c 600; echo
```

**Expected:** a JSON body listing supported payment kinds, including an `algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=` entry with the `exact` scheme. If this returns nothing, the priced half of your demo does not exist — see §5, the facilitator-outage row.

### 1.4 Fund both accounts — ALGO **and** USDC

Two accounts matter:

| Account | Needs | Why |
|---|---|---|
| **Operator** (`OPERATOR_ADDRESS` in `api/.env`, also the contract `admin`) | **ALGO only** | Signs `log_access`. Never handles USDC. |
| **Demo wallet** (generated in-browser, `sessionStorage`) | **ALGO** *(optional — the facilitator sponsors fees)* **and USDC** | Pays for endpoint calls; signs `grant_access`/`revoke_access` (those need ALGO for fees, and are **not** fee-sponsored). |

**Order of operations for the demo wallet — this order is not optional:**

1. Open the web app, let it generate the wallet, copy the address.
2. **ALGO first:** https://lora.algokit.io/testnet/fund — free email login, no wallet extension needed. Every legacy unauthenticated faucet is dead. Get at least 1 ALGO; consent transactions pay their own fees.
3. **Opt in to USDC ASA `10458941`.** The account must opt in before it can receive the asset. For the deployer account:
   ```bash
   cd /d/MedRail/contracts && .venv/Scripts/python.exe scripts/opt_in_usdc.py
   ```
   For the browser demo wallet there is no script — opt in by importing the mnemonic into a wallet and adding the asset, or (simpler and more reliable) **use the deployer account as your demo payer** and skip the browser wallet for the payment beat.
4. **USDC:** Lora's USDC option forwards to https://faucet.circle.com — select network **"Algorand Testnet"** specifically; it defaults to a different chain. Circle rate-limits per IP. Backup: https://testnet.folks.finance/faucet (needs a connected wallet plus a CAPTCHA — human-in-the-loop, cannot be scripted).
5. **Verify the USDC actually arrived** (the step people skip):
   ```bash
   curl -s "https://testnet-idx.algonode.cloud/v2/accounts/<DEMO_WALLET_ADDRESS>" \
   | python -c "
   import sys, json
   a = json.load(sys.stdin)['account']
   print('ALGO:', a['amount'])
   for asset in a.get('assets', []):
       if asset['asset-id'] == 10458941:
           print('USDC:', asset['amount'], '(need >= 70000 for one \$0.02 + one \$0.05 call)')
           break
   else:
       print('USDC: NOT OPTED IN — faucet sends will silently fail')
   "
   ```
   **Threshold:** ≥ 70,000 base units covers one $0.02 and one $0.05 call. Get 10× that. Faucets are the least reliable thing in this runbook, and the shortfall only surfaces mid-demo.

### 1.5 Verify the local stack builds and tests pass

```bash
cd /d/MedRail/contracts && .venv/Scripts/python.exe -m pytest tests/ -q     # expect 28 passed
cd /d/MedRail/api      && npx tsc --noEmit && npx vitest run                # expect 45 passed
cd /d/MedRail/web      && npx tsc --noEmit -p tsconfig.json && npm run build
```

**Expected:** 28 passed, 45 passed, both typechecks clean, web build succeeds. **73 total** — that is the number you quote on stage.

> **Note:** `api/test/x402-flow.spec.ts` makes a **live call to the facilitator at module import**. If the API suite fails with "no supported payment kinds loaded from any facilitator," that is §1.3 failing, not your code. Distinguish these before you start debugging.

### 1.6 Rehearse the two beats that changed

Both are scripts, both need funded keys, and both are worth running once the day before so you know their timing and their output on a real screen.

**The consent-gated composition** — this is Beat 6, and it is also how you generate fresh, dated evidence:

```bash
cd /d/MedRail/api && API_BASE=http://localhost:4021 npx tsx scripts/e2e-consent-proof.ts
```

Grants consent on-chain (if not already granted), makes the paid `$0.05` call, appends the audit entry, and writes `contracts/artifacts/e2e-consent-proof.json` with four explorer links. Costs $0.05 plus fees. Re-run §1.1 afterwards: `total_audit_entries` should have incremented.

**The attack demonstration** — this is Beat 7 in the 5-minute script, and the strongest fifteen seconds available to you:

```bash
cd /d/MedRail/api && API_BASE=http://localhost:4021 npx tsx scripts/verify-g01-fix.ts
```

Grants a *third party* consent, pays with a different key while asserting the third party's address, asserts the **403**, then runs a legitimate control call. Exits non-zero if either half fails, and writes `contracts/artifacts/g01-verification.json`. **It costs the payment for the control call only** — the attack's settlement is cancelled by the 4xx, so a refused attack is free.

> **Time it.** The script performs an on-chain grant before the attack, so it takes longer than a single API call — rehearse it so you know exactly how long you are talking over, and have Terminal C pre-typed rather than typing it live.

### 1.7 Rehearse both variants end to end, with the clock running

The 2-minute script has no slack. The commands in `Demo_Script.md` Beats 3 and 8 are long; **put them in your shell history in reverse order** so ↑ walks them forward, and confirm they are there after any terminal restart. Rehearse the tab-switch to the pre-loaded explorer (`Demo_Script.md` Beat 4 fallback) until it takes under three seconds and sounds planned.

---

## 2. T-1h

### 2.1 Re-verify what can have changed overnight

```bash
# Contract still there, counters as expected
curl -s https://testnet-idx.algonode.cloud/v2/applications/768743428 \
| python -c "import sys,json; a=json.load(sys.stdin)['application']; print('deleted:', a['deleted'])"

# Facilitator still alive
curl -s -o /dev/null -w "facilitator: %{http_code}\n" --max-time 15 https://facilitator.goplausible.xyz/supported

# AlgoNode responsive
curl -s -o /dev/null -w "algod: %{http_code} in %{time_total}s\n" --max-time 15 https://testnet-api.algonode.cloud/v2/status
```

**Expected:** `deleted: False`, `facilitator: 200`, `algod: 200` in well under a second. If algod takes >2s, expect slow consent beats and pre-load your fallback tabs.

### 2.2 Confirm balances have not been drained by rehearsal

Re-run the demo-wallet check from §1.4 step 5. Rehearsing burns USDC at $0.02–$0.07 per full run — ten rehearsals is $0.70, and a wallet that was fine yesterday can be empty today.

### 2.3 Start the stack

Three components, in this order. **Use absolute paths** so a wrong working directory cannot bite you on stage.

```bash
# Terminal A — API
cd /d/MedRail/api && npm run dev
```
Wait for the startup log. Then, in Terminal B:
```bash
curl -s http://localhost:4021/v1/health | python -m json.tool
```
**Expected:**
```json
{
    "ok": true,
    "service": "medrail-api",
    "network": "testnet",
    "consentAppId": 768743428,
    "time": "..."
}
```
**Three things must be true:** `network` is `testnet` (`api/fly.toml` now sets this correctly, so a container matches a local run), `consentAppId` is `768743428` (**not `null`** — null means `CONSENT_APP_ID` is unset and the `deploy_testnet.json` fallback did not resolve, and both `/v1/records/summary` and `/v1/consent/status` will fail), and `ok` is true.

> If the API refuses to start with a message about `PAY_TO_ADDRESS`, that is deliberate: `config.ts::assertPayToConfigured()` runs at boot and refuses to launch without a checksum-valid pay-to address. Set it in `api/.env` and restart. A loud failure at boot is the intended behaviour — the alternative was a service that started fine and failed on the first paid call.

```bash
# Terminal C — Web
cd /d/MedRail/web && npm run dev
```
Open http://localhost:3000. The network badge must resolve to a live reading, not an error state — it polls `/v1/health`, so a red badge means the API is not reachable from the browser (CORS or wrong `NEXT_PUBLIC_API_BASE`).

### 2.4 Smoke-test the priced path without spending money

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4021/v1/triage \
  -H "content-type: application/json" -d '{"symptoms":"chest pain"}'
```
**Expected:** `402`. If it returns **503**, the facilitator is unreachable — go to §5. If it returns **429**, you have tripped the rate limiter by smoke-testing too enthusiastically; wait out the `Retry-After` and note that only the free and refundable surface is throttled (`/v1/consent/status` 60/min, `/v1/consent/arc56` and `/v1/records/summary` 30/min), never `/v1/triage`. If it returns **200**, payment middleware is not applied and something is badly wrong with the build.

### 2.5 Smoke-test the consent read

```bash
curl -s "http://localhost:4021/v1/consent/status?patient=<ADDR>&requester=<ADDR>&scope=records:summary" | python -m json.tool
```
Use any valid 58-character TestNet address for both. **Expected:** a 200 with `{"patient":...,"requester":...,"scope":"records:summary","granted":false}` (or `true` if you granted during rehearsal). Reviewer-measured cold latency: **505 ms** — two sequential algod round-trips. Budget for that pause in the demo; do not talk over it, talk *through* it.

> If this returns **400** with `{"error":"invalid request","details":{...}}` naming a checksum failure, you used a malformed address — retype it. This used to be a 500 that echoed the internal exception text (finding R-3); `api/src/validation.ts` now validates by checksum with `algosdk.isValidAddress`, so a bad address is a client error reported as one. If you *do* see a 500, its body is a generic `INTERNAL_ERROR` carrying a `requestId` — quote that id when you look in the API log, because the detail is server-side only now.

### 2.6 Pre-load every browser tab

Per `Demo_Script.md` §Setup. All eight, including Terminal C with `verify-g01-fix.ts` typed but **not run**. Loaded, scrolled to position, and **left alone**. The pre-loaded explorer tabs are your entire Wi-Fi-failure insurance policy.

### 2.7 Save static evidence locally

```bash
cat /d/MedRail/contracts/artifacts/e2e-proof.json
cat /d/MedRail/contracts/artifacts/e2e-consent-proof.json
cat /d/MedRail/contracts/artifacts/g01-verification.json
```
Open all three in the editor as tab 7 and leave them open. If the network dies completely, these files plus the pre-loaded explorer pages are the demo — and between them they carry a settled payment, a full grant → pay → audit sequence with four explorer links, and a recorded impersonation attempt with `"blocked": true` and `"result": "CLOSED"`.

---

## 3. T-5min

Fast, no debugging. If something is broken here, you switch scripts — you do not fix.

| # | Check | Command / action | Pass |
|---|---|---|---|
| 1 | API alive | `curl -s http://localhost:4021/v1/health` | `ok:true`, `consentAppId:768743428`, `network:testnet` |
| 2 | Facilitator alive | `curl -s -o /dev/null -w "%{http_code}\n" --max-time 10 https://facilitator.goplausible.xyz/supported` | `200` |
| 3 | Priced route returns 402 | `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4021/v1/triage -H "content-type: application/json" -d '{"symptoms":"chest pain"}'` | `402` (**not** 503) |
| 4 | Web app loads | Refresh tab 3 | Network badge live, not error |
| 5 | Demo wallet has USDC | Look at the wallet card in the UI | Non-zero USDC balance shown |
| 6 | Demo wallet has ALGO | Same card | ≥ 0.1 ALGO spendable — consent transactions are **not** fee-sponsored (§0.3) |
| 7 | Indexer responsive | `curl -s -o /dev/null -w "%{time_total}s\n" https://testnet-idx.algonode.cloud/v2/applications/768743428` | < 1s |
| 8 | Commands in history | ↑↑↑ in Terminal B | Beat 3 and Beat 8 commands walk forward |
| 9 | Attack script pre-typed | Glance at Terminal C | `verify-g01-fix.ts` command on the prompt, **unrun** |
| 10 | Fallback tabs loaded | Glance at tabs 4, 5, 7 | Rendered, not spinners |

**If check 3 fails, run the facilitator-outage script from §5 immediately.** Do not spend the five minutes debugging — you will lose them and start flustered.

---

## 4. Start-up command reference

Copy-paste, absolute paths, no `cd` dependencies.

```bash
# ── 1. API (Terminal A) ────────────────────────────────────────────
cd /d/MedRail/api && npm run dev
#    listens on :4021; reads api/.env
#    REQUIRED: CONSENT_APP_ID=768743428, OPERATOR_MNEMONIC=<operator>
#    Optional: PAY_TO_ADDRESS (defaults to OPERATOR_ADDRESS)
#    Verify:  curl -s http://localhost:4021/v1/health | python -m json.tool

# ── 2. Web (Terminal C) ────────────────────────────────────────────
cd /d/MedRail/web && npm run dev
#    listens on :3000; reads web/.env.local
#    REQUIRED: NEXT_PUBLIC_API_BASE=http://localhost:4021
#              NEXT_PUBLIC_NETWORK=testnet

# ── 3. Terminal B — left empty for live commands ───────────────────

# ── Optional: re-prove the payment path before you start ───────────
cd /d/MedRail/api && npx tsx scripts/e2e-proof.ts
#    Costs $0.02. Needs PROOF_MNEMONIC (or contracts/.env DEPLOYER_MNEMONIC)
#    on a TestNet account holding ALGO *and* USDC, opted in to ASA 10458941.
#    Rewrites contracts/artifacts/e2e-proof.json with a fresh settled tx id.
#    Worth doing at T-1h: a fresh transaction id dated today is better
#    evidence than one from two weeks ago.

# ── Optional: re-prove the consent-gated composition ───────────────
cd /d/MedRail/api && API_BASE=http://localhost:4021 npx tsx scripts/e2e-consent-proof.ts
#    Costs $0.05 plus fees. Grant -> free consent check -> paid call ->
#    on-chain audit append, in one run, printing four Lora links.
#    Rewrites contracts/artifacts/e2e-consent-proof.json and increments
#    total_audit_entries. This is Beat 6, runnable from a terminal.

# ── Optional: re-prove the payer-binding control (Beat 7) ──────────
cd /d/MedRail/api && API_BASE=http://localhost:4021 npx tsx scripts/verify-g01-fix.ts
#    Grants a THIRD PARTY consent, then pays with a different key while
#    asserting that third party's address -> expects 403. Then a control
#    call with a matching identity -> expects 200 + an audit tx.
#    Exits non-zero if either half fails. Writes
#    contracts/artifacts/g01-verification.json.
#    The refused attack is free (a 4xx cancels settlement); only the
#    control call costs $0.05.

# ── Optional: re-prove the consent lifecycle ───────────────────────
cd /d/MedRail/contracts && .venv/Scripts/python.exe scripts/exercise_contract.py
#    Funds two throwaway accounts from the deployer (~2 ALGO), runs
#    request -> grant -> check(True) -> revoke -> check(False), prints
#    every tx id. Increments total_requests and total_revocations.
#    NOTE: creates a new grant box (+22,500 uALGO app min-balance).
```

**Shutdown order after the demo:** web, then API. Nothing persists locally — there is no database, cache, or queue in this system — so there is nothing to clean up beyond the processes.

---

## 5. Failure-mode table

Detection, immediate fallback, and the exact words. Keep this page open on a second device.

### Facilitator unreachable → priced routes return HTTP 503 + `Retry-After`

| | |
|---|---|
| **Detection** | T-5min check 3 returns `503` instead of `402`, with a `Retry-After: 30` header and body `{"error":{"code":"PAYMENT_FACILITATOR_UNAVAILABLE","retryable":true,"facilitator":"…"}}`. On stage: Beat 2 shows 503. API logs carry a structured `facilitator_unavailable` event. |
| **Why** | `accepts[].asset` and `extra.feePayer` come from the facilitator's `/supported`, not MedRail config (`api/src/x402.ts:16-32`). Without it the 402 cannot be constructed at all — that part is structural and unfixable from our side. What *is* fixed is the answer: `api/src/app.ts:69-105` catches exactly this initialisation failure and converts it, re-throwing every other error untouched. Free routes are unaffected (`REL-005` **VALIDATED**). Formerly finding R-1, now closed. |
| **Fallback** | Skip Beats 2, 3, 4, 6 entirely. Run **Beat 8** (indexer read) first, then switch to tab 5 — the pre-loaded settled payment — and tab 4. Demo the consent lifecycle (Beat 5), which touches Algorand directly and does not need the facilitator at all. |
| **Say** | *"Our facilitator's unreachable right now, and it takes the priced routes with it — the asset id and fee-payer address come from its `/supported` endpoint, so we genuinely can't build a 402 offline. But look at what we return: a 503 with a `Retry-After` and `retryable: true`, not a 500. Our callers are agents; the difference between 'come back in thirty seconds' and 'this endpoint is dead' is the difference between a retry and a permanent delisting. The free consent layer is untouched, which is the part that talks straight to Algorand. And here's a payment that settled through that facilitator, on the public ledger, with a transaction id you can check."* |
| **Note** | This is the rare failure mode that makes you look *better*. Do not skip past the 503 — decode it on screen. |

### Demo wallet has no USDC → signed-but-unsettled 402

| | |
|---|---|
| **Detection** | Beat 4 shows `HTTP 402` instead of 200. The UI renders its own explanation. |
| **Why** | The client constructed and signed a real transaction group; the facilitator refused settlement because the payer holds no USDC. This is the *correct* behaviour, not a crash. |
| **Fallback** | **The frontend already handles this and explains it** — `web/components/LiveDemoPanel.tsx:165-170` renders: *"A real payment was constructed and signed by your demo wallet, but settlement was rejected — almost always because the wallet has no TestNet USDC yet."* Point at that text. Then tab 5. |
| **Say** | *"That's the honest failure mode, and the UI says exactly what happened: a real Algorand transaction group was constructed and signed in the browser, and settlement was refused because the wallet's out of test USDC. The signing worked; the money wasn't there. Here's one from earlier that did settle."* |
| **Note** | Most common root cause is a **missing USDC opt-in**, not an empty faucet. See §0.1. |

### AlgoNode slow or unreachable

| | |
|---|---|
| **Detection** | Beat 5 (consent grant/revoke) or Beat 8 (indexer read) hangs >10s. T-1h §2.1 showed algod >2s. |
| **Why** | `api/src/services/algorand.ts:5` — `new algosdk.Algodv2("", config.algodServer, "")`. No timeout, no retry, no circuit breaker (finding R-4). `atc.execute(algod, 4)` waits four rounds (~14s) then throws. |
| **Fallback** | Tabs 4 and 5 are pre-loaded with exactly this data. Use them. Do not retry more than once. |
| **Say** | *"Public node's lagging — and I'll be straight with you, we have no timeout or retry on that path, which is on our list. These pages are the same data, loaded a few minutes ago, straight from the indexer."* |

### `txn dead: round X outside of Y--Z`

| | |
|---|---|
| **Detection** | Consent grant or revoke errors in the UI with this message. |
| **Why** | Transaction validity-window timeout from sequential network round-trips — the transaction was built against round N and submitted after the window closed. **Not a logic bug.** `contracts/scripts/exercise_contract.py` sets `validity_window=1000` on every call for exactly this reason (`exercise_contract.py:80`, `:90`, `:100`, `:111`, `:121`). |
| **Fallback** | Retry once. If it fails twice, move on — do not retry a third time on stage. |
| **Say** | *"Validity-window timeout — the transaction was built against one round and submitted after that window closed. Not a logic bug; our scripts set a wide validity window for exactly this. Let me try once more."* |

### Venue Wi-Fi failure

| | |
|---|---|
| **Detection** | Everything hangs simultaneously. |
| **Fallback** | Tabs 4 (app on Lora), 5 (settled payment on Lora), and 7 (`contracts/artifacts/e2e-proof.json`) — all pre-loaded and local. The editor tabs (`records.ts`, `contract.py`) need no network at all, so the code-walkthrough beats (5-minute Beats 3b, 5b) still work perfectly. |
| **Say** | *"Wi-Fi's gone. I'll show you what I captured this morning — and every one of these has a transaction id you can check yourself on any indexer, later, without me. That's rather the point of the whole design."* |
| **Note** | This is the failure mode your architecture is *best* at surviving. Everything is on a public ledger; a judge with a phone can verify the entire submission on their own connection. Say that. |

### API not running / crashed

| | |
|---|---|
| **Detection** | `curl` returns connection refused; the web app's network badge is red. |
| **Fallback** | Terminal A: `cd /d/MedRail/api && npm run dev`. Boots in a few seconds. |
| **Say** | Keep talking through Beat 1's content while it boots. **Never watch a spinner in silence.** |

### `consentAppId` reads `null` in `/v1/health`

| | |
|---|---|
| **Detection** | Health check returns `"consentAppId": null`. |
| **Why** | `CONSENT_APP_ID` unset **and** `contracts/artifacts/deploy_testnet.json` not resolvable from the working directory (`api/src/config.ts`). In a container the fallback cannot work at all — the file is not copied into the image, which is why `api/fly.toml` now sets `CONSENT_APP_ID = "768743428"` explicitly in `[env]`. |
| **Fallback** | Set `CONSENT_APP_ID=768743428` in `api/.env` and restart. Ten seconds. |
| **Consequence if missed** | `requireConsentAppId()` throws → both `/v1/records/summary` and `/v1/consent/status` fail. Beats 5, 6 and 7 die. |

### A judge types a negation or garbage input into the demo

| | |
|---|---|
| **Detection** | `I have no chest pain` → `score: 35`, `band: "urgent"`. Or `a, b` in the medications field → 5 severe matches. Both measured 2026-08-21. |
| **Fallback** | None — and none needed. These are known, measured limitations. Own them in one breath. |
| **Say** | *"Thirty-five, urgent — substring matching has no notion of negation. That's the cost of picking rules you can audit over a model you can't, it's a screening trigger rather than a diagnosis, and it's why every response ships a disclaimer a unit test enforces. It's on the fix list as G-26."* **Do not act surprised.** See `Demo_Script.md` Beat 7b for the pre-emptive version, which is strictly better. |

### The audit write comes back `pending`

| | |
|---|---|
| **Detection** | Beat 6 returns **HTTP 200** with the record present, but `auditStatus: "pending"` and `auditTxId: null`. Terminal A shows a structured `audit_write_failed` JSON line. |
| **Why** | The on-chain append failed — almost always the operator account out of ALGO, occasionally an algod 5xx or a validity-window expiry. The route deliberately does **not** let this turn a legitimate paid request into an error (`records.ts:76-100`). |
| **Fallback** | None needed on stage; the call succeeded. Fund the operator account before the next run. |
| **Say** | *"There's the flag — `auditStatus: pending`. The record still came back, because a chain hiccup shouldn't cost you something you paid for, and we log the failure server-side with the settlement so it's reconcilable. And you can't be charged for a failure anyway: x402 settles only on a sub-400 response."* |
| **Note** | This is a good answer, not a save. It demonstrates a designed failure path rather than an accident — but check the operator balance afterwards, because the second occurrence is not a talking point. |

### A judge asks whether the deployed contract has the contract fixes in it

| | |
|---|---|
| **Detection** | *"Your repo says you fixed the event field order. Is that live?"* |
| **Fallback** | None needed. Answer completely and immediately. |
| **Say** | *"No, deliberately. Our deploy script uses `OnUpdate.AppendApp`, which mints a new application — redeploying would give us a new App ID and abandon everything I just showed you: the consent lifecycle, the settled payments, five audit entries. Both defects are non-exploitable, both are fixed in `contract.py`, and there are three regression tests we ran against the old code first to watch them fail. The fixed source is what ships to MainNet."* |
| **Note** | **A hedged answer here is worse than the full one.** See §1.1. |

---

## 6. Pre-recorded fallback — recommended

**Record a 2-minute screen capture of a clean run, and have it on the presenting machine as a local file.** Not in the cloud. Not on a USB stick you have to find.

**Why this is worth the twenty minutes.** Your demo depends on four things you do not control: the venue's network, AlgoNode, `facilitator.goplausible.xyz`, and TestNet block production. A facilitator outage still removes four of your eight beats, however politely the 503 explains itself. A recording converts a catastrophic failure into a ten-second apology.

**What to record.** The full 2-minute script — 402 decode, settled payment, explorer click-through, consent grant → check → revoke, audit write, indexer read — **plus one run of `verify-g01-fix.ts`**, which is the beat you least want to lose and the one most dependent on a working network. Capture the terminal at presentation font size. Speak the actual script over it so you can play it muted and narrate live if you prefer.

**How to use it.** Only after a live attempt has visibly failed. Never lead with it. Say:

> *"Live infrastructure is being live infrastructure — here's the same run from this morning, and every transaction id in it is on the public ledger, so you can check the whole thing yourself without taking my word for any of it."*

That last clause is what makes a recording acceptable to a skeptical judge: your evidence is independently verifiable, so the recording is a *convenience*, not the proof. Most teams' recordings are the proof. Yours is not, and saying so out loud is worth more than the recording itself.

**Also keep, as a static tier below the video:**
- `contracts/artifacts/e2e-proof.json` — the settled transaction id, on disk.
- `contracts/artifacts/e2e-consent-proof.json` — grant, payment and audit transaction ids from one consent-gated run.
- `contracts/artifacts/g01-verification.json` — the recorded impersonation attempt, `"blocked": true`, `"result": "CLOSED"`.
- The four consent-lifecycle transaction ids from `docs/PROOF.md` §5.
- A screenshot of the indexer global-state read showing `total_audit_entries = 5`.

---

## 7. Post-demo verification

Do this within ten minutes of finishing, while the terminal is still open. It converts a demo into evidence.

### 7.1 Capture every transaction the demo produced

```bash
curl -s "https://testnet-idx.algonode.cloud/v2/accounts/<DEMO_WALLET_ADDRESS>/transactions?limit=20" \
| python -c "
import sys, json
for t in json.load(sys.stdin)['transactions']:
    print(t['confirmed-round'], t['tx-type'], t['id'])
"
```

Save the output. Every `appl` is a consent transaction; every `axfer` is a payment. These are now part of your evidence trail.

### 7.2 Confirm the audit counter moved

```bash
curl -s https://testnet-idx.algonode.cloud/v2/applications/768743428 | python -c "
import sys, json, base64
for kv in json.load(sys.stdin)['application']['params']['global-state']:
    k = base64.b64decode(kv['key']).decode()
    if k == 'total_audit_entries':
        print('total_audit_entries =', kv['value']['uint'])
"
```

If you ran Beat 6 successfully this should have incremented past 5. **If it did not increment but the endpoint returned 200, check the response body for `auditStatus: "pending"`** — the success-path `logAccess` is guarded (`api/src/routes/records.ts:76-100`), so a chain failure returns the record with a null `auditTxId` and an explicit flag rather than an error. Grep Terminal A for `audit_write_failed`; the usual cause is the operator account out of ALGO. The caller was never charged for that call either way, because settlement only occurs on a sub-400 response.

### 7.3 Confirm box growth

```bash
curl -s https://testnet-idx.algonode.cloud/v2/applications/768743428/boxes
```

Boxes beginning `Z…` in base64 are `g`-prefixed grant boxes; `Yd…` are `a`-prefixed audit entries; `c…` is the `s`-prefixed per-patient sequence box. Before the demo there were **12**: 6 grant, 5 audit, 1 sequence. A successful audit write adds one `a` box (and the first write for a new patient also adds their `s` box); a new grant adds one `g`.

### 7.4 Update the evidence log

Add every new transaction id to `docs/PROOF.md` — and prioritise one kind above all others: **a payment made by a wallet that is not the project's own.** That is the single materially better answer to *"has anyone else ever paid for this?"* (`Winning_Strategy.md` M11), and a live demo in front of an audience is the most likely place it will ever happen by accident. If anyone in the room pays, get the transaction id before they leave. A demo that generates fresh, checkable, dated evidence is worth more afterwards than during.

### 7.5 Check balances before the next run

Re-run §1.4 step 5. A full demo run costs $0.02–$0.07 in USDC plus ALGO fees on two consent transactions. Top up before you rehearse again.

### 7.6 Write down every question you were asked

Particularly ones you answered badly. `Winning_Strategy.md` §5 and `Pitch_Architecture.md` §5 are the places to fold them back in. The questions a real judge asks are better data than any amount of self-review.
