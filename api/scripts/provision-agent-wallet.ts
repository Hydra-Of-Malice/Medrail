/**
 * Provisions an INDEPENDENT agent wallet on TestNet.
 *
 * Why this exists: every payment MedRail had settled up to now came from the
 * same account that receives them — the project paying itself. The x402
 * mechanics are identical either way (the facilitator does not special-case a
 * self-transfer), but "we paid ourselves" is a fair thing for a reviewer to
 * discount. This creates a genuinely separate payer so the agent demo settles
 * a real third-party payment.
 *
 * It funds the new account with enough ALGO to exist and hold an ASA, opts it
 * in to TestNet USDC, and transfers a small USDC float. TestNet only — every
 * value here is play money.
 *
 * Usage:
 *   npx tsx scripts/provision-agent-wallet.ts
 *
 * Prints the new mnemonic. Save it to api/.env as AGENT_MNEMONIC, then:
 *   npx tsx scripts/agent-demo.ts
 */
import algosdk from "algosdk";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { dotenvLoad } from "./dotenvLoad.js";

const env = dotenvLoad();
const ALGOD_URL = process.env.ALGOD_URL ?? "https://testnet-api.algonode.cloud";
const USDC_ASA = 10458941;

/** 100_000 base account MBR + 100_000 for one ASA holding + fees + headroom. */
const ALGO_TO_SEND = 260_000;
/** $1.00 — enough for ~11 full agent runs at $0.09 each. */
const USDC_TO_SEND = 1_000_000;

const funderMnemonic = process.env.PROOF_MNEMONIC ?? env.DEPLOYER_MNEMONIC;
if (!funderMnemonic) throw new Error("Set DEPLOYER_MNEMONIC in contracts/.env");

const funder = algosdk.mnemonicToSecretKey(funderMnemonic);
const algod = new algosdk.Algodv2("", ALGOD_URL, "");

async function send(txn: algosdk.Transaction, signer: algosdk.Account, label: string) {
  const signed = txn.signTxn(signer.sk);
  const { txid } = await algod.sendRawTransaction(signed).do();
  await algosdk.waitForConfirmation(algod, txid, 6);
  console.log(`  ${label}: ${txid}`);
  return txid;
}

async function main() {
  const agent = algosdk.generateAccount();
  const agentAddr = agent.addr.toString();
  const mnemonic = algosdk.secretKeyToMnemonic(agent.sk);

  console.log("Provisioning an independent TestNet agent wallet\n");
  console.log(`  funder (payTo) : ${funder.addr.toString()}`);
  console.log(`  new agent      : ${agentAddr}\n`);

  const before = await algod.accountInformation(funder.addr).do();
  const spendable = Number(before.amount) - Number(before.minBalance ?? 0);
  if (spendable < ALGO_TO_SEND + 10_000) {
    throw new Error(`Funder has only ${spendable} microAlgo spendable; need ${ALGO_TO_SEND + 10_000}.`);
  }

  // 1. ALGO so the account can exist and hold an ASA.
  let sp = await algod.getTransactionParams().do();
  await send(
    algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: funder.addr, receiver: agent.addr, amount: ALGO_TO_SEND, suggestedParams: sp,
    }),
    funder, `funded ${ALGO_TO_SEND} microAlgo`,
  );

  // 2. The agent opts itself in to USDC. Algorand requires this before it can
  //    receive the asset at all — a step that trips up most first transfers.
  sp = await algod.getTransactionParams().do();
  await send(
    algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: agent.addr, receiver: agent.addr, amount: 0, assetIndex: USDC_ASA, suggestedParams: sp,
    }),
    agent, `agent opted in to USDC (ASA ${USDC_ASA})`,
  );

  // 3. A small USDC float for the agent to spend.
  sp = await algod.getTransactionParams().do();
  await send(
    algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: funder.addr, receiver: agent.addr, amount: USDC_TO_SEND, assetIndex: USDC_ASA, suggestedParams: sp,
    }),
    funder, `sent ${USDC_TO_SEND} USDC base units ($${(USDC_TO_SEND / 1e6).toFixed(2)})`,
  );

  const after = await algod.accountInformation(agent.addr).do();
  const usdc = (after.assets ?? []).find((a) => Number(a.assetId) === USDC_ASA);
  console.log(`\n  agent ALGO : ${after.amount} microAlgo`);
  console.log(`  agent USDC : ${usdc ? Number(usdc.amount) : 0} base units`);

  const outPath = path.resolve(process.cwd(), "..", "contracts", "artifacts", "agent-wallet.json");
  writeFileSync(outPath, JSON.stringify({
    note: "Independent TestNet agent wallet, so agent-demo.ts settles a genuine third-party payment. TestNet play money only.",
    address: agentAddr,
    fundedMicroAlgo: ALGO_TO_SEND,
    fundedUsdcBaseUnits: USDC_TO_SEND,
    explorer: `https://lora.algokit.io/testnet/account/${agentAddr}`,
  }, null, 2));

  console.log(`\n  wrote ${outPath} (address only — the mnemonic is NOT written to disk)\n`);
  console.log("  Add this line to api/.env (gitignored), then re-run scripts/agent-demo.ts:\n");
  console.log(`AGENT_MNEMONIC="${mnemonic}"\n`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
