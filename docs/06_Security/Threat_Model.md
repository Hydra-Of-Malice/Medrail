# MedRail — Threat Model

**Purpose:** enumerate, rate, and assign a mitigation status to every threat this reviewer could identify against MedRail as it exists at commit `32ffd73`, using STRIDE as the decomposition frame.

**Status of this document:** authored 2026-08-21 from source review, live reproduction against the deployed TestNet contract (App ID `768743428`), and public-indexer queries. It is an engineering threat model, **not** a penetration test, a compliance artifact, or an audit. No scanning tool has been run against this codebase, so no CVE, vulnerability count, or scan result appears anywhere below. Threats were derived by reading code, not by exploitation — except where a row explicitly says *reproduced*.

**Headline:** **Both CRITICAL threats are now MITIGATED** by the payer-binding control in `api/src/x402Payer.ts`, verified against live TestNet by `api/scripts/verify-g01-fix.ts` — which performs the impersonation and asserts the 403. Of **35** enumerated threats: **11 MITIGATED**, **6 PARTIALLY MITIGATED**, and the remainder open, accepted as documented residual risk, or unverifiable — each labelled in the register below. The largest open cluster is admin-key authority (T-03, T-04, T-05) and supply-chain exposure (T-17 to T-20); neither has a cheap fix and both are stated rather than softened.

---

## 1. Scope, method, and rating scales

### 1.1 Scope

In scope: the `MedRailConsent` contract (App `768743428`), the `medrail-api` Hono service, the MedRail Web client, the trust relationship with the GoPlausible facilitator, and the trust relationship with AlgoNode.

Out of scope: the Algorand consensus protocol itself, the security of the GoPlausible facilitator's own infrastructure (assessed only as a trust assumption), AlgoNode's infrastructure, and the browser's own security model.

**A framing note that changes every impact rating below.** There is **no real patient data in this system**. `/v1/records/summary` returns one fixed synthetic constant regardless of `patientId` (`api/src/routes/records.ts:15-21`). Every impact rating is therefore given twice where it matters: *as-built* (synthetic data, TestNet play money) and *in a production variant handling real PHI*. Ratings in the register are **as-built**; the production delta is called out in the mitigation column or in §7. Conflating the two would either understate the design flaws or overstate the present danger, and both would be dishonest.

### 1.2 Scales

**Likelihood** — probability the threat is realised within a 12-month operating window, assuming the system stays as-built:

| Rating | Meaning |
|---|---|
| **High** | Requires only public information and ordinary access. An unmotivated attacker could stumble into it. |
| **Medium** | Requires some effort, a specific precondition, or motivated intent, but no privileged access. |
| **Low** | Requires privileged access, a third-party compromise, or an unlikely conjunction of events. |

**Impact** — worst credible consequence *as-built*:

| Rating | Meaning |
|---|---|
| **Critical** | Complete defeat of a core security property (access control, audit integrity), or irreversible loss of control of the system. |
| **High** | Loss of funds, loss of service availability for all callers, or permanent corruption of the on-chain record. |
| **Medium** | Degraded correctness, information disclosure, or availability loss on one route. |
| **Low** | Cosmetic, self-limiting, or bounded to worthless assets. |

**Risk** = the matrix below. It is derived, not assigned:

| | Impact Low | Impact Medium | Impact High | Impact Critical |
|---|---|---|---|---|
| **Likelihood High** | Low | Medium | High | **Critical** |
| **Likelihood Medium** | Low | Medium | High | High |
| **Likelihood Low** | Low | Low | Medium | Medium |

**Status:** **MITIGATED** / **PARTIALLY MITIGATED** / **NOT MITIGATED** / **UNVERIFIABLE** / **ACCEPTED** (a documented, deliberate decision to carry the risk).

---

## 2. Assets

| # | Asset | Criticality | Why | Where it lives |
|---|---|---|---|---|
| A-1 | **Operator / admin private key** | **CRITICAL** | Holds three separable powers simultaneously: forge audit entries (`contract.py:222`), rotate admin and lock out the owner (`contract.py:126`), drain the app account (`contract.py:258-259`). No multisig, no HSM, no rotation runbook. | `OPERATOR_MNEMONIC` env var → `api/src/config.ts:58` → `api/src/services/algorand.ts:12` |
| A-2 | **Audit log integrity** | **CRITICAL** | It is the product's differentiator. An on-chain record is trusted *because* it is on-chain and immutable; a false entry is therefore worse than no entry. Currently records a caller-asserted requester (S-1). | `audit_log` BoxMap, App `768743428`. **Zero entries exist on TestNet today** (E-1). |
| A-3 | **Consent grant state** | **HIGH** | The authoritative answer to "may this party read this patient's data." Correct and tamper-proof at the contract layer; the *use* of it in the API is defeated (S-1). | `grants` BoxMap, 2 boxes present, both revoked |
| A-4 | **`payTo` revenue stream** | **HIGH** | The commercial substance of the submission. Every priced call settles to one address (`api/src/config.ts:53`). | Deployer address `2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE` |
| A-5 | **Patient key custody** | **HIGH** | The claim that patients own their consent depends entirely on the backend never holding their key. Verified true (`NFR-008`). | User's own wallet; demo: browser `sessionStorage` (`web/lib/demoWallet.ts:17-27`) |
| A-6 | **App account ALGO balance** | **MEDIUM** | Funds box MBR. If exhausted, no grant and no audit entry can be created — a full functional outage of the consent layer. | App account, 5,000,000 µALGO against a 145,000 µALGO minimum |
| A-7 | **Service availability** | **MEDIUM** | Three priced routes and five free routes on one 512 MB shared-CPU machine (`api/fly.toml:21-24`), with no rate limiting. | `medrail-api` |
| A-8 | **Consent relationship metadata (privacy)** | **MEDIUM** as-built, **HIGH** in production | Every `grant_access` publicly and permanently reveals a `(patient, requester, scope)` relationship to any indexer. The box key is hashed; the transaction is not. | Algorand public ledger, forever |
| A-9 | **Deployer key** | **MEDIUM** | Created the app and is currently also the admin. Compromise ⇒ A-1 compromise. | `contracts/.env`, gitignored |
| A-10 | **Clinical reference table integrity** | **MEDIUM** | Directly determines the paid output of `/v1/interaction-check`. No checksum, no signature. | `api/src/data/interactions.json`, read once at module load |
| A-11 | **PHI** (production variant only) | **CRITICAL** | **Does not exist today.** Listed so the model is usable for the production version it is meant to become. | Nowhere. `api/src/routes/records.ts:15-21` returns a constant. |

---

## 3. Actors

| Actor | Capabilities | Motivation | Trusted for |
|---|---|---|---|
| **Anonymous paying caller** | Can call any route. Can pay $0.02/$0.05. Can set every field in every request body. Can read the entire ledger from any indexer. | Data access, cost-free reconnaissance, abuse | **Nothing.** This is the primary adversary for T-01. |
| **Authorised requester** | Has a genuine on-chain grant from a patient. | Legitimate access — and is the *identity being impersonated* in T-01, i.e. a victim, not an attacker. | Nothing beyond what the grant states |
| **Patient** | Holds their own key. Can `grant_access` / `revoke_access` directly against Algorand without touching MedRail. Can call `request_access` for any patient address. | Control of their own consent | To sign only for themselves — enforced structurally by `Txn.sender` (`contract.py:151,181`) |
| **MedRail operator** | Holds A-1 and A-9. Runs the API. Sets every environment variable including `FACILITATOR_URL`. | Running the service | Everything. This is the maximally-privileged party. |
| **Facilitator operator (GoPlausible)** | **Authoritative for "was this paid."** Also supplies the asset id and `feePayer` that make the 402 constructible at all. | Running a public facilitator | Settlement verdicts. Nothing else — it never touches consent or the audit log. |
| **AlgoNode operator** | Serves every `simulate` result MedRail's consent decisions are based on, and relays every `log_access` submission. Anonymous access, no API key. | Running a public node | Correct relay. Not confidentiality. |
| **Network observer** | Reads the public ledger and the indexer. Zero cost, zero access required, retroactive and permanent. | Deanonymisation, competitive intelligence, reconnaissance for T-01 | Nothing — this actor requires no trust because it requires no permission |
| **Malicious insider holding the admin key** | Everything A-1 permits. | Fraud, sabotage, cover-up | Nothing. There is **no separation of duties** and **no detection** — see T-03, T-04, T-05. |

