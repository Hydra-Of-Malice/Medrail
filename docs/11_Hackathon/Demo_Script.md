# MedRail — Demo Script

**Purpose:** two rehearsable demo variants (2 minutes and 5 minutes) that show engineering rather than screens — real artefacts, exact commands, exact expected outputs, and the precise sentence to say at each beat.

**Status of this document:** Demo script, 2026-08-21. Every command below was executed against live public infrastructure and produced the stated output. All addresses, transaction ids, rounds and amounts are real TestNet values. No MainNet, public hosting, Bazaar listing, or leaderboard presence is claimed anywhere in this demo.

Companion documents: [`Demo_Runbook.md`](Demo_Runbook.md) (pre-flight and failure modes), [`Judge_Evaluation.md`](Judge_Evaluation.md), [`Winning_Strategy.md`](Winning_Strategy.md), [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md).

---

## What is new since the last revision — rehearse these two beats first

An earlier version of this script carried a blocker: the on-chain audit write had never executed, so Beat 6 could not be demonstrated and had to be delivered as a confession. **That is closed.** `total_audit_entries` on App `768743428` reads **5**, and `api/scripts/e2e-consent-proof.ts` reproduces the whole grant → check → pay → audit sequence on demand with four clickable explorer links.

The demo also gained something better than a fixed beat. **`api/scripts/verify-g01-fix.ts` performs a real impersonation attack against the live deployment and gets refused.** It grants a third party consent on-chain, pays with a *different* key while claiming the third party's address, shows the **403** — then runs the legitimate call as a control and returns the record with its audit transaction id. Showing a security control reject a live attack, and then showing the same request succeed when the identity matches, is worth more on stage than any feature walkthrough. Both variants below build it in: Beat 7 in the 2-minute version, Beat 7 **[+]** in the 5-minute version.

**Rehearse those two beats before anything else.** Everything else in this script has been stable for a while; these are the two that changed.

---

## Setup — what to have open, in which tab

Arrange left to right; you should never search for anything on stage.

| # | Tab / window | Contents | Pre-load state |
|---|---|---|---|
| 1 | Terminal A | `api/` — API running (`npm run dev`), scrolled to a clean prompt | Running, health-checked |
| 2 | Terminal B | Repo root — **empty prompt**, for the live `curl` commands | Idle. Commands pre-typed in your shell history in reverse order so ↑ walks them forward |
| 3 | Browser — MedRail | `http://localhost:3000` (or the public URL if `Winning_Strategy.md` M6 is done) | Loaded, demo wallet created, wallet funded with ALGO **and** USDC, USDC opt-in done |
| 4 | Browser — Lora app | https://lora.algokit.io/testnet/application/768743428 | Loaded, scrolled to global state |
| 5 | Browser — Lora payment | https://lora.algokit.io/testnet/transaction/OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ | Loaded — this is your Wi-Fi-failure insurance |
| 6 | Editor | `api/src/routes/records.ts` **and** `contracts/smart_contracts/consent/contract.py`, split | Open at `records.ts:41` (the payer-binding block) and `contract.py:217` |
| 7 | Fallback | `contracts/artifacts/e2e-consent-proof.json` and `contracts/artifacts/g01-verification.json` open in the editor | Static evidence if the network dies — both carry real transaction ids |
| 8 | Terminal C | `api/` — **command pre-typed, not run**: `API_BASE=http://localhost:4021 npx tsx scripts/verify-g01-fix.ts` | Idle, one Enter away. This is Beat 7 |

Terminal font ≥ 18pt. Dark theme. Both terminals in the same directory-agnostic state (use absolute paths in every command below so it does not matter).

---

## The 2-minute version

Eight beats. Total spoken time ~110 seconds, leaving buffer. **Cut ruthlessly if you run long — cut Beat 7 first, never Beat 4 or Beat 8.**

### Timing table

| Beat | Content | Target | Cumulative |
|---|---|---:|---:|
| 1 | Problem | 12s | 0:12 |
| 2 | Input — the unpaid call | 10s | 0:22 |
| 3 | Mechanism — decode the 402 | 25s | 0:47 |
| 4 | Output — a settled payment | 20s | 1:07 |
| 5 | Differentiator — consent on-chain | 20s | 1:27 |
| 6 | Audit write | 10s | 1:37 |
| 7 | Security — an attack, refused | 8s | 1:45 |
| 8 | Checkable result — indexer read | 15s | 2:00 |

