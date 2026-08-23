"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Tag from "@/components/ui/Tag";
import { SkeletonRows } from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import { getPayments, type IndexerPayment } from "@/lib/indexer";
import { EXPLORER_TX_URL, EXPLORER_ADDRESS_URL } from "@/lib/config";

const MEDRAIL_PAYTO_ADDRESS = "2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE";

function formatUsdc(amountMicroUsdc: number): string {
  return (amountMicroUsdc / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "full",
    timeStyle: "long",
  });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0">
      <dt className="font-mono text-[11px] uppercase tracking-wide text-text-faint">{label}</dt>
      <dd className="mt-1 break-all text-sm text-text">{children}</dd>
    </div>
  );
}

export default function TransactionDetailClient({ id }: { id: string }) {
  const [status, setStatus] = useState<"loading" | "found" | "not-found" | "error">("loading");
  const [payment, setPayment] = useState<IndexerPayment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setStatus("loading");
    setError(null);
    setPayment(null);

    getPayments(MEDRAIL_PAYTO_ADDRESS, 100)
      .then(async (rows) => {
        const match = rows.find((r) => r.txId === id);
        if (match) {
          setPayment(match);
          setStatus("found");
          return;
        }
        // Not in the most recent 100 — widen the window once before giving up.
        const wider = await getPayments(MEDRAIL_PAYTO_ADDRESS, 300);
        const widerMatch = wider.find((r) => r.txId === id);
        if (widerMatch) {
          setPayment(widerMatch);
          setStatus("found");
        } else {
          setStatus("not-found");
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load transaction.");
        setStatus("error");
      });
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Transaction"
        description="Detail for one settled USDC payment, read live from the Algorand TestNet indexer."
        action={
          <Link
            href="/transactions"
            className="rounded-[4px] border border-line-strong px-3 py-1.5 text-sm text-text-muted transition hover:border-line-strong hover:text-text"
          >
            Back to Transactions
          </Link>
        }
      />

      {status === "loading" && <SkeletonRows rows={7} />}

      {status === "error" && (
        <ErrorState title="Couldn't load this transaction" description={error ?? "Unknown error."} onRetry={load} />
      )}

      {status === "not-found" && (
        <EmptyState
          title="Transaction not found in recent settled payments"
          description={`No payment with transaction ID "${id}" was found among the most recent 300 settled USDC transfers to MedRail's payTo address on TestNet. It may be older than this window, unsettled, or the ID may be incorrect.`}
        />
      )}

      {status === "found" && payment && (
        <Card>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge tone="success">Settled</Badge>
            <Tag tone="trust">Algorand TestNet</Tag>
          </div>

          <dl>
            <Field label="Transaction ID">
              <span className="font-mono">{payment.txId}</span>
            </Field>

            <Field label="Amount">
              <span className="font-mono tabular-nums">{formatUsdc(payment.amountMicroUsdc)} USDC</span>
            </Field>

            <Field label="From (sender)">
              <a
                href={EXPLORER_ADDRESS_URL(payment.sender)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-trust underline decoration-trust/40 underline-offset-2 hover:text-trust/80"
              >
                {payment.sender}
              </a>
            </Field>

            <Field label="To (receiver)">
              <a
                href={EXPLORER_ADDRESS_URL(payment.receiver)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-trust underline decoration-trust/40 underline-offset-2 hover:text-trust/80"
              >
                {payment.receiver}
              </a>
            </Field>

            <Field label="Round">
              <span className="font-mono tabular-nums">{payment.round}</span>
            </Field>

            <Field label="Round Time">{formatTime(payment.roundTime)}</Field>

            <Field label="Note">
              <span className="font-mono text-text-muted">{payment.note ?? "—"}</span>
            </Field>
          </dl>

          <a
            href={EXPLORER_TX_URL(payment.txId)}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex items-center gap-1.5 rounded-[6px] border border-trust-dim bg-trust-soft px-3 py-2 text-sm text-trust transition hover:border-trust"
          >
            View on Algorand Explorer ↗
          </a>
        </Card>
      )}
    </div>
  );
}
