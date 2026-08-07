import { Hono } from "hono";
import { config } from "../config.js";

export const healthRoute = new Hono();

healthRoute.get("/v1/health", (c) => {
  return c.json({
    ok: true,
    service: "medrail-api",
    network: config.network,
    consentAppId: config.consentAppId || null,
    time: new Date().toISOString(),
  });
});
