"use client";

import { useState } from "react";
import Card from "./ui/Card";
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
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <Card>
        <h3 className="font-mono text-xs uppercase tracking-wide text-text-faint">Pick the call to stand in for</h3>
        <div className="mt-3 space-y-2">
          {(Object.keys(ENDPOINTS) as EndpointKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setEndpoint(key)}
              className={`w-full rounded-[6px] border px-3 py-2 text-left text-sm transition ${
                endpoint === key
                  ? "border-value/50 bg-value-soft text-value"
                  : "border-line bg-surface-2 text-text-muted hover:border-line-strong"
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{ENDPOINTS[key].label}</span>
                <span className="font-mono text-xs tabular-nums text-text-faint">{ENDPOINTS[key].price}</span>
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        {endpoint === "triage" && (
          <label className="block">
            <span className="text-sm text-text-muted">Symptoms (free text)</span>
            <textarea
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-[6px] border border-line bg-surface-2 p-2 text-sm text-text focus:border-trust focus:outline-none"
            />
          </label>
        )}
        {endpoint === "interaction" && (
          <label className="block">
            <span className="text-sm text-text-muted">Medications (comma-separated)</span>
            <input
              value={medications}
              onChange={(e) => setMedications(e.target.value)}
              className="mt-1 w-full rounded-[6px] border border-line bg-surface-2 p-2 text-sm text-text focus:border-trust focus:outline-none"
            />
          </label>
        )}
        {endpoint === "records" && (
          <label className="block">
            <span className="text-sm text-text-muted">
              Patient address (defaults to your connected wallet — grant yourself consent first via the Consent
              panel to see this succeed)
            </span>
            <input
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              placeholder={address ?? "…"}
              className="mt-1 w-full rounded-[6px] border border-line bg-surface-2 p-2 font-mono text-sm text-text focus:border-trust focus:outline-none"
            />
          </label>
        )}

        <button
          onClick={run}
          disabled={!signer || loading}
          className="mt-4 rounded-[6px] bg-value px-4 py-2 text-sm font-semibold text-ink transition hover:bg-value/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Signing & settling…" : `Run this call as the agent — ${ENDPOINTS[endpoint].price}`}
        </button>

        {error && (
          <div className="mt-4 rounded-[6px] border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
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
                className={`rounded-[4px] px-2 py-0.5 font-mono text-xs ${
                  result.status === 200 ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
                }`}
              >
                HTTP {result.status}
              </span>
              {txId && (
                <a
                  href={EXPLORER_TX_URL(txId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-value underline underline-offset-2"
                >
                  view settled transaction on-chain →
                </a>
              )}
            </div>
            {result.status === 402 && (
              <p className="text-xs text-value">
                A real payment was constructed and signed by your wallet, but settlement was rejected —
                almost always because the wallet has no TestNet USDC yet. Fund it above, then try again.
              </p>
            )}
            <pre className="max-h-80 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words rounded-[6px] bg-surface-2 p-3 text-xs text-text-muted">
              {JSON.stringify(result.body, null, 2)}
            </pre>
          </div>
        )}
      </Card>
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
