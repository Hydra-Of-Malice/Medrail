"use client";

import { WalletProvider } from "@txnlab/use-wallet-react";
import { walletManager } from "@/lib/walletConnect";
import { ActiveWalletProvider } from "@/lib/activeWallet";

export default function WalletProviders({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider manager={walletManager}>
      <ActiveWalletProvider>{children}</ActiveWalletProvider>
    </WalletProvider>
  );
}
