"use client";

import { useState } from "react";
import { useActiveWallet } from "@/lib/activeWallet";
import { requestAccessOnChain } from "@/lib/consent";
import { getConsentStatus, summarizeRecord } from "@/lib/api";
import { callPaidEndpoint } from "@/lib/x402Client";
import { API_BASE, EXPLORER_TX_URL, EXPLORER_ADDRESS_URL } from "@/lib/config";
import { HOSPITAL_PATIENTS, DOCTOR_SCOPE, type HospitalPatient, type HospitalAccessStatus } from "@/lib/dummyData";

const shortAddr = (a: string) => `${a.slice(0, 8)}…${a.slice(-4)}`;

const STATUS_STYLE: Record<HospitalAccessStatus, string> = {
  granted: "bg-emerald-950 text-emerald-300",
  requested: "bg-amber-950/60 text-amber-300",
  none: "bg-neutral-800 text-neutral-400",
};

function RecordCard({ record }: { record: Record<string, unknown> }) {
  return (
    <dl className="mt-3 grid gap-x-6 gap-y-1.5 rounded-md border border-neutral-800 bg-neutral-900/50 p-3 text-sm sm:grid-cols-2">
      {Object.entries(record).map(([key, value]) => (
        <div key={key} className="min-w-0">
          <dt className="text-xs text-neutral-500">{key}</dt>
          <dd className="text-neutral-200">{Array.isArray(value) ? value.join(", ") || "—" : String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function SummaryButton({ record, history }: { record: Record<string, unknown>; history?: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setSummary(await summarizeRecord(record, history));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        onClick={run}
        disabled={loading}
        className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-neutral-950 transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Summarizing…" : summary ? "Re-summarize with Gemini" : "Summarize with Gemini"}
      </button>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      {summary && (
        <div className="mt-2 rounded-md border border-amber-900/40 bg-amber-950/10 p-3 text-sm text-neutral-200">
          <div className="mb-1 font-mono text-[11px] uppercase tracking-wide text-amber-500">
            Gemini 2.5 Flash summary
          </div>
          {summary}
        </div>
      )}
    </div>
  );
}

function HospitalPatientRow({
  patient,
  onRequestAccess,
  busy,
}: {
  patient: HospitalPatient;
  onRequestAccess: (patient: HospitalPatient) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <li className="rounded-md border border-neutral-800 bg-neutral-900/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm text-neutral-200">{patient.name}</div>
          <div className="font-mono text-xs text-neutral-600">
            {shortAddr(patient.address)} · last visit {patient.lastVisit}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${STATUS_STYLE[patient.accessStatus]}`}>
            {patient.accessStatus}
          </span>
          {patient.accessStatus === "granted" && (
            <button
              onClick={() => setOpen((o) => !o)}
              className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:border-amber-600/60"
            >
              {open ? "Hide" : "See"}
            </button>
          )}
          {patient.accessStatus === "none" && (
            <button
              onClick={() => onRequestAccess(patient)}
              disabled={busy}
              className="rounded-md bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Requesting…" : "Request access"}
            </button>
          )}
          {patient.accessStatus === "requested" && (
            <span className="text-xs text-neutral-600">awaiting patient approval</span>
          )}
        </div>
      </div>
      {open && patient.accessStatus === "granted" && (
        <>
          <RecordCard record={patient.record as unknown as Record<string, unknown>} />
          <SummaryButton
            record={patient.record as unknown as Record<string, unknown>}
            history={patient.history}
          />
        </>
      )}
    </li>
  );
}

export default function DoctorPanel() {
  const { address, avmSigner, transactionSigner } = useActiveWallet();
  const [patients, setPatients] = useState<HospitalPatient[]>(HOSPITAL_PATIENTS);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  const [lookupAddress, setLookupAddress] = useState("");
  const [lookupBusy, setLookupBusy] = useState<"check" | "pay" | "request" | null>(null);
  const [lookupGranted, setLookupGranted] = useState<boolean | null>(null);
  const [lookupRecord, setLookupRecord] = useState<Record<string, unknown> | null>(null);
  const [lookupTx, setLookupTx] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const connected = Boolean(address && transactionSigner);

  async function requestAccess(patient: HospitalPatient) {
    if (!address || !transactionSigner) return;
    setRequestingId(patient.id);
    setRequestError(null);
    try {
      await requestAccessOnChain(address, transactionSigner, patient.address, DOCTOR_SCOPE);
      setPatients((prev) => prev.map((p) => (p.id === patient.id ? { ...p, accessStatus: "requested" } : p)));
    } catch (e) {
      setRequestError(e instanceof Error ? e.message : String(e));
    } finally {
      setRequestingId(null);
    }
  }

  async function checkLookup() {
    if (!address || lookupAddress.length !== 58) return;
    setLookupBusy("check");
    setLookupError(null);
    setLookupRecord(null);
    try {
      const result = await getConsentStatus(lookupAddress, address, DOCTOR_SCOPE);
      setLookupGranted(result.granted);
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : String(e));
    } finally {
      setLookupBusy(null);
    }
  }

  async function payAndViewLookup() {
    if (!avmSigner || !address || lookupAddress.length !== 58) return;
    setLookupBusy("pay");
    setLookupError(null);
    try {
      const res = await callPaidEndpoint(avmSigner, `${API_BASE}/v1/records/summary`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ patientId: lookupAddress, requesterAddress: address }),
      });
      if (res.status !== 200) {
        setLookupError(`Request returned HTTP ${res.status}. ${JSON.stringify(res.body)}`);
        return;
      }
      const body = res.body as { summary: Record<string, unknown>; auditTxId?: string | null };
      setLookupRecord(body.summary);
      setLookupTx(body.auditTxId ?? null);
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : String(e));
    } finally {
      setLookupBusy(null);
    }
  }

  async function requestLookupAccess() {
    if (!address || !transactionSigner || lookupAddress.length !== 58) return;
    setLookupBusy("request");
    setLookupError(null);
    try {
      const txId = await requestAccessOnChain(address, transactionSigner, lookupAddress, DOCTOR_SCOPE);
      setLookupTx(txId);
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : String(e));
    } finally {
      setLookupBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-mono text-xs uppercase tracking-wide text-amber-500">
            Patients your hospital can reach
          </h3>
          <span className="rounded-full border border-neutral-800 px-2 py-0.5 font-mono text-[11px] text-neutral-500">
            illustrative demo data
          </span>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-neutral-400">
          &ldquo;Granted&rdquo; rows already have an active consent grant to this scope. <strong>See</strong> shows
          the record and lets Gemini 2.5 Flash summarize the patient&rsquo;s condition from it — nothing is sent
          to Gemini until you ask. For a patient with no grant, <strong>Request access</strong> submits a real,
          on-chain <code className="text-neutral-300">request_access</code> notification the patient sees on
          their own dashboard.
        </p>

        <ul className="mt-4 space-y-2">
          {patients.map((patient) => (
            <HospitalPatientRow
              key={patient.id}
              patient={patient}
              onRequestAccess={requestAccess}
              busy={requestingId === patient.id}
            />
          ))}
        </ul>
        {!connected && (
          <p className="mt-3 text-xs text-neutral-500">Connect a wallet above to request access as this hospital.</p>
        )}
        {requestError && <p className="mt-3 text-sm text-red-300">{requestError}</p>}
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-5">
        <h3 className="font-mono text-xs uppercase tracking-wide text-amber-500">Look up a real patient</h3>
        <p className="mt-2 max-w-3xl text-sm text-neutral-400">
          Paste any Algorand address — for example, your own wallet after granting yourself access via the
          On-chain consent panel above — to run the real flow: a free consent check, then either a genuine
          $0.05 x402 payment for <code className="text-neutral-300">/v1/records/summary</code>, or a real{" "}
          <code className="text-neutral-300">request_access</code> transaction if consent isn&rsquo;t granted yet.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={lookupAddress}
            onChange={(e) => {
              setLookupAddress(e.target.value.trim());
              setLookupGranted(null);
              setLookupRecord(null);
              setLookupTx(null);
            }}
            placeholder="Patient's Algorand address (58 characters)"
            className="min-w-0 flex-1 rounded-md border border-neutral-800 bg-neutral-900 p-2 font-mono text-sm text-neutral-100"
          />
          <button
            onClick={checkLookup}
            disabled={!connected || lookupAddress.length !== 58 || lookupBusy !== null}
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:border-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {lookupBusy === "check" ? "Checking…" : "Check access"}
          </button>
        </div>

        {lookupGranted !== null && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full px-2.5 py-1 font-mono text-xs ${
                lookupGranted ? "bg-emerald-950 text-emerald-300" : "bg-neutral-800 text-neutral-400"
              }`}
            >
              {lookupGranted ? "consent granted" : "no active consent"}
            </span>
            {lookupGranted ? (
              <button
                onClick={payAndViewLookup}
                disabled={!avmSigner || lookupBusy !== null}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {lookupBusy === "pay" ? "Paying…" : "Pay $0.05 and view record"}
              </button>
            ) : (
              <button
                onClick={requestLookupAccess}
                disabled={!connected || lookupBusy !== null}
                className="rounded-md bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {lookupBusy === "request" ? "Requesting…" : "Request access"}
              </button>
            )}
          </div>
        )}

        {lookupError && <p className="mt-3 text-sm text-red-300">{lookupError}</p>}
        {lookupTx && (
          <a
            href={EXPLORER_TX_URL(lookupTx)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block font-mono text-xs text-amber-400 underline underline-offset-2"
          >
            view transaction on-chain →
          </a>
        )}
        {lookupRecord && (
          <>
            <RecordCard record={lookupRecord} />
            <SummaryButton record={lookupRecord} />
          </>
        )}
        {address && (
          <p className="mt-3 text-xs text-neutral-600">
            Requesting as{" "}
            <a href={EXPLORER_ADDRESS_URL(address)} target="_blank" rel="noopener noreferrer" className="hover:text-amber-400">
              {shortAddr(address)}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
