# MedRail — Demo Script

**Purpose:** two rehearsable demo variants (2 minutes and 5 minutes) that show engineering rather than screens — real artefacts, exact commands, exact expected outputs, and the precise sentence to say at each beat.

**Status of this document:** Demo script, 2026-08-21. Every command below was executed against live public infrastructure and produced the stated output. All addresses, transaction ids, rounds and amounts are real TestNet values. No MainNet, public hosting, Bazaar listing, or leaderboard presence is claimed anywhere in this demo.

Companion documents: [`Demo_Video_Script.md`](Demo_Video_Script.md) (the ≤3-minute submission video — a different medium with a different shot list; **do not merge the two**, and rehearse this one first because the video is a cut-down of it), [`Demo_Runbook.md`](Demo_Runbook.md) (pre-flight and failure modes), [`Judge_Evaluation.md`](Judge_Evaluation.md), [`Winning_Strategy.md`](Winning_Strategy.md), [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md).

---

## What changed, and why the demo is now a different demo

The organisers said it plainly: **x402 is not a human-to-machine service, it is machine-to-machine.** The question behind the challenge is *"what service would an AI agent need, and can I build it so the agent can discover it, use it, and pay for it?"*

MedRail's architecture always answered that. **The demo did not.** The previous version of this script led with a browser, a button, and a human clicking "Pay $0.02" — which demonstrates the wrong protocol relationship no matter how real the payment underneath it is. A judge watching a person click a pay button is watching human-to-machine.

**`api/scripts/agent-demo.ts` is now the centrepiece of both variants.** A clinical triage agent with no MedRail account, no API key and no prior relationship reads `GET /`, learns the catalogue, decides which services the case needs, checks the free consent oracle *before* spending on the gated endpoint, pays for what it uses, and reports what it spent. Nothing about MedRail is hardcoded in it except the base URL. One run: **$0.09, three settled Algorand transactions, no human in the loop.**

The security beat — **`api/scripts/verify-g01-fix.ts`, a real impersonation attack refused with a 403** — sits immediately after it, because payer binding is what makes a paid call an *access control* rather than a paywall, and it is the beat almost no competing entry will have.

**The browser is now a supporting shot, not the lead.** It shows the patient half of the protocol: grant and revoke signed client-side, backend never touching a key. That is worth ten seconds in the 5-minute version and zero in the 2-minute version.

**Rehearse in this order:** `agent-demo.ts`, then `verify-g01-fix.ts`, then everything else. Those two carry the submission.

**Two things to say before anyone asks, in this order.** First the strong half: **the agent pays from its own keypair** — `UYBTLPHS…`, which this service does not hold — to the `payTo` address `2WDV2J2F…`, and the patient who allowed it is a *third* account again, `56LFG5EE…`, which signed the grant itself (`IG4XEBTM…`) and is neither the payer nor the payee. Sender ≠ receiver on the indexer; three roles, three accounts, three keypairs. Then the weak half: **we funded both those wallets.** Their TestNet balances came from the project's own account, because TestNet ALGO and USDC have no other practical source, so **no external or unrelated party has paid for this service.** Beat 5 in the 5-minute version delivers both, in that order — and the order matters, because volunteering the strong half first is what makes the weak half read as rigour rather than as a concession.

---

## Setup — what to have open, in which tab

Arrange left to right; you should never search for anything on stage.

| # | Tab / window | Contents | Pre-load state |
|---|---|---|---|
| 1 | Terminal A | `api/` — API running (`npm run dev` or `npx tsx src/index.ts`), scrolled to a clean prompt | Running, health-checked |
| 2 | **Terminal B** | `api/` — **command pre-typed, not run**: `API_BASE=http://localhost:4021 npx tsx scripts/agent-demo.ts` | Idle, one Enter away. **This is the demo.** Font as large as the room allows — the agent's output *is* the slide |
| 3 | Terminal C | `api/` — **command pre-typed, not run**: `API_BASE=http://localhost:4021 npx tsx scripts/verify-g01-fix.ts` | Idle, one Enter away. This is the security beat |
| 4 | Terminal D | Repo root — **empty prompt**, for the live `curl` commands (402 decode, indexer reads) | Idle. Commands pre-typed in your shell history in reverse order so ↑ walks them forward |
| 5 | Browser — Lora app | https://lora.algokit.io/testnet/application/768743428 | Loaded, scrolled to global state |
| 6 | Browser — Lora transaction | A **blank** Lora transaction tab — you will paste one of the agent's own links into it | Loaded and ready to paste |
| 7 | Browser — Lora payment | https://lora.algokit.io/testnet/transaction/DOSKCNKJRXIMY2UDSDZ377LKPZQIZJW5JHCGUAGKOYV6KUCFYKIA | Loaded — the agent's $0.02 triage payment. This is your Wi-Fi-failure insurance |
| 8 | Editor | `api/scripts/agent-demo.ts` and `api/src/routes/records.ts`, split | Open at the discovery block (`agent-demo.ts:144-158`) and `records.ts:41` (payer binding) |
| 9 | Browser — MedRail | `http://localhost:3000` (or the public URL if `Winning_Strategy.md` M6 is done) | Loaded, demo wallet created and funded. **Supporting shot only** — 5-minute version, Beat 7 |
| 10 | Fallback | `contracts/artifacts/e2e-consent-proof.json` and `contracts/artifacts/g01-verification.json` open in the editor | Static evidence if the network dies — both carry real transaction ids |

