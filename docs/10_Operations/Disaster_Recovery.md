# MedRail — Disaster Recovery

**Purpose:** identify what in this system is genuinely irreplaceable, and state what recovering from each class of loss actually requires.

**Status of this document:** authored 2026-08-21 against commit `32ffd73`. **No disaster has occurred, no recovery has been performed, and no DR drill has ever been run.** Everything in §1, §2 and §6 was verified by reading source or by querying the public Algorand TestNet indexer. **RPO and RTO have never been established (OPS-008)** — §3 proposes targets and labels them **RECOMMENDED**; none of them exists today. §4 and §7 are recommendations, not procedures in use.

---

## 1. What durable state exists, and where

### 1.1 The inventory, complete

There are exactly four kinds of durable state in this system. **There is no database, no cache, no queue, no object store, no message broker, no search index and no log store anywhere in the repository** — durable state is the ledger plus two static tables compiled into the image.

| # | State | Where it lives | Who replicates it | Recoverable if lost? |
|---|---|---|---|---|
| 1 | Consent grants, audit sequences, audit entries, global counters | Algorand box storage and global state, App ID **`768743428`** | **The Algorand network.** Every archival participation node holds it | **Not applicable — it cannot be lost** (§1.2) |
| 2 | Settled USDC payments | Algorand ledger, ASA `10458941` (TestNet) / `31566704` (MainNet) | Same | Cannot be lost; also cannot be reversed |
| 3 | Application code, contract source, compiled artifacts, the two static datasets | Git, branch `master`, 2 commits, `32ffd73` | Whoever holds a clone or the origin remote | **Yes** — rebuild from source (§1.3) |
| 4 | **Private keys — the operator/admin mnemonic and the deployer mnemonic** | `api/.env` and `contracts/.env`, both untracked, both on one developer machine | **Nobody.** No backup exists | **NO. This is the whole of §2** |

Everything else in the running system is derived, ephemeral, or both:

| Ephemeral state | Location | Lost on restart? | Consequence |
|---|---|---|---|
| `operatorAccount` — the decoded mnemonic | `api/src/services/algorand.ts:7,12` | yes | None. Re-derived on first use |
| `patientQueues` — the per-patient audit-write lock | `api/src/services/algorand.ts:129` | yes | An in-flight `logAccess` is abandoned. The payment is **not** charged (settlement cancels on the resulting 500), but the sale is lost and no record of it exists |
| Facilitator `/supported` payment kinds | inside `@x402/core`'s `HTTPFacilitatorClient` (`api/src/x402.ts:6-14`) | yes | Re-fetched on the next priced request. A restart *during* a facilitator outage is worse than no restart |
| The ARC-56 spec served by `/v1/consent/arc56` | read from disk on **every** request (`api/src/app.ts:63-68`) | n/a | Not cached at all; depends only on the file being present in the image |

### 1.2 The genuine and unusual DR strength: the primary datastore's durability is not this team's problem

This deserves to be stated plainly rather than assumed, because it inverts the normal shape of a DR plan.

**The system of record is a public blockchain.** Consent grants and the audit log are written into box storage on App `768743428`, and Algorand replicates that state across the network's participation and archival nodes. There is:

- **no backup to take** — the state is already replicated by thousands of independent parties;
- **no restore to test** — there is no scenario in which MedRail's copy is the only copy, because MedRail keeps no copy;
- **no failover to design** — reads go to any algod endpoint that serves the network;
- **no corruption to detect** — consensus is the integrity check, and the audit log is append-only by construction (`contracts/smart_contracts/consent/contract.py` exposes no method that mutates or deletes an existing `audit_log` key — DATA-002).

Verified against `https://testnet-idx.algonode.cloud` on 2026-08-21, not taken from the repository's own documentation:

| Fact | Value |
|---|---|
| App ID | `768743428`, created at round 66088624, `deleted: false` |
| Application account | `CCO26Y6Z56DDZ3OELO2UKJMIPJVSIT52I23F2MPMR52JBM3HQZZNUZNOR4` |
| Balance / min-balance | 5,000,000 µALGO / 145,000 µALGO |
| Boxes | **2**, both `g`-prefixed (grants), 100 total box bytes |
| Global counters | `total_requests=2`, `total_grants_active=0`, `total_revocations=2`, **`total_audit_entries=0`** |

**A necessary caveat on that last figure.** `total_audit_entries = 5`, and there are zero `s`- and zero `a`-prefixed boxes on the app: **`log_access` has never executed on Algorand TestNet** (evidence gap **E-1**). So the audit log whose durability this section credits is, today, empty. The durability property is real and structural; the data protected by it does not yet exist. Both halves of that sentence belong in any honest DR statement.

**The trade is not free, and the cost lands elsewhere in this document.** Because nothing can be deleted or rewritten, there is also no way to undo a bad write, no way to reclaim locked minimum balance, and no way to patch a contract defect in place (§5.6). Immutability is the recovery guarantee and the recovery constraint simultaneously.

### 1.3 The stateless tiers rebuild from git

| Tier | What it is | Rebuild procedure | Verification |
|---|---|---|---|
| `medrail-api` | A stateless Node 20 process. **No server-side session, user account, or persistent request state** (NFR-001, **IMPLEMENTED** — there is no datastore in `api/src`) | `npm ci && npm run build` from a clone, plus the configuration tuple `(NETWORK, CONSENT_APP_ID, PAY_TO_ADDRESS, FACILITATOR_URL, OPERATOR_MNEMONIC)` | `npx tsc --noEmit` and `npx vitest run` → **45 passed**, verified 2026-08-21 |
| `MedRail Web` | Next.js 16.3.0, 2 statically prerendered routes (`/`, `/_not-found`) | `npm ci && next build`, with `NEXT_PUBLIC_API_BASE` and `NEXT_PUBLIC_NETWORK` set **at build time** — they are inlined into the bundle | `next build` → **PASS**, 2 static routes, verified 2026-08-21 |
| `MedRailConsent` | Algorand Python compiled by `puyapy` 5.9.0 | `python -m puyapy …` — **the build is byte-reproducible**: recompiling produces approval TEAL, clear TEAL, the ARC-56 spec and both source maps byte-identical to the committed artifacts (verified with `cmp` on all four) | `pytest tests/` → **28 passed**, verified 2026-08-21 |

**Byte-reproducibility of the contract build is a real DR asset** and is worth naming as one: it means the compiled artifact in `contracts/artifacts/` can be independently regenerated from source and proven to be the same one that was deployed. Very few projects at this scale can demonstrate that. Note the packaging caveat in **G-28**: the documented `--out-dir artifacts` command writes to `contracts/smart_contracts/consent/artifacts/`, and an undocumented copy step puts the files where `deploy_testnet.py` and `app.ts` actually read them. A recovery that follows the README verbatim will populate a directory nothing reads.

### 1.4 The two static reference datasets ship with the code

Both are compiled into the image and versioned in git. Neither is a datastore, neither is mutated at runtime, and neither needs backing up beyond the repository itself.

