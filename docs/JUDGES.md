# MedRail — For Judges

## The agent problem, which is the whole pitch

An AI agent triaging a patient case needs three things: **symptom triage**, a **drug-interaction
check**, and the **patient's actual record**. Today that is three vendor signups, three API keys and
three billing relationships — and even after all of it the agent still cannot legally touch the
record, because nobody can prove the patient allowed it.

MedRail sells all three **per call, over x402**, settled in USDC on Algorand. The record endpoint
adds the part no API key can give you: it is gated by a consent grant **the patient signed with
their own key on-chain**, and every access appends an immutable entry to that patient's audit trail.
So a single paid call is three things at once — a settled stablecoin payment, an on-chain
authorisation decision, and an audit append. **That composition is the contribution.**

This is machine-to-machine by construction, not by aspiration. The two open endpoints exist because a
consent-gated-only service cannot generate payment volume: one patient granting one clinician access
a few times a year is not usage. So two open endpoints any stranger's agent can pay for in one round
trip carry the volume, one consent-gated endpoint carries the ownership proof, and both share a
single Algorand contract as the trust layer. (The two open endpoints are deterministic rule engines,
not models — a deliberate safety choice we explain rather than paper over, in
[`09_Intelligence_Layer/`](09_Intelligence_Layer/).)

## Watch an agent do it — one command, no human in the loop

```bash
cd api && npx tsx scripts/agent-demo.ts
```

A clinical triage agent with **no MedRail account, no API key, and no prior relationship** with the
service. Nothing about MedRail is hardcoded in it except the base URL. It pays from **its own
wallet** — `UYBTLPHS…`, a keypair this service does not hold — and the patient who authorised the
gated call is a **third** account again, `56LFG5EE…`, which is neither the payer nor the payee.
Three roles, three accounts, three separate keypairs.

| # | What the agent does | Cost |
|---|---|---|
| 1 | **Discovers** the service — reads `GET /`, learns 8 endpoints, their prices, which are gated, the consent contract's App ID `768743428`, and the ARC-56 spec URL it would need to build its own ABI client | free |
| 2 | Pays for triage → `band=EMERGENCY score=70`, flags *possible cardiac chest pain · respiratory distress* | $0.02 |
| 3 | Pays for the interaction check → `MAJOR: warfarin + aspirin` — anticoagulant plus antiplatelet, which materially changes management of a suspected cardiac event | $0.02 |
| 4 | **Checks the free consent oracle before spending on the gated endpoint** — `GET /v1/consent/status` → `granted=true` | $0.00 |
| 5 | Pays for the record summary → `consentVerifiedOnChain: true`, `auditStatus: recorded` | $0.05 |
| 6 | Synthesises one assessment and reports exactly what it spent | — |

