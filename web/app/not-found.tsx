import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ink px-6 text-center">
      <span className="font-mono text-xs uppercase tracking-[0.14em] text-text-faint">404</span>
      <h1 className="font-display text-3xl font-medium text-text">Page not found</h1>
      <p className="max-w-md text-text-muted">
        There&rsquo;s nothing at this address. Head back to the dashboard to keep going.
      </p>
      <Link
        href="/dashboard"
        className="mt-2 rounded-[6px] bg-trust px-4 py-2 text-sm font-medium text-ink transition hover:bg-trust/90"
      >
        Go to Dashboard
      </Link>
    </main>
  );
}
