/**
 * Provisions an INDEPENDENT patient wallet on TestNet.
 *
 * Why this exists: the agent demo already pays from its own keypair, but the
 * "patient" in that run was the same account that deploys the contract and
 * receives the payments. That is three *roles* across two accounts, and a
 * reviewer is right to notice. This creates a third keypair so patient, agent
 * and service are three genuinely separate accounts, and the consent grant runs
 * from someone who is neither the payer nor the payee.
 *
 * The patient never pays for anything, so it needs ALGO only — enough to exist
 * and to sign grant/revoke calls. Box storage for the grant is paid by the
 * application account, not the caller.
 *
 * Usage:
 *   npx tsx scripts/provision-patient-wallet.ts
 *
 * Prints the new mnemonic. Save it to api/.env as PATIENT_MNEMONIC and set
 * PATIENT_ADDRESS to the printed address, then:
 *   npx tsx scripts/grant-consent.ts <agentAddress>
 *   npx tsx scripts/agent-demo.ts
 */
import algosdk from "algosdk";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { dotenvLoad } from "./dotenvLoad.js";

const env = dotenvLoad();
const ALGOD_URL = process.env.ALGOD_URL ?? "https://testnet-api.algonode.cloud";

/** 100_000 base account MBR + ~50 grant/revoke fees. The patient never pays for
 *  anything, so this is all it will ever need. */
const ALGO_TO_SEND = 150_000;

const funderMnemonic = process.env.PROOF_MNEMONIC ?? env.DEPLOYER_MNEMONIC;
if (!funderMnemonic) throw new Error("Set DEPLOYER_MNEMONIC in contracts/.env");

const funder = algosdk.mnemonicToSecretKey(funderMnemonic);
const algod = new algosdk.Algodv2("", ALGOD_URL, "");

async function main() {
  const patient = algosdk.generateAccount();
  const patientAddr = patient.addr.toString();
  const mnemonic = algosdk.secretKeyToMnemonic(patient.sk);

  console.log("Provisioning an independent TestNet patient wallet\n");
  console.log(`  funder      : ${funder.addr.toString()}`);
  console.log(`  new patient : ${patientAddr}\n`);

  const sp = await algod.getTransactionParams().do();
  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: funder.addr, receiver: patient.addr, amount: ALGO_TO_SEND, suggestedParams: sp,
  });
  const { txid } = await algod.sendRawTransaction(txn.signTxn(funder.sk)).do();
  await algosdk.waitForConfirmation(algod, txid, 6);
  console.log(`  funded ${ALGO_TO_SEND} microAlgo: ${txid}`);
  console.log(`  https://lora.algokit.io/testnet/transaction/${txid}\n`);

  const outPath = path.resolve(process.cwd(), "..", "contracts", "artifacts", "patient-wallet.json");
  writeFileSync(outPath, JSON.stringify({
    note: "Independent TestNet patient wallet, so the consent grant comes from an account that is "
        + "neither the payer nor the payee. TestNet play money only.",
    address: patientAddr,
    fundedMicroAlgo: ALGO_TO_SEND,
    fundingTxId: txid,
    explorer: `https://lora.algokit.io/testnet/account/${patientAddr}`,
  }, null, 2));
  console.log(`  wrote ${outPath} (address only — the mnemonic is NOT written to disk)\n`);
  console.log("  Add these to api/.env (gitignored):\n");
  console.log(`PATIENT_MNEMONIC="${mnemonic}"`);
  console.log(`PATIENT_ADDRESS="${patientAddr}"\n`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
