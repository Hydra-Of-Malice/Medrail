# MedRail — For Judges

## The pitch, in three sentences

Most "patient-owned records" submissions to this challenge will be a consent toggle with a
payment wall bolted in front of it — technically correct, and structurally unable to generate
real leaderboard volume, because one patient granting one doctor access a few times a year is
not "real usage." MedRail instead splits into two open, broadly-useful, x402-gated
clinical-intelligence endpoints that any agent can call and pay for in one round trip, plus one
consent-gated endpoint that proves the patient-ownership story on-chain — sharing a single
Algorand smart contract as the trust layer underneath both. (Those two endpoints are deterministic
rule engines, not models — a deliberate safety choice we explain rather than paper over, in
[`09_Intelligence_Layer/`](09_Intelligence_Layer/).) Payment isn't a gate in front of the product; it *is* the product's
rate-limiting and monetization mechanism, on both halves.

## What's real right now (not "planned" — built, tested, and linked)

| Claim | Evidence |
|---|---|
| Smart contract compiles and passes tests | `docs/PROOF.md` §1 — 14/14 passing against the official AVM simulator |
| Contract deployed live on Algorand TestNet | `docs/PROOF.md` §5 — App ID `768743428`, independently checkable on the public indexer and on [Lora](https://lora.algokit.io/testnet/application/768743428) |
| Full consent lifecycle proven live on-chain | `docs/PROOF.md` §5 — request → grant → `check_access=True` → revoke → `check_access=False`, every state-changing step a real confirmed transaction |
| x402 is wired to the real, live facilitator | `docs/PROOF.md` §3 — a real decoded `402` response matching the facilitator's own live `/supported` data, including the correct `$0.02 → 20000` unit conversion |
| Browser-side payment signing genuinely works | `docs/PROOF.md` §4 — a captured real network sequence: TestNet transaction params fetched live, transaction signed in-browser, submitted to the facilitator |
| **A real payment settled end to end** | `docs/PROOF.md` §6 — `200 OK`, a real triage response, and a real settled TestNet USDC transaction, independently confirmed on the public indexer: [`OYRQRKYA...`](https://lora.algokit.io/testnet/transaction/OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ) |
| **The deployed contract is the source you can read** | `docs/PROOF.md` §7 — `contract.py` compiles reproducibly to the committed TEAL, which assembles to bytecode **byte-identical** to the program deployed at App `768743428`. Two runnable commands; no trust in us required |
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

**What is still open, stated here rather than left to be discovered:** every payment so far is a
**self-payment** from our own account — the mechanism is proven, third-party volume is not — and
**nothing is publicly hosted yet**, so the challenge's public-endpoint requirement is still open.
The full register of 34 findings, 22 of them closed, is in
[`ENGINEERING_GAP_REPORT.md`](ENGINEERING_GAP_REPORT.md).

## Live demo script (2 minutes)

1. Open the deployed frontend (or `npm run dev` in `web/` against a running `api/`).
2. Point at the network badge — it's reading real backend state, not a static claim.
3. Click "AI symptom triage score" → "Pay $0.02 and call live." Watch the request panel: a real
   402, a real signed Algorand transaction constructed in the browser, a real settlement attempt
   against the live facilitator.
4. Open "On-chain consent" → "Grant myself access," then "Check status" — a real app-call
   transaction against `MedRailConsent`, signed by the demo wallet, visible on a block explorer
   via the linked transaction ID.
5. Point at the pricing table — three priced endpoints, one `payTo` address: this is a
   **Composite** entry per the official rules, honestly labeled as such in `docs/COMPLIANCE.md`.

## Why this design, specifically, for *this* challenge

The official rules score real usage (payment volume, measured automatically via the facilitator
over an unannounced window) alongside use-case quality, technical execution, and long-term
potential — not demo polish. Every architectural choice in `docs/ARCHITECTURE.md` traces back to
that: open endpoints for volume, a shared consent layer for the ownership story, no asset ID or
network hardcoded so the same contract generalizes past this one demo, and an honest
Composite-entry classification with a described (not overclaimed) path to Orchestrator.

## Where to look for more

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
