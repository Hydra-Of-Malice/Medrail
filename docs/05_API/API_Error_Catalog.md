# MedRail — API Error Catalogue

**Purpose:** Every error the MedRail API can actually produce, with its trigger, its exact response
shape, its settlement consequence, and the code path that emits it.

**Status of this document:** Complete. Every entry was either reproduced against a running instance
during the 2026-08-21 review or read directly from source. Nothing here is inferred from the
handler signatures.

> **Read this first.** Settlement in x402 v2 happens **only** when the route handler returns a
> status below 400. `@x402/hono` (`node_modules/@x402/hono/dist/esm/index.mjs:203-232`) cancels the
> payment on any throw or any 4xx/5xx and returns before `processSettlement`. **Every error in this
> catalogue therefore leaves the caller uncharged**, including the 403 that the project's own
> documentation describes as billable. See [`../CORRECTIONS.md`](../CORRECTIONS.md) §C-1 and §C-2.

---

## 1. Error index

| Code | Status | Route(s) | Attributable to | Retryable | Settlement |
|---|---|---|---|---|---|
| [E-402](#e-402) | 402 | 3 priced | client (no payment) | yes, with payment | not attempted |
| [E-400-ZOD](#e-400-zod) | 400 | all POST + consent status | client | no (fix the request) | **cancelled** |
| [E-403-CONSENT](#e-403-consent) | 403 | `/v1/records/summary` | client (no grant) | after a grant exists | **cancelled** |
| [E-500-FACILITATOR](#e-500-facilitator) | 500 | 3 priced | **server / upstream** | yes, later | not attempted |
| [E-500-ADDRESS](#e-500-address) | 500 | consent status, records | **client, mis-reported** | no | **cancelled** |
| [E-500-NOAPPID](#e-500-noappid) | 500 | consent status, records | **server (config)** | no | **cancelled** |
| [E-500-NOOPERATOR](#e-500-nooperator) | 500 | consent status, records | **server (config)** | no | **cancelled** |
| [E-500-AUDIT](#e-500-audit) | 500 | `/v1/records/summary` | **server / chain** | yes | **cancelled** |
| [E-404-ARC56](#e-404-arc56) | 404 | `/v1/consent/arc56` | server (build) | no | n/a (free) |

---

## 2. Entries

### E-402 — Payment required {#e-402}

**Status** `402` · **Routes** `POST /v1/triage`, `POST /v1/interaction-check`,
`POST /v1/records/summary` · **Path** `api/src/app.ts:37-50` → `@x402/hono` middleware

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
config — which is why [E-500-FACILITATOR](#e-500-facilitator) exists.

---

### E-400-ZOD — Request schema validation failure {#e-400-zod}

**Status** `400` · **Paths** `routes/triage.ts:13-15`, `routes/interaction.ts:13-15`,
`routes/records.ts:26-29`, `routes/consent.ts:21-28`

Body shape is zod's `.flatten()` output:

```json
{"error":"invalid query — expected ?patient=&requester=&scope=",
 "details":{"formErrors":[],
            "fieldErrors":{"patient":["String must contain exactly 58 character(s)"]}}}
```

Per-route messages: `"invalid request"` (triage, records), `"invalid request — provide at least 2
medications"` (interaction-check), and the query-specific message above.

**Ordering matters, and it is deliberate.** The payment middleware runs *before* the handler
(`app.ts:37`), so an **unpaid** malformed request returns **402, not 400** — the caller never learns
their body was invalid until they pay. `api/test/x402-flow.spec.ts` documents this ordering
explicitly rather than assuming it. A **paid** malformed request returns 400, and settlement is
**cancelled**, so the caller is not charged for the mistake.

---

### E-403-CONSENT — No valid consent grant {#e-403-consent}

**Status** `403` · **Route** `POST /v1/records/summary` · **Path** `routes/records.ts:36-49`

```json
{"error":"no valid consent grant from this patient for this requester and scope",
 "patientId":"…","requesterAddress":"…","paidButDenied":true}
```

**The `paidButDenied` field is misleading and should be removed or the behaviour changed.** A 403
cancels settlement, so the caller pays nothing. Meanwhile `records.ts:37` submits a real
`logAccess(..., "consent_denied")` transaction whose fee **MedRail's operator account pays** — and
that write is wrapped in `.catch(() => undefined)`, so if it fails nothing anywhere records that it
did. Net: the caller pays nothing, MedRail pays a chain fee to say no, and with no rate limiting
(SEC-013) this is an unauthenticated fee-drain vector. Tracked as **G-03**; see
[`../CORRECTIONS.md`](../CORRECTIONS.md) §C-2.

**Also note (G-01):** this 403 is the *only* thing standing between a caller and the record, and it
checks a `requesterAddress` the caller supplies. It is not an authentication boundary today.

---

### E-500-FACILITATOR — Facilitator unreachable {#e-500-facilitator}

**Status** `500` · **Routes** all three priced · **Reproduced** with `FACILITATOR_URL` set to a
closed port

```json
{"error":"Failed to initialize: no supported payment kinds loaded from any facilitator."}
```

**No `PAYMENT-REQUIRED` header is emitted.** The 402 cannot be constructed offline because
`accepts[].asset` and `extra.feePayer` come from the facilitator's `/supported`. There is no
timeout, retry, circuit breaker, or cached fallback.

**Blast radius is bounded and was verified:** `/v1/health`, `/`, and `/v1/consent/app-info` all
still returned `200` with the facilitator down. Only the priced routes fail.

**This is the wrong status.** A calling agent sees an opaque server error rather than a retryable
signal; `503` + `Retry-After` is the correct response. Tracked as **G-04** (REL-001).

---

### E-500-ADDRESS — Malformed address reported as a server error {#e-500-address}

**Status** `500` · **Routes** `/v1/consent/status`, `/v1/records/summary` · **Reproduced**

```
GET /v1/consent/status?patient=AAAA…(58 chars)&requester=<valid>&scope=x
→ 500 {"error":"wrong checksum for address"}
```

zod validates **length only** (`.length(58)`). `algosdk.decodeAddress` then throws inside
`grantBoxName` (`api/src/services/algorand.ts:49`), and `app.ts:58-61` returns `err.message`
verbatim.

Two defects in one path: a client input error reported as a server error (corrupting error-rate
signals and misleading integrators), and internal exception text disclosed to an unauthenticated
caller. Tracked as **G-10** (SEC-010, SEC-011). **Fix:** `.refine(algosdk.isValidAddress)` on all
four address fields, and a generic 500 body with the detail logged server-side.

---

### E-500-NOAPPID — Consent App ID not configured {#e-500-noappid}

**Status** `500` · **Path** `api/src/config.ts` `requireConsentAppId()`

```json
{"error":"CONSENT_APP_ID is not set and contracts/artifacts/deploy_testnet.json was not found. Deploy the contract first (see docs/DEPLOYMENT.md)."}
```

**This is the default container failure.** The Dockerfile does not copy the deploy artifact, and the
fallback could not help anyway: with `WORKDIR /app/api` the resolved path is
`/app/contracts/artifacts/deploy_<network>.json`, and because `fly.toml` sets `NETWORK = "mainnet"`
the file sought is `deploy_mainnet.json` — which has never existed. `CONSENT_APP_ID` must be set
explicitly. Tracked as **G-07**.

---

### E-500-NOOPERATOR — Operator mnemonic not configured {#e-500-nooperator}

**Status** `500` · **Path** `api/src/services/algorand.ts` `getOperator()`

```json
{"error":"OPERATOR_MNEMONIC is not set — see docs/DEPLOYMENT.md"}
```

**Non-obvious consequence:** this breaks the **free** `/v1/consent/status` too. `checkAccess` uses
`AtomicTransactionComposer.simulate()`, which still needs a sender and a signer even though nothing
is submitted and no fee is paid. An operator who reasons "consent lookup is read-only, so it needs
no key" will be wrong.

---

### E-500-AUDIT — Audit write failed after a successful consent check {#e-500-audit}

**Status** `500` · **Route** `POST /v1/records/summary` · **Path** `routes/records.ts:51`

The success path awaits `logAccess` **unguarded**, unlike the denied path at `:38`. Triggers:
operator account out of ALGO, app account out of box MBR, algod 5xx, transaction-validity-window
expiry (`txn dead: round X outside of Y--Z`), or a rejected box reference under concurrency
(REL-004).

**Settlement is cancelled**, so the caller is not charged — this is *not* the money-loss bug the
review originally reported (withdrawn, [`../CORRECTIONS.md`](../CORRECTIONS.md) §C-1). What is lost
is the **sale**: a legitimate, authorised, payable request becomes an error, and with no structured
logging (OPS-002) nothing records that it happened.

**Fix:** wrap in `try/catch` and return `200` with the record plus `auditStatus: "pending"` and a
null `auditTxId`. Tracked as **G-03**.

---

### E-404-ARC56 — Compiled spec missing {#e-404-arc56}

**Status** `404` · **Route** `GET /v1/consent/arc56` · **Path** `api/src/app.ts:60-67`

```json
{"error":"ARC-56 spec not found — has the contract been compiled?"}
```

The path is a fixed literal with no request-derived component, so this is not a traversal surface.
It fires when `contracts/artifacts/MedRailConsent.arc56.json` is absent from the image — related to
the build-output confusion in **G-28**.

---

## 3. Chain-layer failures surfaced through the API

These originate on Algorand and reach callers as `E-500-AUDIT` or `E-500-ADDRESS`.

| Condition | Symptom | Cause | Mitigation today |
|---|---|---|---|
| Validity-window expiry | `txn dead: round X outside of Y--Z` | Sequential round-trips exceed the window | Scripts set a generous `validity_window`; the API does not |
| Box-reference rejection | Transaction rejected by the AVM | Concurrent `logAccess` for one patient mispredicts the audit box name | `withPatientLock` — **in-process only** (G-11) |
| Operator out of ALGO | Every `logAccess` fails | Fee exhaustion | **None.** No balance monitoring (G-15) |
| App account below box MBR | Box creation fails | Growth beyond the 5 ALGO funded at deploy | `fund_mbr` exists; no alerting |
| AlgoNode unavailable | Timeout, then error | No timeout, no retry, no fallback endpoint | **None** (REL-003) |

---

## 4. Retry guidance for integrators

| Status | Retry? | How |
|---|---|---|
| `402` | Yes — that is the protocol | Attach `PAYMENT-SIGNATURE` and resend |
| `400` | No | Fix the request body |
| `403` | Only after a grant exists | Check `GET /v1/consent/status` free first — it costs nothing and avoids a wasted round trip |
| `404` | No | Server-side build issue |
| `500` | Depends, and **you cannot currently tell which** | See below |

**The 500 problem.** Five distinct conditions share one status and one untyped body. A facilitator
outage (transient, retry later) is indistinguishable from a misconfigured App ID (permanent) or a
malformed address (client error). There is no stable error `code`, no `Retry-After`, and no
correlation ID. **Recommendation for integrators today:** treat `500` as retryable with exponential
backoff and a low cap, and alert a human after two failures.

---

## 5. Recommended error envelope — **RECOMMENDED / NOT IMPLEMENTED**

```json
{
  "error": {
    "code": "FACILITATOR_UNAVAILABLE",
    "message": "Payment verification is temporarily unavailable.",
    "retryable": true,
    "requestId": "01J8…"
  }
}
```

Four changes, each small:

1. **Stable machine-readable `code`** per condition, so integrators branch on identity rather than
   parsing prose.
2. **Never echo `err.message`** to unauthenticated callers — log it server-side against
   `requestId`.
3. **Correct statuses:** `503` + `Retry-After` for upstream unavailability, `400` for client input,
   reserving `500` for genuine internal faults.
4. **A `requestId`** on every response, correlated with the settled payment transaction and the
   audit transaction, so an operator can reconstruct one request end to end.

Together these close SEC-011 and REL-001 and make GAP-M8's observability work actionable.

---

## Cross-references

- Endpoint reference: [`API_Documentation.md`](API_Documentation.md) · [`OpenAPI.yaml`](OpenAPI.yaml)
- Withdrawn claims: [`../CORRECTIONS.md`](../CORRECTIONS.md)
- Findings: [`../ENGINEERING_GAP_REPORT.md`](../ENGINEERING_GAP_REPORT.md)
- Operational response: [`../10_Operations/Incident_Response.md`](../10_Operations/Incident_Response.md)
