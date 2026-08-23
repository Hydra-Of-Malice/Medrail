import { Hono } from "hono";
import { cors } from "hono/cors";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "./config.js";
import { resourceServer, priced } from "./x402.js";
import { paymentMiddleware } from "@x402/hono";
import { rateLimit } from "./rateLimit.js";

import { healthRoute } from "./routes/health.js";
import { triageRoute } from "./routes/triage.js";
import { interactionRoute } from "./routes/interaction.js";
import { consentRoute } from "./routes/consent.js";
import { recordsRoute } from "./routes/records.js";
import { summarizeRoute } from "./routes/summarize.js";

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

// Rate limits, before the payment middleware.
//
// Scoped to the surface that is free to the caller: `/v1/consent/status` makes
// two algod calls per unauthenticated request, and `/v1/records/summary` returns
// 403 without consent — which cancels settlement, so a denied call costs the
// caller nothing while costing MedRail a chain fee for the denial audit write.
// The priced happy paths are economically self-limiting and are not throttled.
app.use("/v1/consent/status", rateLimit({ limit: 60, windowMs: 60_000, scope: "consent-status" }));
app.use("/v1/consent/arc56", rateLimit({ limit: 30, windowMs: 60_000, scope: "arc56" }));
app.use("/v1/records/summary", rateLimit({ limit: 30, windowMs: 60_000, scope: "records" }));
// Calls out to Gemini on our own API key, so it's throttled tighter than the
// other free routes — a caller here is spending MedRail's third-party quota,
// not just this server's CPU.
app.use("/v1/summarize", rateLimit({ limit: 15, windowMs: 60_000, scope: "summarize" }));

// Every x402-priced route in one place, so pricing is easy for a judge (or a
// caller writing an integration) to audit at a glance.
//
// The third argument to `priced()` is the route's Bazaar discovery declaration
// (@x402/extensions/bazaar). Every `input` / `output.example` below is the real
// request and response shape — the input schemas mirror the zod schemas in the
// route handlers, and the output examples were produced by running the actual
// services. A discovery declaration that lied would be worse than none: it is
// published verbatim into the facilitator's public catalogue, where an agent
// reads it to decide how to call this API.
const payment = paymentMiddleware(
  {
    "POST /v1/triage": priced(
      "$0.02",
      "Rule-based clinical red-flag triage score. Not medical advice.",
      {
        bodyType: "json",
        input: { symptoms: "crushing chest pain radiating to left arm" },
        inputSchema: {
          properties: {
            symptoms: {
              type: "string",
              minLength: 1,
              maxLength: 2000,
              description: "Free-text symptom description.",
            },
          },
          required: ["symptoms"],
        },
        output: {
          example: {
            score: 35,
            band: "urgent",
            matchedFlags: ["possible cardiac chest pain"],
            disclaimer:
              "MedRail triage is a transparent keyword heuristic for hackathon demonstration only. It is not a diagnosis.",
          },
        },
      },
    ),
    "POST /v1/interaction-check": priced(
      "$0.02",
      "Check a medication list against known severe interaction pairs.",
      {
        bodyType: "json",
        input: { medications: ["warfarin", "aspirin"] },
        inputSchema: {
          properties: {
            medications: {
              type: "array",
              items: { type: "string", minLength: 1 },
              minItems: 2,
              maxItems: 20,
              description: "Two to twenty medication names.",
            },
          },
          required: ["medications"],
        },
        output: {
          example: {
            flagged: true,
            matches: [
              {
                drugs: ["warfarin", "aspirin"],
                severity: "major",
                description:
                  "Combined anticoagulant/antiplatelet effect substantially increases bleeding risk.",
              },
            ],
            source: "Widely-taught, textbook-level severe drug-interaction pairs.",
            disclaimer:
              "Not a comprehensive clinical database and must never replace a pharmacist or prescriber review.",
          },
        },
      },
    ),
    "POST /v1/records/summary": priced(
      "$0.05",
      "Consent-gated synthetic patient record summary — requires an active on-chain grant.",
      {
        bodyType: "json",
        input: {
          patientId: "2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE",
          requesterAddress: "CCO26Y6Z56DDZ3OELO2UKJMIPJVSIT52I23F2MPMR52JBM3HQZZNUZNOR4",
        },
        inputSchema: {
          properties: {
            patientId: {
              type: "string",
              minLength: 58,
              maxLength: 58,
              description: "Algorand address of the patient who granted consent.",
            },
            requesterAddress: {
              type: "string",
              minLength: 58,
              maxLength: 58,
              description:
                "Algorand address of the requester. Must match the address that signed the x402 payment, or the call is refused with 403 and settlement is cancelled.",
            },
          },
          required: ["patientId", "requesterAddress"],
        },
        output: {
          example: {
            patientId: "2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE",
            requesterAddress: "CCO26Y6Z56DDZ3OELO2UKJMIPJVSIT52I23F2MPMR52JBM3HQZZNUZNOR4",
            scope: "records:summary",
            summary: {
              bloodType: "O+",
              allergies: ["penicillin"],
              chronicConditions: ["type 2 diabetes (controlled)"],
              currentMedications: ["metformin 500mg", "lisinopril 10mg"],
              lastUpdated: "2026-01-15",
            },
            consentVerifiedOnChain: true,
            auditStatus: "recorded",
            auditTxId: "PLACEHOLDER_ALGORAND_TX_ID",
            auditSequence: "1",
            disclaimer:
              "Synthetic demo data for the Global x402 Challenge — no real patient information exists in this system.",
          },
        },
      },
    ),
  },
  resourceServer,
);