Terminal font ≥ 18pt. Dark theme. Use absolute paths in every command so the working directory never matters.

**Wallet pre-flight, non-negotiable:** one full agent run spends **$0.09 USDC** from the **agent wallet** (`UYBTLPHS…`, set via `AGENT_MNEMONIC`), and `verify-g01-fix.ts` spends a further $0.05 plus chain fees from the operator wallet. Have at least **$0.30 USDC and 1 ALGO** in each before you walk on. The **patient wallet** (`56LFG5EE…`, `PATIENT_MNEMONIC` / `PATIENT_ADDRESS`) is a third keypair that pays for nothing — it needs ALGO only, and holding no USDC is correct. Confirm the patient's grant to the agent is still active: the agent will correctly refuse to spend on the gated call if it is not. `GET /v1/health` now reports the operator's and the application account's spendable ALGO and how many audit writes they can still afford, so that check is one free local call. Balance and consent queries are in [`Demo_Runbook.md`](Demo_Runbook.md).

---

## The 2-minute version

Six beats. Total spoken time ~115 seconds, leaving buffer. **Cut ruthlessly if you run long — cut Beat 6 first, then Beat 4. Never Beat 2, Beat 3 or Beat 5.**

### Timing table

| Beat | Content | Target | Cumulative |
|---|---|---:|---:|
| 1 | The agent problem | 15s | 0:15 |
| 2 | The agent discovers the service, and pays | 35s | 0:50 |
| 3 | The free consent check — then the gated call | 25s | 1:15 |
| 4 | Proof: one of its payments, on a public explorer | 20s | 1:35 |
| 5 | Security — a live impersonation, refused | 15s | 1:50 |
| 6 | The contract, read from the public indexer | 10s | 2:00 |

---

### Beat 1 — The agent problem (15s)

**Do:** face the room. Nothing on screen yet.

**Say:**
> "An AI agent triaging a patient case needs three things: symptom triage, a drug-interaction check, and the patient's actual record. Today that's three vendor signups, three API keys, three billing relationships — and even then it can't legally touch the record, because nobody can prove the patient allowed it. MedRail sells all three per call over x402. And the record is gated by consent the patient signed themselves, on Algorand. I'm going to let an agent do it, live, with no account and no API key."

**Why this opening:** it states the machine-to-machine problem in the first sentence and never mentions a human user. Everything that follows is an agent acting on its own.

---

### Beat 2 — Discovery, then two paid calls (35s) ★ *the centrepiece*

**Do:** Terminal B. The command is already typed. Press Enter and let it run. **Do not read the output aloud — point at what matters as it scrolls.**

```bash
API_BASE=http://localhost:4021 npx tsx scripts/agent-demo.ts
```

**Expected output** (abridged — this is the shape; the transaction ids change every run):
```
╭──────────────────────────────────────────────────────────────╮
│  CLINICAL TRIAGE AGENT                                       │
│  No MedRail account. No API key. No prior relationship.      │
╰──────────────────────────────────────────────────────────────╯

  Agent wallet : UYBTLPHS6APCXVBDPASQMUIQCEORDIR6EMTVMNSDPSVRSR5HEPKQ5GO4YQ
  Patient      : 56LFG5EEHIJ4ZVMPHUMJH6BST2O3D4DMG3AWRZ2SN7Y3LLUDVUDILO66YM  (a different party — granted this agent access on-chain)

[1] DISCOVER — reading the service index at GET /
      MedRail: 8 endpoints advertised
      x402 v2 · scheme "exact"
      consent contract: App 768743428 on testnet
      ABI spec for self-integration: /v1/consent/arc56

      offers POST /v1/triage — $0.02 (x402)
      offers POST /v1/interaction-check — $0.02 (x402)
      offers POST /v1/records/summary — $0.05 (x402 + on-chain consent)

[2] The presentation needs urgency scoring → POST /v1/triage
      paid $0.02 · settled DOSKCNKJRXIMY2UD…
      band=EMERGENCY score=70
      flags: possible cardiac chest pain · respiratory distress

[3] Two medications on board → POST /v1/interaction-check
      paid $0.02 · settled PLBFDDADW576IUCH…
      MAJOR: warfarin + aspirin
```

**Say** — three gestures, in this order:
> "**Discovery first.** It's reading `GET /` — the service index. Eight endpoints, the price of each one, which ones are gated, the App ID of the consent contract, and the URL of the ARC-56 spec it would need to build its own client against that contract. Nothing about us is hardcoded in this agent except the base URL. It found the catalogue and the prices the same way any stranger's agent would.
>
> **Then it decides.** Chest pain and shortness of breath — that needs urgency scoring, so it pays two cents. Emergency, seventy.
>
> **Two medications on board** — another two cents. Warfarin plus aspirin, major. Anticoagulant plus antiplatelet: that raises bleeding risk, which materially changes how you manage a suspected cardiac event. That's why the agent bought the second service, not just the first."

