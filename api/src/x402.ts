import { x402ResourceServer } from "@x402/hono";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import { config } from "./config.js";

const facilitatorClient = new HTTPFacilitatorClient({ url: config.facilitatorUrl });

// Registered once, reused by every route's payment middleware. Only the network
// this process is configured for is registered — running against testnet does
// not accidentally accept a mainnet-signed payment or vice versa.
export const resourceServer = new x402ResourceServer(facilitatorClient).register(
  config.networkCaip2,
  new ExactAvmScheme(),
);

export function priced(usd: string, description: string) {
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
      },
    ],
    description,
    mimeType: "application/json",
  };
}
