"use client";

import { useEffect, useState } from "react";
import { getHealth, type HealthResponse } from "@/lib/api";

export default function NetworkBadge() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger-soft px-3 py-1 font-mono text-xs text-danger">
        <span className="h-1.5 w-1.5 rounded-full bg-danger" />
        API unreachable — start the backend (see README)
      </span>
    );
  }

  if (!health) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 font-mono text-xs text-text-muted">
        checking status…
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-trust-dim bg-trust-soft px-3 py-1 font-mono text-xs text-trust">
      <span className="h-1.5 w-1.5 rounded-full bg-trust" />
      live on {health.network} {health.consentAppId ? `· app ${health.consentAppId}` : "· contract not yet deployed"}
    </span>
  );
}
