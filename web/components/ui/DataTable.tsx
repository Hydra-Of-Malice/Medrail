"use client";

import { useMemo, useState, type ReactNode } from "react";
import EmptyState from "./EmptyState";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  className?: string;
}

export default function DataTable<T>({
  rows,
  columns,
  getKey,
  searchPlaceholder = "Search…",
  searchFn,
  pageSize = 10,
  emptyTitle = "No results",
  emptyDescription = "Nothing matches yet.",
}: {
  rows: T[];
  columns: Column<T>[];
  getKey: (row: T) => string | number;
  searchPlaceholder?: string;
  searchFn?: (row: T, query: string) => boolean;
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!query || !searchFn) return rows;
    const q = query.toLowerCase();
    return rows.filter((r) => searchFn(r, q));
  }, [rows, query, searchFn]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(0);
  }

  return (
    <div>
      {searchFn && (
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder={searchPlaceholder}
          className="mb-3 w-full max-w-sm rounded-[6px] border border-line bg-surface-2 px-3 py-2 text-sm text-text focus:border-trust focus:outline-none"
        />
      )}
      {sorted.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-[6px] border border-line">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-left text-xs uppercase tracking-wide text-text-faint">
                  {columns.map((col) => (
                    <th key={col.key} className={`px-3 py-2 font-medium ${col.className ?? ""}`}>
                      {col.sortValue ? (
                        <button
                          onClick={() => toggleSort(col.key)}
                          className="flex items-center gap-1 transition hover:text-text-muted"
                        >
                          {col.header}
                          {sortKey === col.key && <span>{sortDir === "asc" ? "↑" : "↓"}</span>}
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pageRows.map((row) => (
                  <tr key={getKey(row)} className="bg-surface">
                    {columns.map((col) => (
                      <td key={col.key} className={`px-3 py-2.5 align-top ${col.className ?? ""}`}>
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-xs text-text-faint">
              <span>
                Page {clampedPage + 1} of {totalPages} · {sorted.length} rows
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={clampedPage === 0}
                  className="rounded-[4px] border border-line px-2 py-1 transition hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={clampedPage >= totalPages - 1}
                  className="rounded-[4px] border border-line px-2 py-1 transition hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
