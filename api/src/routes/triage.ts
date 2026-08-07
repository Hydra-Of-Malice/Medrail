import { Hono } from "hono";
import { z } from "zod";
import { scoreTriage } from "../services/triageScorer.js";

const bodySchema = z.object({
  symptoms: z.string().min(1).max(2000),
});

export const triageRoute = new Hono();

triageRoute.post("/v1/triage", async (c) => {
  const parsed = bodySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "invalid request", details: parsed.error.flatten() }, 400);
  }
  const result = scoreTriage(parsed.data.symptoms);
  return c.json(result);
});