| Dataset | Location | Size | How it is loaded | Packaged by |
|---|---|---|---|---|
| Drug-interaction table | `api/src/data/interactions.json` | **14** curated pairs, severities `moderate \| major \| contraindicated` | `readFileSync` once at module load (`services/interactionChecker.ts:18`) | `api/Dockerfile:19` — `COPY api/src/data ./api/dist/data` |
| Triage red-flag table | `api/src/services/triageScorer.ts` | **11** hard-coded `RedFlag` entries with fixed weights | a TypeScript constant, compiled into `dist/` | the build itself |

A third file the image depends on is not a dataset but is equally load-bearing: `contracts/artifacts/MedRailConsent.arc56.json`, copied by `api/Dockerfile:20` and served by `GET /v1/consent/arc56`. If that `COPY` is lost, the route degrades to `404` while `/v1/health` stays green — see [`../05_API/API_Error_Catalog.md`](../05_API/API_Error_Catalog.md) ERR-12.

**No customer data exists anywhere.** `POST /v1/records/summary` returns a fixed `SYNTHETIC_RECORD` constant regardless of `patientId` (`api/src/routes/records.ts:15-21`, DATA-004). There is no PHI to lose, no PHI to restore, and no data-subject notification obligation to plan for. That is a property of this build, not a permanent property of the design — the DR posture would change materially the day a real record store appeared behind that route.

### 1.5 What is not durable, and is not backed up

| Not durable | Why it matters for DR |
|---|---|
| **Application logs** | The only logging is `console.log` at boot (`api/src/index.ts:6`) and `console.error(err)` in the error handler (`api/src/app.ts:59`). No aggregation, no shipping, no retention (OPS-002, **NOT IMPLEMENTED**). **Nothing of record-keeping value should ever live only here** — after an incident, the ledger is the only forensic source, and it records transactions, not requests |
| **Configuration history** | There is no record of what `CONSENT_APP_ID`, `PAY_TO_ADDRESS` or `NETWORK` were set to, when, or by whom. A configuration rollback is guesswork (`../08_Deployment/Rollback_Strategy.md` §3) |
| **Container images** | **None have ever been built.** No registry, no tags, no digests, and `git tag -l` is empty (OPS-059). There is no artifact to restore *to* |
| **The running version's identity** | `/v1/health` reports no `gitSha` and no image tag. After any recovery, "is the right code running?" has no answer |

---

## 2. Key custody — the headline finding

**This is the section that matters. Everything above is either replicated by a public network or rebuildable from git. Two 25-word mnemonics are neither.**

### 2.1 The two irreplaceable secrets

| Key | Stored | Backed up? | Rotation procedure? | What it controls |
|---|---|---|---|---|
| **Operator / admin mnemonic** — `OPERATOR_MNEMONIC` | `api/.env` (untracked; gitignored at `.gitignore:2`) | **No. None documented, none known to exist.** | **No runbook, no cadence, no key ceremony.** OPS-007 **NOT IMPLEMENTED** | `log_access`, `set_admin`, `withdraw_excess` on App `768743428`, **and** the signer for every simulated read |
| **Deployer mnemonic** — `DEPLOYER_MNEMONIC` | `contracts/.env` (untracked; gitignored at `.gitignore:5`) | **No.** | **No.** | The creator identity `AppFactory.deploy` matches on; today also the `payTo` address for revenue |

Both are currently the same address in practice: `2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE` is simultaneously the app creator, the contract `admin`, and the `payTo` address every settled payment on record has paid into — and, in the agent demo, the granting patient as well. **Three distinct authorities are collapsed into one key**, which means one loss event takes all three. The one identity that is *not* this key is the agent that pays: `UYBTLPHS…` holds its own keypair. That separation buys nothing for custody, because it is the receiving side that is over-collapsed.

**The gitignore discipline is real and worth crediting**: `git ls-files` confirms no `.env` file is tracked, and `.gitignore` covers `.env`, `.env.local`, `*.mnemonic` and `contracts/.env`. Secret *hygiene* is good. Secret *custody* does not exist. Those are different problems, and the second is the one that ends the project.

**Two adjacent gaps, both small and both real:**

- **There is no `contracts/.env.example`.** `api/.env.example` exists and documents all seven API variables, including a well-written warning on `OPERATOR_MNEMONIC` ("Generate a dedicated operator account; do not reuse a personal wallet"). The `contracts/` side has no template at all — the requirement for `DEPLOYER_ADDRESS`/`DEPLOYER_MNEMONIC` is recorded only in a docstring (`contracts/scripts/deploy_testnet.py:8-11`). Someone recovering this project from a clone would not learn the deployer key exists until a script exits with `DEPLOYER_MNEMONIC missing from contracts/.env`.
- **There is no `.dockerignore` anywhere** (D-3 / G-13), and `api/Dockerfile` builds from the repository root. Both `.env` files therefore enter the build context. Nothing `COPY`s them into a layer today, so no secret currently lands in an image — but the margin is one careless `COPY api/ ./api/` wide, and a leaked mnemonic is §5.2, not §5.1.

### 2.2 If the operator/admin mnemonic is lost

**Lost, not stolen** — the machine dies, the disk fails, the file is deleted, the developer moves on. This is the worst outcome in the system, and it is worse than a compromise, because a compromise at least leaves someone holding the key.

The contract has **no recovery path, no timelock, no multisig, no social recovery and no escape hatch.** Every privileged method asserts `Txn.sender == self.admin.value`:

```python
# contracts/smart_contracts/consent/contract.py:124-127
def set_admin(self, new_admin: Account) -> None:
    assert Txn.sender == self.admin.value, "only admin"
    self.admin.value = new_admin
```

`log_access` asserts the same at `:222`; `withdraw_excess` at `:258`. There is no second condition, no alternative signer, no expiry, no "if the admin has not acted in N rounds" clause. **The admin key is the only key that can ever produce a valid admin transaction against App `768743428`, and the application cannot be updated to change that** — it declares no `UpdateApplication` and no `DeleteApplication` handler, so the approval program that enforces this is permanent (verified in `contracts/artifacts/MedRailConsent.arc56.json`: `"bareActions": {"create": [], "call": []}` and every method `"actions": {"create": [], "call": ["NoOp"]}`).

Consequences, each of them permanent:

| Capability | After losing the operator key |
|---|---|
| Write an audit entry (`log_access`) | **Gone forever.** No audit entry can ever be written to App `768743428` again, by anyone. The append-only log becomes append-never |
| Rotate the admin (`set_admin`) | **Gone forever.** Rotation requires the *current* admin. The key you need to replace is the key you need in order to replace it |
| Reclaim the app account's ALGO (`withdraw_excess`) | **Gone forever.** The 5 ALGO in `CCO26Y6…NUZNOR4` is unrecoverable. Even *with* the key, the 145,000 µALGO held by the two existing boxes is unreclaimable, because no method deletes a box |
| `POST /v1/records/summary` success path | **Permanently broken** on this app. Every consent-granted paid call throws at `records.ts:49` and returns `500`. The caller is not charged (settlement cancels), so this is a total revenue outage on the flagship endpoint rather than a billing incident |
| `POST /v1/records/summary` denied path | Also broken, but silently — `records.ts:37` swallows the failure and still returns `403` |
| **`GET /v1/consent/status`** — free, unauthenticated, read-only | **Also broken.** `checkAccess` runs through `simulate()` and submits nothing, but it still needs a sender and signer (`services/algorand.ts:92-93`), and `getOperator()` throws without a mnemonic (`:8-14`) → `500` (ERR-17) |
| `POST /v1/triage`, `POST /v1/interaction-check` | **Unaffected.** Neither touches the chain |
| Patient consent grants and revocations | **Unaffected.** `grant_access` and `revoke_access` assert `Txn.sender` **is the patient** (`contract.py:151, 181`). Patients keep full control of their own consent with or without MedRail's key. **This is a real containment boundary and it works in both directions** |

