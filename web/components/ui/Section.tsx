import type { ReactNode } from "react";

export default function Section({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-line pt-10 pb-4">
      <div className="font-mono text-xs uppercase tracking-[0.14em] text-value">{eyebrow}</div>
      <h2 className="mt-1.5 font-display text-2xl font-medium text-text sm:text-[1.75rem]">{title}</h2>
      {description && <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-text-muted">{description}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}