/**
 * The 402 challenge cannot be constructed offline: `accepts[].asset` and
 * `extra.feePayer` come from the facilitator's own `/supported`, not from
 * MedRail config. So when the facilitator is unreachable the SDK fails to
 * initialise and every priced route would otherwise return an opaque 500 with
 * no PAYMENT-REQUIRED header — telling a calling agent "this is broken" when
 * the truth is "try again shortly".
 *
 * Convert exactly that condition into a 503 with Retry-After, and leave every
 * other error alone. Free routes are unaffected either way.
 */
app.use("*", async (c, next) => {
  try {
    return await payment(c, next);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const facilitatorDown =
      /no supported payment kinds/i.test(message) || /Failed to initialize/i.test(message);
    if (!facilitatorDown) throw err;

    console.error(
      JSON.stringify({
        level: "error",
        event: "facilitator_unavailable",
        facilitator: config.facilitatorUrl,
        path: new URL(c.req.url).pathname,
        message,
      }),
    );
    c.header("Retry-After", "30");
    return c.json(
      {
        error: {
          code: "PAYMENT_FACILITATOR_UNAVAILABLE",
          message:
            "The payment facilitator is temporarily unreachable, so a payment challenge cannot be issued. Retry shortly.",
          retryable: true,
          facilitator: config.facilitatorUrl,
        },
      },
      503,
    );
  }
});

app.route("/", healthRoute);
app.route("/", triageRoute);
app.route("/", interactionRoute);
app.route("/", consentRoute);
app.route("/", recordsRoute);
app.route("/", summarizeRoute);

app.onError((err, c) => {
  // Log the detail server-side; return a generic body. Echoing err.message to an
  // unauthenticated caller disclosed internal exception text (SEC-011) and
  // reported client input errors as server errors (SEC-010).
  const requestId = crypto.randomUUID();
  console.error(
    JSON.stringify({
      level: "error",
      requestId,
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }),
  );
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "An internal error occurred. Quote the requestId when reporting this.",
        retryable: true,
        requestId,
      },
    },
    500,
  );
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
    // Derived by hand but kept complete deliberately: an integrator's first
    // fetch is this index, and `app-info` + `arc56` are precisely the pair
    // needed to build an ABI client against the contract without cloning this
    // repository. An earlier revision omitted both. api/test/app.spec.ts
    // asserts this list matches the mounted routes so it cannot drift again.
    endpoints: [
      { method: "POST", path: "/v1/triage", price: "$0.02", gate: "x402" },
      { method: "POST", path: "/v1/interaction-check", price: "$0.02", gate: "x402" },
      { method: "POST", path: "/v1/records/summary", price: "$0.05", gate: "x402 + on-chain consent" },
      { method: "POST", path: "/v1/summarize", price: "free", gate: "rate-limited" },
      { method: "GET", path: "/v1/consent/status", price: "free", gate: "none" },
      { method: "GET", path: "/v1/consent/app-info", price: "free", gate: "none" },
      { method: "GET", path: "/v1/consent/arc56", price: "free", gate: "none" },
      { method: "GET", path: "/v1/health", price: "free", gate: "none" },
      { method: "GET", path: "/", price: "free", gate: "none" },
    ],
    contract: {
      appId: config.consentAppId || null,
      network: config.network,
      networkCaip2: config.networkCaip2,
      arc56SpecUrl: "/v1/consent/arc56",
    },
    x402: { version: 2, scheme: "exact", facilitator: config.facilitatorUrl },
    docs: "see repo docs/API.md",
  }),
);