**The only remedy is to abandon the application.** Deploy a new `MedRailConsent`, whose `create` sets `admin = Txn.sender` (`contract.py:118-121`), and repoint `CONSENT_APP_ID`. That is a consent-registry reset: **box state does not migrate** (§5.6). Every patient must re-grant, and the old app's audit log — however much of it exists — stays readable forever on the old App ID but does not follow.

**Time to detect this loss today: unbounded.** There is no monitoring of any kind (OPS-003, OPS-005, **NOT IMPLEMENTED**). Nothing checks that the key still exists, still signs, or still equals the on-chain `admin`. The failure would be discovered the first time someone made a paid `/v1/records/summary` call — and if nobody makes one, never.

### 2.3 If the deployer mnemonic is lost

Materially less severe than §2.2, and for a non-obvious reason.

| Capability | After losing the deployer key |
|---|---|
| Idempotent redeploy of `MedRailConsent` | **Gone.** `AppFactory.deploy` is idempotent per `(app_name, creator)` (`contracts/scripts/deploy_testnet.py:83-96`). A *different* deployer running the same script does not find the existing app — it creates a **new one**, with a new App ID, a new application account, zero boxes, and itself as admin |
| Access to funds held by the deployer account | Gone with the key, like any wallet |
| Revenue already settled to `payTo` | **Gone**, because `PAY_TO_ADDRESS` is the same address today. Separating `payTo` from the deployer identity is the single cheapest custody improvement available (§4.3) |
| Admin authority over App `768743428` | **Unaffected in principle** — `admin` is whatever `set_admin` last set, not the creator. In practice they are the same key today, so in practice this collapses into §2.2 |
| The deployed contract itself | **Unaffected.** It keeps running, keeps serving reads, and keeps accepting patient grants. Nothing about it depends on the deployer continuing to exist |

**The nuance worth stating.** The deployer key's remaining value is *identity for idempotency* — it is the thing that lets a redeploy recognise "this app already exists" instead of minting a second one. That matters far less than it looks, because `OnUpdate.AppendApp` means a *changed* contract creates a new application anyway (§5.6). Losing the deployer key mostly means losing a convenience, provided the admin key survives.

### 2.4 The custody posture, stated without softening

| Control | Status |
|---|---|
| Offline / sealed backup of either mnemonic | **NOT IMPLEMENTED** |
| Multisig on the admin authority | **NOT IMPLEMENTED** — the contract stores `admin` as a single `Account` in global state and asserts a plain equality (`contract.py:126, 222, 258`) |
| Rekeying the admin account to a multisig | **NOT IMPLEMENTED** — but it is possible without any contract change (§4.4). This is the most important sentence in this section |
| Hardware wallet or HSM | **NOT IMPLEMENTED** — the mnemonic is decoded in-process by `algosdk.mnemonicToSecretKey` (`services/algorand.ts:12`) |
| Rotation policy, cadence, or drill | **NOT IMPLEMENTED** — `set_admin` makes rotation *possible* (FR-029, **VALIDATED** by `test_set_admin_only_admin`); no runbook makes it *executable*. OPS-007, SEC-012 |
| Split custody / two-person rule | **NOT IMPLEMENTED** — one person holds everything |
| Any record of who holds the key or where | **NOT IMPLEMENTED** |
| Secrets kept out of git | **IMPLEMENTED and verified** — no `.env` is tracked |

**Risk `RO-05` in [`../06_Security/Risk_Register.md`](../06_Security/Risk_Register.md) is scored HIGH and remains OPEN.** This document does not lower it.

---

## 3. RPO and RTO

### 3.1 The current position

> **RPO and RTO are not established.** No recovery point objective and no recovery time objective have ever been defined, agreed, documented, or measured for any component of this system. **OPS-008 is NOT IMPLEMENTED.**

This is not an oversight to paper over with plausible-sounding numbers. Three facts make any current target meaningless:

1. **Detection time is unbounded.** There is no monitoring, no alerting, no uptime check and no log aggregation (OPS-003, OPS-004, OPS-005, all **NOT IMPLEMENTED**). An RTO is dominated by detection, and detection today means "a human happens to notice". An RTO cannot be shorter than a delay nobody controls.
2. **Nothing is deployed.** The API and web tiers have never been hosted; no container image has ever been built. There is no running thing to recover and no recovery to time.
3. **No recovery has ever been performed or rehearsed**, so no component of a recovery has a measured duration.

Inventing targets here would be worse than recording that none exist — a target nobody has committed to and nobody can measure is a liability in an incident, not an asset.

### 3.2 **RECOMMENDED** targets

**Every value below is a proposal, not a commitment, not a measurement, and not a current capability.** They are offered so that a team adopting them has a reasoned starting point rather than a blank page. **Whether any of them is achievable is unknown**, because nothing has been measured; the drill in §7 is what would tell you.

| Component | **RECOMMENDED** RPO | Reasoning | **RECOMMENDED** RTO | Reasoning |
|---|---|---|---|---|
| **Consent grants and audit log** (Algorand box state) | **0** | Achieved structurally, not by process. Once a transaction is confirmed it is replicated by the network; MedRail keeps no copy that could diverge. **The only way to lose a confirmed write is for Algorand itself to lose it.** Set the target to zero and note it is already met | **Not MedRail's to set** | Read availability is AlgoNode's (§6.1). A target here would be a commitment about a third party |
| **Settled payments** | **0** | Same reasoning. An Algorand `axfer` is final at confirmation | n/a | There is no refund path in the code and none is planned; finality is the design |
| **Application + contract source** | **0** | Git, provided at least one remote or clone survives. Today the branch is `master` with 2 commits and **no tags** — an off-machine remote is the entire backup strategy and should be verified to exist | **hours** | A clone, `npm ci`, two builds and a config tuple. Bounded by the human, not the tooling |
| **`medrail-api` service** | **n/a — stateless** | NFR-001. Nothing to lose | **minutes once image tagging exists (OPS-059); currently unbounded** | The blocker is procedural, not technical: no images, no tags, no digests, so there is nothing to redeploy. State the dependency rather than the number |
| **`MedRail Web`** | **n/a — stateless** | 2 statically prerendered routes | **minutes, same precondition** | Also rolls back `NEXT_PUBLIC_API_BASE`, which is baked in at build time |
| **Runtime configuration** | **0 — but currently unachievable** | There is no configuration history at all. RPO 0 means "we can restore the previous tuple", and today nobody can, because nobody recorded it | **minutes** | A secret set plus a restart. Every value is read once at process start (`config.ts:44`) — there is no hot reload |
| **Operator / admin key** | **0 — the target is that loss is impossible, not that recovery is fast** | An RPO for a key is binary. Either a sealed backup exists or the capability is gone forever (§2.2). Frame the target as *custody*, not as *recovery* | **hours, and only if a backup exists** | Restore the mnemonic, restart. **With no backup the RTO is infinite** and the only path is §5.7 — a new application |
| **Deployer key** | **0**, same framing | §2.3 | **hours if backed up; otherwise accept the loss** | Its remaining value is idempotency, which is recoverable by accepting a new App ID |

