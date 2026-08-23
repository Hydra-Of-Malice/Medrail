"use client";

import { Fragment, useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { SkeletonRows } from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import { EXPLORER_TX_URL, EXPLORER_ADDRESS_URL } from "@/lib/config";
import { getConsentEvents, type ConsentEvent } from "@/lib/indexer";

const shortAddr = (a: string) => (a.length > 12 ? `${a.slice(0, 8)}…${a.slice(-4)}` : a);
const shortTx = (t: string) => (t.length > 14 ? `${t.slice(0, 8)}…${t.slice(-6)}` : t);

type Stage = "REQUESTED" | "GRANTED" | "ACCESS CHECKED" | "AUDITED" | "REVOKED";

type BadgeTone = "success" | "pending" | "danger" | "trust" | "inactive";

const STAGE_TONE: Record<Stage, BadgeTone> = {
  REQUESTED: "pending",
  GRANTED: "success",
  "ACCESS CHECKED": "trust",
  AUDITED: "trust",
  REVOKED: "inactive",
};

function stageFor(event: ConsentEvent): Stage {
  switch (event.action) {
    case "request_access":
      return "REQUESTED";
    case "grant_access":
      return "GRANTED";
    case "revoke_access":
      return "REVOKED";
    case "log_access":
      return event.args.action === "consent_checked" ? "ACCESS CHECKED" : "AUDITED";
  }
}

function matches(event: ConsentEvent, patient: string, requester: string, scope: string): boolean {
  if (event.action === "grant_access" || event.action === "revoke_access") {
    return event.sender === patient && event.args.requester === requester && event.args.scope === scope;
  }
  if (event.action === "request_access") {
    return event.args.patient === patient && event.sender === requester && event.args.scope === scope;
  }
  // log_access
  return event.args.patient === patient && event.args.requester === requester && event.args.scope === scope;
}

interface StatusInfo {
  label: string;
  tone: BadgeTone;
}

function computeStatus(sorted: ConsentEvent[]): StatusInfo {
  for (let i = sorted.length - 1; i >= 0; i--) {
    const e = sorted[i];
    if (e.action === "grant_access") return { label: "ACTIVE", tone: "success" };
    if (e.action === "revoke_access") return { label: "REVOKED", tone: "inactive" };
  }
  if (sorted.some((e) => e.action === "request_access")) {
    return { label: "REQUESTED, NOT YET GRANTED", tone: "pending" };
  }
  return { label: "NO GRANT ON RECORD", tone: "inactive" };
}

export default function ConsentTimeline({
  patient,
  requester,
  scope,
}: {
  patient: string;
  requester: string;
  scope: string;
}) {
  const [events, setEvents] = useState<ConsentEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    setEvents(null);
    try {
      const all = await getConsentEvents(200);
      setEvents(all.filter((e) => matches(e, patient, requester, scope)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient, requester, scope]);

  if (error) {
    return <ErrorState title="Couldn't load this consent history" description={error} onRetry={load} />;
  }

  if (events === null) {
    return (
      <Card>
        <SkeletonRows rows={6} />
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <EmptyState
        title="No on-chain history for this identifier"
        description="No grant, revoke, request, or audit event on MedRailConsent matches this patient, requester, and scope."
      />
    );
  }

  const sorted = [...events].sort((a, b) => a.round - b.round);
  const status = computeStatus(sorted);

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg text-text">Grant summary</h2>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-xs text-text-faint">Patient</dt>
            <dd>
              <a
                href={EXPLORER_ADDRESS_URL(patient)}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all font-mono text-xs text-text underline underline-offset-2 hover:text-trust"
              >
                {shortAddr(patient)}
              </a>
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-text-faint">Requester</dt>
            <dd>
              <a
                href={EXPLORER_ADDRESS_URL(requester)}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all font-mono text-xs text-text underline underline-offset-2 hover:text-trust"
              >
                {shortAddr(requester)}
              </a>
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-text-faint">Scope</dt>
            <dd className="break-all font-mono text-xs text-text">{scope}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-text-faint">
          Verified on-chain via <code className="text-text-muted">MedRailConsent</code>, App{" "}
          <code className="text-text-muted">768743428</code>, Algorand TestNet — every stage below is a
          real, settled transaction decoded straight from the indexer.
        </p>
      </Card>

      <Card>
        <h2 className="font-display text-lg text-text">Lifecycle timeline</h2>
        <p className="mt-1 text-sm text-text-muted">
          Every matching event for this patient / requester / scope triple, oldest first.
        </p>
        <ol className="mt-4">
          {sorted.map((event, i) => {
            const stage = stageFor(event);
            return (
              <Fragment key={event.txId}>
                {i > 0 && <div aria-hidden className="ml-5 h-4 w-px bg-line sm:ml-6" />}
                <li className="rounded-[6px] border border-line bg-surface-2 p-3 sm:p-4">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                    <span className="font-mono text-[11px] tracking-wide text-text-faint">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <Badge tone={STAGE_TONE[stage]}>{stage}</Badge>
                    <span className="text-xs text-text-faint">{new Date(event.roundTime).toLocaleString()}</span>
                  </div>

                  <p className="mt-2 text-sm text-text-muted">
                    Sender{" "}
                    <a
                      href={EXPLORER_ADDRESS_URL(event.sender)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-text underline underline-offset-2 hover:text-trust"
                    >
                      {shortAddr(event.sender)}
                    </a>
                  </p>

                  <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                    {Object.entries(event.args).map(([key, value]) => (
                      <div key={key} className="min-w-0">
                        <dt className="text-text-faint">{key}</dt>
                        <dd className="break-all font-mono text-text-muted">{value}</dd>
                      </div>
                    ))}
                  </dl>

                  <a
                    href={EXPLORER_TX_URL(event.txId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2.5 inline-block break-all font-mono text-xs text-value underline underline-offset-2 hover:text-value/80"
                  >
                    {shortTx(event.txId)} →
                  </a>
                </li>
              </Fragment>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
