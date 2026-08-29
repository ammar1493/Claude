"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** selectizeInput(multiple = TRUE): a searchable multi-select with chips. */
export function MultiSelect({
  choices,
  selected,
  onChange,
  placeholder = "All",
  disabled,
}: {
  choices: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? choices.filter((c) => c.toLowerCase().includes(q)) : choices;
    return base.slice(0, 200);
  }, [choices, query]);

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm text-navy disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="truncate">
          {selected.length === 0 ? (
            <span className="text-slate-400">{placeholder}</span>
          ) : (
            `${selected.length} selected`
          )}
        </span>
        <span className="text-xs text-slate-400">▾</span>
      </button>

      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {selected.map((s) => (
            <span
              key={s}
              className="inline-flex max-w-full items-center gap-1 rounded bg-gold px-2 py-0.5 text-[11px] font-semibold text-navy"
            >
              <span className="truncate">{s}</span>
              <button type="button" onClick={() => toggle(s)} aria-label={`Remove ${s}`}>
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => onChange([])}
            className="rounded px-2 py-0.5 text-[11px] font-semibold text-white/70 underline"
          >
            clear
          </button>
        </div>
      )}

      {open && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-full border-b border-slate-200 px-3 py-2 text-sm text-navy outline-none"
          />
          <div className="neft-scroll max-h-56 overflow-auto py-1">
            {filtered.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">No matches</p>}
            {filtered.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggle(c)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-navy hover:bg-navy/5"
              >
                <input type="checkbox" readOnly checked={selected.includes(c)} className="accent-navy" />
                <span className="truncate">{c}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
