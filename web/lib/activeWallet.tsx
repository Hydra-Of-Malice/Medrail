"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import algosdk from "algosdk";
import { useWallet, type Wallet } from "@txnlab/use-wallet-react";
import { avmSignerFromWallet } from "./walletConnect";
import type { ClientAvmSigner } from "./x402Client";
import { getOrCreateDemoWallet, clearDemoWallet, demoTransactionSigner, type DemoWallet } from "./demoWallet";

interface ActiveWalletState {
  mode: "wallet" | "demo" | null;
  walletName: string | null;
  address: string | null;
  transactionSigner: algosdk.TransactionSigner | null;
  avmSigner: ClientAvmSigner | null;
  wallets: Wallet[];
  connectingId: string | null;
  error: string | null;
  connectWallet: (walletId: string) => Promise<void>;
  useDemoAccount: () => void;
  disconnect: () => Promise<void>;
}

const ActiveWalletContext = createContext<ActiveWalletState | null>(null);

/** Unifies a real connected wallet (via @txnlab/use-wallet-react) and the browser-only
 * demo account behind one interface, so every panel on the page can ask "who's signing
 * right now" without caring which one it is. A real wallet always takes priority if both
 * happen to be set up in the same session. */
export function ActiveWalletProvider({ children }: { children: ReactNode }) {
  // isReady is false on the server (no localStorage to resume a prior session from)
  // and stays false for the client's first render too — only flipping true once
  // use-wallet finishes resuming client-side. Gating on it keeps that first client
  // render identical to the server's, so a previously-connected wallet doesn't
  // trigger a hydration mismatch.
  const { wallets, activeWallet, activeAddress, transactionSigner, isReady } = useWallet();
  const [demoWallet, setDemoWallet] = useState<DemoWallet | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function connectWallet(walletId: string) {
    const wallet = wallets.find((w) => w.id === walletId);
    if (!wallet) return;
    setConnectingId(walletId);
    setError(null);
    try {
      await wallet.connect();
      wallet.setActive();
      setDemoWallet(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnectingId(null);
    }
  }

  function useDemoAccount() {
    setError(null);
    setDemoWallet(getOrCreateDemoWallet());
  }

  async function disconnect() {
    if (activeAddress && activeWallet) {
      await activeWallet.disconnect();
    }
    if (demoWallet) {
      clearDemoWallet();
      setDemoWallet(null);
    }
  }

  let value: ActiveWalletState;
  if (isReady && activeAddress && transactionSigner) {
    value = {
      mode: "wallet",
      walletName: activeWallet?.metadata.name ?? "Wallet",
      address: activeAddress,
      transactionSigner,
      avmSigner: avmSignerFromWallet(activeAddress, transactionSigner),
      wallets,
      connectingId,
      error,
      connectWallet,
      useDemoAccount,
      disconnect,
    };
  } else if (demoWallet) {
    const signer = demoTransactionSigner(demoWallet);
    value = {
      mode: "demo",
      walletName: "Demo account",
      address: demoWallet.address,
      transactionSigner: signer,
      avmSigner: avmSignerFromWallet(demoWallet.address, signer),
      wallets,
      connectingId,
      error,
      connectWallet,
      useDemoAccount,
      disconnect,
    };
  } else {
    value = {
      mode: null,
      walletName: null,
      address: null,
      transactionSigner: null,
      avmSigner: null,
      wallets,
      connectingId,
      error,
      connectWallet,
      useDemoAccount,
      disconnect,
    };
  }

  return <ActiveWalletContext.Provider value={value}>{children}</ActiveWalletContext.Provider>;
}

export function useActiveWallet(): ActiveWalletState {
  const ctx = useContext(ActiveWalletContext);
  if (!ctx) throw new Error("useActiveWallet must be used within ActiveWalletProvider");
  return ctx;
}