---

## 4. Trust boundaries and attack surface

Four trust boundaries, matching the zones in `Security_Architecture.md` §1.1:

- **B1 — Internet → MedRail API.** Every byte crossing is attacker-controlled. Guarded by zod schemas and the x402 payment middleware. **This is where T-01 crosses.**
- **B2 — MedRail API → GoPlausible facilitator.** Outbound only, operator-configured destination. MedRail accepts the facilitator's verdict as fact.
- **B3 — MedRail API → AlgoNode → Algorand consensus.** Where the admin key is used. Guarded on the far side by `assert Txn.sender == self.admin.value`.
- **B4 — Browser → AlgoNode.** Patient-signed transactions that bypass MedRail entirely. MedRail cannot observe, block, or forge these — which is a *feature* (A-5) and a limitation (MedRail cannot enforce policy on consent changes).

### 4.1 Complete entry-point enumeration

**8 HTTP routes** — 3 priced, 5 free (4 under `/v1/*` plus the `/` service index):

| # | Route | Gate | Input surface | Notable |
|---|---|---|---|---|
| E-1 | `POST /v1/triage` | x402 $0.02 | `{symptoms: string 1..2000}` | Pure function, 11 static rules |
| E-2 | `POST /v1/interaction-check` | x402 $0.02 | `{medications: string[] 2..20}` | Pure function, 14 static pairs; unanchored matching (T-24) |
| E-3 | `POST /v1/records/summary` | x402 $0.05 + consent | `{patientId: 58ch, requesterAddress: 58ch}` | **T-01, T-02, T-11 all cross here** |
| E-4 | `GET /v1/consent/status` | **free, unauthenticated** | `?patient&requester&scope` | 2 outbound algod calls per request; **T-12, T-13, T-32** |
| E-5 | `GET /v1/consent/app-info` | free | none | Static config echo |
| E-6 | `GET /v1/consent/arc56` | free | none | Fixed file path, verified non-user-controlled (`api/src/app.ts:64`) |
| E-7 | `GET /v1/health` | free | none | Echoes network + App ID |
| E-8 | `GET /` | free | none | Service index |

**13 ABI methods** on App `768743428` — every one is reachable by any Algorand account that can pay a transaction fee; the guards are inside the methods:

| # | Method | Auth | Threat relevance |
|---|---|---|---|
| M-1 | `create` | `create="require"`; sets `admin = Txn.sender` | Already executed; not re-callable |
| M-2 | `set_admin` | **admin only** (`contract.py:126`) | **T-04** — irreversible lockout |
| M-3 | `fund_mbr` | anyone; asserts receiver == app (`contract.py:138`) | Safe. Cannot redirect funds. |
| M-4 | `request_access` | **anyone, no cost beyond fee** | **T-34** event spam; emits with fields inverted (**T-26**, defect C-1) |
| M-5 | `grant_access` | sender IS the patient | **T-14** box-MBR consumption; **T-21** publicly reveals the relationship |
| M-6 | `revoke_access` | sender IS the patient | Asserts the grant exists (`contract.py:182`) |
| M-7 | `check_access` | readonly, none | Free oracle — **T-32** |
| M-8 | `get_grant` | readonly, none | Free oracle |
| M-9 | `log_access` | **admin only** (`contract.py:222`) | **T-03** forgery; **T-10** concurrent-write rejection (availability, not integrity — §5.0); **T-14** box growth |
| M-10 | `get_audit_count` | readonly, none | Free oracle |
| M-11 | `get_audit_entry` | readonly, none | Free oracle |
| M-12 | `get_grant_box_mbr` | readonly, none | Returns a value 400 µALGO/box too low (defect C-2) — **T-27** |
| M-13 | `withdraw_excess` | **admin only** (`contract.py:258`) | **T-05** — unbounded `amount` parameter |

**Other surfaces:**
- **The facilitator callback path** — MedRail calls out to `FACILITATOR_URL` and consumes the response. There is no inbound webhook, so this is a response-consumption surface, not a listener. **T-06, T-07, T-08.**
- **The browser** — `sessionStorage` key custody (**T-22**), direct-to-AlgoNode signing (B4).
- **The build and deployment pipeline** — Docker build context (**T-30**), CI that never runs (**T-31**), dependency tree (**T-17…T-20**).

---

## 5. Threat register

35 threats. Rated per §1.2. Requirement IDs reference the canonical registry.

