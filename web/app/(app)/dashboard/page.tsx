"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import KpiCard from "@/components/ui/KpiCard";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import Skeleton, { SkeletonRows } from "@/components/ui/Skeleton";
import { getHealth, type HealthResponse } from "@/lib/api";
import { getPayments, getConsentEvents, type IndexerPayment, type ConsentEvent, type ConsentAction } from "@/lib/indexer";
import { API_BASE, EXPLORER_TX_URL } from "@/lib/config";
import { PaymentsBarChart, ConsentActionsChart } from "@/components/pages/dashboard/Charts";

/** MedRail's real, live payTo address — every settled x402 USDC payment in this
 * deployment lands here. Same address used throughout the app (see Transactions page). */
const MEDRAIL_PAYTO_ADDRESS = "2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE";

/** GET /v1/health also returns a `chain` block that lib/api.ts's HealthResponse type
 * doesn't declare — extending it here (rather than editing the shared lib) keeps this
 * page's use of the real field type-safe without touching a file other agents own. */
interface HealthWithChain extends HealthResponse {
  chain?: { warning?: string | null } | null;
}

interface ActivityEntry {
  id: string;
  timestamp: string;
  requester: string;
  endpoint: string;
  method: string;
  price: string;
  status: number | string;
}

interface ActivityResponse {
  entries: ActivityEntry[];
  sinceServerStart: boolean;
}

async function fetchActivity(): Promise<ActivityResponse> {
  const res = await fetch(`${API_BASE}/v1/activity`, { cache: "no-store" });
  if (!res.ok) throw new Error(`activity request failed: ${res.status}`);
  return res.json();
}

const shortAddr = (a: string) => `${a.slice(0, 8)}…${a.slice(-4)}`;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Distinct (patient, requester, scope) consent grants, walked in on-chain order.
 * Key is sender (the granting patient) + requester + scope, exactly as specced:
 * a grant_access call activates the key, a revoke_access call for the same key
 * deactivates it. The final state per key, after replaying every event in
 * ascending round order, is what's currently active. */
function computeActiveGrants(events: ConsentEvent[]): number {
  const sorted = [...events].sort((a, b) => a.round - b.round);
  const state = new Map<string, boolean>();
  for (const e of sorted) {
    if (e.action === "grant_access" || e.action === "revoke_access") {
      const requester = e.args.requester ?? "";
      const scope = e.args.scope ?? "";
      const key = `${e.sender}|${requester}|${scope}`;
      state.set(key, e.action === "grant_access");
    }
  }
  let active = 0;
  for (const isActive of state.values()) if (isActive) active += 1;
  return active;
}

function statusTone(status: number | string): "success" | "pending" | "danger" | "trust" | "inactive" {
  if (typeof status === "number") {
    if (status >= 200 && status < 300) return "success";
    if (status === 402) return "pending";
    return "danger";
  }
  const s = status.toLowerCase();
  if (s.includes("success") || s.includes("paid") || s.includes("ok")) return "success";
  if (s.includes("pending") || s.includes("402")) return "pending";
  if (s.includes("fail") || s.includes("error") || s.includes("denied")) return "danger";
  return "inactive";
}

const ACTION_LABEL: Record<ConsentAction, string> = {
  grant_access: "grant",
  revoke_access: "revoke",
  request_access: "request",
  log_access: "log",
};

function actionTone(action: ConsentAction): "success" | "pending" | "danger" | "trust" | "inactive" {
  switch (action) {
    case "grant_access":
      return "success";
    case "revoke_access":
      return "danger";
    case "request_access":
      return "pending";
    case "log_access":
      return "trust";
  }
}

