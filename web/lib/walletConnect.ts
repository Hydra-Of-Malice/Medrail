import algosdk from "algosdk";
import { WalletManager, NetworkId } from "@txnlab/use-wallet-react";
import { pera } from "@txnlab/use-wallet-pera";
import { lute } from "@txnlab/use-wallet-lute";
import { NETWORK } from "./config";
import type { ClientAvmSigner } from "./x402Client";

/** Real wallet integration — Pera and Lute, both signable without leaving the browser.
 * Defly is deliberately excluded: its adapter pulls in a deprecated WalletConnect v1
 * client tree with unresolved high-severity advisories (see docs/ENGINEERING_GAP_REPORT.md
 * G-16/G-27, and re-run `npm audit` in web/ before reconsidering it). */
export const walletManager = new WalletManager({
  wallets: [pera(), lute({ siteName: "MedRail" })],
  defaultNetwork: NETWORK === "mainnet" ? NetworkId.MAINNET : NetworkId.TESTNET,
});

/** Adapts use-wallet's algosdk.TransactionSigner (Transaction[] in, signed bytes out for
 * just the requested indexes) to the ClientAvmSigner shape @x402/avm expects (encoded
 * txn bytes in, a full-length array with nulls for the indexes not signed). */
export function avmSignerFromWallet(address: string, transactionSigner: algosdk.TransactionSigner): ClientAvmSigner {
  return {
    address,
    async signTransactions(txns, indexesToSign) {
      const toSign = indexesToSign ?? txns.map((_, i) => i);
      const group = txns.map((bytes) => algosdk.decodeUnsignedTransaction(bytes));
      const signed = await transactionSigner(group, toSign);
      const out: (Uint8Array | null)[] = new Array(txns.length).fill(null);
      toSign.forEach((idx, i) => {
        out[idx] = signed[i];
      });
      return out;
    },
  };
}
