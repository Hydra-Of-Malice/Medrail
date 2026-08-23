"use client";

import { useState } from "react";
import { useActiveWallet } from "@/lib/activeWallet";
import { grantAccessOnChain, revokeAccessOnChain } from "@/lib/consent";
import { EXPLORER_TX_URL, EXPLORER_ADDRESS_URL } from "@/lib/config";
import { PATIENT_PROFILE, DUMMY_ACCESS_LOG, type AccessEntry } from "@/lib/dummyData";

const shortAddr = (a: string) => `${a.slice(0, 8)}…${a.slice(-4)}`;

const STATUS_STYLE: Record<AccessEntry["status"], string> = {
  granted: "bg-emerald-950 text-emerald-300",
  pending: "bg-amber-950/60 text-amber-300",
  revoked: "bg-neutral-800 text-neutral-400",
};

export default function UserPanel() {
  const { address: activeAddress, transactionSigner } = useActiveWallet();
  const [entries, setEntries] = useState<AccessEntry[]>(DUMMY_ACCESS_LOG);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [txByEntry, setTxByEntry] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const connected = Boolean(activeAddress && transactionSigner);

  function setStatus(id: string, status: AccessEntry["status"]) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));
  }

  async function approve(entry: AccessEntry) {
    if (!activeAddress || !transactionSigner) return;
    if (entry.blacklisted) {
      const proceed = window.confirm(
        `${entry.requesterName} is flagged in MedRail's blacklist registry. Approve access anyway?`,
      );
      if (!proceed) return;
    }
    setBusyId(entry.id);
    setError(null);
    try {
      const txId = await grantAccessOnChain(activeAddress, transactionSigner, entry.requesterAddress, entry.scope, 0);
      setTxByEntry((prev) => ({ ...prev, [entry.id]: txId }));
      setStatus(entry.id, "granted");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  function deny(entry: AccessEntry) {
    // A pending row has never had a grant_access box created for it — there is
    // nothing on-chain to revoke. Denying it is a local decision only, unless
    // and until the requester asks again.
    setStatus(entry.id, "revoked");
  }

  async function revoke(entry: AccessEntry) {
    if (!activeAddress || !transactionSigner) return;
    setBusyId(entry.id);
    setError(null);
    try {
      const txId = await revokeAccessOnChain(activeAddress, transactionSigner, entry.requesterAddress, entry.scope);
      setTxByEntry((prev) => ({ ...prev, [entry.id]: txId }));
      setStatus(entry.id, "revoked");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-mono text-xs uppercase tracking-wide text-amber-500">Patient profile</h3>
          <span className="rounded-full border border-neutral-800 px-2 py-0.5 font-mono text-[11px] text-neutral-500">
            illustrative demo data
          </span>
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-neutral-500">Name</dt>
            <dd className="text-neutral-200">{PATIENT_PROFILE.name}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Date of birth</dt>
            <dd className="text-neutral-200">{PATIENT_PROFILE.dateOfBirth}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Blood type</dt>
            <dd className="text-neutral-200">{PATIENT_PROFILE.bloodType}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Allergies</dt>
            <dd className="text-neutral-200">{PATIENT_PROFILE.allergies.join(", ")}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Chronic conditions</dt>
            <dd className="text-neutral-200">{PATIENT_PROFILE.chronicConditions.join(", ")}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Current medications</dt>
            <dd className="text-neutral-200">{PATIENT_PROFILE.currentMedications.join(", ")}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-neutral-500">
          On-chain identity:{" "}
          {activeAddress ? (
            <a
              href={EXPLORER_ADDRESS_URL(activeAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-amber-400 underline underline-offset-2"
            >
              {shortAddr(activeAddress)}
            </a>
          ) : (
            <span className="text-neutral-600">connect a wallet above to act as this patient</span>
          )}
        </p>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-5">
        <h3 className="font-mono text-xs uppercase tracking-wide text-amber-500">Who&rsquo;s accessing your data</h3>
        <p className="mt-2 max-w-3xl text-sm text-neutral-400">
          Every row is a consent contract on <code className="text-neutral-300">MedRailConsent</code>. A
          pending row is a requester who asked and is waiting on you; approving submits a real,
          patient-signed <code className="text-neutral-300">grant_access</code> transaction, and
          revoking submits <code className="text-neutral-300">revoke_access</code>. The requesters and
          their history below are illustrative demo data — connect your wallet to actually sign the
          decisions.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="pb-2 pr-3">Requester</th>
                <th className="pb-2 pr-3">Scope</th>
                <th className="pb-2 pr-3">Requested</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-neutral-900 align-top">
                  <td className="py-3 pr-3">
                    <div className="text-neutral-200">{entry.requesterName}</div>
                    <div className="text-xs text-neutral-500">{entry.requesterRole}</div>
                    <a
                      href={EXPLORER_ADDRESS_URL(entry.requesterAddress)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-neutral-600 hover:text-amber-400"
                    >
                      {shortAddr(entry.requesterAddress)}
                    </a>
                    {entry.blacklisted && (
                      <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-950 px-2 py-0.5 font-mono text-[11px] text-red-300">
                        ⚠ blacklisted
                      </div>
                    )}
                    {entry.note && <p className="mt-1 max-w-xs text-xs text-red-400/80">{entry.note}</p>}
                  </td>
                  <td className="py-3 pr-3 font-mono text-xs text-neutral-400">{entry.scope}</td>
                  <td className="py-3 pr-3 text-xs text-neutral-500">{entry.requestedAt.slice(0, 10)}</td>
                  <td className="py-3 pr-3">
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${STATUS_STYLE[entry.status]}`}>
                      {entry.status}
                    </span>
                    {txByEntry[entry.id] && (
                      <a
                        href={EXPLORER_TX_URL(txByEntry[entry.id])}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block font-mono text-[11px] text-amber-400 underline underline-offset-2"
                      >
                        view tx →
                      </a>
                    )}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      {entry.status !== "granted" && (
                        <button
                          onClick={() => approve(entry)}
                          disabled={!connected || busyId !== null}
                          className="rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-medium text-emerald-50 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {busyId === entry.id ? "Approving…" : "Approve"}
                        </button>
                      )}
                      {entry.status === "pending" && (
                        <button
                          onClick={() => deny(entry)}
                          disabled={busyId !== null}
                          className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:border-red-800 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Deny
                        </button>
                      )}
                      {entry.status === "granted" && (
                        <button
                          onClick={() => revoke(entry)}
                          disabled={!connected || busyId !== null}
                          className="rounded-md bg-red-900 px-2.5 py-1 text-xs font-medium text-red-100 hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {busyId === entry.id ? "Revoking…" : "Revoke"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!connected && (
          <p className="mt-3 text-xs text-neutral-500">Connect a wallet above to approve, deny, or revoke access as this patient.</p>
        )}
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      </div>
    </div>
  );
}