**Why this beat wins:** every entry in this competition will show a payment. Almost none will show a caller that *found out what to buy* before buying it. The discovery step is the answer to "how would a real agent find you", and it costs nothing to run.

---

### Beat 3 — The free oracle, then the gated call (25s) ★ *never cut this*

**Do:** nothing — the same run continues. Point at the screen.

**Expected output:**
```
[4] The record is consent-gated. Check the FREE oracle before spending.
      GET /v1/consent/status → granted=true  (cost: $0.00)
      Grant is active on-chain. Spending is justified.

[5] Consent verified → POST /v1/records/summary
      paid $0.05 · settled COMJ3TQOGTKP6LXD…
      consent verified on-chain : true
      access written to the patient's audit trail: recorded
      audit tx: https://lora.algokit.io/testnet/transaction/<new every run>

  $0.02  triage               https://lora.algokit.io/testnet/transaction/DOSKCNKJ…
  $0.02  interaction-check    https://lora.algokit.io/testnet/transaction/PLBFDDAD…
  $0.05  records/summary      https://lora.algokit.io/testnet/transaction/COMJ3TQO…
  ─────
  $0.09  total, across 3 settled Algorand transactions

  Zero accounts created. Zero API keys issued. Zero invoices.
```

**Say** — land hard on step 4:
> "Now the record. That endpoint is consent-gated, and **watch what it does before it spends anything.** It calls the consent oracle — which is free, deliberately — and asks whether it's allowed. Granted, on-chain. *Now* the spend is justified, so it pays five cents.
>
> **That's the beat: the agent refuses to spend money to be told no.** If that grant weren't active it would decline the call, spend nothing, and report what it had. The oracle is free precisely so an agent can make that decision.
>
> And look at the last two lines of the paid call. Consent verified on-chain, and the access was written to the patient's own audit trail — that's a second transaction id in the response, and it isn't the payment. Nine cents, three settled Algorand transactions, no accounts, no API keys, no invoices."

**Why this beat wins:** it is the one place where the payment layer and the permission layer are visibly the same round trip, and it is the only agent behaviour in the whole run that a script could not have faked by hardcoding a URL list.

---

### Beat 4 — Proof: one payment, on a public explorer (20s)

**Do:** copy the **triage** transaction link straight out of the agent's own output. Paste into tab 6 (blank Lora tab).

**Expected on screen:** an `axfer`, asset `10458941`, amount **20000**, `fee: 0`, sender `UYBTLPHS…`, receiver `2WDV2J2F…`.

**Say** — point at four fields:
> "That's a block explorer, not our UI. **Asset ten-four-five-eight-nine-four-one** — TestNet USDC. **Twenty thousand base units** — exactly two cents at six decimals. **Fee zero**, because the GoPlausible facilitator sponsors it, so the agent needed USDC and no ALGO at all. And **sender and receiver are different addresses** — the agent holds its own keypair, which this service doesn't have.
>
> Here's the part worth your attention: *nothing in our codebase produced those numbers.* Our route config contains the string `$0.02` and a network — no asset id, no decimal conversion. The SDK asked the facilitator what USDC is on this network and did the rest. We built the thing that asks correctly."

**⚠ Fallback if the explorer is slow to index:** switch to tab 7, which is pre-loaded with `DOSKCNKJ…` from the recorded run. Say *"it settles in about three seconds; the explorer takes a moment — here's the same payment from the earlier run"* and keep moving. **Practise this switch.** Under three seconds, and it should sound planned.

---

### Beat 5 — Security: a live impersonation, refused (15s) ★ *never cut this*

**Do:** Terminal C. The command is already typed. Press Enter.

```bash
API_BASE=http://localhost:4021 npx tsx scripts/verify-g01-fix.ts
```

**Expected output** (abridged):
```
Step 2 — THE ATTACK: pay with the attacker's own key, assert the third party's address
  HTTP 403
  {"error":"requesterAddress must match the address that signed the payment", ...}
  settled payment: none — settlement cancelled on 4xx
  => BLOCKED. No record released.

Step 3 — CONTROL: the same payer asserting their OWN address (legitimate)
  HTTP 200
  record released: true
```

**Say:**
> "Consent grants are public on Algorand, so anyone can look up a valid patient-and-requester pair from our own transaction history. So — pay with my own key, but claim to be that authorised requester. **Four-oh-three.** The endpoint recovers the address that *actually* signed the payment and refuses unless it matches. **The payment is the authentication.** No API key can do that — and notice settlement was cancelled, so the attack didn't even cost me the money. Then the control: same payer, own address, two hundred, record released."

**⚠ Fallback if the script fails:** tab 10. `contracts/artifacts/g01-verification.json` records `"blocked": true` and `"result": "CLOSED"` from a real run. *"That's the run from this morning — same attack, same 403."*

---

### Beat 6 — The contract, from the public indexer (10s)

**Do:** Terminal D. Run:

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

