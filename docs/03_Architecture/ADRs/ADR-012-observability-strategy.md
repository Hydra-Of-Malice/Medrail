# ADR-012: Observability strategy


> **⚠ Correction notice.** Parts of this document were written against a review finding that was
> later proven wrong. Settlement in x402 v2 happens **only** on a sub-400 response, so **no error
> path in MedRail can consume a settled payment** — and consent-denied calls (HTTP 403) are **not
> charged**, contrary to `API.md`, `SECURITY.md`, and the `paidButDenied` field. The audit-sequence
> race causes a **rejected transaction**, not a corrupted log. See
> [`CORRECTIONS.md`](../../CORRECTIONS.md) — it supersedes any statement here that contradicts it.

**Status:** Proposed (RECOMMENDED, not implemented)
**Date:** Not recorded. No observability decision appears anywhere in the repository.
**Deciders:** Not recorded in repository
**Evidence:** `api/src/index.ts:5-7` (the only startup log); `api/src/app.ts:58-61` (the only error log); `api/src/routes/health.ts:6-14`; `api/Dockerfile` (no `HEALTHCHECK`); `api/fly.toml` (no `[[http_service.checks]]`); `.github/workflows/ci.yml` (no scanning, no coverage)

## Context — state the current position plainly

MedRail has no observability. Not "minimal", not "basic" — none of the standard components exist.

| Component | State | Evidence |
|---|---|---|
| Structured logging | **NOT IMPLEMENTED** | `console.log` once at boot (`api/src/index.ts:6`); `console.error(err)` in the error handler (`api/src/app.ts:59`). No log levels, no JSON, no timestamps beyond whatever the platform adds. |
| Request correlation IDs | **NOT IMPLEMENTED** (OPS-002) | No middleware sets or propagates one. Two concurrent failures are indistinguishable in the output. |
| Metrics | **NOT IMPLEMENTED** (OPS-003) | No counters, no histograms, no `/metrics`. Request rate, error rate, latency and settlement outcomes are all unknown. |
| Tracing | **NOT IMPLEMENTED** (OPS-004) | No OpenTelemetry, no spans across API → facilitator → algod. |
| Alerting | **NOT IMPLEMENTED** (OPS-005) | Nothing watches operator-account balance, app-account MBR headroom, or settlement failure rate. |
| Health probe wiring | **IMPLEMENTED but unwired** (OPS-001, **D-6**) | `GET /v1/health` exists (`api/src/routes/health.ts`) and is free and tested. No `HEALTHCHECK` in either Dockerfile; no health check block in `api/fly.toml`. Nothing calls it except the frontend's `NetworkBadge`. |
| Coverage measurement | **NOT IMPLEMENTED** | No `--coverage`, no threshold, no report. |
| Dependency / security scanning | **NOT IMPLEMENTED** (SEC-014) | No `npm audit`, no `pip-audit`, no Dependabot, no CodeQL, no SAST. |

Two facts make this worse than it would be for an ordinary CRUD service:

1. **`app.onError` returns `err.message` verbatim to the caller** (`api/src/app.ts:60`, SEC-011). The system's only error surface points *outward*, at unauthenticated clients, and not inward at an operator. Finding R-3 is the demonstration: a malformed 58-character address produces HTTP 500 with body `{"error":"wrong checksum for address"}` — a client input error reported as a server error, with an internal exception message attached.
2. **Money moves on these paths.** Finding R-2 — a settled payment lost when the audit write throws on `api/src/routes/records.ts:49` — is currently **undetectable**. There is no counter, no log line, no alert, and no durable store (ADR-002). If it happened in production today, the only evidence would be a 500 in a platform access log and an unhappy caller. Nobody would know how often it happens.

## Problem

What observability is proportionate for a stateless, single-service, no-database hackathon submission that nonetheless takes money on three endpoints and writes to a public ledger?

## Options considered