**Two targets that should deliberately stay undefined until there is something to measure:** a latency SLO (PERF-002 — the only data points that exist are two single observations on a developer laptop, 505 ms cold and ~15 ms warm, which are not percentiles) and an availability SLO (nothing is hosted, so there is no availability to observe).

### 3.3 The precondition that gates all of §3.2

Every RTO above is bounded below by detection. **Adopting any of these targets without first implementing detection is adopting a number you cannot meet and cannot measure.** The minimum viable detection set is small and is already specified elsewhere:

1. Operator-account ALGO balance (`../10_Operations/Monitoring.md` §5.1) — the check that would have caught §5.4 days early.
2. App-account box-MBR headroom (§5.2 there).
3. Contract global state, especially `admin` and `total_audit_entries` (§5.3 there) — the `admin` check is simultaneously the key-compromise tripwire.
4. A facilitator probe (§5.5 there) — one HTTP request, leading indicator for a total revenue outage.

All four are `curl` + `jq` against public endpoints. **None requires a code change to MedRail.**

---

## 4. Key backup, custody and rotation — **RECOMMENDED**

**Nothing in this section exists.** It is the smallest set of controls that would move §2 from "one loss event ends the project" to "one loss event is an incident".

### 4.1 Sealed offline backup — the minimum

The floor, not the goal. It costs an hour once.

```
1. Generate a DEDICATED operator account offline, on a machine that is not
   the developer's daily driver and not connected to a network. Never in a
   shell with history enabled, never in a terminal that ships logs.
   (api/.env.example already gives this advice: "Generate a dedicated
   operator account; do not reuse a personal wallet." Follow it.)

2. Write the 25 words on paper — two copies, by hand. No photograph, no
   password manager sync, no cloud note, no screenshot, no chat message.

3. Seal each copy in a tamper-evident envelope. Sign and date the seal.

4. Store the two copies in two physically separate locations under different
   access control. Neither location should be the machine that runs the API.

5. Record, in a document that contains NO key material: which addresses the
   backups correspond to, where each envelope is, who may open it, and what
   event authorises opening it.

6. Verify the backup by RESTORING it — derive the address from the written
   words on an offline machine and confirm it matches the expected address.
   An unverified backup is not a backup.

7. Re-verify on a schedule. A backup nobody has read in a year is a rumour.
```

**Never** commit key material, never paste it into a ticket or a chat, never log it, never put it in an image layer, and never hand it to CI (§4.5). The complete never-log list is in [`Logging.md`](Logging.md) §5 and it is not advisory.

### 4.2 Do not repeat the "one key, three authorities" mistake

Today one address is creator, admin and `payTo`. Split them:

| Authority | **RECOMMENDED** holder | Why separate |
|---|---|---|
| **`payTo`** — receives revenue | A cold address that signs nothing | It never needs to be online. Compromising the API must not compromise revenue. **This is the cheapest and highest-value split available**, and it needs no contract change — just a different `PAY_TO_ADDRESS` |
| **Admin** — `log_access`, `set_admin`, `withdraw_excess` | A hot key the API holds, ideally rekeyed to a multisig (§4.4) | It must be online, because `log_access` runs on the request path. Accept that it is hot and constrain what it can reach |
| **Deployer** — creator identity for idempotency | An offline key used only at deploy time | It is needed a handful of times ever |

### 4.3 Rekeying: multisig without changing the contract

**This is the most useful fact in this section, and it is easy to miss.** The contract stores `admin` as a single `Account` and asserts a plain equality. That looks like it forecloses multisig. It does not.

Algorand's **account rekeying** separates an account's *address* from the *key that may sign for it*. The `admin` address in global state can stay exactly what it is while the authority to sign for that address moves to a multisig. The contract's `assert Txn.sender == self.admin.value` keeps passing, because `Txn.sender` is still the same address — only the signature requirement changed, and that is enforced at the protocol layer beneath the contract.

Practical consequences:

- **Threshold custody is available without redeploying** App `768743428`, and therefore without a consent-registry reset (§5.6). That is a rare thing to be able to say about a deployed immutable contract.
- The API would need a signer that can produce a multisig-authorised transaction rather than `algosdk.mnemonicToSecretKey` (`services/algorand.ts:12`). For a 1-of-N or a 2-of-3 with a co-signer service, that is a signer-object change in one function.
- **Rekeying is itself an admin action and is irreversible without the new authority.** Rehearse it on a throwaway TestNet account first (§7.4). Getting it wrong locks the account permanently, which is precisely the failure this control exists to prevent.

The alternative — deploying a fresh contract with multisig or timelock semantics baked in — is strictly more work and forces a registry reset. **Rekeying is the better answer, and it is available today.**

### 4.4 Rotation drill

Rotation is only real if it has been rehearsed. The procedure itself is in [`../08_Deployment/Rollback_Strategy.md`](../08_Deployment/Rollback_Strategy.md) §4.1; what follows is the DR-specific framing.

```
Rehearse on TestNet, on a THROWAWAY application, before ever doing it live.

1. Generate the new operator keypair offline (§4.1).
2. Fund it with ALGO. Every log_access is a real fee-paying transaction
   signed by this account.
3. Call set_admin(<new address>) signed by the CURRENT admin.
   Verify on-chain that global state `admin` now equals the new address:
     curl -fsS "https://testnet-idx.algonode.cloud/v2/applications/<APP_ID>" \
       | jq -r '.application.params."global-state"[]
                | select((.key|@base64d)=="admin") | .value.bytes'
4. Update OPERATOR_MNEMONIC on the API as a platform secret; restart.
5. Verify, in this order:
     GET /v1/health           -> 200
     GET /v1/consent/status   -> 200  (proves the new key can sign a simulate)
     one paid POST /v1/records/summary -> auditTxId present AND
       total_audit_entries incremented (proves the new key IS admin)
6. Only then drain the old operator account.
7. Destroy the old key material. Record the rotation — date, old address,
   new address, reason — in the config change log. NEVER record the mnemonic.
```

**Ordering is not optional.** Between step 3 landing and step 4 completing, the API is signing as a **non-admin**: every paid `/v1/records/summary` hits `only admin` at `contract.py:222`, the transaction is rejected, and the request returns `500` after the consent check succeeded. The caller is not charged — settlement cancels on the 500 — but every one of those requests is a lost sale, silently. Keep the window short and prefer a maintenance pause. Doing step 4 *before* step 3 produces the identical failure in reverse.

**Cadence — RECOMMENDED:** rotate on a fixed schedule *and* immediately on any suspicion of exposure, on any change of who has machine access, and after any incident in which the key was handled outside its normal path. A rotation nobody has done is a rotation nobody can do.

### 4.5 CI must never hold the admin mnemonic

