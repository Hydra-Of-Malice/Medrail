import type { ReactNode } from "react";

const TONE_STYLE: Record<Tone, string> = {
  value: "border-value/40 text-value",
  trust: "border-trust/40 text-trust",
  success: "border-success/40 text-success",
  neutral: "border-line-strong text-text-muted",
};

type Tone = "value" | "trust" | "success" | "neutral";

/** A label for a fact about something (a service's payment/consent/availability
 * requirement), distinct from Badge which marks the state of one specific row. */
export default function Tag({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-[4px] border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${TONE_STYLE[tone]}`}>
      {children}
    </span>
  );
}
