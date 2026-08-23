import { Fragment } from "react";
import Card from "./ui/Card";

const EXPLORER = (txId: string) => `https://lora.algokit.io/testnet/transaction/${txId}`;

/** The run of 2026-08-22 — patient, agent and service are three separate accounts. */
const TX = {
  triage: "DOSKCNKJRXIMY2UDSDZ377LKPZQIZJW5JHCGUAGKOYV6KUCFYKIA",
  interaction: "PLBFDDADW576IUCH62HGGYI4AJQNO3QXSENNDIBKAORWVMP7NVHQ",
  records: "COMJ3TQOGTKP6LXDJS7HZY7B45QZJQWXXJ23HQ3IDDQYD7GRK36A",
  audit: "E6ZTGEAOTLJQDYOUVBYJYL7LKTXHBGXGVTBKN3SR2NUPWJ2PIGQA",
  grant: "IG4XEBTMRCKI724ZVHSYUN4ECTYBXAGZM5N35NP4Y3ZVWECG7WUQ",
} as const;

const PARTIES = [
  { role: "Agent", note: "pays · holds its own keypair", addr: "UYBTLPHS6APCXVBDPASQMUIQCEORDIR6EMTVMNSDPSVRSR5HEPKQ5GO4YQ" },
  { role: "Patient", note: "granted this agent access, signing it themselves", addr: "56LFG5EEHIJ4ZVMPHUMJH6BST2O3D4DMG3AWRZ2SN7Y3LLUDVUDILO66YM" },
  { role: "Service", note: "receives · payTo", addr: "2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE" },
] as const;

const shortAddr = (a: string) => `${a.slice(0, 8)}…${a.slice(-4)}`;

const shortTx = (txId: string) => `${txId.slice(0, 8)}…${txId.slice(-6)}`;

interface TxLink {
  label: string;
  txId: string;
}

interface Step {
  n: string;
  cost: string;
  free?: boolean;
  call: string;
  detail: string;
  links?: TxLink[];
  highlight?: boolean;
  punchline?: string;
}

const STEPS: Step[] = [
  {
    n: "01",
    cost: "free",
    free: true,
    call: "GET /",
    detail:
      "The agent arrives knowing one URL and nothing else. The service index answers with every endpoint, its price, its gate, the consent contract's App ID, and the ARC-56 spec it would need to read that contract itself. Everything the agent does next is derived from that response.",
  },
  {
    n: "02",
    cost: "$0.02",
    call: "POST /v1/triage",
    detail:
      "The presentation needs urgency scoring. First call returns 402 with a price quote, the agent signs a USDC payment, retries, and gets a band, a score, and the red flags that fired — a deterministic rule engine, not a model.",
    links: [{ label: "settled payment", txId: TX.triage }],
  },
  {
    n: "03",
    cost: "$0.02",
    call: "POST /v1/interaction-check",
    detail:
      "Two medications are on board. warfarin + aspirin flags an anticoagulant/antiplatelet bleeding risk from the reference table — which materially changes management of a suspected cardiac event.",
    links: [{ label: "settled payment", txId: TX.interaction }],
  },
  {
    n: "04",
    cost: "free",
    free: true,
    call: "GET /v1/consent/status",
    highlight: true,
    detail:
      "The record is consent-gated. Before spending a cent on it, the agent asks the free consent oracle whether a grant from this patient to this requester is currently live, read straight from the MedRailConsent contract on Algorand.",
    punchline:
      "If the answer is no, the agent declines the spend and reports what it already has. It never pays to be told no.",
  },
  {
    n: "05",
    cost: "$0.05",
    call: "POST /v1/records/summary",
    detail:
      "Consent is active, so the spend is justified. The endpoint re-verifies the grant on-chain, confirms the address that signed the payment is the requester it is about to authorise, returns the summary, and writes the access into the patient's on-chain audit trail — naming the agent, so the patient can see on a public ledger exactly who read their record.",
    links: [
      { label: "settled payment", txId: TX.records },
      { label: "audit trail entry", txId: TX.audit },
    ],
  },
];

const TOTALS = [
  { value: "$0.09", label: "spent, end to end" },
  { value: "3", label: "settled Algorand transactions" },
  { value: "0", label: "accounts, API keys, invoices" },
];