---

### Beat 1 — Problem (12s)

**Do:** face the room. Nothing on screen yet.

**Say:**
> "Your medical records sit in someone else's database, and the only way to know who read them is to ask that same someone. MedRail makes the permission itself a public, patient-signed object on Algorand — and puts three x402-paid endpoints on top of it. Everything I'm about to show you is on TestNet right now and you can check all of it from your own laptop."

---

### Beat 2 — Input (10s)

**Do:** Terminal B. Run:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4021/v1/triage \
  -H "content-type: application/json" \
  -d '{"symptoms":"Sudden chest pain and shortness of breath"}'
```

**Expected output:**
```
402
```

**Say:**
> "A clinical triage call, no payment attached. Four-oh-two. That's the whole x402 handshake starting — and the interesting part isn't the status code, it's what came back in the header."

---

### Beat 3 — The mechanism, made visible (25s) ★ *the technical beat*

**Do:** same terminal. Run:

```bash
curl -s -D - -o /dev/null -X POST http://localhost:4021/v1/triage \
  -H "content-type: application/json" \
  -d '{"symptoms":"Sudden chest pain and shortness of breath"}' \
| tr -d '\r' | grep -i '^payment-required:' \
| sed 's/^[Pp]ayment-[Rr]equired: //' | base64 -d | python -m json.tool
```

**Expected output** (this is the real captured payload):
```json
{
    "x402Version": 2,
    "error": "Payment required",
    "resource": {
        "url": "http://localhost/v1/triage",
        "description": "Rule-based clinical red-flag triage score. Not medical advice.",
        "mimeType": "application/json"
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
                "feePayer": "ZMFK2OI7ZBD2U27ISERZC4S6LKM6WMFJPZQ4MYNJDZ2VNBNMBA67RA22AA"
            }
        }
    ]
}
```

**Say** — point at three fields in this order:
> "That's a base64 header, decoded live. Three things worth your attention. **Amount twenty thousand** — our route config says the string `$0.02`; nothing in our codebase converts that. The SDK asked the facilitator what USDC is on this network, got six decimals, and produced twenty thousand base units. **Asset ten-four-five-eight-nine-four-one** — TestNet USDC. That id is not in our config either; it came from the facilitator's `/supported`. And **`extra.feePayer`** — the facilitator sponsors the network fee, so a caller needs USDC and zero ALGO. We didn't build any of those three values. We built the thing that asks correctly."

**Why this beat wins:** every team can show a 402. Almost none can explain which fields *they* control and which the protocol supplied — and the honest answer here ("we didn't build those") is the strongest one.

---

### Beat 4 — Output: a real settled payment (20s) ★ *never cut this*

**Do:** browser tab 3. Endpoint already set to **Red-flag triage score**, symptoms box holding the default `Sudden chest pain and shortness of breath`. Click **Pay $0.02 and call live**.

**Expected on screen:** `HTTP 200` badge, a **"view settled transaction on-chain →"** link, and this body — the exact values, measured by executing the module on 2026-08-21 and **byte-identical to the response recorded in `contracts/artifacts/e2e-proof.json`** from the real settled payment:

```json
{
  "score": 70,
  "band": "emergency",
  "matchedFlags": ["possible cardiac chest pain", "respiratory distress"],
  "disclaimer": "..."
}
```

**Do:** click the link. Lora opens on the settled `axfer`.

**Say:**
> "Real payment, browser-signed, settled through the live GoPlausible facilitator. Seventy, emergency — that's thirty-five for cardiac chest pain plus thirty-five for respiratory distress, and you can read the rule table in ninety seconds. That link is a block explorer, not our UI: asset transfer, twenty thousand base units, fee zero because the facilitator paid it. And notice what happened between the four-oh-two and the two hundred — the client constructed and signed an Algorand transaction group entirely in the browser. Our backend never touched a signing key."

**⚠ Fallback if the payment doesn't settle** (demo wallet out of USDC, facilitator hiccup): the UI already handles this and says so — `LiveDemoPanel.tsx:165-170` renders "A real payment was constructed and signed by your demo wallet, but settlement was rejected." Point at it and say:
> "That's the honest failure mode and the UI explains it — a real transaction was built and signed, settlement was refused. Here's one that did settle earlier today."

Then switch to tab 5 (pre-loaded) — transaction `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ`, confirmed round `66091768`. **Practise this switch.** It should take under three seconds and sound planned.

---

### Beat 5 — The differentiator: consent, on-chain (20s)

**Do:** browser tab 3, scroll to **On-chain consent**. Click **Grant myself access**, then **Check status**.

**Expected:** status pill flips to `granted`; a "view last consent transaction on-chain →" link appears.

**Say:**
> "That grant was signed by the browser wallet and submitted straight to Algorand — our backend never saw the key, never proxied it, and couldn't revoke it if it wanted to. Now watch the read."

**Do:** click **Revoke**, then **Check status**.

**Expected:** pill flips to `not granted`; a new transaction link.

**Say:**
> "Revoked. `check_access` went from true to false, and that's a free simulated read — zero fee, nothing submitted. Any of you can run it against our App ID without asking us."

---

### Beat 6 — The audit write (10s)

**Do:** browser tab 3, select **Consent-gated record summary**, leave the patient field blank (it defaults to your wallet), click **Pay $0.05 and call live**. *You must re-grant first — you revoked in Beat 5.*

> **Rehearsal note:** grant → pay → revoke is the correct ordering for a single run. If you keep Beat 5's revoke where it is, insert one **Grant myself access** click before this beat and do it while still talking.

**Expected:** `HTTP 200`, response body containing `consentVerifiedOnChain: true`, `auditStatus: "recorded"`, a non-null `auditTxId`, and an `auditSequence`.

**Say:**
> "Paid, authenticated *and* consented — one round trip that's simultaneously 'you paid for the compute', 'you are who you say you are', and 'you were allowed to see this.' And it wrote an audit entry to the patient's own on-chain log. That transaction id in the response is the audit write, not the payment."

**If asked what happens when the audit write fails:** the response still returns the record with `auditStatus: "pending"` and a null `auditTxId`, and the failure is logged server-side as a structured `audit_write_failed` event. Say it in one sentence: *"You get what you paid for, plus an explicit flag telling you the ledger write is outstanding. And you can't be charged for a failure anyway — x402 settles only on a sub-400 response."*

**⚠ Fallback if the operator account is out of ALGO** and the write comes back `pending`: do not hide it. Say *"the audit write is pending — our operator account is dry, which is exactly the failure this flag exists for"*, then run Beat 8 and point at `total_audit_entries`, which still shows the five earlier entries. It is a worse beat and a completely honest one.

---

### Beat 7 — Security, shown as an attack being refused (8s)

**Do:** editor tab 6, `api/src/routes/records.ts`, highlight the payer-binding block at line 41 — three seconds, no more. In the 2-minute version this is a pointer, not a demonstration; the live attack belongs to the 5-minute version (Beat 7 **[+]**) where there is room for it.

**Say:**
> "One detail, and it's the one that makes this an access control rather than a paywall. We decode the payment signature, recover the address that *actually* signed it, and 403 unless it matches the claimed requester — before we check consent, before anything touches the ledger. Grants are public on-chain, so valid patient-requester pairs are enumerable from our own transaction history; without this, anyone who pays five cents could read as any authorised requester. **The payment is the authentication.** Paying isn't being."

**If you have twenty seconds spare instead of eight,** run it rather than describe it: Terminal C is pre-loaded with `verify-g01-fix.ts`, which pays as the wrong wallet and shows the 403 live. Watching a control refuse a real attack is a materially stronger beat than pointing at the code that implements it.

---

### Beat 8 — Measurable, checkable result (15s) ★ *never cut this*

**Do:** Terminal B. Run:

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

**Expected output** (verified live against `testnet-idx.algonode.cloud`; the counters increment as you run the demo, so treat the exact numbers as a floor rather than a fixed value):
```
created-at-round: 66088624 | deleted: False
total_requests         = 2
total_revocations      = 2
total_audit_entries    = 5
total_grants_active    = 4
```

**Say:**
> "That's the public Algorand indexer — not our server, not our API, no key. App seven-six-eight-seven-four-three-four-two-eight, created at round sixty-six-oh-eight-eight-six-two-four. **Audit entries: five.** That counter is the whole thesis in one integer — every one of those is a paid, consented record access written to the patient's own log by the contract, not by us. Every number on that screen came from the ledger. Run it yourself on the way out."

**Close:**
> "Contract deployed and checkable — and byte-identical to the TEAL in our repo, which you can verify yourself. A payment that settled with a transaction id. Consent granted and revoked by the patient's own key. An impersonation attempt refused with a 403. Seventy-three passing tests, including three we ran against the old code first to watch them fail. And a proof log that gives you the command to reproduce every one of those claims — including the ones we haven't finished."

---

## The 5-minute version

Same spine, with four inserted beats that go deeper on mechanism. The additions are marked **[+]**. Where a beat is unchanged from the 2-minute version, only the delta is given.

### Timing table

| Beat | Content | Target | Cumulative |
|---|---|---:|---:|
| 1 | Problem — with the architecture thesis | 35s | 0:35 |
| 2 | Input — unpaid call | 15s | 0:50 |
| 3 | Mechanism — decode the 402 | 45s | 1:35 |
| 3b **[+]** | Where those values came from (`x402.ts`) | 30s | 2:05 |
| 4 | Output — settled payment + indexer cross-check | 45s | 2:50 |
| 5 | Consent grant → check → revoke | 45s | 3:35 |
| 5b **[+]** | Box-key derivation (`contract.py`) | 30s | 4:05 |
| 6 | Audit write | 25s | 4:30 |
| 7 **[+]** | Security: payer binding, shown as a 403 | 20s | 4:50 |
| 8 | Indexer read + close | 10s | 5:00 |

*(Beat 7b — the known-limitations beat — is held in reserve for Q&A rather than spent from the clock. Use it if you finish early; it plays very well.)*

---

### Beat 1 (expanded, 35s) — Problem **and** the architectural thesis

**Say:**
> "Your medical records sit in someone else's database, and the only way to find out who read them is to ask that same someone. MedRail makes the permission a public, patient-signed object on Algorand.
>
> Now — the obvious build here is one consent-gated endpoint. We deliberately didn't do that, and the reason is worth thirty seconds. A consent-gated endpoint *cannot* generate payment volume by construction: one patient, one doctor, a handful of calls a year. So we run two catalogues over one trust layer. Two open endpoints anyone's agent can pay for in a single round trip, with no account and no prior relationship with us. And one consent-gated endpoint that proves the ownership story. Same contract underneath both. That split is argued out in our architecture doc, not improvised — it's the central design decision in this submission."

---

### Beat 3b **[+]** (30s) — Where those numbers came from

**Do:** editor, open `api/src/x402.ts`, highlight lines 16-32.

**Say:**
> "This is our entire price config. Look at what's *missing*: there's no asset id and no decimal conversion. Just the string `$0.02` and a network. The comment says why — GoPlausible's own reference examples omit `asset` and let the scheme's money parser resolve the network's canonical stablecoin. So the `10458941` and the `20000` you just saw are the protocol talking to the facilitator. If GoPlausible changed the TestNet USDC asset id tomorrow, this file wouldn't need an edit.
>
> One line up" — highlight `x402.ts:11-14` — "we register **only** the network this process is configured for. A testnet process cannot accidentally accept a mainnet-signed payment. That's four lines of code and it's the kind of thing you only add if you've thought about what happens when you're wrong."

---

### Beat 4 (expanded, 45s) — Settle, then cross-check against the indexer

After the payment lands and you've clicked through to Lora, go back to Terminal B:

```bash
curl -s https://testnet-idx.algonode.cloud/v2/transactions/OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ \
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

