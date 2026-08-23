const ROWS = [
  { method: "POST", path: "/v1/triage", price: "$0.02", gate: "x402 only", note: "Open — anyone's agent can call it" },
  { method: "POST", path: "/v1/interaction-check", price: "$0.02", gate: "x402 only", note: "Open — anyone's agent can call it" },
  { method: "POST", path: "/v1/records/summary", price: "$0.05", gate: "x402 + on-chain consent", note: "Requires an active grant from the patient" },
  { method: "GET", path: "/v1/consent/status", price: "free", gate: "none", note: "Read-only consent lookup" },
];

export default function PricingTable() {
  return (
    <div className="overflow-x-auto rounded-[6px] border border-line">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-2 font-mono text-xs uppercase tracking-wide text-text-faint">
          <tr>
            <th className="px-4 py-2 font-medium">Endpoint</th>
            <th className="px-4 py-2 font-medium">Price</th>
            <th className="px-4 py-2 font-medium">Gate</th>
            <th className="px-4 py-2 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {ROWS.map((r) => (
            <tr key={r.path} className="bg-surface">
              <td className="px-4 py-2 font-mono text-text">
                <span className="text-text-faint">{r.method}</span> {r.path}
              </td>
              <td className="px-4 py-2 font-mono tabular-nums text-value">{r.price}</td>
              <td className="px-4 py-2 text-text-muted">{r.gate}</td>
              <td className="px-4 py-2 text-text-muted">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