**$0.09 total, across 3 settled Algorand transactions. Zero accounts created, zero API keys issued,
zero invoices.** Every payment is a real transaction on a public ledger, sent by the agent to
`payTo`:
[$0.02 triage](https://lora.algokit.io/testnet/transaction/DOSKCNKJRXIMY2UDSDZ377LKPZQIZJW5JHCGUAGKOYV6KUCFYKIA) ·
[$0.02 interaction](https://lora.algokit.io/testnet/transaction/PLBFDDADW576IUCH62HGGYI4AJQNO3QXSENNDIBKAORWVMP7NVHQ) ·
[$0.05 record](https://lora.algokit.io/testnet/transaction/COMJ3TQOGTKP6LXDJS7HZY7B45QZJQWXXJ23HQ3IDDQYD7GRK36A) —
and the third call appended
[the audit entry](https://lora.algokit.io/testnet/transaction/E6ZTGEAOTLJQDYOUVBYJYL7LKTXHBGXGVTBKN3SR2NUPWJ2PIGQA)
to the patient's on-chain trail, naming the agent as the requester.
The indexer shows sender `UYBTLPHS…` and receiver `2WDV2J2F…` on those transactions: different
accounts, `fee: 0`, facilitator-sponsored.

**Step 4 is the beat worth pausing on: the agent refuses to spend money to be told no.** The consent
oracle is free precisely so an agent can find out whether it is allowed *before* it pays. If the
grant is not active, the agent declines the gated call, spends nothing, and reports what it has.
That is the difference between an agent that reasons about cost and a script that retries.

## What's real right now (not "planned" — built, tested, and linked)

| Claim | Evidence |
|---|---|
| Smart contract compiles and passes tests | `docs/PROOF.md` §1 — 28/28 passing against the official AVM simulator, including three regression tests verified to fail against the pre-fix code |
| Contract deployed live on Algorand TestNet | `docs/PROOF.md` §5 — App ID `768743428`, independently checkable on the public indexer and on [Lora](https://lora.algokit.io/testnet/application/768743428) |
| Full consent lifecycle proven live on-chain | `docs/PROOF.md` §5 — request → grant → `check_access=True` → revoke → `check_access=False`, every state-changing step a real confirmed transaction |
| x402 is wired to the real, live facilitator | `docs/PROOF.md` §3 — a real decoded `402` response matching the facilitator's own live `/supported` data, including the correct `$0.02 → 20000` unit conversion |
| Browser-side payment signing genuinely works | `docs/PROOF.md` §4 — a captured real network sequence: TestNet transaction params fetched live, transaction signed in-browser, submitted to the facilitator |
| **A real payment settled end to end** | `docs/PROOF.md` §6 — `200 OK`, a real triage response, and a real settled TestNet USDC transaction, independently confirmed on the public indexer: [`OYRQRKYA...`](https://lora.algokit.io/testnet/transaction/OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ) |
| **The deployed contract is the source you can read** | `docs/PROOF.md` §7 — `contract.py` compiles reproducibly to the committed TEAL, which assembles to bytecode **byte-identical** to the program deployed at App `768743428`. Two runnable commands; no trust in us required |
| **An autonomous agent discovered, used and paid for the service** | `api/scripts/agent-demo.ts` — one run, $0.09, three settled TestNet transactions, no account and no API key: [`DOSKCNKJ…`](https://lora.algokit.io/testnet/transaction/DOSKCNKJRXIMY2UDSDZ377LKPZQIZJW5JHCGUAGKOYV6KUCFYKIA), [`PLBFDDAD…`](https://lora.algokit.io/testnet/transaction/PLBFDDADW576IUCH62HGGYI4AJQNO3QXSENNDIBKAORWVMP7NVHQ), [`COMJ3TQO…`](https://lora.algokit.io/testnet/transaction/COMJ3TQOGTKP6LXDJS7HZY7B45QZJQWXXJ23HQ3IDDQYD7GRK36A) — `docs/PROOF.md` §10 |
| **The payer is a separate party from the payee** | `docs/PROOF.md` §10 — the agent runs on its own keypair (`UYBTLPHS…`), provisioned by `api/scripts/provision-agent-wallet.ts` and opted in to USDC by [itself](https://lora.algokit.io/testnet/transaction/KOALP5W2EDFXU5DRDOTUZYQBLWBOJZVKVOXBG6Y7YZYCSPAQM5PA). The indexer confirms sender ≠ receiver on the settled payments. Its float was seeded from our wallet — see the open items below |
| **The consent grant is signed by an account that is neither the payer nor the payee** | `docs/PROOF.md` §10 — the patient (`56LFG5EE…`, provisioned by `api/scripts/provision-patient-wallet.ts`) grants the agent (`UYBTLPHS…`) scope `records:summary` in [`IG4XEBTM…`](https://lora.algokit.io/testnet/transaction/IG4XEBTMRCKI724ZVHSYUN4ECTYBXAGZM5N35NP4Y3ZVWECG7WUQ), signed with the patient's own key via `api/scripts/grant-consent.ts`. The backend is not in that path, and the `payTo` address is a third account entirely |
| Full test suite | **73** automated tests (28 contract + 45 API), all passing — including a live-attack regression suite for the consent gate and cross-language box-key parity vectors |

Every claim in the table above is independently checkable right now, and every one was
re-verified against the public indexer during the 2026-08-21 engineering review rather than taken
from this repository's own word.

**The full composition is proven on-chain.** A single paid call to `/v1/records/summary` produced
three real transactions: the patient's `grant_access` ([`M26NPR32…`](https://lora.algokit.io/testnet/transaction/M26NPR32Z5YBLBBMZDTBQL6Y7EUSNS5YV4PXYEUBXIVJQGVJ3MAA)),
a settled $0.05 x402 payment ([`5DKFUULW…`](https://lora.algokit.io/testnet/transaction/5DKFUULWLTNGKLYLH3TT44F22MHKOFRCEO6K4JVEPOPETFBYOESA)),
and the immutable audit entry ([`4YLKLQKK…`](https://lora.algokit.io/testnet/transaction/4YLKLQKKWXXFW3UT5APJVYKXI7T7A6OACTAWCC5YBAN3XGOGHRVQ), sequence 1).
The contract's `total_audit_entries` went from 0 to 1, verifiable on any public indexer. Reproduce
it with `npx tsx scripts/e2e-consent-proof.ts` — see [`PROOF.md`](PROOF.md) §9.

**The payment is the authentication.** The endpoint recovers the address that signed the x402
payment and refuses the request unless it matches the `requesterAddress` whose consent it checks —
so a stranger cannot pay the fee and impersonate an authorised requester.
`api/scripts/verify-g01-fix.ts` runs that exact attack against live TestNet and asserts the 403,
with a control call proving the legitimate path still works.

**What is still open, stated here rather than left to be discovered:** payments now settle between
**independent accounts** — the agent pays from its own keypair, which this service does not control,
and the grant that authorises the gated call is signed by a third account that is neither the payer
nor the payee — **but both of those wallets were funded from our own**, because TestNet ALGO and
USDC have no other practical source. **No external or unrelated party has paid for this service.**
The mechanism is proven; the demand is not, and that is a distribution gap rather than a payment one.
**Nothing is publicly hosted yet**, so the challenge's public-endpoint requirement is still open,
and there is no MainNet deployment. **There is no Bazaar listing either** — the discovery extension
*is* implemented and the `x402-global-challenge` tag *is* emitted on every 402
([`05_API/Bazaar_Discovery.md`](05_API/Bazaar_Discovery.md)), but a resource is catalogued only when
a paid call is verified against a publicly reachable URL, and ours is `localhost`.
There is **no machine-learning model anywhere in this system** — the two open endpoints are
deterministic rule engines, deliberately. The full register of 34 findings, 22 of them closed, is in
[`ENGINEERING_GAP_REPORT.md`](ENGINEERING_GAP_REPORT.md).

## Live demo script (2 minutes)

The full beat-by-beat scripts, with expected output and fallbacks, are in
[`11_Hackathon/Demo_Script.md`](11_Hackathon/Demo_Script.md); the shot list for the 3-minute
submission video is in [`11_Hackathon/Demo_Video_Script.md`](11_Hackathon/Demo_Video_Script.md).

1. **Run the agent.** `cd api && npx tsx scripts/agent-demo.ts`. Narrate the five steps in the table
   above as they scroll: discovery from `GET /`, two paid calls, the **free** consent check, then the
   gated call. Land on the ledger at the end — *$0.09, three settled transactions, no account.*
2. **Open one of the transaction links** the agent printed. It goes to a public block explorer, not
   to our UI: `axfer`, asset `10458941` (TestNet USDC), **20000** base units — exactly $0.02 at six
   decimals — and `fee: 0`, because the facilitator sponsors it. The agent needed USDC and no ALGO.
   Nothing in our codebase hardcodes that asset id or that conversion. **Point at the sender and
   receiver fields while the page is open** — `UYBTLPHS…` paying `2WDV2J2F…`, two different
   accounts, with the patient `56LFG5EE…` a third one — and say in the same breath that we funded
   both of those wallets ourselves because TestNet money has nowhere else to come from.
3. **Run the attack.** `npx tsx scripts/verify-g01-fix.ts` pays with one key while claiming another
   authorised requester's address, and gets **403** — then a control call with a matching identity
   returns the record. **The payment is the authentication.** Consent grants are public on-chain, so
   valid `(patient, requester)` pairs are enumerable; without this binding anyone who paid could read
   as anyone authorised.
4. **Supporting shot, if there is time:** the browser demo (`npm run dev` in `web/` against a running
   `api/`) shows the same protocol driven by a human — grant, check status, revoke, all signed
   client-side against `MedRailConsent`, with the backend never touching a key. It is the human view
   of a machine-to-machine service, not the product.
5. Point at the pricing table — three priced endpoints, one `payTo` address: this is a
   **Composite** entry per the official rules, honestly labeled as such in `docs/COMPLIANCE.md`.

## Why this design, specifically, for *this* challenge

The official rules score real usage (payment volume, measured automatically via the facilitator
over an unannounced window) alongside use-case quality, technical execution, and long-term
potential — not demo polish. Every architectural choice in `docs/ARCHITECTURE.md` traces back to
that: open endpoints for volume, a shared consent layer for the ownership story, no asset ID or
network hardcoded so the same contract generalizes past this one demo, and an honest
Composite-entry classification with a described (not overclaimed) path to Orchestrator.

The buyer we designed for is an agent, and the surface shows it. `GET /` is a machine-readable
catalogue with prices, gates, the App ID and the ARC-56 spec URL, so a caller can build an ABI client
against the contract without cloning this repository. A facilitator outage returns **503** with
`Retry-After` and `retryable: true` rather than an opaque 500, because an agent that reads a 500
marks an endpoint dead and never calls again. The consent oracle is free so an agent can find out
whether it is allowed before it pays. And the audit write is deliberately *not* bundled into the
client's signed payment group — bundling would force every caller to know our App ID and method
signatures, which would make us uncallable by an off-the-shelf `@x402/fetch` client and destroy the
volume strategy. `agent-demo.ts` is the executable check on all of it.

## Where to look for more

- `api/scripts/agent-demo.ts` — the autonomous agent above, ~270 lines, readable in five minutes
- `api/scripts/provision-agent-wallet.ts` — creates the agent's independent wallet, funds it, opts
  it in to USDC and sends it a $1.00 float; run once, before the agent demo
- `api/scripts/provision-patient-wallet.ts` — creates the third keypair, the patient's, and funds it
  with ALGO only; it never pays for anything, it only signs grants. Neither provisioning script
  writes key material to disk
- `api/scripts/grant-consent.ts` — the patient granting that agent access, signed with the patient's
  own key and submitted straight to Algorand, with the backend nowhere in the path
- `docs/05_API/Bazaar_Discovery.md` — what the discovery extension does, what is wired, and the one
  manual step still between this service and a Bazaar listing
- `docs/11_Hackathon/Demo_Script.md` — the 2- and 5-minute demo runs, beat by beat
- `docs/11_Hackathon/Demo_Video_Script.md` — the shot list for the 3-minute submission video
- `docs/ARCHITECTURE.md` — full technical design and the reasoning behind each decision
- `docs/COMPLIANCE.md` — rule-by-rule mapping to the official Global x402 Challenge requirements
- `docs/PROOF.md` — the evidence log this page summarizes
- `docs/SECURITY.md` — key handling, PHI-never-on-chain design, known limitations stated plainly
- `contracts/smart_contracts/consent/contract.py` — the entire on-chain trust layer, ~250 lines,
  readable in five minutes
- [`00_EXECUTIVE_SUMMARY.md`](00_EXECUTIVE_SUMMARY.md) — the whole project in two minutes
- [`ENGINEERING_GAP_REPORT.md`](ENGINEERING_GAP_REPORT.md) — every weakness we found in our own
  system, with severities and fixes, from an adversarial review
- [`11_Hackathon/Judge_Evaluation.md`](11_Hackathon/Judge_Evaluation.md) — a hostile scoring of
  this submission, including why it could lose
- [`README.md`](README.md) — the full documentation index (product, requirements, architecture,
  data, API, security, testing, deployment, intelligence layer, operations)
