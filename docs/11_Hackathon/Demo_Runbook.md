# MedRail — Demo Runbook


> **⚠ Correction notice.** Parts of this document were written against a review finding that was
> later proven wrong. Settlement in x402 v2 happens **only** on a sub-400 response, so **no error
> path in MedRail can consume a settled payment** — and consent-denied calls (HTTP 403) are **not
> charged**, contrary to `API.md`, `SECURITY.md`, and the `paidButDenied` field. The audit-sequence
> race causes a **rejected transaction**, not a corrupted log. See
> [`CORRECTIONS.md`](../CORRECTIONS.md) — it supersedes any statement here that contradicts it.

**Purpose:** the operational procedure for running the MedRail demo without failing on stage — pre-flight checks at T-24h / T-1h / T-5min, exact start-up sequence, and a failure-mode table with detection, fallback, and the exact words to say.

**Status of this document:** Operational runbook, 2026-08-21. Every verification command below was executed against live public infrastructure during authoring and produced the stated output, except those marked ⚠ which depend on local state (a running API, a funded wallet). Assumes TestNet only — no MainNet, public hosting, Bazaar listing, or leaderboard presence is involved. Companion to [`Demo_Script.md`](Demo_Script.md), which contains the beats and the words; this document contains everything that has to be true before those work.

Related: [`Judge_Evaluation.md`](Judge_Evaluation.md), [`Winning_Strategy.md`](Winning_Strategy.md), [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md).

---

## 0. The three facts that break demos

Read these before the checklist. Everything else is detail.

1. **An Algorand account cannot receive an ASA it has not opted in to.** This is a protocol rule, not an app quirk. Your demo wallet must opt in to USDC ASA `10458941` *before* any faucet send will land. Miss this and the faucet appears to work, the balance stays zero, and you find out on stage. `contracts/scripts/opt_in_usdc.py` does it for the deployer; the browser demo wallet needs its own opt-in.
2. **The 402 cannot be constructed offline.** `accepts[].asset` and `extra.feePayer` come from the facilitator's `/supported`, fetched at initialisation — not from MedRail config (`api/src/x402.ts:16-32` deliberately omits `asset`). If `facilitator.goplausible.xyz` is unreachable, **every priced route returns HTTP 500 with no `PAYMENT-REQUIRED` header** (finding R-1). Check it at T-5min, not T-24h.
3. **`log_access` has never run on TestNet** (finding E-1). `total_audit_entries = 0`; zero audit boxes exist. If you have not closed this (`Winning_Strategy.md` M2), Beat 6 of the demo is not demonstrable and you must use the fallback line. **Verify at T-24h so you know which script you are running.**

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
total_audit_entries    = 0
total_grants_active    = 0
```

- `deleted: False` — **must** be false. If it is true the demo has no contract and you are rebuilding, not rehearsing.
- `total_audit_entries` — **if this is 0, E-1 is open.** Close it today (§1.6) or commit to the fallback script.

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
min-balance: 145000 uALGO
headroom   : 4855000 uALGO
boxes      : 2 / 100 bytes
```

**Threshold:** headroom must exceed ~50,000 µALGO to create the two new boxes an audit write needs (one `s`, one `a`). 4.85 ALGO is ample. If headroom ever drops below ~200,000 µALGO, top up via `fund_mbr` before the demo.

> **Known defect, worth knowing but not fixing today:** the contract's own `get_grant_box_mbr()` returns **22,100** µALGO per grant box (`contract.py:52` computes `400 * (32 + 17)`), while the true cost is **22,500** — the effective box key includes the 1-byte `"g"` prefix. The on-chain numbers above confirm it: 145,000 − 100,000 base = 45,000 = 2 × 22,500. Finding C-2. It under-quotes by 1.8%; it will not break this demo. **Do not redeploy to fix it** — a new App ID destroys every transaction id in your evidence log.

### 1.3 Verify the facilitator is alive and speaks what you expect

```bash
curl -s --max-time 15 https://facilitator.goplausible.xyz/supported | head -c 600; echo
```

