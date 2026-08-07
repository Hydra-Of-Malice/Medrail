/**
 * A transparent, rule-based red-flag symptom counter — deliberately not a
 * diagnostic model. See docs/IMPLEMENTATION_PLAN.md section 4: a hackathon
 * "health triage" endpoint that reads as authoritative medical advice is a
 * real harm risk, not a demo-polish shortcut, so every response is explicit
 * about what this is and isn't.
 */

export type UrgencyBand = "routine" | "soon" | "urgent" | "emergency";

export interface TriageResult {
  score: number; // 0-100
  band: UrgencyBand;
  matchedFlags: string[];
  disclaimer: string;
}

const DISCLAIMER =
  "MedRail triage is a transparent keyword heuristic for hackathon demonstration only. " +
  "It is not a diagnosis, not a substitute for professional medical judgment, and must " +
  "never be the basis for a real care decision. If this were real and urgent, call emergency services.";

interface RedFlag {
  keywords: string[];
  weight: number;
  label: string;
}

// Deliberately small and legible rather than exhaustive: every weight here is
// inspectable and each keyword set maps to one widely-taught emergency
// warning sign (e.g. FAST for stroke, cardiac/respiratory red flags).
const RED_FLAGS: RedFlag[] = [
  { keywords: ["chest pain", "chest pressure", "crushing pain"], weight: 35, label: "possible cardiac chest pain" },
  { keywords: ["can't breathe", "cannot breathe", "difficulty breathing", "shortness of breath"], weight: 35, label: "respiratory distress" },
  { keywords: ["face drooping", "slurred speech", "one side weak", "sudden confusion"], weight: 40, label: "possible stroke (FAST signs)" },
  { keywords: ["losing consciousness", "passed out", "unresponsive", "fainted"], weight: 30, label: "loss of consciousness" },
  { keywords: ["severe bleeding", "won't stop bleeding", "heavy blood loss"], weight: 30, label: "severe bleeding" },
  { keywords: ["suicidal", "want to die", "self harm", "end my life"], weight: 45, label: "mental health crisis" },
  { keywords: ["severe allergic reaction", "throat closing", "anaphylaxis", "swelling face"], weight: 40, label: "possible anaphylaxis" },
  { keywords: ["severe abdominal pain", "worst pain of my life"], weight: 20, label: "severe pain, unclear source" },
  { keywords: ["high fever", "fever over 104", "fever over 40"], weight: 12, label: "high fever" },
  { keywords: ["persistent vomiting", "can't keep anything down"], weight: 10, label: "persistent vomiting" },
  { keywords: ["mild headache", "runny nose", "sore throat", "mild cough"], weight: 2, label: "common mild symptom" },
];

function bandFor(score: number): UrgencyBand {
  if (score >= 60) return "emergency";
  if (score >= 30) return "urgent";
  if (score >= 10) return "soon";
  return "routine";
}

export function scoreTriage(symptomText: string): TriageResult {
  const normalized = symptomText.toLowerCase();
  const matched: string[] = [];
  let score = 0;

  for (const flag of RED_FLAGS) {
    if (flag.keywords.some((kw) => normalized.includes(kw))) {
      matched.push(flag.label);
      score += flag.weight;
    }
  }

  score = Math.min(100, score);

  return {
    score,
    band: bandFor(score),
    matchedFlags: matched,
    disclaimer: DISCLAIMER,
  };
}
