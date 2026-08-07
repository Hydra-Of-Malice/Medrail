import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/** Minimal .env parser for contracts/.env — no extra dependency needed for a few key=value lines. */
export function dotenvLoad(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), "..", "contracts", ".env");
  if (!existsSync(envPath)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}
