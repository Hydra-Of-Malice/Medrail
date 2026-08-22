# Bazaar Discovery

**Status: implemented.** Closes [G-17](../ENGINEERING_GAP_REPORT.md).
**Evidence gathered 2026-08-22** against the installed `@x402/extensions@2.21.0` and the live
facilitator at `https://facilitator.goplausible.xyz`.

The challenge requirement is *"Enable Bazaar discovery, tag `x402-global-challenge`"*. Before this
change `@x402/extensions` was declared in [`api/package.json:17`](../../api/package.json) and
imported nowhere. It is now imported and wired. This document records what the package actually
provides, what was done, and the one thing that still has to happen before MedRail appears in the
public catalogue.

---

## 1. What the package actually provides

`@x402/extensions` publishes the Bazaar extension as a **subpath export**, which is why a search for
`from "@x402/extensions"` alone finds nothing — the entry point is `@x402/extensions/bazaar`
(`api/node_modules/@x402/extensions/package.json:56-63`).

The complete export surface of that subpath, quoted from
`api/node_modules/@x402/extensions/dist/esm/bazaar/index.d.mts:1-4`:

```
export { k as BAZAAR, K as BazaarClientExtension, c as BodyDiscoveryExtension, B as BodyDiscoveryInfo,
  g as DeclareBodyDiscoveryExtensionConfig, i as DeclareDiscoveryExtensionConfig,
  j as DeclareDiscoveryExtensionInput, h as DeclareMcpDiscoveryExtensionConfig,
  f as DeclareQueryDiscoveryExtensionConfig, A as DiscoveredHTTPResource, C as DiscoveredMCPResource,
  E as DiscoveredResource, e as DiscoveryExtension, D as DiscoveryInfo, O as DiscoveryResource,
  P as DiscoveryResourcesResponse, L as ListDiscoveryResourcesParams, d as McpDiscoveryExtension,
  M as McpDiscoveryInfo, a as QueryDiscoveryExtension, Q as QueryDiscoveryInfo,
  S as SanitizedResourceServiceMetadata, N as SearchDiscoveryResourcesParams,
  R as SearchDiscoveryResourcesResponse, V as ValidationResult, b as bazaarResourceServerExtension,
  o as declareDiscoveryExtension, x as extractDiscoveryInfo, y as extractDiscoveryInfoFromExtension,
  F as extractDiscoveryInfoV1, H as extractResourceMetadataV1, n as isBodyExtensionConfig,
  G as isDiscoverableV1, l as isMcpExtensionConfig, m as isQueryExtensionConfig, t as isValidIconUrl,
  p as isValidRouteTemplate, r as isValidServiceName, u as sanitizeResourceServiceMetadata,
  s as sanitizeTags, z as validateAndExtract, I as validateBazaarRouteExtensions,
  v as validateDiscoveryExtension, w as validateDiscoveryExtensionSpec, q as validateRouteTemplate,
  J as withBazaar } from '../index-CarYqId7.mjs';
export { checkIfBazaarNeeded } from '@x402/core/server';
```

Sorted by who calls them:

| Export | Role | Declaration |
|---|---|---|
| `declareDiscoveryExtension(config)` | **Resource server.** Builds `{ bazaar: { info, schema } }` from a route's input/output description. | `dist/esm/index-CarYqId7.d.mts:413` |
| `bazaarResourceServerExtension` | **Resource server.** A `ResourceServerExtension` whose only hook is `enrichDeclaration` — it stamps the real HTTP method and any path params onto the declaration at request time. | `dist/esm/index-CarYqId7.d.mts:415`, implementation `dist/esm/chunk-XWKAN63N.mjs:322-397` |
| `BAZAAR` | The extension key. Literally `{ key: "bazaar" }` (`dist/esm/chunk-XWKAN63N.mjs:15`). | `dist/esm/index-CarYqId7.d.mts:314` |
| `validateDiscoveryExtension`, `validateBazaarRouteExtensions`, `sanitizeTags`, `isValidServiceName`, `isValidIconUrl`, `validateRouteTemplate` | Validators. Marked `@internal Exported for facilitator use`, but usable as self-checks. | `dist/esm/index-CarYqId7.d.mts:446-583` |
| `extractDiscoveryInfo`, `extractResourceMetadataV1`, `validateAndExtract` | **Facilitator.** Turns an observed payment into a catalogue record. | `dist/esm/index-CarYqId7.d.mts:597-722` |
| `withBazaar(client)` | **Client.** Wraps a `HTTPFacilitatorClient` with `.extensions.bazaar.listResources()` / `.search()` for *querying* the catalogue. | `dist/esm/index-CarYqId7.d.mts:927` |
| `checkIfBazaarNeeded(routes)` | Pure helper returning whether any route declares `extensions.bazaar`. Nothing in the SDK calls it; it exists for consumers. | `@x402/core/dist/esm/chunk-VKJGPEW2.mjs:35-42` |

