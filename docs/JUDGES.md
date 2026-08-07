# MedRail — For Judges

## The pitch, in three sentences

Most "patient-owned records" submissions to this challenge will be a consent toggle with a
payment wall bolted in front of it — technically correct, and structurally unable to generate
real leaderboard volume, because one patient granting one doctor access a few times a year is
not "real usage." MedRail instead splits into two open, broadly-useful, x402-gated AI endpoints
that any agent can call and pay for in one round trip, plus one consent-gated endpoint that
proves the patient-ownership story on-chain — sharing a single Algorand smart contract as the
trust layer underneath both. Payment isn't a gate in front of the product; it *is* the product's
rate-limiting and monetization mechanism, on both halves.

## What's real right now (not "planned" — built, tested, and linked)

| Claim | Evidence |
|---|---|
| Smart contract compiles and passes tests | `docs/PROOF.md` §1 — 14/14 passing against the official AVM simulator |
| x402 is wired to the real, live facilitator | `docs/PROOF.md` §3 — a real decoded `402` response matching the facilitator's own live `/supported` data, including the correct `$0.02 → 20000` unit conversion |
| Browser-side payment signing genuinely works | `docs/PROOF.md` §4 — a captured real network sequence: TestNet transaction params fetched live, transaction signed in-browser, submitted to the facilitator |
| Full test suite | 32 automated tests total (contract + API), all passing, one command each — `docs/DEPLOYMENT.md` "Verify everything" |

The one thing not yet true at time of writing: a *settled* (successful, `200 OK`) payment,
because that needs the deployer account funded with TestNet play-money — see
`ACTION_NEEDED.md` for exactly what's pending and why, and `docs/PROOF.md` §6 for the script
that produces that final proof the moment it's funded.

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
