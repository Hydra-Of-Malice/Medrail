import algosdk from "algosdk";
import { ALGOD_URL, NETWORK } from "./config";

/** Same TestNet/MainNet USDC ASA ids as api/src/config.ts — verified live via AlgoNode indexers. */
export const USDC_ASSET_ID = NETWORK === "mainnet" ? 31566704 : 10458941;

const algod = new algosdk.Algodv2("", ALGOD_URL, "");

export interface UsdcStatus {
  optedIn: boolean;
  balanceMicroUsdc: number | null;
}

/** An Algorand account can't receive an asset it hasn't opted into first — a faucet
 * send to a non-opted-in account fails on-chain, which is the single most common
 * reason a "funded" wallet still can't settle an x402 payment here. */
export async function getUsdcStatus(address: string): Promise<UsdcStatus> {
  const res = await fetch(`${ALGOD_URL}/v2/accounts/${address}`);
  const data = await res.json();
  const assets: Array<{ "asset-id": number; amount: number }> = data.assets ?? [];
  const match = assets.find((a) => a["asset-id"] === USDC_ASSET_ID);
  if (!match) return { optedIn: false, balanceMicroUsdc: null };
  return { optedIn: true, balanceMicroUsdc: match.amount };
}

/** A zero-amount self-transfer — the standard Algorand ASA opt-in. Must be signed and
 * submitted before this address can receive USDC from anywhere, including a faucet. */
export async function optInToUsdc(address: string, signer: algosdk.TransactionSigner): Promise<string> {
  const suggestedParams = await algod.getTransactionParams().do();
  const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: address,
    receiver: address,
    amount: 0,
    assetIndex: USDC_ASSET_ID,
    suggestedParams,
  });
  const [signed] = await signer([txn], [0]);
  const { txid } = await algod.sendRawTransaction(signed).do();
  await algosdk.waitForConfirmation(algod, txid, 4);
  return txid;
}
