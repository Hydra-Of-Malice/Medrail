import { Hono } from "hono";
import { z } from "zod";
import { checkAccess, logAccess } from "../services/algorand.js";

const bodySchema = z.object({
  patientId: z.string().length(58),
  requesterAddress: z.string().length(58),
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
        paidButDenied: true,
      },
      403,
    );
  }

  const logResult = await logAccess(patientId, requesterAddress, SCOPE, ENDPOINT, "consent_checked");

  return c.json({
    patientId,
    requesterAddress,
    scope: SCOPE,
    summary: SYNTHETIC_RECORD,
    consentVerifiedOnChain: true,
    auditTxId: logResult.txId,
    auditSequence: logResult.sequence.toString(),
    disclaimer: "Synthetic demo data for the Global x402 Challenge — no real patient information exists in this system.",
  });
});