Stated explicitly because the temptation is obvious and the consequence is not recoverable. `.github/workflows/ci.yml` runs compile, typecheck, build and test — **none of which needs a key.** A CI secret is readable by anyone who can modify a workflow file, and a workflow file is a normal file in a pull request. Handing CI the operator mnemonic would put the contract-admin authority behind a code review. If a deploy step ever needs to sign, use a **separate, minimally-funded deploy key that is not the admin**, and never the operator or deployer mnemonic.

---

## 5. Recovery procedures by scenario

Each subsection states what is genuinely recoverable and what is not. **Read §2 first** — several of these have the same root cause.

### 5.1 Operator/admin key lost

**Recoverable only if a backup exists. There is none today.**

```
1. STOP. Do not deploy anything. Do not run deploy_testnet.py.
   A hasty redeploy mints a new App ID and destroys the option of
   recovering the existing one if the key turns up.

2. Exhaust the search. Old machines, disk images, shell history on
   decommissioned hosts, the platform's secret store if the service was
   ever deployed (`flyctl secrets` lists NAMES, never values — the value
   is only inside a running machine's environment).

3. Confirm the on-chain admin, so you know exactly which key you need:
     curl -fsS "https://testnet-idx.algonode.cloud/v2/applications/768743428" \
       | jq -r '.application.params."global-state"[]
                | select((.key|@base64d)=="admin") | .value.bytes'
   Base64-decode to a 32-byte public key and encode as an Algorand address.

4. If the key is genuinely gone, accept the permanent consequences in §2.2
   and go to §5.7. There is no step between 3 and 4. The contract has no
   recovery path, no timelock and no multisig.

5. Before deploying the replacement, DO §4 FIRST. Recreating the same
   custody posture is the one outcome guaranteed to produce this incident
   again.
```

**What you keep even in the worst case, and it is not nothing:** the old application stays deployed forever, its state stays readable by anyone, and its audit log — whatever it contains — remains permanently verifiable. Record the old App ID as the archival audit source (§5.6).

### 5.2 Operator/admin key compromised

**A different problem from §5.1, with a different answer: rotate forward, do not roll back.** A rollback redeploys the *same* compromised key from the same secret store.

Immediate actions, in order — the order matters:

```
1. set_admin(<new address>) signed by the CURRENT admin, IMMEDIATELY.
   This is the containment action. Everything else can wait for it.
   If the attacker rotates first, you have lost the contract (§5.1 applies).
2. Verify on-chain that `admin` is now your address.
3. Rotate OPERATOR_MNEMONIC on the API; restart.
4. Drain the old operator account of ALGO.
5. Only then: investigate.
```

**What rotation fixes:** all future abuse. **What it cannot fix:**

| Damage | Recoverable? |
|---|---|
| Audit entries the attacker forged with `log_access` | **No. Permanent.** They cannot be deleted or amended — no method mutates an existing `audit_log` key (DATA-002). They can only be **superseded** by later, correct entries. **That is materially worse for an audit log than a gap would be**, because the record is trusted precisely for being on-chain. SEC-008 |
| ALGO drained via `withdraw_excess` | **No.** Gone |
| Consent grants | **Untouched, and this is a real containment boundary worth crediting.** An admin cannot create, modify or revoke a grant — `grant_access` and `revoke_access` assert `Txn.sender` **is the patient** (SEC-003, **VALIDATED**). **An operator-key compromise can forge the record of an access; it cannot forge consent** |
| Revenue already sent to a changed `payTo` | **No.** And nothing would have detected the change (`Monitoring.md` §3.4) |

**Recovering the truth after forged entries.** There is no on-chain remedy. The off-chain remedy is to publish, outside the contract, the round range during which the key was compromised, so any consumer of the audit log can treat entries in that window as unattested. Doing that requires knowing *when* the compromise began — which today is not knowable, because there are no logs to correlate against and `total_audit_entries` is the only signal. **This is the strongest single argument for §3.3's detection set.** Full runbook: [`Incident_Response.md`](Incident_Response.md) §C.

### 5.3 Deployer key lost

**Largely recoverable — accept a new identity rather than chasing the old one.**

```
1. Confirm what the key still controls: any residual balance in the deployer
   account, and — today — the payTo address for revenue.
2. If it is also the current admin (it is, today), STOP: this is §5.1.
3. If admin has already been rotated away to a surviving key, the deployed
   contract is unaffected. The only loss is deploy idempotency.
4. For any future deploy, use a new deployer. Expect AppFactory.deploy to
   CREATE a new application rather than find the old one — it matches on
   (app_name, creator), and the creator has changed
   (contracts/scripts/deploy_testnet.py:83-96).
5. Set PAY_TO_ADDRESS to a cold address that is not the deployer (§4.2).
   Do this now rather than after the next incident.
```

### 5.4 App account drained, or MBR-exhausted

Two different failures with one symptom: `logAccess` throws, `records.ts:49` does not catch it, and the request returns `500` after a successful consent check. The caller is not charged; the sale is lost. Both are **capacity** problems, not disasters, and both are fully recoverable — which is why they belong here only as the recoverable end of the spectrum.

| Failure | Recovery | Prevention |
|---|---|---|
| **Operator account out of ALGO** | Send ALGO to the operator address. Takes seconds. Effect is immediate — no restart, no redeploy | Balance alert (`Monitoring.md` §5.1). **The most dangerous blind spot in the system**: an empty operator account silently converts every consent-granted paid call into a lost sale, indefinitely, with no signal to anyone |
| **App account out of box-MBR headroom** | Call `fund_mbr(payment)` — **callable by anyone**, not just the admin (`contract.py:129-138`; it asserts only that `payment.receiver` is the app address). **So MBR exhaustion is recoverable even if the admin key is lost.** That is a genuinely well-chosen design decision and worth crediting | Headroom alert (`Monitoring.md` §5.2), expressed in **boxes**, not µALGO |

⚠ **Sizing hazard when refunding.** Use **22,500 µALGO** per grant box, **not** the 22,100 that `get_grant_box_mbr()` returns — defect **C-2 / G-20** omits the `BoxMap` key-prefix byte and under-reports by 400 µALGO per box. Verified on-chain: `min-balance 145,000` with 2 boxes and a 100,000 base ⇒ 45,000 ⇒ 2 × 22,500. **The wrong value is constant-folded into the deployed program and cannot be fixed on App `768743428`.** Audit entries cost ~59,300 µALGO each plus 18,900 on a patient's first entry; the full model is in [`../04_Data/Database_Design.md`](../04_Data/Database_Design.md) §7.

**One thing that is never recoverable here:** minimum balance locked by an existing box. No method deletes a box, so every grant and every audit entry permanently raises the app account's floor. `withdraw_excess` reclaims only what is *above* the minimum. **The app account is a one-way door**, and MBR consumption is monotonic for the life of the application.

### 5.5 API host lost

**The easiest scenario in this document, and currently the hardest to execute.**

The tier is stateless (NFR-001) and its entire durable state is on-chain. Recovery is: run the code somewhere, with the right configuration.

