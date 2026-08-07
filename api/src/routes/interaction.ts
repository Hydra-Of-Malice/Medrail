import { Hono } from "hono";
import { z } from "zod";
import { checkInteractions } from "../services/interactionChecker.js";

const bodySchema = z.object({
  medications: z.array(z.string().min(1)).min(2).max(20),
});

export const interactionRoute = new Hono();

interactionRoute.post("/v1/interaction-check", async (c) => {
  const parsed = bodySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "invalid request — provide at least 2 medications", details: parsed.error.flatten() }, 400);
  }
  const result = checkInteractions(parsed.data.medications);
  return c.json(result);
});
