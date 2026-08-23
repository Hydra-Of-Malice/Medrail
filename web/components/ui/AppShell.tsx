"use client";

import { useState, type ReactNode } from "react";
import Sidebar from "./Sidebar";
import Breadcrumbs from "./Breadcrumbs";
import WalletMenu from "./WalletMenu";
import NetworkBadge from "@/components/NetworkBadge";

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M2.5 5h13M2.5 9h13M2.5 13h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 border-r border-line md:block">
        <Sidebar />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-30 md:hidden">
          <div className="absolute inset-0 bg-ink/70" onClick={() => setDrawerOpen(false)} aria-hidden />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-line bg-ink">
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDrawerOpen(true)}
              className="rounded-[4px] p-1.5 text-text-muted transition hover:bg-surface-2 md:hidden"
              aria-label="Open navigation"
            >
              <MenuIcon />
            </button>
            <NetworkBadge />
          </div>
          <WalletMenu />
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <Breadcrumbs />
          {children}
        </main>
      </div>
    </div>
  );
}
