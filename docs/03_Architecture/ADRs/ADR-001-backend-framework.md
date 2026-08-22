# ADR-001: Hono + TypeScript on Node 20 as the x402 resource server

**Status:** Accepted (rationale reconstructed)
**Date:** Not recorded as a decision date. The deciding artifacts (`api/package.json`, `api/src/app.ts`, `api/src/x402.ts`) first appear in commit `d2a5f7f`, 2026-08-07.
**Deciders:** Not recorded in repository
**Evidence:** `api/package.json:13-24`; `api/src/app.ts:1-8`; `api/src/x402.ts:1-3`; `api/src/index.ts:1-7`; `docs/IMPLEMENTATION_PLAN.md:29-32`

## Context

MedRail needs one HTTP service that (a) emits an x402 `402 Payment Required` challenge on three priced routes, (b) hands a presented `PAYMENT-SIGNATURE` to a facilitator for verify+settle, and (c) makes ABI calls into a deployed Algorand application. The contract itself is Algorand Python (`algopy` 3.5.1, compiled by `puyapy` 5.9.0), so the repository is already multi-language before the API framework is chosen.

The decisive external constraint is recorded, even though the framework decision is not: `docs/IMPLEMENTATION_PLAN.md:29` records that `@x402/core`, `@x402/avm`, `@x402/hono` and `@x402/extensions` were verified live on the npm registry at `2.21.0`, and `:30` records `x402-avm` as the Python equivalent. **`@x402/hono` is a first-party framework adapter published by the x402 project itself.** No other Node framework adapter is present in this repo's verified dependency set.

## Problem

Which HTTP framework and runtime should host the resource server, given that the x402 payment middleware is the single most integration-sensitive component and that getting it wrong is the "confidently-wrong integration code" failure mode the project explicitly names as its biggest risk (`docs/IMPLEMENTATION_PLAN.md:35`)?

## Options considered

| Option | Pros | Cons | Why rejected |
|---|---|---|---|
| **Hono 4.7 + TS 5.7 on Node 20** (chosen) | First-party `@x402/hono` adapter — `paymentMiddleware(routeMap, resourceServer)` is one call (`api/src/app.ts:37-50`). Web-standard `Request`/`Response`, so `app.fetch` is testable with no listening socket. Small dependency surface. Shares TypeScript and `algosdk` with `web/`. | Smaller ecosystem than Express; fewer off-the-shelf middlewares (rate limiting, request IDs, structured logging all absent — SEC-013, OPS-002). Adds a third language boundary alongside the Python contract. | — |
| **Express 4/5 + `@x402/core`** | Largest Node ecosystem; every operator knows it. | No first-party adapter is evidenced anywhere in this repo (`docs/IMPLEMENTATION_PLAN.md:29` verified only the four packages above). Would mean hand-writing the 402 challenge, header codec and settle call over `@x402/core` — precisely the integration surface most likely to be confidently wrong. Node/Express `req`/`res` are not Web-standard, so the in-process request test used throughout `api/test/x402-flow.spec.ts` would need a real socket. | Hand-rolled payment middleware is the highest-risk line of code in the project; a first-party adapter removes it entirely. |
| **Fastify + `@x402/core`** | Fast; good schema/validation story; mature plugin model. | Same missing-adapter problem as Express. Its native JSON-schema validation would duplicate the `zod` validation already used in all four routes. | Same reason as Express, with no compensating benefit. |
| **Python FastAPI + `x402-avm`** | Would collapse the repo to **one** language: same toolchain as the contract (`algopy`, `py-algorand-sdk` 2.11.1 — `docs/IMPLEMENTATION_PLAN.md:32`), and could plausibly share the box-key derivation with the contract instead of re-implementing it (NFR-011). Genuine first-class Algorand x402 SDK exists (`docs/IMPLEMENTATION_PLAN.md:30`). | The frontend is TypeScript regardless, so a second language reappears there. `web/lib/consent.ts` would still need its own third derivation. No first-party Python *framework* adapter is evidenced — only the SDK. | **This is the strongest rejected option.** Rejected, on reconstruction, for the adapter-maturity reason above; but note it would have addressed NFR-011 (three independent box-key implementations) better than the chosen option does. |
| **Bare `node:http` / no framework** | Zero framework risk. | Would require hand-rolling routing, CORS and the payment middleware. | Maximum work, maximum integration risk, no upside. |

## Decision

Use **Hono 4.7 on Node 20 with TypeScript 5.7 in `strict` mode**, with `@x402/hono`'s `paymentMiddleware` as the sole payment integration point and `@hono/node-server` as the runtime adapter (`api/src/index.ts:1-5`).