**Expected output** (verified live during authoring):
```
type    : axfer
round   : 66091768
fee     : 0
asset   : 10458941
amount  : 20000
sender  : 2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE
receiver: 2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE
```

**Say:**
> "Straight from the indexer, not from the facilitator's response — we don't take settlement confirmations on faith. Asset transfer, twenty thousand base units, exactly the two cents from the header. Fee zero: the facilitator sponsored it.
>
> And I'll point at the awkward line before you do. Sender and receiver are the same address. That was our own proof run — we paid ourselves, because it needed one funded account instead of two. It's a genuine facilitator-settled x402 payment with no special-casing, but it is a self-payment, and it's the only settled payment that exists. It's disclosed in section six of our proof log, in writing, before anyone asked."

**Why say the awkward part:** you have just spent four minutes establishing that everything you claim checks out. Volunteering the one weak fact is what makes that claim credible. If a judge finds it themselves, every other number you showed becomes suspect.

---

### Beat 5b **[+]** (30s) — Why box storage, and how the key is derived

**Do:** editor, `contracts/smart_contracts/consent/contract.py`, highlight lines 95-98 then 114-116.

**Say:**
> "That grant lives in a box, keyed by `sha256(patient ‖ requester ‖ scope)` — thirty-two bytes, fixed length, one box per triple. Box storage rather than local state, deliberately: Algorand local state would require every requester — including a stranger's read-only agent — to *opt in* to our application before they could hold a grant. That's absurd for a pay-per-call endpoint. Boxes let any triple exist without either side opting in to anything except the box's minimum balance, which the app account funds itself.
>
> And `scope` is a free-form string, not an enum. Adding a fourth endpoint with a new scope needs zero contract changes and zero redeployment."

