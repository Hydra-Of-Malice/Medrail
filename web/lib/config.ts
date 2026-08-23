export const API_BASE = process.env.NEXT_PUBLIC_API_BASE;
export const NETWORK = process.env.NEXT_PUBLIC_NETWORK;

export const ALGOD_URL =
  NETWORK === "mainnet" ? "https://mainnet-api.algonode.cloud" : "https://testnet-api.algonode.cloud";

export const EXPLORER_TX_URL = (txId: string) =>
  `https://lora.algokit.io/${NETWORK}/transaction/${txId}`;

export const EXPLORER_ADDRESS_URL = (address: string) =>
  `https://lora.algokit.io/${NETWORK}/account/${address}`;

export const FUND_URL = "https://lora.algokit.io/testnet/fund";