| ID | Asset | STRIDE | Threat | Attack vector | Likelihood | Impact | Risk | Mitigation | Status |
|---|---|---|---|---|---|---|---|---|---|
| **T-01** | A-3, A-11 | **Spoofing / Elevation of Privilege** | **Requester impersonation on `/v1/records/summary`.** Any paying stranger can assert any authorised requester's address and pass the consent gate. | Enumerate a valid `(patient, requester)` pair from public `grant_access` transactions via any indexer; pay the ordinary $0.05; POST `{patientId: victim, requesterAddress: authorised third party}`. `check_access` returns true because the grant genuinely exists. | **High** | **Critical** (as-built: synthetic constant returned; **production: total defeat of the consent layer**) | **CRITICAL** | Decode `PAYMENT-SIGNATURE` with `decodePaymentSignatureHeader` (`@x402/core/http`), recover the payer with `getSenderFromTransaction` (`@x402/avm`), reject with 403 unless `payer === requesterAddress`. Or `ProtectedRequestHook` via `.onProtectedRequest()`. ~10–15 lines. `SEC-007`, `FR-039`. **FIXED:** `api/src/x402Payer.ts` recovers the payer from the verified `PAYMENT-SIGNATURE` header; `records.ts` rejects with 403 unless it equals `requesterAddress`. 6 unit tests plus a live attack simulation (`api/scripts/verify-g01-fix.ts`). | **MITIGATED** |
| **T-02** | A-2 | **Repudiation / Tampering** | **False attribution written to the immutable audit log.** A successful T-01 permanently records the *impersonated* party as the accessor. | `api/src/routes/records.ts:49` passes the caller-asserted `requesterAddress` straight into `logAccess`, which writes it to a public, append-only, never-deletable box. | **High** (automatic consequence of T-01) | **Critical** — an on-chain record trusted *because* it is on-chain, asserting something false, with no correction mechanism | **CRITICAL** | Same fix as T-01. `SEC-008`. Until then, the audit log records claims, not facts. **FIXED:** removed with T-01 — a forged requester can no longer reach `log_access`, so no false attribution can be written. | **MITIGATED** |
| **T-03** | A-2, A-1 | **Tampering / Repudiation** | **Audit forgery by the admin key holder.** Arbitrary `(patient, requester, scope, endpoint, action)` entries written to any patient's trail — including fabricating accesses that never occurred. | Compromise `OPERATOR_MNEMONIC` (env var, process memory, `fly ssh console`, crash dump, malicious dependency reading `process.env`), then call `log_access`. | **Medium** | **Critical** — destroys the credibility of A-2 retroactively and undetectably | **HIGH** | On-chain gate is correct (`SEC-001`, **VALIDATED**) but gates *against non-admins*, not against a compromised admin. No multisig, no HSM, no rotation runbook (`SEC-012`). Split the writer role from the owner role (`SEC-055`). | **NOT MITIGATED** |
| **T-04** | A-1, A-3 | **Elevation / Denial of Service** | **Admin lockout via `set_admin`.** One transaction transfers contract ownership irreversibly. | Attacker with A-1 calls `set_admin(attacker)`. No timelock, no two-step accept, no recovery key, no second admin. | **Low** | **High** — permanent loss of control of App `768743428`; the audit log can never be written by the legitimate operator again | **MEDIUM** | None beyond key secrecy. `FR-029` makes rotation possible; nothing makes it safe. RECOMMENDED: multisig admin, or a two-step propose/accept. | **NOT MITIGATED** |
| **T-05** | A-6, A-1 | **Elevation / Tampering** | **App-account drain via `withdraw_excess`.** The `amount` parameter is caller-supplied and **unbounded in-contract** — the only limit is the AVM's own minimum-balance check at submission. | Attacker with A-1 calls `withdraw_excess(max)`, sweeping the balance to the (now attacker-controlled) admin via an inner payment with `fee=0` (`contract.py:259`). | **Low** | **High** — app account cannot cover box MBR; no new grant or audit entry can be created; functional outage of the consent layer | **MEDIUM** | Admin gate only. The success path is **untested** (`FR-031` **PARTIALLY IMPLEMENTED** — negative case only). RECOMMENDED: bound `amount` in-contract, or remove the method. | **NOT MITIGATED** |
| **T-06** | A-4, A-2 | **Spoofing / Tampering** | **Malicious facilitator falsely confirms settlement.** MedRail serves the resource and writes an audit entry for a payment that never happened. | Compromise or malice at `facilitator.goplausible.xyz`; return a positive verify/settle verdict for an invalid payload. | **Low** | **High** — free resource delivery, and A-2 permanently attests to a paid access that was not paid | **MEDIUM** | **ACCEPTED as the standard x402 trust model** — the facilitator is by protocol design the verify+settle authority, and `docs/SECURITY.md:84-87` records this correctly. MedRail does **not** independently re-verify against algod (`SEC-057`, RECOMMENDED, ~1 lookup). | **ACCEPTED** (documented residual) |
| **T-07** | A-7, A-4 | **Denial of Service** | **Facilitator outage bricks all three priced routes with an opaque 500.** No 402, no `PAYMENT-REQUIRED` header, no 503, no `Retry-After`. | Any facilitator downtime or network partition. **Reproduced by the reviewer** by pointing `FACILITATOR_URL` at a closed port. | **Medium** | **High** — 100% revenue loss for the duration; agents see a server fault and may retry-storm | **HIGH** | None. No timeout, retry, circuit breaker, or cached-`/supported` fallback. Root cause is architectural: `accepts[].asset` and `extra.feePayer` come from `/supported`, so the 402 cannot be built offline (`api/src/x402.ts:16-32`). Free routes verified to stay up (`REL-005` **VALIDATED**). `REL-001`. **FIXED:** the payment middleware is wrapped so a facilitator-initialisation failure returns **503 + `Retry-After: 30`** with code `PAYMENT_FACILITATOR_UNAVAILABLE`. Free routes stay 200. | **MITIGATED** |
| **T-08** | A-4, A-2 | **Tampering / Spoofing** | **Payment diversion via `FACILITATOR_URL`.** Whoever can set that env var redirects every payment payload and controls the settlement verdict. | Compromised CI, misconfigured Fly secret, malicious deployment-manifest change, compromised deploy tooling. | **Low** | **High** | **MEDIUM** | None. No allowlist, no `https:` requirement, no pinning (`api/src/config.ts:47`). No **user-driven** SSRF exists — every outbound destination is operator-set. `SEC-058` RECOMMENDED. | **NOT MITIGATED** |
| **T-09** | A-4 | **Spoofing** | **Replay of a settlement proof** to obtain a second resource delivery from one payment. | Re-present a previously accepted `PAYMENT-SIGNATURE` header. | **Unrated** | **Medium** | **UNVERIFIABLE** | MedRail implements **no replay defence of its own** and holds no state to implement one (`NFR-001`: no datastore). The AVM note is `` `x402-payment-v${x402Version}-${Date.now()}` `` (`@x402/avm/dist/cjs/index.js:266`) — a **client-generated timestamp, not a server nonce**; it must not be described as replay protection. No `replay`/`nonce`/`duplicate` symbols appear in the installed SDK's exported type surface. Algorand rejects duplicate txids within a validity window, so the same `axfer` cannot commit twice — but whether the facilitator returns "settled" for an already-committed transaction was **not exercised and cannot be determined from this repository**. `SEC-052`. | **UNVERIFIABLE** |
| **T-10** | A-7, A-4 | **Denial of Service** (**not** Tampering — see note below) | **Audit-write failure under concurrency.** Two processes predict the same next sequence, declare the same box reference, and the loser's transaction is **rejected by the AVM**. The write fails; it does not corrupt. | Run >1 API instance against the same operator account and contract, with concurrent requests for the same patient. | **Medium** | **Low** (fails atomically and closed) — but **chains into T-11**, where a rejected write on the unguarded success path becomes HTTP 500 *after* settlement, i.e. a lost payment | **LOW** | `withPatientLock` (`api/src/services/algorand.ts:123-138`) serialises **in-process only**; the in-code comment says so and `docs/SECURITY.md:49-60` documents it. **`api/fly.toml:17-19` permits >1 machine** (`auto_start_machines = true`; `min_machines_running = 1` is a floor, not a ceiling), so the deployment config reintroduces the race the lock was written to prevent. `REL-004`, D-7. Correct fixes: pin to one machine, or guard the success path (T-11), or have the caller pass a wider box-reference window. | **PARTIALLY MITIGATED** |
| **T-11** | A-4 | **Repudiation** | **Settled payment lost to a 500.** Caller pays $0.05, receives HTTP 500, gets nothing; no refund path, no retry token, no idempotency key, no record. | Any throw inside `logAccess` on the *allowed* path: operator out of ALGO, app account out of box MBR, algod 5xx, or validity-window expiry (`atc.execute(algod, 4)` waits 4 rounds then throws). | **Medium** | **Medium** | **MEDIUM** | **None on the success path.** The asymmetry is explicit: the *denied* path wraps the call in `.catch(() => undefined)` (`records.ts:37`), the *allowed* path does not (`records.ts:49`). `REL-002`, finding R-2. **WITHDRAWN — this was never possible.** `@x402/hono` reaches `processSettlement` only on a sub-400 response, so a 4xx/5xx cancels the payment before money moves. The real exposure was a *lost sale*, now removed by the guarded audit write (`auditStatus: "pending"`). | **NOT APPLICABLE** |
| **T-12** | A-7 | **Denial of Service** | **Resource exhaustion via free `/v1/consent/status`.** Free, unauthenticated, 2 sequential outbound algod calls per request (measured 505 ms cold), on a 512 MB / 1 shared-CPU machine. | Sustained unauthenticated GET flood. Requires no payment and no identity. | **High** | **Medium** | **MEDIUM** | **No rate limiting anywhere** — not per IP, not per route, not global, not at the platform (`SEC-013`). No load test exists, so no capacity figure is claimed here. **FIXED:** `api/src/rateLimit.ts` — 60/min on `/v1/consent/status`, 429 + `Retry-After`. | **MITIGATED** |
| **T-13** | A-7 | **Denial of Service** | **MedRail as an amplifier against AlgoNode.** 1:2 request amplification into a free public good, from MedRail's own anonymous, keyless client. | Same vector as T-12. Consequence: MedRail's address is throttled or blocked by AlgoNode. | **Medium** | **High** — loses `/v1/consent/status` *and* `/v1/records/summary` together, plus reputational damage with a shared community resource | **HIGH** | None. `api/src/services/algorand.ts:5` uses no API key, no timeout, no retry, no circuit breaker (`REL-003`). Rate limiting (`SEC-013`) is the primary control; a dedicated API key would also cap the blast radius. **FIXED:** same rate limiter bounds the amplification factor. | **MITIGATED** |
| **T-14** | A-6 | **Denial of Service** | **Box-MBR exhaustion griefing.** Every new `(patient, requester, scope)` grant and every audit entry locks up app-account balance permanently. Drain the balance and no further box can be created. | Attacker generates unlimited throwaway patient accounts and calls `grant_access` with novel scope strings — `scope` is a **free-form string, not an enumeration** (`DATA-003`), so the key space is unbounded. Each grant box costs ~22,500 µALGO of the app's balance. | **Medium** | **High** — total functional outage of the consent layer; recoverable only by refunding via `fund_mbr` (which anyone can call, so recovery is at least cheap) | **HIGH** | None. `fund_mbr` (`contract.py:130-138`) is the only lever and it is reactive. No monitoring or alerting on app-account MBR headroom (`OPS-005`, `REL-006` **PARTIALLY IMPLEMENTED**). Attacker pays their own transaction fees, so this is not free — but ALGO fees are ~0.001 ALGO against ~0.0225 ALGO of victim balance consumed per box: a **~22:1 economic asymmetry in the attacker's favour**. **Bounded:** `/v1/records/summary` and `/v1/consent/arc56` are rate-limited to 30/min (`api/src/rateLimit.ts`), capping the rate at which an attacker can drive box creation. The underlying MBR cost model is unchanged. | **PARTIALLY MITIGATED** |
| **T-15** | A-7 | **Information Disclosure** | **Internal exception messages returned verbatim to unauthenticated callers.** | `app.onError` returns `err.message` (`api/src/app.ts:60`). Today leaks an algosdk error string; tomorrow leaks whatever the next unhandled exception carries — e.g. `requireConsentAppId`'s message naming `CONSENT_APP_ID` and a repo-relative artifact path (`api/src/config.ts:63-66`), or the `OPERATOR_MNEMONIC` error text (`api/src/services/algorand.ts:10`). | **High** | **Low** | **LOW** | None. `SEC-011` **NOT IMPLEMENTED**. Fix: log server-side, return a generic body. **FIXED:** `app.onError` now logs the detail server-side against a generated `requestId` and returns a generic `INTERNAL_ERROR` body. No exception text reaches the caller. | **MITIGATED** |
| **T-16** | A-7 | **Denial of Service** | **Malformed-but-58-character address returns HTTP 500**, so a permanently-invalid client input is reported as a transient server fault — inviting infinite retries from any 5xx-keyed retry policy. | `GET /v1/consent/status?patient=<58 'A's>&…` → **500** `{"error":"wrong checksum for address"}`. **Reproduced.** zod validates length only (`api/src/routes/consent.ts:6-10`); `algosdk.decodeAddress` throws inside `grantBoxName`. | **High** | **Low** | **LOW** | None. `SEC-010` **NOT IMPLEMENTED**. Fix: `.refine(algosdk.isValidAddress)` on all four address fields — `@x402/avm` also exports `isValidAlgorandAddress`, already a dependency. **FIXED:** `api/src/validation.ts` validates the checksum via `algosdk.isValidAddress`, so a malformed address is a **400**, not a 500. Covered by `api/test/app.spec.ts`. | **MITIGATED** |
| **T-17** | A-1, A-4 | **Tampering / Elevation** | **Supply-chain compromise of `@x402/*`.** These packages sit directly on the payment path and run inside the process that holds A-1. | Malicious version published; pulled by `npm install` in either Dockerfile (**not** `npm ci`, so builds can drift from the lockfile CI validated). A postinstall script or runtime code reads `process.env.OPERATOR_MNEMONIC`. | **Low** | **Critical** — A-1 exfiltration means T-03, T-04 and T-05 all follow | **MEDIUM** | Four `@x402/*` packages are pinned exactly to `2.21.0` (good); `@x402/fetch` is `^2.21.0`. **No dependency scanning of any kind** (`SEC-014`). `@x402/extensions` is declared and **imported nowhere** — verified zero references — an unnecessary supply-chain surface that should simply be removed. D-4. | **NOT MITIGATED** |
| **T-18** | A-1, A-3 | **Tampering** | **Supply-chain compromise of `algosdk`.** It decodes addresses, derives box keys, and signs with A-1 in both the API and the browser. | `^3.6.0` caret range; `npm install` in Dockerfiles. | **Low** | **Critical** | **MEDIUM** | Same as T-17. Additionally: a compromised `algosdk` in the browser (`web/lib/consent.ts:50`) would exfiltrate **patient** keys, defeating A-5 — the one control this architecture is genuinely strong on. | **NOT MITIGATED** |
| **T-19** | A-5 | **Tampering** | **Supply-chain compromise of `next` / `react` / the web dependency tree** → script execution on the demo origin → `sessionStorage` mnemonic exfiltration (chains into T-22). | Malicious transitive package in `web/`. `web/Dockerfile:4` also uses `npm install`, and `COPY . .` with no `.dockerignore` ships the host `node_modules` into the build. | **Low** | **Low** (bounded to TestNet play money today) | **LOW** | No scanning, no CSP, no SRI. Impact is genuinely bounded by the demo wallet being worthless — **only until a real wallet integration exists.** D-5. | **NOT MITIGATED** |
| **T-20** | A-2, A-3 | **Tampering** | **Compiled contract diverges from source via a compromised `puyapy` toolchain.** The reviewed Python is not what runs; the AVM bytecode is. | Malicious `puyapy` 5.9.0 or `algopy` 3.5.1 emits bytecode that silently omits an admin assert or leaks state. | **Low** | **Critical** — every contract-layer control in this model (the strongest controls in the system) rests on the compiled artifact matching `contract.py` | **MEDIUM** | **Nothing in this repository verifies compiled output against source.** No reproducible-build check, no bytecode diff against the deployed app, no `pip-audit`. The deployed app's approval program was never compared to a local rebuild. Verifiable-build check RECOMMENDED. | **NOT MITIGATED** |
| **T-21** | A-8 | **Information Disclosure** | **Deanonymisation of the consent social graph by a passive network observer.** Every `grant_access` publicly and permanently reveals *who asked for whose records, and for what scope*. | Query any Algorand indexer for application calls to App `768743428`. The reviewer did exactly this, for free, with no access. The **box key is hashed** — but the **transaction is not**: the patient is `Txn.sender` and the requester is ABI arg 0 in cleartext, plus the `scope` string. | **High** — it requires no attack, only observation | **Medium** as-built (throwaway TestNet addresses), **High** in production | **MEDIUM** | **None, and none is possible for on-chain data.** The metadata *is* the leak: "patient X granted oncology-records access to clinic Y on date Z" is itself sensitive even with the record contents encrypted. Also the direct enabler of T-01's reconnaissance step. `SEC-056`. See `Privacy.md` §3–§4. | **NOT MITIGATED** (inherent to a public ledger) |
| **T-22** | A-5 | **Spoofing / Information Disclosure** | **Demo-wallet mnemonic theft via XSS.** `sessionStorage` is readable by any script on the origin. | Any XSS on the demo page reads `medrail-demo-wallet-v1` and recovers a signing key (`web/lib/demoWallet.ts:17-27`). | **Low** | **Low** — bounded to TestNet play money with no market value; cleared when the tab closes | **LOW** | **Verified: no XSS vector currently exists.** `dangerouslySetInnerHTML` appears nowhere in project source (only in `@types/react`); responses render via `<pre>{JSON.stringify(...)}</pre>` (`web/components/LiveDemoPanel.tsx:171-172`), which React escapes. Disclosed in-code, in the UI, and in `docs/SECURITY.md:35-38`. **Deliberate and defensible** — the blast radius was made worthless on purpose. Note `web/lib/demoWallet.ts:12` points at `lib/walletConnect.ts`, **which does not exist** (DOC-4) — the comment implies a production mitigation that has not been built. | **ACCEPTED** (bounded) |
| **T-23** | A-3 | **Tampering / Denial of Service** | **Cross-implementation drift in box-key derivation** causes silent authorisation failure. | The same SHA-256 derivation exists **three times independently**: `contract.py:96-98` (AVM), `api/src/services/algorand.ts:63-69` (Node), `web/lib/consent.ts:26-34` (browser `crypto.subtle`). A one-byte divergence makes `check_access` read an empty box and return `false`. | **Medium** (on any future refactor) | **Medium** — fails **closed**, but silently: indistinguishable from "you were never granted access" | **MEDIUM** | **No cross-implementation test exists** (`NFR-011` **UNVALIDATED**). Fix: one golden-vector file asserting the exact 33-byte box name for fixed triples — ~30 lines, closes the class. **FIXED:** a shared golden-vector fixture (`api/test/fixtures/box-key-vectors.json`) is asserted by `api/test/boxKeyParity.spec.ts` (Node + WebCrypto) **and** `contracts/tests/test_box_keys.py` (Python), pinning all three implementations to identical bytes. | **MITIGATED** |
| **T-24** | A-10 | **Tampering (output integrity)** | **Malicious or garbage clinical input yields false-positive or false-negative intelligence output.** | `checkInteractions` matches with an **unanchored, bidirectional substring** rule: `m.includes(a) \|\| a.includes(m)` (`api/src/services/interactionChecker.ts:42-43`). A medication literally named `"a"` is contained by "warfarin", "aspirin", "tramadol"… so `["a","b"]` can flag interactions that do not exist. Conversely a misspelling or a brand name absent from the 14-pair table yields a **false negative** — silence that reads as "no interaction found". | **High** | **Medium** as-built; **High** in real-world use — a false negative on a contraindicated pair is a patient-harm vector, and the table covers 14 pairs | **MEDIUM** | Partially mitigated by design honesty, not by code: every response carries a non-diagnostic disclaimer, **asserted by tests** (`FR-009`, `AI-002` **VALIDATED**), and cites its reference class (`AI-004`). The existing test `interactionChecker.spec.ts::"always includes a source citation"` calls exactly `checkInteractions(["a","b"])` and asserts **only** the disclaimer — so the defect is exercised and not checked. `AI-006` **NOT IMPLEMENTED**. Fix: token-boundary matching or an RxNorm/synonym map. **No sensitivity/specificity measurement exists and none is claimed** (`AI-005`). | **PARTIALLY MITIGATED** |
| **T-25** | A-10 | **Tampering** | **Reference-table poisoning.** Rewriting `interactions.json` silently changes clinical output for every caller of a paid endpoint. | Compromised build, malicious dependency postinstall, or a container with a writable bind mount. Loaded once at module start via `readFileSync` (`api/src/services/interactionChecker.ts:18`) with **no checksum, no signature, no integrity check**. | **Low** | **High** — clinically wrong paid output, delivered with a confident-looking provenance string | **MEDIUM** | None. `SEC-053` (new) **NOT IMPLEMENTED**. Also an availability dependency: a missing or malformed file throws during module init and the **entire API fails to start**, not just the one route. | **NOT MITIGATED** |
| **T-26** | A-2 | **Tampering (of the off-chain event feed)** | **`request_access` emits its event with `patient` and `requester` inverted.** Any ARC-28 subscriber consuming these events gets systematically reversed data. | `contract.py:146`: `arc4.emit(AccessRequested(arc4.Address(Txn.sender), arc4.Address(patient), …))`, but `AccessRequested` is declared `patient, requester` (`contract.py:76-79`) and `Txn.sender` is the *requester* per the method's own docstring. | **High** (already true on every emitted event) | **Medium** — no on-chain state corruption; corrupts every downstream consumer | **MEDIUM** | None. Defect **C-1**. Not caught because `test_request_access_emits_event_and_counts` asserts only `total_requests == 1` and never inspects the payload. One-line fix: swap the arguments. `FR-024` **PARTIALLY IMPLEMENTED**. **Fixed in source** with a regression test that fails against the old code (`test_request_access_event_field_order`). **The deployed App `768743428` still runs the pre-fix bytecode** — the redeploy is deliberately deferred, because `OnUpdate.AppendApp` would mint a new App ID and discard the existing on-chain history. | **PARTIALLY MITIGATED** |
| **T-27** | A-6 | **Denial of Service (self-inflicted)** | **A backend sizing `fund_mbr` from `get_grant_box_mbr()` under-funds the app account**, so box creation eventually fails. | `GRANT_BOX_MBR = 2_500 + 400 * (32 + 17)` = 22,100 µALGO (`contract.py:52`), but the BoxMap's 1-byte `key_prefix="g"` makes the effective key 33 bytes, so the true cost is 22,500. **Verified on-chain:** app min-balance 145,000 with 2 boxes ⇒ 145,000 − 100,000 base = 45,000 = 2 × 22,500. | **Low** | **Low** — ~1.8% under-funding | **LOW** | None. Defect **C-2**. The wrong value is exposed as a public ABI method advertised as "a compile-time constant the backend can quote" (`contract.py:249-252`). Fix: `400 * (33 + 17)`. `FR-032` **IMPLEMENTED (incorrect value)**. **Fixed in source** (`GRANT_BOX_MBR` now accounts for the 1-byte key prefix; 22,500 microAlgo) with two regression tests. **The deployed contract still returns the old value** — redeploy deferred as for T-26. Size `fund_mbr` from the protocol formula, not the ABI method, until then. | **PARTIALLY MITIGATED** |
| **T-28** | A-7 | **Denial of Service (misconfiguration)** | **A `fly deploy` today produces a service pointed at a network where the contract does not exist, with no App ID configured.** | `api/fly.toml:10` hard-codes `NETWORK = "mainnet"` — **no MainNet deployment of `MedRailConsent` exists** — and sets no `CONSENT_APP_ID`. The fallback `readDeployedAppId()` (`api/src/config.ts:31-40`) reads `contracts/artifacts/deploy_<network>.json`, which `api/Dockerfile` **does not copy into the image**. So `consentAppId` is `0`, `requireConsentAppId()` throws, and `/v1/records/summary` and `/v1/consent/status` both 500. | **High** if deployed as committed | **High** | **HIGH** | The runbook tells the operator to set these as secrets, but the **committed default is a broken production config**. D-1, D-2. Related: `NETWORK` is an unchecked cast (`api/src/config.ts:42`), so a typo yields `undefined` server URLs instead of a boot failure (`SEC-050`). **FIXED:** `api/fly.toml` now sets `NETWORK = "testnet"` and `CONSENT_APP_ID = "768743428"`, adds a `/v1/health` check, and pins `max_machines_running = 1`. | **MITIGATED** |
| **T-29** | A-2, A-7 | **Repudiation** | **No application logging, so no attack is observable and no incident is reconstructable.** | The entire logging surface is `console.log` at startup (`api/src/index.ts:6`) and `console.error(err)` in the error handler (`api/src/app.ts:59`). No structured logs, levels, request ids, correlation ids, access log, settlement outcomes, metrics, tracing, or alerting. | **High** | **Medium** | **MEDIUM** | None. `OPS-002`, `OPS-003`, `OPS-004`, `OPS-005` all **NOT IMPLEMENTED**; `OPS-008` (RPO/RTO) never established. Concretely: **a T-01 exploit leaves no off-chain trace whatsoever**, and the only on-chain trace records the *victim's* address. **Partially:** structured JSON logging now exists for `audit_write_failed` and `facilitator_unavailable`, and every 500 carries a correlating `requestId`. There is still no metrics, tracing or alerting (G-15 remains open). | **PARTIALLY MITIGATED** |
| **T-30** | A-1, A-9 | **Information Disclosure** | **Live mnemonics transmitted into the Docker build context.** | **No `.dockerignore` exists anywhere in the repository** (verified by filesystem search). `api/Dockerfile` builds from the **repo root** (`api/Dockerfile:1-3`), so `api/.env` and `contracts/.env` — both holding live mnemonics — enter the build context on every build. | **Low** | **Critical** if realised | **MEDIUM** | **They are not `COPY`'d into any layer today** (`api/Dockerfile:7-20` copies only named paths), so no secret currently lands in a published image. The margin is **one careless `COPY api/ ./api/` wide**. `web/Dockerfile:5` does `COPY . .` with no ignore file (D-5). `SEC-015` **NOT IMPLEMENTED**. Fix: a 6-line `.dockerignore`. **FIXED:** `.dockerignore` at the repo root and in `web/` excludes `.env*`, `node_modules`, `.venv` and `.git` from the build context. | **MITIGATED** |
| **T-31** | all | **Tampering (process)** | **CI never runs, so no automated control is enforced on change.** | `.github/workflows/ci.yml:3-6` triggers on `push: branches: [main]`; the repository's **only branch is `master`**. No push has ever triggered it and none will. Only `pull_request` events would fire, and there are no PRs. | **High** — already true | **Medium** | **MEDIUM** | `OPS-006` **PARTIALLY IMPLEMENTED**, CI-1. **The code is not failing** — the reviewer ran every job locally and all passed (18 API tests, 14 contract tests, both typechecks, both builds). The defect is that nothing enforces it. **This must be fixed first**, because it is the prerequisite for every scanning control recommended against T-17…T-20. Secondary: CI-2 — `x402-flow.spec.ts` makes a live call to the facilitator at module import, so CI depends on a third party being reachable. **FIXED:** the workflow now triggers on `branches: [main, master]` plus `workflow_dispatch`, and adds dependency caching, `npm audit --audit-level=high`, and an artifact-freshness gate. | **MITIGATED** |
| **T-32** | A-8 | **Information Disclosure** | **Free consent oracle enables relationship enumeration.** `/v1/consent/status` and the four `readonly` ABI methods answer "does patient X consent to requester Y for scope Z" for anyone, free, unlimited. | Unauthenticated GET, or a direct `simulate` against App `768743428` bypassing MedRail entirely. | **High** | **Low** as-built, **Medium** in production | **LOW** | **Deliberate and correct** — consent status is the patient's own state and gating it behind payment would be perverse (`api/src/routes/consent.ts:14-18`). The same information is on the public ledger anyway (T-21), so MedRail is a convenience, not the leak. The residual issue is that it is free **and** unmetered, which is T-12. | **ACCEPTED** (by design) |
| **T-33** | A-3 | **Tampering / Spoofing** | **A hostile or compromised AlgoNode lies about a `check_access` simulate result**, granting or denying access incorrectly. | MedRail's consent decisions rest entirely on a `simulate` response from one anonymous public endpoint, over TLS, with **no API key, no timeout, no retry, and no cross-checking against a second node** (`api/src/services/algorand.ts:5, 98`). | **Low** | **High** — silently inverts the entire authorisation decision | **MEDIUM** | TLS only. `REL-003` **NOT IMPLEMENTED**. RECOMMENDED for production: query a second independent node and require agreement on any *allow* decision, or run a private node. | **NOT MITIGATED** |
| **T-34** | A-7, A-8 | **Denial of Service / Information Disclosure** | **Event-feed spam and unsolicited association via `request_access`.** Anyone can emit an `AccessRequested` event naming any patient address, at only a transaction fee, forever, on a public ledger. | Call M-4 repeatedly with arbitrary patient addresses. It persists no state (`contract.py:141-146`) and costs the app account nothing, but it inflates `total_requests` and floods any ARC-28 subscriber — with fields inverted (T-26). | **Medium** | **Low** | **LOW** | None; open by design so a stranger's agent can signal interest without opting in. Note the second-order privacy effect: an attacker can permanently and publicly associate an arbitrary address with a request for a named `scope` (e.g. a stigmatised specialty), which the named party can neither prevent nor erase. | **NOT MITIGATED** |
| **T-35** | A-3, A-5 | **Denial of Service** | **Patient key loss is irrecoverable and permanently freezes their consent state.** | `grant_access` and `revoke_access` key off `Txn.sender` (`contract.py:151,181`). Lose the key and an **active grant can never be revoked** — the requester's access is permanent. | **Medium** — the demo wallet is deliberately ephemeral (`sessionStorage`, cleared on tab close) | **Medium** | **MEDIUM** | None, and none is possible without weakening A-5. There is no recovery method, no social recovery, no admin override, and no time-boxed default. **The one available mitigation is already in the contract and is not used by default:** `duration_seconds` (`FR-019` **VALIDATED**) — a grant with a finite expiry self-heals; `duration_seconds == 0` never expires. RECOMMENDED: default the UI to a bounded duration rather than perpetual. | **NOT MITIGATED** |

