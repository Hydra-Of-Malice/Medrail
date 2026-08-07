"use client";

import { useEffect, useState, useCallback } from "react";
import { getOrCreateDemoWallet, type DemoWallet } from "@/lib/demoWallet";
import { ALGOD_URL, FUND_URL, EXPLORER_ADDRESS_URL } from "@/lib/config";

export default function DemoWalletCard({ onWallet }: { onWallet: (w: DemoWallet) => void }) {
  const [wallet, setWallet] = useState<DemoWallet | null>(null);
  const [balanceMicroAlgo, setBalanceMicroAlgo] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const w = getOrCreateDemoWallet();
    setWallet(w);
    onWallet(w);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkBalance = useCallback(async () => {
    if (!wallet) return;
    setChecking(true);
    try {
      const res = await fetch(`${ALGOD_URL}/v2/accounts/${wallet.address}`);
      const data = await res.json();
      setBalanceMicroAlgo(typeof data.amount === "number" ? data.amount : null);
    } catch {
      setBalanceMicroAlgo(null);
    } finally {
      setChecking(false);
    }
  }, [wallet]);

  useEffect(() => {
    if (wallet) checkBalance();
  }, [wallet, checkBalance]);

  if (!wallet) return null;

  const algo = balanceMicroAlgo != null ? (balanceMicroAlgo / 1_000_000).toFixed(3) : null;

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-xs uppercase tracking-wide text-amber-500">TestNet demo wallet</h3>
        <button
          onClick={checkBalance}
          className="text-xs text-neutral-500 hover:text-neutral-300"
          disabled={checking}
        >
          {checking ? "checking…" : "refresh balance"}
        </button>
      </div>
      <a
        href={EXPLORER_ADDRESS_URL(wallet.address)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 block truncate font-mono text-sm text-neutral-300 hover:text-amber-400"
        title={wallet.address}
      >
        {wallet.address}
      </a>
      <p className="mt-2 text-sm text-neutral-400">
        Balance: {algo !== null ? <span className="font-mono text-neutral-200">{algo} ALGO</span> : "unknown"}
        {balanceMicroAlgo === 0 && (
          <>
            {" — "}
            <a href={FUND_URL} target="_blank" rel="noopener noreferrer" className="text-amber-400 underline underline-offset-2">
              fund it free on the TestNet dispenser
            </a>{" "}
            to run a real payment below.
          </>
        )}
      </p>
      <p className="mt-3 text-xs text-neutral-600">
        Generated in your browser, stored only in this tab&rsquo;s session storage. TestNet only — has zero
        real-world value.
      </p>
    </div>
  );
}