## Rationale

> **Decision rationale not documented in implementation; the reasoning below is reconstructed by review and should not be treated as historical fact.**

### Reconstructed rationale

1. **The adapter chose the framework.** `@x402/hono` exists and is pinned to the same `2.21.0` as `@x402/core` and `@x402/avm`. Every alternative Node framework would have required hand-written middleware over `@x402/core`. Given that `docs/IMPLEMENTATION_PLAN.md:35` names "a plausible-looking import that doesn't exist… a header name from protocol v1 when the live facilitator speaks v2" as the project's top risk, minimising hand-written protocol code is consistent with the project's own stated risk posture.
2. **Web-standard handlers made the payment path testable without a server.** Because Hono exposes `app.fetch`, `api/test/x402-flow.spec.ts` asserts the real 402 status and the decoded `PAYMENT-REQUIRED` payload in-process. The reviewer reproduced the live 402 the same way (`app.request("/v1/triage")`, VERIFIED_FACTS §4). With an Express-shaped API this would need a bound port and would likely have been skipped.
3. **Route-map pricing is auditable at a glance.** `api/src/app.ts:35-36` carries the only recorded comment near this decision — pricing is declared in one object "so pricing is easy for a judge (or a caller writing an integration) to audit at a glance." That is a recorded *consequence* of the middleware shape, not a recorded rationale for the framework.
4. **TypeScript for both API and web.** `algosdk` is shared between `api/src/services/algorand.ts` and `web/lib/consent.ts`. One language across the two Node-side components is cheaper than three.

### What is recorded

Only the package-verification table (`docs/IMPLEMENTATION_PLAN.md:20-34`) and the pricing-locality comment (`api/src/app.ts:35-36`). No document in the repository compares frameworks or states why Hono was picked.

## Trade-offs

- **Ecosystem thinness is a real cost, and it shows.** There is no rate limiting (SEC-013), no request-id or structured logging (OPS-002), and no metrics (OPS-003) — all of which are drop-in middleware in the Express ecosystem and would have to be written or sourced here.
- **Error handling is framework-shaped and currently leaks.** `api/src/app.ts:58-61` returns `err.message` verbatim to unauthenticated callers (SEC-011); finding R-3 shows a malformed 58-character address surfacing `"wrong checksum for address"` as an HTTP 500 body. This is an implementation defect, not a Hono defect, but Hono's single `onError` hook is where it lives and where it must be fixed.
- **Three languages, three box-key derivations.** Choosing Node for the API guaranteed that `grant_key` would be implemented three times — Python (`contract.py:95-98`), Node (`api/src/services/algorand.ts:63-79`), browser (`web/lib/consent.ts:26-34`) — with no cross-implementation test (NFR-011, **UNVALIDATED**). The FastAPI option would have reduced this to two.
- **CI is coupled to a third party because of where the payment middleware initialises.** `npx vitest run` imports `app.ts`, which constructs the resource server, which reaches the facilitator (CI-2, R-1). A framework with lazier middleware construction would not necessarily have avoided this, but the coupling is a consequence of doing payment setup at module scope.

## Consequences

**Positive**
- FR-001, FR-002 **VALIDATED** — the 402 challenge shape is asserted in-process by `api/test/x402-flow.spec.ts` without any server harness.
- NFR-005 **VALIDATED** — `npx tsc --noEmit` passes with zero errors in `api/` (VERIFIED_FACTS §18).
- NFR-006 **IMPLEMENTED** — permissive CORS is one middleware (`api/src/app.ts:22-35`).

**Negative**
- SEC-011, SEC-013, OPS-002, OPS-003 remain **NOT IMPLEMENTED**; nothing in the chosen stack supplied them for free.
- NFR-011 **UNVALIDATED** is partly a consequence of the language split this decision locked in.

**Neutral**
- NFR-001 **IMPLEMENTED** — the service holds no session state, which is a property of the design (ADR-002), not of Hono.
- Node 20 is used consistently by CI (`.github/workflows/ci.yml:35-36`) and by both container images (`api/Dockerfile:5,13`).

## Conditions for future reconsideration

- If `@x402/hono` stops tracking `@x402/core` releases, or the project ships an adapter for a framework with better operational middleware, re-evaluate.
- If the API grows enough surface that the missing middleware (rate limiting, structured logging, tracing) becomes the dominant cost, re-evaluate against Fastify or Express with a hand-maintained payment layer.
- If NFR-011 causes a real production incident (contract and backend disagreeing on a box key), reconsider consolidating the API into Python so the derivation is shared with the contract rather than duplicated.
