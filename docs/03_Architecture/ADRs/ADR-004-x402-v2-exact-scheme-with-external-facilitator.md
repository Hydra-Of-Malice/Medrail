# ADR-004: x402 v2 `exact` scheme with an external facilitator (GoPlausible)

**Status:** Accepted
**Date:** Not recorded as a decision date. The facilitator was verified live on 2026-08-07 (`docs/IMPLEMENTATION_PLAN.md:18, 23-24`); `api/src/x402.ts` first appears in commit `d2a5f7f`, 2026-08-07.
**Deciders:** Not recorded in repository
**Evidence:** `api/src/x402.ts:1-32`; `api/src/app.ts:37-50`; `api/src/config.ts:8-19, 47`; `docs/IMPLEMENTATION_PLAN.md:20-35`; `docs/ARCHITECTURE.md:110-128`; `docs/SECURITY.md:84-87`; settled payment `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ`

## Context

x402 splits a paid HTTP call into three roles: the **client** signs a payment, the **resource server** decides the price and gates the response, and the **facilitator** verifies and settles the payment on-chain. MedRail is the resource server. Someone has to be the facilitator.

The Algorand Foundation's Global x402 Challenge has a designated AVM facilitator, GoPlausible at `https://facilitator.goplausible.xyz`, which `docs/IMPLEMENTATION_PLAN.md:23-24` records as having been checked live (`GET /supported` → 200) rather than assumed: it supports both Algorand CAIP-2 networks, scheme `exact`, x402Version 2, with fee sponsorship on both.

## Problem

Should MedRail delegate payment verification and settlement to the external facilitator, run its own, or verify settlement itself against algod?

## Options considered

| Option | Pros | Cons | Why rejected |
|---|---|---|---|
| **External facilitator (GoPlausible), `exact` scheme, x402 v2** (chosen) | The challenge's designated AVM facilitator, so callers' generic clients already work against it. Supplies **fee sponsorship**: `extra.feePayer = ZMFK2OI7ZBD2U27ISERZC4S6LKM6WMFJPZQ4MYNJDZ2VNBNMBA67RA22AA`, so a caller needs USDC but **not** ALGO. Zero settlement infrastructure for MedRail. Integration is `new HTTPFacilitatorClient({url})` plus one `register()` call (`api/src/x402.ts:6-14`). | MedRail's priced endpoints inherit the facilitator's availability. MedRail trusts its settlement verdict without independent confirmation. MedRail cannot construct a 402 offline (see below). | — |
| **Self-hosted facilitator** | Removes the third-party availability dependency and the trust delegation. Full control of settlement policy. | MedRail would have to hold and fund the fee-sponsor account, run a settlement service, and handle its failure modes — reintroducing exactly the infrastructure ADR-002 excludes. Callers built against the challenge's facilitator would need reconfiguration. Availability risk is not removed, only moved onto a team with no operations coverage (OPS-002…OPS-005 all **NOT IMPLEMENTED**). | Strictly more operational burden for a hackathon-scope submission, and worse for callers. |
| **No facilitator — verify settlement directly against algod** | No third-party dependency at all. MedRail could confirm the settled transaction itself. | The `exact` AVM scheme's client-side signing, group construction and fee sponsorship all assume a facilitator; there is no fee-sponsor account without one, so callers would need ALGO as well as USDC. MedRail would be hand-implementing the protocol's most security-critical half — the exact failure mode `docs/IMPLEMENTATION_PLAN.md:35` names as the project's top risk. | Highest risk, worst caller experience, and diverges from the protocol other entrants implement. |
| **Non-x402 payment (API keys + invoicing)** | Conventional, well-understood, no chain dependency on the payment path. | Disqualifying: the submission is to an x402 challenge (VERIFIED_FACTS §16, per `docs/COMPLIANCE.md`). Also requires accounts, billing and per-caller state, contradicting NFR-001. | Out of scope by definition. |
| **Multiple facilitators with failover** | Would mitigate the availability coupling directly. | No second Algorand x402 facilitator is evidenced anywhere in this repo. `HTTPFacilitatorClient` is constructed with a single `url` (`api/src/x402.ts:6`). | Nothing to fail over to; not an available option today. |

## Decision

Register a single `HTTPFacilitatorClient` pointed at `config.facilitatorUrl` (default `https://facilitator.goplausible.xyz`, `api/src/config.ts:47`), and register `ExactAvmScheme` against **only** the CAIP-2 network this process is configured for (`api/src/x402.ts:11-14`). Apply `paymentMiddleware` to exactly three routes with prices declared in one place (`api/src/app.ts:37-50`).

