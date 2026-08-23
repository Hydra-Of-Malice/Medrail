"use client";

import { useEffect, useState, type ReactNode } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Tag from "@/components/ui/Tag";
import Skeleton from "@/components/ui/Skeleton";
import ErrorState from "@/components/ui/ErrorState";
import { useActiveWallet } from "@/lib/activeWallet";
import { API_BASE, NETWORK, ALGOD_URL, EXPLORER_ADDRESS_URL } from "@/lib/config";
import { getHealth, type HealthResponse } from "@/lib/api";

const CONSENT_APP_ID = 768743428;
const CONSENT_APP_EXPLORER_URL = `https://lora.algokit.io/${NETWORK}/application/${CONSENT_APP_ID}`;

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line py-2.5 last:border-b-0">
      <span className="text-sm text-text-muted">{label}</span>
      <span className="font-mono text-sm text-text">{value}</span>
    </div>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-lg font-medium text-text">{children}</h2>;
}

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(true);

  const { mode, walletName, address, disconnect } = useActiveWallet();
  const [disconnecting, setDisconnecting] = useState(false);

  async function loadHealth() {
    setLoadingHealth(true);
    setHealthError(null);
    try {
      const res = await getHealth();
      setHealth(res);
    } catch (e) {
      setHealthError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingHealth(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHealth();
  }, []);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await disconnect();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Settings" description="Network and account configuration." />

      <div className="space-y-6">
        {/* Network */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionHeading>Network</SectionHeading>
            <Tag tone="trust">TestNet</Tag>
          </div>
          <p className="mt-2 text-sm text-text-muted">
            MedRail runs entirely on Algorand TestNet. No real funds are ever at risk here — all USDC
            payments and consent transactions shown in this app settle on a test network.
          </p>

          <div className="mt-4">
            <Row label="Network" value={NETWORK ?? "—"} />
            <Row
              label="Algod URL"
              value={
                <a href={ALGOD_URL} target="_blank" rel="noopener noreferrer" className="text-value underline underline-offset-2">
                  {ALGOD_URL}
                </a>
              }
            />
            <Row
              label="Consent contract App ID"
              value={
                <a
                  href={CONSENT_APP_EXPLORER_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-value underline underline-offset-2"
                >
                  {CONSENT_APP_ID}
                </a>
              }
            />
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <p className="mb-2 font-mono text-xs uppercase tracking-wide text-text-faint">
              Live confirmation — GET /v1/health
            </p>
            {loadingHealth ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
              </div>
            ) : healthError ? (
              <ErrorState title="Couldn't reach the API" description={healthError} onRetry={loadHealth} />
            ) : health ? (
              <div>
                <Row label="Reported network" value={health.network} />
                <Row label="Reported consent App ID" value={health.consentAppId ?? "—"} />
                <Row
                  label="Match"
                  value={
                    health.network === NETWORK && health.consentAppId === CONSENT_APP_ID ? (
                      <span className="text-success">confirmed</span>
                    ) : (
                      <span className="text-danger">mismatch</span>
                    )
                  }
                />
                <Row label="Service" value={health.service} />
                <Row label="Checked" value={new Date(health.time).toLocaleString()} />
              </div>
            ) : null}
          </div>
        </Card>

        {/* Wallet */}
        <Card>
          <SectionHeading>Wallet</SectionHeading>
          {address ? (
            <div className="mt-4">
              <Row label="Mode" value={mode === "demo" ? "Demo account" : "Connected wallet"} />
              <Row label="Wallet" value={walletName ?? "—"} />
              <Row
                label="Address"
                value={
                  <a
                    href={EXPLORER_ADDRESS_URL(address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-value underline underline-offset-2"
                    title={address}
                  >
                    {shortAddr(address)}
                  </a>
                }
              />
              <div className="mt-4 border-t border-line pt-4">
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="rounded-[6px] border border-danger/40 px-3 py-1.5 text-sm text-danger transition hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {disconnecting ? "Disconnecting…" : "Disconnect"}
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-text-muted">
              No wallet connected. Use the <span className="text-text">Connect wallet</span> control in the
              topbar to connect a real wallet or use the demo account.
            </p>
          )}
        </Card>

        {/* About this deployment */}
        <Card>
          <SectionHeading>About this deployment</SectionHeading>
          <div className="mt-4">
            <Row
              label="API base"
              value={
                <a href={API_BASE} target="_blank" rel="noopener noreferrer" className="text-value underline underline-offset-2">
                  {API_BASE}
                </a>
              }
            />
          </div>
          <p className="mt-4 text-sm text-text-muted">
            The API base above is the service index — it lists every endpoint, price, gate, and the
            deployed contract&rsquo;s ARC-56 spec URL.
          </p>
          <p className="mt-3 text-sm text-text-muted">
            <span className="text-text">A note on activity history:</span> the Agents page reads{" "}
            <code className="rounded-[3px] bg-surface-2 px-1 py-0.5 text-[13px] text-text">GET /v1/activity</code>,
            which is real but session-forward only — an in-memory log that started when the API process
            itself started. It is not a complete history of every call ever made against this deployment,
            only what has happened since the API last restarted.
          </p>
        </Card>
      </div>
    </div>
  );
}
