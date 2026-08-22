import { x402ResourceServer } from "@x402/hono";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import {
  bazaarResourceServerExtension,
  declareDiscoveryExtension,
  type DeclareDiscoveryExtensionInput,
} from "@x402/extensions/bazaar";
import { config } from "./config.js";

const facilitatorClient = new HTTPFacilitatorClient({ url: config.facilitatorUrl });

/**
 * The Global x402 Challenge discovery tag.
 *
 * It is emitted in two places on purpose, because the protocol's canonical home
 * for it and the one GoPlausible's Bazaar actually indexes are not the same:
 *
 *  - `resource.tags` — the protocol-correct field (`RouteConfig.tags`, carried
 *    into `PaymentRequired.resource.tags`). This is what the x402 spec defines
 *    and what `sanitizeTags` in @x402/extensions validates.
 *  - `accepts[].extra.tag` — what the live facilitator's catalogue records.
 *    Measured 2026-08-22 against https://facilitator.goplausible.xyz/discovery/resources:
 *    454 of the first 500 catalogued resources carry the tag here, and **zero**
 *    carry it in `resource.tags` — that endpoint does not emit a `tags` key at
 *    all. Emitting only the protocol-correct field would mean the tag never
 *    appears in the catalogue a judge actually reads.
 *
 * See docs/05_API/Bazaar_Discovery.md for the evidence behind both.
 */
export const CHALLENGE_TAG = "x402-global-challenge";

/** `isValidServiceName` caps this at 32 printable-ASCII characters. */
const SERVICE_NAME = "MedRail";

/** `sanitizeTags` keeps the first 5 entries; the challenge tag leads deliberately. */
const SERVICE_TAGS = [CHALLENGE_TAG, "healthcare", "consent", "algorand"];

// Registered once, reused by every route's payment middleware. Only the network
// this process is configured for is registered — running against testnet does
// not accidentally accept a mainnet-signed payment or vice versa.
//
// `bazaarResourceServerExtension` is the resource-server half of the Bazaar
// discovery extension. It contributes no verify/settle hooks; its only job is
// `enrichDeclaration`, which stamps the real HTTP method (and any path params)
// onto each route's declared discovery info at request time — so the catalogue
// records `POST /v1/triage` rather than a method-less template. Registering it
// is what makes `extensions.bazaar` on a route reach the 402 response enriched
// rather than raw.
export const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(config.networkCaip2, new ExactAvmScheme())
  .registerExtension(bazaarResourceServerExtension);

/**
 * Builds one priced route's config, including its Bazaar discovery declaration.
 *
 * The discovery declaration is not decoration: it is how this service gets into
 * the facilitator's public catalogue. The chain is
 * `RouteConfig.extensions.bazaar` -> `PaymentRequired.extensions.bazaar` ->
 * (client echoes it into `PaymentPayload.extensions`) -> facilitator extracts it
 * on verify/settle and catalogues the resource. Listing is therefore a
 * consequence of a real settled payment, not a registration call.
 *
 * Declaring the extension is backward compatible with clients that know nothing
 * about it: `x402ResourceServer.validateExtensions` returns `{ valid: true }`
 * when the client omits `extensions` entirely.
 */
export function priced(usd: string, description: string, discovery: DeclareDiscoveryExtensionInput) {
  // No explicit `asset` field: both GoPlausible's TS and Python reference examples
  // omit it and let the scheme's default money parser resolve the network's
  // canonical stablecoin (USDC) from the "$x.xx" price string.
  return {
    accepts: [
      {
        scheme: "exact" as const,
        price: usd,
        network: config.networkCaip2,
        payTo: config.payToAddress,
        // Merged, not replaced: ExactAvmScheme adds the facilitator's `feePayer`
        // on top of whatever `extra` is supplied here
        // (@x402/avm/dist/esm/exact/server: `extra: { ...paymentRequirements.extra, feePayer }`).
        extra: { tag: CHALLENGE_TAG },
      },
    ],
    description,
    mimeType: "application/json",
    serviceName: SERVICE_NAME,
    tags: SERVICE_TAGS,
    extensions: declareDiscoveryExtension(discovery),
  };
}