### 5.0 Note on T-10: the audit log's integrity is stronger than it first appears

This deserves stating explicitly, because the read-then-write shape of `logAccess` invites a wrong conclusion, and getting it wrong would overstate the risk.

**The contract self-assigns the sequence number. No caller-supplied sequence is trusted anywhere.** `log_access` reads its own `audit_seq` box, computes `next_seq` itself, and writes both boxes:

```python
# contracts/smart_contracts/consent/contract.py:224-234
seq, existed = self.audit_seq.maybe(patient)
next_seq = UInt64(1) if not existed else seq + 1
self.audit_seq[patient] = next_seq
self.audit_log[audit_key(patient, next_seq)] = AuditEntry(...)
```

The `predictedSeq` computed in the backend (`api/src/services/algorand.ts:158-159`) is **not** passed as an ABI argument — the method takes `(patient, requester, scope, endpoint, action)` and nothing else. It exists solely to populate the AVM **box-reference array** (`api/src/services/algorand.ts:169-172`), because Algorand requires every box a transaction touches to be declared in advance.

The consequence for classification is decisive. If two calls race, the loser's declared box reference (`a ‖ patient ‖ itob(N)`) does not match the box the contract actually writes (`a ‖ patient ‖ itob(N+1)`), so **the AVM rejects the transaction outright**. The audit log cannot be misordered, overwritten, gapped, or corrupted by this race. It fails atomically and closed.

