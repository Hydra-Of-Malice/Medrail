# MedRail — Compliance with the Global x402 Challenge Submission Requirements

This document maps every item on the organisers' **official submission requirement list** to
exactly how MedRail satisfies it, and states plainly which two items are **not satisfied yet**.
Sources: the official challenge page (`algorand.co/global-x402-challenge`), the Official Rules PDF,
and the submission requirements published by the organisers. Every "✅ Done" below is
independently checkable by running the referenced command or opening the referenced link.

**Repository:** <https://github.com/Hydra-Of-Malice/Medrail>

---

## ⛔ What is still missing — read this first

Two requirements are **hard blockers**. Neither is partially done. Without them the submission is
incomplete regardless of how strong everything else is.

| # | Blocker | Current reality | Who unblocks it | Est. |
|---|---|---|---|---|
| **2** | **Live and working project, deployed and accessible** | **Nothing is publicly hosted.** MedRail runs on `localhost:4021` only. `api/fly.toml`, `api/Dockerfile` and `web/Dockerfile` are committed and corrected, but `fly deploy` has never been run. There is no public URL a judge can open. | The team — needs a Fly.io account and a Vercel account | ~25 min API + ~10 min web |
| **3** | **MVP demo video, max 3 minutes, YouTube or public Google Drive link** | **No video exists.** The shot-by-shot script is written and rehearsed-timed ([`11_Hackathon/Demo_Video_Script.md`](11_Hackathon/Demo_Video_Script.md)); nothing has been recorded, edited, uploaded, or made public. | The team | ~60–90 min including a backup take |

Both are walked step by step in [`GO_LIVE_CHECKLIST.md`](GO_LIVE_CHECKLIST.md), with commands in
[`08_Deployment/GO_LIVE_RUNBOOK.md`](08_Deployment/GO_LIVE_RUNBOOK.md).

Three further things are **not required by the new submission list** but are still not true, and
must not be claimed anywhere:

- **No MainNet deployment.** The contract exists only on TestNet (App `768743428`).
- **No Bazaar listing yet.** The discovery extension *is* implemented as of 2026-08-22 —
  `api/src/x402.ts:4-8, 50-52` imports and registers `bazaarResourceServerExtension` from
  `@x402/extensions/bazaar`, every priced route declares its real input/output shape, and the
  `x402-global-challenge` tag is emitted in both `resource.tags` and `accepts[].extra.tag`. But
  listing is a *side effect of a paid call against a publicly reachable URL*, not a registration
  API, so nothing appears in the catalogue while the service runs only on `localhost`. Confirmed
  absent 2026-08-22 from a 500-record sample of the live catalogue. One paid call against the
  deployed URL is all that is outstanding — see
  [`05_API/Bazaar_Discovery.md`](05_API/Bazaar_Discovery.md) §7.
- **No external party has paid for this service.** Payments now settle between *independent*
  accounts — patient `56LFG5EE…`, agent `UYBTLPHS…` and service `2WDV2J2F…` are three distinct
  keypairs — but both of those wallets were funded from the project's own account, because TestNet
  ALGO and USDC have no other practical source. Real, settled, on a public ledger, between separate
  parties; still not external revenue, and never described as such.

---

