import { Hono } from "hono";
import { z } from "zod";
import { checkAccess, logAccess } from "../services/algorand.js";
import { payerFromRequest } from "../x402Payer.js";
import { algorandAddress } from "../validation.js";

const bodySchema = z.object({
  patientId: algorandAddress,
  requesterAddress: algorandAddress,
});

const SCOPE = "records:summary";
const ENDPOINT = "/v1/records/summary";

// There are no real patients in this system. Every "record" returned is this
// fixed synthetic object — see docs/IMPLEMENTATION_PLAN.md section 4.
const SYNTHETIC_RECORD = {
  bloodType: "O+",
  allergies: ["penicillin"],
  chronicConditions: ["type 2 diabetes (controlled)"],
  currentMedications: ["metformin 500mg", "lisinopril 10mg"],
  lastUpdated: "2026-01-15",
};

export const recordsRoute = new Hono();

recordsRoute.post(ENDPOINT, async (c) => {
  const parsed = bodySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "invalid request", details: parsed.error.flatten() }, 400);
  }
  const { patientId, requesterAddress } = parsed.data;

  // The x402 middleware proves *a* payment settled; it does not tell us whose.
  // Without this check `requesterAddress` is caller-asserted, and since
  // grant_access transactions publicly expose valid (patient, requester) pairs
  // to any indexer, anyone could pay the fee and impersonate an authorised
  // requester — and that forged identity would then be written into the
  // patient's immutable on-chain audit trail. Binding the two is what makes the
  // consent check an authorisation decision rather than a paywall.
  const payer = payerFromRequest(c);
  if (!payer || payer !== requesterAddress) {
    return c.json(
      {
        error: "requesterAddress must match the address that signed the payment",
        requesterAddress,
        payer: payer ?? null,
      },
      403,
    );
  }

  const allowed = await checkAccess(patientId, requesterAddress, SCOPE);
  if (!allowed) {
    // Logged as a denied attempt on the patient's own on-chain audit trail —
    // the fee already paid covers this on-chain verification regardless of
    // outcome, the same way a paid lookup API charges for a "not found".
    await logAccess(patientId, requesterAddress, SCOPE, ENDPOINT, "consent_denied").catch(() => undefined);
    return c.json(
      {
        error: "no valid consent grant from this patient for this requester and scope",
        patientId,
        requesterAddress,
        // A 403 cancels x402 settlement, so this call costs the caller nothing.
        // Check GET /v1/consent/status (free) before paying to avoid the round trip.
        charged: false,
        hint: "GET /v1/consent/status?patient=&requester=&scope=records:summary is free",
      },
      403,
    );
  }

  // The audit write must not be able to turn a legitimate, authorised, paid
  // request into an error. A transient chain failure here — operator out of
  // ALGO, app account short of box MBR, algod 5xx, validity-window expiry, or a
  // box-reference rejection under concurrency — would otherwise surface as a 500
  // and throw away a sale the caller is entitled to. (Settlement is cancelled on
  // any status >= 400, so the caller is never wrongly charged; what is lost is
  // the sale. See docs/CORRECTIONS.md C-1.)
  let auditTxId: string | null = null;
  let auditSequence: string | null = null;
  let auditStatus: "recorded" | "pending" = "recorded";
  try {
    const logResult = await logAccess(patientId, requesterAddress, SCOPE, ENDPOINT, "consent_checked");
    auditTxId = logResult.txId;
    auditSequence = logResult.sequence.toString();
  } catch (err) {
    auditStatus = "pending";
    console.error(
      JSON.stringify({
        level: "error",
        event: "audit_write_failed",
        endpoint: ENDPOINT,
        patientId,
        requesterAddress,
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  return c.json({
    patientId,
    requesterAddress,
    scope: SCOPE,
    summary: SYNTHETIC_RECORD,
    consentVerifiedOnChain: true,
    auditStatus,
    auditTxId,
    auditSequence,
    disclaimer: "Synthetic demo data for the Global x402 Challenge — no real patient information exists in this system.",
  });
});
