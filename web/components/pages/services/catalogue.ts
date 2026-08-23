/**
 * Static, hand-verified metadata for MedRail's four documented services, used as a
 * fallback whenever the live `GET /` catalogue can't be reached, and as the source
 * for the richer copy (descriptions, worked examples, curl snippets) that the raw
 * endpoint list doesn't carry. Real method/path/price/gate should always be preferred
 * from the live fetch when available — see services/page.tsx and services/[slug]/page.tsx.
 */

export interface ServiceExample {
  /** true if this exact request/response pair is a verified transcript from a real
   * call (per the project brief); false if the values are illustrative of the shape. */
  verified: boolean;
  request: unknown;
  response: unknown;
}

export interface ServiceDefinition {
  slug: string;
  name: string;
  method: string;
  path: string;
  /** Used only if the live `GET /` fetch fails or doesn't list this path. */
  fallbackPrice: string;
  fallbackGate: string;
  shortDescription: string;
  longDescription: string;
  consentRequired: boolean;
  example: ServiceExample;
  curl: (apiBase: string) => string;
}

const MEDRAIL_PATIENT_ADDRESS = "2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE";
const EXAMPLE_REQUESTER_ADDRESS = "CCO26Y6Z56DDZ3OELO2UKJMIPJVSIT52I23F2MPMR52JBM3HQZZNUZNOR4";

export const SERVICES: ServiceDefinition[] = [
  {
    slug: "triage",
    name: "Clinical Triage",
    method: "POST",
    path: "/v1/triage",
    fallbackPrice: "$0.02",
    fallbackGate: "x402 only",
    shortDescription:
      "Scores free-text symptoms against a keyword heuristic and returns an urgency band and matched flags.",
    longDescription:
      "Takes a plain-text symptom description and runs it through a transparent keyword heuristic, returning a 0-100 urgency score, a band such as \"urgent\", and any matched clinical flags. It is a hackathon-grade heuristic, not a diagnosis - every response carries a disclaimer saying so.",
    consentRequired: false,
    example: {
      verified: true,
      request: { symptoms: "crushing chest pain radiating to left arm" },
      response: {
        score: 35,
        band: "urgent",
        matchedFlags: ["possible cardiac chest pain"],
        disclaimer:
          "MedRail triage is a transparent keyword heuristic for hackathon demonstration only. It is not a diagnosis.",
      },
    },
    curl: (apiBase) =>
      `curl -X POST ${apiBase}/v1/triage \\\n  -H "Content-Type: application/json" \\\n  -d '{"symptoms":"crushing chest pain radiating to left arm"}'`,
  },
  {
    slug: "interaction-check",
    name: "Medication Interaction Check",
    method: "POST",
    path: "/v1/interaction-check",
    fallbackPrice: "$0.02",
    fallbackGate: "x402 only",
    shortDescription:
      "Checks a list of medications against known severe interaction pairs, such as warfarin plus aspirin.",
    longDescription:
      "Takes a list of medication names and checks it against a table of widely-taught, textbook-level severe drug-interaction pairs, flagging any match with a severity and description. It is explicitly not a comprehensive clinical database and must never replace a pharmacist or prescriber review.",
    consentRequired: false,
    example: {
      verified: true,
      request: { medications: ["warfarin", "aspirin"] },
      response: {
        flagged: true,
        matches: [
          {
            drugs: ["warfarin", "aspirin"],
            severity: "major",
            description:
              "Combined anticoagulant/antiplatelet effect substantially increases bleeding risk.",
          },
        ],
        source: "Widely-taught, textbook-level severe drug-interaction pairs.",
        disclaimer:
          "Not a comprehensive clinical database and must never replace a pharmacist or prescriber review.",
      },
    },
    curl: (apiBase) =>
      `curl -X POST ${apiBase}/v1/interaction-check \\\n  -H "Content-Type: application/json" \\\n  -d '{"medications":["warfarin","aspirin"]}'`,
  },
  {
    slug: "records-summary",
    name: "Patient Record Summary",
    method: "POST",
    path: "/v1/records/summary",
    fallbackPrice: "$0.05",
    fallbackGate: "x402 + on-chain consent",
    shortDescription:
      "Returns a patient's structured record after verifying an active on-chain consent grant, and logs the access.",
    longDescription:
      "Given a patient address and a requester address, verifies on-chain that the requester holds an active MedRailConsent grant for the records:summary scope, then returns the patient's structured record (blood type, allergies, chronic conditions, current medications) and writes a log_access entry back to the same contract as an audit-trail record.",
    consentRequired: true,
    example: {
      verified: true,
      request: {
        patientId: MEDRAIL_PATIENT_ADDRESS,
        requesterAddress: EXAMPLE_REQUESTER_ADDRESS,
      },
      response: {
        patientId: MEDRAIL_PATIENT_ADDRESS,
        requesterAddress: EXAMPLE_REQUESTER_ADDRESS,
        scope: "records:summary",
        summary: {
          bloodType: "O+",
          allergies: ["penicillin"],
          chronicConditions: ["type 2 diabetes (controlled)"],
          currentMedications: ["metformin 500mg", "lisinopril 10mg"],
          lastUpdated: "2026-01-15",
        },
        consentVerifiedOnChain: true,
        auditStatus: "recorded",
        auditTxId: "<settled TestNet transaction id, unique per call>",
        auditSequence: "1",
        disclaimer:
          "Synthetic demo data for the Global x402 Challenge - no real patient information exists in this system.",
      },
    },
    curl: (apiBase) =>
      `curl -X POST ${apiBase}/v1/records/summary \\\n  -H "Content-Type: application/json" \\\n  -d '{"patientId":"${MEDRAIL_PATIENT_ADDRESS}","requesterAddress":"${EXAMPLE_REQUESTER_ADDRESS}"}'`,
  },
  {
    slug: "consent-status",
    name: "Consent Status Lookup",
    method: "GET",
    path: "/v1/consent/status",
    fallbackPrice: "free",
    fallbackGate: "none",
    shortDescription:
      "Reads whether a requester currently holds an active on-chain consent grant from a patient for a given scope.",
    longDescription:
      "A free, read-only lookup: pass a patient address, a requester address, and a scope as query parameters, and it reports whether an active MedRailConsent grant exists on-chain for that exact pair. No payment and no consent of its own is required to call it - it only reads state that is already public on TestNet.",
    consentRequired: false,
    example: {
      verified: false,
      request: {
        method: "GET",
        query: {
          patient: MEDRAIL_PATIENT_ADDRESS,
          requester: EXAMPLE_REQUESTER_ADDRESS,
          scope: "records:summary",
        },
      },
      response: {
        patient: MEDRAIL_PATIENT_ADDRESS,
        requester: EXAMPLE_REQUESTER_ADDRESS,
        scope: "records:summary",
        granted: true,
      },
    },
    curl: (apiBase) =>
      `curl "${apiBase}/v1/consent/status?patient=${MEDRAIL_PATIENT_ADDRESS}&requester=${EXAMPLE_REQUESTER_ADDRESS}&scope=records:summary"`,
  },
];

export function findService(slug: string): ServiceDefinition | undefined {
  return SERVICES.find((s) => s.slug === slug);
}
