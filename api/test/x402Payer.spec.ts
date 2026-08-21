import { describe, expect, it } from "vitest";
import algosdk from "algosdk";
import type { Context } from "hono";
import { payerFromRequest } from "../src/x402Payer.js";

/**
 * Security regression tests for finding G-01.
 *
 * `/v1/records/summary` takes `requesterAddress` from the request body. Unless
 * that value is bound to the account that actually signed the payment, the
 * consent check authorises nobody: grant_access transactions publicly expose
 * valid (patient, requester) pairs to any indexer, so a stranger could pay the
 * fee, assert an authorised requester's address, and be handed the record —
 * while the forged identity is written into the patient's immutable audit log.
 *
 * These tests pin the recovery of the true payer. If they fail, that bypass is
 * back.
 */

const SUGGESTED = {
  fee: 0,
  minFee: 1000,
  firstValid: 1,
  lastValid: 1001,
  genesisID: "testnet-v1.0",
  genesisHash: algosdk.base64ToBytes("SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI="),
};

/** Builds a real signed USDC transfer and wraps it in an x402 v2 AVM payload. */
function paymentHeaderFrom(
  payer: algosdk.Account,
  receiver: string,
  opts: { extraLegs?: number } = {},
): string {
  const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: payer.addr,
    receiver,
    amount: 50000,
    assetIndex: 10458941,
    suggestedParams: { ...SUGGESTED },
  });
  const signed = txn.signTxn(payer.sk);
  const encoded = algosdk.bytesToBase64(signed);

  // Real groups include facilitator fee-payer legs; the payment is at paymentIndex.
  const filler: string[] = [];
  for (let i = 0; i < (opts.extraLegs ?? 0); i++) filler.push(encoded);

  const payload = {
    x402Version: 2,
    accepted: {},
    payload: { paymentGroup: [...filler, encoded], paymentIndex: filler.length },
  };
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64");
}

function ctx(header?: string): Context {
  return { req: { header: (name: string) => (name === "PAYMENT-SIGNATURE" ? header : undefined) } } as Context;
}

describe("payerFromRequest — binds the paying identity (G-01)", () => {
  const payer = algosdk.generateAccount();
  const receiver = algosdk.generateAccount();

  it("recovers the address that actually signed the payment", () => {
    const header = paymentHeaderFrom(payer, receiver.addr.toString());
    expect(payerFromRequest(ctx(header))).toBe(payer.addr.toString());
  });

  it("recovers the payer even when the group has facilitator fee-payer legs ahead of it", () => {
    const header = paymentHeaderFrom(payer, receiver.addr.toString(), { extraLegs: 2 });
    expect(payerFromRequest(ctx(header))).toBe(payer.addr.toString());
  });

  it("does NOT return an address a caller merely asserts", () => {
    // The attack: pay as `payer`, but claim to be an authorised third party.
    const victimRequester = algosdk.generateAccount().addr.toString();
    const header = paymentHeaderFrom(payer, receiver.addr.toString());
    const recovered = payerFromRequest(ctx(header));
    expect(recovered).not.toBe(victimRequester);
    expect(recovered).toBe(payer.addr.toString());
    // records.ts rejects with 403 when these differ — this is that comparison.
    expect(recovered === victimRequester).toBe(false);
  });

  it("returns null when no payment header is present", () => {
    expect(payerFromRequest(ctx(undefined))).toBeNull();
  });

  it("returns null (never a guess) on a malformed header", () => {
    expect(payerFromRequest(ctx("not-base64-at-all"))).toBeNull();
    expect(payerFromRequest(ctx(Buffer.from("{}", "utf-8").toString("base64")))).toBeNull();
    expect(
      payerFromRequest(
        ctx(Buffer.from(JSON.stringify({ payload: { paymentGroup: [], paymentIndex: 0 } })).toString("base64")),
      ),
    ).toBeNull();
  });

  it("returns null when paymentIndex points outside the group", () => {
    const header = Buffer.from(
      JSON.stringify({ payload: { paymentGroup: ["AAAA"], paymentIndex: 7 } }),
    ).toString("base64");
    expect(payerFromRequest(ctx(header))).toBeNull();
  });
});
