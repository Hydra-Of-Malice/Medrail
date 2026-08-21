# ADR-006: `log_access` is admin-only

**Status:** Accepted
**Date:** Not recorded as a decision date. `contracts/smart_contracts/consent/contract.py` first appears in commit `d2a5f7f`, 2026-08-07.
**Deciders:** Not recorded in repository
**Evidence:** `contracts/smart_contracts/consent/contract.py:18-23` (module docstring); `contract.py:217-236` (`log_access`, `assert Txn.sender == self.admin.value`); `contract.py:123-127` (`set_admin`); `contract.py:254-259` (`withdraw_excess`); `docs/SECURITY.md:40-47`; `contracts/tests/test_consent.py::test_log_access_rejects_non_admin`

## Context

The audit log is the part of MedRail that is meant to be trustworthy *because* it is on-chain: a per-patient, append-only, monotonically sequenced record of who accessed what, under which consent scope, at what time (`contract.py:66-73, 217-236`). Its value depends entirely on who is allowed to append to it.

Three candidate writers exist: anyone, the requester making the call, or MedRail's backend operator account.

## Problem

Who may write an audit entry, and what does the answer do to the credibility of the log?

## Options considered

| Option | Pros | Cons | Why rejected |
|---|---|---|---|
| **Admin-only (`assert Txn.sender == self.admin.value`)** (chosen) | The backend writes only after the facilitator confirms settlement, so an entry implies a real paid access. No spam. No forged entries by third parties. Makes the follow-up-transaction design of ADR-005 workable. | Whoever holds the admin key can write **arbitrary** entries, including fabricated ones. Centralises the log's integrity on a single hot key. Log completeness depends on MedRail choosing to write. | — |
| **Open — anyone may append** | No trusted writer. Fully decentralised. | Any account could spam the log at will, each entry consuming box MBR from MedRail's own application account (ADR-003) — a direct denial-of-funds attack. Entries would carry no meaning: "X accessed patient P" would be an unverified assertion by an arbitrary account. | Turns the audit log into an unauthenticated public bulletin board funded by MedRail. |
| **Requester-signed appends** | The party making the access signs their own log line, so attribution is cryptographic. | A requester with an interest in not being logged simply does not send it. Self-reporting is the wrong model for an audit trail. Also incompatible with ADR-005: the write happens *after* settlement, when the client is no longer in the loop. | Voluntary auditing is not auditing. |
| **Patient-signed appends** | The patient controls their own log. | The patient is not present at access time — that is the entire point of a consent grant. | Physically impossible in the intended flow. |
| **Multisig or contract-enforced writer set** | Distributes the trust that admin-only concentrates. | Adds signing coordination to the hot path of a paid HTTP request. For one backend it is ceremony without benefit. | Disproportionate to a single-writer system, but the right direction if the key hardening in Trade-offs is ever taken seriously. |
| **Derive the log from payment events instead of writing it** | No writer at all; the payment transactions themselves are the record. | Payments carry no patient, scope or endpoint (the note field is `x402-payment-v2-<nonce>`). The consent context would be unrecoverable. | Loses the information the log exists to carry. |

## Decision

`log_access` asserts `Txn.sender == self.admin.value` (`contract.py:222`). The MedRail backend's operator account is the admin, set at creation (`contract.py:118-121`), rotatable without redeployment via `set_admin` (`contract.py:123-127`). `withdraw_excess` carries the same gate (`contract.py:258`).

## Rationale

### This rationale is recorded in the implementation

`contracts/smart_contracts/consent/contract.py:18-23`, verbatim:

> "`log_access` is intentionally admin-only. It is called by the MedRail backend's own operator account immediately after the x402 facilitator confirms a settled payment — never by an arbitrary caller — so an audit-log entry is only ever written after money has actually moved."

`docs/SECURITY.md:40-47` records the same gate and — creditably — records the downside in the same paragraph:

> "`set_admin` lets the operator key rotate without redeploying the contract — useful if the backend's hosting environment changes, but also means whoever holds the current admin key can write arbitrary audit entries and reclaim excess ALGO. For this build, that's the same operator account that deployed the contract; a production version would want this behind a multisig or a hardware-backed key, not a single hot mnemonic in an environment variable."

The rationale is recorded, the trade-off is recorded, and both are tested: `test_consent.py::test_log_access_rejects_non_admin` and `test_consent.py::test_withdraw_excess_admin_only` are negative tests that assert the gate holds (SEC-001, SEC-002 both **VALIDATED**). No reconstruction is needed.

## Trade-offs

**1. Centralisation — the admin key is the audit log's integrity.** The word "immutable" is doing a lot of work in this project's framing, and it needs qualifying. Entries are immutable in the sense that no contract method mutates or deletes an existing `audit_log` box, and the sequence only increments (DATA-002 **IMPLEMENTED**). They are *not* immutable in the sense of "impossible to fabricate." Whoever holds the admin key can:

- **Forge entries.** `log_access` takes `patient`, `requester`, `scope`, `endpoint` and `action` as free arguments (`contract.py:218`) and validates none of them against anything. An admin can write "requester R accessed patient P's records at time T" with no payment, no consent, and no HTTP request having occurred. Nothing on-chain distinguishes a genuine entry from a fabricated one.
- **Rotate the admin.** `set_admin` (`contract.py:123-127`) lets the current admin hand control to any address, including locking the legitimate operator out permanently. There is no timelock, no two-step accept, no recovery path, and no way for the deployer to reclaim it.
- **Drain the application account.** `withdraw_excess` (`contract.py:254-259`) submits an inner payment of an arbitrary `amount` to the admin, with no check that the remaining balance still covers box MBR. Draining below MBR would prevent any further grant or audit box from being created — a denial of service on the whole registry, executed by the one account trusted to run it. This is **SEC-012**.