## Rationale

### This rationale is recorded in the implementation

Four separate recorded pieces:

1. **Facilitator selection and fee sponsorship** — `docs/ARCHITECTURE.md:115-118`:
   > "Facilitator: `https://facilitator.goplausible.xyz` (GoPlausible, Algorand Foundation's chosen AVM facilitator for this challenge). Confirmed live, supports both Algorand networks, sponsors network fees (a `feePayer` address settles gas so callers need only hold USDC, not ALGO — lowering the barrier for other builders' agents to call MedRail)."

2. **Single-network registration is deliberate** — `api/src/x402.ts:9-10`:
   > "Only the network this process is configured for is registered — running against testnet does not accidentally accept a mainnet-signed payment or vice versa."

   This is NFR-002 and it is a real control, not incidental.

3. **No explicit `asset` field is deliberate** — `api/src/x402.ts:17-19`:
   > "No explicit `asset` field: both GoPlausible's TS and Python reference examples omit it and let the scheme's default money parser resolve the network's canonical stablecoin (USDC) from the '$x.xx' price string."

   `docs/ARCHITECTURE.md:125-128` records the same: prices are plain USD strings and "no asset ID is hardcoded in the route config." Note that `api/src/config.ts:15-19` *does* carry a `USDC_ASA_ID` map — it exists as configuration but is not what populates the 402.

4. **The trust model is recorded and correctly framed** — `docs/SECURITY.md:84-87`:
   > "The API trusts the facilitator's settlement result as the source of truth for 'was this paid.' It does not independently re-verify the settled transaction against algod before responding — matching the standard x402 trust model (the facilitator is explicitly the component responsible for verify+settle), not a shortcut specific to this build."

   That framing is accurate and should be kept. It is a delegation, not a vulnerability. It is still a residual risk: the facilitator is authoritative for the only question that decides whether a caller gets billed and served.

No reconstruction is required for the decision itself. The *consequences* below include reviewer findings that the repository does not record.

## Trade-offs

**1. Availability coupling — finding R-1 (HIGH). This is blunt: a facilitator outage turns every priced route into HTTP 500.**

Reproduced by the reviewer. With `FACILITATOR_URL` pointed at a closed port, the first request to a priced route fails inside `x402ResourceServer.initialize()` with `"Failed to initialize: no supported payment kinds loaded from any facilitator."` The client receives **HTTP 500 with no `PAYMENT-REQUIRED` header** — not a 402, not a 503, no `Retry-After`. There is no timeout, no retry, no circuit breaker and no cached-`/supported` fallback.

The root cause is a direct consequence of recorded decision (3) above, and this is the sharp point of this ADR: **`accepts[].asset` and `extra.feePayer` are not in MedRail's configuration — they come from the facilitator's `/supported` at startup.** Omitting `asset` is defensible SDK-compatibility reasoning, and it is what the reference implementations do. It is *also* the reason MedRail cannot construct a 402 challenge offline. A resource server that hard-coded the asset id it already has in `config.ts:15-19` could at least emit a correct 402 while the facilitator is down, and fail only at settle time.

Blast radius is bounded and this is worth crediting: the reviewer verified `/v1/health`, `/`, and `/v1/consent/app-info` all still return 200 with the facilitator down (REL-005 **VALIDATED**). Only the three priced endpoints break.

The same mechanism is why the API test suite is not hermetic: `api/test/x402-flow.spec.ts` imports `app.ts`, which initialises the resource server, which reaches the facilitator. CI depends on a third-party service being reachable from a GitHub runner (**CI-2**), and a facilitator outage produces a red build with a misleading failure message.

**2. Trust delegation is unverified downstream.** The API never confirms the settled transaction against algod. If the facilitator returned a false positive, MedRail would serve the resource and — on the gated route — write an audit entry attesting to a paid access that did not happen. The counter-argument recorded in `docs/SECURITY.md:84-87` is correct as far as it goes: this is the protocol's design, and re-verifying would partly defeat the point of having a facilitator. It remains residual risk that should be listed, not inflated.

