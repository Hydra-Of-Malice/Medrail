import type { Context } from "hono";
import { decodePaymentSignatureHeader } from "@x402/core/http";
import { decodeTransaction, getSenderFromTransaction } from "@x402/avm";

/**
 * The AVM `exact` scheme's v2 payload: an atomic transaction group plus the
 * index of the transaction that is the actual ASA transfer. The other legs are
 * the facilitator's fee-payer transactions, which are signed by the facilitator,
 * not the caller — so only `paymentGroup[paymentIndex]` identifies the payer.
 */
interface ExactAvmPayloadV2 {
  paymentGroup: string[];
  paymentIndex: number;
}

/**
 * Recovers the Algorand address that actually signed the payment for this
 * request, from the `PAYMENT-SIGNATURE` header the x402 middleware verified.
 *
 * This is what turns "somebody paid" into "*this* account paid", which is the
 * difference between a paywall and an authorisation check. The x402 middleware
 * proves a valid payment exists; it does not tell the handler whose it was, and
 * a handler that takes the caller's word for that is not authorising anything.
 *
 * Returns null when the header is absent or unparseable. **Callers must treat
 * null as unauthenticated** — never as trusted.
 */
export function payerFromRequest(c: Context): string | null {
  const header = c.req.header("PAYMENT-SIGNATURE");
  if (!header) return null;
  try {
    const decoded = decodePaymentSignatureHeader(header);
    const payload = decoded.payload as unknown as ExactAvmPayloadV2;
    const raw = payload?.paymentGroup?.[payload.paymentIndex];
    if (!raw) return null;
    return getSenderFromTransaction(decodeTransaction(raw), true);
  } catch {
    return null;
  }
}
