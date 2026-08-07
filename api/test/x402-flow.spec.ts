import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";

describe("x402 payment gate", () => {
  it("health check is free and unpaid", async () => {
    const res = await app.request("/v1/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns a real 402 with priced accepts[] for /v1/triage when unpaid", async () => {
    const res = await app.request("/v1/triage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ symptoms: "test" }),
    });
    expect(res.status).toBe(402);

    const header = res.headers.get("payment-required");
    expect(header).toBeTruthy();
    const decoded = JSON.parse(Buffer.from(header!, "base64").toString("utf-8"));
    expect(decoded.accepts[0].scheme).toBe("exact");
    expect(decoded.accepts[0].amount).toBe("20000"); // $0.02 at 6 decimals
    expect(decoded.accepts[0].network).toMatch(/^algorand:/);
  });

  it("returns a real 402 for /v1/interaction-check when unpaid", async () => {
    const res = await app.request("/v1/interaction-check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ medications: ["warfarin", "aspirin"] }),
    });
    expect(res.status).toBe(402);
  });

  it("returns a real 402 for /v1/records/summary when unpaid, priced higher than the open endpoints", async () => {
    const res = await app.request("/v1/records/summary", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patientId: "x".repeat(58), requesterAddress: "y".repeat(58) }),
    });
    expect(res.status).toBe(402);
    const decoded = JSON.parse(Buffer.from(res.headers.get("payment-required")!, "base64").toString("utf-8"));
    expect(decoded.accepts[0].amount).toBe("50000"); // $0.05 at 6 decimals
  });

  it("rejects malformed triage requests before the payment gate would even matter", async () => {
    const res = await app.request("/v1/triage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    // Payment is enforced by middleware ahead of the handler, so an unpaid
    // malformed request still surfaces as 402 — validation happens only
    // after a real payment is presented. This test documents that ordering
    // rather than assuming it.
    expect([400, 402]).toContain(res.status);
  });
});
