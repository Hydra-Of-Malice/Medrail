import { describe, expect, it } from "vitest";
import { validateDiscoveryExtension, extractDiscoveryInfo } from "@x402/extensions/bazaar";
import { app } from "../src/app.js";
import { resourceServer, CHALLENGE_TAG } from "../src/x402.js";

/**
 * Bazaar discovery extension (G-17).
 *
 * These tests exist because the failure mode they guard against is silent: the
 * declaration can be dropped, or drift out of sync with its own schema, without
 * any endpoint changing behaviour — the service would keep returning a perfectly
 * good 402 while quietly ceasing to be discoverable.
 */

const PRICED_ROUTES = [
  { path: "/v1/triage", body: { symptoms: "t" }, amount: "20000" },
  { path: "/v1/interaction-check", body: { medications: ["a", "b"] }, amount: "20000" },
  {
    path: "/v1/records/summary",
    body: { patientId: "x".repeat(58), requesterAddress: "y".repeat(58) },
    amount: "50000",
  },
] as const;

/** Issues an unpaid request and returns the decoded PAYMENT-REQUIRED challenge. */
async function challengeFor(path: string, body: unknown) {
  const res = await app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(402);
  const header = res.headers.get("payment-required");
  expect(header).toBeTruthy();
  return JSON.parse(Buffer.from(header!, "base64").toString("utf-8"));
}

describe("Bazaar discovery extension (G-17)", () => {
  for (const route of PRICED_ROUTES) {
    it(`${route.path} declares a schema-valid bazaar extension`, async () => {
      const challenge = await challengeFor(route.path, route.body);

      const bazaar = challenge.extensions?.bazaar;
      expect(bazaar, "no extensions.bazaar in the 402 challenge").toBeTruthy();

      // The declaration must satisfy the JSON Schema it ships with itself —
      // this is the same check the facilitator runs before cataloguing.
      const validation = validateDiscoveryExtension(bazaar);
      expect(validation.errors ?? []).toEqual([]);
      expect(validation.valid).toBe(true);

      // Proof that bazaarResourceServerExtension.enrichDeclaration actually ran:
      // `method` is absent at declaration time and is stamped on at request time.
      expect(bazaar.info.input.method).toBe("POST");
    });

    it(`${route.path} carries the ${CHALLENGE_TAG} tag and its unchanged price`, async () => {
      const challenge = await challengeFor(route.path, route.body);

      // Protocol-correct home for the tag.
      expect(challenge.resource.tags).toContain(CHALLENGE_TAG);
      // The home GoPlausible's catalogue actually records — see
      // docs/05_API/Bazaar_Discovery.md. Asserted alongside feePayer to pin the
      // merge: the AVM scheme must add feePayer without dropping our tag.
      expect(challenge.accepts[0].extra.tag).toBe(CHALLENGE_TAG);
      expect(challenge.accepts[0].extra.feePayer).toBeTruthy();

      // Declaring discovery metadata must not disturb pricing.
      expect(challenge.accepts[0].amount).toBe(route.amount);
      expect(challenge.accepts[0].scheme).toBe("exact");
    });
  }

  it("stays compatible with clients that do not echo extensions", async () => {
    const challenge = await challengeFor(PRICED_ROUTES[0].path, PRICED_ROUTES[0].body);

    // A client that echoes the declaration verbatim (what @x402/core's x402Client
    // does automatically) and one that has never heard of extensions must both
    // pass verification — otherwise declaring discovery would break paid calls.
    const echoed = {
      x402Version: 2,
      resource: challenge.resource,
      extensions: challenge.extensions,
      accepted: challenge.accepts[0],
      payload: {},
    };
    const bare = { x402Version: 2, resource: challenge.resource, accepted: challenge.accepts[0], payload: {} };

    expect(resourceServer.validateExtensions(challenge, echoed as never).valid).toBe(true);
    expect(resourceServer.validateExtensions(challenge, bare as never).valid).toBe(true);
  });

  it("yields a catalogue entry when the facilitator extracts it", async () => {
    const challenge = await challengeFor(PRICED_ROUTES[0].path, PRICED_ROUTES[0].body);
    const payload = {
      x402Version: 2,
      resource: challenge.resource,
      extensions: challenge.extensions,
      accepted: challenge.accepts[0],
      payload: {},
    };

    // extractDiscoveryInfo is the facilitator-side function that turns a payment
    // into a Bazaar catalogue record. Running it here proves the declaration is
    // catalogue-ready without registering anything anywhere.
    const discovered = extractDiscoveryInfo(payload as never, challenge.accepts[0]);
    expect(discovered).not.toBeNull();
    expect(discovered!.resourceUrl).toContain("/v1/triage");
    expect(discovered!.serviceName).toBe("MedRail");
    expect(discovered!.tags).toContain(CHALLENGE_TAG);
  });
});
