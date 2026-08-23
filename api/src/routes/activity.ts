import { Hono } from "hono";
import { listActivity } from "../services/activityLog.js";

export const activityRoute = new Hono();

// Free, unpaid, read-only — same posture as /v1/consent/status. sinceServerStart
// is load-bearing: the frontend must not present this as complete history.
activityRoute.get("/v1/activity", (c) => {
  return c.json({ entries: listActivity(), sinceServerStart: true });
});
