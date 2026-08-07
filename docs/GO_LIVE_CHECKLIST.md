# MedRail — Go-Live Checklist

Mirrors the official Global x402 Challenge entry requirements exactly (`docs/COMPLIANCE.md`).
Work top to bottom; each item links to the exact command or doc section.

## Before MainNet

- [ ] TestNet deployer funded, contract deployed, `contracts/artifacts/deploy_testnet.json` exists (`docs/DEPLOYMENT.md` Stage 1)
- [ ] `contracts/scripts/exercise_contract.py` ran successfully — real request/grant/check/revoke cycle on TestNet
- [ ] `api/scripts/e2e-proof.ts` produced a real settled TestNet transaction (`docs/PROOF.md` §6)
- [ ] All 32 tests passing (`docs/DEPLOYMENT.md` "Verify everything")
- [ ] API deployed to a public HTTPS URL you control (`docs/DEPLOYMENT.md` Stage 2)
- [ ] Frontend deployed and pointed at that public API URL
- [ ] Read through `docs/SECURITY.md` "Admin authority on the contract" — decide whether the
      operator mnemonic's environment-variable storage is acceptable for your MainNet risk
      tolerance, or whether to harden it first (multisig / hardware key) before real funds are
      at stake

## MainNet cutover (`docs/DEPLOYMENT.md` Stage 3)

- [ ] MainNet wallet funded with real ALGO (fees + box MBR) and real USDC (one proof payment)
- [ ] Contract deployed to MainNet, new App ID recorded
- [ ] API's env vars updated: `NETWORK=mainnet`, new `CONSENT_APP_ID`, `PAY_TO_ADDRESS`, `OPERATOR_MNEMONIC`
- [ ] One real MainNet payment completed and confirmed (USDC receipt visible on-chain)
- [ ] Endpoint enabled for Bazaar discovery
- [ ] Tagged `x402-global-challenge` on Bazaar (check current UI at submission time — the exact
      flow may have changed since this checklist was written)
- [ ] Confirmed the endpoint appears on the public leaderboard

## Ongoing (through the October measurement window)

- [ ] Endpoint stays up and funded (app account box MBR, operator account fees) through the build phase
- [ ] Consider whether to widen the endpoint catalog for more leaderboard-favorable volume — see
      the original strategy document's Part 4 (55 endpoint ideas) for ready-made candidates that
      share this same consent contract and x402 wiring
- [ ] If pursuing the Orchestrator entry-type upgrade described in `docs/ARCHITECTURE.md`, budget
      real design time for it — it is explicitly not a small addition

## Before the live finals presentation

- [ ] `docs/JUDGES.md` demo script rehearsed against the actual deployed (not local) environment
- [ ] Real leaderboard numbers and a real transaction history to point to, not just the TestNet
      proof artifacts this build produced
