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

## 5. Contract deployed live on Algorand TestNet — independently verified

```
cd contracts && .venv/Scripts/python.exe scripts/deploy_testnet.py
```

**App ID `768743428`**, creator `2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE`,
created at round `66088624`. Confirmed independently via the public indexer (not just the
deploy script's own say-so):

```
curl https://testnet-idx.algonode.cloud/v2/applications/768743428
```

Explorer: https://lora.algokit.io/testnet/application/768743428

**Full consent lifecycle exercised for real** (`contracts/scripts/exercise_contract.py`), using
two fresh throwaway accounts funded from the deployer — every step a real, confirmed transaction:

| Step | Result | Transaction |
|---|---|---|
| `request_access` | logged | `5XIADMCGFP5I7H7AS656RXZS7MFEEPCVJGLA7T3SVE6XDEYSGFFA` |
| `grant_access` | granted | `X2BQ5FD4MW52B75WQGDB67TEULYLN7FHVFO6ZOBNI74PNCAKVOUA` |
| `check_access` (after grant) | **`True`** | simulated (readonly, no fee) |
| `revoke_access` | revoked | `OV2J2T5VWMIQG64JYGL7JEGZKKNZNKCMNIQU6AC4PDRQYZ6ZOO5A` |
| `check_access` (after revoke) | **`False`** | simulated (readonly, no fee) |

The consent state machine behaves correctly on live infrastructure, not just in the AVM
simulator.

## 6. Final settlement proof — a real, settled payment

```
cd api && npx tsx scripts/e2e-proof.ts
```

Result: **`200 OK`**, a real triage response, and a real settled payment:

```json
{
  "success": true,
  "payer": "2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE",
  "transaction": "OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ",
  "network": "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI="
}
```

Independently verified via the public indexer — not just trusting the facilitator's response:

```
curl https://testnet-idx.algonode.cloud/v2/transactions/OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ
```

confirms a real `axfer` (asset transfer) transaction, confirmed at round `66091768`, asset id
`10458941` (TestNet USDC), amount `20000` base units — exactly `$0.02` at 6 decimals, matching
`/v1/triage`'s configured price with no rounding or manual conversion. Explorer:
https://lora.algokit.io/testnet/transaction/OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ

This proof run paid from and to the same account (the deployer, used as both `PROOF_MNEMONIC`
payer and the API's configured `PAY_TO_ADDRESS`) — a deliberate choice to avoid needing a second
funded account, not a shortcut in the payment logic itself: the facilitator verified and settled
this exactly as it would any other `exact`-scheme Algorand payment, with no special-casing for
same-account transfers. Raw output saved at `contracts/artifacts/e2e-proof.json`.

## Summary

Every stage of the pipeline — contract deployment, the full consent lifecycle, and a real x402
payment settling in TestNet USDC through the live GoPlausible facilitator — is now independently
verifiable on public Algorand TestNet infrastructure, not simulated and not merely asserted.
