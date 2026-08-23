import { describe, expect, it, beforeEach } from "vitest";
import { app } from "../src/app.js";
import { __resetRateLimits } from "../src/rateLimit.js";

const VALID_A = "2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE";
const VALID_B = "CCO26Y6Z56DDZ3OELO2UKJMIPJVSIT52I23F2MPMR52JBM3HQZZNUZNOR4";
/** 58 characters, valid base32 alphabet, wrong checksum. */
const BAD_CHECKSUM = "A".repeat(58);

beforeEach(() => __resetRateLimits());

describe("service index (G-34)", () => {
  it("advertises every mounted route, not a stale subset", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      endpoints: Array<{ method: string; path: string }>;
    };

    const advertised = new Set(body.endpoints.map((e) => `${e.method} ${e.path}`));
    const mounted = [
      "POST /v1/triage",
      "POST /v1/interaction-check",
      "POST /v1/records/summary",
      "POST /v1/summarize",
      "GET /v1/consent/status",
      "GET /v1/consent/app-info",
      "GET /v1/consent/arc56",
      "GET /v1/health",
      "GET /",
    ];

    for (const route of mounted) {
      expect(advertised, `service index omits ${route}`).toContain(route);
    }
    expect(advertised.size).toBe(mounted.length);
  });

  it("points integrators at the ARC-56 spec and the App ID", async () => {
    const body = (await (await app.request("/")).json()) as {
      contract: { arc56SpecUrl: string; networkCaip2: string };
      x402: { version: number; scheme: string };
    };
    // These two are what a third party needs to build its own ABI client
    // without cloning this repository.
    expect(body.contract.arc56SpecUrl).toBe("/v1/consent/arc56");
    expect(body.contract.networkCaip2).toMatch(/^algorand:/);
    expect(body.x402.version).toBe(2);
    expect(body.x402.scheme).toBe("exact");
  });
});

describe("address validation (G-10 / SEC-010)", () => {
  it("rejects a 58-character address with a bad checksum as 400, not 500", async () => {
    const res = await app.request(
      `/v1/consent/status?patient=${BAD_CHECKSUM}&requester=${VALID_A}&scope=records:summary`,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { details?: { fieldErrors?: Record<string, string[]> } };
    expect(body.details?.fieldErrors?.patient?.join(" ")).toMatch(/checksum/i);
  });

  it("rejects a wrong-length address as 400", async () => {
    const res = await app.request(`/v1/consent/status?patient=abc&requester=${VALID_A}&scope=x`);
    expect(res.status).toBe(400);
  });

  it("never echoes an internal exception message to the caller (SEC-011)", async () => {
    const res = await app.request(
      `/v1/consent/status?patient=${BAD_CHECKSUM}&requester=${VALID_A}&scope=records:summary`,
    );
    const raw = await res.text();
    // The pre-fix behaviour leaked algosdk's "wrong checksum for address".
    expect(raw).not.toContain("wrong checksum for address");
  });
});

describe("rate limiting on the free/refundable surface (G-09 / SEC-013)", () => {
  it("returns 429 with Retry-After once the window is exhausted", async () => {
    const url = `/v1/consent/status?patient=${VALID_A}&requester=${VALID_B}&scope=records:summary`;

    let limited: Response | undefined;
    // Limit is 60/min; drive past it with cheap 400s so no chain call is made.
    const badUrl = `/v1/consent/status?patient=${BAD_CHECKSUM}&requester=${VALID_A}&scope=x`;
    for (let i = 0; i < 70; i++) {
      const res = await app.request(badUrl);
      if (res.status === 429) {
        limited = res;
        break;
      }
    }

    expect(limited, "expected a 429 within 70 requests").toBeDefined();
    expect(limited!.headers.get("Retry-After")).toBeTruthy();
    const body = (await limited!.json()) as { error: { code: string; retryable: boolean } };
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.retryable).toBe(true);
    void url;
  });

  it("does not throttle the health endpoint", async () => {
    for (let i = 0; i < 80; i++) {
      const res = await app.request("/v1/health");
      expect(res.status).toBe(200);
    }
  });
});
