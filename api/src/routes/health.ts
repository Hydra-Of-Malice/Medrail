import { Hono } from "hono";
import { config } from "../config.js";
import { chainAccountHealth } from "../services/algorand.js";

export const healthRoute = new Hono();

healthRoute.get("/v1/health", (c) => {
  // Read-only and synchronous by design: liveness must not depend on algod
  // being reachable, or on how long it takes to answer. `chain` is the last
  // successful sample; `chainError` says why there is not one yet.
  const { chain, chainError } = chainAccountHealth();

  return c.json({
    ok: true,
    service: "medrail-api",
    network: config.network,
    consentAppId: config.consentAppId || null,
    chain,
    chainError,
    time: new Date().toISOString(),
  });
});
