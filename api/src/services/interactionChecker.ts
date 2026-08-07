import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface InteractionPair {
  drugs: [string, string];
  severity: "moderate" | "major" | "contraindicated";
  description: string;
}

interface InteractionsData {
  source: string;
  pairs: InteractionPair[];
}

const DATA: InteractionsData = JSON.parse(readFileSync(path.join(__dirname, "..", "data", "interactions.json"), "utf-8"));

const DISCLAIMER =
  "MedRail interaction-check compares against a small, explicitly-sourced reference table of " +
  "well-documented severe interactions — it is not a comprehensive clinical database and must " +
  "never replace a pharmacist or prescriber review before making a medication decision.";

export interface InteractionCheckResult {
  flagged: boolean;
  matches: Array<{ drugs: [string, string]; severity: InteractionPair["severity"]; description: string }>;
  source: string;
  disclaimer: string;
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

export function checkInteractions(medications: string[]): InteractionCheckResult {
  const normalized = medications.map(normalize);
  const matches: InteractionCheckResult["matches"] = [];

  for (const pair of DATA.pairs) {
    const [a, b] = pair.drugs.map(normalize);
    const hasA = normalized.some((m) => m.includes(a) || a.includes(m));
    const hasB = normalized.some((m) => m.includes(b) || b.includes(m));
    if (hasA && hasB) {
      matches.push({ drugs: pair.drugs, severity: pair.severity, description: pair.description });
    }
  }

  return {
    flagged: matches.length > 0,
    matches,
    source: DATA.source,
    disclaimer: DISCLAIMER,
  };
}
