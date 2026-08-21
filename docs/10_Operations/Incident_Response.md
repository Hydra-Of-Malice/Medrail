# MedRail — Incident Response


**Purpose:** executable runbooks for the failure modes that actually exist in this system, written so someone who did not write the code can work them.

**Status of this document:** authored 2026-08-21 against commit `32ffd73`. **No incident has ever occurred, because nothing is publicly hosted.** These runbooks are derived from failure modes that were reproduced during review (R-1, R-3), traced through source (R-2, R-4, D-1, D-2, D-7), or verified on-chain. **No on-call rota, escalation contact, paging integration, or incident-management tooling exists** — see §9.2. Every runbook below assumes the responder has: shell access to wherever the API runs, the platform CLI, and read access to a public Algorand indexer. **Detection is the weakest link throughout** — there is no monitoring or alerting (`Monitoring.md`), so for most of these the honest detection answer is "a human notices".

---

## Quick index

| § | Incident | Sev | Detection today |
|---|---|---|---|
| A | Facilitator unreachable ⇒ all priced routes 500 | **SEV-1** | Manual — a caller reports it |
| B | Settled payment, failed audit write ⇒ paid-and-got-nothing | **SEV-1** | **None. You cannot detect this today** |
| C | Operator/admin key compromise | **SEV-0** | Indexer only, if someone looks |
| D | Operator account out of ALGO | **SEV-1** | None — manifests as B |
| E | App account out of box MBR | **SEV-1** | None — manifests as B |
| F | AlgoNode/algod outage | **SEV-2** | Manual |
| G | S-1 requester impersonation observed | **SEV-1** | **Not detectable at the HTTP layer** |
| H | Bad deploy | **SEV-1/2** | Manual |

---

## A · Facilitator unreachable — all priced routes return 500

**Finding R-1 / REL-001 — reproduced by the reviewer.** Severity **SEV-1**: 100% of revenue-generating capacity is down.

### Detection signal

| Signal | Available today? |
|---|---|
| `POST /v1/triage` returns **500** with `"Failed to initialize: no supported payment kinds loaded from any facilitator."` — **not** a 402, no `PAYMENT-REQUIRED` header, no `Retry-After` | Yes, if someone calls it |
| `/v1/health` still returns `200 {"ok":true}` | Yes — **and this is the trap.** A liveness check goes green through the entire outage |
| Free routes (`/v1/health`, `/`, `/v1/consent/app-info`) still return 200 | Yes — REL-005, **VALIDATED** by the reviewer. Blast radius is exactly the three priced endpoints |
| Alert A7/A8, canary A6 | **NOT IMPLEMENTED** — `Monitoring.md` §7 |

### Immediate action (< 5 min)

```bash
# 1. Confirm it is the facilitator and not MedRail.
curl -fsS --max-time 10 https://facilitator.goplausible.xyz/supported | head -c 400
#    Non-zero exit / timeout / 5xx  => confirmed upstream.

# 2. Confirm free routes are unaffected (bounds the blast radius).
curl -s -o /dev/null -w 'health=%{http_code}\n'   $API/v1/health
curl -s -o /dev/null -w 'appinfo=%{http_code}\n'  $API/v1/consent/app-info

# 3. Confirm the priced route symptom.
curl -s -o /dev/null -w 'triage=%{http_code}\n' -X POST $API/v1/triage \
  -H 'content-type: application/json' -d '{"symptoms":"chest pain"}'
#    402 = healthy.  500 = this incident.
```

**Do not restart the API hoping it clears.** A restart during a facilitator outage is strictly worse: the resource server re-initialises on the next priced request and fails again, and the restart also discards any in-flight audit writes (`Rollback_Strategy.md` §1.4).

**Do not roll back.** The previous version calls the same facilitator (`Rollback_Strategy.md` §5).

### Investigation

Root cause is structural, not incidental. `accepts[].asset` and `extra.feePayer` come from the facilitator's `/supported`, **not** from MedRail config — `api/src/x402.ts:17-19` deliberately omits `asset` and lets the scheme's money parser resolve it. **The 402 challenge cannot be constructed offline**, so there is no degraded mode. There is no timeout, no retry, no circuit breaker and no cached-`/supported` fallback anywhere in `api/src`.

### Resolution

| Option | Effort | Notes |
|---|---|---|
| Wait for GoPlausible to recover | 0 | The only option available today |
| Point `FACILITATOR_URL` at an alternative or self-hosted facilitator | config + restart | `config.ts:47` — this **is** configurable, which is genuine flexibility |
| Ship the graceful-degradation fix | code | Return **503 + `Retry-After`** instead of 500 (`Logging.md` §4.5), and cache the last-known `/supported` so 402s can still be issued |