```
1. Clone the repository at the intended commit.
2. Restore the configuration TUPLE, not just the image:
     NETWORK, CONSENT_APP_ID, PAY_TO_ADDRESS, FACILITATOR_URL, OPERATOR_MNEMONIC
   A release is an image AND a config. D-1 and D-2 are what forgetting that
   looks like.
3. npm ci && npm run build && node dist/index.js
4. Verify — and do NOT stop at /v1/health, which stays green under both D-1
   and a facilitator outage:
     GET  /v1/health           -> 200, and "consentAppId" is NOT null (D-1 guard)
                                        and "network" matches the App ID's
                                        network (D-2 guard)
     GET  /v1/consent/app-info -> 200 with the expected App ID
     GET  /v1/consent/arc56    -> 200 JSON, not 404 (proves the artifact copy)
     GET  /v1/consent/status   -> 200 with a boolean (proves App ID + operator
                                    key are BOTH loaded)
     POST /v1/triage           -> 402 with a PAYMENT-REQUIRED header
                                    (500 = facilitator unreachable, not a
                                     failed recovery)
```

**Two hazards specific to this recovery.**

- **`api/fly.toml` as committed produces a broken service.** It hard-codes `NETWORK = "mainnet"` (`:10`), where no `MedRailConsent` exists, and sets no `CONSENT_APP_ID`; the Dockerfile copies no deploy artifact, and with `WORKDIR /app/api` the fallback at `config.ts:31-40` looks for `deploy_mainnet.json`, **a file that has never existed**. Recovering *from the committed config* recovers a service that cannot work (**G-07**). Override both.
- **Do not start more than one machine.** `withPatientLock` (`services/algorand.ts:130-138`) serialises audit writes **in-process only**, while `api/fly.toml:18-19` permits more than one (`auto_start_machines = true`, `min_machines_running = 1` is a floor, not a ceiling). A second instance racing on the same patient produces a box-reference mismatch and an AVM rejection — availability loss, **not** log corruption, because the contract self-assigns the sequence (`contract.py:224-226`). **G-11 / D-7**, CORRECTIONS §C-3.

**Web host lost** is the same shape, with one addition: `NEXT_PUBLIC_API_BASE` is inlined at build time, so recovering the web tier also fixes *which API the browser calls*. If the API moved, rebuild rather than redeploy.

### 5.6 The contract needs replacing

**There is no contract rollback, no contract patch and no contract hotfix. Read [`../08_Deployment/Rollback_Strategy.md`](../08_Deployment/Rollback_Strategy.md) §2 in full before doing anything here.** The DR-relevant summary:

`contracts/scripts/deploy_testnet.py:92-96` deploys with `on_update=OnUpdate.AppendApp`. **"AppendApp" does not append to the app — it appends *an app*.** A changed program produces a **brand-new application** with a new App ID and a new application account, sitting alongside `768743428`, which continues to exist forever. There is no in-place update, because the contract declares no `UpdateApplication` handler and none can be added.

⚠ **Box state does not migrate. This is the single most important DR consequence in the system.**

| State | Old app | New app |
|---|---|---|
| Grant boxes | remain, unchanged, forever | **zero.** Every patient must re-grant, signing with their own key. **There is no admin path to recreate a grant** — `grant_access` asserts `Txn.sender` is the patient |
| Audit sequences and entries | remain, readable forever | **zero.** Sequences restart at 1. **The audit history does not follow** |
| Global counters | preserved | all zero |
| ALGO balance | whatever remains | **zero until funded.** `deploy_testnet.py:118-124` sends 5 ALGO only on a fresh create |
| Admin | current admin | the **new deployer** (`contract.py:120` — `create` sets `admin = Txn.sender`) |

**So a contract replacement is a consent-registry reset**, and it must be planned as a migration, not as a deploy. Before starting, answer in writing:

1. **Who re-grants, and how are they told?** Enumerate the affected patients from the old app's `grant_access` transaction history via the indexer — the transactions are public, which is exactly the property S-1 exploits and which here works in your favour.
2. **Which App ID is authoritative** for a compliance question about a past access? Record the answer; both apps exist forever.
3. **Is the old app preserved as the archival audit source?** It is, automatically and permanently. Document that fact for whoever asks later.
4. **Does the operator account hold admin on the new app?** If not, `set_admin` to it *before* traffic arrives, or every paid `/v1/records/summary` fails `only admin` (`contract.py:222`) after a successful consent check.
5. **Do all three box-key derivations still agree?** `contract.py:95-99`, `api/src/services/algorand.ts:63-79`, `web/lib/consent.ts`. **There is no cross-implementation test** (NFR-011, **UNVALIDATED**, G-08). A prefix or hash-input change breaks the Node and browser clients at *runtime*, not at build time — and it manifests as "the patient's grant mysteriously does not work", the hardest class of bug to diagnose.

Note also that **defects C-1 (swapped `AccessRequested` event fields) and C-2 (wrong `GRANT_BOX_MBR`) are permanent properties of App `768743428`.** They can only be fixed by replacing the application, which means accepting everything in this subsection. That trade is why the gap report defers both.

### 5.7 Complete loss: rebuild from nothing

The compound scenario — key gone, host gone, only the repository survives.

```
1. Clone. Verify the contract build reproduces byte-for-byte:
     python -m puyapy smart_contracts/consent/contract.py --out-dir artifacts
     cmp the four outputs against contracts/artifacts/  (note G-28: puyapy
     resolves --out-dir relative to the SOURCE file, so the outputs land in
     contracts/smart_contracts/consent/artifacts/ and are copied across)
   Run the tests: pytest tests/ -q  ->  28 passed
2. Generate a NEW deployer and a NEW operator, offline. Back them up per §4
   BEFORE using them. This is the one chance to fix the custody posture.
3. Deploy:  NETWORK=testnet .venv/Scripts/python.exe scripts/deploy_testnet.py
   Record the new App ID, app address and funding transaction.
4. Opt the payTo account in to the USDC ASA:  scripts/opt_in_usdc.py
   (An account that has not opted in CANNOT RECEIVE the asset. Revenue would
   silently fail to arrive with no error visible from inside the API.)
5. Configure and start the API with the new App ID.
6. Exercise the lifecycle:  scripts/exercise_contract.py
   Then one real paid call:  API_BASE=… npx tsx api/scripts/e2e-proof.ts
7. Announce the new App ID. Every patient must re-grant (§5.6).
8. Record the OLD App ID as the archival audit source, permanently.
```

**What is unavoidably lost:** every consent grant (patients must re-grant), the continuity of the audit trail (split across two applications with no on-chain linkage), the ALGO locked in the old app account, and the old App ID's identity in every document, artifact and explorer link that cites `768743428`.

**What survives regardless:** all source, the byte-reproducible contract build, both test suites, the two static datasets, and the old application's complete state — permanently readable by anyone, forever, without MedRail's cooperation. **That last property is the point of building on a public ledger, and it is worth naming as the thing that makes this the mildest "total loss" scenario the system could have.**

---

## 6. Dependency recovery

Three external dependencies. **One is configurable, one is hardcoded, and one is not a runtime dependency at all** — the distinction matters and is routinely gotten wrong.

| Dependency | Configurable? | Runtime dependency? | Blast radius if gone |
|---|---|---|---|
| **GoPlausible facilitator** | **Yes** — `FACILITATOR_URL`, `config.ts:47` | Yes — the 3 priced routes | All revenue |
| **AlgoNode algod** | **NO** — hardcoded per network, `config.ts:21-24`, **no env override** | Yes — `/v1/consent/status` and `/v1/records/summary` | Both chain-dependent routes |
| **AlgoNode indexer** | Declared at `config.ts:51`… | **NO** — see §6.3 | None |

