# The canonical agent run — verified facts

**Purpose.** Several documents in this set cite the machine-to-machine agent run. There have been
four runs of `api/scripts/agent-demo.ts`, each producing real settled transactions. This file names
the one that documentation should cite, so two documents never disagree.

Every value below was read back from `https://testnet-idx.algonode.cloud` on 2026-08-22 and decoded,
not copied from terminal output. Artefact: `contracts/artifacts/agent-run.json`.

---

## The accounts — three separate keypairs

| Role | Address | Notes |
|---|---|---|
| **Patient** | `56LFG5EEHIJ4ZVMPHUMJH6BST2O3D4DMG3AWRZ2SN7Y3LLUDVUDILO66YM` | Signs its own grants. Created by `api/scripts/provision-patient-wallet.ts`. Neither the payer nor the payee. |
| **Agent** (payer) | `UYBTLPHS6APCXVBDPASQMUIQCEORDIR6EMTVMNSDPSVRSR5HEPKQ5GO4YQ` | Created by `api/scripts/provision-agent-wallet.ts`. The service does not hold this key. |
| **Service** (`payTo`, operator, deployer) | `2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE` | Receives payments, signs `log_access`. |

Short forms used in prose: `56LFG5EE…`, `UYBTLPHS…`, `2WDV2J2F…`.

## The transactions

| What | Transaction | Round |
|---|---|---|
| Patient funded (150,000 µALGO) | `GCYA23PHR2J43WBOXOXZ7IWCCI2VFSCTUXV7ZQHBLIA54TSTFWLA` | — |
| Patient → agent consent grant, `records:summary`, no expiry | `IG4XEBTMRCKI724ZVHSYUN4ECTYBXAGZM5N35NP4Y3ZVWECG7WUQ` | 66563915 |
| `POST /v1/triage` — $0.02 | `DOSKCNKJRXIMY2UDSDZ377LKPZQIZJW5JHCGUAGKOYV6KUCFYKIA` | 66563930 |
| `POST /v1/interaction-check` — $0.02 | `PLBFDDADW576IUCH62HGGYI4AJQNO3QXSENNDIBKAORWVMP7NVHQ` | 66563934 |
| `GET /v1/consent/status` — **free**, no transaction | — | — |
| Audit entry written by the gated call | `E6ZTGEAOTLJQDYOUVBYJYL7LKTXHBGXGVTBKN3SR2NUPWJ2PIGQA` | 66563942 |
| `POST /v1/records/summary` — $0.05 | `COMJ3TQOGTKP6LXDJS7HZY7B45QZJQWXXJ23HQ3IDDQYD7GRK36A` | 66563944 |

Total **$0.09** across three settled USDC payments, all `fee: 0` (facilitator-sponsored), asset
`10458941`. The audit write confirms *before* the payment it belongs to, because `@x402/hono`
settles only after the handler has returned a success.

Agent-wallet provisioning, done once: `YKGXFTZU…` (260,000 µALGO), `KOALP5W2…` (USDC opt-in),
`3ODGZ44Z…` ($1.00 USDC float).

## Decoded arguments

Grant `IG4XEBTM…` — signer `56LFG5EE…`, `requester = UYBTLPHS…`, `scope = records:summary`,
`duration_seconds = 0`.

Audit `E6ZTGEAO…` — signer `2WDV2J2F…` (the operator), `patient = 56LFG5EE…`,
`requester = UYBTLPHS…`, `scope = records:summary`, `endpoint = /v1/records/summary`,
`action = consent_checked`.

## What may and may not be claimed

**May be claimed.** Three separate accounts with three separate keypairs. Sender ≠ receiver on every
payment. The consent grant is signed by an account that is neither the payer nor the payee, and the
backend is not in that path. The audit entry names the agent, so the patient can see who read their
record.

**May not be claimed.** External or third-party *revenue*. Both the agent's and the patient's
TestNet balances were funded from the project's own account, because TestNet ALGO and USDC have no
other practical source. **No unrelated party has paid for this service.** State this alongside the
claim, every time.

## Superseded runs — still real, still on-chain

Cite these only as history, never as the current run. Full detail in
[`PROOF.md`](PROOF.md) §10.

| Run | Payer | Patient | Transactions |
|---|---|---|---|
| First | service | service | `POAQNSOP…` · `W3Z55BZY…` · `5CO5XV7M…` · audit `5HYV5B2L…` |
| Independent payer, patient = service | agent | service | `CY5H7GEY…` · `EWEUG2OF…` · `AQ3MJ77L…` · audit `CO3RPD2H…` · grant `CKZ5WYED…` |
| Same, with the Bazaar declaration attached | agent | service | `DYVJBRFU…` · `L6T2XVHR…` · `2KCFQTZC…` · audit `HTBBNNRV…` |