| Option | Pros | Cons | Why rejected |
|---|---|---|---|
| **Status quo — `console.*` only** | Zero work. Zero dependencies. | R-2 is undetectable. R-1 is indistinguishable from any other 500. An operator-account ALGO exhaustion silently breaks every paid gated call. Nothing can answer "did anyone lose money today." | Untenable the moment the service is public and paid. |
| **Minimal, targeted instrumentation** (recommended) | Closes the gaps that matter — money-adjacent events, correlatable errors, a wired liveness probe, dependency scanning — for a few hundred lines and no new infrastructure. Keeps ADR-002's no-infrastructure posture. | Not a dashboard. No historical query, no percentiles, no traces. Alerting is coarse. | — |
| **Full stack: OpenTelemetry + Prometheus + Grafana + log aggregation** | Complete. Traces across API → facilitator → algod would have made R-1 obvious immediately. | Requires a collector, a metrics store, a dashboard and a log sink — four components for a system with one process, no database, and one settled payment. Operationally heavier than the service it observes. Nobody is on call. | Disproportionate. Explicitly **not** recommended for this scope. |
| **A hosted APM (Datadog / Sentry / similar)** | One agent, immediate value, error grouping and alerting out of the box. Sentry alone would surface R-2 and R-3 within minutes of going live. | An account, a key, and a vendor — and `docs/IMPLEMENTATION_PLAN.md:75` records that account-creating steps belong to the user, not to the build. Cost beyond a free tier. | Not rejected on merit. A reasonable substitute for items 2 and 3 below if the user already has an account; noted rather than assumed. |
| **Rely on the platform's built-in logs** | Free with Fly.io; nothing to build. | Unstructured, uncorrelated, retention-limited, and blind to anything the process does not print — which is currently everything except boot and errors. | Necessary but nowhere near sufficient. |

## Decision (proposed — nothing below is implemented)

Adopt **minimal, targeted instrumentation**, in this order. Each item is scoped to be worth its weight for a single-process, no-database service.

**1. Wire the health probe, and make it tell the truth. (OPS-001, D-6)**

`api/src/routes/health.ts:11` returns `consentAppId: config.consentAppId || null` and always reports `ok: true`. Under defect D-1 — `CONSENT_APP_ID` unset in a container — the service returns HTTP 200 with `consentAppId: null` while `/v1/records/summary` and `/v1/consent/status` both 500. **A liveness probe on this endpoint would stay green through a total failure of the consent layer.**

- Add `HEALTHCHECK` to `api/Dockerfile` and an `[[http_service.checks]]` block to `api/fly.toml` pointing at `/v1/health`.
- Split liveness from readiness: keep `/v1/health` as a cheap liveness probe, and have it return **503** when `config.consentAppId == 0` or `config.payToAddress` is empty — misconfiguration is not "healthy." Do **not** make it call algod; a probe that depends on a third party turns their outage into your restart loop.

**2. One structured log line per request, with a correlation ID. (OPS-002)**

A small Hono middleware: generate or accept an `X-Request-Id`, put it on the context, and emit one JSON line per request with `{requestId, method, path, status, durationMs}`. Include the id in every error path and in the error response body so a caller can quote it.

**3. Log the money-adjacent events explicitly. This is the item that matters most.**

Four events, as structured log lines, each carrying the request id:

- `payment.settled` — the route, the price, and the settlement outcome from the middleware.
- `consent.checked` — `{patient, requester, scope, allowed}` (addresses only; no clinical content — AI-007).
- `audit.written` — `{txId, sequence}` on success.
- `audit.failed` — **the R-2 event**. Log it at error level on both paths of `api/src/routes/records.ts`, including the currently-silent `.catch(() => undefined)` at line 37, with enough context to replay the write by hand: patient, requester, scope, endpoint, action, and the underlying error.

Without item 3, a lost payment leaves no trace anywhere. With it, a lost payment is greppable and manually recoverable — which, absent a durable outbox (ADR-005), is the only recovery there is.

**4. Stop leaking internals; start recording them. (SEC-011, R-3)**

Change `api/src/app.ts:58-61` to log the full error server-side with the request id and return a generic body plus that id. Separately, add `.refine(algosdk.isValidAddress)` to the four address fields (SEC-010) so R-3 becomes a 400 rather than a 500 — an input error should never enter the error-rate signal.

**5. Two alerts, not twenty. (OPS-005)**

Only two conditions can silently break the product:

- **Operator account ALGO balance below a threshold** — exhaustion means every `log_access` fails, which means R-2 on every successful paid gated call.
- **Application account MBR headroom below a threshold** (REL-006) — exhaustion means no new grant or audit box can be created. Note the threshold must be computed from the *true* per-box cost, 22,500 µALGO, not from `get_grant_box_mbr()`, which under-reports by 400 µALGO per box (defect **C-2**, `contract.py:52`).

A scheduled job — a GitHub Actions cron querying the indexer is sufficient and needs no infrastructure — is proportionate. Add a settlement-failure-rate alert only once item 3 exists to feed it.

