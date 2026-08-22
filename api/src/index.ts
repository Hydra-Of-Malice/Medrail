import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { config, assertPayToConfigured } from "./config.js";
import { primeChainAccountHealth } from "./services/algorand.js";

// Fail fast rather than serving 402s that advertise an empty payee.
assertPayToConfigured();

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`MedRail API listening on http://localhost:${info.port} (network: ${config.network})`);
  // Warm the operator/app balance sample so the first /v1/health already has
  // one. Fire and forget — it can never delay or fail startup.
  primeChainAccountHealth();
});