### Communication

Nothing to communicate to — there are no registered callers, no status page, no support channel. **RECOMMENDED:** if the API is ever public, publish a status signal; `/v1/health` is the natural place, extended with a `facilitator: "up"|"down"` field derived from a periodic probe.

### Prevention

- Facilitator probe alert (A7) — one HTTP request, leading indicator for a full revenue outage (`Monitoring.md` §5.5).
- Cache `/supported` at boot and reuse it on failure.
- REL-001: 503 + `Retry-After`.
- Fixes CI-2 as a side effect — the same dependency makes CI red on a GitHub runner.

---

## B · Settled payment, failed audit write — the customer paid and got a 500

**Finding R-2 / REL-002.** Severity **SEV-1**: every occurrence is a customer charged for nothing, with no refund path and no retry token.

### The mechanism

`api/src/routes/records.ts`, and note the asymmetry — it is the whole finding:

```ts
// line 37 — DENIED path: defensive. A failed audit write does not break the response.
await logAccess(patientId, requesterAddress, SCOPE, ENDPOINT, "consent_denied").catch(() => undefined);

// line 49 — ALLOWED path: NOT defensive. A failed audit write becomes HTTP 500.
const logResult = await logAccess(patientId, requesterAddress, SCOPE, ENDPOINT, "consent_checked");
```

The payment has **already settled** by the time either line runs — the x402 middleware sits in front of the handler (`app.ts:37-50`). Any throw from line 49 falls through to `app.onError` → **HTTP 500** (`app.ts:58-61`).

Causes that all produce this identical outcome:

| Cause | Runbook |
|---|---|
| Operator account out of ALGO | §D |
| App account out of box MBR | §E |
| algod 5xx or timeout | §F |
| Validity-window expiry (`atc.execute(algod, 4)`, ~14 s ceiling) | §F |
| `CONSENT_APP_ID` unset or wrong (D-1) | §H |
| Operator is not the contract admin ⇒ `only admin` | §H |
| **A second API machine racing (D-7)** — the losing transaction is **rejected** by the AVM because its declared box reference does not match the box the contract writes. The contract self-assigns the sequence (`contract.py:224-226`), so **the ledger is not corrupted** — but the rejection becomes a 500 after settlement | §H |
| API restarted mid-flight (deploy, rollback, crash) | §H |

### ⚠ Detection today: **there is none**

**State this plainly. You cannot detect this incident today.** There is no metric (`Monitoring.md` §4.2 `paid_request_failed_after_settlement_total` is **RECOMMENDED**, not built), no log correlating a settlement with a response (`Logging.md` §6), and `/v1/health` returns `200` throughout. The `console.error(err)` at `app.ts:59` prints an unlabelled stack trace with **no request id, no payer, no settlement transaction id** — so even if you have the stderr buffer, it cannot tell you whether money moved.

The only signal that exists is **a caller complaining**. And this system has no support channel.

### Investigation — reconstructing from the public ledger

This is slow, incomplete, and the only method available. It produces a list of **payments**, not a list of **failures**; the failures must be inferred by elimination.

```bash
PAYTO=<your payTo address>
USDC=10458941            # MainNet: 31566704
IDX=https://testnet-idx.algonode.cloud

# 1. Every USDC receipt at payTo in the window. These are the people who paid.
curl -fsS "$IDX/v2/accounts/$PAYTO/transactions?asset-id=$USDC&min-round=<R1>&max-round=<R2>&limit=1000" \
| jq -r '.transactions[]
         | select(."asset-transfer-transaction".receiver=="'"$PAYTO"'")
         | [."confirmed-round", .sender, ."asset-transfer-transaction".amount, .id] | @tsv'

# 2. Every audit entry written in the same window. These are the records calls
#    that COMPLETED. Filter by the operator as sender and appl to app 768743428.
curl -fsS "$IDX/v2/accounts/<OPERATOR_ADDRESS>/transactions?min-round=<R1>&max-round=<R2>&limit=1000" \
| jq -r '.transactions[]
         | select(."application-transaction"."application-id"==768743428)
         | [."confirmed-round", .id] | @tsv'
```

Then reason:

| Payment amount | Meaning |
|---|---|
| **50000** µUSDC ($0.05) | a `/v1/records/summary` call — **this is the only route that writes an audit entry** |
| **20000** µUSDC ($0.02) | `/v1/triage` or `/v1/interaction-check`. These never touch the chain, so they are **not** affected by this incident |

