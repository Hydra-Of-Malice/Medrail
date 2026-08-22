# MedRail — 3-Minute MVP Demo Video Script

**Purpose:** A shot-by-shot script for the ≤3 minute submission video, built around the
machine-to-machine story the judges asked for.

**Status of this document:** Ready to record. Every command shown has been executed and produces the
output quoted. Timings are rehearsed estimates.

---

## Before you hit record

- [ ] API running: `cd api && npx tsx src/index.ts`
- [ ] Wallet funded — check with the balance query in [`Demo_Runbook.md`](Demo_Runbook.md). You need
      roughly **$0.11 USDC** for one full run (agent demo $0.09 + a spare call) and a little ALGO.
- [ ] Facilitator reachable: `curl https://facilitator.goplausible.xyz/supported`
- [ ] Terminal font large enough to read at 1080p. Dark theme, wide window.
- [ ] Browser tabs pre-opened, in this order:
      1. The GitHub repo
      2. [Lora — App 768743428](https://lora.algokit.io/testnet/application/768743428)
      3. A blank Lora transaction tab (you'll paste into it)
- [ ] Close Slack, mail, notifications.
- [ ] **Do a full dry run first.** The agent demo spends real TestNet USDC each time.

---

## The script

### 0:00 – 0:25 — The problem, stated as an agent problem

> *"An AI agent triaging a patient case needs three things: symptom triage, a drug-interaction
> check, and the patient's actual record.*
>
> *Today that's three vendor signups, three API keys, three billing relationships — and even then
> the agent can't legally touch the record, because nobody can prove the patient allowed it.*
>
> *MedRail sells all three per call over x402. And the record is gated by consent the patient signed
> themselves, on Algorand."*

**On screen:** the README's opening section.

---

### 0:25 – 1:35 — The agent does it live *(the centrepiece — give it the most time)*

**Run:**
```bash
cd api && npx tsx scripts/agent-demo.ts
```

Narrate over the output as it scrolls. Do not read it out — point at what matters.

> *"No account. No API key. The agent has never seen this service before.*
>
> *First it discovers it — reads `GET /`, learns there are eight endpoints, the prices, which ones
> are gated, and the App ID of the consent contract. Nothing is hardcoded.*
>
> *Chest pain and shortness of breath — it pays two cents for triage. Emergency, score 70.*
>
> *Two medications — another two cents. Warfarin plus aspirin, major bleeding risk. That changes how
> you manage a suspected cardiac event.*
>
> *Now the record. That one's consent-gated — so before it spends anything, it checks the **free**
> consent oracle. Grant is active. Only now does it pay five cents.*
>
> *Consent verified on-chain. And the access was written to the patient's own audit trail.*
>
> *Nine cents. Three settled Algorand transactions. Zero accounts, zero API keys, zero invoices."*

**Key beat:** pause on the free consent check. *"It refused to spend money to be told no."* That
single decision is what separates an agent that reasons about cost from a script.

---

### 1:35 – 2:05 — Prove it on-chain

Copy one transaction link from the agent's output. Paste into the Lora tab.

> *"That's the actual payment. Asset 10458941 — TestNet USDC. Twenty thousand base units, which is
> exactly two cents at six decimals. Fee zero, because the GoPlausible facilitator sponsors it — the
> agent needs USDC, not ALGO."*

Switch to the audit transaction link.

> *"And this is the audit entry the paid call produced. An append-only record on the patient's own
> trail. Not a log file we could edit — we can't delete this."*

Switch to the App tab.

> *"The contract. Five audit entries, four active grants. All independently checkable."*

---

### 2:05 – 2:35 — The security beat *(this is the differentiator — do not skip it)*

**Run:**
```bash
npx tsx scripts/verify-g01-fix.ts
```

> *"Here's the obvious attack. Consent grants are public on Algorand, so anyone can look up a valid
> patient-and-requester pair. So — pay with my own key, but claim to be that authorised requester.*
>
> *403. Rejected.*
>
> *Because the endpoint recovers the address that actually signed the payment and refuses unless it
> matches. **The payment is the authentication.** No API key can do that.*
>
> *And the control run — same payer, own address — still works."*

---

### 2:35 – 3:00 — Close

> *"Everything you just saw is on a public repo with a full engineering write-up: architecture
> decisions, a STRIDE threat model, 73 tests, and an honest gap report listing what's still weak.*
>
> *We found that impersonation bug ourselves, in our own review, and fixed it before submitting.*
>
> *MedRail: clinical services an agent can discover, use, and pay for — where the patient, not us,
> decides who gets in."*

**End card:** repo URL · App ID `768743428` · x402 on Algorand TestNet via GoPlausible.

---

## If something fails mid-record

| Failure | What to say | Recovery |
|---|---|---|
| Agent errors on payment | *"That's a live network — let me re-run"* | Check USDC balance; re-run |
| Facilitator down | *"Payment facilitator is having a moment — here's the same run from earlier"* | Cut to a pre-recorded take |
| Consent shows `granted=false` | *"Grant lapsed — one transaction to restore"* | `npx tsx scripts/e2e-consent-proof.ts` re-grants |
| Lora slow to index | *"It settles in about three seconds; the explorer takes a moment"* | Keep talking, refresh |

**Record a clean backup take of the agent demo before the live one.** If anything breaks on the
day, you cut to it and nobody can tell.

---

## What to cut if you overrun

In this order — the first items cost the least:

1. The App-ID tab in the on-chain section (transaction links alone carry it)
2. The control run in the security beat (the 403 is the point)
3. The interaction-check narration (let the output speak)

**Never cut:** the discovery step, the free consent check before spending, or the 403. Those three
are the entire argument.
