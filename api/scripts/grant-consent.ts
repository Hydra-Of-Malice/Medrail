/**
 * Grant (or revoke) consent from a patient to a named requester, on-chain.
 *
 * The patient signs this themselves — it is their key, their transaction, and
 * MedRail's backend is not in the path at all. That is the point: the service
 * cannot grant itself access, and cannot stop a patient revoking it.
 *
 * Usage:
 *   npx tsx scripts/grant-consent.ts <requesterAddress> [scope] [--revoke]
 *
 * The patient is PATIENT_MNEMONIC, falling back to DEPLOYER_MNEMONIC in
 * contracts/.env. TestNet only.
 */
import "dotenv/config"; // loads api/.env — PATIENT_MNEMONIC
import algosdk from "algosdk";
import { createHash } from "node:crypto";
import { dotenvLoad } from "./dotenvLoad.js";

const env = dotenvLoad();
const API_BASE = process.env.API_BASE ?? "http://localhost:4021";
const ALGOD_URL = process.env.ALGOD_URL ?? "https://testnet-api.algonode.cloud";

const [requester, scopeArg, ...flags] = process.argv.slice(2);
const scope = scopeArg && !scopeArg.startsWith("--") ? scopeArg : "records:summary";
const revoke = process.argv.includes("--revoke");

if (!requester || !algosdk.isValidAddress(requester)) {
  throw new Error("Usage: npx tsx scripts/grant-consent.ts <requesterAddress> [scope] [--revoke]");
}

const mnemonic = process.env.PATIENT_MNEMONIC ?? process.env.PROOF_MNEMONIC ?? env.DEPLOYER_MNEMONIC;
if (!mnemonic) throw new Error("Set PATIENT_MNEMONIC (or DEPLOYER_MNEMONIC in contracts/.env)");

const patient = algosdk.mnemonicToSecretKey(mnemonic);
const algod = new algosdk.Algodv2("", ALGOD_URL, "");

const GRANT = new algosdk.ABIMethod({
  name: "grant_access",
  args: [
    { type: "address", name: "requester" },
    { type: "string", name: "scope" },
    { type: "uint64", name: "duration_seconds" },
  ],
  returns: { type: "void" },
});
const REVOKE = new algosdk.ABIMethod({
  name: "revoke_access",
  args: [
    { type: "address", name: "requester" },
    { type: "string", name: "scope" },
  ],
  returns: { type: "void" },
});

function cat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Must stay byte-identical to contract.py::grant_key — see the golden vectors. */
function grantBoxName(p: string, r: string, s: string): Uint8Array {
  const inner = cat(
    algosdk.decodeAddress(p).publicKey,
    algosdk.decodeAddress(r).publicKey,
    new TextEncoder().encode(s),
  );
  return cat(new TextEncoder().encode("g"), new Uint8Array(createHash("sha256").update(inner).digest()));
}

async function main() {
  const info = await (await fetch(`${API_BASE}/v1/consent/app-info`)).json();
  const appId: number = info.consentAppId;
  if (!appId) throw new Error("API reports no consentAppId — is the API running?");

  const patientAddr = patient.addr.toString();
  console.log(`${revoke ? "Revoking" : "Granting"} consent on App ${appId}`);
  console.log(`  patient   : ${patientAddr}  (signs this transaction)`);
  console.log(`  requester : ${requester}`);
  console.log(`  scope     : ${scope}\n`);

  const sp = await algod.getTransactionParams().do();
  const atc = new algosdk.AtomicTransactionComposer();
  atc.addMethodCall({
    appID: appId,
    method: revoke ? REVOKE : GRANT,
    methodArgs: revoke ? [requester, scope] : [requester, scope, 0], // 0 = never expires
    sender: patient.addr,
    signer: algosdk.makeBasicAccountTransactionSigner(patient),
    suggestedParams: sp,
    boxes: [{ appIndex: 0, name: grantBoxName(patientAddr, requester, scope) }],
  });

  const res = await atc.execute(algod, 6);
  console.log(`  tx: ${res.txIDs[0]}`);
  console.log(`  https://lora.algokit.io/testnet/transaction/${res.txIDs[0]}\n`);

  const status = await (
    await fetch(`${API_BASE}/v1/consent/status?patient=${patientAddr}&requester=${requester}&scope=${scope}`)
  ).json();
  console.log(`  check_access now reports: granted=${status.granted}`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