**2. SEC-012 is unmitigated.** The admin key is a single hot mnemonic in an environment variable (`OPERATOR_MNEMONIC`, `api/src/config.ts:58`, loaded in `api/src/services/algorand.ts:8-14`). There is no multisig, no HSM, no rotation policy, no rotation runbook, and no monitoring of admin-authored transactions. `docs/SECURITY.md:40-47` acknowledges this honestly — acknowledgement is not mitigation.

Note the compounding factor: the same key is required for the *free, read-only* endpoints. `checkAccess` and `getAuditCount` both call `getOperator()` because `simulate()` needs a sender and signer (`api/src/services/algorand.ts:83-84, 104-105`), so the key must be live in the process even for unauthenticated free traffic. The blast radius of a process compromise is not limited to paid paths.

**3. This undercuts the "immutable trust" story unless the key is hardened.** A hostile reviewer's correct question is: *if MedRail can write anything into the log, why is the log more trustworthy than MedRail's own server logs?* The honest answers are narrower than the marketing framing:

- Entries are **publicly visible** and **cannot be retracted**. MedRail can add lies but cannot delete truths. That is a real, non-trivial property — it converts silent tampering into detectable append.
- Entries are **ordered and gapless per patient**. The sequence is assigned on-chain (`contract.py:224-226`), so a missing entry between `n` and `n+2` is visible to anyone.
- Entries are **timestamped by the network**, not by MedRail (`Global.latest_timestamp`, `contract.py:229`).

What it does *not* give you is proof that an entry corresponds to a real access, or that a real access produced an entry. Both directions require trusting the admin. Documents describing this system should say "tamper-evident, admin-authored" rather than "immutable trust."

**4. Finding S-1 makes the attribution problem worse, independently of the admin key.** Even a perfectly honest admin writes a *claimed* requester address, because `api/src/routes/records.ts:32, 49` passes the caller-asserted `requesterAddress` straight through to `logAccess`. A successful impersonation therefore inscribes a false attribution into the permanent log — arguably worse than no log, because the record is trusted precisely for being on-chain. **SEC-008 is NOT IMPLEMENTED.** Fixing SEC-007 (payer binding, ADR-004) is a precondition for the audit log meaning what it claims to mean.

**5. Completeness depends on MedRail bothering.** The log records what the backend writes. If `logAccess` fails, nothing is written and — on the denied path — nothing even notices (`records.ts:37`, `.catch(() => undefined)`). See ADR-005 / finding R-2.

**6. It has never been exercised on a real network.** `total_audit_entries == 5` and there are zero `s`/`a`-prefixed boxes on application `768743428` (evidence gap **E-1**). The gate is proven by simulator tests; the write path is not proven at all. FR-025 is **UNVALIDATED on-chain**.

## Consequences

**Positive**
- SEC-001 **VALIDATED**, SEC-002 **VALIDATED** — both gates enforced on-chain and covered by negative unit tests.
- FR-026 **VALIDATED**, FR-027 **VALIDATED**, FR-029 **VALIDATED** — admin-only writes, per-patient sequence isolation, rotatable admin.
- DATA-002 **IMPLEMENTED** — no method mutates or deletes an audit entry.
- Makes ADR-005's follow-up-transaction design coherent: a client-signed audit write would be incompatible with this gate.

**Negative**
- SEC-012 **NOT IMPLEMENTED** — single hot key with forge + rotate + drain authority, required even for free reads.
- SEC-008 **NOT IMPLEMENTED** — the log attributes to a self-asserted identity (S-1).
- FR-025 **UNVALIDATED on-chain** — E-1.
- FR-031 **PARTIALLY IMPLEMENTED** — only the negative case of `withdraw_excess` is tested; the successful withdrawal path is untested, and it is the path that can drain the account below MBR.

**Neutral**
- `set_admin` (FR-029) is genuinely useful for the stated purpose — moving the backend between hosts without redeploying and losing App ID `768743428` and its box state. It is simultaneously the mechanism by which a compromised key becomes permanent. Both are true.

## Conditions for future reconsideration

- **Before any deployment holding real PHI**, harden the admin key: multisig or hardware-backed signer, per `docs/SECURITY.md:47`. Absent that, do not describe the audit log as anything stronger than tamper-evident and admin-authored.
- **Add a guard to `withdraw_excess`** asserting the post-withdrawal balance still covers the app's minimum balance. Today an admin fat-finger is indistinguishable from an attack, and both brick the registry.
- **Consider a two-step `set_admin`** (propose + accept) so a mistyped address cannot permanently orphan the contract.
- **Fix SEC-007 first.** Hardening the writer while the written content is unauthenticated solves the smaller half of the problem.
- **If the trust model needs to survive a hostile MedRail**, the write must be attested by something MedRail does not control — e.g. including the settled payment's transaction id in the audit entry so an entry can be independently checked against a real on-chain payment. That is a contract change and a redeploy, and it is the most direct answer to "why should I believe this log."