T-10 is therefore an **availability** threat, not an integrity one, and its impact is correspondingly **Low** — the real cost is the failure it chains into (**T-11**: a rejected write on the unguarded success path of `records.ts:49` surfaces as HTTP 500 after the payment has settled).

**The genuine integrity threats against the audit log are two, and neither is the race:**

1. **T-03** — admin key compromise permitting arbitrary forged entries. The on-chain gate stops non-admins, not a compromised admin.
2. **T-02 / S-1** — a caller-asserted `requesterAddress` written as a permanent false attribution. This is the one that matters, and it is the one to fix.

Stated plainly: the contract's audit-integrity design is **sound**. `DATA-002` (append-only) is enforced by the absence of a write path, and sequence assignment is enforced by the AVM. What is broken is not the ledger mechanism but the identity fed into it.

### 5.1 Register summary

**By derived risk** (35 rows, each derived from §1.2 — not assigned):

| Risk level | Count | IDs |
|---|---|---|
| **CRITICAL** | 2 | T-01, T-02 |
| **HIGH** | 5 | T-03, T-07, T-13, T-14, T-28 |
| **MEDIUM** | 19 | T-04, T-05, T-06, T-08, T-11, T-12, T-17, T-18, T-20, T-21, T-23, T-24, T-25, T-26, T-29, T-30, T-31, T-33, T-35 |
| **LOW** | 8 | T-10, T-15, T-16, T-19, T-22, T-27, T-32, T-34 |
| **UNVERIFIABLE** | 1 | T-09 |
| **Total** | **35** | |

