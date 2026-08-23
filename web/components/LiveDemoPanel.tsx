"use client";

import { useState } from "react";
import ConnectWalletCard from "./ConnectWalletCard";
import { useActiveWallet } from "@/lib/activeWallet";
import { API_BASE, EXPLORER_TX_URL } from "@/lib/config";
import { callPaidEndpoint, type PaidCallResult } from "@/lib/x402Client";

type EndpointKey = "triage" | "interaction" | "records";

const ENDPOINTS: Record<EndpointKey, { path: string; price: string; label: string }> = {
  triage: { path: "/v1/triage", price: "$0.02", label: "AI symptom triage score" },
  interaction: { path: "/v1/interaction-check", price: "$0.02", label: "Drug-interaction check" },
  records: { path: "/v1/records/summary", price: "$0.05", label: "Consent-gated record summary" },
};

export default function LiveDemoPanel() {
  const { avmSigner: signer, address } = useActiveWallet();
  const [endpoint, setEndpoint] = useState<EndpointKey>("triage");
  const [symptoms, setSymptoms] = useState("Sudden chest pain and shortness of breath");
  const [medications, setMedications] = useState("warfarin, aspirin");
  const [patientId, setPatientId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PaidCallResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!signer) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const def = ENDPOINTS[endpoint];
      let body: unknown;
      if (endpoint === "triage") body = { symptoms };
      else if (endpoint === "interaction") body = { medications: medications.split(",").map((m) => m.trim()) };
      else body = { patientId: patientId || address, requesterAddress: address };

      const res = await callPaidEndpoint(signer, `${API_BASE}${def.path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const txId = extractTxId(result);

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <ConnectWalletCard />

        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-5">
          <h3 className="font-mono text-xs uppercase tracking-wide text-amber-500">
            Pick the call to stand in for
          </h3>
          <div className="mt-3 space-y-2">
            {(Object.keys(ENDPOINTS) as EndpointKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setEndpoint(key)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                  endpoint === key
                    ? "border-amber-600/60 bg-amber-950/30 text-amber-200"
                    : "border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-neutral-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{ENDPOINTS[key].label}</span>
                  <span className="font-mono text-xs text-neutral-500">{ENDPOINTS[key].price}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-5">
        {endpoint === "triage" && (
          <label className="block">
            <span className="text-sm text-neutral-400">Symptoms (free text)</span>
            <textarea
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 p-2 text-sm text-neutral-100"
            />
          </label>
        )}
        {endpoint === "interaction" && (
          <label className="block">
            <span className="text-sm text-neutral-400">Medications (comma-separated)</span>
            <input
              value={medications}
              onChange={(e) => setMedications(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 p-2 text-sm text-neutral-100"
            />
          </label>
        )}
        {endpoint === "records" && (
          <label className="block">
            <span className="text-sm text-neutral-400">
              Patient address (defaults to your connected wallet — grant yourself consent first via the Consent
              panel to see this succeed)
            </span>
            <input
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              placeholder={address ?? "…"}
              className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 p-2 text-sm text-neutral-100"
            />
          </label>
        )}

        <button
          onClick={run}
          disabled={!signer || loading}
          className="mt-4 rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Signing & settling…" : `Run this call as the agent — ${ENDPOINTS[endpoint].price}`}
        </button>

        {error && (
          <div className="mt-4 rounded-md border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">
            {error}
            {error.toLowerCase().includes("insufficient") && (
              <>
                {" "}
                — fund your wallet on the{" "}
                <a href="https://lora.algokit.io/testnet/fund" target="_blank" rel="noopener noreferrer" className="underline">
                  TestNet dispenser
                </a>
                .
              </>
            )}
          </div>
        )}

        {result && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span
                className={`rounded px-2 py-0.5 font-mono text-xs ${
                  result.status === 200 ? "bg-emerald-950 text-emerald-300" : "bg-red-950 text-red-300"
                }`}
              >
                HTTP {result.status}
              </span>
              {txId && (
                <a
                  href={EXPLORER_TX_URL(txId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-amber-400 underline underline-offset-2"
                >
                  view settled transaction on-chain →
                </a>
              )}
            </div>
            {result.status === 402 && (
              <p className="text-xs text-amber-400">
                A real payment was constructed and signed by your wallet, but settlement was rejected —
                almost always because the wallet has no TestNet USDC yet. Fund it above, then try again.
              </p>
            )}
            <pre className="max-h-80 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words rounded-md bg-neutral-900 p-3 text-xs text-neutral-300">
              {JSON.stringify(result.body, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function extractTxId(result: PaidCallResult | null): string | null {
  if (!result) return null;
  const pr = result.paymentResponse as { transaction?: string } | null;
  if (pr?.transaction) return pr.transaction;
  const body = result.body as { auditTxId?: string } | null;
  return body?.auditTxId ?? null;
}
