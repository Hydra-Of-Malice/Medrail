"use client";

import { useEffect, useState, useCallback } from "react";
import { useActiveWallet } from "@/lib/activeWallet";
import { getUsdcStatus, optInToUsdc, type UsdcStatus } from "@/lib/usdc";
import { ALGOD_URL, FUND_URL, USDC_FAUCET_URL, EXPLORER_ADDRESS_URL } from "@/lib/config";

const shortAddr = (a: string) => `${a.slice(0, 8)}…${a.slice(-4)}`;

export default function ConnectWalletCard() {
  const {
    mode,
    walletName,
    address,
    transactionSigner,
    wallets,
    connectingId,
    error,
    connectWallet,
    useDemoAccount,
    disconnect,
  } = useActiveWallet();
  // Both keyed by address so a stale fetch for a previously-active account can never
  // render as this account's state — no effect needs to reset either on its own.
  const [balanceState, setBalanceState] = useState<{ address: string; micro: number | null } | null>(null);
  const [usdcState, setUsdcState] = useState<{ address: string; status: UsdcStatus } | null>(null);
  const [checking, setChecking] = useState(false);
  const [optingIn, setOptingIn] = useState(false);
  const [optInError, setOptInError] = useState<string | null>(null);

  const fetchBalance = useCallback(async (addr: string) => {
    const res = await fetch(`${ALGOD_URL}/v2/accounts/${addr}`);
    const data = await res.json();
    return typeof data.amount === "number" ? data.amount : null;
  }, []);

  const refresh = useCallback(
    async (addr: string) => {
      const [micro, status] = await Promise.all([
        fetchBalance(addr).catch(() => null),
        getUsdcStatus(addr).catch(() => ({ optedIn: false, balanceMicroUsdc: null }) as UsdcStatus),
      ]);
      return { micro, status };
    },
    [fetchBalance],
  );

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    refresh(address).then(({ micro, status }) => {
      if (cancelled) return;
      setBalanceState({ address, micro });
      setUsdcState({ address, status });
    });
    return () => {
      cancelled = true;
    };
  }, [address, refresh]);

  async function checkBalance() {
    if (!address) return;
    setChecking(true);
    try {
      const { micro, status } = await refresh(address);
      setBalanceState({ address, micro });
      setUsdcState({ address, status });
    } finally {
      setChecking(false);
    }
  }

  async function handleOptIn() {
    if (!address || !transactionSigner) return;
    setOptingIn(true);
    setOptInError(null);
    try {
      await optInToUsdc(address, transactionSigner);
      const { micro, status } = await refresh(address);
      setBalanceState({ address, micro });
      setUsdcState({ address, status });
    } catch (e) {
      setOptInError(e instanceof Error ? e.message : String(e));
    } finally {
      setOptingIn(false);
    }
  }

  const balanceMicroAlgo = balanceState?.address === address ? balanceState.micro : null;
  const algo = balanceMicroAlgo != null ? (balanceMicroAlgo / 1_000_000).toFixed(3) : null;
  const usdc = usdcState?.address === address ? usdcState.status : null;
  const usdcAmount = usdc?.balanceMicroUsdc != null ? (usdc.balanceMicroUsdc / 1_000_000).toFixed(2) : null;

  if (!address) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-5">
        <h3 className="font-mono text-xs uppercase tracking-wide text-amber-500">Connect a wallet</h3>
        <p className="mt-2 text-sm text-neutral-400">
          Stand in for the agent with a real TestNet wallet, or use a throwaway demo account if you
          don&rsquo;t have one installed. MedRail never sees your keys either way.
        </p>
        <div className="mt-4 space-y-2">
          {wallets.map((wallet) => (
            <button
              key={wallet.id}
              onClick={() => connectWallet(wallet.id)}
              disabled={connectingId !== null}
              className="flex w-full items-center gap-3 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-left text-sm text-neutral-200 transition hover:border-amber-600/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={wallet.metadata.icon} alt="" className="h-5 w-5 rounded" />
              <span>{connectingId === wallet.id ? "Connecting…" : wallet.metadata.name}</span>
            </button>
          ))}
          <button
            onClick={useDemoAccount}
            disabled={connectingId !== null}
            className="flex w-full items-center gap-3 rounded-md border border-dashed border-neutral-700 bg-neutral-900/60 px-3 py-2 text-left text-sm text-neutral-300 transition hover:border-amber-600/60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-neutral-800 text-xs">
              🎭
            </span>
            <span>Use a demo account</span>
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        <p className="mt-3 text-xs text-neutral-600">
          TestNet only. Any funds involved have zero real-world value. A demo account is a throwaway
          keypair generated in your browser and held only in this tab&rsquo;s session storage.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate font-mono text-xs uppercase tracking-wide text-amber-500">
          {walletName ?? "Connected wallet"}
        </h3>
        <div className="flex shrink-0 items-center gap-3">
          <button onClick={checkBalance} className="text-xs text-neutral-500 hover:text-neutral-300" disabled={checking}>
            {checking ? "checking…" : "refresh balance"}
          </button>
          <button onClick={disconnect} className="text-xs text-neutral-500 hover:text-red-300">
            disconnect
          </button>
        </div>
      </div>
      <a
        href={EXPLORER_ADDRESS_URL(address)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 block truncate font-mono text-sm text-neutral-300 hover:text-amber-400"
        title={address}
      >
        {shortAddr(address)}
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

      <div className="mt-2 rounded-md border border-neutral-800 bg-neutral-900/50 p-3">
        <p className="text-sm text-neutral-400">
          USDC:{" "}
          {usdc === null ? (
            "checking…"
          ) : usdc.optedIn ? (
            <span className="font-mono text-neutral-200">{usdcAmount} USDC</span>
          ) : (
            <span className="text-amber-400">not opted in — a faucet send will fail until you do</span>
          )}
        </p>
        {usdc?.optedIn === false && (
          <>
            <button
              onClick={handleOptIn}
              disabled={optingIn || !transactionSigner}
              className="mt-2 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-neutral-950 transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {optingIn ? "Opting in…" : "Opt in to TestNet USDC"}
            </button>
            <p className="mt-2 text-xs text-neutral-500">
              A one-time, zero-value transaction — Algorand accounts must opt in to an asset before
              they can receive it, so a faucet send here will silently fail until you do this.
            </p>
          </>
        )}
        {usdc?.optedIn && usdc.balanceMicroUsdc === 0 && (
          <p className="mt-2 text-xs text-neutral-500">
            Opted in but empty —{" "}
            <a href={USDC_FAUCET_URL} target="_blank" rel="noopener noreferrer" className="text-amber-400 underline underline-offset-2">
              get free TestNet USDC from Circle&rsquo;s faucet
            </a>{" "}
            (select Algorand Testnet), then refresh balance above.
          </p>
        )}
        {optInError && <p className="mt-2 text-xs text-red-300">{optInError}</p>}
      </div>

      <p className="mt-3 text-xs text-neutral-600">
        {mode === "demo"
          ? "TestNet-only throwaway keypair, held in this tab's session storage — has zero real-world value."
          : "TestNet only — has zero real-world value. Every transaction below is signed in your wallet, not by MedRail."}
      </p>
    </div>
  );
}