## Submission requirements

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | **Public GitHub repository with a proper README** | ✅ Done | <https://github.com/Hydra-Of-Malice/Medrail> — public, with a full `README.md`. Requirement-by-requirement README breakdown in the next table. |
| 2 | **Live and working project, deployed and accessible** | ⛔ **NOT DONE — hard blocker** | Nothing is hosted. Configs are ready (`api/fly.toml`, `api/Dockerfile`, `web/Dockerfile`); the deploy has never been executed. See the blocker table above and [`08_Deployment/GO_LIVE_RUNBOOK.md`](08_Deployment/GO_LIVE_RUNBOOK.md) §1–§2. |
| 3 | **MVP demo video, max 3 minutes (YouTube or public Google Drive)** | ⛔ **NOT DONE — hard blocker** | Script written and timed to 3:00 — [`11_Hackathon/Demo_Video_Script.md`](11_Hackathon/Demo_Video_Script.md). No recording exists. No link exists. |
| 4 | **x402 payment flow live on Algorand TestNet** | ✅ Done | Multiple real settled TestNet USDC payments through the live flow. Asset `10458941` (TestNet USDC), scheme `exact`, x402 v2. Full log: [`PROOF.md`](PROOF.md) §6 and §9. Reproduce with `cd api && npx tsx scripts/e2e-proof.ts`. |
| 5 | **Demonstrate an actual x402 transaction on Lora** | ✅ Done, multiple | [$0.02 triage](https://lora.algokit.io/testnet/transaction/POAQNSOPPW6TB5DU76VHYZTS7X2SJQRUNVCNR55GRO7TYXOKUF4Q) · [$0.02 interaction](https://lora.algokit.io/testnet/transaction/W3Z55BZYCALOFZFSXI75MR22OVVEX7JRSK7T2NRATKBDU7Y4OL5A) · [$0.05 record](https://lora.algokit.io/testnet/transaction/5CO5XV7M5H6WLFI2D5M7UODUOF2IUQNM3FOSKH5VA66SVQTLBBDQ) · [the audit entry that paid call produced](https://lora.algokit.io/testnet/transaction/5HYV5B2LO5DVHTTAOZMQKJNEYK6VICRVAINAZ5YBVW3QUR64TBKA) · plus the earlier [`OYRQRKYA…`](https://lora.algokit.io/testnet/transaction/OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ) settlement and the [full consent composition](https://lora.algokit.io/testnet/transaction/5DKFUULWLTNGKLYLH3TT44F22MHKOFRCEO6K4JVEPOPETFBYOESA). Plus the autonomous agent run, paid from an **independent** wallet: [$0.02 triage](https://lora.algokit.io/testnet/transaction/DOSKCNKJRXIMY2UDSDZ377LKPZQIZJW5JHCGUAGKOYV6KUCFYKIA) · [$0.02 interaction](https://lora.algokit.io/testnet/transaction/PLBFDDADW576IUCH62HGGYI4AJQNO3QXSENNDIBKAORWVMP7NVHQ) · [$0.05 record](https://lora.algokit.io/testnet/transaction/COMJ3TQOGTKP6LXDJS7HZY7B45QZJQWXXJ23HQ3IDDQYD7GRK36A), sender ≠ receiver on the indexer. Contract itself: [App `768743428`](https://lora.algokit.io/testnet/application/768743428). |
| 6 | **Payment flow through the GoPlausible facilitator** | ✅ Done | `api/src/x402.ts:1-17` constructs `HTTPFacilitatorClient` against `https://facilitator.goplausible.xyz` — no mock, no local stub. Verified live: the facilitator's `/supported` reports Algorand **TestNet and MainNet**, scheme `exact`, x402 **v2**, with fee sponsorship. Settled payments carry `fee: 0` because the facilitator sponsors them — the agent needs USDC, not ALGO. Decoded `PAYMENT-REQUIRED` header in [`PROOF.md`](PROOF.md) §3 matches the facilitator's own `/supported` response field for field. |
| 7 | **`@x402-avm` dependencies in `package.json`** | ✅ Done | `api/package.json`: `@x402/avm`, `@x402/core`, `@x402/extensions`, `@x402/fetch`, `@x402/hono` — all `2.21.0`. `web/package.json`: `@x402/avm`, `@x402/core`, `@x402/fetch`. All five are genuinely imported and executed, including `@x402/extensions` — `api/src/x402.ts:4-8, 50-52` registers `bazaarResourceServerExtension` from the `@x402/extensions/bazaar` subpath, and the extension's `enrichDeclaration` hook is observable in the live 402 challenge (`extensions.bazaar.info.input.method`). See [`05_API/Bazaar_Discovery.md`](05_API/Bazaar_Discovery.md). |
| 8 | **Judges review the code to verify x402 is genuinely integrated, not just mentioned** | ✅ Done | `api/src/app.ts:58-175` gates **three** routes behind `paymentMiddleware` from `@x402/hono`, prices declared in one place. `api/src/x402.ts` registers `ExactAvmScheme` from `@x402/avm/exact/server` against the real facilitator. Client side: `api/scripts/agent-demo.ts` uses `@x402/fetch`'s `wrapFetchWithPayment` and `@x402/avm/exact/client` to actually sign and settle. **Delete x402 from this repo and MedRail has no access control, no rate ceiling, and no monetisation — the payment call *is* the product's core flow, not a paywall in front of a free API.** |

## README requirements

| Required in the README | Status | Where in [`README.md`](../README.md) |
|---|---|---|
| Problem + solution | ✅ Done | "The agent problem this solves" and "Why it matters" |
| Local run / test instructions | ✅ Done | "Quick start" — contract, API, web, each with the exact command; "Testing" for the suites |
| Architecture diagram | ✅ Done | "Architecture" — Mermaid flowchart, renders inline on GitHub |
| ≥1 Algorand TestNet x402 transaction link | ✅ Done | Four Lora links in "Watch an agent actually do it", more in "What is actually proven" |
| The product's USP | ✅ Done | "USP — what makes this different" — five numbered differentiators, plus an explicit "What is *not* novel, stated plainly" |

The README's "Known limitations" block has been corrected to match: it now reads *"No external
party has paid for this service. Payments settle between independent accounts, but the agent's
TestNet float was seeded from our own wallet."* That is the precise claim, and the only one this
project can make about payments today.

---

## Entry type

The rules recognise three entry types:

| Type | Definition | MedRail |
|---|---|---|
| Standard | One paid endpoint | — |
| **Composite** | **Several endpoints sharing one `payTo` address** | **✅ This is MedRail: `/v1/triage` ($0.02), `/v1/interaction-check` ($0.02), `/v1/records/summary` ($0.05) — three priced routes, one `payTo` address (`PAY_TO_ADDRESS`, wired in `api/src/x402.ts`, all three gated in `api/src/app.ts:58-175`).** |
| Orchestrator | A service that itself pays other x402 endpoints | Deliberately not claimed — see [`ARCHITECTURE.md`](ARCHITECTURE.md) "What a v2 Orchestrator layer would add." Not built, not pretended to be built. |

---

## x402 is machine-to-machine — the evidence, executed rather than asserted

The organisers stress that x402 is a **machine-to-machine** protocol, not human-to-machine. MedRail's
strongest single artefact is the one that demonstrates exactly that:

```bash
cd api && npx tsx scripts/agent-demo.ts
```

`api/scripts/agent-demo.ts` is an autonomous clinical-triage agent with **no MedRail account, no API
key, and nothing about MedRail hardcoded except the base URL**. In one run it:

1. **Discovers** the service by reading `GET /` — the eight endpoints, their prices, which are gated,
   the consent contract's App ID, and its ARC-56 spec URL.
2. **Decides** which of the discovered services the clinical case actually requires.
3. **Pays** per call in USDC over x402, settling on Algorand each time.
4. **Checks the free consent oracle before spending** on the gated endpoint — it refuses to pay to
   be told no. That single decision is what separates an agent reasoning about cost from a script.
5. **Reports** exactly what it spent.

Verified run: **$0.09 total across 3 settled Algorand transactions — zero accounts, zero API keys,
zero invoices**, plus a fourth transaction writing the access to the patient's on-chain audit trail.

| Step | Call | Cost | Transaction |
|---|---|---|---|
| Discover | `GET /` | $0.00 | — (free service index) |
| Triage | `POST /v1/triage` | $0.02 | [`DOSKCNKJ…`](https://lora.algokit.io/testnet/transaction/DOSKCNKJRXIMY2UDSDZ377LKPZQIZJW5JHCGUAGKOYV6KUCFYKIA) |
| Interaction check | `POST /v1/interaction-check` | $0.02 | [`PLBFDDAD…`](https://lora.algokit.io/testnet/transaction/PLBFDDADW576IUCH62HGGYI4AJQNO3QXSENNDIBKAORWVMP7NVHQ) |
| Consent oracle | `GET /v1/consent/status` | **$0.00** | — (free, and checked *before* spending) |
| Record summary | `POST /v1/records/summary` | $0.05 | [`COMJ3TQO…`](https://lora.algokit.io/testnet/transaction/COMJ3TQOGTKP6LXDJS7HZY7B45QZJQWXXJ23HQ3IDDQYD7GRK36A) |
| Audit append | (produced by that paid call) | — | [`E6ZTGEAO…`](https://lora.algokit.io/testnet/transaction/E6ZTGEAOTLJQDYOUVBYJYL7LKTXHBGXGVTBKN3SR2NUPWJ2PIGQA) — names the **agent** as requester |

**Three roles, three accounts.** The agent (`UYBTLPHS…`) pays; the patient (`56LFG5EE…`) granted
that specific agent access in a [transaction the patient signed
themselves](https://lora.algokit.io/testnet/transaction/IG4XEBTMRCKI724ZVHSYUN4ECTYBXAGZM5N35NP4Y3ZVWECG7WUQ),
with the backend nowhere in that path; the service (`2WDV2J2F…`) receives. Three separate keypairs,
and the indexer shows sender ≠ receiver on every one of the three payments. The one thing this does
**not** show is external demand: both the agent's and the patient's wallets were funded from the
project's own account, because TestNet ALGO and USDC have no other practical source. Separate
parties, not external revenue.

What this proves is the *protocol path*: discovery → decision → 402 challenge → signed payment →
facilitator settlement → served resource, with no human in the loop at any step — and now with a
payer whose key the service does not hold. Full evidence: [`PROOF.md`](PROOF.md) §10.

---

## Judging criteria

> The organisers weigh **working implementation and overall quality over idea and presentation.**

**Working implementation.** This is where blocker #2 hurts most and where the rest is strongest:

- A real Algorand Python smart contract, compiled with `puyapy` 5.9.0, deployed and live on TestNet
  as App `768743428`, with a **full consent lifecycle proven on-chain** — request → grant →
  `check_access=true` → revoke → `check_access=false`, every step a confirmed transaction
  ([`PROOF.md`](PROOF.md) §5).
- **Source-to-chain verification**: `contract.py` at commit `3012e2d` → reproducible compile →
  committed TEAL → algod assemble → **byte-identical** to the bytecode running at App `768743428`
  ([`PROOF.md`](PROOF.md) §7). The deployed program *is* this repository's contract source, provably
  — at that revision. Today's `contract.py` is ahead of it by exactly the C-1 and C-2 fixes, held
  back from deployment deliberately; `git diff 3012e2d -- contracts/smart_contracts/consent/contract.py`
  shows the whole difference.
- A backend verified against the *live* GoPlausible facilitator, not a mock — the decoded
  `PAYMENT-REQUIRED` header carries the real TestNet USDC asset id, the real fee-sponsorship address,
  and an SDK-computed `$0.02 → 20000` conversion, all matching the facilitator's `/supported`.
- A real browser-side payment flow: the Next.js demo constructs, signs, and submits an actual
  Algorand transaction group client-side through the SDK's `ClientAvmSigner` interface.
- **28 contract tests** (official AVM simulator, `algorand-python-testing`) + **93 API tests**
  = **121**, all passing; API and web both typecheck and build. One command each, in
  [`08_Deployment/GO_LIVE_RUNBOOK.md`](08_Deployment/GO_LIVE_RUNBOOK.md) §0.
- Nothing is publicly hosted. Until that changes, a judge can verify all of the above only by
  cloning and running it, or by reading the chain — not by opening a URL.

**Overall quality.** The engineering review that produced
[`ENGINEERING_GAP_REPORT.md`](ENGINEERING_GAP_REPORT.md) found 34 issues in this project's own code
and closed 22, including an impersonation vulnerability (G-01) that let a caller pay with their own
key while claiming to be a different, authorised requester. The fix — recovering the payment signer's
address and refusing any mismatch — is demonstrated as a live attack-and-rejection by
`api/scripts/verify-g01-fix.ts`. The 12 findings still open are listed with severities rather than
quietly dropped.

**Real usage.** The two open endpoints are priced at $0.02, need no account, no API key, and no prior
relationship — any off-the-shelf x402 client, including another team's agent, can call and pay in one
round trip. `api/scripts/agent-demo.ts` is exactly that client, run from an independent wallet. That
is why the catalogue is split open-vs-consent-gated: a consent-gated-only design cannot generate
external volume by construction, since it presupposes a patient relationship.

**Use-case quality.** The consent-gated endpoint composes an x402 payment with an on-chain
authorisation check, so one paid call is simultaneously *"pay for compute"*, *"prove you were allowed
to see this"*, and *"write it to the patient's audit trail."* The payment authenticates the caller;
the ledger authorises them.

**Long-term potential.** The consent scope is a free-form string, not hardcoded to
`records:summary`, so the same contract carries a much wider endpoint catalogue without redesign.
The Composite → Orchestrator upgrade is a scoped, described next step in
[`ARCHITECTURE.md`](ARCHITECTURE.md), not a vague aspiration.

---

## What this document does not claim

No MainNet transaction has been made. Nothing is deployed to a public URL. Nothing is listed on
Bazaar. No demo video exists. No external party has paid for this service — the agent's TestNet
float came from the project's own wallet, so the payments are between independent accounts but are
not external revenue.

Every ✅ above is verifiable by running the referenced command or opening the referenced Lora link.
Every ⛔ above is a specific, bounded action with commands in
[`08_Deployment/GO_LIVE_RUNBOOK.md`](08_Deployment/GO_LIVE_RUNBOOK.md) and an ordered plan in
[`GO_LIVE_CHECKLIST.md`](GO_LIVE_CHECKLIST.md).
