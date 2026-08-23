"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Badge from "@/components/ui/Badge";
import KpiCard from "@/components/ui/KpiCard";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { getConsentEvents, type ConsentEvent } from "@/lib/indexer";
import { EXPLORER_ADDRESS_URL, EXPLORER_TX_URL } from "@/lib/config";

const shortAddr = (a: string) => (a && a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-4)}` : a || "—");
const shortTx = (t: string) => (t && t.length > 14 ? `${t.slice(0, 8)}…${t.slice(-6)}` : t || "—");

function actionTone(action: string): "success" | "danger" | "trust" {
  const a = (action || "").toLowerCase();
  if (a.includes("deny") || a.includes("denied") || a.includes("reject") || a.includes("fail")) return "danger";
  if (a.includes("grant") || a.includes("allow") || a.includes("success") || a.includes("verified") || a.includes("ok") || a.includes("permit"))
    return "success";
  return "trust";
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AuditPage() {
  const [entries, setEntries] = useState<ConsentEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [patientFilter, setPatientFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const events = await getConsentEvents(200);
      setEntries(events.filter((e) => e.action === "log_access"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const patients = useMemo(
    () => Array.from(new Set((entries ?? []).map((e) => e.args.patient).filter(Boolean))).sort(),
    [entries],
  );
  const actions = useMemo(
    () => Array.from(new Set((entries ?? []).map((e) => e.args.action).filter(Boolean))).sort(),
    [entries],
  );

  const filtered = useMemo(() => {
    return (entries ?? []).filter(
      (e) =>
        (patientFilter === "all" || e.args.patient === patientFilter) &&
        (actionFilter === "all" || e.args.action === actionFilter),
    );
  }, [entries, patientFilter, actionFilter]);

  const stats = useMemo(() => {
    const list = entries ?? [];
    if (list.length === 0) return null;
    const times = [...list.map((e) => e.roundTime)].sort();
    return { total: list.length, earliest: times[0], latest: times[times.length - 1] };
  }, [entries]);

  const columns: Column<ConsentEvent>[] = [
    {
      key: "patient",
      header: "Patient",
      sortValue: (row) => row.args.patient ?? "",
      render: (row) => (
        <a
          href={EXPLORER_ADDRESS_URL(row.args.patient ?? "")}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-text-muted hover:text-trust"
          title={row.args.patient}
        >
          {shortAddr(row.args.patient ?? "")}
        </a>
      ),
    },
    {
      key: "requester",
      header: "Requester",
      sortValue: (row) => row.args.requester ?? "",
      render: (row) => (
        <a
          href={EXPLORER_ADDRESS_URL(row.args.requester ?? "")}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-text-muted hover:text-trust"
          title={row.args.requester}
        >
          {shortAddr(row.args.requester ?? "")}
        </a>
      ),
    },
    {
      key: "action",
      header: "Action",
      sortValue: (row) => row.args.action ?? "",
      render: (row) => <Badge tone={actionTone(row.args.action ?? "")}>{row.args.action || "—"}</Badge>,
    },
    {
      key: "scope",
      header: "Scope",
      sortValue: (row) => row.args.scope ?? "",
      render: (row) => <span className="font-mono text-xs text-text-muted">{row.args.scope || "—"}</span>,
    },
    {
      key: "endpoint",
      header: "Endpoint",
      sortValue: (row) => row.args.endpoint ?? "",
      render: (row) => <span className="font-mono text-xs text-text-muted">{row.args.endpoint || "—"}</span>,
    },
    {
      key: "time",
      header: "Time",
      sortValue: (row) => row.roundTime,
      render: (row) => <span className="text-xs text-text-muted">{formatTime(row.roundTime)}</span>,
    },
    {
      key: "tx",
      header: "Transaction",
      render: (row) => (
        <a
          href={EXPLORER_TX_URL(row.txId)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-value hover:underline"
          title={row.txId}
        >
          {shortTx(row.txId)}
        </a>
      ),
    },
  ];

  const searchFn = (row: ConsentEvent, q: string) =>
    (row.args.patient ?? "").toLowerCase().includes(q) ||
    (row.args.requester ?? "").toLowerCase().includes(q) ||
    (row.args.scope ?? "").toLowerCase().includes(q) ||
    (row.args.endpoint ?? "").toLowerCase().includes(q);

  return (
    <div>
      <PageHeader
        title="Audit Trail"
        description="Read directly from Algorand transaction history against the deployed MedRailConsent contract (App 768743428, TestNet) — every log_access call the contract has recorded. This is not an editable application log: nothing here can be altered or deleted after the fact, only appended to by new on-chain transactions."
      />

      {loading && <SkeletonRows rows={6} />}

      {!loading && error && <ErrorState title="Couldn't load the audit trail" description={error} onRetry={load} />}

      {!loading && !error && entries && entries.length === 0 && (
        <EmptyState
          title="No audit entries yet"
          description="No log_access calls have been recorded on-chain against the MedRailConsent contract yet."
        />
      )}

      {!loading && !error && entries && entries.length > 0 && stats && (
        <>
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiCard label="Audit Entries" value={String(stats.total)} hint="log_access calls found on-chain" />
            <KpiCard label="Earliest" value={formatTime(stats.earliest)} />
            <KpiCard label="Latest" value={formatTime(stats.latest)} />
          </div>

          <div className="mb-3 flex flex-wrap gap-3">
            <select
              value={patientFilter}
              onChange={(e) => setPatientFilter(e.target.value)}
              className="rounded-[6px] border border-line bg-surface-2 px-3 py-2 text-sm text-text focus:border-trust focus:outline-none"
            >
              <option value="all">All patients</option>
              {patients.map((p) => (
                <option key={p} value={p}>
                  {shortAddr(p)}
                </option>
              ))}
            </select>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="rounded-[6px] border border-line bg-surface-2 px-3 py-2 text-sm text-text focus:border-trust focus:outline-none"
            >
              <option value="all">All actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <DataTable
            rows={filtered}
            columns={columns}
            getKey={(row) => row.txId}
            searchPlaceholder="Search patient, requester, scope, endpoint…"
            searchFn={searchFn}
            pageSize={15}
            emptyTitle="No matching entries"
            emptyDescription="Try a different search, or clear the filters above."
          />
        </>
      )}
    </div>
  );
}
