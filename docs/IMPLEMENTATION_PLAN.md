# MedRail — Implementation Plan


Status: living document. Written before implementation started, updated as decisions were made. This is the plan referenced by `docs/COMPLIANCE.md`, `docs/JUDGES.md`, and `docs/DEPLOYMENT.md`.

## 0. What we are building

MedRail is a patient-consent layer on Algorand sitting under a small family of x402-paid HTTP endpoints. Two endpoint categories, deliberately kept separate:

1. **Open, stateless, x402-gated intelligence endpoints** — `/v1/triage`, `/v1/interaction-check`. Anyone's agent can call these for a few cents. No consent lookup, no login, no API key. These exist to generate genuine, broad, recurring call volume — the thing the Global x402 Challenge's leaderboard actually measures.
2. **Consent-gated data endpoint** — `POST /v1/records/summary` (the patient address is supplied in the JSON body, not as a path parameter). Requires both an x402 payment *and* a currently-valid on-chain consent grant from the patient to the caller. This is the "patient owns their data" proof.

Both categories are backed by one on-chain contract (`MedRailConsent`) that also gets used purely as an audit log for the open endpoints, so every paid call — gated or not — leaves a verifiable trail.

This is a deliberate, scoped-down build of the "MedRail" concept from the earlier strategy document (`algorand-x402-healthcare-strategy.html`), not the full 55-endpoint catalog. Depth and correctness on a smaller surface beats breadth with anything faked.

## 1. Hard research findings this plan is built on

Verified live against the actual registries/services on 2026-08-07 (not assumed from training data — see `docs/COMPLIANCE.md` §Sources for how each was checked):

| Fact | Value | Verified via |
|---|---|---|
| Official challenge page | `https://algorand.co/global-x402-challenge` | WebFetch, earlier session |
| Algorand facilitator (GoPlausible) | `https://facilitator.goplausible.xyz` | Live `GET /supported` → 200 |
| Facilitator supports | `algorand:<mainnet-genesis-b64>` and `algorand:<testnet-genesis-b64>`, scheme `exact`, x402Version 2, with fee-sponsorship (`feePayer`) on both | Live `GET /supported` response |
| Algorand MainNet CAIP-2 network id | `algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=` | `specs/schemes/exact/scheme_exact_algo.md` in GoPlausible/x402-avm + facilitator `/supported` |
| Algorand TestNet CAIP-2 network id | `algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=` | `x402-avm` PyPI README (`ALGORAND_TESTNET_CAIP2`) + facilitator `/supported` + AlgoNode `genesis` endpoint |
| USDC ASA id, MainNet | `31566704` (6 decimals) | AlgoNode mainnet indexer, live query |
| USDC ASA id, TestNet | `10458941` (6 decimals) | AlgoNode testnet indexer, live query |
| npm packages (all v2.21.0 at time of writing) | `@x402/core`, `@x402/avm`, `@x402/hono`, `@x402/extensions` | npm registry, live query |
| PyPI package | `x402-avm` (Python SDK w/ first-class Algorand support) | PyPI, live query |
| Payment headers, protocol v2 (current) | Request: `PAYMENT-SIGNATURE` · Response: `PAYMENT-RESPONSE` · 402 body also carries `PAYMENT-REQUIRED` | `x402-avm` PyPI README, "HTTP Headers" table |
| Algorand contract toolchain | `algorand-python` 3.5.1 (algopy), `puyapy` 5.9.0 (compiler), `algokit-utils` 4.2.3, `py-algorand-sdk` 2.11.1, `algorand-python-testing` 1.1.0 | PyPI, live query |
| Contract syntax (BoxMap, GlobalState, `@arc4.abimethod`, `itxn`, `arc4.emit`) | Confirmed against `algorandfoundation/puya` `examples/` and `algorandfoundation/algorand-python-testing` `examples/` | Direct clone + read of official example contracts, same compiler version family |

Why this table exists: the single biggest risk in a hackathon submission like this is confidently-wrong integration code — a plausible-looking import that doesn't exist, a network id that's actually testnet when you meant mainnet, a header name from protocol v1 when the live facilitator speaks v2. Every fact above was checked against a live endpoint or the actual current package, not recalled from memory.

## 2. Entry-type classification (official rules)

The challenge recognizes three entry types. MedRail registers as:

**Composite** — three paid endpoints (`/v1/triage`, `/v1/interaction-check`, `/v1/records/summary`) sharing one `payTo` address. This is the honest classification for what's being built now.

Not **Orchestrator** yet — that requires MedRail itself to pay *other* x402 endpoints (the `AgentConcierge` concept from the strategy doc). That's the natural v2 once other endpoints — ours or other teams' — exist on Bazaar to orchestrate against. Documented as future work, not claimed as built.

## 3. Why consent is a follow-up transaction, not an atomic group with the payment

The Algorand `exact` scheme spec allows a payment group to contain up to 16 top-level transactions, so it is *technically* possible to ask a client to bundle a consent-check app call into the same atomic group as their payment. We deliberately did not do this for v1:

