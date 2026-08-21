import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { config, assertPayToConfigured } from "./config.js";

// Fail fast rather than serving 402s that advertise an empty payee.
assertPayToConfigured();

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`MedRail API listening on http://localhost:${info.port} (network: ${config.network})`);
});
