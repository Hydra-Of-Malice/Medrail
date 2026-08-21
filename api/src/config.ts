import "dotenv/config";
import algosdk from "algosdk";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export type NetworkName = "testnet" | "mainnet";
export type Caip2Network = `${string}:${string}`;

const NETWORK_CAIP2: Record<NetworkName, Caip2Network> = {
  // Verified live against https://facilitator.goplausible.xyz/supported and
  // GoPlausible's x402-avm spec — see docs/IMPLEMENTATION_PLAN.md section 1.
  testnet: "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=",
  mainnet: "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=",
};

const USDC_ASA_ID: Record<NetworkName, string> = {
  // Verified live via AlgoNode indexers (asset name/decimals confirmed).
  testnet: "10458941",
  mainnet: "31566704",
};

const ALGOD_SERVER: Record<NetworkName, string> = {
  testnet: "https://testnet-api.algonode.cloud",
  mainnet: "https://mainnet-api.algonode.cloud",
};

const INDEXER_SERVER: Record<NetworkName, string> = {
  testnet: "https://testnet-idx.algonode.cloud",
  mainnet: "https://mainnet-idx.algonode.cloud",
};

function readDeployedAppId(network: NetworkName): number | undefined {
  const path = resolve(process.cwd(), "..", "contracts", "artifacts", `deploy_${network}.json`);
  if (!existsSync(path)) return undefined;
  try {
    const info = JSON.parse(readFileSync(path, "utf-8"));
    return typeof info.app_id === "number" ? info.app_id : undefined;
  } catch {
    return undefined;
  }
}

const network = (process.env.NETWORK as NetworkName) || "testnet";

export const config = {
  network,
  port: Number(process.env.PORT ?? 4021),
  facilitatorUrl: process.env.FACILITATOR_URL ?? "https://facilitator.goplausible.xyz",
  networkCaip2: NETWORK_CAIP2[network],
  usdcAssetId: USDC_ASA_ID[network],
  algodServer: ALGOD_SERVER[network],
  indexerServer: INDEXER_SERVER[network],
  // The address x402 payments settle to. Defaults to the operator address if unset.
  payToAddress: process.env.PAY_TO_ADDRESS ?? process.env.OPERATOR_ADDRESS ?? "",
  // Consent contract App ID — from env, falling back to the deploy script's own
  // output file so `npm run dev` picks up a fresh deployment with no manual step.
  consentAppId: Number(process.env.CONSENT_APP_ID || readDeployedAppId(network) || 0),
  // Operator (admin) account that calls log_access after a verified payment.
  operatorMnemonic: process.env.OPERATOR_MNEMONIC ?? "",
} as const;

/**
 * Refuses to serve payment challenges with an unusable `payTo`.
 *
 * `payToAddress` falls back to `""` when neither PAY_TO_ADDRESS nor
 * OPERATOR_ADDRESS is set. Without this check the service starts happily and
 * advertises a 402 with an empty payee — every caller's SDK then builds a
 * payment to nowhere, and the failure is silent on the one field that decides
 * whether the service earns anything at all.
 */
export function assertPayToConfigured(): void {
  if (!config.payToAddress) {
    throw new Error(
      "PAY_TO_ADDRESS is not set (and OPERATOR_ADDRESS is not set as a fallback). " +
        "Priced endpoints would advertise an empty payee. See docs/08_Deployment/Environment_Setup.md",
    );
  }
  if (!algosdk.isValidAddress(config.payToAddress)) {
    throw new Error(
      `PAY_TO_ADDRESS is not a valid Algorand address: ${config.payToAddress.slice(0, 12)}...`,
    );
  }
}

export function requireConsentAppId(): number {
  if (!config.consentAppId) {
    throw new Error(
      "CONSENT_APP_ID is not set and contracts/artifacts/deploy_testnet.json was not found. " +
        "Deploy the contract first (see docs/DEPLOYMENT.md).",
    );
  }
  return config.consentAppId;
}
