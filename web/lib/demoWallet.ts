import algosdk from "algosdk";

const STORAGE_KEY = "medrail-demo-wallet-v1";

export interface DemoWallet {
  address: string;
  mnemonic: string;
}

/** A TestNet-only throwaway keypair generated in the browser so a judge can try the
 * live payment flow without installing a wallet extension first. Never used for
 * MainNet — production usage goes through a real wallet (see lib/walletConnect.ts). */
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

/** Matches @x402/avm's ClientAvmSigner interface — see docs/ARCHITECTURE.md. */
export interface ClientAvmSigner {
  address: string;
  signTransactions(txns: Uint8Array[], indexesToSign?: number[]): Promise<(Uint8Array | null)[]>;
}

export function demoSignerFromWallet(wallet: DemoWallet): ClientAvmSigner {
  const account = algosdk.mnemonicToSecretKey(wallet.mnemonic);
  return {
    address: wallet.address,
    async signTransactions(txns, indexesToSign) {
      const toSign = new Set(indexesToSign ?? txns.map((_, i) => i));
      return txns.map((bytes, i) => {
        if (!toSign.has(i)) return null;
        const txn = algosdk.decodeUnsignedTransaction(bytes);
        return txn.signTxn(account.sk);
      });
    },
  };
}
