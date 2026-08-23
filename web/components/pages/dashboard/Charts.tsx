import type { IndexerPayment, ConsentEvent, ConsentAction } from "@/lib/indexer";

/** Hand-rolled inline-SVG bar chart — no charting library per project rules.
 * Plots settled payment amounts (USDC) for the entries passed in, left to right
 * in the order given. Caller decides ordering (dashboard passes oldest → newest
 * of its most recent slice, so the chart reads left-to-right as "over time"). */
export function PaymentsBarChart({ payments }: { payments: IndexerPayment[] }) {
  const width = 400;
  const height = 140;
  const padX = 6;
  const padBottom = 8;
  const padTop = 6;

  const amounts = payments.map((p) => p.amountMicroUsdc / 1_000_000);
  const max = Math.max(...amounts, 0.000001);
  const plotHeight = height - padTop - padBottom;
  const barSlot = (width - padX * 2) / amounts.length;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Recent settled payment amounts in USDC">
      {amounts.map((amt, i) => {
        const barHeight = Math.max((amt / max) * plotHeight, 2);
        const x = padX + i * barSlot;
        const y = height - padBottom - barHeight;
        const barWidth = Math.max(barSlot - 2, 1);
        return (
          <rect
            key={payments[i].txId}
            x={x + 1}
            y={y}
            width={barWidth}
            height={barHeight}
            rx={1}
            className="[fill:var(--color-value)]"
            opacity={0.85}
          >
            <title>{`$${amt.toFixed(2)} · ${new Date(payments[i].roundTime).toLocaleString()}`}</title>
          </rect>
        );
      })}
      <line x1={padX} y1={height - padBottom} x2={width - padX} y2={height - padBottom} className="[stroke:var(--color-line)]" strokeWidth={1} />
    </svg>
  );
}

const ACTIONS: ConsentAction[] = ["grant_access", "revoke_access", "request_access", "log_access"];
const ACTION_LABEL: Record<ConsentAction, string> = {
  grant_access: "Grant",
  revoke_access: "Revoke",
  request_access: "Request",
  log_access: "Log",
};

/** Small grouped bar chart of consent-contract calls by action type. */
export function ConsentActionsChart({ events }: { events: ConsentEvent[] }) {
  const counts = ACTIONS.reduce(
    (acc, action) => {
      acc[action] = 0;
      return acc;
    },
    {} as Record<ConsentAction, number>,
  );
  events.forEach((e) => {
    counts[e.action] += 1;
  });

  const width = 400;
  const height = 140;
  const padX = 20;
  const padBottom = 20;
  const padTop = 20;
  const plotHeight = height - padTop - padBottom;
  const max = Math.max(...ACTIONS.map((a) => counts[a]), 1);
  const slot = (width - padX * 2) / ACTIONS.length;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Consent contract events by action type">
      {ACTIONS.map((action, i) => {
        const count = counts[action];
        const barHeight = count > 0 ? Math.max((count / max) * plotHeight, 2) : 0;
        const x = padX + i * slot;
        const barWidth = slot * 0.6;
        const barX = x + (slot - barWidth) / 2;
        const y = height - padBottom - barHeight;
        return (
          <g key={action}>
            <rect x={barX} y={y} width={barWidth} height={barHeight} rx={1} className="[fill:var(--color-trust)]" opacity={0.85}>
              <title>{`${ACTION_LABEL[action]}: ${count}`}</title>
            </rect>
            <text x={x + slot / 2} y={y - 5} textAnchor="middle" className="[fill:var(--color-text-muted)] font-mono" fontSize={9}>
              {count}
            </text>
            <text x={x + slot / 2} y={height - padBottom + 13} textAnchor="middle" className="[fill:var(--color-text-faint)] font-mono" fontSize={9}>
              {ACTION_LABEL[action]}
            </text>
          </g>
        );
      })}
      <line x1={padX} y1={height - padBottom} x2={width - padX} y2={height - padBottom} className="[stroke:var(--color-line)]" strokeWidth={1} />
    </svg>
  );
}
