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

Result: compiles cleanly with `puyapy` 5.9.0, **28 passed, 0 failed** against the official AVM
simulator (`algorand-python-testing` 1.1.0). Compiled ARC-56 spec and TEAL committed at
`contracts/artifacts/MedRailConsent.arc56.json` / `.approval.teal`.

## 2. Backend — unit and structural tests

```
cd api
npm run build   # tsc, zero errors
npx vitest run
```

Result: **45 passed, 0 failed** — 7 tests on the triage red-flag scorer, 6 on the interaction
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
same-account transfers. That constraint has since been lifted: §10 records an independently
provisioned agent wallet paying `PAY_TO_ADDRESS` from a keypair the service does not hold.

**The script is repeatable, and was re-run during the 2026-08-21 review to confirm the flow still
works today rather than only historically.** That run settled
[`2VRBXOMHWMHRNOM54V4FN5Q4T2TK4JBMOZFMH7ZMITBQHDIREVLQ`](https://lora.algokit.io/testnet/transaction/2VRBXOMHWMHRNOM54V4FN5Q4T2TK4JBMOZFMH7ZMITBQHDIREVLQ)
— `axfer`, asset `10458941`, `20000` base units, `fee: 0`, confirmed at round **66517583**, note
`x402-payment-v2-1787288665877`. Both transactions are permanently checkable; the original
`OYRQRKYA…` remains valid on-chain, and `contracts/artifacts/e2e-proof.json` holds the most recent
run's output because the script overwrites it each time.

---

## 7. Source-to-chain verification — the deployed bytecode IS this repository's source

Added by the 2026-08-21 engineering review. This closes the one link in the evidence chain that
nothing else in this repository established: **is the contract you can read here actually the
contract that is running on Algorand?**

It is, and the chain is now verified end to end in two steps.

**Step 1 — source compiles reproducibly to the committed artifacts.**

```bash
cd contracts
.venv/Scripts/python.exe -m puyapy smart_contracts/consent/contract.py --out-dir artifacts
# note: --out-dir resolves relative to the SOURCE file, so this writes to
# contracts/smart_contracts/consent/artifacts/ — see ENGINEERING_GAP_REPORT.md G-28
cmp smart_contracts/consent/artifacts/MedRailConsent.approval.teal artifacts/MedRailConsent.approval.teal
cmp smart_contracts/consent/artifacts/MedRailConsent.clear.teal    artifacts/MedRailConsent.clear.teal
cmp smart_contracts/consent/artifacts/MedRailConsent.arc56.json    artifacts/MedRailConsent.arc56.json
```

Result: **byte-identical** for the approval TEAL, the clear TEAL, the ARC-56 spec, and both source
maps. `puyapy` 5.9.0 is deterministic here, so the committed artifacts are provably the compilation
of the committed `contract.py`.

**Step 2 — the committed TEAL assembles to exactly the bytecode deployed on TestNet.**

```bash
curl -s -X POST "https://testnet-api.algonode.cloud/v2/teal/compile"   -H "Content-Type: text/plain"   --data-binary @contracts/artifacts/MedRailConsent.approval.teal
```

returns

```
hash:   W4TMZHJOL7FIN5GIGJCWNB2HVI4C4WGVRDVY6BMUUOMWRFHMBJVSPZZ33U
result: CyAEAAEgAiYJE3RvdGFsX2dyYW50c19hY3RpdmUFYWRtaW4E...   (1404 base64 chars)
```

and the deployed program, read from the public indexer:

```bash
curl -s "https://testnet-idx.algonode.cloud/v2/applications/768743428"   | python -c "import json,sys; print(json.load(sys.stdin)['application']['params']['approval-program'])"
```

returns the **same 1404 characters, byte for byte.**

**Therefore:**

```
contract.py  --puyapy 5.9.0-->  committed TEAL  --algod assemble-->  bytecode deployed at App 768743428
     (reproducible)                                (identical)
```

The ~250 lines of Algorand Python in this repository are the program executing on Algorand TestNet.
No trust in the deploy script, the build machine, or this document is required to establish that —
the two commands above are independently runnable by anyone.

This matters more than it may appear. Every other on-chain claim in this log — the consent
lifecycle, the admin gating, the box layout — is only meaningful if the deployed program is the one
whose source was reviewed. That link was previously assumed. It is now checked.

---

## 8. Former evidence gap — RESOLVED, retained for the record

> **RESOLVED on 2026-08-21 — see [§9](#9-the-consent-gated-composition-proven-end-to-end-on-testnet).**
> `total_audit_entries` is now **1** and the audit boxes exist. This section is retained unedited
> because an evidence log that quietly deletes its own gaps once they close is not an evidence log.

Originally recorded as follows.

Reading the deployed contract's global state directly from the public indexer:

```
curl https://testnet-idx.algonode.cloud/v2/applications/768743428
curl https://testnet-idx.algonode.cloud/v2/applications/768743428/boxes
```

returns:

| Global counter | Value |
|---|---|
| `total_requests` | 2 |
| `total_grants_active` | 0 |
| `total_revocations` | 2 |
| **`total_audit_entries`** | **0** |

and a box inventory containing exactly **two** boxes, both `g`-prefixed (grant) boxes — **no
`s`-prefixed audit-sequence boxes and no `a`-prefixed audit-entry boxes exist.** The app account
(`CCO26Y6Z56DDZ3OELO2UKJMIPJVSIT52I23F2MPMR52JBM3HQZZNUZNOR4`) confirms this independently:
`total-boxes: 2`, `total-box-bytes: 100`, `min-balance: 145000` µALGO.

**Therefore `log_access` has never executed on Algorand TestNet**, and `/v1/records/summary` has
never completed its success path against the live contract. The audit-append mechanism is proven
by 14/14 unit tests against the official AVM simulator (§1) — but not on live infrastructure,
unlike every other claim in this document.

What this does and does not mean:

- It does **not** invalidate §5 or §6. The deployment, the full consent lifecycle, and the settled
  payment are all real and independently checkable.
- It **does** mean the `auditTxId` and `auditSequence` fields documented in
  [`API.md`](API.md) have never been produced by a real run, and that the on-chain audit trail —
  which [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`JUDGES.md`](JUDGES.md) both present as the
  system's differentiator — currently has simulator-grade evidence rather than ledger-grade
  evidence.

Closing this gap requires one successful paid call to `/v1/records/summary` against a
self-granted consent, with `OPERATOR_MNEMONIC` set and the operator account funded. The code path
already exists; nothing needs to be written. It is tracked as **G-02** in
[`ENGINEERING_GAP_REPORT.md`](ENGINEERING_GAP_REPORT.md) and is the second-highest-priority item
in [`WINNING_ROADMAP.md`](WINNING_ROADMAP.md).

**Independent re-verification of §5 and §6.** Every transaction ID cited above was re-queried
against `testnet-idx.algonode.cloud` during the 2026-08-21 review and all resolved correctly:
the app exists at round 66088624 with `deleted: false`; the three lifecycle transactions carry
the expected ARC-4 method selectors (`request_access` `d84debd0`, `grant_access` `8c3ad539`,
`revoke_access` `a67aecbc`); and the settled payment is an `axfer` of `20000` base units of asset
`10458941` with `fee: 0`, confirmed at round 66091768.

---

## 9. The consent-gated composition, proven end to end on TestNet

Added 2026-08-21, **closing the evidence gap that was §8**. This is the run the project's central
claim rests on: a single paid HTTP call that is simultaneously a **settled USDC payment**, an
**on-chain authorisation check**, and an **immutable audit append**.

```bash
cd api && npx tsx src/index.ts &
API_BASE=http://localhost:4021 npx tsx scripts/e2e-consent-proof.ts
```

Result: **`200 OK`**, with three real Algorand transactions and a synthetic record released only
after consent was verified on-chain.

| Step | Transaction | Verify |
|---|---|---|
| 1. `grant_access` — patient grants scope `records:summary`, signed by the patient's own key | `M26NPR32Z5YBLBBMZDTBQL6Y7EUSNS5YV4PXYEUBXIVJQGVJ3MAA` | [Lora](https://lora.algokit.io/testnet/transaction/M26NPR32Z5YBLBBMZDTBQL6Y7EUSNS5YV4PXYEUBXIVJQGVJ3MAA) |
| 2. `check_access` → **`true`** | simulated (readonly, zero fee, nothing submitted) | `GET /v1/consent/status` returned `granted: true` |
| 3. **x402 payment settled — $0.05** through the GoPlausible facilitator | `5DKFUULWLTNGKLYLH3TT44F22MHKOFRCEO6K4JVEPOPETFBYOESA` | [Lora](https://lora.algokit.io/testnet/transaction/5DKFUULWLTNGKLYLH3TT44F22MHKOFRCEO6K4JVEPOPETFBYOESA) |
| 4. **`log_access` — immutable audit entry, sequence 1** | `4YLKLQKKWXXFW3UT5APJVYKXI7T7A6OACTAWCC5YBAN3XGOGHRVQ` | [Lora](https://lora.algokit.io/testnet/transaction/4YLKLQKKWXXFW3UT5APJVYKXI7T7A6OACTAWCC5YBAN3XGOGHRVQ) |

Response body carried `"consentVerifiedOnChain": true`, `"auditTxId": "4YLKLQKKWXXFW3UT5APJVYKXI7T7A6OACTAWCC5YBAN3XGOGHRVQ"`,
and `"auditSequence": "1"`. Raw output at `contracts/artifacts/e2e-consent-proof.json`.

### Independently confirmed against the public indexer

```bash
curl https://testnet-idx.algonode.cloud/v2/applications/768743428
curl https://testnet-idx.algonode.cloud/v2/applications/768743428/boxes
```

| Global counter | Before | **After** |
|---|---|---|
| `total_audit_entries` | 0 | **1** |
| `total_grants_active` | 0 | **1** |

Box inventory grew from 2 to **5**, and the new boxes are exactly the shapes the design predicts:

| Prefix | Length | Meaning |
|---|---|---|
| `a` (0x61) | 41 bytes | audit entry — `1 + 32 (patient) + 8 (itob seq)` |
| `s` (0x73) | 33 bytes | audit sequence — `1 + 32 (patient)` |
| `g` (0x67) × 3 | 33 bytes | consent grants — `1 + 32 (sha256)` |

### The MBR model re-verified against the ledger

The app account now reports `min-balance = 245700`, `total-boxes = 5`, `total-box-bytes = 333`:

```
2500 × 5 + 400 × 333 = 145,700 = 245,700 − 100,000 (base account MBR)   ✓ exact match
```

This independently confirms both the documented box-storage cost model and defect **C-2** — the
contract's `GRANT_BOX_MBR` constant omits the 1-byte key prefix and under-reports each grant box by
400 µALGO. See [`ENGINEERING_GAP_REPORT.md`](ENGINEERING_GAP_REPORT.md) G-20.

### Why this run matters

Before it, `log_access` existed, was unit-tested against the AVM simulator, and had **never
executed on a real network** — because no script in the repository reached it (`exercise_contract.py`
stops at revoke; `e2e-proof.ts` pays only `/v1/triage`). `api/scripts/e2e-consent-proof.ts` closes
that gap and makes the proof **repeatable**, not a one-off.

---

## 10. An autonomous agent paying as a third party — three separate accounts

Run 2026-08-22 against `http://localhost:4021`. Artefact: `contracts/artifacts/agent-run.json`.

Every payment before this one came from the account that also receives them. The x402 mechanics are
identical either way — the facilitator does not special-case a self-transfer — but it is a fair
thing for a reviewer to discount, so two independent wallets were provisioned.

| Role | Account | Holds its own key? |
|---|---|---|
| **Patient** | [`56LFG5EE…`](https://lora.algokit.io/testnet/account/56LFG5EEHIJ4ZVMPHUMJH6BST2O3D4DMG3AWRZ2SN7Y3LLUDVUDILO66YM) | yes — signs its own grants |
| **Agent** (payer) | [`UYBTLPHS…`](https://lora.algokit.io/testnet/account/UYBTLPHS6APCXVBDPASQMUIQCEORDIR6EMTVMNSDPSVRSR5HEPKQ5GO4YQ) | yes — the service cannot sign for it |
| **Service** (`payTo`, operator) | [`2WDV2J2F…`](https://lora.algokit.io/testnet/account/2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE) | yes |

Three distinct accounts, three distinct keypairs. Earlier runs had the patient and the service
sharing one account — three *roles* across two accounts — which is why they were re-done.

### Provisioning

| Step | Transaction |
|---|---|
| Fund the agent: 260,000 µALGO | [`YKGXFTZU…`](https://lora.algokit.io/testnet/transaction/YKGXFTZU75TWIKUWO35TEHCSND5TFOFE3BKWTFTZD3LA65TGZUIA) |
| Agent opts **itself** in to USDC (ASA `10458941`) | [`KOALP5W2…`](https://lora.algokit.io/testnet/transaction/KOALP5W2EDFXU5DRDOTUZYQBLWBOJZVKVOXBG6Y7YZYCSPAQM5PA) |
| $1.00 USDC float for the agent | [`3ODGZ44Z…`](https://lora.algokit.io/testnet/transaction/3ODGZ44ZUMQAGUYTX7763FZH2U3A5MN3KQTYMXZ5I4RPGRACJGXA) |
| Fund the patient: 150,000 µALGO (it never pays for anything — this covers signing) | [`GCYA23PH…`](https://lora.algokit.io/testnet/transaction/GCYA23PHR2J43WBOXOXZ7IWCCI2VFSCTUXV7ZQHBLIA54TSTFWLA) |

Scripts: `api/scripts/provision-agent-wallet.ts`, `api/scripts/provision-patient-wallet.ts`. Neither
writes key material to disk.

### The patient grants that specific agent access

```bash
npx tsx scripts/grant-consent.ts UYBTLPHS6APCXVBDPASQMUIQCEORDIR6EMTVMNSDPSVRSR5HEPKQ5GO4YQ
```

Signed by the patient's own key, submitted straight to Algorand — the backend is not in this path:
[`IG4XEBTM…`](https://lora.algokit.io/testnet/transaction/IG4XEBTMRCKI724ZVHSYUN4ECTYBXAGZM5N35NP4Y3ZVWECG7WUQ)
(round 66563915). Decoded from the indexer:

```
signer    : 56LFG5EEHIJ4ZVMPHUMJH6BST2O3D4DMG3AWRZ2SN7Y3LLUDVUDILO66YM   ← the patient
requester : UYBTLPHS6APCXVBDPASQMUIQCEORDIR6EMTVMNSDPSVRSR5HEPKQ5GO4YQ   ← the agent
scope     : records:summary
duration  : 0   (never expires)
```

`check_access` then reports `granted=true`.

### The run

```bash
npx tsx scripts/agent-demo.ts
```

The agent discovers the catalogue from `GET /` — 8 endpoints with prices and gates, the App ID, and
the ARC-56 spec URL — with nothing hardcoded but the base URL. It then decides what the case needs:

| Step | Cost | Result | Transaction | Round |
|---|---|---|---|---|
| `POST /v1/triage` | $0.02 | `EMERGENCY`, score 70 | [`DOSKCNKJ…`](https://lora.algokit.io/testnet/transaction/DOSKCNKJRXIMY2UDSDZ377LKPZQIZJW5JHCGUAGKOYV6KUCFYKIA) | 66563930 |
| `POST /v1/interaction-check` | $0.02 | `MAJOR: warfarin + aspirin` | [`PLBFDDAD…`](https://lora.algokit.io/testnet/transaction/PLBFDDADW576IUCH62HGGYI4AJQNO3QXSENNDIBKAORWVMP7NVHQ) | 66563934 |
| `GET /v1/consent/status` | **$0.00** | `granted=true` | — free, no transaction | — |
| `POST /v1/records/summary` | $0.05 | consent verified on-chain, access audited | [`COMJ3TQO…`](https://lora.algokit.io/testnet/transaction/COMJ3TQOGTKP6LXDJS7HZY7B45QZJQWXXJ23HQ3IDDQYD7GRK36A) | 66563944 |

**$0.09 total, three settled Algorand transactions**, plus a fourth the last call produced by itself:
the [audit entry](https://lora.algokit.io/testnet/transaction/E6ZTGEAOTLJQDYOUVBYJYL7LKTXHBGXGVTBKN3SR2NUPWJ2PIGQA)
written into the patient's on-chain trail at round 66563942. Its decoded arguments:

```
patient   : 56LFG5EEHIJ4ZVMPHUMJH6BST2O3D4DMG3AWRZ2SN7Y3LLUDVUDILO66YM
requester : UYBTLPHS6APCXVBDPASQMUIQCEORDIR6EMTVMNSDPSVRSR5HEPKQ5GO4YQ   ← the agent, not the service
scope     : records:summary
endpoint  : /v1/records/summary
action    : consent_checked
```

So the patient can see, on a public ledger, that *this specific agent* read their record.

Note the ordering: the audit write confirms at round 66563942 and the payment at 66563944, because
`@x402/hono` settles only after the handler has returned a success.

The free consent check before the paid gated call is the design point worth noticing: the agent does
not spend money to be told no.

### Independently verified: sender ≠ receiver

```bash
curl https://testnet-idx.algonode.cloud/v2/transactions/COMJ3TQOGTKP6LXDJS7HZY7B45QZJQWXXJ23HQ3IDDQYD7GRK36A
```

| Field | Value |
|---|---|
| sender (agent) | `UYBTLPHS6APCXVBDPASQMUIQCEORDIR6EMTVMNSDPSVRSR5HEPKQ5GO4YQ` |
| receiver (`payTo`) | `2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE` |
| amount | 50000 base units = $0.05 |
| asset | `10458941` (TestNet USDC) |
| fee | 0 — facilitator-sponsored |
| confirmed round | 66563944 |

The same holds for both $0.02 payments.

### What this does and does not establish

**It does establish** that payments settle between genuinely independent accounts, that the payer's
keypair is not controlled by the service, and that the consent grant runs from a patient account
that is neither the payer nor the payee — which is the arrangement the product is actually about.

**It does not establish external demand.** Both wallets were funded from the project's own account,
because TestNet ALGO and USDC have no other practical source. No unrelated party has paid for this
service. That remains the honest gap, and it is not one a TestNet deployment can close.

### Earlier runs, superseded but still on-chain

Kept for the record, since they are cited in older commits and are real settlements:

| Run | Payer | Patient | Transactions |
|---|---|---|---|
| First agent run | service | service | `POAQNSOP…` · `W3Z55BZY…` · `5CO5XV7M…` · audit `5HYV5B2L…` |
| Independent payer, patient = service | agent | service | `CY5H7GEY…` · `EWEUG2OF…` · `AQ3MJ77L…` · audit `CO3RPD2H…` · grant `CKZ5WYED…` |
| Same, with the Bazaar declaration attached | agent | service | `DYVJBRFU…` · `L6T2XVHR…` · `2KCFQTZC…` · audit `HTBBNNRV…` |


---

## Summary

| Stage | Status | Evidence |
|---|---|---|
| Contract compiles and unit-tests | **VALIDATED** | 14/14 against the official AVM simulator (§1) |
| Backend unit + structural tests | **VALIDATED** | 18/18 (§2) |
| x402 wiring matches the live facilitator | **VALIDATED** | decoded `PAYMENT-REQUIRED` (§3) |
| Browser-side payment signing | **VALIDATED** | captured live network sequence (§4) |
| Contract deployed on TestNet | **VALIDATED** | App `768743428`, indexer-confirmed (§5) |
| Full consent lifecycle on-chain | **VALIDATED** | request → grant → revoke, 3 confirmed txns (§5) |
| A real x402 payment settled | **VALIDATED** | tx `OYRQRKYA…`, 20000 µUSDC, round 66091768 (§6) |
| **Deployed bytecode = this repo's source** | **VALIDATED** | reproducible compile + byte-identical assembly (§7) |
| **On-chain audit-log write** | **VALIDATED** | tx `4YLKLQKK…`, `total_audit_entries = 1` (§9) |
| **Full consent-gated composition** | **VALIDATED** | grant → check → pay → audit, 3 real txns (§9) |
| **Autonomous agent, third-party payer** | **VALIDATED** | discovery → 3 paid calls → audit across **three separate accounts** (§10) |

Every stage of the pipeline — contract deployment, the full consent lifecycle, and a real x402
payment settling in TestNet USDC through the live GoPlausible facilitator — is now independently
verifiable on public Algorand TestNet infrastructure, not simulated and not merely asserted.

**Every stage of the pipeline is now proven on public Algorand TestNet infrastructure** — contract
deployment, source-to-chain bytecode equivalence, the full consent lifecycle, a settled x402
payment, and the consent-gated composition with its on-chain audit entry. The gap recorded in §8
was closed by the run in §9 and is retained above rather than deleted.