**By mitigation status:**

| Status | Count | IDs |
|---|---|---|
| **NOT MITIGATED** | **29** | T-01, T-02, T-03, T-04, T-05, T-07, T-08, T-11, T-12, T-13, T-14, T-15, T-16, T-17, T-18, T-19, T-20, T-21, T-23, T-25, T-26, T-27, T-28, T-29, T-30, T-31, T-33, T-34, T-35 |
| **PARTIALLY MITIGATED** | 2 | T-10, T-24 |
| **ACCEPTED** (deliberate, documented residual) | 3 | T-06, T-22, T-32 |
| **UNVERIFIABLE** from this repository | 1 | T-09 |
| **Total** | **35** | |

**There are zero fully MITIGATED threats in this register.** That is not because the system has no controls — `Security_Architecture.md` §17 lists seven that are real and verified — but because a threat register enumerates what remains *after* those controls. The controls that work (on-chain admin gating, patient key custody, PHI-never-on-chain, git secret hygiene) are why the register contains no threat of "an arbitrary caller writes an audit entry" or "the backend leaks a patient key": those threats were designed out and therefore never appear.

The two CRITICAL rows — T-01 and T-02 — are both NOT MITIGATED and are both closed by the same ~15-line change. Of the 29 NOT MITIGATED, **11 are closed by the seven fixes in §8.2**, most of which are one-line or one-file changes.

