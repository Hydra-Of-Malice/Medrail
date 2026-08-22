import NetworkBadge from "@/components/NetworkBadge";
import AgentFlowPanel from "@/components/AgentFlowPanel";
import LiveDemoPanel from "@/components/LiveDemoPanel";
import PricingTable from "@/components/PricingTable";
import ConsentChecker from "@/components/ConsentChecker";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-14">
      <header className="mb-12">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="font-mono text-xs uppercase tracking-widest text-neutral-500">
            Global x402 Challenge — Algorand Foundation
          </span>
          <NetworkBadge />
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-neutral-50 sm:text-5xl">MedRail</h1>
        <p className="mt-4 max-w-2xl text-lg text-neutral-400">
          An AI agent triaging a case needs three things: an urgency score, a drug-interaction check, and the
          patient&rsquo;s record. Today that is three vendor signups, three API keys, and three invoices — and
          after all of it the agent still cannot legally touch the record.
        </p>
        <p className="mt-4 max-w-2xl text-base text-neutral-500">
          MedRail is those three services behind x402, priced per call, plus a patient-consent contract on
          Algorand that decides who may read a record. An agent discovers the catalogue at{" "}
          <code className="text-neutral-400">GET /</code>, pays in USDC per request, and proves consent
          on-chain. No account. No API key. No human.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-neutral-800 px-2.5 py-1 text-neutral-400">
            Consumer: autonomous agents
          </span>
          <span className="rounded-full border border-neutral-800 px-2.5 py-1 text-neutral-400">Entry type: Composite</span>
          <span className="rounded-full border border-neutral-800 px-2.5 py-1 text-neutral-400">Scheme: exact (USDC)</span>
          <span className="rounded-full border border-neutral-800 px-2.5 py-1 text-neutral-400">Facilitator: GoPlausible</span>
        </div>
      </header>

      <section className="mb-14">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          What the agent actually does
        </h2>
        <AgentFlowPanel />
      </section>

      <section className="mb-14">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Live demo — you, standing in for the agent
        </h2>
        <p className="mb-4 max-w-3xl text-sm text-neutral-400">
          The panel below is not the product; the intended caller has no browser. It is a window onto the run
          above — a throwaway keypair in this tab stands in for the agent&rsquo;s wallet so you can watch one
          x402 call happen for real: the 402 quote, the signed USDC payment, settlement on Algorand, then the
          response. Every button here is something the agent does on its own.
        </p>
        <LiveDemoPanel />
      </section>

      <section className="mb-14">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">On-chain consent</h2>
        <ConsentChecker />

        <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950 p-5">
          <h3 className="font-mono text-xs uppercase tracking-wide text-amber-500">
            The payment is the authentication
          </h3>
          <p className="mt-2 max-w-3xl text-sm text-neutral-400">
            <code className="text-neutral-300">/v1/records/summary</code> recovers the Algorand address that
            signed the x402 payment and refuses the request unless it matches the{" "}
            <code className="text-neutral-300">requesterAddress</code> whose consent it is checking. Paying
            proves <em className="text-neutral-300">who</em> is calling; the on-chain grant decides what that
            identity may read. Settle a perfectly valid payment under someone else&rsquo;s address and you get
            a 403, not a record — so no forged identity ever reaches the patient&rsquo;s audit trail.
          </p>
          <p className="mt-2 max-w-3xl text-sm text-neutral-400">
            No API key can do that. A key proves someone knows a string. A signature proves this account
            authorised this request — which is what turns the consent check from a paywall into an
            authorisation decision.
          </p>
        </div>
      </section>

      <section className="mb-14">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">Endpoints &amp; pricing</h2>
        <PricingTable />
      </section>

      <footer className="border-t border-neutral-900 pt-6 text-sm text-neutral-500">
        <p>
          Built for the Algorand Foundation Global x402 Challenge. Every claim on this page is checkable: the
          triage/interaction endpoints are open x402-gated compute any agent can discover and pay for, and the
          records endpoint additionally requires a currently-valid consent grant read live from the
          MedRailConsent contract on Algorand.
        </p>
        <p className="mt-2">
          The agent run above is <code className="text-neutral-400">api/scripts/agent-demo.ts</code>. See{" "}
          <code className="text-neutral-400">docs/ARCHITECTURE.md</code>,{" "}
          <code className="text-neutral-400">docs/COMPLIANCE.md</code>, and{" "}
          <code className="text-neutral-400">docs/JUDGES.md</code> in the repository for the full technical and
          competition-compliance writeup.
        </p>
      </footer>
    </main>
  );
}
