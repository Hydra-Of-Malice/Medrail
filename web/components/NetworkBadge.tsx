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
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-800/40 bg-red-950/40 px-3 py-1 text-xs font-mono text-red-300">
        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
        API unreachable — start the backend (see README)
      </span>
    );
  }

  if (!health) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs font-mono text-neutral-400">
        checking status…
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-800/40 bg-emerald-950/40 px-3 py-1 text-xs font-mono text-emerald-300">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      live on {health.network} {health.consentAppId ? `· app ${health.consentAppId}` : "· contract not yet deployed"}
    </span>
  );
}
