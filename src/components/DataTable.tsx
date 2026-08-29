"use client";

import { useMemo, useState, type ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  /** Cell value used for sorting, filtering and CSV export. */
  value: (row: T) => string | number;
  render?: (row: T) => ReactNode;
  align?: "left" | "center" | "right";
  width?: string;
}

/**
 * DT::datatable() equivalent: paging, a global search box, optional per-column
 * filters and optional row selection.
 */
export function DataTable<T>({
  rows,
  columns,
  pageLength = 10,
  filterRow = false,
  selectable = false,
  selected,
  onSelectedChange,
  emptyMessage = "No data",
  dense,
}: {
  rows: T[];
  columns: Column<T>[];
  pageLength?: number;
  filterRow?: boolean;
  selectable?: boolean;
  selected?: number[];
  onSelectedChange?: (next: number[]) => void;
  emptyMessage?: string;
  dense?: boolean;
}) {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const active = Object.entries(colFilters).filter(([, v]) => v.trim());
    let out = rows.map((row, index) => ({ row, index }));

    if (q) {
      out = out.filter(({ row }) =>
        columns.some((c) => String(c.value(row)).toLowerCase().includes(q)),
      );
    }
    for (const [key, v] of active) {
      const needle = v.trim().toLowerCase();
      const col = columns.find((c) => c.key === key);
      if (!col) continue;
      out = out.filter(({ row }) => String(col.value(row)).toLowerCase().includes(needle));
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        out = [...out].sort((a, b) => {
          const av = col.value(a.row);
          const bv = col.value(b.row);
          if (typeof av === "number" && typeof bv === "number") return (av - bv) * sort.dir;
          return String(av).localeCompare(String(bv), "en") * sort.dir;
        });
      }
    }
    return out;
  }, [rows, columns, query, colFilters, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageLength));
  const current = Math.min(page, pageCount - 1);
  const visible = filtered.slice(current * pageLength, current * pageLength + pageLength);
  const pad = dense ? "px-2 py-1" : "px-3 py-2";

  const toggleRow = (index: number) => {
    if (!selectable || !onSelectedChange) return;
    const set = new Set(selected ?? []);
    if (set.has(index)) set.delete(index);
    else set.add(index);
    onSelectedChange([...set]);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder="Search…"
          className="w-56 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
        />
        <span className="text-xs text-slate-500">
          {filtered.length.toLocaleString("en-US")} row{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="neft-scroll flex-1 overflow-auto rounded-lg ring-1 ring-slate-200">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-navy text-white">
            <tr>
              {selectable && <th className={`${pad} w-10`} />}
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={c.width ? { width: c.width } : undefined}
                  className={`${pad} cursor-pointer select-none whitespace-nowrap text-left text-xs font-semibold uppercase tracking-wide`}
                  onClick={() =>
                    setSort((s) =>
                      s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 },
                    )
                  }
                >
                  {c.header}
                  {sort?.key === c.key && <span className="ml-1">{sort.dir === 1 ? "▲" : "▼"}</span>}
                </th>
              ))}
            </tr>
            {filterRow && (
              <tr className="bg-navy/90">
                {selectable && <th className={pad} />}
                {columns.map((c) => (
                  <th key={c.key} className="px-2 pb-2">
                    <input
                      value={colFilters[c.key] ?? ""}
                      onChange={(e) => {
                        setColFilters((f) => ({ ...f, [c.key]: e.target.value }));
                        setPage(0);
                      }}
                      placeholder="Filter"
                      className="w-full rounded border-0 bg-white/95 px-2 py-1 text-xs text-navy outline-none"
                    />
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="px-3 py-8 text-center text-sm text-slate-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
            {visible.map(({ row, index }, i) => {
              const isSelected = selectable && (selected ?? []).includes(index);
              return (
                <tr
                  key={index}
                  onClick={() => toggleRow(index)}
                  className={`${i % 2 ? "bg-slate-50/70" : "bg-white"} ${
                    isSelected ? "!bg-gold/30" : ""
                  } ${selectable ? "cursor-pointer" : ""} hover:bg-navy/5`}
                >
                  {selectable && (
                    <td className={pad}>
                      <input type="checkbox" readOnly checked={!!isSelected} className="accent-navy" />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`${pad} whitespace-nowrap ${
                        c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"
                      }`}
                    >
                      {c.render ? c.render(row) : String(c.value(row))}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="mt-2 flex items-center justify-end gap-2 text-sm">
          <button
            type="button"
            onClick={() => setPage(Math.max(0, current - 1))}
            disabled={current === 0}
            className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-slate-500">
            Page {current + 1} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage(Math.min(pageCount - 1, current + 1))}
            disabled={current >= pageCount - 1}
            className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
