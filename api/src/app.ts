import { Hono } from "hono";
import { cors } from "hono/cors";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resourceServer, priced } from "./x402.js";
import { paymentMiddleware } from "@x402/hono";

import { healthRoute } from "./routes/health.js";
import { triageRoute } from "./routes/triage.js";
import { interactionRoute } from "./routes/interaction.js";
import { consentRoute } from "./routes/consent.js";
import { recordsRoute } from "./routes/records.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    // No fixed allowHeaders list: Hono reflects whatever the browser's own
    // preflight actually requests (Access-Control-Request-Headers) when this
    // is left unset, which is what a payment-signing client needs — a
    // hand-maintained allowlist here previously drifted out of sync with
    // what @x402/fetch's browser client actually sends and broke every paid
    // call from the frontend with a CORS preflight failure.
    exposeHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE"],
  }),
);

// Every x402-priced route in one place, so pricing is easy for a judge (or a
// caller writing an integration) to audit at a glance.
app.use(
  "*",
  paymentMiddleware(
    {
      "POST /v1/triage": priced("$0.02", "Rule-based clinical red-flag triage score. Not medical advice."),
      "POST /v1/interaction-check": priced("$0.02", "Check a medication list against known severe interaction pairs."),
      "POST /v1/records/summary": priced(
        "$0.05",
        "Consent-gated synthetic patient record summary — requires an active on-chain grant.",
      ),
    },
    resourceServer,
  ),
);

app.route("/", healthRoute);
app.route("/", triageRoute);
app.route("/", interactionRoute);
app.route("/", consentRoute);
app.route("/", recordsRoute);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || "internal error" }, 500);
});

app.get("/v1/consent/arc56", (c) => {
  const specPath = path.resolve(__dirname, "..", "..", "contracts", "artifacts", "MedRailConsent.arc56.json");
  if (!existsSync(specPath)) {
    return c.json({ error: "ARC-56 spec not found — has the contract been compiled?" }, 404);
  }
  return c.json(JSON.parse(readFileSync(specPath, "utf-8")));
});

app.get("/", (c) =>
  c.json({
    service: "MedRail",
    description: "Patient-consented health data layer under x402-paid AI intelligence endpoints, on Algorand.",
    endpoints: [
      "POST /v1/triage",
      "POST /v1/interaction-check",
      "POST /v1/records/summary",
      "GET /v1/consent/status",
      "GET /v1/health",
    ],
    docs: "see repo docs/API.md",
  }),
);