**Expected output** (verified live against `testnet-idx.algonode.cloud`; the counters increment every time you run the demo, so treat the numbers as a floor rather than a fixed value):
```
created-at-round: 66088624 | deleted: False
total_requests         = 2
total_revocations      = 2
total_audit_entries    = 5
total_grants_active    = 4
```

**Say:**
> "Public Algorand indexer — not our server, no key, no account. And `total_audit_entries` is the whole thesis in one integer: every one of those is a paid, consented record access written to a patient's own log by the contract, not by us. The agent you just watched incremented it."

**Close:**
> "An agent with no account discovered a service, priced it, decided what to buy, checked whether it was allowed before it spent, and paid nine cents across three transactions on a public ledger. An impersonation attempt refused with a 403. A contract that's byte-identical to the TEAL in our repo, which you can verify yourself. Seventy-three passing tests. And a proof log with the command to reproduce every one of those claims — including the ones we haven't finished."

---

## The 5-minute version

Same spine, with five inserted beats that go deeper on mechanism plus the browser as a supporting shot. Additions are marked **[+]**. Where a beat is unchanged from the 2-minute version, only the delta is given.

### Timing table

| Beat | Content | Target | Cumulative |
|---|---|---:|---:|
| 1 | The agent problem — with the architecture thesis | 30s | 0:30 |
| 2 | The agent discovers the service | 25s | 0:55 |
| 3 | Two paid calls | 30s | 1:25 |
| 3b **[+]** | Decode the 402 by hand | 40s | 2:05 |
| 3c **[+]** | Where those numbers came from (`x402.ts`) | 25s | 2:30 |
| 4 | The free oracle, then the gated call | 35s | 3:05 |
| 4b **[+]** | Box-key derivation, and why boxes | 30s | 3:35 |
| 5 | Indexer cross-check — sender ≠ receiver, **then the funding disclosure** | 35s | 4:10 |
| 6 | Security: live impersonation refused | 30s | 4:40 |
| 7 **[+]** | The patient side, in the browser | 10s | 4:50 |
| 8 | Indexer read + close | 10s | 5:00 |

*(Beat 9 — the known-limitations beat — is held in reserve for Q&A rather than spent from the clock. Use it if you finish early; it plays very well.)*

**Beat numbers differ between the two variants because the 5-minute version splits things the 2-minute version fuses.** The mapping, so you can rehearse one and deliver the other: 5-min Beats 2+3 = 2-min Beat 2 · 5-min Beat 4 = 2-min Beat 3 · 5-min Beat 5 = 2-min Beat 4 · 5-min Beat 6 = 2-min Beat 5 · 5-min Beat 8 = 2-min Beat 6 (same command, same close). Beats 3b, 3c, 4b and 7 exist only here.

**Run the agent once, at Beat 2, and let it stay on screen.** Beats 3, 3b, 3c, 4 and 4b all annotate output that is already there. Do not re-run it — a second run costs another nine cents and buys nothing.

---

### Beat 1 (expanded, 30s) — The agent problem **and** the architectural thesis

**Say:**
> "An AI agent triaging a patient case needs three services: symptom triage, a drug-interaction check, and the patient's own record. Today that's three signups, three API keys, three invoices — and it still can't touch the record, because nobody can prove the patient allowed it.
>
> Now — the obvious build here is one consent-gated endpoint, and we deliberately didn't do that. A consent-gated endpoint *cannot* generate payment volume by construction: one patient, one doctor, a handful of calls a year. So we run two catalogues over one trust layer. Two open endpoints any stranger's agent can pay for in a single round trip, and one consent-gated endpoint that carries the ownership proof. Same contract underneath both. That split is argued out in our architecture doc, not improvised — it's the central design decision in this submission. Here's an agent using all three."

---

### Beat 3b **[+]** (40s) — Decode the 402 by hand ★ *the mechanism beat*

The agent did this handshake invisibly, three times. Show it once, slowly.

**Do:** Terminal D. Run:

```bash
curl -s -D - -o /dev/null -X POST http://localhost:4021/v1/triage \
  -H "content-type: application/json" \
  -d '{"symptoms":"Sudden chest pain and shortness of breath"}' \
| tr -d '\r' | grep -i '^payment-required:' \
| sed 's/^[Pp]ayment-[Rr]equired: //' | base64 -d | python -m json.tool
```

**Expected output** (this is the real captured payload; the `extensions.bazaar.schema` block is long and elided here, but it *will* scroll past on stage — say "that's the machine-readable schema" and keep going):
```jsonc
{
    "x402Version": 2,
    "error": "Payment required",
    "resource": {
        "url": "http://localhost:4021/v1/triage",
        "description": "Rule-based clinical red-flag triage score. Not medical advice.",
        "mimeType": "application/json",
        "serviceName": "MedRail",
        "tags": ["x402-global-challenge", "healthcare", "consent", "algorand"]
    },
    "accepts": [
        {
            "scheme": "exact",
            "network": "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=",
            "amount": "20000",
            "asset": "10458941",
            "payTo": "2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE",
            "maxTimeoutSeconds": 300,
            "extra": {
                "tag": "x402-global-challenge",
                "feePayer": "ZMFK2OI7ZBD2U27ISERZC4S6LKM6WMFJPZQ4MYNJDZ2VNBNMBA67RA22AA"
            }
        }
    ],
    "extensions": {
        "bazaar": {
            "info": {
                "input":  { "type": "http", "method": "POST", "bodyType": "json",
                            "body": { "symptoms": "crushing chest pain radiating to left arm" } },
                "output": { "type": "json", "example": { "score": 35, "band": "urgent", ... } }
            },
            "schema": { ... }
        }
    }
}
```

