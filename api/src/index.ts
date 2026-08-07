import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { config } from "./config.js";

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`MedRail API listening on http://localhost:${info.port} (network: ${config.network})`);
});
