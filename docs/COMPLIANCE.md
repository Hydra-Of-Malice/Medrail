# MedRail — Compliance with the Global x402 Challenge Official Rules

This document maps every requirement in the Algorand Foundation's Global x402 Challenge official
rules to exactly how MedRail satisfies it, and states plainly which parts are complete versus
which require the team's own MainNet wallet to finish (see "Status" column). Sources: the
official challenge page (`algorand.co/global-x402-challenge`) and Official Rules PDF, both
fetched and read directly during planning — see `docs/IMPLEMENTATION_PLAN.md` §1 for the full
verification table.

## Entry type

The rules recognize three entry types:

| Type | Definition | MedRail |
|---|---|---|
| Standard | One paid endpoint | — |
| **Composite** | **Several endpoints sharing one `payTo` address** | **✅ This is MedRail: `/v1/triage`, `/v1/interaction-check`, `/v1/records/summary` — three priced routes, one `payTo` address (see `api/.env` `PAY_TO_ADDRESS`, wired in `api/src/x402.ts`).** |
| Orchestrator | A service that itself pays other x402 endpoints | Deliberately not claimed for this submission — see `docs/ARCHITECTURE.md` "What a v2 Orchestrator layer would add." Not built, not pretended to be built. |

## Entry requirements checklist

| Requirement | Status | Where |
|---|---|---|
| Build and test on TestNet | ✅ Done | `contracts/tests/test_consent.py` (14 tests, AVM-simulated) + `api/test/*.spec.ts` (18 tests) + a **real deployed TestNet App ID** (`768743428`), a full consent lifecycle proven live on-chain, and **a real settled x402 payment** — see `docs/PROOF.md` §5–6 |
| Deploy to Algorand Mainnet | ⏳ Pending — user action | Requires the team's own funded MainNet wallet. Script is ready and now TestNet-*proven for real*, not just dry-run-verified: `contracts/scripts/deploy_testnet.py` parameterized by network; MainNet run documented step-by-step in `docs/DEPLOYMENT.md`. Not something this build performs autonomously — see `docs/IMPLEMENTATION_PLAN.md` §5 for why. |
| Public HTTPS endpoint using the GoPlausible facilitator | ✅ Wired and proven, ⏳ hosting pending | `api/src/x402.ts` registers the real facilitator (`https://facilitator.goplausible.xyz`); `docs/PROOF.md` §6 shows a real payment settling through it. Deployment configs ready (`api/Dockerfile`, `api/fly.toml`); standing up the *public* URL needs the team's own hosting account (see `docs/IMPLEMENTATION_PLAN.md` §5). |
| Enable Bazaar discovery, tag `x402-global-challenge` | ⏳ Pending — user action | The backend's route/price/description metadata is already in the shape Bazaar's discovery extension expects — each priced route declares `description` and `mimeType` alongside its `accepts[]` (`api/src/x402.ts:19-33`). **Correction (2026-08-21 review): `@x402/extensions` is declared in `api/package.json` but is not imported anywhere in the codebase, so the discovery extension is NOT wired up — only the metadata shape is compatible.** The tag itself is applied when submitting the live MainNet endpoint through Bazaar's own UI — a competition-entry action tied to the team's identity, deliberately left as a documented manual step in `docs/DEPLOYMENT.md` rather than something performed on the team's behalf. |
| Complete ≥1 real payment confirming USDC receipt | ✅ Done on TestNet (multiple), ⏳ MainNet pending | `docs/PROOF.md` §6 and §9 — including the consent-gated composition (grant → paid call → on-chain audit entry, three real transactions) — a real settled TestNet USDC transaction, independently confirmed on the public indexer. The MainNet equivalent needs only the MainNet deployment above; `api/scripts/e2e-proof.ts` runs unmodified against MainNet given a funded account and `ALGOD_URL` pointed at `mainnet-api.algonode.cloud`. |
| Endpoint appears in Bazaar and the leaderboard | ⏳ Automatic once the above are done | GoPlausible's leaderboard tracks facilitator payment volume automatically — no separate registration beyond the Bazaar tag. |

## Judging criteria

> Real usage, use-case quality, technical execution, and long-term potential.

**Real usage.** MedRail's two open endpoints (`/v1/triage`, `/v1/interaction-check`) are
deliberately priced at $0.02, require no account, no API key, and no prior relationship with
MedRail — any x402 client, including another hackathon team's own agent, can call and pay in one
round trip. This is the whole reason the endpoint catalog is split into open-vs-consent-gated
(see `docs/ARCHITECTURE.md`): a consent-gated-only design cannot generate leaderboard volume by
construction, since it requires a pre-existing patient/requester relationship.

**Use-case quality.** Payment is not a paywall bolted in front of an otherwise-free product —
remove x402 and MedRail has no rate-limiting, no monetization, and no mechanism at all; the
payment call *is* the product's core flow. The consent-gated endpoint additionally demonstrates
a genuinely new pattern the rules call out for bonus consideration: an x402 payment and an
on-chain consent check composed together, where the same paid call is simultaneously "pay for
compute" and "prove you were allowed to see this."

**Technical execution.** Concretely, not by assertion:
- A real Algorand Python smart contract, compiled with the current `puyapy` 5.9.0 compiler,
  14 passing unit tests against the official AVM simulator (`algorand-python-testing`).
- A real backend verified against the *live* GoPlausible facilitator during development — the
  exact `PAYMENT-REQUIRED` header decoded in `docs/PROOF.md` shows the real TestNet USDC asset
  ID, the real fee-sponsorship address, and the correct `$0.02 → 20000` unit conversion, all
  matching the facilitator's own `/supported` response.
- A real browser-side payment flow: the Next.js demo constructs, signs, and submits an actual
  Algorand transaction group client-side using the SDK's `ClientAvmSigner` interface — verified
  working end-to-end through to a facilitator settlement attempt (see `docs/PROOF.md`).
- 32 automated tests total across contract and API, all passing, all runnable with a single
  command (see `docs/DEPLOYMENT.md` "Verify everything").

**Long-term potential.** The consent layer is deliberately generic (scope is a free-form
string, not hardcoded to "records:summary"), so the same contract supports the full endpoint
catalog sketched in the earlier strategy document without a redesign. The Composite-to-
Orchestrator upgrade path is a real, scoped, described next step, not a vague aspiration — see
`docs/ARCHITECTURE.md`.

## What this document does not claim

No MainNet transaction has been made by this build process, and none will be — see
`docs/IMPLEMENTATION_PLAN.md` §5 for the specific, principled reasons (real money, and it is
literally the act of entering the competition under the team's own identity). Every "✅ Done"
above is independently verifiable by running the referenced tests or reading the referenced
proof artifacts; every "⏳ Pending" above is a specific, bounded action described step-by-step in
`docs/DEPLOYMENT.md`.