**Expected:** a JSON body listing supported payment kinds, including an `algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=` entry with the `exact` scheme. If this returns nothing, the priced half of your demo does not exist — see §5, R-1.

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
cd /d/MedRail/contracts && .venv/Scripts/python.exe -m pytest tests/ -q     # expect 14 passed
cd /d/MedRail/api      && npx tsc --noEmit && npx vitest run                # expect 18 passed
cd /d/MedRail/web      && npx tsc --noEmit -p tsconfig.json && npm run build
```

**Expected:** 14 passed (~0.4s), 18 passed (~4s), both typechecks clean, web build succeeds.

> **Note:** `api/test/x402-flow.spec.ts` makes a **live call to the facilitator at module import**. If the API suite fails with "no supported payment kinds loaded from any facilitator," that is §1.3 failing, not your code. Distinguish these before you start debugging.

### 1.6 ⚠ Close E-1 if it is still open

If §1.1 showed `total_audit_entries = 0`, do this today. Full procedure in `Winning_Strategy.md` M2; the short version:

1. Operator account funded with ALGO (§1.4).
2. `CONSENT_APP_ID=768743428` and `OPERATOR_MNEMONIC` set in `api/.env`.
3. Start the API; in the web app click **Grant myself access**.
4. Select **Consent-gated record summary**, blank patient field, pay $0.05.
5. Re-run §1.1 — `total_audit_entries` should read `1`.
6. Record the `auditTxId` in `docs/PROOF.md` and in `Demo_Script.md` Beat 6.

**Do `Winning_Strategy.md` M1 (payer↔requester binding) first** so the first audit entry ever written on-chain is a correctly-attributed one.

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
**Three things must be true:** `network` is `testnet` (not `mainnet` — `api/fly.toml:10` defaults to mainnet, finding D-2; if you are running a container, check this), `consentAppId` is `768743428` (**not `null`** — null means `CONSENT_APP_ID` is unset and the `deploy_testnet.json` fallback did not resolve, finding D-1, and both `/v1/records/summary` and `/v1/consent/status` will 500), and `ok` is true.

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
**Expected:** `402`. If it returns **500**, the facilitator is unreachable and initialisation failed (R-1) — go to §5. If it returns **200**, payment middleware is not applied and something is badly wrong with the build.

### 2.5 Smoke-test the consent read

```bash
curl -s "http://localhost:4021/v1/consent/status?patient=<ADDR>&requester=<ADDR>&scope=records:summary" | python -m json.tool
```
Use any valid 58-character TestNet address for both. **Expected:** a 200 with `{"patient":...,"requester":...,"scope":"records:summary","granted":false}` (or `true` if you granted during rehearsal). Reviewer-measured cold latency: **505 ms** — two sequential algod round-trips. Budget for that pause in the demo; do not talk over it, talk *through* it.

> If this returns **500** with `{"error":"wrong checksum for address"}`, you used a malformed address. That is finding R-3 — zod validates length only (`consent.ts:6-10`), so a 58-character non-address reaches `algosdk.decodeAddress` and throws, and `app.ts:60` echoes the internal message. It is a real defect; here it just means retype the address.

### 2.6 Pre-load every browser tab

Per `Demo_Script.md` §Setup. All seven. Loaded, scrolled to position, and **left alone**. The pre-loaded explorer tabs are your entire Wi-Fi-failure insurance policy.

### 2.7 Save static evidence locally

```bash
cat /d/MedRail/contracts/artifacts/e2e-proof.json
```
Open it in the editor as tab 7 and leave it open. If the network dies completely, this file plus the pre-loaded explorer pages are the demo.

---

## 3. T-5min

Fast, no debugging. If something is broken here, you switch scripts — you do not fix.

| # | Check | Command / action | Pass |
|---|---|---|---|
| 1 | API alive | `curl -s http://localhost:4021/v1/health` | `ok:true`, `consentAppId:768743428`, `network:testnet` |
| 2 | Facilitator alive | `curl -s -o /dev/null -w "%{http_code}\n" --max-time 10 https://facilitator.goplausible.xyz/supported` | `200` |
| 3 | Priced route returns 402 | `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4021/v1/triage -H "content-type: application/json" -d '{"symptoms":"chest pain"}'` | `402` (**not** 500) |
| 4 | Web app loads | Refresh tab 3 | Network badge live, not error |
| 5 | Demo wallet has USDC | Look at the wallet card in the UI | Non-zero USDC balance shown |
| 6 | Indexer responsive | `curl -s -o /dev/null -w "%{time_total}s\n" https://testnet-idx.algonode.cloud/v2/applications/768743428` | < 1s |
| 7 | Commands in history | ↑↑↑ in Terminal B | Beat 3 and Beat 8 commands walk forward |
| 8 | Fallback tabs loaded | Glance at tabs 4, 5, 7 | Rendered, not spinners |
| 9 | E-1 status known | You already know from §1.1 | You know which Beat 6 script you're running |

**If check 3 fails, run the R-1 script from §5 immediately.** Do not spend the five minutes debugging — you will lose them and start flustered.

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

### R-1 — Facilitator unreachable → priced routes return HTTP 500

