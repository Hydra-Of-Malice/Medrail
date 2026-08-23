"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Badge from "@/components/ui/Badge";
import { SkeletonRows } from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import { getPayments, type IndexerPayment } from "@/lib/indexer";
import { EXPLORER_ADDRESS_URL } from "@/lib/config";

/** MedRail's real, live payTo address — every settled x402 USDC payment in this
 * deployment lands here. Same address used throughout the app (see AgentFlowPanel). */
const MEDRAIL_PAYTO_ADDRESS = "2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE";

function shorten(value: string, head = 6, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function formatUsdc(amountMicroUsdc: number): string {
  return (amountMicroUsdc / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function TransactionsPage() {
  const [payments, setPayments] = useState<IndexerPayment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getPayments(MEDRAIL_PAYTO_ADDRESS, 100)
      .then((rows) => setPayments(rows))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load transactions."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const columns: Column<IndexerPayment>[] = [
    {
      key: "txId",
      header: "Transaction",
      render: (row) => (
        <span className="font-mono text-xs text-text">{shorten(row.txId)}</span>
      ),
      sortValue: (row) => row.txId,
    },
    {
      key: "note",
      header: "Payment",
      render: (row) => (
        <span className="font-mono text-xs text-text-muted">{row.note ?? "—"}</span>
      ),
    },
    {
      key: "amount",
      header: "Amount (USDC)",
      render: (row) => (
        <span className="font-mono text-sm tabular-nums text-text">{formatUsdc(row.amountMicroUsdc)}</span>
      ),
      sortValue: (row) => row.amountMicroUsdc,
      className: "text-right",
    },
    {
      key: "sender",
      header: "From",
      render: (row) => (
        <a
          href={EXPLORER_ADDRESS_URL(row.sender)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-xs text-trust underline decoration-trust/40 underline-offset-2 hover:text-trust/80"
        >
          {shorten(row.sender)}
        </a>
      ),
      sortValue: (row) => row.sender,
    },
    {
      key: "status",
      header: "Status",
      render: () => <Badge tone="success">Settled</Badge>,
    },
    {
      key: "time",
      header: "Time",
      render: (row) => <span className="text-xs text-text-muted">{formatTime(row.roundTime)}</span>,
      sortValue: (row) => row.round,
    },
  ];

  // Every column except "From" (which already renders its own explorer link) wraps
  // its cell content in a link to the transaction detail page — this is how each row
  // becomes clickable without nesting an <a> inside another <a>.
  const linkedColumns: Column<IndexerPayment>[] = columns.map((col) =>
    col.key === "sender"
      ? col
      : {
          ...col,
          render: (row) => (
            <Link href={`/transactions/${row.txId}`} className="block">
              {col.render(row)}
            </Link>
          ),
        },
  );

  const totalCount = payments?.length ?? 0;
  const totalVolumeMicro = (payments ?? []).reduce((sum, p) => sum + p.amountMicroUsdc, 0);
  const avgMicro = totalCount > 0 ? totalVolumeMicro / totalCount : 0;

  return (
    <div>
      <PageHeader
        title="Transactions"
        description={`Real, settled USDC payments to MedRail's payTo address on Algorand TestNet (${shorten(MEDRAIL_PAYTO_ADDRESS, 8, 8)}).`}
      />

      {!loading && !error && payments && payments.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard label="Transactions" value={String(totalCount)} hint="Most recent 100, settled" />
          <KpiCard label="Total Volume" value={`${formatUsdc(totalVolumeMicro)} USDC`} hint="Sum of amounts shown below" />
          <KpiCard label="Average Payment" value={`${formatUsdc(avgMicro)} USDC`} hint="Across transactions shown below" />
        </div>
      )}

      {loading ? (
        <SkeletonRows rows={8} />
      ) : error ? (
        <ErrorState
          title="Couldn't load transaction history"
          description={error}
          onRetry={load}
        />
      ) : !payments || payments.length === 0 ? (
        <EmptyState
          title="No settled payments yet"
          description="No USDC transfers to MedRail's payTo address have been found on TestNet."
        />
      ) : (
        <>
          <p className="mb-3 text-xs text-text-faint">
            The Payment column shows each transaction&apos;s raw on-chain note — it confirms an x402
            payment settled but does not identify which endpoint was called. For endpoint-level
            detail, see{" "}
            <Link href="/agents" className="text-trust underline decoration-trust/40 underline-offset-2">
              Agents
            </Link>
            .
          </p>
          <DataTable
            rows={payments}
            columns={linkedColumns}
            getKey={(row) => row.txId}
            searchPlaceholder="Search by transaction ID or sender address…"
            searchFn={(row, q) => row.txId.toLowerCase().includes(q) || row.sender.toLowerCase().includes(q)}
            pageSize={10}
            emptyTitle="No matching transactions"
            emptyDescription="Try a different transaction ID or sender address."
          />
        </>
      )}
    </div>
  );
}