**A $0.05 payment in the window with no corresponding `log_access` transaction from the operator shortly after is a candidate lost payment.** Candidate, not certainty — the 403 `charged` path also produces a payment with a swallowed (and silently discarded) audit write, and you cannot tell the two apart from the ledger alone.

**Practical limits of this method, stated honestly:**

- You cannot distinguish "paid, denied, 403 returned correctly" from "paid, allowed, audit write failed, 500 returned".
- You cannot see the HTTP status of any request.
- You cannot see requests that never settled.
- If `total_audit_entries` is `0` (as it is today on App `768743428`), *every* $0.05 payment looks unmatched.

### Resolution

1. **Stop the bleeding.** Identify and fix the underlying cause (§D/§E/§F/§H). Every minute of delay is another lost payment.
2. **If the cause cannot be fixed quickly, take the priced route out of service.** Better to return 503 to an unpaid request than to keep taking payments and failing. There is no feature flag in the code — this means a deploy or a platform-level route block.
3. **Make affected payers whole.** There is **no refund path in the code**. Refunding means manually sending USDC back to each sender address identified above, from the `payTo` account. Record every refund transaction id.
4. **The resource was never delivered and the audit entry was never written**, so no on-chain state needs correcting. This is the one small mercy: the failure is clean, just costly.

### Prevention — in priority order

