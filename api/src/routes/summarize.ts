import { Hono } from "hono";
import { z } from "zod";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { summarizeRecord, GeminiError } from "../services/gemini.js";

const bodySchema = z.object({
  record: z.record(z.string(), z.unknown()),
  history: z.string().max(4000).optional(),
});

export const summarizeRoute = new Hono();

// Free but rate-limited (see app.ts) — this is a convenience call for a caller
// who already holds the record (paid + consent-verified via /v1/records/summary,
// or the doctor panel's own illustrative data), not a new payable capability.
summarizeRoute.post("/v1/summarize", async (c) => {
  const parsed = bodySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "invalid request", details: parsed.error.flatten() }, 400);
  }

  try {
    const summary = await summarizeRecord(parsed.data.record, parsed.data.history);
    return c.json({ summary });
  } catch (err) {
    if (err instanceof GeminiError) {
      const status = (err.status >= 400 && err.status < 600 ? err.status : 502) as ContentfulStatusCode;
      return c.json({ error: err.message }, status);
    }
    if (err instanceof Error && err.message.startsWith("GEMINI_API_KEY")) {
      return c.json({ error: err.message }, 500);
    }
    throw err;
  }
});
