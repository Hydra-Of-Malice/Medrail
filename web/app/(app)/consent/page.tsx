"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { SkeletonRows } from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import UserPanel from "@/components/UserPanel";
import DoctorPanel from "@/components/DoctorPanel";
import ConsentChecker from "@/components/ConsentChecker";
import { getConsentEvents, type ConsentEvent } from "@/lib/indexer";

const shortAddr = (a: string) => `${a.slice(0, 8)}…${a.slice(-4)}`;

function consentDetailHref(sender: string, requester: string, scope: string) {
  return `/consent/${encodeURIComponent(`${sender}|${requester}|${scope}`)}`;
}

function ConsentFeed() {
  const [events, setEvents] = useState<ConsentEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    setEvents(null);
    try {
      const all = await getConsentEvents(50);
      setEvents(all.filter((e) => e.action === "grant_access" || e.action === "revoke_access"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg text-text">Recently granted or revoked</h2>
        <span className="font-mono text-[11px] text-text-faint">live · MedRailConsent App 768743428</span>
      </div>
      <p className="mt-1 text-sm text-text-muted">
        The most recent grant and revoke calls against the consent contract, across every patient — read
        straight from the Algorand TestNet indexer.
      </p>

      <div className="mt-4">
        {error && (
          <ErrorState title="Couldn't load consent events" description={error} onRetry={load} />
        )}
        {!error && events === null && <SkeletonRows rows={5} />}
        {!error && events !== null && events.length === 0 && (
          <EmptyState
            title="No grants or revokes yet"
            description="Once a patient grants or revokes access on-chain, it will show up here."
          />
        )}
        {!error && events !== null && events.length > 0 && (
          <ul className="divide-y divide-line">
            {events.slice(0, 8).map((e) => (
              <li key={e.txId}>
                <Link
                  href={consentDetailHref(e.sender, e.args.requester ?? "", e.args.scope ?? "")}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[4px] py-3 transition hover:bg-surface-2"
                >
                  <Badge tone={e.action === "grant_access" ? "success" : "inactive"}>
                    {e.action === "grant_access" ? "granted" : "revoked"}
                  </Badge>
                  <span className="font-mono text-xs text-text">
                    {e.args.requester ? shortAddr(e.args.requester) : "unknown requester"}
                  </span>
                  <span className="font-mono text-xs text-text-faint">{e.args.scope}</span>
                  <span className="ml-auto text-xs text-text-faint">
                    {new Date(e.roundTime).toLocaleString()}
                  </span>
                  <span className="w-full font-mono text-[11px] text-text-faint sm:w-auto">
                    by {shortAddr(e.sender)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export default function ConsentPage() {
  return (
    <div>
      <PageHeader
        title="Consent"
        description="Every grant, revoke, request and access check below is a real, signed transaction against the MedRailConsent smart contract on Algorand TestNet — this is the authorization boundary for the whole platform, not a settings toggle."
      />

      <ConsentFeed />

      <section className="mt-8">
        <h2 className="font-display text-lg text-text">Your consent grants</h2>
        <p className="mt-1 text-sm text-text-muted">
          Acting as the patient: review who has asked for access, and grant, deny, or revoke it.
        </p>
        <div className="mt-4">
          <UserPanel />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg text-text">Requesting access as a hospital</h2>
        <p className="mt-1 text-sm text-text-muted">
          Acting as a requester: ask a patient for access, or look up any real address and run the live
          x402 payment plus consent flow against it.
        </p>
        <div className="mt-4">
          <DoctorPanel />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg text-text">Quick self-grant sandbox</h2>
        <p className="mt-1 text-sm text-text-muted">
          A minimal grant / revoke / check loop against your own connected account, for exercising the
          contract directly.
        </p>
        <div className="mt-4">
          <ConsentChecker />
        </div>
      </section>
    </div>
  );
}
