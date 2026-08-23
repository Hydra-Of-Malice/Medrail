import type { ReactNode } from "react";

export default function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[6px] border border-dashed border-line-strong bg-surface/50 p-8 text-center">
      <p className="font-display text-lg text-text">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-text-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
