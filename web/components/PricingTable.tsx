const ROWS = [
  { method: "POST", path: "/v1/triage", price: "$0.02", gate: "x402 only", note: "Open — anyone's agent can call it" },
  { method: "POST", path: "/v1/interaction-check", price: "$0.02", gate: "x402 only", note: "Open — anyone's agent can call it" },
  { method: "POST", path: "/v1/records/summary", price: "$0.05", gate: "x402 + on-chain consent", note: "Requires an active grant from the patient" },
  { method: "GET", path: "/v1/consent/status", price: "free", gate: "none", note: "Read-only consent lookup" },
];

export default function PricingTable() {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-900 text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-2">Endpoint</th>
            <th className="px-4 py-2">Price</th>
            <th className="px-4 py-2">Gate</th>
            <th className="px-4 py-2">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800">
          {ROWS.map((r) => (
            <tr key={r.path} className="bg-neutral-950">
              <td className="px-4 py-2 font-mono text-neutral-200">
                <span className="text-neutral-500">{r.method}</span> {r.path}
              </td>
              <td className="px-4 py-2 font-mono text-amber-400">{r.price}</td>
              <td className="px-4 py-2 text-neutral-400">{r.gate}</td>
              <td className="px-4 py-2 text-neutral-400">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