**Say** — point at three fields in this order:
> "This is what the agent got back on its first unpaid call, and what it turned into a signed payment without any help from us. A base64 header, decoded live. Three things worth your attention. **Amount twenty thousand** — our route config says the string `$0.02`; nothing in our codebase converts that. The SDK asked the facilitator what USDC is on this network, got six decimals, and produced twenty thousand base units. **Asset ten-four-five-eight-nine-four-one** — TestNet USDC. That id is not in our config either; it came from the facilitator's `/supported`. And **`extra.feePayer`** — the facilitator sponsors the network fee, so a caller needs USDC and zero ALGO. We didn't build any of those three values. We built the thing that asks correctly."

**If a judge asks about the `extensions.bazaar` block, or you have five spare seconds:**
> "That's the Bazaar discovery declaration — the input shape, an output example, and a JSON schema, carried in the 402 itself. There's no registration call in x402: a facilitator catalogues a resource by reading that off a payment it verifies. So we're wired for it, tagged `x402-global-challenge`, and **not listed yet** — because the catalogue keys on the resource URL, and ours currently says `localhost`. One paid call against a public host is the whole remaining step."

**Why this beat wins:** every team can show a 402. Almost none can explain which fields *they* control and which the protocol supplied — and the honest answer here ("we didn't build those") is the strongest one.

---

### Beat 3c **[+]** (25s) — Where those numbers came from

**Do:** editor, open `api/src/x402.ts`, highlight lines 68-91 (the `priced()` helper).

**Say:**
> "This is our entire price config. Look at what's *missing*: there's no asset id and no decimal conversion. Just the string `$0.02` and a network. GoPlausible's own reference examples omit `asset` and let the scheme's money parser resolve the network's canonical stablecoin — so the `10458941` and the `20000` are the protocol talking to the facilitator. If the TestNet USDC asset id changed tomorrow, this file wouldn't need an edit.
>
> Scroll up" — highlight `x402.ts:50-52` — "we register **only** the network this process is configured for. A testnet process cannot accidentally accept a mainnet-signed payment. Three lines of code, and the kind of thing you only add if you've thought about what happens when you're wrong."

---

### Beat 4b **[+]** (30s) — Why box storage, and how the key is derived

**Do:** editor, `contracts/smart_contracts/consent/contract.py`, highlight lines 95-98 then 114-116.

**Say:**
> "That grant the agent just checked lives in a box, keyed by `sha256(patient ‖ requester ‖ scope)` — thirty-two bytes, fixed length, one box per triple. Box storage rather than local state, deliberately: Algorand local state would require every requester — including a stranger's read-only agent — to *opt in* to our application before it could hold a grant. That's absurd for a pay-per-call endpoint; it turns a one-round-trip call into a two-transaction onboarding. Boxes let any triple exist without either side opting in to anything except the box's minimum balance, which the app account funds itself.
>
> And `scope` is a free-form string, not an enum. Adding a fourth endpoint with a new scope needs zero contract changes and zero redeployment."

**If you have an extra ten seconds, add the part that used to be an admission and is now a boast:**
> "The cost of that design is that the key derivation exists three times — Python in the contract, Node in the backend, WebCrypto in the browser — and if any one of them drifts, a grant written by the browser becomes silently unreadable by the backend. No error, just `false`. So all three now read the same golden-vector fixture: `api/test/fixtures/box-key-vectors.json`, asserted by the TypeScript suite *and* by the Python contract tests. Three languages, one set of expected bytes, checked on every run."

*(That is the strongest ten seconds available in the 5-minute version. It shows you found a class of silent failure in your own design and closed it, rather than shipping three implementations and hoping.)*

---

### Beat 5 (expanded, 35s) — Cross-check the indexer, then volunteer the weak fact

**Do:** Terminal D. Paste the agent's own triage transaction id into:

```bash
curl -s https://testnet-idx.algonode.cloud/v2/transactions/DOSKCNKJRXIMY2UDSDZ377LKPZQIZJW5JHCGUAGKOYV6KUCFYKIA \
| python -c "
import sys, json
t = json.load(sys.stdin)['transaction']
x = t['asset-transfer-transaction']
print('type    :', t['tx-type'])
print('round   :', t['confirmed-round'])
print('fee     :', t['fee'])
print('asset   :', x['asset-id'])
print('amount  :', x['amount'])
print('sender  :', t['sender'])
print('receiver:', x['receiver'])
"
```

**Expected shape:** `axfer`, `fee: 0`, `asset: 10458941`, `amount: 20000`, sender `UYBTLPHS…`, receiver `2WDV2J2F…` — **sender ≠ receiver**, confirmed round 66563930.

