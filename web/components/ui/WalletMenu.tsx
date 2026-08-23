"use client";

import { useState, useRef, useEffect } from "react";
import { useActiveWallet } from "@/lib/activeWallet";
import ConnectWalletCard from "@/components/ConnectWalletCard";

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Topbar-accessible wallet control — a thin dropdown shell around the existing,
 * already-tested ConnectWalletCard so wallet state is reachable from every page,
 * not just one panel, without duplicating its connect/demo-account/USDC logic. */
export default function WalletMenu() {
  const { address, walletName } = useActiveWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-[6px] border px-3 py-1.5 font-mono text-xs transition ${
          address ? "border-trust-dim text-trust" : "border-line text-text-muted hover:border-line-strong"
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${address ? "bg-trust" : "bg-text-faint"}`} />
        {address ? `${walletName ?? "Wallet"} · ${shortAddr(address)}` : "Connect wallet"}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80">
          <ConnectWalletCard />
        </div>
      )}
    </div>
  );
}
