"use client";

import { useRef } from "react";
import { YEAR_CHOICES } from "@/lib/config";
import { fmtDayMonthYear, fromISODate, toISODate } from "@/lib/dates";
import { validFilteredDf } from "@/lib/selectors";
import { useDashboard } from "@/state/DashboardContext";
import { fmtInt } from "@/lib/format";
import { Icon } from "./Icons";
import { MultiSelect } from "./MultiSelect";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[13px] font-medium text-white/85">{label}</label>
      {children}
    </div>
  );
}

const controlClass =
  "w-full rounded-md border border-white/15 bg-white px-3 py-2 text-sm text-navy outline-none focus:border-gold focus:ring-2 focus:ring-gold/30";

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

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      await uploadDataset(file);
    } catch (err) {
      notify((err as Error).message, "error");
    }
  };

  return (
    <aside className="no-print flex w-full shrink-0 flex-col bg-navy px-5 py-6 lg:h-[calc(100vh-var(--nav-h))] lg:w-[286px] lg:overflow-y-auto">
      <h2 className="mb-5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-gold">
        <span aria-hidden className="h-3 w-1 rounded-full bg-gold" />
        Filters &amp; Controls
      </h2>

      <Field label="Date Range">
        <div className="flex flex-col gap-2">
          <input
            type="date"
            aria-label="Start date"
            value={toISODate(filters.startDate)}
            onChange={(e) => e.target.value && setFilters({ startDate: fromISODate(e.target.value) })}
            className={controlClass}
          />
          <input
            type="date"
            aria-label="End date"
            value={toISODate(filters.endDate)}
            onChange={(e) => e.target.value && setFilters({ endDate: fromISODate(e.target.value) })}
            className={controlClass}
          />
        </div>
      </Field>

      <Field label="Charts View">
        <select
          value={filters.granularity}
          onChange={(e) => setFilters({ granularity: e.target.value as typeof filters.granularity })}
          className={controlClass}
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
          className={controlClass}
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

      <hr className="my-5 border-white/12" />

      <Field label="Year for Analysis">
        <select
          value={filters.year}
          onChange={(e) => setFilters({ year: e.target.value })}
          className={controlClass}
        >
          {YEAR_CHOICES.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </Field>

      <hr className="my-5 border-white/12" />

      {/* Gold is the CTA accent; the secondary action stays neutral. */}
      <button
        type="button"
        onClick={onPrint}
        className="mb-2 flex w-full items-center justify-center gap-2 rounded-md bg-gold ps-3 pe-2.5 py-2.5 text-sm font-bold text-navy transition-[color,background-color,box-shadow,scale] duration-150 ease-out active:scale-[0.96] hover:brightness-105"
      >
        <Icon name="printer" size={16} /> Generate PDF Report
      </button>

      <button
        type="button"
        onClick={exportCsv}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-white/25 ps-3 pe-2.5 py-2.5 text-sm font-bold text-white transition-[color,background-color,box-shadow,scale] duration-150 ease-out active:scale-[0.96] hover:bg-white/10"
      >
        <Icon name="download" size={16} /> Export Data (CSV)
      </button>

      <hr className="my-5 border-white/12" />

      <div className="text-xs text-white/70">
        <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-gold">
          <span aria-hidden className="h-3 w-1 rounded-full bg-gold" />
          Workbook
        </p>
        <p className="mb-2 break-words leading-relaxed">
          {dataset.source || dataset.error || "Not loaded"}
        </p>
        {dataset.status === "ready" && dataset.firstDate && dataset.lastDate && (
          // Makes it obvious whether the upload is the current export: a total
          // that looks low is usually a workbook that stops early.
          <p className="mb-3 leading-relaxed text-white/85">
            {fmtInt(dataset.rows.length)} rows · {fmtDayMonthYear(dataset.firstDate)} –{" "}
            <span className="font-bold text-gold">{fmtDayMonthYear(dataset.lastDate)}</span>
          </p>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            void pickFile(file);
          }}
        />
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center justify-center gap-2 rounded-md border border-white/25 px-3 py-2 font-bold text-white transition-[color,background-color,box-shadow,scale] duration-150 ease-out active:scale-[0.96] hover:bg-white/10"
          >
            <Icon name="upload" size={14} /> Upload new workbook
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void refetchDataset()}
              className="flex flex-1 items-center justify-center gap-1 rounded-md border border-white/15 px-2 py-1.5 text-white/75 transition-[color,background-color,box-shadow,scale] duration-150 ease-out active:scale-[0.96] hover:bg-white/10 hover:text-white"
            >
              <Icon name="refresh" size={13} /> Reload
            </button>
            <button
              type="button"
              onClick={() => void clearUploadedDataset()}
              className="flex flex-1 items-center justify-center gap-1 rounded-md border border-white/15 px-2 py-1.5 text-white/75 transition-[color,background-color,box-shadow,scale] duration-150 ease-out active:scale-[0.96] hover:bg-white/10 hover:text-white"
            >
              <Icon name="trash" size={13} /> Clear
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
