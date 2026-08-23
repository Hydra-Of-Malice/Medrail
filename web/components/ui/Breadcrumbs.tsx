"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  services: "Services",
  agents: "Agents",
  transactions: "Transactions",
  consent: "Consent",
  audit: "Audit Trail",
  developer: "Developer",
  settings: "Settings",
};

export default function Breadcrumbs() {
  const pathname = usePathname() ?? "/";
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  const crumbs = segments.map((seg, i) => ({
    href: `/${segments.slice(0, i + 1).join("/")}`,
    label: LABELS[seg] ?? decodeURIComponent(seg),
    isLast: i === segments.length - 1,
  }));

  return (
    <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-1.5 font-mono text-xs text-text-faint">
      {crumbs.map((c, i) => (
        <span key={c.href} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden>/</span>}
          {c.isLast ? (
            <span className="text-text-muted">{c.label}</span>
          ) : (
            <Link href={c.href} className="transition hover:text-trust">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