export default function AgentFlowPanel() {
  return (
    <Card className="sm:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="font-display text-lg font-medium text-text">One agent run, no human in the loop</h3>
        <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-text-faint">
          already executed on TestNet
        </span>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-muted">
        A clinical triage agent is handed one case. It holds no MedRail account, no API key, and no prior
        relationship with the service. Here is what it did, in order — every payment below is a real Algorand
        transaction you can open right now.
      </p>

      <div className="mt-4 rounded-[6px] border border-line bg-surface-2 p-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[11px] uppercase tracking-wide text-text-faint">
            Three distinct parties
          </span>
          <a
            href={EXPLORER(TX.grant)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[11px] text-trust underline underline-offset-2 hover:text-trust/80"
          >
            the patient&rsquo;s own grant transaction →
          </a>
        </div>
        <dl className="mt-2 grid gap-2 sm:grid-cols-3">
          {PARTIES.map((p) => (
            <div key={p.role} className="min-w-0">
              <dt className="text-xs text-text-muted">
                {p.role} <span className="text-text-faint">— {p.note}</span>
              </dt>
              <dd className="mt-0.5 break-all font-mono text-[11px] text-text-faint">{shortAddr(p.addr)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs leading-relaxed text-text-faint">
          Three separate keypairs: the service can sign for none of the others, so the indexer shows
          sender &ne; receiver on all three payments, and the grant is signed by an account that is neither
          the payer nor the payee. Both wallets were funded from ours, though — TestNet ALGO and USDC have
          no other practical source — so these are independent parties, <em>not</em> external revenue.
        </p>
      </div>

      <ol className="mt-6">
        {STEPS.map((step, i) => (
          <Fragment key={step.n}>
            {i > 0 && <div aria-hidden className="ml-5 h-4 w-px bg-line sm:ml-6" />}
            <li
              className={`rounded-[6px] border p-3 sm:p-4 ${
                step.highlight ? "border-trust-dim bg-trust-soft" : "border-line bg-surface-2"
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <span className="font-mono text-[11px] tracking-wide text-text-faint">{step.n}</span>
                <span
                  className={`rounded-[4px] px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wide ${
                    step.free ? "bg-success/15 text-success" : "bg-value/15 text-value"
                  }`}
                >
                  {step.cost}
                </span>
                <span className="min-w-0 break-words font-mono text-xs text-text sm:text-sm">{step.call}</span>
              </div>

              <p className="mt-2 text-sm leading-relaxed text-text-muted">{step.detail}</p>

              {step.punchline && <p className="mt-2 text-sm font-medium text-trust">{step.punchline}</p>}

              {step.links && (
                <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
                  {step.links.map((link) => (
                    <a
                      key={link.txId}
                      href={EXPLORER(link.txId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 break-all font-mono text-xs text-value underline underline-offset-2 hover:text-value/80"
                    >
                      {link.label} · {shortTx(link.txId)} →
                    </a>
                  ))}
                </div>
              )}
            </li>
          </Fragment>
        ))}
      </ol>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {TOTALS.map((t) => (
          <div key={t.label} className="rounded-[6px] border border-line bg-surface-2 p-3">
            <div className="font-display text-xl tabular-nums text-text">{t.value}</div>
            <div className="mt-0.5 text-xs text-text-faint">{t.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <h4 className="font-mono text-xs uppercase tracking-wide text-text-faint">Reproduce it</h4>
        <pre className="mt-2 overflow-x-auto rounded-[6px] bg-surface-2 p-3 font-mono text-xs text-text-muted">
          npx tsx scripts/agent-demo.ts
        </pre>
        <p className="mt-2 text-xs leading-relaxed text-text-faint">
          Run from <code className="text-text-muted">api/</code> against a funded TestNet wallet. Triage and
          interaction checking are deterministic rule engines, not ML models; the record behind{" "}
          <code className="text-text-muted">/v1/records/summary</code> is synthetic. The transactions above
          are real settlements, from a run against a local API — the chain does not care where the server
          was, but the honest caveat belongs here.
        </p>
      </div>
    </Card>
  );
}