**There is no "register my service" call.** Nothing in the package contacts a facilitator to
announce a resource. Listing is a *side effect of a payment*, described in §3.

## 2. The integration seam

Three facts made this wireable with the existing `x402ResourceServer` / `paymentMiddleware` setup:

1. **`RouteConfig` already carries the fields.** `extensions?: Record<string, unknown>` at
   `api/node_modules/@x402/core/dist/esm/x402Client-CzZlbbXy.d.mts:816`, and `serviceName` / `tags` /
   `iconUrl` at `:789-791`.
2. **`x402ResourceServer` accepts extensions.**
   `registerExtension(extension: ResourceServerExtension): this` at `…/x402Client-CzZlbbXy.d.mts:407`.
3. **The middleware already plumbs it through.** `chunk-VKJGPEW2.mjs:207-218` reads
   `routeConfig.extensions`, passes it through `enrichExtensions` (which runs the registered
   extension's `enrichDeclaration`), and hands the result to `createPaymentRequiredResponse` — so it
   lands in `PaymentRequired.extensions`. `resource.serviceName` / `tags` are assembled from the
   route config at `chunk-VKJGPEW2.mjs:195-202`.

## 3. How a resource actually gets listed

Quoting GoPlausible's own reference doc for this SDK
([`x402-avm-extensions-examples.md`](https://github.com/GoPlausible/.github/blob/main/profile/algorand-x402-documentation/typescript/x402-avm-extensions-examples.md)):

> 1. Resource server declares discovery info (input params, output format)
> 2. Discovery info is included in the `PaymentRequired` response under `extensions.bazaar`
> 3. Client copies extensions to the `PaymentPayload`
> 4. Facilitator extracts discovery info and catalogs the resource in the Bazaar

Step 3 is automatic for any `@x402/core` client —
`api/node_modules/@x402/core/dist/esm/client/index.mjs:356` merges the server's declared extensions
into the outgoing payload. Step 4 happens on verify/settle at the facilitator.

**So Bazaar listing is not a UI action and not an API registration.** It is the consequence of one
real payment being verified against a resource whose 402 carries `extensions.bazaar`. This is
directly observable in the live catalogue: every entry in
`https://facilitator.goplausible.xyz/discovery/resources` carries `settleCount`, `firstSeen` and
`lastSeen`, and 17 of the first 500 sampled have `settleCount: 0` — meaning a *verified* payment is
enough to create the record, settlement is not strictly required.

### Backward compatibility

Declaring the extension cannot break callers that have never heard of it.
`x402ResourceServer.validateExtensions` (`@x402/core/dist/esm/server/index.mjs:1031-1064`) short
circuits: *"When the client omits extensions entirely, validation passes."* A client that *does*
echo must echo the advertised `info` faithfully. Both paths are asserted in
`api/test/bazaar-discovery.spec.ts`.

## 4. Where the `x402-global-challenge` tag goes

The tag is emitted in **two** places, because the protocol's canonical field and the one this
facilitator actually indexes are not the same.

Measured 2026-08-22 over the first 500 records of
`https://facilitator.goplausible.xyz/discovery/resources`:

| Placement | Records carrying the tag |
|---|---|
| `accepts[].extra.tag` | **454 / 500** |
| `resource.tags[]` (the protocol field) | **0 / 500** |

The catalogue endpoint does not emit a `tags` key at all — a record's keys are exactly
`id, resourceUrl, method, description, mimeType, merchantId, accepts, discoveryInfo, settleCount,
firstSeen, lastSeen`. Emitting only the spec-correct field would mean the tag never appears in the
catalogue anyone actually reads. Emitting only `extra.tag` would mean not following the spec. So
MedRail emits both ([`api/src/x402.ts:31-37, 82, 88`](../../api/src/x402.ts)).

`extra` is safe to extend here: the AVM scheme *merges* rather than replaces —
`extra: { ...paymentRequirements.extra, feePayer: supportedKind.extra.feePayer }`
(`api/node_modules/@x402/avm/dist/esm/exact/server/index.mjs:86-90`) — and requirement matching uses
`objectContainsSubset(requiredExtra, acceptedExtra)`
(`@x402/core/dist/esm/server/index.mjs:1352-1361`), which a verbatim client echo satisfies.

## 5. What was implemented

- [`api/src/x402.ts:4-8`](../../api/src/x402.ts) — imports `bazaarResourceServerExtension`,
  `declareDiscoveryExtension` and the `DeclareDiscoveryExtensionInput` type from
  `@x402/extensions/bazaar`.
- [`api/src/x402.ts:50-52`](../../api/src/x402.ts) — registers the extension on the shared
  `x402ResourceServer`.
- [`api/src/x402.ts:68-91`](../../api/src/x402.ts) — `priced()` gains a third parameter, the route's
  discovery declaration, and now emits `serviceName`, `tags`, `extra.tag` and
  `extensions: declareDiscoveryExtension(...)`.
- [`api/src/app.ts:58-175`](../../api/src/app.ts) — the three priced routes each declare their real
  request and response shape. Input schemas mirror the zod schemas in the handlers; output examples
  were produced by executing the actual services, not written by hand.
- [`api/test/bazaar-discovery.spec.ts`](../../api/test/bazaar-discovery.spec.ts) — 8 regression tests.

**Prices, paths and payment behaviour are unchanged.** `$0.02 / $0.02 / $0.05` and the same three
paths; the tests pin the amounts (`20000`, `20000`, `50000`) alongside the discovery assertions.

## 6. Verification (measured, not asserted)

`npm run typecheck` exits 0. `npx vitest run` reports **93 passed** across 9 spec files, of which `bazaar-discovery.spec.ts` contributes 8.

The live 402 from `POST /v1/triage` now contains:

```jsonc
"resource": {
  "url": "http://localhost/v1/triage",
  "description": "Rule-based clinical red-flag triage score. Not medical advice.",
  "mimeType": "application/json",
  "serviceName": "MedRail",
  "tags": ["x402-global-challenge", "healthcare", "consent", "algorand"]
},
"accepts": [{
  "scheme": "exact",
  "network": "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=",
  "amount": "20000",
  "asset": "10458941",
  "maxTimeoutSeconds": 300,
  "extra": { "tag": "x402-global-challenge", "feePayer": "ZMFK2OI7…RA22AA" }
}],
"extensions": {
  "bazaar": {
    "info": {
      "input": { "type": "http", "bodyType": "json", "body": { "symptoms": "…" }, "method": "POST" },
      "output": { "type": "json", "example": { "score": 35, "band": "urgent", … } }
    },
    "schema": { … }
  }
}
```

`"method": "POST"` is the proof that `bazaarResourceServerExtension.enrichDeclaration` ran — the
method is absent at declaration time and is stamped on per request.

Each declaration was additionally checked with the package's own facilitator-side functions:
`validateDiscoveryExtension` returns `{ valid: true }` for all three routes, and
`extractDiscoveryInfo` — the function a facilitator calls to build a catalogue record — returns a
record with the right URL, `method: "POST"`, `serviceName: "MedRail"` and the challenge tag present.

## 7. What still has to happen — the remaining manual step

**MedRail is not in the catalogue yet.** Confirmed 2026-08-22: neither `medrail` nor MedRail's
`payTo` address appears anywhere in a 500-record sample of `/discovery/resources`. (Note the
endpoint's `payTo` and `tag` query parameters are silently ignored by this facilitator — passing
`payTo=NOSUCHADDRESS` still returns all 1509 records — so filter client-side.)

Only one thing is missing, and it is **not** a code change:

> **Make one paid call against a publicly reachable URL.**

The catalogue is keyed on the resource URL — record ids are base64 of `METHOD:url`. While the API is
only reachable at `http://localhost:4021`, a payment catalogues a `localhost` URL that no one else
can call. The blocker is therefore the *deployment* item already tracked in
[`COMPLIANCE.md`](../COMPLIANCE.md) and [`GO_LIVE_CHECKLIST.md`](../GO_LIVE_CHECKLIST.md), not the
discovery extension.

At submission time:

1. Deploy the API so it has a public HTTPS URL (`fly deploy -c api/fly.toml`).
2. Make one x402-paid call to any of the three priced endpoints against that public URL — the
   existing `api/scripts/agent-demo.ts` with `API_BASE` pointed at the deployed host does exactly
   this. Its client is `@x402/fetch`, which echoes the declaration automatically.
3. Confirm the listing:

   ```bash
   curl -s "https://facilitator.goplausible.xyz/discovery/resources?limit=1000" \
     | grep -o "medrail[^\"]*"
   ```

   The record should appear with `method: "POST"`, the declared `discoveryInfo`, and
   `accepts[0].extra.tag = "x402-global-challenge"`. `firstSeen` will be the timestamp of that call.

No account, form, or dashboard action is involved at any point. The Bazaar UI linked from
`https://x402.goplausible.xyz` is a *reader* of this same catalogue.

### Do not claim until step 2 is done

Until a paid call lands against a public URL, the accurate statement is: *"the Bazaar discovery
extension is implemented and the `x402-global-challenge` tag is emitted; the service is not yet
listed because it is not yet publicly deployed."* Anything stronger is not true yet.