| Fix | Effort | Effect |
|---|---|---|
| **Catch on the success path**, mirroring line 37: return the record with `auditPending: true` rather than a 500 | ~5 lines | Removes the money-loss entirely. **Highest value-per-line fix in this document** |
| **Retry `logAccess` on a rejected box reference** with a re-read sequence | ~15 lines | Also makes D-7 multi-instance safe |
| Log the correlation line (`Logging.md` §4.4 event #1) | small | Makes the incident **detectable** for the first time |
| Alert A1 on `paid_request_failed_after_settlement_total` | needs the metric | Detection in seconds instead of never |
| Alerts A2 / A9 (balances) | curl + scheduler | Removes the two most common causes before they fire |
| Pin `max_machines_running = 1` (D-7) | one config line | Removes the concurrency cause |

---

## C · Operator/admin key compromise

**Severity SEV-0 — the highest-consequence incident in this system.** `OPERATOR_MNEMONIC` is a single hot key in an environment variable that is simultaneously the contract admin (SEC-012, **NOT IMPLEMENTED**). No multisig, no HSM, no rotation policy.

### What an attacker holding it can do

| Capability | Method | Reversible? |
|---|---|---|
| Forge arbitrary audit entries for any patient | `log_access` — admin-only (`contract.py:222`) | **NO.** Append-only; no method mutates or deletes an entry (DATA-002) |
| Lock the real owner out permanently | `set_admin` (`contract.py:124-127`) | **Only by the new admin.** If they rotate to a key you do not hold, you have lost admin forever |
| Drain the app account above min-balance | `withdraw_excess` (`contract.py:254-259`), inner `itxn.Payment(fee=0)` to the admin | **NO** |
| Spend the operator account's ALGO | ordinary transactions | **NO** |

### What they **cannot** do — a real containment boundary, worth stating

| Cannot | Why |
|---|---|
| Grant or revoke consent on any patient's behalf | `grant_access`/`revoke_access` assert `Txn.sender` **is** the patient (SEC-003, **VALIDATED**). An admin has no path in |
| Update or delete the contract | No `UpdateApplication`/`DeleteApplication` handler exists — verified in the ARC-56 spec (`Rollback_Strategy.md` §2.1) |
| Read PHI | There is none on-chain (SEC-004) and the API returns a fixed synthetic constant (DATA-004) |
| Steal the `payTo` revenue already received | Different account, different key — **unless** it is the same account. See §C.4 |

**So an operator compromise can forge the record of access, but it cannot forge consent.** That is a meaningful limit and should be said accurately in both directions.

### Detection signal

| Signal | Available today? |
|---|---|
| `admin` in the app's global state ≠ your operator address | Yes, via the indexer — **if someone looks.** Alert A11 is **RECOMMENDED**, not built |
| `total_audit_entries` increments you did not cause | Yes, via the indexer, manually |
| Unexpected outbound payments from the app account | Yes, via the indexer, manually |
| Operator account balance dropping | Yes, manually |
| Anything automated | **NOT IMPLEMENTED** |

```bash
# The tripwire, runnable right now:
curl -fsS "https://testnet-idx.algonode.cloud/v2/applications/768743428" \
| jq -r '.application.params."global-state"[]
         | select((.key|@base64d)=="admin") | .value.bytes'
# Compare against your expected operator address (base64-encoded 32-byte pubkey).
```

### Immediate action — ordered, and the order matters

```
1. ASSUME THE KEY IS FULLY COMPROMISED. Do not attempt to "test" it.
2. Check whether admin has ALREADY been rotated away from you:
     read `admin` from global state (above).
     - If it is NOT your address -> you have LOST ADMIN PERMANENTLY.
       set_admin requires the CURRENT admin. Skip to step 6.
     - If it IS still your address -> you still have the window. Go to step 3.
3. Generate a new operator keypair OFFLINE. Fund it with ALGO.
4. Call set_admin(<new address>) signed by the CURRENT (compromised) key.
   Verify on-chain that global state `admin` now equals the new address.
   THIS IS A RACE. The attacker holds the same key and can rotate too.
   Do it immediately and verify the result, do not assume it landed.
5. Update OPERATOR_MNEMONIC on the API and restart.
   Order matters: rotating admin without updating the API means every paid
   /v1/records/summary takes money and then 500s (this is incident B).
   Keep the window between steps 4 and 5 as short as possible.
6. If PAY_TO_ADDRESS is the same account as the operator, rotate it too and
   sweep any USDC to a safe address.
7. Sweep remaining ALGO from the old operator account.
8. Rotate every other secret that shared the same store.
```

Full rotation procedure with verification: `Rollback_Strategy.md` §4.1.

### Investigation

1. **Enumerate forged audit entries.** Every `log_access` is an application call to App `768743428` from the admin account. List them from the indexer, correlate against your own records — which, today, do not exist (`Logging.md` §1.3: `auditTxId` is never logged). **This is where the missing logging hurts most: you cannot distinguish your own audit entries from an attacker's.**
2. **Read the forged entries' contents** with `get_audit_entry(patient, seq)` (readonly, free, via simulate) for each affected patient.
3. **Check for a `withdraw_excess` drain**: look for payments from the app account `CCO26Y6Z56DDZ3OELO2UKJMIPJVSIT52I23F2MPMR52JBM3HQZZNUZNOR4` to the admin, and compare the balance against the 5,000,000 µALGO funded at deploy.
4. **Determine the ingress.** The mnemonic exists in: `api/.env` on the dev machine, the platform secret store, the process environment of every running instance, and any CI secret store it was ever placed in. **Note the D-3 exposure path:** with no `.dockerignore`, `api/.env` is inside the root Docker build context — it is not `COPY`'d into a layer today, but it *is* transmitted to the build daemon.

### Resolution

**Forged audit entries cannot be deleted. They can only be superseded.** There is no method that mutates or removes an `audit_log` box. Options:

| Option | Reality |
|---|---|
| Write corrective entries with a distinguishing `action` string | The forged entries remain, adjacent and indistinguishable to a naive reader |
| Publish an off-chain attestation naming the compromised range of sequence numbers | The only honest remedy — and it undercuts the "trust it because it is on-chain" property, which is the point of the whole system |
| Deploy a new contract and migrate | **Not a migration.** Boxes do not move; every patient must re-grant; audit history splits across two apps (`Rollback_Strategy.md` §2.4) |

**This is the second-order effect of SEC-008 and it is worse than a missing audit trail:** a false entry in an immutable log is trusted *precisely because* it is immutable.

### Prevention

- Rekey the app's admin to a **multisig** account, or an account rekeyed to multisig. The contract needs no change — `admin` is just an `Account`.
- Separate the roles: `PAY_TO_ADDRESS` should never be the operator/admin account.
- A dedicated, minimally-funded operator account whose only job is `log_access`.
- Alert A11 on any `admin` change (`Monitoring.md` §7).
- **Never place a MainNet admin mnemonic in a CI secret store** (`CI_CD.md` §6 item 5).
- Log the `auditTxId` of every entry you write, so forged entries become identifiable (`Logging.md` §4.4 event #3).

---

## D · Operator account out of ALGO

**Severity SEV-1.** Manifests as incident B, continuously, until fixed.

### Detection signal

**None today.** Alert A2 is **RECOMMENDED**, not built. The first symptom is `/v1/records/summary` returning 500 after settlement — money already lost.

```bash
curl -fsS "https://testnet-api.algonode.cloud/v2/accounts/<OPERATOR_ADDRESS>" \
| jq '{amount, minBalance: ."min-balance", spendable: (.amount - ."min-balance")}'
```

### Immediate action

Fund the operator account. TestNet: **https://lora.algokit.io/testnet/fund**. MainNet: a real ALGO transfer.

### Investigation

Every `log_access` is a real fee-paying transaction from this account (`algorand.ts:146-178`). **Nothing tops it up, checks it, or warns.** Also check whether the ALGO went somewhere unexpected — that is §C.

### Resolution & prevention

- Fund it, and size the balance against expected `log_access` volume.
- Alert A2 with a floor derived from `fee × expected calls` — **choose the number from a baseline; do not invent one**.
- Fix incident B's root cause so an empty account degrades gracefully instead of eating payments.

---

## E · App account out of box MBR

**Severity SEV-1.** Also manifests as incident B.

### Detection signal

**None today.** Alert A9 is **RECOMMENDED**.

```bash
APP_ADDR=CCO26Y6Z56DDZ3OELO2UKJMIPJVSIT52I23F2MPMR52JBM3HQZZNUZNOR4
curl -fsS "https://testnet-api.algonode.cloud/v2/accounts/$APP_ADDR" \
| jq '{balance: .amount, minBalance: ."min-balance",
       headroom: (.amount - ."min-balance"),
       boxes: ."total-boxes", boxBytes: ."total-box-bytes"}'
# Verified 2026-08-21: 5000000 / 145000 / 2 boxes / 100 box bytes.
```

### Immediate action

Top up via `fund_mbr` — callable by **anyone**, asserting only that the payment's receiver is the app address (`contract.py:129-138`). A plain payment to the app address also works.

### ⚠ Sizing hazard — defect C-2

`get_grant_box_mbr()` returns **22,100** µALGO. The true cost is **22,500** µALGO per grant box. The contract's constant omits the BoxMap's 1-byte `"g"` key prefix from the key length (`contract.py:48` — `2_500 + 400 * (32 + 17)`, where the effective key is 33 bytes, not 32).

**Verified on-chain:** app min-balance 145,000 with 2 boxes; 145,000 − 100,000 base account MBR = 45,000 = 2 × 22,500.

**Size every top-up at 22,500 µALGO per grant box, not the value the ABI method advertises.** A backend sizing `fund_mbr` from that method under-funds by ~1.8% per box.

### Prevention

- Alert A9, expressed in **boxes of headroom**, at 22,500 µALGO each.
- Fix C-2 — but note the fix requires a new App ID (`Rollback_Strategy.md` §2), so for App `768743428` the correction is operational, not code.
- Fund generously; the deploy sends 5 ALGO on first create (`deploy_testnet.py:50`), which is ample at current volume.

---

## F · AlgoNode / algod outage

**Severity SEV-2** (SEV-1 if it produces incident B).

### Detection signal

`/v1/consent/status` and `/v1/records/summary` return 500. `/v1/triage` and `/v1/interaction-check` are unaffected — they never touch the chain. `/v1/health` returns 200 throughout.

```bash
curl -fsS --max-time 10 https://testnet-api.algonode.cloud/v2/status | jq '."last-round"'
```

### Investigation — finding R-4 / REL-003

```ts
// api/src/services/algorand.ts:5 — no timeout, no retry, no circuit breaker
const algod = new algosdk.Algodv2("", config.algodServer, "");
```

`atc.execute(algod, 4)` waits ~4 rounds (roughly 14 s) before throwing (`algorand.ts:175`). A single blip becomes a user-visible 500. And **AlgoNode is hardcoded per network at `config.ts:21-24` with no env override** (**OPS-057**) — so there is no failover, and switching providers requires a code change and a redeploy.

### Immediate action

There is no runtime mitigation. Options: wait; or ship a build with a different `ALGOD_SERVER` value. **This is the incident that makes OPS-057 worth fixing before it is needed** — see `Disaster_Recovery.md` §6.

### Prevention

- Make the algod URL an env var (**OPS-057**). One line in `config.ts`; converts a code-change incident into a config-change one.
- Add explicit timeouts and bounded retry (REL-003).
- Alert A14.

---

## G · S-1 requester impersonation observed

**Severity SEV-1** — and note carefully: **"observed" is doing a lot of work in that heading.**

### The vulnerability

`api/src/routes/records.ts:5-8, 32` reads the requester identity from the **request body**:

```ts
const bodySchema = z.object({
  patientId: z.string().length(58),
  requesterAddress: z.string().length(58),   // caller-asserted, never authenticated
});
const allowed = await checkAccess(patientId, requesterAddress, SCOPE);
```

Nothing binds `requesterAddress` to the identity that paid. Grant transactions are public — `grant_access` has the patient as `sender` and the requester as ABI arg 0, both readable from any indexer. An attacker enumerates `(patient, requester)` pairs from the app's own transaction history, pays the ordinary $0.05, and names an authorised third party. `check_access` returns true, because that grant genuinely exists. SEC-006 is **DEFEATED**; SEC-007 and SEC-008 are **NOT IMPLEMENTED**.

### ⚠ Detection: **not possible**

**An exploited request is byte-for-byte identical to a legitimate one at the HTTP layer.** No log, metric, or WAF rule can separate them, because the only distinguishing fact — who actually signed the payment — is never extracted from the `PAYMENT-SIGNATURE` header. **Do not claim a monitor covers this.** The detective control (`Logging.md` §6.2: log `payer` alongside `requesterAddress` and query for mismatches) only becomes possible once the payer is recovered — and at that point you may as well reject the mismatch, which is the fix.

### Why it is not currently exploitable in practice

1. `/v1/records/summary` returns a **fixed synthetic constant** regardless of `patientId` (`records.ts:15-21`, DATA-004). **There is no real PHI to leak in this build.**
2. `web/components/LiveDemoPanel.tsx` sends `requesterAddress: wallet.address`, so in the demo the payer and requester coincide and the flaw never manifests.

### If exploitation is observed or suspected

```
1. Take POST /v1/records/summary out of service. There is no feature flag —
   this means a deploy, or a platform-level route block.
2. Enumerate the affected accesses from the audit log: every entry written
   while the endpoint was live records the CLAIMED requester. Those entries
   are permanent and cannot be deleted (DATA-002).
3. Notify affected patients that their audit trail contains entries whose
   attribution cannot be relied upon. This is the second-order harm: a false
   attribution in an immutable log is worse than a gap, because the record is
   trusted precisely for being on-chain.
4. Do NOT restore the endpoint until the binding fix is deployed.
```

### The fix — verified present in the installed SDK

`@x402/core/http` exports `decodePaymentSignatureHeader`; `@x402/avm` exports `getSenderFromTransaction`. In `routes/records.ts`, decode the `PAYMENT-SIGNATURE` header, recover the payer address from the signed payment transaction, and reject with **403** unless `payer === requesterAddress`. Alternatively use `x402HTTPResourceServer`'s `ProtectedRequestHook` (`.onProtectedRequest(...)`, exported from `@x402/hono`) to stash the verified payer on the Hono context.

**Roughly 10–15 lines plus a test.** It is the highest value-per-line change available in this codebase, and until it lands, the consent gate must not be described as an access control.

---

## H · Bad deploy

**Severity SEV-1** if chain routes are down or money is being lost; **SEV-2** otherwise.

### Detection signal

`/v1/health` after a deploy. **Check all three fields, not just `ok`:**

```bash
curl -fsS $API/v1/health | jq
```

| Symptom | Cause | Fix |
|---|---|---|
| `"consentAppId": null` **with `"ok": true`** | **D-1** — `CONSENT_APP_ID` unset; the file fallback resolves to a path not present in the image | Set `CONSENT_APP_ID` and restart |
| `"network": "mainnet"` on a service meant for TestNet | **D-2** — `api/fly.toml:10` hardcodes it | Fix `NETWORK`, redeploy |
| Health 200 but `/v1/consent/status` 500 | `CONSENT_APP_ID` **or** `OPERATOR_MNEMONIC` missing. Note that `checkAccess` needs a **signer** even for a free `simulate` (`algorand.ts:8-14, 92-93`) | Set the missing var, restart |
| `/v1/triage` 500 instead of 402 | Facilitator unreachable — §A, not a deploy fault | §A |
| `/v1/consent/arc56` 404 | The ARC-56 copy at `api/Dockerfile:20` did not happen | Rebuild the image |
| Paid `/v1/records/summary` 500 with `only admin` | The operator is not the contract admin | `set_admin`, or use the deployer's mnemonic |
| Intermittent paid-call 500s under load | **D-7** — more than one machine is running. The losing racer's `logAccess` is **rejected** by the AVM (declared box reference ≠ the box the contract writes). The ledger is **not** corrupted; the request 500s after settlement | `max_machines_running = 1`, then fix the retry path |

> **The trap that catches everyone: `/v1/health` returns `200 {"ok":true}` in every one of these states.** `ok` is a hardcoded literal (`health.ts:8`). A smoke test that checks only the status code passes through all of them.

### Immediate action

1. Capture the current state before changing anything (`Rollback_Strategy.md` §6.1).
2. Decide rollback vs forward-fix (`Rollback_Strategy.md` §5). For a config error, **forward-fix is almost always faster** — it is one variable and a restart.
3. If money is being lost (any 500 on `/v1/records/summary`), treat it as §B and prioritise time-to-mitigate over root cause.

### Investigation

**"What version is running?" has no answer today.** `/v1/health` reports no commit SHA or image tag (`CI_CD.md` §7.2). And **no image has ever been built or tagged**, so there is nothing to roll back *to* (`Rollback_Strategy.md` §1.2). Investigation therefore starts with reading the platform's own release list and hoping it is informative.

### Resolution

Follow `Rollback_Strategy.md` §6, and run **all nine** verification checks in §1.4 of that document — specifically `consentAppId` not null, `network` correct, `/v1/triage` → 402, `/v1/consent/status` → 200.

### Prevention

| Fix | Where |
|---|---|
| Fail-fast at boot on missing `CONSENT_APP_ID` / `OPERATOR_MNEMONIC` / `PAY_TO_ADDRESS` | `../08_Deployment/Docker.md` §5.1 |
| Smoke test asserting `consentAppId` and `network`, not just HTTP 200 | `../08_Deployment/CI_CD.md` §5 |
| Fix `api/fly.toml`: correct `NETWORK`, add `CONSENT_APP_ID`, add a healthcheck, set `max_machines_running = 1` | `../08_Deployment/Docker.md` §8.4 |
| Report `gitSha` from `/v1/health` | `../08_Deployment/CI_CD.md` §7.2 |
| **Make CI actually run** (CI-1) | `../08_Deployment/CI_CD.md` §6.1 |

---

## 9. Severity, escalation, and roles

### 9.1 Severity matrix

| Sev | Definition | Examples | Response |
|---|---|---|---|
| **SEV-0** | Key compromise, or loss of control of the contract | §C | Drop everything. Rotate first, investigate second |
| **SEV-1** | Money is being lost, or all revenue capacity is down, or data integrity is in question | §A, §B, §D, §E, §G | Immediate. Consider taking the affected route out of service |
| **SEV-2** | Degraded — a subset of endpoints failing, or elevated errors | §F, §H (non-money) | Same day |
| **SEV-3** | Elevated latency, abuse of a free endpoint, non-urgent config drift | `Monitoring.md` A15–A17 | Next working session |

**The distinguishing question for SEV-1 vs SEV-2 is always: has a payment settled without the resource being delivered?** If yes, it is SEV-1 regardless of volume, because there is no refund path and no retry token.

### 9.2 Escalation path — **roles are not assigned**

**State this plainly rather than inventing an org chart.** Per git history the project has **one contributor**. There is:

- no on-call rota,
- no paging integration,
- no incident commander role,
- no security contact, no `SECURITY.md` disclosure address,
- no status page,
- no runbook ownership,
- no defined communication channel to callers — there are no registered callers.

**RECOMMENDED minimum**, proportionate to a one-person project:

| Role | Recommendation |
|---|---|
| Incident owner | The single contributor, by default. **Write the name and contact into this section** |
| Escalation for SEV-0 | Pre-decide, in writing, who else can authorise a `set_admin` rotation and where the backup key material lives (`Disaster_Recovery.md` §4) |
| Security disclosure | Publish a contact in the repo README. **A stranger who finds S-1 currently has no way to report it** |
| Status communication | If the API becomes public, a `facilitator`/`chain` status field on `/v1/health` is the cheapest honest channel |

### 9.3 Incident timeline expectations

**No response-time target exists and none is invented here.** What is known:

| Phase | Reality |
|---|---|
| Detection | **Unbounded** for every incident except those a caller reports. No monitoring, no alerting (OPS-003…OPS-005) |
| Identifying the running version | Not possible |
| Diagnosis | Hampered by the absence of logs — every failure class produces the same 500 and the same unlabelled stack trace |
| Mitigation | Never measured |

**Detection dominates and is currently unbounded.** That is why `Monitoring.md` §5 (four `curl` checks that need no code change) is a higher priority than anything in this document.

---

## 10. Post-incident review template

Fill this out for every SEV-0, SEV-1, and any SEV-2 that recurs. Blameless; the target is the system, not the person.

```markdown
# Incident <YYYY-MM-DD> — <one-line summary>

## Classification
Severity:            SEV-<0|1|2|3>
Runbook used:        Incident_Response.md §<A-H>  (or: none existed)
Detected by:         <alert | canary | user report | noticed by hand>
Detected at:         <UTC>
Mitigated at:        <UTC>
Resolved at:         <UTC>
Time to detect:      <duration — be honest if it was days>

## Money
Payments settled during the incident:   <count / µUSDC>   (source: indexer at payTo)
Payments settled with no resource:      <count>           (or: NOT DETERMINABLE — say so)
Refunds issued:                         <tx ids>
Operator ALGO spent:                    <µALGO>

## Chain state
App ID:                       768743428
total_audit_entries before:   <n>
total_audit_entries after:    <n>
admin address unchanged:      <yes/no>   ← if NO, this is a SEV-0
App account balance/min-bal:  <before> -> <after>
Operator balance:             <before> -> <after>

## What happened
<timeline, UTC, one line per event>

## Root cause
<the technical cause, with file:line>

## Contributing factors
<e.g. "no alert existed", "health check returns ok:true in this failure mode",
 "no logs correlate settlement with response", "CI has never run">

## What went well
<credit the things that worked — the free routes stayed up, the ledger gave us
 the payer list, the deploy script was idempotent>

## What we could not determine, and why
<be explicit. e.g. "affected payers could not be identified because no log
 correlates settleTxId with HTTP status — Logging.md §6">

## Actions
| # | Action | Owner | Requirement ID | Status |
|---|---|---|---|---|
| 1 |        |       |                |        |

## Did a documented runbook exist, and was it correct?
<if not, write it now — that is the single most valuable output of this review>
```

---

## 11. Requirements traceability

| ID | Statement (abbreviated) | Status | Runbook |
|---|---|---|---|
| REL-001 | Facilitator outage degrades gracefully (503 + `Retry-After`) | **NOT IMPLEMENTED** | §A |
| REL-002 | A settled payment never consumed without delivering or recording a recoverable failure | **NOT IMPLEMENTED** | §B |
| REL-003 | Explicit timeout and bounded retry on algod calls | **NOT IMPLEMENTED** | §F |
| REL-004 | Concurrent audit writes shall not collide | **PARTIALLY IMPLEMENTED** | §B, §H (D-7) |
| REL-005 | Free endpoints available when the facilitator is unreachable | **VALIDATED** | §A |
| REL-006 | App account holds sufficient balance for box MBR | **PARTIALLY IMPLEMENTED** | §E |
| SEC-002 | Only the admin can withdraw funds or rotate the admin | **VALIDATED** | §C |
| SEC-003 | Only the patient can grant or revoke consent | **VALIDATED** | §C — the containment boundary |
| SEC-006 | Record access authorised against an on-chain grant | **DEFEATED BY S-1** | §G |
| SEC-007 | The paying identity bound to the asserted requester identity | **NOT IMPLEMENTED** | §G |
| SEC-008 | The audit trail accurately attributes each access | **NOT IMPLEMENTED** | §C, §G |
| SEC-011 | Internal exception messages not returned to unauthenticated callers | **NOT IMPLEMENTED** | §H — the error text quoted throughout is what a stranger sees |
| SEC-012 | Operator key protected commensurate with its authority | **NOT IMPLEMENTED** | §C |
| OPS-002 | Structured logs with a correlation id | **NOT IMPLEMENTED** | §B — the reason §B has no detection |
| OPS-005 | Alerting for operator balance, MBR headroom, settlement failure rate | **NOT IMPLEMENTED** | §B, §D, §E |
| **OPS-062** *(new, added by Incident_Response.md)* | Incident severity, escalation and ownership shall be defined and a security contact published. | **NOT IMPLEMENTED** | §9.2 |

---

## 12. Cross-references

- `Monitoring.md` — every alert in its §7 routes to a runbook here; its §5 `curl` checks are the detection these runbooks currently lack.
- `Logging.md` §6 — the correlation that turns §B from "reconstruct from the ledger" into "run a query".
- `Disaster_Recovery.md` — §C escalates there if the key is *lost* rather than compromised.
- `../08_Deployment/Rollback_Strategy.md` — §4 rotation procedure, §5 rollback-vs-forward-fix, §6 the runbook §H points at.
- `../08_Deployment/Deployment_Architecture.md` — D-1, D-2, D-7 and the egress dependency table.
- `../08_Deployment/Docker.md` §5.1, §8.4 — the fail-fast guard and corrected `fly.toml` that prevent most of §H.
- `../02_Requirements/SRS.md`, `../06_Security/Risk_Register.md` (S-1, R-1…R-4, SEC-012), `../07_Testing/Test_Plan.md`.