**Say** — strong half first, then the weak half, and do not pause between them:
> "Straight from the indexer, not from the facilitator's response — we don't take settlement confirmations on faith. Asset transfer, twenty thousand base units, exactly the two cents from the header. Fee zero: the facilitator sponsored it.
>
> **Now look at sender and receiver — they're different addresses.** The agent has its own keypair, which we don't hold; it opted itself in to USDC; and the patient who granted *that specific address* consent is a third address again — it signed that grant with its own key, and it is neither the payer nor the payee. Three roles, three accounts, and you can check every one of them on the indexer without us.
>
> And here's the part I'd rather tell you than have you find. **I funded both those wallets.** Their TestNet balances came from our own account, because TestNet ALGO and USDC have no other practical source — so no external or unrelated party has paid for this service, and none of this is payment volume. Our earlier settlements were straight self-payments, sender equals receiver, and they're labelled that way in our proof log. What we've proven is the mechanism, between genuinely distinct accounts. Not demand. I'm not going to blur those two."

**Why the order matters:** the strong half is verifiable in ten seconds and buys you the standing to deliver the weak half as rigour rather than as a confession. Reversed, the disclosure lands first and the sender ≠ receiver point sounds like a recovery. And do deliver the weak half — you have just spent four minutes establishing that everything you claim checks out, and a judge who finds the funding trail themselves will re-examine every number you showed.

---

### Beat 6 (expanded, 30s) — Security, demonstrated rather than described ★ *the beat nobody else has*

**Do:** Terminal C. The command is already typed. Press Enter:

```bash
API_BASE=http://localhost:4021 npx tsx scripts/verify-g01-fix.ts
```

It performs the exact attack the original review found, against the live TestNet deployment, in three steps: the patient grants a **third party** consent on-chain; the attacker pays with their own key while asserting the third party's address; then a control call with a matching identity runs so the refusal cannot be dismissed as breakage.

**Expected output** (abridged — this is the shape, and the artefact it writes is `contracts/artifacts/g01-verification.json`):
```
Step 1 — patient grants consent to the third-party requester (on-chain)
  consent(patient -> third party) granted = true

Step 2 — THE ATTACK: pay with the attacker's own key, assert the third party's address
  HTTP 403
  {"error":"requesterAddress must match the address that signed the payment", ...}
  settled payment: none — settlement cancelled on 4xx
  => BLOCKED. No record released.

Step 3 — CONTROL: the same payer asserting their OWN address (legitimate)
  HTTP 200
  record released: true
  audit tx: 4YLKLQKK…  (sequence 1)
====================================================================
  Impersonation blocked : YES
  Legitimate call works : YES
  G-01 CLOSED           : YES
====================================================================
```

**Say** — talk over Step 1, land hard on Step 2:
> "The patient just granted a *third party* access. Now I'm going to pay five cents and claim to be that third party. Four-oh-three — and look at the line under it: **settlement cancelled**, so the attack didn't even cost me the money, because x402 only settles on a sub-400 response. Then the control: same payer, own address, two hundred, record released, audit entry written. This matters because grants are public — `grant_access` puts the patient in the sender field and the requester in argument zero, so those pairs are enumerable from our own transaction history. Without this check, anyone who pays could read as any authorised requester, and that fabricated identity would be written into the patient's immutable audit log. **The payment is the authentication.** Paying is not being."

**Why this beat wins:** every entry in this competition will demonstrate a feature working. This demonstrates a control refusing an attack, and then the same request succeeding when the identity is right — which is the only way to prove a refusal means something. It also pre-empts the single most dangerous question a judge can ask, by answering it before they have finished forming it.

**If the script fails on stage:** open tab 10. `contracts/artifacts/g01-verification.json` records `"blocked": true` and `"result": "CLOSED"` from a real run, with the grant transaction id. Say *"that's the run from this morning — same attack, same 403"* and move on.

---

### Beat 7 **[+]** (10s) — The patient side, in the browser ★ *supporting shot, keep it short*

**Do:** browser tab 9. Scroll to **On-chain consent**. Click **Revoke**, then **Check status**. The pill flips to `not granted`.

**Say:**
> "One supporting shot, and it's the other half of the protocol. Everything so far was the agent's side. This is the patient's: that revoke was signed in the browser and submitted straight to Algorand — our backend never saw the key, never proxied it, and couldn't undo it if it wanted to. `check_access` just went true to false, and that read is a free simulated call. Re-run the agent now and it declines the gated endpoint and spends nothing."

**Re-grant before you leave the tab** if anyone might run the agent again — click **Grant myself access** while you talk. Otherwise the next run stops at Beat 3's oracle, which is correct behaviour and a confusing accident.

**Cut this beat first** if you are behind the clock. It is worth ten seconds and no more; a human clicking buttons is precisely the framing this demo exists to move away from.

---

### Beat 9 (reserve) — Known limitations, volunteered

Hold this for Q&A, or use it if you are ahead of the clock. It is the single most differentiating thirty seconds available to you.

**Do:** Terminal D. Run the triage engine against a negation while you talk — or simply say it; the number is measured and stable.

