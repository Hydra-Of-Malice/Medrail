/**
 * Demo pre-flight. Run this before you record anything.
 *
 * Every check here corresponds to something that has actually failed during
 * development, and each one fails *quietly* in the demo: an unfunded operator
 * turns a 200 into `auditStatus: "pending"` with no error, a missing consent
 * grant turns the flagship run into a polite decline, and an unreachable
 * facilitator turns every priced route into a 503. None of those look like
 * infrastructure problems on camera — they look like the product not working.
 *
 * Usage:
 *   npx tsx scripts/preflight.ts
 *   API_BASE=https://medrail-api.fly.dev npx tsx scripts/preflight.ts
 *
 * Exit code 0 = ready. 1 = at least one blocking check failed.
 */
import "dotenv/config"; // api/.env — AGENT_MNEMONIC, PATIENT_ADDRESS
import algosdk from "algosdk";
import { dotenvLoad } from "./dotenvLoad.js";

const env = dotenvLoad();
const API_BASE = process.env.API_BASE ?? "http://localhost:4021";
const ALGOD_URL = process.env.ALGOD_URL ?? "https://testnet-api.algonode.cloud";
const USDC_ASA = 10458941;
const SCOPE = "records:summary";

const algod = new algosdk.Algodv2("", ALGOD_URL, "");

type Level = "ok" | "warn" | "fail";
const results: Array<{ level: Level; label: string; detail: string }> = [];
const record = (level: Level, label: string, detail: string) => {
  const mark = level === "ok" ? "PASS" : level === "warn" ? "WARN" : "FAIL";
  console.log(`  [${mark}] ${label.padEnd(34)} ${detail}`);
  results.push({ level, label, detail });
};

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

interface Health {
  ok: boolean;
  network: string;
  consentAppId: number | null;
  chain: {
    operatorAddress: string;
    operatorSpendableMicroAlgo: number;
    appAccountSpendableMicroAlgo: number | null;
    estimatedAuditWritesRemaining: number;
    warning: string | null;
  } | null;
  chainError: string | null;
}

