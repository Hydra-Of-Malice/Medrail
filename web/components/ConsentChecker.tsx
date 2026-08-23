"use client";

import { useState } from "react";
import { useActiveWallet } from "@/lib/activeWallet";
import { grantAccessOnChain, revokeAccessOnChain } from "@/lib/consent";
import { getConsentStatus } from "@/lib/api";
import { EXPLORER_TX_URL } from "@/lib/config";
import Card from "./ui/Card";
import Badge from "./ui/Badge";

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
    <Card>
      <h3 className="font-mono text-xs uppercase tracking-wide text-trust">On-chain consent — self-grant demo</h3>
      <p className="mt-2 text-sm text-text-muted">
        Your connected wallet or demo account acting as both patient and requester, scope{" "}
        <code className="rounded-[3px] bg-surface-2 px-1 py-0.5 text-[13px] text-text">{SCOPE}</code>.
        Grant/revoke are signed directly by that account and submitted straight to Algorand — this backend
        never sees or proxies that key.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={grant}
          disabled={!connected || busy !== null}
          className="rounded-[6px] bg-trust px-3 py-1.5 text-sm font-medium text-ink hover:bg-trust/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "grant" ? "Granting…" : "Grant myself access"}
        </button>
        <button
          onClick={revoke}
          disabled={!connected || busy !== null}
          className="rounded-[6px] bg-danger/90 px-3 py-1.5 text-sm font-medium text-ink hover:bg-danger disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "revoke" ? "Revoking…" : "Revoke"}
        </button>
        <button
          onClick={check}
          disabled={!connected || busy !== null}
          className="rounded-[6px] border border-line px-3 py-1.5 text-sm text-text-muted hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "check" ? "Checking…" : "Check status"}
        </button>
        {status && <Badge tone={status === "granted" ? "success" : "inactive"}>{status}</Badge>}
      </div>

      {!connected && <p className="mt-3 text-xs text-text-faint">Connect a wallet above first.</p>}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {lastTx && (
        <a
          href={EXPLORER_TX_URL(lastTx)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block font-mono text-xs text-value underline underline-offset-2"
        >
          view last consent transaction on-chain →
        </a>
      )}
    </Card>
  );
}
