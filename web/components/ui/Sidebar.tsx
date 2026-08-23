"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/services", label: "Services" },
  { href: "/agents", label: "Agents" },
  { href: "/transactions", label: "Transactions" },
  { href: "/consent", label: "Consent" },
  { href: "/audit", label: "Audit Trail" },
  { href: "/developer", label: "Developer" },
  { href: "/settings", label: "Settings" },
];

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="flex h-full flex-col gap-0.5 p-3">
      <Link href="/dashboard" onClick={onNavigate} className="mb-4 px-2 py-1.5">
        <span className="font-display text-xl font-medium text-text">MedRail</span>
      </Link>
      {NAV.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`rounded-[6px] px-2.5 py-2 text-sm transition ${
              active ? "bg-trust-soft text-trust" : "text-text-muted hover:bg-surface-2 hover:text-text"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