**3. The payment proves *a* payment, not *whose*.** This is the hinge for finding **S-1 (CRITICAL)**. The middleware establishes that a settled payment exists for this request; it does not surface the payer's identity to the handler, and `api/src/routes/records.ts:5-8, 32` reads `requesterAddress` from the request body instead. Since grants are public on Algorand, an attacker can read a real `(patient, requester)` pair off the indexer, pay the ordinary $0.05, and assert someone else's requester address — `check_access` returns true because that grant genuinely exists. **SEC-006 is PARTIALLY IMPLEMENTED — DEFEATED. SEC-007 and FR-039 are NOT IMPLEMENTED.** The fix lives at this layer: `@x402/core/http` exports `decodePaymentSignatureHeader` and `@x402/avm` exports `getSenderFromTransaction`; alternatively `@x402/hono`'s `ProtectedRequestHook` (`.onProtectedRequest(...)`) can stash the verified payer on the Hono context. See ADR-008 and the security documentation.

**4. Price is expressed in USD, not in asset units.** `priced("$0.02", …)` delegates unit resolution to the SDK's money parser. Verified correct in production: the live 402 advertises `"amount":"20000"` and `"asset":"10458941"`, and the settled transfer moved exactly 20000 base units. The cost is that MedRail cannot see or assert the resolved asset before the facilitator answers — the same coupling as (1).

**5. One payment exists, and it is a self-payment.** Transaction `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ` is a genuine, facilitator-settled, fee-sponsored (`fee: 0`) x402 payment in group `XQzhbjBAqt0AjC5AByQsCxGbMdEuca3ZZFMyFBTb7K4=`, confirmed at round 66091768, with note `x402-payment-v2-1786140083822`. Its sender and receiver are both `2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE` — the deployer paid itself, disclosed in `docs/PROOF.md` §6. It proves the flow end to end. It is not payment volume, and this ADR does not claim any.

**6. The `@x402/extensions` dependency is declared but never imported.** Verified: zero references in `api/src/`, `api/scripts/`, `web/lib/`, `web/components/`. `docs/COMPLIANCE.md`'s claim that the backend "correctly implements Bazaar's discovery-extension schema" is not supported by code — the route metadata (`api/src/app.ts:41-46`, `api/src/x402.ts:20-31`) is well-shaped and self-describing, but nothing implements the extension. Downgrade to **PARTIALLY IMPLEMENTED / unused dependency** (DOC-9).

## Consequences

**Positive**
- FR-001, FR-002, FR-003 **VALIDATED** — 402 shape asserted by test, settlement proven by a real on-chain transaction.
- NFR-002 **IMPLEMENTED** — cross-network payment confusion is structurally prevented.
- NFR-012 **IMPLEMENTED** — TestNet/MainNet is a `NETWORK` env change with no code edit (`api/src/config.ts:8-29, 42`).
- REL-005 **VALIDATED** — free endpoints survive a facilitator outage.
- Callers need USDC but not ALGO, which materially lowers the barrier for other teams' agents.

**Negative**
- REL-001 **IMPLEMENTED** — the payment middleware is wrapped so a facilitator-initialisation failure returns **503 + `Retry-After: 30`** with a stable `PAYMENT_FACILITATOR_UNAVAILABLE` code (`api/src/app.ts`). Free routes are unaffected. A cached-`/supported` fallback that would let the 402 itself be served offline remains future work.
- SEC-007, FR-039 **NOT IMPLEMENTED**; SEC-006 **DEFEATED** — finding S-1.
- OPS-006 is further damaged by CI-2: even once the branch trigger is fixed (CI-1), the pipeline can go red for reasons unrelated to the change.
- DOC-9 — an unused dependency underwrites a documentation claim it does not support.

**Neutral**
- PERF-001 **IMPLEMENTED** — `/supported` is fetched once at initialise and cached, so a warm 402 needs no outbound call (reviewer measured ~15 ms warm, single observation). This is the upside of the same startup-fetch that causes R-1.

## Conditions for future reconsideration

- **Immediately, before submission:** implement payer binding (SEC-007/FR-039). It is roughly 10–15 lines plus a test using APIs already present in the installed SDK, and it is the highest value-per-line change available.
- **Cache the facilitator's `/supported` response and fall back to it**, or hard-code the asset id already sitting in `api/src/config.ts:15-19`, so a facilitator outage yields a correct 402 or an honest 503 rather than a 500 (closes REL-001).
- **Make the test suite hermetic** — stub the facilitator client in `api/test/x402-flow.spec.ts` so CI-2 stops coupling the build to a third party. Keep one clearly-labelled live smoke test outside the default run.
- **If a second Algorand facilitator appears**, reconsider multi-facilitator registration for availability.
- **If settlement disputes ever have real money at stake**, reconsider independent post-settlement confirmation against algod — accepting that it costs a round-trip on every paid call.
