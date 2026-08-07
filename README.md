# MedRail

A patient-consent layer on Algorand under a family of x402-paid AI intelligence endpoints —
built for the [Algorand Foundation Global x402 Challenge](https://algorand.co/global-x402-challenge).

Two open, x402-gated endpoints anyone's agent can call and pay for in one round trip
(`/v1/triage`, `/v1/interaction-check`), plus one consent-gated endpoint
(`/v1/records/summary`) proving the patient-ownership story on real Algorand infrastructure —
all backed by one on-chain smart contract, `MedRailConsent`.

**Start here:**
- [`docs/JUDGES.md`](docs/JUDGES.md) — the pitch, the evidence, a 2-minute demo script
- [`docs/PROOF.md`](docs/PROOF.md) — what's independently verified right now, with commands to reproduce it
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — full technical design and the reasoning behind it
- [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) — rule-by-rule mapping to the official challenge requirements
- [`ACTION_NEEDED.md`](ACTION_NEEDED.md) — the one thing blocking a fully-funded live proof

## Repository layout

```
contracts/   Algorand Python smart contract (algopy/puya), unit tests, deploy scripts
api/         Hono/TypeScript x402 resource server
web/         Next.js judge-facing demo — live payment flow, on-chain consent UI
docs/        Everything above
```

## Quickstart

```bash
# 1. Contract (compile + test — no network or funds needed)
cd contracts
python -m venv .venv && .venv/Scripts/activate  # or source .venv/bin/activate on macOS/Linux
pip install -r requirements-dev.txt
python -m puyapy smart_contracts/consent/contract.py --out-dir artifacts
pytest tests/ -v

# 2. Backend
cd ../api
npm install
cp .env.example .env   # fill in PAY_TO_ADDRESS / OPERATOR_MNEMONIC — see docs/DEPLOYMENT.md
npm run dev

# 3. Frontend
cd ../web
npm install
cp .env.example .env.local
npm run dev
```

Full deployment (TestNet you can run today, MainNet that's deliberately left to you) is in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Entry classification

**Composite** — three priced endpoints, one `payTo` address. See
[`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) for the full rule-by-rule mapping, including what's
honestly marked as pending your own MainNet wallet rather than overclaimed.

## License

MIT — see [`LICENSE`](LICENSE).