### 6.1 AlgoNode outage — a genuine single point of failure

```ts
// api/src/config.ts:21-24 — the entire failover story
const ALGOD_SERVER: Record<NetworkName, string> = {
  testnet: "https://testnet-api.algonode.cloud",
  mainnet: "https://mainnet-api.algonode.cloud",
};
```

```ts
// api/src/services/algorand.ts:5 — no token, no timeout, no retry, no breaker
const algod = new algosdk.Algodv2("", config.algodServer, "");
```

**There is no `ALGOD_SERVER` environment variable.** Switching provider — to Nodely, to a self-hosted node, to any other algod — requires a **code change, a rebuild and a redeploy**. During an outage that is the slowest possible mitigation, and it is the one incident that turns a config change into a release. **OPS-057**, and the reason [`Incident_Response.md`](Incident_Response.md) §F calls it "the incident that makes OPS-057 worth fixing before it is needed".

Failure behaviour, all **NOT IMPLEMENTED** mitigations (REL-003 / R-4):

- No timeout on the algod client, so a hung endpoint hangs the request.
- No retry and no circuit breaker.
- `atc.execute(algod, 4)` waits ~4 rounds (roughly 14 s) and then throws `Transaction not confirmed after 4 rounds` (`algosdk/dist/esm/wait.js:48`).
- A single blip becomes a user-visible `500` on `/v1/consent/status` and on the success path of `/v1/records/summary`.

**Recovery:** wait, or ship a build with a different URL. That is the honest list.

**RECOMMENDED, and it is one line:** `algodServer: process.env.ALGOD_SERVER ?? ALGOD_SERVER[network]`. It converts a code-change incident into a config-change one and costs nothing. Algorand's algod API is standard across providers, so a fallback list is a genuinely viable next step — this is not a lock-in problem, it is an unexercised option.

### 6.2 The facilitator is permanently gone

`FACILITATOR_URL` **is** configurable, and that flexibility is real. But recovery is not just repointing a URL, because the dependency is deeper than the transport:

| Consideration | Detail |
|---|---|
| **The 402 cannot be built offline** | `accepts[].asset` and `extra.feePayer` come from the facilitator's `/supported`, not from MedRail's config — `api/src/x402.ts:16-31` deliberately omits `asset`. With no facilitator there is no challenge, and all three priced routes return `500` with no `PAYMENT-REQUIRED` header (**G-04 / R-1 / REL-001**, reproduced) |
| **Fee sponsorship goes with it** | The facilitator supplies `extra.feePayer`, which is why callers need USDC but not ALGO. A replacement that does not sponsor fees changes the caller contract, not just the endpoint |
| **A replacement must speak x402 v2, scheme `exact`, on Algorand** | The scheme is registered per CAIP-2 network at `x402.ts:11-14`. Only the configured network is registered — deliberate, and it means a payment signed for the other network is rejected (NFR-002) |
| **Free routes are unaffected** | Verified: `/v1/health`, `/`, `/v1/consent/app-info` and `/v1/consent/status` all keep returning `200` throughout a facilitator outage (REL-005, **VALIDATED**) |
| **It self-heals** | Verified by reproduction: the SDK re-attempts `initialize()` on the *next* priced request, so service resumes without a restart once the facilitator returns (`@x402/hono/dist/esm/index.mjs:125-139`). See [`../05_API/API_Error_Catalog.md`](../05_API/API_Error_Catalog.md) §3.5.1 |

**Recovery options, in order of preference:** repoint `FACILITATOR_URL` at another x402 facilitator serving Algorand; self-host one (which means holding and funding the fee-sponsor account, and reintroduces exactly the infrastructure this architecture excludes); or, as a stopgap, cache the last-known `/supported` response so `402`s can still be issued while settlement is unavailable. The last is **RECOMMENDED** in the gap report as the graceful-degradation fix and is the only one that requires no external party.

### 6.3 The indexer is a verification dependency, not a runtime one

`config.ts:51` computes `indexerServer` from a per-network map — and **no module in `api/src` or `api/scripts` references it** (verified by grep; **G-29**). The running service never calls an indexer. Every chain read the API performs goes through **algod**, via `AtomicTransactionComposer.simulate()`.

This matters for DR in a specific way: **an indexer outage does not affect the running service at all.** It affects humans and scripts checking the ledger — including most of the recovery verification steps in this document and every chain-native check in [`Monitoring.md`](Monitoring.md) §5. Documenting the indexer as a runtime dependency would overstate the service's external coupling; documenting it as unnecessary would understate how much of *this document* depends on it.

**Where an indexer outage does bite:** during an incident, when you are trying to reconstruct what happened from the ledger. Note that algod itself serves box listings with a prefix filter and single-box reads, so some verification survives an indexer outage — the transaction *history* queries do not.

---

## 7. DR test plan — **RECOMMENDED**, runnable on TestNet today

**No DR drill has ever been run.** Every drill below uses infrastructure that already exists, costs only TestNet ALGO, and touches nothing on MainNet. Run them in order; each is meaningful alone.

### 7.1 Drill 1 — rebuild from source

**Proves:** §1.3, and that the repository is a sufficient backup of everything except keys.

```
Clone into a clean directory. Do NOT copy any .env file.
  contracts:  pip install -r requirements-dev.txt
              python -m puyapy smart_contracts/consent/contract.py --out-dir artifacts
              cmp the four outputs against contracts/artifacts/   (see G-28)
              pytest tests/ -q                       expect: 28 passed
  api:        npm ci && npx tsc --noEmit && npm run build && npx vitest run
                                                     expect: 45 passed
  web:        npm ci && npx tsc --noEmit && npm run build
                                                     expect: 2 static routes
```

**Pass criterion:** all four artifacts byte-identical, all 32 tests green, both builds clean. **Record how long it took** — that is the first real input to §3.2's source-recovery RTO, and it is the only way any target there stops being a guess.

### 7.2 Drill 2 — recover the service from configuration alone

**Proves:** §5.5, and that the configuration tuple is complete and known.

```
From the Drill 1 clone, with no .env present, start the API supplying ONLY:
  NETWORK=testnet CONSENT_APP_ID=768743428 PAY_TO_ADDRESS=<addr>
  FACILITATOR_URL=https://facilitator.goplausible.xyz OPERATOR_MNEMONIC=<restored>

Then run every check in §5.5.
```

**Pass criterion:** `/v1/consent/status` returns `200` with a boolean. **Failure to name the tuple from memory is itself the finding** — it is what §3.2's "configuration RPO 0 is currently unachievable" means in practice.

### 7.3 Drill 3 — dependency loss, both kinds

**Proves:** blast radius, and the self-healing behaviour in §6.2.

```
a) FACILITATOR_URL=http://127.0.0.1:1   (a closed port)
   Expect: the 3 priced routes -> 500
             {"error":"Failed to initialize: no supported payment kinds
               loaded from any facilitator."}
           /v1/health, /, /v1/consent/app-info, /v1/consent/status -> 200
   Then restore FACILITATOR_URL and, WITHOUT RESTARTING, call a priced route
   again. Expect 402. (Verified during this review: request #1 -> 500,
   request #2 -> 402, with exactly two upstream /supported calls.)

b) Point the algod URL at a closed port (this needs a CODE EDIT — that is
   the finding, OPS-057, §6.1).
   Expect: /v1/consent/status and /v1/records/summary -> 500
           the two rule-engine routes -> unaffected
```