| | |
|---|---|
| **Detection** | T-5min check 3 returns `500` instead of `402`. On stage: Beat 2 shows 500. API logs show `"Failed to initialize: no supported payment kinds loaded from any facilitator."` |
| **Why** | `accepts[].asset` and `extra.feePayer` come from the facilitator's `/supported`, not MedRail config (`api/src/x402.ts:16-32`). Without it, the 402 cannot be constructed. There is no timeout, retry, circuit breaker, or cached fallback. Free routes are unaffected (`REL-005` **VALIDATED**). |
| **Fallback** | Skip Beats 2, 3, 4, 6 entirely. Run **Beat 8** (indexer read) first, then switch to tab 5 — the pre-loaded settled payment — and tab 4. Demo the consent lifecycle (Beat 5), which touches Algorand directly and does not need the facilitator at all. |
| **Say** | *"Our facilitator's unreachable right now, and it takes the priced routes with it — a reliability gap we've documented, because the asset id and fee-payer address come from its `/supported` endpoint, so we literally can't build a 402 offline. The free consent layer is untouched, which is the part that talks straight to Algorand. And here's a payment that settled through that facilitator, on the public ledger, with a transaction id you can check."* |

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
| **Why** | `CONSENT_APP_ID` unset **and** `contracts/artifacts/deploy_testnet.json` not resolvable from the working directory (`api/src/config.ts:31-40`, `:56`). In a container this fallback cannot work at all — the file is not copied into the image (finding D-1). |
| **Fallback** | Set `CONSENT_APP_ID=768743428` in `api/.env` and restart. Ten seconds. |
| **Consequence if missed** | `requireConsentAppId()` throws → both `/v1/records/summary` and `/v1/consent/status` return HTTP 500. Beats 5 and 6 die. |

### A judge types a negation or garbage input into the demo

| | |
|---|---|
| **Detection** | `I have no chest pain` → `score: 35`, `band: "urgent"`. Or `a, b` in the medications field → 5 severe matches. Both measured 2026-08-21. |
| **Fallback** | None — and none needed. These are known, measured limitations. Own them in one breath. |
| **Say** | *"Thirty-five, urgent — substring matching has no notion of negation. That's the cost of picking rules you can audit over a model you can't, it's a screening trigger rather than a diagnosis, and it's why every response ships a disclaimer a unit test enforces. It's on the fix list."* **Do not act surprised.** See `Demo_Script.md` Beat 7b for the pre-emptive version, which is strictly better. |

---

## 6. Pre-recorded fallback — recommended

**Record a 2-minute screen capture of a clean run, and have it on the presenting machine as a local file.** Not in the cloud. Not on a USB stick you have to find.

**Why this is worth the twenty minutes.** Your demo depends on four things you do not control: the venue's network, AlgoNode, `facilitator.goplausible.xyz`, and TestNet block production. R-1 alone means one third-party outage removes four of your eight beats. A recording converts a catastrophic failure into a ten-second apology.

**What to record.** The full 2-minute script — 402 decode, settled payment, explorer click-through, consent grant → check → revoke, audit write (only if E-1 is closed), indexer read. Capture the terminal at presentation font size. Speak the actual script over it so you can play it muted and narrate live if you prefer.

**How to use it.** Only after a live attempt has visibly failed. Never lead with it. Say:

> *"Live infrastructure is being live infrastructure — here's the same run from this morning, and every transaction id in it is on the public ledger, so you can check the whole thing yourself without taking my word for any of it."*

That last clause is what makes a recording acceptable to a skeptical judge: your evidence is independently verifiable, so the recording is a *convenience*, not the proof. Most teams' recordings are the proof. Yours is not, and saying so out loud is worth more than the recording itself.

**Also keep, as a static tier below the video:**
- `contracts/artifacts/e2e-proof.json` — the settled transaction id, on disk.
- The four consent-lifecycle transaction ids from `docs/PROOF.md` §5.
- A screenshot of the indexer global-state read.

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

If you ran Beat 6 successfully this should have incremented. **If it did not increment but the endpoint returned 200, you have hit finding R-2** — the success-path `logAccess` at `api/src/routes/records.ts:49` is unguarded, so a failure there produces a 500 *after* the payment settled. Check the API logs. This is a genuine defect and a post-demo increment check is how you catch it.

### 7.3 Confirm box growth

```bash
curl -s https://testnet-idx.algonode.cloud/v2/applications/768743428/boxes
```

Boxes beginning `Zx`/`Z3` in base64 are `g`-prefixed grant boxes; a successful audit write adds one `s`-prefixed and one `a`-prefixed box. Before the demo there were exactly **2**, both `g`.

### 7.4 Update the evidence log

Add any new transaction ids to `docs/PROOF.md` — especially a first `log_access` transaction (closes E-1) or a payment made by someone other than the deployer (a materially better answer to *"has anyone else ever paid for this?"* — `Winning_Strategy.md` H1). A demo that generates fresh, checkable, dated evidence is worth more afterwards than during.

### 7.5 Check balances before the next run

Re-run §1.4 step 5. A full demo run costs $0.02–$0.07 in USDC plus ALGO fees on two consent transactions. Top up before you rehearse again.

### 7.6 Write down every question you were asked

Particularly ones you answered badly. `Winning_Strategy.md` §5 and `Pitch_Architecture.md` §5 are the places to fold them back in. The questions a real judge asks are better data than any amount of self-review.