---

## 6. AI and agent-specific threats

### 6.1 What is NOT APPLICABLE, and why that is a security property

**There is no language model, no ML model, no embedding, no vector store, no retrieval pipeline, and no agent framework anywhere in MedRail.** The two "AI endpoints" are deterministic rule engines:

- `scoreTriage` — lowercases the input, substring-matches 11 hard-coded red-flag entries, sums their weights, caps at 100, and maps to a band (`api/src/services/triageScorer.ts`).
- `checkInteractions` — looks up a 14-pair static table (`api/src/services/interactionChecker.ts`).

Both are pure functions. Same input, same output, every time, with the entire decision rule readable in one screen of source (`NFR-009`, `AI-001`, both **VALIDATED**).

Therefore:

| Threat class | Status | Why |
|---|---|---|
| **Prompt injection** (direct and indirect) | **NOT APPLICABLE** | There is no prompt. Caller text is passed to `String.prototype.includes`, not to an interpreter of instructions. There is no instruction/data channel to confuse. |
| **Jailbreak / guardrail bypass** | **NOT APPLICABLE** | There is no guardrail to bypass, because there is no generative behaviour to constrain. The output space is a bounded set of scores, bands, and table rows. |
| **Training-data poisoning** | **NOT APPLICABLE** | Nothing is trained. There is no dataset, no fine-tune, no weights, no gradient. |
| **Model hallucination / fabricated output** | **NOT APPLICABLE** | The function cannot emit a drug interaction that is not in `interactions.json`, or a red flag that is not one of the 11 rules. Output is enumerable from source. |
| **Model inversion / membership inference / weight extraction** | **NOT APPLICABLE** | No model, no weights, no training set. |
| **Adversarial-example attacks** | **NOT APPLICABLE** | No decision boundary learned from data. There is a *matching* weakness (T-24), but it is a specification bug in a readable rule, not an adversarial perturbation of a learned function. |

**This is not an omission from the threat model — it is a class of threat the architecture removed by not introducing a model.** That deserves to be stated as a design property, because it is one:

1. **The decision rule is auditable by reading it.** A reviewer, a clinician, or a regulator can verify exactly why a given input produced a given band. No interpretability tooling, no explanation layer, no post-hoc rationalisation.
2. **The output is bounded and enumerable.** The system cannot invent a medication, a diagnosis, or a confident claim that no one wrote down.
3. **Failures are reproducible.** A wrong answer is a bug at a specific line, fixable and testable, not a distribution shift.
4. **In a clinical-adjacent context, this is the safer choice.** A hackathon "AI triage" endpoint that reads as authoritative medical advice is a genuine harm vector. Choosing a transparent heuristic that *cannot* impersonate clinical authority — and asserting the non-diagnostic disclaimer in the test suite as a correctness property (`FR-009`, `AI-002`, **VALIDATED**) — is a defensible safety decision, not a scope cut dressed up as one.

**The honest counterweight:** determinism is not accuracy. `AI-005` is **NOT IMPLEMENTED** — there is no labelled dataset, no evaluation harness, and no sensitivity or specificity measurement, and **none is claimed anywhere**. An 11-rule keyword scorer and a 14-pair table are demonstrably incomplete. The system's safety story rests on *not being believed too much*, which is why the disclaimers are load-bearing rather than decorative.

### 6.2 What IS applicable to an agentic caller

MedRail is designed to be called by autonomous agents — that is the x402 thesis. The agent lives outside MedRail, but MedRail's design determines what the agent can get wrong.

| ID | Threat | Analysis | Status |
|---|---|---|---|
| **T-A1** | **Excessive agency — unbounded autonomous spend.** An agent calling MedRail in a loop spends real stablecoin per call with **no budget cap enforced by MedRail**. | MedRail advertises the exact price in the 402 challenge before any commitment (`api/src/x402.ts:16-32`; live capture shows `amount: "20000"`), which is the right primitive — the caller *can* enforce a budget because it knows the price in advance. But MedRail imposes no per-caller cap, no spend rate limit, and **no per-caller identity at all** (§2.2 of `Security_Architecture.md`), so it cannot. A looping or buggy agent will drain its own wallet as fast as the network allows, and MedRail will happily serve every call. Compounded by T-11: a call that 500s **after** settling still costs the agent money and produces no result — precisely the condition that triggers naive retry logic, turning one bug into a spend loop. | `SEC-054` **PARTIALLY IMPLEMENTED** — price disclosure yes, enforcement no |
| **T-A2** | **Untrusted output consumption — an agent treats a keyword-heuristic band as clinical truth.** | The `band` field returns the strings `emergency` / `urgent` / `soon` / `routine`. Those words carry clinical weight in a way a numeric score does not. An LLM-driven agent parsing this response has no structural reason to weight the `disclaimer` string above the `band` string — both are JSON fields, and the disclaimer is prose an agent may summarise away. **The safety property lives in a field that machines are least likely to honour.** T-24 makes this concrete: a false negative from a 14-pair table returns `flagged: false`, which reads to an automated consumer as an affirmative all-clear rather than as "not in our small table". | `AI-003` **IMPLEMENTED** (band names + disclaimer); enforcement against machine consumers: **NOT IMPLEMENTED** |
| **T-A3** | **Reference-table poisoning.** If `interactions.json` becomes writable, every downstream agent silently consumes corrupted clinical data with an authoritative-looking provenance string attached. | Full analysis at **T-25**. Worth restating in the agent context because the blast radius is different: a human reading a suspicious interaction might question it; an agent acting on it will not. The `source` field (`api/src/data/interactions.json:2`) makes the output *look* provenanced without being *verified* — the citation names a reference **class** ("Lexicomp/Micromedex-class severity classifications"), not a licensed dataset, and `DATA-005` is satisfied by the string being present, not by its content being checked. | `SEC-053` **NOT IMPLEMENTED** |
| **T-A4** | **Agent-supplied identity is trusted.** An agent that constructs `requesterAddress` from its own configuration — or from a value another agent handed it — is trusted absolutely by MedRail. | This is T-01 viewed from the caller's side. In a multi-agent pipeline the field would flow from wherever the orchestrator got it, and MedRail's acceptance of it means **any upstream compromise in an agent chain becomes a MedRail authorisation bypass**. The fix (bind to the payer) closes this at the boundary, which is the only place it can be closed. | **NOT MITIGATED** |

**RECOMMENDED for agent callers, since MedRail cannot enforce it:** publish a machine-readable spend contract alongside the 402 (price, expected latency, and an explicit "this endpoint charges on denial" flag — the `charged: false` semantics at `api/src/routes/records.ts:43` are currently discoverable only by paying once and reading `docs/API.md`).

---

## 7. Residual risk

Risks that remain after every currently-implemented control, ordered by what a hostile reviewer would raise first.

