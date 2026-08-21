# MedRail — API Error Catalogue

**Purpose:** Every error the MedRail API can actually produce, with its trigger, its exact response
shape, its settlement consequence, and the code path that emits it.

**Status of this document:** Complete. Every entry was either reproduced against a running instance
during the 2026-08-21 review or read directly from source. Nothing here is inferred from the
handler signatures.

> **Read this first.** Settlement in x402 v2 happens **only** when the route handler returns a
> status below 400. `@x402/hono` (`node_modules/@x402/hono/dist/esm/index.mjs:203-232`) awaits the
> handler, then dispatches `cancellationDispatcher.cancel(...)` on any throw or any 4xx/5xx and
> returns **before** `processSettlement` is reached. **Every error in this catalogue therefore
> leaves the caller uncharged** — not by a refund path, but because the charge structurally never
> happens. The only way to be billed by MedRail is to receive a response below 400.

---

## 1. Error index

| Code | Status | Route(s) | Attributable to | Retryable | Settlement |
|---|---|---|---|---|---|
| [E-402](#e-402) | 402 | 3 priced | client (no payment) | yes, with payment | not attempted |
| [E-400-ZOD](#e-400-zod) | 400 | all POST + consent status | client | no (fix the request) | **cancelled** |
| [E-400-ADDRESS](#e-400-address) | 400 | consent status, records | client | no (fix the address) | **cancelled** |
| [E-403-PAYER](#e-403-payer) | 403 | `/v1/records/summary` | client (wrong signer) | yes, paying with the right key | **cancelled** |
| [E-403-CONSENT](#e-403-consent) | 403 | `/v1/records/summary` | client (no grant) | after a grant exists | **cancelled** |
| [E-429-RATELIMIT](#e-429-ratelimit) | 429 | consent status, arc56, records | client (too fast) | yes, after `Retry-After` | **cancelled** |
| [E-503-FACILITATOR](#e-503-facilitator) | 503 | 3 priced | **server / upstream** | yes, after `Retry-After` | not attempted |
| [E-500-NOAPPID](#e-500-noappid) | 500 | consent status, records | **server (config)** | no | **cancelled** |
| [E-500-NOOPERATOR](#e-500-nooperator) | 500 | consent status, records | **server (config)** | no | **cancelled** |
| [E-500-INTERNAL](#e-500-internal) | 500 | any | **server** | maybe — quote the `requestId` | **cancelled** |
| [E-404-ARC56](#e-404-arc56) | 404 | `/v1/consent/arc56` | server (build) | no | n/a (free) |
| [W-200-AUDIT-PENDING](#w-200-audit-pending) | **200** | `/v1/records/summary` | server / chain | n/a — the call succeeded | **settled** |

The last row is not an error. It is listed here because it is the *degraded success* an integrator
must know about: the record is returned and the payment settles, but the on-chain audit entry did
not get written.

---

## 2. Entries

### E-402 — Payment required {#e-402}

**Status** `402` · **Routes** `POST /v1/triage`, `POST /v1/interaction-check`,
`POST /v1/records/summary` · **Path** `api/src/app.ts:50-62` → `@x402/hono` middleware

Emitted for any request to a priced route without a valid `PAYMENT-SIGNATURE` header. This is the
protocol's normal control flow, not a fault.

The response **body is an empty object**; the payload travels in the base64 `PAYMENT-REQUIRED`
header. Reproduced:

```json
{"x402Version":2,"error":"Payment required",
 "resource":{"url":"http://localhost/v1/triage",
             "description":"Rule-based clinical red-flag triage score. Not medical advice.",
             "mimeType":"application/json"},
 "accepts":[{"scheme":"exact",
             "network":"algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=",
             "amount":"20000","asset":"10458941",
             "payTo":"2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE",
             "maxTimeoutSeconds":300,
             "extra":{"feePayer":"ZMFK2OI7ZBD2U27ISERZC4S6LKM6WMFJPZQ4MYNJDZ2VNBNMBA67RA22AA"}}]}
```

`amount` is `20000` for the two open endpoints and `50000` for `/v1/records/summary` — µUSDC at 6
decimals. Response headers also carry `cache-control: no-store` and
`access-control-expose-headers: PAYMENT-REQUIRED,PAYMENT-RESPONSE`.

**Integrator note.** `asset` and `extra.feePayer` are supplied by the facilitator, not by MedRail
config — which is why [E-503-FACILITATOR](#e-503-facilitator) exists.

---

### E-400-ZOD — Request schema validation failure {#e-400-zod}

**Status** `400` · **Paths** `routes/triage.ts:13-15`, `routes/interaction.ts:13-15`,
`routes/records.ts:29-31`, `routes/consent.ts:26-28`

Body shape is zod's `.flatten()` output:

```json
{"error":"invalid query — expected ?patient=&requester=&scope=",
 "details":{"formErrors":[],
            "fieldErrors":{"patient":["must be a 58-character Algorand address"]}}}
```

Per-route messages: `"invalid request"` (triage, records), `"invalid request — provide at least 2
medications"` (interaction-check), and the query-specific message above.

**Ordering matters, and it is deliberate.** The payment middleware runs *before* the handler, so an
**unpaid** malformed request returns **402, not 400** — the caller never learns their body was
invalid until they pay. `api/test/x402-flow.spec.ts` documents this ordering explicitly rather than
assuming it. A **paid** malformed request returns 400, and settlement is **cancelled**, so the
caller is not charged for the mistake.

---

### E-400-ADDRESS — Malformed Algorand address {#e-400-address}

**Status** `400` · **Routes** `/v1/consent/status`, `/v1/records/summary` · **Path**
`api/src/validation.ts` → the zod schemas in `records.ts:7-10` and `consent.ts:7-11`

```
GET /v1/consent/status?patient=AAAA…(58 chars)&requester=<valid>&scope=x
→ 400 {"error":"invalid query — expected ?patient=&requester=&scope=",
       "details":{"formErrors":[],
                  "fieldErrors":{"patient":["not a valid Algorand address (checksum failed)"]}}}
```

`algorandAddress` checks the length **and** `algosdk.isValidAddress`, so a 58-character
non-address is rejected as a client error before it reaches any chain code:

```ts
export const algorandAddress = z
  .string()
  .length(58, "must be a 58-character Algorand address")
  .refine((v) => algosdk.isValidAddress(v), {
    message: "not a valid Algorand address (checksum failed)",
  });
```

**This used to be a 500.** zod validated length only, `algosdk.decodeAddress` threw deep inside
`grantBoxName`, and the global error handler echoed `err.message` — reporting a client input error
as a server error *and* disclosing internal exception text to an unauthenticated caller. Both
halves are fixed: G-10 is closed, SEC-010 and SEC-011 are **IMPLEMENTED**. See
[E-500-INTERNAL](#e-500-internal) for the generic-body half.

---

### E-403-PAYER — Asserted requester is not the payment signer {#e-403-payer}

**Status** `403` · **Route** `POST /v1/records/summary` · **Path** `routes/records.ts:41-51`

```json
{"error":"requesterAddress must match the address that signed the payment",
 "requesterAddress":"…the address the body asserted…",
 "payer":"…the address that actually signed, or null…"}
```

`payerFromRequest` (`api/src/x402Payer.ts`) decodes the verified `PAYMENT-SIGNATURE` header, reads
the AVM `exact` payload (`{paymentGroup, paymentIndex}`), and recovers the sender of
`paymentGroup[paymentIndex]` — the one leg of the atomic group the caller signed, as opposed to the
facilitator's fee-payer legs. If that address does not equal the body's `requesterAddress`, the
request is refused **before any chain call is made**.

`payer` is `null` when the header is absent or unparseable, which the handler treats as
unauthenticated rather than trusted. **Discriminate the two 403s on the presence of `payer`.**

**Why this exists.** The x402 middleware proves *a* payment settled; it does not tell the handler
whose it was. Without this check, `requesterAddress` was a caller's unverified claim — and because
`grant_access` transactions publish every valid `(patient, requester, scope)` triple to any indexer,
anyone could read a real grant off the chain, pay the ordinary $0.05, and impersonate the authorised
party. This check is what makes the consent gate an authorisation decision rather than a paywall:
**the payment is the credential**, and it cannot be forged without the private key.

Verified live against TestNet by `api/scripts/verify-g01-fix.ts`, which pays with one key while
asserting another address and confirms the 403 — plus a control call proving the legitimate path
still returns 200. Six unit tests in `api/test/x402Payer.spec.ts`. G-01 is closed.

**Retry:** re-send, signing the payment with the key for the address you are asserting.

---

### E-403-CONSENT — No valid consent grant {#e-403-consent}

**Status** `403` · **Route** `POST /v1/records/summary` · **Path** `routes/records.ts:54-71`

Reached only once the payer *is* the asserted requester (see [E-403-PAYER](#e-403-payer)).

```json
{"error":"no valid consent grant from this patient for this requester and scope",
 "patientId":"…","requesterAddress":"…",
 "charged":false,
 "hint":"GET /v1/consent/status?patient=&requester=&scope=records:summary is free"}
```

**`charged: false` is a statement of fact, not a courtesy.** A 403 is ≥ 400, so `@x402/hono` cancels
the payment instead of settling it. The caller pays nothing for a denial. The `hint` points at the
free pre-flight check that avoids the round trip entirely.

**The residual cost is MedRail's, and it is bounded.** `records.ts:58` submits a real
`logAccess(..., "consent_denied")` transaction whose fee the **operator account** pays — deliberately,
so a denied attempt still appears on the patient's own audit trail. Because the caller is not
charged, an unbounded stream of denials would drain the operator account, and an empty operator
account stops `log_access` working for everyone. That is why this route carries a **30 requests per
minute per client IP** limit (`app.ts:45`) — see [E-429-RATELIMIT](#e-429-ratelimit). G-03 and G-09
are closed.

The denial audit write is still wrapped in `.catch(() => undefined)`, so if it fails nothing records
that it did. That is a deliberate trade — a chain failure must not convert a correct 403 into a 500 —
but it means denial counts on chain are a lower bound, not a total.

---

### E-429-RATELIMIT — Too many requests {#e-429-ratelimit}

**Status** `429` · **Routes** `GET /v1/consent/status`, `GET /v1/consent/arc56`,
`POST /v1/records/summary` · **Path** `api/src/rateLimit.ts:60-78`, wired at `app.ts:43-45`

```json
{"error":{"code":"RATE_LIMITED","message":"Too many requests. Retry in 37s.","retryable":true}}
```

Headers: `Retry-After` (seconds remaining in the window), `X-RateLimit-Limit`,
`X-RateLimit-Remaining: 0`. The first two headers also appear on *allowed* responses, so a
well-behaved client can back off before being refused.

| Route | Limit | Window | Why this route |
|---|---|---|---|
| `GET /v1/consent/status` | 60 | 60 s | Free and unauthenticated, and each call makes two sequential algod requests — it amplifies traffic at public AlgoNode infrastructure at zero cost to the caller |
| `GET /v1/consent/arc56` | 30 | 60 s | Free; reads and parses a file from disk on every request |
| `POST /v1/records/summary` | 30 | 60 s | A denial is free to the caller but costs MedRail a chain fee (see [E-403-CONSENT](#e-403-consent)) |

**The three priced happy paths are deliberately not throttled.** Settling USDC per call is a stronger
and better-calibrated limit than any counter.

**Honest limitations.** The store is a fixed-window in-memory `Map`, so limits are per-process rather
than global — behind more than one instance this is a weakening, not a failure, and the same
in-process constraint already pins the audit-write lock to one machine (`api/fly.toml` sets
`max_machines_running = 1`). The client key is the first `X-Forwarded-For` hop, falling back to
`CF-Connecting-IP`, `X-Real-IP`, then the literal `"unknown"` — spoofable by a direct caller. This is
a courtesy guard against accidental hammering and casual abuse, **not a security boundary**. SEC-013
is **IMPLEMENTED**; anything stronger needs the platform's real client IP and a shared store.

---

### E-503-FACILITATOR — Facilitator unreachable {#e-503-facilitator}

**Status** `503` · **Routes** all three priced · **Path** `api/src/app.ts:78-104` · **Reproduced**
with `FACILITATOR_URL` set to a closed port

```json
{"error":{"code":"PAYMENT_FACILITATOR_UNAVAILABLE",
          "message":"The payment facilitator is temporarily unreachable, so a payment challenge cannot be issued. Retry shortly.",
          "retryable":true,
          "facilitator":"https://facilitator.goplausible.xyz"}}
```

Header: `Retry-After: 30`. Logged server-side as a structured `facilitator_unavailable` event
carrying the facilitator URL, the request path, and the underlying message.

**No `PAYMENT-REQUIRED` header is emitted**, and that is unavoidable: the 402 cannot be constructed
offline, because `accepts[].asset` and `extra.feePayer` come from the facilitator's own `/supported`,
not from MedRail config. The guard matches exactly two initialisation-failure messages
(`/no supported payment kinds/i`, `/Failed to initialize/i`) and re-throws everything else, so it
cannot mask an unrelated fault as an upstream outage.

**Blast radius is bounded and was verified:** `/v1/health`, `/`, and `/v1/consent/app-info` all
still returned `200` with the facilitator down. Only the priced routes fail.

**This used to be an opaque 500** with `err.message` as the body and no `Retry-After`, which told a
calling agent "this is broken" when the truth was "try again shortly". G-04 is closed.

**What is not fixed:** there is still no timeout, retry, circuit breaker, or cached-`/supported`
fallback. The facilitator remains a hard runtime dependency of every priced route. REL-001 is
**PARTIALLY IMPLEMENTED** — graceful degradation yes, resilience no.

---

### E-500-NOAPPID — Consent App ID not configured {#e-500-noappid}

**Status** `500` · **Path** `api/src/config.ts` `requireConsentAppId()`

Reaches the caller through [E-500-INTERNAL](#e-500-internal), so the response body is the generic
envelope; the specific message below appears only in the server-side log:

```
CONSENT_APP_ID is not set and contracts/artifacts/deploy_testnet.json was not found.
Deploy the contract first (see docs/DEPLOYMENT.md).
```

The Dockerfile does not copy the deploy artifact, and the fallback could not help in a container
anyway: with `WORKDIR /app/api` the resolved path is `/app/contracts/artifacts/deploy_<network>.json`,
which is not in the image. **`CONSENT_APP_ID` must therefore be set explicitly** — and it now is:
`api/fly.toml` sets `CONSENT_APP_ID = "768743428"` alongside `NETWORK = "testnet"`. G-07 and G-13 are
closed; the fallback path itself is unchanged and still cannot fire inside a container.

---

### E-500-NOOPERATOR — Operator mnemonic not configured {#e-500-nooperator}

**Status** `500` · **Path** `api/src/services/algorand.ts` `getOperator()`

Reaches the caller as the generic envelope; the log line reads
`OPERATOR_MNEMONIC is not set — see docs/DEPLOYMENT.md`.

**Non-obvious consequence:** this breaks the **free** `/v1/consent/status` too. `checkAccess` uses
`AtomicTransactionComposer.simulate()`, which still needs a sender and a signer even though nothing
is submitted and no fee is paid. An operator who reasons "consent lookup is read-only, so it needs
no key" will be wrong.

**Related, and already handled at boot:** `PAY_TO_ADDRESS` has the opposite treatment.
`assertPayToConfigured()` (`config.ts:71-83`, called from `index.ts:6`) refuses to start the process
at all when it is empty or fails checksum validation — because a service that boots and advertises a
402 with an empty payee fails silently on the one field that decides whether it earns anything.
G-30 is closed.

---

### E-500-INTERNAL — Unhandled server fault {#e-500-internal}

**Status** `500` · **Routes** any · **Path** `api/src/app.ts:113-139` (`app.onError`)

```json
{"error":{"code":"INTERNAL_ERROR",
          "message":"An internal error occurred. Quote the requestId when reporting this.",
          "retryable":true,
          "requestId":"f2b0…"}}
```

The body is **fixed**. The underlying exception — method, path, message, stack — is logged
server-side as one structured JSON line keyed by the same `requestId`, and never returned.

This is the catch-all behind [E-500-NOAPPID](#e-500-noappid), [E-500-NOOPERATOR](#e-500-nooperator),
an algod outage, and any unforeseen fault. **It used to return `err.message` verbatim**, which
disclosed internal exception text to unauthenticated callers and reported client input errors as
server errors. SEC-011 is **IMPLEMENTED**.

**For integrators:** `requestId` is the only handle you have on an internal fault. Quote it. There is
no public status page and no error-detail endpoint.

---

### W-200-AUDIT-PENDING — Record returned, audit entry not written {#w-200-audit-pending}

**Status** `200` · **Route** `POST /v1/records/summary` · **Path** `routes/records.ts:83-99`

Not an error — a degraded success. The consent check passed and the record is returned, but the
`log_access` transaction failed:

```json
{"…":"…","consentVerifiedOnChain":true,
 "auditStatus":"pending","auditTxId":null,"auditSequence":null,"…":"…"}
```

Triggers: operator account out of ALGO, app account out of box MBR, algod 5xx,
transaction-validity-window expiry (`txn dead: round X outside of Y--Z`), or a rejected box reference
under concurrency (REL-004).

**Why 200 and not 500.** The audit write must not be able to turn a legitimate, authorised, paid
request into an error. Raising here would return a 500, a 500 cancels settlement, and the caller
would lose a response they were entitled to — while MedRail lost the **sale**. The caller's *money*
was never at risk either way. `records.ts:89-98` emits a structured `audit_write_failed` event
carrying `patientId`, `requesterAddress`, endpoint and the underlying message, so the failure is
visible to an operator rather than swallowed. G-03 is closed.

**What is still open, and matters.** There is no queue and no automatic replay: a `"pending"` access
is permanently missing from the patient's on-chain trail unless an operator replays it by hand. And
nothing monitors the two balances whose exhaustion causes it (G-15). **Clients that depend on the
audit trail must branch on `auditStatus`**; clients that only want the record can ignore it.

---

### E-404-ARC56 — Compiled spec missing {#e-404-arc56}

**Status** `404` · **Route** `GET /v1/consent/arc56` · **Path** `api/src/app.ts:141-148`

```json
{"error":"ARC-56 spec not found — has the contract been compiled?"}
```

The path is a fixed literal with no request-derived component, so this is not a traversal surface.
It fires when `contracts/artifacts/MedRailConsent.arc56.json` is absent from the image — related to
the build-output confusion in **G-28**, which is still open: the documented compile command writes to
a different directory than the one consumers read from, and an undocumented copy step bridges the gap.

---

## 3. Chain-layer failures surfaced through the API

These originate on Algorand. They now surface as [W-200-AUDIT-PENDING](#w-200-audit-pending) on the
records success path, or as [E-500-INTERNAL](#e-500-internal) elsewhere.

| Condition | Symptom | Cause | Mitigation today |
|---|---|---|---|
| Validity-window expiry | `txn dead: round X outside of Y--Z` | Sequential round-trips exceed the window | Scripts set a generous `validity_window`; the API does not |
| Box-reference rejection | Transaction rejected by the AVM | Concurrent `logAccess` for one patient mispredicts the audit box name. **A rejected transaction, not a corrupted log** | `withPatientLock` — in-process only, so `api/fly.toml` pins `max_machines_running = 1` (G-11 open: no horizontal scale) |
| Operator out of ALGO | Every `logAccess` fails | Fee exhaustion | **None.** No balance monitoring (G-15). Bounded on the denial path by rate limiting |
| App account below box MBR | Box creation fails | Growth beyond the 5 ALGO funded at deploy | `fund_mbr` exists; no alerting |
| AlgoNode unavailable | Timeout, then error | No timeout, no retry, no fallback endpoint | **None** (REL-003) |

---

## 4. Retry guidance for integrators

| Status | Retry? | How |
|---|---|---|
| `200` with `auditStatus: "pending"` | **No — you have your record** | Do not re-send; a retry is a second payment. Report it if the audit entry matters to you |
| `402` | Yes — that is the protocol | Attach `PAYMENT-SIGNATURE` and resend |
| `400` | No | Fix the request body or the address |
| `403` with `payer` | Yes | Sign the payment with the key for the address you are asserting |
| `403` with `charged: false` | Only after a grant exists | Check `GET /v1/consent/status` free first — it costs nothing and avoids a wasted round trip |
| `404` | No | Server-side build issue |
| `429` | Yes | Wait `Retry-After` seconds. Watch `X-RateLimit-Remaining` to avoid hitting it |
| `500` | Maybe | Back off exponentially with a low cap; quote the `requestId` when reporting |
| `503` | Yes | Wait `Retry-After` (30 s). The payment facilitator is down, not MedRail |

**The 500-for-everything problem is largely gone.** A facilitator outage is now a `503` with
`Retry-After` and a stable code; a malformed address is a `400`; a rate-limit refusal is a `429`.
What remains under `500` is genuine internal faults — configuration and unforeseen exceptions —
distinguished from each other only by the server-side log line the `requestId` points at. That is a
deliberate trade: the caller gets a correlation handle instead of an internal message.

**No retry is ever free.** There is no idempotency key, no request deduplication, and no replay
window. A retried `POST /v1/records/summary` is a second payment and a second audit entry. Prefer the
free `GET /v1/consent/status` pre-flight over a speculative paid call.

---

## 5. The recommended error envelope — **IMPLEMENTED**

The 2026-08-21 review recommended a structured envelope. It now exists on every cross-cutting error
path:

```json
{
  "error": {
    "code": "PAYMENT_FACILITATOR_UNAVAILABLE",
    "message": "The payment facilitator is temporarily unreachable, so a payment challenge cannot be issued. Retry shortly.",
    "retryable": true,
    "facilitator": "https://facilitator.goplausible.xyz"
  }
}
```

Against the four changes that were recommended:

1. **Stable machine-readable `code`** — **done.** Three codes exist: `RATE_LIMITED` (429),
   `PAYMENT_FACILITATOR_UNAVAILABLE` (503), `INTERNAL_ERROR` (500). Branch on identity, not prose.
2. **Never echo `err.message`** — **done.** `app.onError` logs the detail server-side against a
   generated `requestId` and returns a fixed generic message. SEC-011 closed.
3. **Correct statuses** — **done.** `503` + `Retry-After` for upstream unavailability, `400` for
   client input including a failed address checksum, `429` + `Retry-After` for rate limiting, and
   `500` reserved for genuine internal faults.
4. **A `requestId` on every response** — **partially done.** It is present on every `500`, which is
   where it matters most, but not on successful responses, and it is **not** correlated with the
   settled payment transaction or the audit transaction. Reconstructing one request end to end
   across HTTP, settlement and chain still requires manual work. **RECOMMENDED**, unfinished.

**Two shapes still coexist**, and integrators should know which is which. Per-route validation and
consent errors are flat — `{error: string}` plus `{details: {formErrors, fieldErrors}}` — and carry
their discriminators as sibling fields (`payer`, `charged`). Cross-cutting middleware errors use the
nested envelope above. Test for `typeof body.error === "object"` before reading `body.error.code`.

SEC-011 is closed and REL-001 is partially addressed. The remaining observability work — metrics,
tracing, alerting, log aggregation — is untouched (G-15, OPS-003/004).

---

## Cross-references

- Endpoint reference: [`API_Documentation.md`](API_Documentation.md) · [`OpenAPI.yaml`](OpenAPI.yaml)
- Findings: [`../ENGINEERING_GAP_REPORT.md`](../ENGINEERING_GAP_REPORT.md)
- Operational response: [`../10_Operations/Incident_Response.md`](../10_Operations/Incident_Response.md)
