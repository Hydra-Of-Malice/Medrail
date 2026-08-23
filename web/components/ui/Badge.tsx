import type { ReactNode } from "react";

const TONE_STYLE: Record<Tone, string> = {
  success: "bg-success/15 text-success",
  pending: "bg-value/15 text-value",
  danger: "bg-danger/15 text-danger",
  trust: "bg-trust/15 text-trust",
  inactive: "bg-inactive/15 text-text-faint",
};

type Tone = "success" | "pending" | "danger" | "trust" | "inactive";

export default function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5 font-mono text-[11px] ${TONE_STYLE[tone]}`}>
      {children}
    </span>
  );
}