async function main() {
  console.log(`\nMedRail demo pre-flight — ${API_BASE}\n`);

  // 1. The service is up and pointed at the right contract.
  let health: Health;
  try {
    health = await json<Health>(`${API_BASE}/v1/health`);
  } catch (e) {
    record("fail", "API reachable", `${API_BASE} — ${(e as Error).message}. Start it: npm run dev`);
    return finish();
  }
  record(health.ok ? "ok" : "fail", "API reachable", `${health.network}`);
  record(
    health.consentAppId ? "ok" : "fail",
    "Consent contract configured",
    health.consentAppId ? `App ${health.consentAppId}` : "CONSENT_APP_ID is not set",
  );

  // 2. The two accounts that pay for the audit trail. This is the check that
  //    matters most, because running dry is invisible from the response.
  if (health.chain) {
    const c = health.chain;
    record(
      c.warning ? "warn" : "ok",
      "Audit trail affordable",
      `~${c.estimatedAuditWritesRemaining} writes left` +
        ` (operator ${c.operatorSpendableMicroAlgo} µALGO, app ${c.appAccountSpendableMicroAlgo ?? "?"} µALGO)` +
        (c.warning ? ` — ${c.warning}` : ""),
    );
  } else {
    record("warn", "Audit trail affordable", `no sample yet: ${health.chainError ?? "unknown"}`);
  }

  // 3. The service index — what an agent reads first, and what the demo opens on.
  try {
    const index = await json<{ endpoints: unknown[]; x402: { facilitator: string } }>(`${API_BASE}/`);
    record("ok", "Service index", `${index.endpoints.length} endpoints advertised`);
    const supported = await fetch(`${index.x402.facilitator}/supported`);
    record(
      supported.ok ? "ok" : "fail",
      "Facilitator reachable",
      supported.ok ? index.x402.facilitator : `HTTP ${supported.status} — priced routes will return 503`,
    );
  } catch (e) {
    record("fail", "Service index", (e as Error).message);
  }

  // 4. The 402 challenge still carries the Bazaar declaration.
  try {
    const res = await fetch(`${API_BASE}/v1/triage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ symptoms: "chest pain" }),
    });
    const header = res.headers.get("payment-required");
    const challenge = header
      ? (JSON.parse(Buffer.from(header, "base64").toString("utf-8")) as {
          resource?: { tags?: string[] };
          extensions?: { bazaar?: { info?: { input?: { method?: string } } } };
        })
      : null;
    const tagged = challenge?.resource?.tags?.includes("x402-global-challenge") ?? false;
    const bazaar = Boolean(challenge?.extensions?.bazaar?.info?.input?.method);
    record(
      res.status === 402 && tagged && bazaar ? "ok" : "warn",
      "402 challenge",
      `HTTP ${res.status} · challenge tag ${tagged ? "present" : "MISSING"} · bazaar declaration ${bazaar ? "present" : "MISSING"}`,
    );
  } catch (e) {
    record("fail", "402 challenge", (e as Error).message);
  }

  // 5. The agent wallet can actually pay: it needs USDC, not ALGO.
  const mnemonic = process.env.AGENT_MNEMONIC;
  let agentAddr: string | null = null;
  if (!mnemonic) {
    record("warn", "Agent wallet", "AGENT_MNEMONIC unset — agent-demo.ts will fall back to the deployer");
  } else {
    agentAddr = algosdk.mnemonicToSecretKey(mnemonic).addr.toString();
    const info = await algod.accountInformation(agentAddr).do();
    const usdc = (info.assets ?? []).find((a) => Number(a.assetId) === USDC_ASA);
    const balance = usdc ? Number(usdc.amount) : 0;
    const runs = Math.floor(balance / 90_000); // $0.09 per full run
    record(
      balance === 0 ? "fail" : runs < 3 ? "warn" : "ok",
      "Agent wallet funded",
      usdc
        ? `$${(balance / 1e6).toFixed(2)} USDC — about ${runs} full runs`
        : `not opted in to ASA ${USDC_ASA}; run scripts/provision-agent-wallet.ts`,
    );
  }

  // 6. The consent grant the flagship run depends on.
  const patient = process.env.PATIENT_ADDRESS ?? env.PATIENT_ADDRESS;
  if (!patient || !agentAddr) {
    record("warn", "Consent grant active", "PATIENT_ADDRESS or AGENT_MNEMONIC unset — cannot check");
  } else {
    try {
      const status = await json<{ granted: boolean }>(
        `${API_BASE}/v1/consent/status?patient=${patient}&requester=${agentAddr}&scope=${SCOPE}`,
      );
      record(
        status.granted ? "ok" : "fail",
        "Consent grant active",
        status.granted
          ? `${patient.slice(0, 8)}… → ${agentAddr.slice(0, 8)}… for ${SCOPE}`
          : `no grant — run: npx tsx scripts/grant-consent.ts ${agentAddr}`,
      );
    } catch (e) {
      record("fail", "Consent grant active", (e as Error).message);
    }
  }

  finish();
}

function finish(): never {
  const fails = results.filter((r) => r.level === "fail");
  const warns = results.filter((r) => r.level === "warn");
  console.log("");
  if (fails.length === 0 && warns.length === 0) {
    console.log("  Ready to record.\n");
    process.exit(0);
  }
  if (fails.length === 0) {
    console.log(`  Ready, with ${warns.length} warning${warns.length === 1 ? "" : "s"} — read them before recording.\n`);
    process.exit(0);
  }
  console.log(`  NOT ready: ${fails.length} blocking failure${fails.length === 1 ? "" : "s"}.`);
  for (const f of fails) console.log(`    - ${f.label}: ${f.detail}`);
  console.log("");
  process.exit(1);
}

main().catch((e) => {
  console.error("\npreflight crashed:", e.message ?? e);
  process.exit(1);
});