**If you have an extra ten seconds, add the part that used to be an admission and is now a boast:**
> "The cost of that design is that the key derivation exists three times — Python in the contract, Node in the backend, WebCrypto in the browser — and if any one of them drifts, a grant written by the browser becomes silently unreadable by the backend. No error, just `false`. So all three now read the same golden-vector fixture: `api/test/fixtures/box-key-vectors.json`, asserted by the TypeScript suite *and* by the Python contract tests. Three languages, one set of expected bytes, checked on every run."

*(That is the strongest ten seconds available in the 5-minute version. It shows you found a class of silent failure in your own design and closed it, rather than shipping three implementations and hoping.)*

---

### Beat 7 **[+]** (20s) — Security, demonstrated rather than described ★ *the beat nobody else has*

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

**If the script fails on stage:** open tab 7. `contracts/artifacts/g01-verification.json` records `"blocked": true` and `"result": "CLOSED"` from a real run, with the grant transaction id. Say *"that's the run from this morning — same attack, same 403"* and move on.

---

### Beat 7b (reserve) — Known limitations, volunteered

Hold this for Q&A, or use it if you are ahead of the clock. It is the single most differentiating thirty seconds available to you.

**Do:** browser tab 3, type `I have no chest pain` into the symptoms box while you talk. **Do not pay** — the point is the input, and you can read the scorer's behaviour without spending two cents. *(If you want it live and have the USDC, pay it; the impact is higher.)*