**Say:**
> "Four things I'd rather tell you than have you find.
>
> One — type *'I have no chest pain'* into that triage endpoint. Thirty-five. Urgent. Substring matching has no notion of negation. That's the price of picking rules you can audit over a model you can't, and it's a screening trigger, not a diagnosis, which is exactly why every response ships a disclaimer that a unit test enforces. And to be unambiguous: **there is no machine-learning model anywhere in this system.** The AI in this demo is the caller, not the endpoint.
>
> Two: our interaction checker flags five severe pairs if you feed it the letters 'a' and 'b' — and our own test file calls that input and asserts only the disclaimer, so the suite runs the bug every time and can't see it. That's two fixes, not one.
>
> Three: the contract running on that App ID is *not* the contract in our repo. We found two defects in it — an event field order and an MBR constant four hundred microalgos light — fixed both in source, and deliberately did not redeploy, because our deploy path mints a new App ID and we'd have thrown away everything I just showed you. Fixed, tested, held back on purpose.
>
> Four: we have no observability at all. No metrics, no tracing, no alerting. If this broke at three in the morning we'd find out from a user. And we have no performance numbers — none, not one — because everything we could measure would be a laptop.
>
> All of it is written up in our own gap analysis with reproduction commands. We'd rather hand you the list than have you build it."

**Why this beat is worth more than it looks:** by this point you have spent four minutes proving that everything you claim checks out. Demonstrating that you audit yourself as hard as a judge would is the strongest possible close, and it inoculates every question that follows — a judge who was going to "catch" you on the negation now finds that you caught it first, measured it, and scoped the fix.

---

## What cannot be demoed today — and what to say

| Thing | Status | The line to use |
|---|---|---|
| **An external party paying for anything** | None. The agent is independent of the service, but **we funded it** — TestNet USDC has no other practical source. | "Payer and payee are different accounts and you can check that on the indexer. But I put the USDC in that agent's wallet, so nobody unrelated has paid for this. That's the honest gap and it needs a public URL and a stranger, not more code." |
| **A third-party agent calling the service** | None. The agent is ours, running on our own machine against `localhost`. | "It knows nothing about us but the base URL — but it's our agent, on our laptop, because there's no public URL for anyone else's to discover. Deployment gap, not a design gap." |
| **The patient being a different *human*** | The patient is a separate account with its own keypair — `56LFG5EE…`, neither the payer nor the payee — but **we generated and funded it**, as we did the agent's. | "Three accounts, three keypairs: the payer, the payee, and a patient that is neither, signing its own grant. What I can't tell you is that a stranger holds that patient key — we made it. So what this proves is the mechanism, not a relationship between strangers." |
| **MainNet** | Not deployed. Deliberate. | "TestNet only. MainNet is real money and it's literally the act of entering under our own identity — we documented why we deferred it rather than doing it half-way." |
| **Public URL / Bazaar / leaderboard** | Pending. The discovery extension is implemented and the `x402-global-challenge` tag is emitted; the **listing** is not, and needs one paid call against a public URL. | "Not hosted yet. The Bazaar declaration is in every 402 we serve, tagged for the challenge — but the catalogue keys on the resource URL and ours says `localhost`, so we're not listed. That's a deployment gap, not a design gap — and it's why we have our own payments instead of other people's." |
| **The deployed contract carrying our contract fixes** | Fixed in source; **redeploy deliberately deferred.** | "The App ID you're looking at runs the pre-fix bytecode, on purpose — our deploy path mints a new App ID, so redeploying would throw away this contract's whole history. Both defects are non-exploitable, both are fixed in `contract.py`, and there are three regression tests we ran against the old code first to watch them fail." **Volunteer this; it is the sharpest question available to a prepared judge.** |
| **Any machine-learning model** | None exists, anywhere. | "There's no model. Two deterministic rule engines — eleven weighted red-flag phrases and a fourteen-row interaction table. That was a safety decision and it's disclosed in every document we have." |
| **Observability** | None (G-15). | "No metrics, no tracing, no alerting. There's a health endpoint and three structured error events, and nothing consumes them. We'd find out from a user. It's in our gap report." |
| **Frontend tests** | None exist. | "Zero. No Playwright, no Vitest on the frontend. Seventy-three tests, all backend and contract." |
| **Load / latency numbers** | No benchmark exists (G-24). | "None. Not a p50, not a p95, nothing — anything I could measure would be a laptop and you'd be right to discount it. And the deployment is pinned to one machine on purpose, because the audit-sequence lock is in-process." |
| **Real patient data** | Synthetic constant only. | "One fixed synthetic record, returned regardless of patient id. There is no patient datastore — this proves the permission layer, not the storage layer." |
| **Negation handling in triage** | **Measured:** `"I have no chest pain"` → score 35, band `urgent`. Not handled. | "Substring matching, no notion of polarity. Screening trigger, not a diagnosis. Fix is scoped." **Volunteer this in the 5-minute version (Beat 9) rather than waiting to be caught.** |
| **Short-token interaction matching** | **Measured:** `["a","b"]` → 5 matches; `["in","as"]` → 4, including `warfarin+aspirin`. Unanchored containment. | "Two letters produce four severe warnings, and our own test calls that input and asserts only the disclaimer. Two fixes, both on the list." |

