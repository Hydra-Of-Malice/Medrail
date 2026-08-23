"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import DataTable, { type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { API_BASE, EXPLORER_ADDRESS_URL } from "@/lib/config";

interface ActivityEntry {
  id: string;
  timestamp: string;
  requester: string | null;
  endpoint: string;
  method: string;
  price: string;
  status: number;
}

interface ActivityResponse {
  entries: ActivityEntry[];
  sinceServerStart: boolean;
}

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

type ServiceKey = "triage" | "interaction" | "records" | "other";

/** Friendly service name derived from the raw endpoint path — same three priced
 * services LiveDemoPanel and PricingTable already know about. */
function serviceInfo(endpoint: string): { key: ServiceKey; label: string } {
  if (endpoint.includes("/v1/triage")) return { key: "triage", label: "Triage" };
  if (endpoint.includes("/v1/interaction-check")) return { key: "interaction", label: "Interaction Check" };
  if (endpoint.includes("/v1/records/summary")) return { key: "records", label: "Records Summary" };
  return { key: "other", label: endpoint };
}

function StatusBadge({ status }: { status: number }) {
  if (status === 200) return <Badge tone="success">Completed</Badge>;
  if (status === 402) return <Badge tone="pending">Payment required</Badge>;
  if (status === 403) return <Badge tone="danger">Denied</Badge>;
  return <Badge tone="inactive">HTTP {status}</Badge>;
}

/** Slices the ISO timestamp instead of calling toLocaleString/toLocaleDateString,
 * which format differently on server vs. client and cause hydration mismatches. */
function formatTimestamp(iso: string): string {
  if (!iso || iso.length < 19) return iso || "—";
  const datePart = iso.slice(0, 10);
  const timePart = iso.slice(11, 19);
  return `${datePart} ${timePart} UTC`;
}

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "200", label: "Completed" },
  { value: "402", label: "Payment required" },
  { value: "403", label: "Denied" },
];

const SERVICE_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "triage", label: "Triage" },
  { value: "interaction", label: "Interaction" },
  { value: "records", label: "Records" },
];

export default function AgentsPage() {
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/v1/activity`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`activity fetch failed: ${res.status}`);
        return (await res.json()) as ActivityResponse;
      })
      .then((body) => setData(body))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const entries = useMemo(() => data?.entries ?? [], [data]);

  const visibleEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (statusFilter !== "all" && String(entry.status) !== statusFilter) return false;
      if (serviceFilter !== "all" && serviceInfo(entry.endpoint).key !== serviceFilter) return false;
      return true;
    });
  }, [entries, statusFilter, serviceFilter]);

  const columns: Column<ActivityEntry>[] = [
    {
      key: "requester",
      header: "Agent",
      render: (row) =>
        row.requester ? (
          <a
            href={EXPLORER_ADDRESS_URL(row.requester)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-trust underline underline-offset-2 hover:text-trust/80"
          >
            {shortAddr(row.requester)}
          </a>
        ) : (
          <span className="font-mono text-xs text-text-faint">unknown</span>
        ),
      sortValue: (row) => row.requester ?? "",
    },
    {
      key: "service",
      header: "Service",
      render: (row) => <span className="text-text">{serviceInfo(row.endpoint).label}</span>,
      sortValue: (row) => serviceInfo(row.endpoint).label,
    },
    {
      key: "price",
      header: "Payment",
      render: (row) => <span className="font-mono text-xs text-value">{row.price}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={row.status} />,
      sortValue: (row) => row.status,
    },
    {
      key: "timestamp",
      header: "Time",
      render: (row) => <span className="font-mono text-xs text-text-faint">{formatTimestamp(row.timestamp)}</span>,
      sortValue: (row) => row.timestamp,
    },
  ];

  return (
    <div>
      <PageHeader title="Agents" description="What are AI agents doing on MedRail?" />

      <div className="mb-6 rounded-[6px] border border-trust-dim bg-trust-soft px-4 py-3 text-sm leading-relaxed text-text">
        <span className="font-medium text-trust">Real activity — session-forward only.</span> Every row below
        is a real call this API instance actually served, but the log is kept in memory and starts empty
        whenever that process restarts. It is not the complete history of every call MedRail has ever
        served — only what happened since this instance came up.
        {!loading && data && (
          <span className="ml-1 text-text-faint">
            (confirmed by the API: sinceServerStart = {String(data.sinceServerStart)})
          </span>
        )}
      </div>

      {loading ? (
        <SkeletonRows rows={6} />
      ) : error ? (
        <ErrorState title="Couldn't load agent activity" description={error} onRetry={load} />
      ) : entries.length === 0 ? (
        <EmptyState
          title="No agent activity yet"
          description="This fills in as agents start calling MedRail's priced endpoints. Head to the developer page's live demo to generate some real activity."
          action={
            <a
              href="/developer#live-demo"
              className="inline-block rounded-[6px] bg-trust px-3 py-1.5 text-sm font-medium text-ink hover:bg-trust/90"
            >
              Go to live demo →
            </a>
          }
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs text-text-faint">
              Status
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-[4px] border border-line bg-surface-2 px-2 py-1 text-sm text-text focus:border-trust focus:outline-none"
              >
                {STATUS_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-text-faint">
              Service
              <select
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
                className="rounded-[4px] border border-line bg-surface-2 px-2 py-1 text-sm text-text focus:border-trust focus:outline-none"
              >
                {SERVICE_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <DataTable
            rows={visibleEntries}
            columns={columns}
            getKey={(row) => row.id}
            searchPlaceholder="Search by agent address or endpoint…"
            searchFn={(row, q) => (row.requester ?? "").toLowerCase().includes(q) || row.endpoint.toLowerCase().includes(q)}
            pageSize={10}
            emptyTitle="No matching activity"
            emptyDescription="Try a different status or service filter, or clear the search."
          />
        </>
      )}
    </div>
  );
}