**Say:**
> "Four things I'd rather tell you than have you find.
>
> One — watch this input: *'I have no chest pain.'* Thirty-five. Urgent. Substring matching has no notion of negation. That's the price of picking rules you can audit over a model you can't, and it's a screening trigger, not a diagnosis, which is exactly why every response ships a disclaimer that a unit test enforces.
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
| **MainNet** | Not deployed. Deliberate. | "TestNet only. MainNet is real money and it's literally the act of entering under our own identity — we documented why we deferred it rather than doing it half-way." |
| **Public URL / Bazaar / leaderboard** | Pending. | "Not hosted yet. That's a deployment gap, not a design gap — and it's why we have our own payments instead of other people's." |
| **Payment volume** | Real settled payments, all of them ours. | Beat 4's disclosure covers it. Say it before you're asked. |
| **A second party's payment** | None. | "Nobody but us has paid for this. There's no public URL for them to pay." |
| **The deployed contract carrying our contract fixes** | Fixed in source; **redeploy deliberately deferred.** | "The App ID you're looking at runs the pre-fix bytecode, on purpose — our deploy path mints a new App ID, so redeploying would throw away this contract's whole history. Both defects are non-exploitable, both are fixed in `contract.py`, and there are three regression tests we ran against the old code first to watch them fail." **Volunteer this; it is the sharpest question available to a prepared judge.** |
| **Observability** | None (G-15). | "No metrics, no tracing, no alerting. There's a health endpoint and three structured error events, and nothing consumes them. We'd find out from a user. It's in our gap report." |
| **Frontend tests** | None exist. | "Zero. No Playwright, no Vitest on the frontend. Seventy-three tests, all backend and contract." |
| **Load / latency numbers** | No benchmark exists (G-24). | "None. Not a p50, not a p95, nothing — anything I could measure would be a laptop and you'd be right to discount it. And the deployment is pinned to one machine on purpose, because the audit-sequence lock is in-process." |
| **Real patient data** | Synthetic constant only. | "One fixed synthetic record, returned regardless of patient id. There is no patient datastore — this proves the permission layer, not the storage layer." |
| **Negation handling in triage** | **Measured:** `"I have no chest pain"` → score 35, band `urgent`. Not handled. | "Substring matching, no notion of polarity. Screening trigger, not a diagnosis. Fix is scoped." **Volunteer this in the 5-minute version (Beat 7b) rather than waiting to be caught.** |
| **Short-token interaction matching** | **Measured:** `["a","b"]` → 5 matches; `["in","as"]` → 4, including `warfarin+aspirin`. Unanchored containment. | "Two letters produce four severe warnings, and our own test calls that input and asserts only the disclaimer. Two fixes, both on the list." |

