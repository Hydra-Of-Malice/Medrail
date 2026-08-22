import { beforeEach, describe, expect, it, vi } from "vitest";
import algosdk from "algosdk";
import { recordsRoute } from "../src/routes/records.js";
import { checkAccess, logAccess } from "../src/services/algorand.js";

/**
 * Direct tests for the consent-gated record handler (G-05).
 *
 * `/v1/records/summary` is the only endpoint that is both paid *and* an
 * authorisation decision, and every one of its exits is load-bearing: two of
 * them refuse a caller, one of them degrades a chain failure into a still-paid
 * 200. None of that was exercised before — the route was reached only through
 * the 402 challenge, which never gets as far as the handler.
 *
 * The chain service is the only thing stubbed. `payerFromRequest` and the zod
 * schema stay real, so the 403 below is the production identity binding rather
 * than a test double of it.
 *
 * The handler is driven through `recordsRoute` rather than `app` deliberately:
 * going through `app` means going through the x402 middleware, which verifies
 * the payment against the live GoPlausible facilitator. That is a network call,
 * and it never reaches the handler at all without one.
 */

vi.mock("../src/services/algorand.js", () => ({
  checkAccess: vi.fn(),
  logAccess: vi.fn(),
}));

const mockedCheckAccess = vi.mocked(checkAccess);
const mockedLogAccess = vi.mocked(logAccess);

const PATH = "/v1/records/summary";
const SCOPE = "records:summary";
const AUDIT_TX_ID = "AUDITTXIDAUDITTXIDAUDITTXIDAUDITTXIDAUDITTXIDAUDITTXIDAA";

/** 58 characters, valid base32 alphabet, wrong checksum — same trick as app.spec.ts. */
const BAD_CHECKSUM = "A".repeat(58);

const REQUESTER = algosdk.generateAccount();
const PATIENT = algosdk.generateAccount().addr.toString();
const STRANGER = algosdk.generateAccount();
const PAY_TO = algosdk.generateAccount().addr.toString();

const SUGGESTED_PARAMS = {
  fee: 0,
  minFee: 1000,
  firstValid: 1,
  lastValid: 1001,
  genesisID: "testnet-v1.0",
  genesisHash: algosdk.base64ToBytes("SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI="),
};

/**
 * A genuinely signed USDC transfer wrapped in an x402 v2 AVM payload — the same
 * construction as api/test/x402Payer.spec.ts, kept local so this spec has no
 * dependency on another spec's internals.
 */
function paymentHeaderFrom(payer: algosdk.Account): string {
  const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: payer.addr,
    receiver: PAY_TO,
    amount: 50_000,
    assetIndex: 10458941,
    suggestedParams: { ...SUGGESTED_PARAMS },
  });
  const encoded = algosdk.bytesToBase64(txn.signTxn(payer.sk));
  const payload = {
    x402Version: 2,
    accepted: {},
    payload: { paymentGroup: [encoded], paymentIndex: 0 },
  };
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64");
}