function describeConsentEvent(e: ConsentEvent): string {
  switch (e.action) {
    case "grant_access":
      return `granted "${e.args.scope}" to ${shortAddr(e.args.requester ?? "")}`;
    case "revoke_access":
      return `revoked "${e.args.scope}" from ${shortAddr(e.args.requester ?? "")}`;
    case "request_access":
      return `requested "${e.args.scope}" access to ${shortAddr(e.args.patient ?? "")}`;
    case "log_access":
      return `${shortAddr(e.args.requester ?? "")} called ${e.args.endpoint ?? "an endpoint"} for ${shortAddr(e.args.patient ?? "")}`;
    default:
      return "";
  }
}

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthWithChain | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null);
  const [apiLoading, setApiLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const [payments, setPayments] = useState<IndexerPayment[] | null>(null);
  // Fed by getConsentEvents(200) — enough history for the "active grants" KPI and
  // the by-action-type chart to be meaningfully correct, not just decorative.
  const [consentEvents, setConsentEvents] = useState<ConsentEvent[] | null>(null);
  // A separate, smaller getConsentEvents(50) call feeds only the "recent events" list,
  // exactly as specced — kept independent of the 200-row fetch above rather than
  // reusing/slicing it, even though in practice the newest 5 rows are identical either way.
  const [recentConsentEvents, setRecentConsentEvents] = useState<ConsentEvent[] | null>(null);
  const [chainLoading, setChainLoading] = useState(true);
  const [chainError, setChainError] = useState<string | null>(null);

  const loadApi = useCallback(() => {
    setApiLoading(true);
    setApiError(null);
    Promise.all([getHealth(), fetchActivity()])
      .then(([h, a]) => {
        setHealth(h as HealthWithChain);
        setActivity(a.entries);
      })
      .catch((err) => setApiError(err instanceof Error ? err.message : "Failed to reach the MedRail API."))
      .finally(() => setApiLoading(false));
  }, []);

  const loadChain = useCallback(() => {
    setChainLoading(true);
    setChainError(null);
    Promise.all([getPayments(MEDRAIL_PAYTO_ADDRESS, 100), getConsentEvents(200), getConsentEvents(50)])
      .then(([p, c, recent]) => {
        setPayments(p);
        setConsentEvents(c);
        setRecentConsentEvents(recent);
      })
      .catch((err) => setChainError(err instanceof Error ? err.message : "Failed to reach the Algorand TestNet indexer."))
      .finally(() => setChainLoading(false));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadApi();
    loadChain();
  }, [loadApi, loadChain]);

  const paymentCount = payments?.length ?? 0;
  const usdcVolume = (payments ?? []).reduce((sum, p) => sum + p.amountMicroUsdc, 0) / 1_000_000;
  const activeGrants = consentEvents ? computeActiveGrants(consentEvents) : 0;
  const apiCallCount = activity?.length ?? 0;

  const recentActivity = (activity ?? []).slice(0, 5);
  const recentConsent = (recentConsentEvents ?? []).slice(0, 5);
  // Most recent 20 payments, reordered oldest → newest so the chart reads left-to-right.
  const chartPayments = (payments ?? []).slice(0, 20).reverse();

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="MedRail system overview — real TestNet payments, on-chain consent, and live API activity in one place."
      />

      {/* 1. System health strip */}
      <div className="mb-6">
        {apiError && !health ? (
          <ErrorState title="Can't reach the MedRail API" description={apiError} onRetry={loadApi} />
        ) : health ? (
          <Card tone={health.chain?.warning ? "danger" : "trust"}>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Badge tone={health.ok ? "success" : "danger"}>{health.ok ? "API OK" : "API DOWN"}</Badge>
              <span className="text-sm text-text-muted">
                Network <span className="font-mono text-text">{health.network}</span>
              </span>
              <span className="text-sm text-text-muted">
                Consent App ID <span className="font-mono text-text">{health.consentAppId ?? "—"}</span>
              </span>
              <span className="ml-auto">
                <Badge tone={health.chain?.warning ? "danger" : "success"}>
                  {health.chain?.warning ? health.chain.warning : "healthy"}
                </Badge>
              </span>
            </div>
          </Card>
        ) : (
          <Skeleton className="h-14 w-full" />
        )}
      </div>

      {/* 2. KPI row */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Settled payments"
          value={payments ? String(paymentCount) : chainLoading ? "…" : "—"}
          hint={payments ? "To MedRail's payTo address" : chainError ? "Indexer unavailable" : "Loading…"}
        />
        <KpiCard
          label="USDC volume"
          value={payments ? `$${usdcVolume.toFixed(2)}` : chainLoading ? "…" : "—"}
          hint={payments ? "Sum of settled payments" : chainError ? "Indexer unavailable" : "Loading…"}
        />
        <KpiCard
          label="Active consent grants"
          value={consentEvents ? String(activeGrants) : chainLoading ? "…" : "—"}
          hint={consentEvents ? "Distinct requester + scope, not revoked" : chainError ? "Indexer unavailable" : "Loading…"}
        />
        <KpiCard
          label="API calls"
          value={activity ? String(apiCallCount) : apiLoading ? "…" : "—"}
          hint="since this API instance started"
        />
      </div>

      {/* 3. Charts */}
      {chainError && !payments && !consentEvents ? (
        <div className="mb-6">
          <ErrorState title="Can't reach the Algorand TestNet indexer" description={chainError} onRetry={loadChain} />
        </div>
      ) : (
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <Card>
            <h2 className="font-display text-base text-text">Recent payment amounts</h2>
            <p className="mt-1 text-xs text-text-faint">
              Most recent settled payments to MedRail&rsquo;s payTo address, oldest → newest, left to right.
            </p>
            <div className="mt-4">
              {chainLoading && !payments ? (
                <Skeleton className="h-36 w-full" />
              ) : chartPayments.length === 0 ? (
                <p className="py-8 text-center text-sm text-text-faint">No settled payments yet.</p>
              ) : (
                <PaymentsBarChart payments={chartPayments} />
              )}
            </div>
          </Card>

          <Card>
            <h2 className="font-display text-base text-text">Consent events by action</h2>
            <p className="mt-1 text-xs text-text-faint">
              Counts across the most recent 200 calls to the MedRailConsent contract.
            </p>
            <div className="mt-4">
              {chainLoading && !consentEvents ? (
                <Skeleton className="h-36 w-full" />
              ) : (consentEvents?.length ?? 0) === 0 ? (
                <p className="py-8 text-center text-sm text-text-faint">No consent events yet.</p>
              ) : (
                <ConsentActionsChart events={consentEvents ?? []} />
              )}
            </div>
          </Card>
        </div>
      )}

      {/* 4 & 5. Recent activity + recent consent/audit events */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base text-text">Recent agent activity</h2>
            <Link href="/agents" className="text-xs text-trust underline decoration-trust/40 underline-offset-2">
              View all
            </Link>
          </div>
          <p className="mt-1 text-xs text-text-faint">Showing activity since this API instance started.</p>
          <div className="mt-4">
            {apiError && !activity ? (
              <ErrorState title="Couldn't load activity" description={apiError} onRetry={loadApi} />
            ) : apiLoading && !activity ? (
              <SkeletonRows rows={5} />
            ) : recentActivity.length === 0 ? (
              <EmptyState
                title="No API calls yet"
                description="Calls to priced endpoints will show up here as soon as an agent makes one."
              />
            ) : (
              <ul className="divide-y divide-line">
                {recentActivity.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                    <span className="font-mono text-xs text-text">
                      {entry.requester ? shortAddr(entry.requester) : "unknown"}
                    </span>
                    <span className="font-mono text-xs text-text-muted">
                      {entry.method} {entry.endpoint}
                    </span>
                    <span className="font-mono text-xs text-value">{entry.price}</span>
                    <span className="ml-auto">
                      <Badge tone={statusTone(entry.status)}>{String(entry.status)}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base text-text">Recent consent &amp; audit events</h2>
            <Link href="/audit" className="text-xs text-trust underline decoration-trust/40 underline-offset-2">
              View all
            </Link>
          </div>
          <p className="mt-1 text-xs text-text-faint">Latest calls to the MedRailConsent contract, from the TestNet indexer.</p>
          <div className="mt-4">
            {chainError && !recentConsentEvents ? (
              <ErrorState title="Couldn't load consent events" description={chainError} onRetry={loadChain} />
            ) : chainLoading && !recentConsentEvents ? (
              <SkeletonRows rows={5} />
            ) : recentConsent.length === 0 ? (
              <EmptyState
                title="No consent events yet"
                description="Grants, revokes, requests and access logs will show up here."
              />
            ) : (
              <ul className="divide-y divide-line">
                {recentConsent.map((e) => (
                  <li key={e.txId} className="py-2.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Badge tone={actionTone(e.action)}>{ACTION_LABEL[e.action]}</Badge>
                      <span className="text-xs text-text-muted">{describeConsentEvent(e)}</span>
                      <span className="ml-auto text-xs text-text-faint">{formatTime(e.roundTime)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      <span className="font-mono text-[11px] text-text-faint">by {shortAddr(e.sender)}</span>
                      <a
                        href={EXPLORER_TX_URL(e.txId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[11px] text-trust underline decoration-trust/40 underline-offset-2"
                      >
                        view tx ↗
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