---

## Risk register for the demo itself

Detection, fallback, and the exact words. Operational detail and pre-flight checks are in [`Demo_Runbook.md`](Demo_Runbook.md).

| Risk | Detection | Fallback | Say |
|---|---|---|---|
| Facilitator unreachable | Beat 2 returns **503** with `Retry-After: 30` and code `PAYMENT_FACILITATOR_UNAVAILABLE`, not 402 | Skip to Beat 8 (indexer) and tab 5 (pre-loaded payment) | "That's our facilitator being unreachable — and notice we tell you it's retryable rather than five-hundred-ing at you, because our callers are agents and the difference between 'come back' and 'this is dead' matters. The asset id and fee-payer come from the facilitator's `/supported`, so we genuinely can't build a 402 offline. Here's a payment that settled through it earlier, on the public ledger." |
| Demo wallet has no USDC | Beat 4 shows **HTTP 402**, and the UI explains it | The UI's own text is the fallback; switch to tab 5 | "Signed but not settled — the wallet's out of test USDC. The transaction was real; the money wasn't there. Here's one that did settle." |
| AlgoNode slow or down | Beats 5/8 hang >10s | Tabs 4 and 5 are pre-loaded; use those | "Public node's lagging. These pages are the same data, loaded a few minutes ago." |
| `txn dead: round X outside Y--Z` | Consent grant/revoke errors in the UI | Retry once; if it fails again, move on | "Validity-window timeout from sequential round-trips — not a logic bug. Our scripts set a wide validity window for exactly this." |
| Venue Wi-Fi dies | Everything hangs | Tabs 4, 5 and `contracts/artifacts/e2e-proof.json` in tab 7 | "I'll show you the artefacts I captured this morning — every one has a transaction id you can check yourself later." |
| API not running | Beat 2 returns connection refused | Terminal A: `cd api && npm run dev`, wait ~3s | Keep talking through Beat 1's content while it boots. Never watch a spinner in silence. |
| Judge asks the payer-binding question mid-demo | — | Answer immediately — and **offer to show it**, do not defer | "The payment *is* the authentication — we recover the address that signed it and 403 on a mismatch. Terminal C, I'll run the attack right now." Then run `verify-g01-fix.ts`. This used to be the question that ended the demo; it is now the one you want. `Winning_Strategy.md` §5, first row. **Never say "I'll come back to that."** |
| Judge asks whether the deployed contract has the fixes in it | — | Answer immediately and completely | "No — deliberately. Redeploying mints a new App ID and we'd lose this contract's history. Both defects are non-exploitable, fixed in source, with regression tests we ran against the old code first." **Do not hedge; a partial answer here is worse than the full one.** |
| **A judge types a negation into the symptoms box** — e.g. `I have no chest pain` | Screen shows `score: 35`, `band: "urgent"` (measured 2026-08-21) | None. It will do this. Own it in one breath, then move on | "Yep — thirty-five, urgent. Substring matching has no notion of negation, and that's the cost of choosing rules you can audit over a model you can't. It's a screening trigger, not a diagnosis, which is why every response carries a disclaimer a unit test enforces. Leading-negator detection is on the list." **Do not act surprised.** |
| **A judge types short/garbage medications** — e.g. `a, b` or `in, as` | Interaction endpoint returns `flagged: true` with 5 and 4 matches respectively (measured), including `warfarin+aspirin` and `simvastatin+clarithromycin` | None. Own it, and volunteer the sharper half | "Five matches from two single letters — the containment test is unanchored in both directions. And the part that should bother you more than the bug: our own test file calls exactly that input and only asserts the disclaimer, so the suite executes it every run and can't see it. That's on the fix list as two changes, not one." |

**Universal rule:** if any live command fails twice, stop trying. Move to the pre-loaded explorer tab and say *"that's live infrastructure being live infrastructure — here's the same thing from ten minutes ago."* Judges forgive network failures. They do not forgive four minutes of watching you retry.
