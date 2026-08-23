import algosdk from "algosdk";

const STORAGE_KEY = "medrail-demo-wallet-v1";

export interface DemoWallet {
  address: string;
  mnemonic: string;
}

/** A TestNet-only throwaway keypair generated in the browser — an alternative sign-in
 * for anyone trying the demo without a Pera or Lute wallet installed. Never used for
 * MainNet; production usage goes through a real wallet (see lib/walletConnect.ts). */
export function getOrCreateDemoWallet(): DemoWallet {
  if (typeof window === "undefined") {
    throw new Error("getOrCreateDemoWallet must run in the browser");
  }
  const existing = window.sessionStorage.getItem(STORAGE_KEY);
  if (existing) return JSON.parse(existing) as DemoWallet;

  const account = algosdk.generateAccount();
  const wallet: DemoWallet = {
    address: account.addr.toString(),
    mnemonic: algosdk.secretKeyToMnemonic(account.sk),
  };
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(wallet));
  return wallet;
}

export function clearDemoWallet(): void {
  window.sessionStorage.removeItem(STORAGE_KEY);
}

/** Same algosdk.TransactionSigner shape a real wallet's useWallet().transactionSigner
 * exposes, so callers (lib/consent.ts, the ClientAvmSigner adapter) don't need to know
 * whether they're signing with a demo keypair or a connected wallet. */
export function demoTransactionSigner(wallet: DemoWallet): algosdk.TransactionSigner {
  const account = algosdk.mnemonicToSecretKey(wallet.mnemonic);
  return async (txnGroup, indexesToSign) => indexesToSign.map((i) => txnGroup[i].signTxn(account.sk));
}
