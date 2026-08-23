export default function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[6px] border border-line bg-surface p-4">
      <div className="font-mono text-[11px] uppercase tracking-wide text-text-faint">{label}</div>
      <div className="mt-1.5 font-display text-2xl tabular-nums text-text">{value}</div>
      {hint && <div className="mt-1 text-xs text-text-faint">{hint}</div>}
    </div>
  );
}
