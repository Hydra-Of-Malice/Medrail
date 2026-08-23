"use client";

import { useState } from "react";
import { useActiveWallet } from "@/lib/activeWallet";
import { grantAccessOnChain, revokeAccessOnChain } from "@/lib/consent";
import { getConsentStatus } from "@/lib/api";
import { EXPLORER_TX_URL } from "@/lib/config";

const SCOPE = "records:summary";

export default function ConsentChecker() {
  const { address: activeAddress, transactionSigner } = useActiveWallet();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<"grant" | "revoke" | "check" | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connected = Boolean(activeAddress && transactionSigner);

  async function withWallet<T>(action: "grant" | "revoke" | "check", fn: () => Promise<T>) {
    setBusy(action);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  async function grant() {
    if (!activeAddress || !transactionSigner) return;
    const txId = await withWallet("grant", () =>
      grantAccessOnChain(activeAddress, transactionSigner, activeAddress, SCOPE, 0),
    );
    if (txId) setLastTx(txId);
    await check();
  }

  async function revoke() {
    if (!activeAddress || !transactionSigner) return;
    const txId = await withWallet("revoke", () =>
      revokeAccessOnChain(activeAddress, transactionSigner, activeAddress, SCOPE),
    );
    if (txId) setLastTx(txId);
    await check();
  }

  async function check() {
    if (!activeAddress) return;
    const result = await withWallet("check", () => getConsentStatus(activeAddress, activeAddress, SCOPE));
    if (result) setStatus(result.granted ? "granted" : "not granted");
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-5">
      <h3 className="font-mono text-xs uppercase tracking-wide text-amber-500">
        On-chain consent — self-grant demo
      </h3>
      <p className="mt-2 text-sm text-neutral-400">
        Your connected wallet or demo account acting as both patient and requester, scope{" "}
        <code className="text-neutral-300">{SCOPE}</code>. Grant/revoke are signed directly by that
        account and submitted straight to Algorand — this backend never sees or proxies that key.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={grant}
          disabled={!connected || busy !== null}
          className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-emerald-50 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "grant" ? "Granting…" : "Grant myself access"}
        </button>
        <button
          onClick={revoke}
          disabled={!connected || busy !== null}
          className="rounded-md bg-red-900 px-3 py-1.5 text-sm font-medium text-red-100 hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "revoke" ? "Revoking…" : "Revoke"}
        </button>
        <button
          onClick={check}
          disabled={!connected || busy !== null}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "check" ? "Checking…" : "Check status"}
        </button>
        {status && (
          <span
            className={`rounded-full px-2.5 py-1 font-mono text-xs ${
              status === "granted" ? "bg-emerald-950 text-emerald-300" : "bg-neutral-800 text-neutral-400"
            }`}
          >
            {status}
          </span>
        )}
      </div>

      {!connected && <p className="mt-3 text-xs text-neutral-500">Connect a wallet above first.</p>}
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      {lastTx && (
        <a
          href={EXPLORER_TX_URL(lastTx)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block font-mono text-xs text-amber-400 underline underline-offset-2"
        >
          view last consent transaction on-chain →
        </a>
      )}
    </div>
  );
}
