import type { ReactNode } from "react";

const TONE_BORDER: Record<Tone, string> = {
  neutral: "border-line",
  trust: "border-trust-dim",
  value: "border-value-dim",
  danger: "border-danger/40",
};

type Tone = "neutral" | "trust" | "value" | "danger";

export default function Card({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-[6px] border bg-surface p-5 ${TONE_BORDER[tone]} ${className}`}>{children}</div>
  );
}