**6. Close the CI observability gaps that cost nothing. (SEC-014, OPS-006)**

Fix CI-1 first (`branches: [main]` while the branch is `master`, so the pipeline has never run on a push). Then add `npm audit --audit-level=high`, `pip-audit`, and Dependabot. Add `vitest run --coverage` for visibility — reporting only, no gate; a threshold on a suite that does not cover `routes/records.ts` or `services/algorand.ts` would encourage the wrong tests.

**Explicitly NOT recommended at this scope:** OpenTelemetry tracing (OPS-004), a Prometheus/Grafana deployment, a log-aggregation vendor, per-caller usage analytics, or a status page. Each is defensible for a service with users; none is defensible for a service with one settled self-payment and no on-call rotation. OPS-004 should stay **NOT IMPLEMENTED** and be recorded as a deliberate scope decision rather than an oversight.

## Rationale

> **Decision rationale not documented in implementation; the reasoning below is reconstructed by review and should not be treated as historical fact.**

No document in the repository discusses observability. `docs/SECURITY.md` notes the absence of structured logging in passing but does not argue a position. The reconstruction is simply that observability was not scoped: the project prioritised correctness of the payment and consent integration, verified by tests and on-chain evidence, over runtime visibility — a defensible allocation for a build with no production traffic, and one that stops being defensible at the moment a public URL exists.

The ordering above follows severity of what is currently invisible, not conventional maturity ladders. Item 3 is first in importance because R-2 involves money and is currently undetectable; item 1 is first in sequence because it is a config edit.

## Trade-offs

Since this ADR proposes work, the honest accounting is of what the proposal costs.

- **Every item is code that is not the product.** Items 1–4 are perhaps 150–250 lines plus tests, in a codebase whose API source is small. That is a real fraction of the project spent on infrastructure a judge will not see.
- **Logging addresses is a privacy decision.** `consent.checked` and `audit.failed` lines contain Algorand addresses. These are already public on-chain (that is the premise of finding S-1's exploit), so this adds no on-chain disclosure — but it does create an off-chain record of *who asked about whom*, which the system currently does not keep. Log retention becomes a question that does not exist today. Clinical free text must never be logged (AI-007).
- **A readiness probe that 503s on misconfiguration will refuse to serve** where the service currently starts and half-works. That is the point, and it will look like a regression the first time it fires.
- **Alerts nobody reads are worse than no alerts.** Two alerts are proposed precisely because a longer list would be ignored. If nobody is monitoring, item 5 should be skipped rather than half-done.
- **Coverage reporting without a gate changes nothing by itself.** It is proposed for visibility, on the explicit understanding that the number will be unflattering in exactly the right places.

## Consequences

**If implemented**
- OPS-001 → **IMPLEMENTED and wired** (closes D-6); OPS-002 → **IMPLEMENTED**; OPS-005 → **PARTIALLY IMPLEMENTED** (two alerts, not the full set); SEC-011 → **IMPLEMENTED**; SEC-010 → **IMPLEMENTED** (closes R-3); SEC-014 → **IMPLEMENTED**; OPS-006 → **IMPLEMENTED** (closes CI-1).
- R-2 becomes detectable and manually recoverable. R-1 becomes distinguishable from an application fault.
- OPS-003 stays **NOT IMPLEMENTED**; OPS-004 stays **NOT IMPLEMENTED** by deliberate scope decision.
- OPS-008 (RPO/RTO) stays **NOT IMPLEMENTED** — no targets have ever been established, and none should be invented here.

**If not implemented**
- Everything in the Context table stays as it is. The service can take money and deliver nothing, repeatedly, with no signal. That is the whole finding.

**Neutral**
- No new requirement IDs are allocated by this ADR. Every gap it addresses is already registered as OPS-001 … OPS-006, SEC-010, SEC-011, SEC-014, REL-002 or REL-006.

## Conditions for future reconsideration

- **Before the API is exposed at a public URL**, implement items 1–4. Below that bar, "we do not know whether callers are being charged for nothing" is a true statement about the system.
- **Reconsider the full stack** if MedRail ever has more than one service, more than one instance (ADR-009 / D-7 makes multi-instance a correctness question, not just an observability one), or a support obligation to anyone.
- **Add distributed tracing (OPS-004)** only when there are at least three hops worth correlating. Today there are two, and one structured log line per request covers both.
- **Establish RPO and RTO (OPS-008)** only when someone can commit to them. Inventing targets nobody will meet is worse than recording that none exist.
