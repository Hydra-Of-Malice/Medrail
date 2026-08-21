import { Hono } from "hono";
import { z } from "zod";
import { checkAccess } from "../services/algorand.js";
import { config } from "../config.js";
import { algorandAddress } from "../validation.js";

const querySchema = z.object({
  patient: algorandAddress,
  requester: algorandAddress,
  scope: z.string().min(1).max(128),
});

export const consentRoute = new Hono();

// Free, unpaid, read-only — consent status is the patient's own state, not a
// service worth gating behind payment. Actual grant/revoke transactions are
// signed by the patient/requester's own wallet directly against Algorand
// (see web/lib/consent.ts) — this backend never holds or proxies a patient's
// signing key.
consentRoute.get("/v1/consent/status", async (c) => {
  const parsed = querySchema.safeParse({
    patient: c.req.query("patient"),
    requester: c.req.query("requester"),
    scope: c.req.query("scope"),
  });
  if (!parsed.success) {
    return c.json({ error: "invalid query — expected ?patient=&requester=&scope=", details: parsed.error.flatten() }, 400);
  }
  const { patient, requester, scope } = parsed.data;
  const granted = await checkAccess(patient, requester, scope);
  return c.json({ patient, requester, scope, granted });
});

consentRoute.get("/v1/consent/app-info", (c) => {
  return c.json({
    network: config.network,
    networkCaip2: config.networkCaip2,
    consentAppId: config.consentAppId || null,
    arc56SpecUrl: "/v1/consent/arc56",
  });
});
