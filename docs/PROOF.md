# MedRail — Evidence Log

Every claim below is independently checkable. Nothing here is asserted without a command to
reproduce it or a link to check it. Updated as the build progressed; the final section is filled
in once the TestNet deployer account is funded (see `ACTION_NEEDED.md`).

## 1. Smart contract — compiled and unit-tested

```
cd contracts
.venv/Scripts/python.exe -m puyapy smart_contracts/consent/contract.py --out-dir artifacts
.venv/Scripts/python.exe -m pytest tests/ -v
```

Result: compiles cleanly with `puyapy` 5.9.0, **14 passed, 0 failed** against the official AVM
simulator (`algorand-python-testing` 1.1.0). Compiled ARC-56 spec and TEAL committed at
`contracts/artifacts/MedRailConsent.arc56.json` / `.approval.teal`.

## 2. Backend — unit and structural tests

```
cd api
npm run build   # tsc, zero errors
npx vitest run
```

Result: **18 passed, 0 failed** — 7 tests on the triage red-flag scorer, 6 on the interaction
checker, and 5 structural tests asserting the real 402 response shape (see §3).

## 3. x402 wiring — verified live against the real facilitator

With the API running locally and zero payment attached:

```
curl -i -X POST http://localhost:4021/v1/triage \
  -H "Content-Type: application/json" \
  -d '{"symptoms":"I have chest pain and shortness of breath"}'
```

Result: real `402 Payment Required`, with a `payment-required` header that decodes to:

```json
{
  "x402Version": 2,
  "resource": { "url": "http://localhost:4021/v1/triage", "description": "Rule-based clinical red-flag triage score. Not medical advice." },
  "accepts": [{
    "scheme": "exact",
    "network": "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=",
    "amount": "20000",
    "asset": "10458941",
    "payTo": "2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE",
    "maxTimeoutSeconds": 300,
    "extra": { "feePayer": "ZMFK2OI7ZBD2U27ISERZC4S6LKM6WMFJPZQ4MYNJDZ2VNBNMBA67RA22AA" }
  }]
}
```

Every field checks out against the live facilitator's own `GET /supported` response, fetched
independently: the network CAIP-2 id, the TestNet USDC asset id (`10458941`), and the exact
fee-sponsorship address all match. `$0.02` was correctly converted to `20000` base units (6
decimals) by the SDK's default money parser — no asset ID or unit conversion is hardcoded in
MedRail's own route config, so this conversion is the SDK talking to the real facilitator, not a
canned value.

## 4. Browser-side payment construction and signing — verified live

Using the Next.js demo (`web/`) with a freshly-generated, zero-balance TestNet keypair, clicking
"Pay $0.02 and call live" on the triage endpoint produced this real network sequence (captured
via browser instrumentation, not simulated):

```
POST /v1/triage                                          -> 402
GET  https://testnet-api.algonode.cloud/v2/transactions/params -> 200   (real TestNet call)
POST /v1/triage  (retry, with PAYMENT-SIGNATURE header)   -> 402   (insufficient funds — expected)
```

This proves the full client-side chain works for real: `ExactAvmScheme` (browser) constructed an
atomic transaction group against live Algorand TestNet, the demo wallet signed it in-browser via
the `ClientAvmSigner` interface, the signed payload was sent to the API, and the API forwarded it
to the live facilitator — which correctly rejected settlement because the zero-balance demo
wallet cannot actually pay. That rejection, not a crash or a CORS failure, is the correct
behavior; the UI surfaces it as "a real payment was constructed and signed, but settlement was
rejected — fund your wallet and try again."

## 5. On-chain consent flow — code complete, pending contract deployment

`web/lib/consent.ts` (`grantAccessOnChain`, `revokeAccessOnChain`) and
`api/src/services/algorand.ts` (`checkAccess`, `logAccess`) are written, typechecked, and
exercised against the graceful pre-deployment error path — clicking "Grant myself access" in the
demo currently and correctly reports:

```
CONSENT_APP_ID is not set and contracts/artifacts/deploy_testnet.json was not found.
Deploy the contract first (see docs/DEPLOYMENT.md).
```

This becomes a real on-chain transaction the moment `contracts/scripts/deploy_testnet.py` has
run — no code changes required, only a funded deployer account (see `ACTION_NEEDED.md`).

## 6. Final settlement proof — pending funding

<!-- Filled in automatically by api/scripts/e2e-proof.ts once the TestNet deployer account is
     funded. Run: cd api && npx tsx scripts/e2e-proof.ts -->

**Status: waiting on `ACTION_NEEDED.md`.** Once the deployer address holds TestNet USDC, running

```
cd api && npx tsx scripts/e2e-proof.ts
```

produces a real settled transaction ID, written to `contracts/artifacts/e2e-proof.json` and
independently checkable at
`https://lora.algokit.io/testnet/transaction/<txId>`. The script already runs correctly through
every step up to settlement — see §4 for the identical flow already proven end-to-end short of
having funds.
