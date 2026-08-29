"use client";

import { useRef } from "react";
import { BRAND } from "@/lib/brand";
import { YEAR_CHOICES } from "@/lib/config";
import { fromISODate, toISODate } from "@/lib/dates";
import { validFilteredDf } from "@/lib/selectors";
import { useDashboard } from "@/state/DashboardContext";
import { Icon } from "./Icons";
import { MultiSelect } from "./MultiSelect";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-2 block text-sm font-medium text-white">{label}</label>
      {children}
    </div>
  );
}

const selectClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-navy outline-none focus:border-gold";

export function Sidebar({ onPrint }: { onPrint: () => void }) {
  const {
    filters,
    setFilters,
    clientChoices,
    courseChoices,
    dataset,
    uploadDataset,
    clearUploadedDataset,
    refetchDataset,
    notify,
  } = useDashboard();
  const fileRef = useRef<HTMLInputElement>(null);

  const exportCsv = () => {
    const rows = validFilteredDf(dataset.rows, filters);
    if (!rows.length) {
      notify("Nothing to export for the current filters.", "warning");
      return;
    }
    const columns = dataset.columns.length ? dataset.columns : Object.keys(rows[0].extra);
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      columns.map(esc).join(","),
      ...rows.map((r) => columns.map((c) => esc(r.extra[c])).join(",")),
    ].join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `NEFT-Data-${toISODate(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <aside className="no-print flex w-full shrink-0 flex-col bg-navy px-5 py-6 lg:h-[calc(100vh-64px)] lg:w-[280px] lg:overflow-y-auto">
      <h2 className="mb-5 border-b-2 border-gold pb-2 text-[11px] font-bold tracking-[1px] text-gold">
        FILTERS &amp; CONTROLS
      </h2>

      <Field label="Date Range">
        <div className="flex flex-col gap-2">
          <input
            type="date"
            value={toISODate(filters.startDate)}
            onChange={(e) => e.target.value && setFilters({ startDate: fromISODate(e.target.value) })}
            className={selectClass}
          />
          <input
            type="date"
            value={toISODate(filters.endDate)}
            onChange={(e) => e.target.value && setFilters({ endDate: fromISODate(e.target.value) })}
            className={selectClass}
          />
        </div>
      </Field>

      <Field label="Charts View">
        <select
          value={filters.granularity}
          onChange={(e) => setFilters({ granularity: e.target.value as typeof filters.granularity })}
          className={selectClass}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
      </Field>

      <Field label="Quick Select">
        <select
          value={filters.timeContext}
          onChange={(e) => setFilters({ timeContext: e.target.value as typeof filters.timeContext })}
          className={selectClass}
        >
          <option value="custom">Custom Range</option>
          <option value="monthly">This Month</option>
          <option value="yearly">This Year</option>
        </select>
      </Field>

      <Field label="Filter by Client">
        <MultiSelect
          choices={clientChoices}
          selected={filters.clients}
          onChange={(clients) => setFilters({ clients })}
          placeholder="All clients"
        />
      </Field>

      <Field label="Filter by Course">
        <MultiSelect
          choices={courseChoices}
          selected={filters.courses}
          onChange={(courses) => setFilters({ courses })}
          placeholder="All courses"
        />
      </Field>

      <hr className="my-5 border-gold/30" />

      <Field label="Year for Analysis">
        <select
          value={filters.year}
          onChange={(e) => setFilters({ year: e.target.value })}
          className={selectClass}
        >
          {YEAR_CHOICES.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </Field>

      <hr className="my-5 border-gold/30" />

      <button
        type="button"
        onClick={onPrint}
        className="mb-2 flex w-full items-center justify-center gap-2 rounded-md bg-gold px-3 py-2 text-sm font-semibold text-navy transition hover:brightness-105"
      >
        <Icon name="printer" size={16} /> Generate PDF Report
      </button>

      <button
        type="button"
        onClick={exportCsv}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-navy transition hover:bg-slate-100"
      >
        <Icon name="download" size={16} /> Export Data (CSV)
      </button>

      <hr className="my-5 border-gold/30" />

      <div className="text-xs text-white/70">
        <p className="mb-2 font-semibold uppercase tracking-wide text-gold">Data source</p>
        <p className="mb-3 break-words">{dataset.source || dataset.error || "Not loaded"}</p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              await uploadDataset(file);
            } catch (err) {
              notify((err as Error).message, "error");
            }
          }}
        />
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center justify-center gap-2 rounded-md border border-white/30 px-3 py-1.5 font-semibold text-white hover:bg-white/10"
          >
            <Icon name="upload" size={14} /> Upload workbook
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void refetchDataset()}
              className="flex flex-1 items-center justify-center gap-1 rounded-md border border-white/20 px-2 py-1.5 text-white/80 hover:bg-white/10"
            >
              <Icon name="refresh" size={13} /> Reload
            </button>
            <button
              type="button"
              onClick={() => void clearUploadedDataset()}
              className="flex flex-1 items-center justify-center gap-1 rounded-md border border-white/20 px-2 py-1.5 text-white/80 hover:bg-white/10"
            >
              <Icon name="trash" size={13} /> Clear
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 self-center rounded-lg bg-white px-3 py-2">
        <img
          src={BRAND.sloganWords}
          alt="Be trained. Be certified. Be successful."
          className="w-full max-w-[200px]"
        />
      </div>
    </aside>
  );
}
