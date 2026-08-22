/**
 * Live demonstration that finding G-01 is closed.
 *
 * G-01: `/v1/records/summary` took `requesterAddress` from the request body and
 * never bound it to whoever paid. Because `grant_access` transactions publicly
 * expose valid (patient, requester) pairs to any indexer, a stranger could pay
 * the ordinary fee, assert an authorised requester's address, and be handed the
 * record — writing a forged identity into the patient's immutable audit trail.
 *
 * This script performs that exact attack against the live TestNet deployment
 * and asserts it is now rejected, then runs the legitimate call as a control so
 * the rejection cannot be dismissed as "the endpoint is simply broken".
 *
 * Usage:
 *   API_BASE=http://localhost:4021 npx tsx scripts/verify-g01-fix.ts
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

const attacker = algosdk.mnemonicToSecretKey(mnemonic); // pays, and is also the patient here
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

function grantBoxName(patient: string, requester: string, scope: string): Uint8Array {
  const inner = concat(
    algosdk.decodeAddress(patient).publicKey,
    algosdk.decodeAddress(requester).publicKey,
    new TextEncoder().encode(scope),
  );
  return concat(
    new TextEncoder().encode("g"),
    new Uint8Array(createHash("sha256").update(inner).digest()),
  );
}

function signer() {
  return {
    address: attacker.addr.toString(),
    async signTransactions(txns: Uint8Array[], indexesToSign?: number[]) {
      const toSign = new Set(indexesToSign ?? txns.map((_, i) => i));
      return txns.map((b, i) =>
        toSign.has(i) ? algosdk.decodeUnsignedTransaction(b).signTxn(attacker.sk) : null,
      );
    },
  };
}

async function paidCall(body: unknown) {
  const client = new x402Client();
  client.register("algorand:*", new ExactAvmScheme(signer(), { algodUrl: ALGOD_URL }));
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const httpClient = new x402HTTPClient(client);
  const res = await fetchWithPayment(`${API_BASE}/v1/records/summary`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  const settle =
    res.status === 200
      ? (httpClient.getPaymentSettleResponse((n) => res.headers.get(n)) as { transaction?: string } | null)
      : null;
  return { status: res.status, body: json, settledTx: settle?.transaction ?? null };
}

async function main() {
  const patient = attacker.addr.toString();
  const victimRequester = algosdk.generateAccount().addr.toString();

  console.log("G-01 LIVE VERIFICATION");
  console.log(`  API        : ${API_BASE}`);
  console.log(`  Patient    : ${patient}`);
  console.log(`  Authorised requester (attacker does NOT hold this key): ${victimRequester}`);
  console.log(`  Payer      : ${patient}  <- the attacker pays with their own key\n`);

  const info = await (await fetch(`${API_BASE}/v1/consent/app-info`)).json();
  const appId: number = info.consentAppId;

  // --- Setup: the patient grants a THIRD PARTY access. The attacker is not it.
  console.log("Step 1 — patient grants consent to the third-party requester (on-chain)");
  const sp = await algod.getTransactionParams().do();
  const atc = new algosdk.AtomicTransactionComposer();
  atc.addMethodCall({
    appID: appId,
    method: GRANT_ACCESS,
    methodArgs: [victimRequester, SCOPE, 0],
    sender: attacker.addr,
    signer: algosdk.makeBasicAccountTransactionSigner(attacker),
    suggestedParams: sp,
    boxes: [{ appIndex: 0, name: grantBoxName(patient, victimRequester, SCOPE) }],
  });
  const grant = await atc.execute(algod, 6);
  console.log(`  grant_access: ${grant.txIDs[0]}`);

  const status = await (
    await fetch(`${API_BASE}/v1/consent/status?patient=${patient}&requester=${victimRequester}&scope=${SCOPE}`)
  ).json();
  console.log(`  consent(patient -> third party) granted = ${status.granted}`);
  if (!status.granted) throw new Error("Setup failed: grant did not take effect.");

  // --- The attack: pay with the attacker's key, claim to be the third party.
  console.log("\nStep 2 — THE ATTACK: pay with the attacker's own key, assert the third party's address");
  const attack = await paidCall({ patientId: patient, requesterAddress: victimRequester });
  console.log(`  HTTP ${attack.status}`);
  console.log(`  ${JSON.stringify(attack.body)}`);
  console.log(`  settled payment: ${attack.settledTx ?? "none — settlement cancelled on 4xx"}`);

  const blocked = attack.status === 403 && !("summary" in (attack.body as object));
  console.log(blocked ? "  => BLOCKED. No record released." : "  => *** EXPLOITED — record released ***");

  // --- Control: the legitimate call must still work.
  console.log("\nStep 3 — CONTROL: the same payer asserting their OWN address (legitimate)");
  // A 402 here is retryable: it means the payment was not accepted, not that
  // the caller was refused the record. It has been seen once (G-37, cause not
  // established), and reporting a closed finding as re-opened on one sample
  // would be worse than retrying. A 403 is NOT retried — that would be the
  // control genuinely failing, which is the thing this step exists to detect.
  let control = await paidCall({ patientId: patient, requesterAddress: patient });
  if (control.status === 402) {
    console.log("  HTTP 402 — payment not accepted. Retrying once (see G-37).");
    control = await paidCall({ patientId: patient, requesterAddress: patient });
  }
  console.log(`  HTTP ${control.status}`);
  const ok = control.status === 200 && Boolean((control.body as { summary?: unknown }).summary);
  console.log(`  record released: ${ok}`);
  if (ok) {
    const b = control.body as { auditTxId?: string; auditSequence?: string };
    console.log(`  audit tx: ${b.auditTxId}  (sequence ${b.auditSequence})`);
    console.log(`  payment : ${control.settledTx}`);
  }

  console.log("\n" + "=".repeat(68));
  console.log(`  Impersonation blocked : ${blocked ? "YES" : "NO"}`);
  console.log(`  Legitimate call works : ${ok ? "YES" : "NO"}`);
  console.log(`  G-01 CLOSED           : ${blocked && ok ? "YES" : "NO"}`);
  console.log("=".repeat(68));

  const outPath = path.resolve(process.cwd(), "..", "contracts", "artifacts", "g01-verification.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        note: "generated by api/scripts/verify-g01-fix.ts",
        finding: "G-01 — payer identity not bound to asserted requesterAddress",
        appId,
        patient,
        thirdPartyRequesterGrantedAccess: victimRequester,
        grantTxId: grant.txIDs[0],
        attack: { assertedRequester: victimRequester, payer: patient, httpStatus: attack.status, body: attack.body, blocked },
        control: { assertedRequester: patient, payer: patient, httpStatus: control.status, recordReleased: ok, settledTx: control.settledTx, auditTxId: (control.body as { auditTxId?: string }).auditTxId },
        result: blocked && ok ? "CLOSED" : "OPEN",
      },
      null,
      2,
    ),
  );
  console.log(`\nWrote ${outPath}`);
  if (!(blocked && ok)) process.exit(1);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
