import PageHeader from "@/components/ui/PageHeader";
import PricingTable from "@/components/PricingTable";
import AgentFlowPanel from "@/components/AgentFlowPanel";
import LiveDemoPanel from "@/components/LiveDemoPanel";
import { API_BASE } from "@/lib/config";

const PAYMENT_STATES = [
  { name: "Payment Required", detail: "HTTP 402 — the endpoint quotes its price before doing any work." },
  { name: "Payment Signing", detail: "Client-side — the caller's wallet signs a USDC transfer for that quote." },
  { name: "Payment Submitted", detail: "The signed transaction is attached to the retried request." },
  { name: "Payment Verifying", detail: "The x402 facilitator checks the signed payment against the quote." },
  { name: "Payment Settled", detail: "HTTP 200 — the transaction is confirmed on Algorand TestNet." },
  { name: "Request Completed", detail: "The endpoint's actual response body is returned alongside settlement." },
];

export default function DeveloperPage() {
  return (
    <>
      <PageHeader
        title="Developer"
        description="API overview and x402 integration guide."
      />

      <section>
        <h2 className="font-display text-xl font-medium text-text">API overview</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-muted">
          MedRail is a working healthcare-agent payment API on Algorand TestNet: agents pay per call in
          USDC over the x402 protocol, and one endpoint is additionally gated by an on-chain patient
          consent grant instead of any API key. There is no signup and no account — an agent&rsquo;s only
          starting point is <code className="font-mono text-xs text-text">GET {API_BASE ?? ""}/</code>,
          the discovery entrypoint, which returns the full endpoint list, their prices and gates, and
          the deployed consent contract&rsquo;s App ID so an agent can verify the gate itself. That contract,{" "}
          <span className="font-mono text-text">MedRailConsent</span>, is live on TestNet as App ID{" "}
          <span className="font-mono text-text">768743428</span> — everything on this page, including
          every transaction linked below, is real and settles on-chain, not a simulation.
        </p>
        <div className="mt-4">
          <PricingTable />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-medium text-text">The x402 flow</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-muted">
          A worked example of one agent run end to end, with every settled payment linked to its
          TestNet transaction.
        </p>
        <div className="mt-4">
          <AgentFlowPanel />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-medium text-text">Try it live</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-muted">
          Stand in for the agent yourself. Connect a wallet from the top bar, pick a paid call below,
          and run it — this signs and settles a real USDC payment against the live API.
        </p>

        <div className="mt-4 rounded-[6px] border border-line bg-surface-2 p-4">
          <h3 className="font-mono text-xs uppercase tracking-wide text-text-faint">x402 payment states</h3>
          <ol className="mt-2 space-y-1.5 text-sm">
            {PAYMENT_STATES.map((s, i) => (
              <li key={s.name} className="flex flex-wrap gap-x-2 gap-y-0.5">
                <span className="font-mono text-xs text-text-faint">{i + 1}.</span>
                <span className="font-medium text-text">{s.name}</span>
                <span className="text-text-muted">— {s.detail}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
            <span className="rounded-[4px] bg-danger/15 px-1.5 py-0.5 font-mono text-xs text-danger">
              or Payment Failed
            </span>
            <span className="text-text-muted">
              — signing, verification, or settlement did not go through at any step above; no response body is served.
            </span>
          </p>
        </div>

        <div className="mt-4">
          <LiveDemoPanel />
        </div>
      </section>
    </>
  );
}
