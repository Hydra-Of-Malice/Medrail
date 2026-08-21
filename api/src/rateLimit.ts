import type { Context, Next } from "hono";

/**
 * A small in-memory fixed-window rate limiter for the *unpaid* surface.
 *
 * The priced routes are economically self-limiting — a caller must settle USDC
 * for each one — so this deliberately scopes to the free routes, which are the
 * abusable ones:
 *
 *   - `GET /v1/consent/status` performs two sequential algod calls per request,
 *     so it both exhausts this service and amplifies traffic at public AlgoNode
 *     infrastructure, at zero cost to the caller.
 *   - `POST /v1/records/summary` returns 403 when consent is absent, and a 403
 *     cancels x402 settlement — so a denied call is free to the caller while
 *     costing MedRail one Algorand transaction fee for the denial audit write.
 *     Unbounded, that drains the operator account, and an empty operator
 *     account stops `log_access` working for everyone.
 *
 * In-memory by design: a single process is the documented deployment posture
 * (see docs/08_Deployment, D-7). Behind more than one instance this becomes
 * per-instance rather than global, which is a weakening, not a failure — and
 * the same constraint already pins the audit-write lock to one machine.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number): void {
  // Amortised cleanup so the map cannot grow without bound under a spray of IPs.
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
}

function clientKey(c: Context): string {
  // Behind a proxy the first X-Forwarded-For hop is the client. This is
  // spoofable by a direct caller, which is acceptable here: the control is a
  // courtesy guard against accidental hammering and casual abuse, not a
  // security boundary. Anything stronger needs the platform's real client IP.
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-real-ip") ?? "unknown";
}

export function rateLimit(opts: { limit: number; windowMs: number; scope: string }) {
  return async (c: Context, next: Next) => {
    const now = Date.now();
    sweep(now);

    const key = `${opts.scope}:${clientKey(c)}`;
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > opts.limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      c.header("Retry-After", String(retryAfter));
      c.header("X-RateLimit-Limit", String(opts.limit));
      c.header("X-RateLimit-Remaining", "0");
      return c.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: `Too many requests. Retry in ${retryAfter}s.`,
            retryable: true,
          },
        },
        429,
      );
    }

    c.header("X-RateLimit-Limit", String(opts.limit));
    c.header("X-RateLimit-Remaining", String(Math.max(0, opts.limit - bucket.count)));
    return next();
  };
}

/** Test seam — resets all windows. */
export function __resetRateLimits(): void {
  buckets.clear();
  lastSweep = 0;
}
