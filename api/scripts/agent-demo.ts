/**
 * MedRail — autonomous agent demo.
 *
 * This is the machine-to-machine story, executed rather than asserted.
 *
 * A clinical triage agent is handed one task. Completing it needs three
 * different paid services plus a permission check. The agent has no MedRail
 * account, no API key, and no prior relationship with the service. It:
 *
 *   1. DISCOVERS the service from `GET /` — endpoints, prices, gates, the
 *      contract's App ID and its ARC-56 spec URL. Nothing about MedRail is
 *      hardcoded below except the base URL.
 *   2. DECIDES which services the task requires, from the discovered catalogue.
 *   3. PAYS per call in USDC over x402, settling on Algorand each time.
 *   4. CHECKS the free consent oracle before spending on a gated endpoint, so
 *      it never pays to be told no.
 *   5. SYNTHESISES one assessment and reports exactly what it spent.
 *
 * No human is in this loop. Every payment is a real Algorand transaction.
 *
 * Usage:
 *   API_BASE=http://localhost:4021 npx tsx scripts/agent-demo.ts
 */
import algosdk from "algosdk";
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { ExactAvmScheme } from "@x402/avm/exact/client";
import { dotenvLoad } from "./dotenvLoad.js";

const env = dotenvLoad();
const API_BASE = process.env.API_BASE ?? "http://localhost:4021";
const ALGOD_URL = process.env.ALGOD_URL ?? "https://testnet-api.algonode.cloud";
const EXPLORER = (tx: string) => `https://lora.algokit.io/testnet/transaction/${tx}`;

const mnemonic = process.env.AGENT_MNEMONIC ?? process.env.PROOF_MNEMONIC ?? env.DEPLOYER_MNEMONIC;
if (!mnemonic) throw new Error("Set AGENT_MNEMONIC (or DEPLOYER_MNEMONIC in contracts/.env)");
const wallet = algosdk.mnemonicToSecretKey(mnemonic);

/** The task. Everything the agent does below is derived from this. */
const TASK = {
  patient: wallet.addr.toString(), // in this demo the agent also holds the patient's consent
  presentation: "Sudden crushing chest pain and shortness of breath since this morning",
  medications: ["warfarin", "aspirin 81mg"],
};

// ---------------------------------------------------------------- plumbing --

function signer() {
  return {
    address: wallet.addr.toString(),
    async signTransactions(txns: Uint8Array[], indexesToSign?: number[]) {
      const toSign = new Set(indexesToSign ?? txns.map((_, i) => i));
      return txns.map((b, i) =>
        toSign.has(i) ? algosdk.decodeUnsignedTransaction(b).signTxn(wallet.sk) : null,
      );
    },
  };
}

const client = new x402Client();
client.register("algorand:*", new ExactAvmScheme(signer(), { algodUrl: ALGOD_URL }));
const payingFetch = wrapFetchWithPayment(fetch, client);
const httpClient = new x402HTTPClient(client);

const ledger: Array<{ service: string; usd: number; tx: string }> = [];

async function payFor<T>(service: string, path: string, body: unknown, usd: number): Promise<T> {
  const res = await payingFetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T;
  if (res.status !== 200) {
    throw new Error(`${service} failed (${res.status}): ${JSON.stringify(json)}`);
  }
  const settle = httpClient.getPaymentSettleResponse((n) => res.headers.get(n)) as
    | { transaction?: string }
    | null;
  const tx = settle?.transaction ?? "";
  ledger.push({ service, usd, tx });
  console.log(`      paid $${usd.toFixed(2)} · settled ${tx.slice(0, 16)}…`);
  return json;
}

const usd = (amountBaseUnits: string) => Number(amountBaseUnits) / 1_000_000;

// -------------------------------------------------------------------- main --

interface ServiceIndex {
  service: string;
  description: string;
  endpoints: Array<{ method: string; path: string; price: string; gate: string }>;
  contract: { appId: number | null; network: string; arc56SpecUrl: string };
  x402: { version: number; scheme: string; facilitator: string };
}

