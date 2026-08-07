import NetworkBadge from "@/components/NetworkBadge";
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
          A patient-consent layer on Algorand under a family of x402-paid AI intelligence endpoints. Two open,
          broadly-useful endpoints anyone&rsquo;s agent can call and pay for in seconds — plus one consent-gated
          endpoint proving the patient-ownership story on-chain, for real, below.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-neutral-800 px-2.5 py-1 text-neutral-400">Entry type: Composite</span>
          <span className="rounded-full border border-neutral-800 px-2.5 py-1 text-neutral-400">Scheme: exact (USDC)</span>
          <span className="rounded-full border border-neutral-800 px-2.5 py-1 text-neutral-400">Facilitator: GoPlausible</span>
        </div>
      </header>

      <section className="mb-14">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">Live demo</h2>
        <LiveDemoPanel />
      </section>

      <section className="mb-14">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">On-chain consent</h2>
        <ConsentChecker />
      </section>

      <section className="mb-14">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">Endpoints &amp; pricing</h2>
        <PricingTable />
      </section>

      <footer className="border-t border-neutral-900 pt-6 text-sm text-neutral-500">
        <p>
          Built for the Algorand Foundation Global x402 Challenge. Every claim on this page is checkable: the
          triage/interaction endpoints are open x402-gated compute, the records endpoint additionally requires a
          currently-valid consent grant read live from the MedRailConsent contract on Algorand.
        </p>
        <p className="mt-2">
          See <code className="text-neutral-400">docs/ARCHITECTURE.md</code>,{" "}
          <code className="text-neutral-400">docs/COMPLIANCE.md</code>, and{" "}
          <code className="text-neutral-400">docs/JUDGES.md</code> in the repository for the full technical and
          competition-compliance writeup.
        </p>
      </footer>
    </main>
  );
}