async function postSummary(body: unknown, paymentHeader?: string): Promise<Response> {
  // Hono types `request` as Response | Promise<Response>; awaiting normalises it.
  return await recordsRoute.request(PATH, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(paymentHeader ? { "PAYMENT-SIGNATURE": paymentHeader } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** The body a legitimate, correctly-bound caller sends. */
const authorisedBody = { patientId: PATIENT, requesterAddress: REQUESTER.addr.toString() };

beforeEach(() => {
  vi.resetAllMocks();
  mockedCheckAccess.mockResolvedValue(true);
  mockedLogAccess.mockResolvedValue({ txId: AUDIT_TX_ID, sequence: 7n });
});

describe("POST /v1/records/summary — request validation", () => {
  it("rejects a patientId that is not a real address before touching the chain", async () => {
    const res = await postSummary({ patientId: BAD_CHECKSUM, requesterAddress: REQUESTER.addr.toString() });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details: { fieldErrors: Record<string, string[]> } };
    expect(body.error).toBe("invalid request");
    expect(body.details.fieldErrors.patientId?.join(" ")).toMatch(/checksum/i);
    // Validation is the cheapest gate there is; a malformed address must never
    // reach `decodeAddress` deep inside a chain call (SEC-010).
    expect(mockedCheckAccess).not.toHaveBeenCalled();
    expect(mockedLogAccess).not.toHaveBeenCalled();
  });

  it("rejects a requesterAddress of the wrong length", async () => {
    const res = await postSummary({ patientId: PATIENT, requesterAddress: "abc" });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { details: { fieldErrors: Record<string, string[]> } };
    expect(body.details.fieldErrors.requesterAddress?.join(" ")).toMatch(/58-character/);
  });

  it("treats an unparseable body as an empty one rather than throwing", async () => {
    // `c.req.json()` rejects on malformed JSON. Without the `.catch`, this is a
    // 500 for what is plainly a client error.
    const res = await postSummary("{not json");

    expect(res.status).toBe(400);
    const body = (await res.json()) as { details: { fieldErrors: Record<string, string[]> } };
    expect(Object.keys(body.details.fieldErrors).sort()).toEqual(["patientId", "requesterAddress"]);
  });
});

describe("POST /v1/records/summary — payer binding (G-01)", () => {
  it("refuses a requesterAddress the payer did not sign for", async () => {
    // The attack this exists to stop: grant_access transactions publish valid
    // (patient, requester) pairs to any indexer, so a stranger can pay the fee
    // and assert somebody else's authorised address.
    const res = await postSummary(
      { patientId: PATIENT, requesterAddress: REQUESTER.addr.toString() },
      paymentHeaderFrom(STRANGER),
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; requesterAddress: string; payer: string | null };
    expect(Object.keys(body).sort()).toEqual(["error", "payer", "requesterAddress"]);
    expect(body.error).toMatch(/must match the address that signed the payment/);
    expect(body.requesterAddress).toBe(REQUESTER.addr.toString());
    expect(body.payer).toBe(STRANGER.addr.toString());

    // Nothing about a forged identity may reach the patient's audit trail: the
    // whole point of the immutable log is that what is in it happened.
    expect(mockedLogAccess).not.toHaveBeenCalled();
    expect(mockedCheckAccess).not.toHaveBeenCalled();
  });

  it("refuses an unsigned request with payer: null", async () => {
    const res = await postSummary(authorisedBody);

    expect(res.status).toBe(403);
    const body = (await res.json()) as { payer: string | null };
    // Explicitly null, not absent: a caller (or a log line) must be able to
    // tell "we could not identify you" from "you are the wrong person".
    expect(body).toHaveProperty("payer", null);
    expect(mockedLogAccess).not.toHaveBeenCalled();
  });

  it("refuses an undecodable payment header rather than guessing at a payer", async () => {
    const res = await postSummary(authorisedBody, "not-base64-at-all");

    expect(res.status).toBe(403);
    const body = (await res.json()) as { payer: string | null };
    expect(body.payer).toBeNull();
    expect(mockedCheckAccess).not.toHaveBeenCalled();
  });
});

describe("POST /v1/records/summary — consent denied", () => {
  it("returns the denial shape and does not claim the caller was charged", async () => {
    mockedCheckAccess.mockResolvedValue(false);

    const res = await postSummary(authorisedBody, paymentHeaderFrom(REQUESTER));

    expect(res.status).toBe(403);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      "charged",
      "error",
      "hint",
      "patientId",
      "requesterAddress",
    ]);
    expect(body.error).toMatch(/no valid consent grant/);
    expect(body.patientId).toBe(PATIENT);
    expect(body.requesterAddress).toBe(REQUESTER.addr.toString());
    // A 403 cancels x402 settlement. Reporting anything other than false here
    // would tell the caller they had been billed for a refused request.
    expect(body.charged).toBe(false);
    expect(body.hint).toContain("/v1/consent/status");
    expect(body).not.toHaveProperty("paidButDenied");
  });

  it("records the refusal on the patient's own audit trail", async () => {
    mockedCheckAccess.mockResolvedValue(false);

    await postSummary(authorisedBody, paymentHeaderFrom(REQUESTER));

    // A denied attempt is exactly what a patient reviewing their trail wants to
    // see; dropping it would leave the log showing only successful reads.
    expect(mockedLogAccess).toHaveBeenCalledTimes(1);
    expect(mockedLogAccess).toHaveBeenCalledWith(
      PATIENT,
      REQUESTER.addr.toString(),
      SCOPE,
      PATH,
      "consent_denied",
    );
  });

  it("still returns 403 when the denial audit write fails", async () => {
    mockedCheckAccess.mockResolvedValue(false);
    mockedLogAccess.mockRejectedValue(new Error("app account is out of box MBR"));

    const res = await postSummary(authorisedBody, paymentHeaderFrom(REQUESTER));

    // An unwritable audit log must not convert a refusal into a 500 — a 500 is
    // retryable, and a caller retrying a refusal burns MedRail's chain fees.
    expect(res.status).toBe(403);
    const body = (await res.json()) as { charged: boolean };
    expect(body.charged).toBe(false);
  });
});

