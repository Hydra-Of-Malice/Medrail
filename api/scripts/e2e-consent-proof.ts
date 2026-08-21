/**
 * End-to-end proof of the CONSENT-GATED endpoint: grant consent on-chain, then
 * perform a real x402-paid call to /v1/records/summary that verifies that grant
 * on-chain and appends an audit entry on-chain.
 *
 * This exercises the composition the whole project is about — a single paid HTTP
 * call that is simultaneously a settled USDC payment, an on-chain authorisation
 * check, and an immutable audit append. It is the one path `e2e-proof.ts` does
 * not cover (that script pays only /v1/triage), which is why the deployed
 * contract reported `total_audit_entries = 0`.
 *
 * Writes contracts/artifacts/e2e-consent-proof.json for docs/PROOF.md.
 *
 * Usage:
 *   API_BASE=http://localhost:4021 npx tsx scripts/e2e-consent-proof.ts
 */
import algosdk from "algosdk";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { ExactAvmScheme } from "@x402/avm/exact/client";
import { dotenvLoad } from "./dotenvLoad.js";

const env = dotenvLoad();
const API_BASE = process.env.API_BASE ?? "http://localhost:4021";
const ALGOD_URL = process.env.ALGOD_URL ?? "https://testnet-api.algonode.cloud";
const SCOPE = "records:summary";

const mnemonic = process.env.PROOF_MNEMONIC ?? env.DEPLOYER_MNEMONIC;
if (!mnemonic) throw new Error("Set PROOF_MNEMONIC or DEPLOYER_MNEMONIC in contracts/.env");

const account = algosdk.mnemonicToSecretKey(mnemonic);
const algod = new algosdk.Algodv2("", ALGOD_URL, "");

const GRANT_ACCESS = new algosdk.ABIMethod({
  name: "grant_access",
  args: [
    { type: "address", name: "requester" },
    { type: "string", name: "scope" },
    { type: "uint64", name: "duration_seconds" },
  ],
  returns: { type: "void" },
});

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Must stay byte-identical to contract.py::grant_key and services/algorand.ts. */
function grantBoxName(patient: string, requester: string, scope: string): Uint8Array {
  const inner = concat(
    algosdk.decodeAddress(patient).publicKey,
    algosdk.decodeAddress(requester).publicKey,
    new TextEncoder().encode(scope),
  );
  const digest = new Uint8Array(createHash("sha256").update(inner).digest());
  return concat(new TextEncoder().encode("g"), digest);
}

function signer() {
  return {
    address: account.addr.toString(),
    async signTransactions(txns: Uint8Array[], indexesToSign?: number[]) {
      const toSign = new Set(indexesToSign ?? txns.map((_, i) => i));
      return txns.map((bytes, i) =>
        toSign.has(i) ? algosdk.decodeUnsignedTransaction(bytes).signTxn(account.sk) : null,
      );
    },
  };
}

async function main() {
  const addr = account.addr.toString();
  console.log(`Consent-gated proof against ${API_BASE}`);
  console.log(`Patient == requester == payer: ${addr}\n`);

  // --- Discover the deployed App ID from the running API -------------------
  const info = await (await fetch(`${API_BASE}/v1/consent/app-info`)).json();
  const appId: number = info.consentAppId;
  if (!appId) throw new Error("API reports no consentAppId — is the contract deployed?");
  console.log(`App ID: ${appId} (network ${info.network})`);

  // --- Step 1: grant consent on-chain, signed by the patient ---------------
  const before = await (
    await fetch(`${API_BASE}/v1/consent/status?patient=${addr}&requester=${addr}&scope=${SCOPE}`)
  ).json();
  console.log(`\nConsent before grant: granted=${before.granted}`);

  let grantTxId: string | null = null;
  if (!before.granted) {
    const sp = await algod.getTransactionParams().do();
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: GRANT_ACCESS,
      methodArgs: [addr, SCOPE, 0], // 0 = never expires
      sender: account.addr,
      signer: algosdk.makeBasicAccountTransactionSigner(account),
      suggestedParams: sp,
      boxes: [{ appIndex: 0, name: grantBoxName(addr, addr, SCOPE) }],
    });
    const res = await atc.execute(algod, 6);
    grantTxId = res.txIDs[0];
    console.log(`grant_access submitted: ${grantTxId}`);
    console.log(`  https://lora.algokit.io/testnet/transaction/${grantTxId}`);
  } else {
    console.log("Grant already active — skipping grant_access.");
  }

  const after = await (
    await fetch(`${API_BASE}/v1/consent/status?patient=${addr}&requester=${addr}&scope=${SCOPE}`)
  ).json();
  console.log(`Consent after grant:  granted=${after.granted}`);
  if (!after.granted) throw new Error("Consent did not take effect — aborting before payment.");

  // --- Step 2: the paid, consent-gated call --------------------------------
  const client = new x402Client();
  client.register("algorand:*", new ExactAvmScheme(signer(), { algodUrl: ALGOD_URL }));
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const httpClient = new x402HTTPClient(client);

  console.log(`\nCalling POST /v1/records/summary ($0.05, consent-gated)...`);
  const response = await fetchWithPayment(`${API_BASE}/v1/records/summary`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ patientId: addr, requesterAddress: addr }),
  });

  const body = await response.json();
  console.log(`\nFinal status: ${response.status}`);
  console.log("Response body:", JSON.stringify(body, null, 2));

  if (response.status !== 200) {
    throw new Error(`Consent-gated call did not succeed (status ${response.status}).`);
  }

  const settle = httpClient.getPaymentSettleResponse((n) => response.headers.get(n)) as
    | { transaction?: string }
    | null;

  console.log("\nSettlement:", JSON.stringify(settle, null, 2));
  console.log(`\nPayment tx : https://lora.algokit.io/testnet/transaction/${settle?.transaction}`);
  console.log(`Audit tx   : https://lora.algokit.io/testnet/transaction/${body.auditTxId}`);

  const outPath = path.resolve(process.cwd(), "..", "contracts", "artifacts", "e2e-consent-proof.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        note: "generated by api/scripts/e2e-consent-proof.ts",
        appId,
        patient: addr,
        requester: addr,
        scope: SCOPE,
        grantTxId,
        endpoint: "/v1/records/summary",
        httpStatus: response.status,
        settledPaymentTx: settle?.transaction,
        auditTxId: body.auditTxId,
        auditSequence: body.auditSequence,
        consentVerifiedOnChain: body.consentVerifiedOnChain,
        explorer: {
          grant: grantTxId ? `https://lora.algokit.io/testnet/transaction/${grantTxId}` : null,
          payment: `https://lora.algokit.io/testnet/transaction/${settle?.transaction}`,
          audit: `https://lora.algokit.io/testnet/transaction/${body.auditTxId}`,
          application: `https://lora.algokit.io/testnet/application/${appId}`,
        },
        responseBody: body,
      },
      null,
      2,
    ),
  );
  console.log(`\nWrote proof to ${outPath}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