- Generic x402 clients (`@x402/fetch`, `@x402/axios`, or any other team's agent calling our endpoint) only know how to construct the payment transaction(s) described in `paymentRequirements`. They have no way to know our app ID or method signature. Requiring a custom multi-transaction group would make the endpoint incompatible with off-the-shelf x402 clients — directly against "cheap and frequent beats expensive and rare" and against broad leaderboard reach.
- Instead: the facilitator verifies and settles the payment (standard flow), and *our own backend* — using its own operator account, already registered as `admin` on the contract — submits a follow-up `log_access` (and, for the gated endpoint, a preceding read-only `check_access`) call immediately after settlement confirms.
- Trade-off, stated plainly: this is not fully atomic at the raw ledger level (payment and audit-log write are two separate transactions, moments apart, both real and both on TestNet/MainNet). The mitigation is that `log_access` is admin-gated and only ever called by our backend directly after a facilitator-confirmed settlement, so there's no path to a logged access without a real paid+settled transaction preceding it.
- Full atomicity is the natural upgrade path once we control both ends of a call (e.g., the future orchestrator agent), where we can add a custom-app-call leg to the payment group ourselves. Noted in `docs/ARCHITECTURE.md` as a v2 item, not claimed as done.

## 4. What is real vs. what is a labeled demo simplification

Being asked to "not hold back" is a mandate to build for real everywhere it's actually possible — not to overstate what a hackathon-timeline project can honestly claim. Both matter to judges; overclaiming is a bigger risk than a clearly labeled simplification.

**Real, verifiable on real infrastructure:**
- Smart contract compiled with the real `puya` compiler and unit-tested with the real AVM simulator (`algorand-python-testing`).
- Contract deployed to real Algorand TestNet (public network, not a local sandbox) — App ID and every transaction ID are independently checkable on a block explorer.
- x402 payment flow runs against the real, live GoPlausible TestNet facilitator and real TestNet USDC (ASA 10458941) — not a mock facilitator, not a stub payment.
- A scripted client performs a genuine 402 → pay → settle → 200 round trip and the resulting transaction ID is captured as evidence (`docs/PROOF.md`, generated by `api/scripts/e2e-proof.ts`).

**Explicitly labeled demo simplifications (disclosed, not hidden):**
- `/v1/triage` is a transparent, rule-based red-flag symptom counter, not a diagnostic model. Every response carries a `"disclaimer"` field. This is a deliberate safety choice, not a shortcut — a hackathon health-triage endpoint that reads as authoritative medical advice is a real harm risk, not just a demo-polish issue.
- `/v1/interaction-check` checks against a small, explicitly-sourced table of well-documented, textbook-level severe interaction pairs (not a comprehensive clinical database). Same disclaimer discipline.
- `/v1/records/summary` returns a synthetic demo record, never real PHI. There are no real patients in this system.
- The frontend's "instant try" flow uses a browser-generated TestNet-only demo keypair (funded via the public TestNet dispenser) so a judge can try the live flow without installing a wallet extension first. **Correction (2026-08-21 review): a real-wallet path (Pera/Defly) is NOT implemented.** An earlier revision of this document claimed it was; no wallet-connect integration exists anywhere in `web/`, and the `lib/walletConnect.ts` referenced by a comment in `web/lib/demoWallet.ts` does not exist. What *is* true is that the demo signer implements the SDK's `ClientAvmSigner` interface (`{address, signTransactions}`), which is the same seam a real wallet library plugs into — so adding one is a signer-object change rather than an architectural one.

## 5. What this build deliberately stops short of, and why

These are not scoped down for time. They are excluded on principle, and the boundary does not move:
each one either moves real money or is the literal act of entering the competition under the team's
own identity. Automating them would be doing the wrong thing efficiently.

- **No MainNet deployment as part of the build.** MainNet moves real money — ALGO for fees, real
  USDC for the required proof-of-life payment — and deploying under the team's wallet *is* the act
  of entering. The deploy script is network-parameterised and defaults to TestNet so a bare run can
  never touch MainNet by accident; the MainNet path is a single documented command sequence in
  `docs/08_Deployment/GO_LIVE_RUNBOOK.md` §4, run deliberately, by a human, with a funded wallet.
- **No hosting accounts created as part of the build.** Standing up the public HTTPS endpoint needs
  an account and possibly billing details that belong to the team. What ships instead is a
  ready-to-deploy configuration — `api/Dockerfile`, `api/fly.toml` with corrected defaults, a
  `.dockerignore` that keeps secrets out of the build context — so going live is a login-and-deploy
  step, not a code-writing one.
- **No Bazaar listing submitted as part of the build.** Tagging the live endpoint
  `x402-global-challenge` is the competition-entry action itself. The backend's route metadata is
  already in the shape Bazaar's discovery extension expects; the submission is a documented manual
  step.

TestNet is different in kind, not just degree: it involves ordinary developer keypairs and free
play-money from a public dispenser, and no real value ever changes hands. So the full TestNet
build–deploy–exercise–prove cycle *was* performed for real, including submitting real transactions
— which is exactly what the official rules expect ("build and test on TestNet, then deploy to
MainNet"). Every claim in `docs/PROOF.md` traces to a transaction anyone can check.

## 6. Build order and why

1. **Contract first.** Everything else depends on a real App ID existing. Unit-test with the AVM simulator before spending any TestNet ALGO, then deploy once and reuse that App ID everywhere downstream.
2. **Backend second**, wired directly against the real facilitator and the real deployed contract — no mocking layer to swap out later.
3. **A scripted end-to-end payment proof before the frontend.** The frontend is a presentation layer over the same API; proving the underlying flow works with a script first means any frontend bug is isolated to the frontend, not the payment logic.
4. **Frontend fourth**, then documentation is finalized last, once every claim in it (App ID, transaction IDs, screenshots) can point at something that actually exists.

## 7. Directory layout

```
MedRail/
  docs/                   planning + judge-facing documentation
  contracts/              Algorand Python smart contract, tests, deploy scripts
  api/                    Hono/TypeScript x402 resource server
  web/                    Next.js judge-facing demo frontend
  scripts/                repo-level orchestration (planned; the directory exists but is currently empty)
  .github/workflows/      CI (contract tests + API tests)
```