describe("POST /v1/records/summary — consent granted", () => {
  it("returns the record with the audit write recorded", async () => {
    const res = await postSummary(authorisedBody, paymentHeaderFrom(REQUESTER));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      patientId: string;
      requesterAddress: string;
      scope: string;
      summary: { bloodType: string };
      consentVerifiedOnChain: boolean;
      auditStatus: string;
      auditTxId: string | null;
      auditSequence: string | null;
    };

    expect(body.patientId).toBe(PATIENT);
    expect(body.requesterAddress).toBe(REQUESTER.addr.toString());
    expect(body.scope).toBe(SCOPE);
    expect(body.summary.bloodType).toBe("O+");
    expect(body.consentVerifiedOnChain).toBe(true);
    expect(body.auditStatus).toBe("recorded");
    expect(body.auditTxId).toBe(AUDIT_TX_ID);
    // Stringified, not numeric: the ABI returns a uint64 as a bigint and
    // `JSON.stringify` throws outright on one.
    expect(body.auditSequence).toBe("7");

    expect(mockedCheckAccess).toHaveBeenCalledWith(PATIENT, REQUESTER.addr.toString(), SCOPE);
    expect(mockedLogAccess).toHaveBeenCalledWith(
      PATIENT,
      REQUESTER.addr.toString(),
      SCOPE,
      PATH,
      "consent_checked",
    );
  });

  it("still serves the record when the audit write throws (never a 500)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedLogAccess.mockRejectedValue(new Error("algod 503"));

    const res = await postSummary(authorisedBody, paymentHeaderFrom(REQUESTER));

    // This is the degradation path from docs/CORRECTIONS.md C-1. The caller has
    // paid, consent was verified on chain, and the only thing that failed is a
    // follow-up write. Turning that into a 500 cancels settlement and throws
    // away a sale the caller is entitled to.
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: { bloodType: string };
      consentVerifiedOnChain: boolean;
      auditStatus: string;
      auditTxId: string | null;
      auditSequence: string | null;
    };
    expect(body.auditStatus).toBe("pending");
    expect(body.auditTxId).toBeNull();
    expect(body.auditSequence).toBeNull();
    // The consent decision itself was still made on chain, so this stays true.
    expect(body.consentVerifiedOnChain).toBe(true);
    expect(body.summary.bloodType).toBe("O+");

    // "pending" is invisible to the caller as a failure, so the operator-side
    // log is the only signal that a write was lost. It must be machine-greppable.
    expect(consoleError).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(consoleError.mock.calls[0][0] as string) as {
      level: string;
      event: string;
      endpoint: string;
      patientId: string;
      message: string;
    };
    expect(logged.level).toBe("error");
    expect(logged.event).toBe("audit_write_failed");
    expect(logged.endpoint).toBe(PATH);
    expect(logged.patientId).toBe(PATIENT);
    expect(logged.message).toBe("algod 503");

    consoleError.mockRestore();
  });

  it("logs a non-Error rejection without losing the reason", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // algosdk and node-fetch both reject with non-Error values in places, and a
    // `err.message` read on one of those would produce "undefined" in the log.
    mockedLogAccess.mockRejectedValue("gateway timeout");

    const res = await postSummary(authorisedBody, paymentHeaderFrom(REQUESTER));

    expect(res.status).toBe(200);
    const logged = JSON.parse(consoleError.mock.calls[0][0] as string) as { message: string };
    expect(logged.message).toBe("gateway timeout");

    consoleError.mockRestore();
  });
});