---

## Risk register for the demo itself

Detection, fallback, and the exact words. Operational detail and pre-flight checks are in [`Demo_Runbook.md`](Demo_Runbook.md).

| Risk | Detection | Fallback | Say |
|---|---|---|---|
| **Agent wallet out of USDC** | `agent-demo.ts` throws on the first `payFor` — `triage failed` | Do not retry blind. Move to Beat 5's cross-check on the pre-recorded transaction (tab 7), then Beat 6 | "The agent's wallet is dry — the transaction was constructed and signed, there was nothing to send. Here's the run from this morning, same three payments, on the public ledger." |
| **Agent stops at the consent oracle** (`granted=false`) | Output shows `granted=false` and *"the agent declines to spend"* | **This is correct behaviour — lean into it, do not apologise** | "That's the grant having lapsed — and watch what the agent did: it declined the gated call and spent nothing. That's the whole point of a free oracle. Let me re-grant and run it again." Re-grant with `npx tsx scripts/grant-consent.ts UYBTLPHS6APCXVBDPASQMUIQCEORDIR6EMTVMNSDPSVRSR5HEPKQ5GO4YQ`, which signs as the patient (`PATIENT_MNEMONIC`) — **not** `e2e-consent-proof.ts`, which grants the deployer to itself and leaves the agent's grant untouched |
| Facilitator unreachable | The agent's first paid call fails; a bare `curl` to a priced route returns **503** with `Retry-After: 30` and code `PAYMENT_FACILITATOR_UNAVAILABLE`, not 402 | Skip to Beat 6 (indexer) and tab 7 (pre-loaded payment) | "That's our facilitator being unreachable — and notice we tell you it's retryable rather than five-hundred-ing at you, because our callers are agents and the difference between 'come back' and 'this is dead' matters. The asset id and fee-payer come from the facilitator's `/supported`, so we genuinely can't build a 402 offline. Here's a payment that settled through it earlier, on the public ledger." |
| AlgoNode slow or down | Beats 4/6 hang >10s | Tabs 5 and 7 are pre-loaded; use those | "Public node's lagging. These pages are the same data, loaded a few minutes ago." |
| `txn dead: round X outside Y--Z` | Consent grant/revoke errors | Retry once; if it fails again, move on | "Validity-window timeout from sequential round-trips — not a logic bug. Our scripts set a wide validity window for exactly this." |
| Venue Wi-Fi dies | Everything hangs | Tabs 5, 7 and `contracts/artifacts/e2e-consent-proof.json` in tab 10 | "I'll show you the artefacts I captured this morning — every one has a transaction id you can check yourself later." |
| API not running | The agent fails at `GET /` — connection refused on discovery | Terminal A: `npm run dev`, wait ~3s | Keep talking through Beat 1's content while it boots. Never watch a spinner in silence. |
| Judge asks the payer-binding question mid-demo | — | Answer immediately — and **offer to show it**, do not defer | "The payment *is* the authentication — we recover the address that signed it and 403 on a mismatch. Terminal C, I'll run the attack right now." Then run `verify-g01-fix.ts`. This used to be the question that ended the demo; it is now the one you want. **Never say "I'll come back to that."** |
| **Judge asks "isn't this just a script with hardcoded URLs?"** | — | Answer by pointing at the screen, not by arguing | "Open `agent-demo.ts`. The only MedRail-specific constant in it is the base URL — every path, every price and the App ID come from `GET /`. And the price it pays is read out of the catalogue, not typed in. Here's the discovery block." Then editor tab 8 |
| Judge asks whether the deployed contract has the fixes in it | — | Answer immediately and completely | "No — deliberately. Redeploying mints a new App ID and we'd lose this contract's history. Both defects are non-exploitable, fixed in source, with regression tests we ran against the old code first." **Do not hedge; a partial answer here is worse than the full one.** |
| **A judge types a negation into the symptoms box** — e.g. `I have no chest pain` | `score: 35`, `band: "urgent"` (measured 2026-08-21) | None. It will do this. Own it in one breath, then move on | "Yep — thirty-five, urgent. Substring matching has no notion of negation, and that's the cost of choosing rules you can audit over a model you can't. It's a screening trigger, not a diagnosis, which is why every response carries a disclaimer a unit test enforces. Leading-negator detection is on the list." **Do not act surprised.** |
| **A judge types short/garbage medications** — e.g. `a, b` or `in, as` | Interaction endpoint returns `flagged: true` with 5 and 4 matches respectively (measured), including `warfarin+aspirin` and `simvastatin+clarithromycin` | None. Own it, and volunteer the sharper half | "Five matches from two single letters — the containment test is unanchored in both directions. And the part that should bother you more than the bug: our own test file calls exactly that input and only asserts the disclaimer, so the suite executes it every run and can't see it. That's on the fix list as two changes, not one." |

**Universal rule:** if any live command fails twice, stop trying. Move to the pre-loaded explorer tab and say *"that's live infrastructure being live infrastructure — here's the same thing from ten minutes ago."* Judges forgive network failures. They do not forgive four minutes of watching you retry.