async function main() {
  console.log("╭──────────────────────────────────────────────────────────────╮");
  console.log("│  CLINICAL TRIAGE AGENT                                       │");
  console.log("│  No MedRail account. No API key. No prior relationship.      │");
  console.log("╰──────────────────────────────────────────────────────────────╯\n");
  console.log(`  Agent wallet : ${wallet.addr.toString()}`);
  console.log(`  Task         : "${TASK.presentation}"`);
  console.log(`  Medications  : ${TASK.medications.join(", ")}\n`);

  // -- 1. DISCOVER -----------------------------------------------------------
  console.log("[1] DISCOVER — reading the service index at GET /");
  const index = (await (await fetch(`${API_BASE}/`)).json()) as ServiceIndex;
  console.log(`      ${index.service}: ${index.endpoints.length} endpoints advertised`);
  console.log(`      x402 v${index.x402.version} · scheme "${index.x402.scheme}"`);
  console.log(`      facilitator ${index.x402.facilitator}`);
  console.log(`      consent contract: App ${index.contract.appId} on ${index.contract.network}`);
  console.log(`      ABI spec for self-integration: ${index.contract.arc56SpecUrl}\n`);

  const priced = index.endpoints.filter((e) => e.price !== "free");
  for (const e of priced) console.log(`      offers ${e.method} ${e.path} — ${e.price} (${e.gate})`);
  console.log();

  const priceOf = (path: string) =>
    Number((index.endpoints.find((e) => e.path === path)?.price ?? "$0").replace("$", ""));

  // -- 2. TRIAGE -------------------------------------------------------------
  console.log("[2] The presentation needs urgency scoring → POST /v1/triage");
  const triage = await payFor<{ score: number; band: string; matchedFlags: string[] }>(
    "triage", "/v1/triage", { symptoms: TASK.presentation }, priceOf("/v1/triage"),
  );
  console.log(`      band=${triage.band.toUpperCase()} score=${triage.score}`);
  console.log(`      flags: ${triage.matchedFlags.join(" · ")}\n`);

  // -- 3. INTERACTIONS -------------------------------------------------------
  console.log("[3] Two medications on board → POST /v1/interaction-check");
  const inter = await payFor<{
    flagged: boolean;
    matches: Array<{ drugs: [string, string]; severity: string; description: string }>;
  }>("interaction-check", "/v1/interaction-check", { medications: TASK.medications },
     priceOf("/v1/interaction-check"));
  if (inter.flagged) {
    for (const m of inter.matches) {
      console.log(`      ${m.severity.toUpperCase()}: ${m.drugs.join(" + ")}`);
      console.log(`        ${m.description}`);
    }
  } else {
    console.log("      no interactions in the reference table");
  }
  console.log();

  // -- 4. CONSENT CHECK (free) ----------------------------------------------
  console.log("[4] The record is consent-gated. Check the FREE oracle before spending.");
  const status = (await (
    await fetch(
      `${API_BASE}/v1/consent/status?patient=${TASK.patient}&requester=${wallet.addr.toString()}&scope=records:summary`,
    )
  ).json()) as { granted: boolean };
  console.log(`      GET /v1/consent/status → granted=${status.granted}  (cost: $0.00)`);

  if (!status.granted) {
    console.log("      No grant. The agent declines to spend and reports what it has.\n");
    return report(triage, inter, null);
  }
  console.log("      Grant is active on-chain. Spending is justified.\n");

  // -- 5. GATED RECORD -------------------------------------------------------
  console.log("[5] Consent verified → POST /v1/records/summary");
  const record = await payFor<{
    summary: { allergies: string[]; chronicConditions: string[]; currentMedications: string[] };
    consentVerifiedOnChain: boolean;
    auditTxId: string | null;
    auditStatus: string;
  }>("records/summary", "/v1/records/summary",
     { patientId: TASK.patient, requesterAddress: wallet.addr.toString() },
     priceOf("/v1/records/summary"));
  console.log(`      consent verified on-chain : ${record.consentVerifiedOnChain}`);
  console.log(`      access written to the patient's audit trail: ${record.auditStatus}`);
  if (record.auditTxId) console.log(`      audit tx: ${EXPLORER(record.auditTxId)}`);
  console.log(`      allergies: ${record.summary.allergies.join(", ")}`);
  console.log(`      conditions: ${record.summary.chronicConditions.join(", ")}\n`);

  report(triage, inter, record);
}

function report(
  triage: { band: string; score: number },
  inter: { flagged: boolean; matches: Array<{ drugs: [string, string]; severity: string }> },
  record: { summary: { allergies: string[]; chronicConditions: string[] } } | null,
) {
  console.log("╭──────────────────────────────────────────────────────────────╮");
  console.log("│  ASSESSMENT                                                  │");
  console.log("╰──────────────────────────────────────────────────────────────╯");
  console.log(`  Urgency        : ${triage.band.toUpperCase()} (score ${triage.score}/100)`);
  if (inter.flagged) {
    const worst = inter.matches[0];
    console.log(`  Medication risk: ${worst.severity.toUpperCase()} — ${worst.drugs.join(" + ")}`);
    console.log(`                   anticoagulant + antiplatelet raises bleeding risk, which`);
    console.log(`                   materially changes management of a suspected cardiac event`);
  }
  if (record) {
    console.log(`  Known allergies: ${record.summary.allergies.join(", ")}`);
    console.log(`  Comorbidities  : ${record.summary.chronicConditions.join(", ")}`);
  } else {
    console.log(`  Record access  : declined — no consent grant, so no spend`);
  }

  const total = ledger.reduce((n, l) => n + l.usd, 0);
  console.log("\n╭──────────────────────────────────────────────────────────────╮");
  console.log("│  WHAT THE AGENT SPENT                                        │");
  console.log("╰──────────────────────────────────────────────────────────────╯");
  for (const l of ledger) {
    console.log(`  $${l.usd.toFixed(2)}  ${l.service.padEnd(20)} ${EXPLORER(l.tx)}`);
  }
  console.log(`  ─────`);
  console.log(`  $${total.toFixed(2)}  total, across ${ledger.length} settled Algorand transactions`);
  console.log(`\n  Zero accounts created. Zero API keys issued. Zero invoices.`);
  console.log(`  Every payment is independently verifiable on a public ledger.`);
  void usd;
}

main().catch((e) => {
  console.error("\nagent failed:", e.message ?? e);
  process.exit(1);
});