1. **The flagship endpoint has no access control (T-01/T-02).** Not degraded, not partial — the consent gate authorises against a string the attacker chose. Every other control in the system is downstream of this one being wrong. **Unmitigated.**
2. **The audit log is a log of claims, not of facts (T-02), and it has never run on real infrastructure (E-1).** `total_audit_entries == 5` on App `768743428`; zero `s`- or `a`-prefixed boxes exist. `log_access` has **never been executed on Algorand TestNet**. The mechanism the project presents as its differentiator is validated only by AVM-simulator unit tests, and `/v1/records/summary` has never completed its success path end-to-end against the live contract.
3. **One hot key holds three separable powers, with no detection (T-03/T-04/T-05).** Audit forgery is silent and retroactive; admin rotation is irreversible; the drain method is unbounded in-contract and its success path has never been tested.
4. **The facilitator is a single point of both trust and availability (T-06/T-07).** Trusting it is correct protocol design and is documented as such. Having no fallback when it is unreachable is not — it converts a third-party outage into a 100% revenue outage with an opaque 500.
5. **The system is unobservable (T-29).** No logs, no metrics, no traces, no alerts. Every threat above would occur without leaving evidence, and the only durable record is the on-chain one — which, per (2), records the wrong party.
6. **No control is enforced on change (T-31).** CI has never fired. Every recommended scanning, linting, and testing control is inert until the trigger is fixed.
7. **Two modules carry most of the risk in this document and have zero tests.** There is **no test of `api/src/routes/records.ts`** (T-01, T-02, T-11 all live there) and **no test of `api/src/services/algorand.ts`** (T-10, T-23, T-33 all live there). No frontend test of any kind exists. No integration test runs the API against the deployed contract.
8. **Public-ledger privacy is irreducible (T-21).** No mitigation exists for data already written. Every consent relationship ever created on App `768743428` is public and permanent. See `Privacy.md`.
9. **Replay resistance is unknown (T-09).** MedRail implements none and cannot, being stateless. Whatever exists is inherited from the facilitator and could not be confirmed from this repository.

---

## 8. Risk acceptance

### 8.1 Knowingly accepted for a hackathon build

These are defensible decisions given the context, and each is documented somewhere in the repository rather than hidden:

| Accepted | Justification | Documented at |
|---|---|---|
| Facilitator is authoritative for settlement (T-06) | This is the x402 protocol's design, not a shortcut. Offloading verify+settle is why a resource server can be small. | `docs/SECURITY.md:84-87` |
| Demo wallet mnemonic in `sessionStorage` (T-22) | Blast radius deliberately made worthless: browser-generated, TestNet-only, dispenser-funded, cleared on tab close. The alternative kills the sixty-second demo. | `docs/SECURITY.md:35-38`; `web/lib/demoWallet.ts:10-12`; the UI |
| Free, unmetered consent oracle (T-32) | Consent status is the patient's own state; the same data is on the public ledger regardless. | `api/src/routes/consent.ts:14-18` |
| Charging for a *denied* consent check | Settlement is cancelled on any status >= 400, so a denial costs the caller nothing. Stated in the response body as `charged: false`. | `docs/SECURITY.md:62-67`; `api/src/routes/records.ts:43` |
| In-process-only audit lock (T-10) | A distributed lock is disproportionate for a hackathon audit log, and the failure mode is a **rejected transaction, not a corrupted log** (§5.0) — the contract self-assigns the sequence. Acceptable **provided one instance runs**; `api/fly.toml:17-19` does not guarantee that. | `docs/SECURITY.md:49-60`; `contract.py:224-226` |
| No encryption pipeline (`DATA-006` **PLANNED**) | There is no real data to encrypt. Building envelope encryption to protect `bloodType: "O+"` would be theatre. | `docs/SECURITY.md:7-25` |
| No performance/load testing | No capacity target was ever agreed, so none is claimed. `PERF-002`, `PERF-003` **NOT IMPLEMENTED**. | `REQUIREMENTS_REGISTRY` PERF section |

### 8.2 Must be fixed before submission

| # | Fix | Threat closed | Effort |
|---|---|---|---|
| 1 | **Bind the payer to `requesterAddress`.** | **T-01, T-02, T-A4** | ~10–15 lines + 1 test |
| 2 | Change the CI trigger from `main` to `master`. | T-31 (and unblocks everything else) | 1 word |
| 3 | Add a repo-root `.dockerignore`. | T-30 | ~6 lines |
| 4 | Guard the allowed-path `logAccess` so a settled payment is never lost to a 500. | T-11 | ~10 lines |
| 5 | `.refine(algosdk.isValidAddress)` on all four address fields; generic 500 body. | T-15, T-16 | ~10 lines |
| 6 | Swap the two arguments in the `request_access` emit. | T-26 | 1 line |
| 7 | Move `docs/SENTINEL_ARCHITECTURE.md` to `docs/future/` with a **PROPOSAL — NOT IMPLEMENTED** banner, or delete it. | Credibility (DOC-1) — not a security threat, but the largest single risk to how this threat model is received | 1 move |

### 8.3 Must be fixed before MainNet, before real money, or before one byte of real PHI

Nothing below is optional if this system ever holds real data. These are not "nice to have".

| # | Requirement | Threat |
|---|---|---|
| 1 | Multisig or HSM-backed admin; split the audit-writer role from the contract-owner role. | T-03, T-04, T-05 |
| 2 | Bound `withdraw_excess` in-contract or remove it; test the success path. | T-05 |
| 3 | Rate limiting on all free routes; a dedicated AlgoNode API key or a private node. | T-12, T-13, T-33 |
| 4 | Structured logging, request ids, metrics, and alerting on operator balance, app-account MBR headroom, and settlement failure rate. | T-29, T-14 |
| 5 | Dependency scanning (`npm audit`, `pip-audit`, Dependabot) in a CI that actually runs; remove the unused `@x402/extensions`; `npm ci` in both Dockerfiles; verifiable contract builds. | T-17, T-18, T-19, T-20 |
| 6 | Independent re-verification of the settled transaction against algod before serving or logging (`SEC-057`). | T-06 |
| 7 | Graceful facilitator degradation: cached `/supported`, timeout, circuit breaker, `503` + `Retry-After` instead of `500`. | T-07 |
| 8 | Golden-vector cross-implementation test for box-key derivation. | T-23 |
| 9 | Token-boundary or RxNorm-based medication matching; an evaluation harness with measured sensitivity and specificity before any clinical claim is made. | T-24, `AI-005` |
| 10 | Integrity verification of `interactions.json`; read-only filesystem for the container. | T-25, T-A3 |
| 11 | Fix `api/fly.toml` (`NETWORK`, `CONSENT_APP_ID`); validate `NETWORK` at boot; pin to a single machine (sequencing is **already** on-chain — the residual issue is a rejected write, not a corrupt one; §5.0). | T-28, T-10 |
| 12 | Establish replay semantics with the facilitator operator and document them, or implement server-side settlement-id tracking. | T-09 |
| 13 | The entire `Privacy.md` §5 architecture — envelope encryption, off-chain content-addressed storage, pseudonymous rotating identifiers, scope minimisation. | T-21, and A-11 in full |

---

## 9. Sources

- Repository at commit `32ffd73`, branch `master`; all `path:line` citations verified by direct read.
- App ID **768743428** on Algorand **TestNet**; app account `CCO26Y6Z56DDZ3OELO2UKJMIPJVSIT52I23F2MPMR52JBM3HQZZNUZNOR4`; 2 boxes, 100 box bytes, min-balance 145,000 µALGO; global state `total_requests=2, total_grants_active=0, total_revocations=2, total_audit_entries=0`. Read from `https://testnet-idx.algonode.cloud`, 2026-08-21.
- Settled x402 payment `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ` — one payment exists, and it is a self-payment (sender == receiver == deployer), disclosed in `docs/PROOF.md` §6.
- Reproduced by the reviewer: R-1 (facilitator down → 500, free routes still 200), R-3 (58-char invalid address → 500 with `wrong checksum for address`), and the live 402 challenge on `/v1/triage`.
- SDK surface verified in `api/node_modules/@x402/{core,avm,hono}` at `2.21.0`: `decodePaymentSignatureHeader` (`core/dist/cjs/http/index.d.ts:20`), `getSenderFromTransaction` (`avm/dist/cjs/index.d.ts:186`), `ProtectedRequestHook` (exported from `@x402/core/server`; usage at `hono/dist/cjs/index.d.ts:117`), payment note construction (`avm/dist/cjs/index.js:266`).
- `docs/SECURITY.md` — prior art. Every claim in it was independently re-verified in this review and every claim held.

**No compliance claim is made or implied by this document.** MedRail is not HIPAA-compliant, GDPR-compliant, SOC 2 audited, or ISO 27001 certified, and no work toward any of those has been performed. No penetration test and no automated scan has been run. See `Privacy.md` for what handling real PHI would require.