**Pass criterion:** the blast radii are exactly as documented, and the facilitator case recovers with no restart. **Drill (b) failing to be runnable without a code change is the result** — record it as such.

### 7.4 Drill 4 — admin rotation, on a throwaway application

**Proves:** §4.4 — the single most valuable drill in this list, because it rehearses the only containment control the system has.

```
1. Deploy a SECOND MedRailConsent to TestNet from a throwaway deployer:
     NETWORK=testnet .venv/Scripts/python.exe scripts/deploy_testnet.py
   (It creates a new app because the creator differs — that is §5.3 step 4
    demonstrating itself.)
2. Exercise it:  scripts/exercise_contract.py
3. Point a local API at the new App ID. Confirm /v1/consent/status works.
4. Run the §4.4 rotation against it, in order, timing each step.
5. Confirm the OLD key can no longer call log_access (expect an `only admin`
   rejection) and the NEW key can.
6. OPTIONAL, and worth doing: rehearse the REKEY in §4.3 on a throwaway
   ACCOUNT first — never on the account you depend on. Rekeying is
   irreversible without the new authority.
```

**Pass criterion:** rotation completes, the new key writes an audit entry, the old key is rejected. **Record the duration of the window between step 3 (`set_admin` lands) and step 4 (the API restarts) — that window is a live lost-sale window, and knowing its real length is the point of the drill.**

### 7.5 Drill 5 — close evidence gap E-1 while you are here

**Proves:** the audit-write path works on real infrastructure. It has never been demonstrated (`total_audit_entries = 5`), and it is the mechanism every project document presents as the differentiator.

```
1. Grant self-consent for scope "records:summary" through the web UI
   (patient-signed, client-side — the backend never touches the key).
2. Make one paid POST /v1/records/summary.
3. Confirm: the response carries auditTxId and auditSequence,
   total_audit_entries incremented from 0 to 1,
   and one `s`- and one `a`-prefixed box now exist on the app.
4. Record the transaction id in docs/PROOF.md.
```

**This is minutes of work — the code path already exists** — and it converts the headline claim from simulator-only into a checkable transaction id. It is **G-02**, ranked #2 in the gap report's top ten. It also gives every recovery-verification step in this document its first real pass.

### 7.6 What each drill would tell you that nothing else can

| Drill | The question it answers, which is currently unanswerable |
|---|---|
| 1 | Is the repository actually a sufficient backup? |
| 2 | Does anyone know the complete configuration tuple? |
| 3 | Are the documented blast radii real, and does the facilitator case self-heal? |
| 4 | **Can the team actually execute the only containment control the system has?** |
| 5 | Does the audit-write path work outside a simulator at all? |

**Run drill 5 first if you only run one.** Run drill 4 first if you run two.

---

## 8. Requirements traceability

| ID | Statement (abbreviated) | Status | Where |
|---|---|---|---|
| **OPS-007** | Backup and restore for durable state; backup and rotation for the operator mnemonic | **NOT APPLICABLE for stateful components** (there are none) / **NOT IMPLEMENTED for key material** | §1.2, §2, §4 |
| **OPS-008** | RPO and RTO are established | **NOT IMPLEMENTED** — never established; §3.2 proposes targets and does not adopt them | §3 |
| **OPS-057** | The algod endpoint is configurable, with a failover path | **NOT IMPLEMENTED** — hardcoded at `config.ts:21-24` | §6.1 |
| OPS-059 | Every deployed build identifiable and redeployable by immutable tag/digest | **NOT IMPLEMENTED** | §1.5, §3.2 |
| OPS-001…OPS-005 | Health-probe wiring, structured logging, metrics, tracing, alerting | **NOT IMPLEMENTED** (OPS-001 implemented but unwired) | §3.1, §3.3 |
| **SEC-012** | The operator/admin key protected commensurate with its authority | **NOT IMPLEMENTED** | §2, §4 |
| SEC-002 | Only the admin can withdraw funds or rotate the admin | **VALIDATED** | §2.2, §5.2 |
| SEC-003 | Only the patient can grant or revoke consent | **VALIDATED** | §2.2, §5.2 — the containment boundary a key compromise cannot cross |
| SEC-008 | The audit trail accurately attributes each access | **NOT IMPLEMENTED** | §5.2 — why a forged entry is permanent |
| SEC-015 | Secrets are kept out of version control and out of images | **PARTIALLY IMPLEMENTED** — gitignore verified; no `.dockerignore` (D-3) | §2.1 |
| NFR-001 | The API holds no server-side session or persistent request state | **IMPLEMENTED** | §1.3, §5.5 |
| NFR-011 | Box-key derivation byte-identical across contract, backend, browser | **UNVALIDATED** — no cross-implementation test | §5.6 |
| DATA-001 | Consent state is durable on-chain | **VALIDATED** — 2 grant boxes on App `768743428` | §1.2 |
| DATA-002 | Audit entries are append-only, never mutated or deleted | **IMPLEMENTED** | §1.2, §5.2 |
| REL-003 | Chain I/O has a timeout and a retry policy | **NOT IMPLEMENTED** | §6.1 |
| REL-006 | The app account holds sufficient balance for box MBR | **PARTIALLY IMPLEMENTED** — and the advertised per-box cost is wrong (C-2) | §5.4 |
| FR-029 | The admin can be rotated without redeploying | **VALIDATED at the contract layer; NOT IMPLEMENTED operationally** — no runbook existed before §4.4 | §4.4, §5.2 |

**No new requirement IDs are allocated by this document.**

---

## 9. Cross-references

| Topic | Document |
|---|---|
| Why there is no contract rollback; `OnUpdate.AppendApp`; box state does not migrate | [`../08_Deployment/Rollback_Strategy.md`](../08_Deployment/Rollback_Strategy.md) §2, §4 |
| Runbooks: key compromise (§C), operator ALGO (§D), app MBR (§E), algod outage (§F), bad deploy (§H) | [`Incident_Response.md`](Incident_Response.md) |
| The chain-native checks that turn §3.3 from a recommendation into a signal | [`Monitoring.md`](Monitoring.md) §5 |
| The never-log list, and why logs are not durable state | [`Logging.md`](Logging.md) §5, §2 |
| Every error a recovery verification step can encounter, with exact bodies | [`../05_API/API_Error_Catalog.md`](../05_API/API_Error_Catalog.md) |
| MBR economics behind §5.4's sizing | [`../04_Data/Database_Design.md`](../04_Data/Database_Design.md) §6, §7 |
| The key-compromise blast radius and the S-1 exploit chain | [`../06_Security/Threat_Model.md`](../06_Security/Threat_Model.md) |
| Risk `RO-05` — no backup or rotation procedure for the operator mnemonic | [`../06_Security/Risk_Register.md`](../06_Security/Risk_Register.md) |
| The findings cited here by G-number | [`../ENGINEERING_GAP_REPORT.md`](../ENGINEERING_GAP_REPORT.md) |
| Corrections that supersede stale framing elsewhere | |
