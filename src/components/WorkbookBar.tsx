"use client";

import { useRef } from "react";
import { fmtDayMonthYear } from "@/lib/dates";
import { fmtInt } from "@/lib/format";
import { useDashboard } from "@/state/DashboardContext";
import { Icon } from "./Icons";

/**
 * A permanent statement of which workbook the numbers come from.
 *
 * Two things can silently put stale figures on screen: an upload kept in this
 * browser from a previous visit, and the server-side fallback source when no
 * upload exists. Both look identical once the charts render, so the source and
 * the date span it actually covers are stated up front rather than left in a
 * sidebar line.
 */
export function WorkbookBar() {
  const { dataset, uploadDataset, notify } = useDashboard();
  const fileRef = useRef<HTMLInputElement>(null);

  if (dataset.status !== "ready") return null;

  const uploaded = dataset.source.startsWith("Uploaded file");
  const name = uploaded
    ? dataset.source.replace(/^Uploaded file "/, "").replace(/".*$/, "")
    : dataset.source.replace(/ · sheet .*$/, "");

  return (
    <div className="surface-card no-print mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border-l-4 border-l-navy bg-white px-4 py-2.5 text-xs">
      <span className="font-bold uppercase tracking-[0.1em] text-slate-ink">Workbook</span>

      <span className="font-semibold text-navy">{name}</span>
      {!uploaded && (
        <span className="rounded bg-gold-050 px-1.5 py-0.5 font-semibold text-navy ring-1 ring-gold/40">
          not your upload
        </span>
      )}

      <span className="text-slate-ink">{fmtInt(dataset.rows.length)} rows</span>

      {dataset.firstDate && dataset.lastDate && (
        <span className="text-slate-ink">
          {fmtDayMonthYear(dataset.firstDate)} –{" "}
          <span className="font-bold text-navy">{fmtDayMonthYear(dataset.lastDate)}</span>
        </span>
      )}

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
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="ml-auto flex items-center gap-1.5 rounded-md border border-hairline ps-2.5 pe-2 py-1 font-bold text-navy transition-[color,background-color,box-shadow,scale] duration-150 ease-out active:scale-[0.96] hover:bg-fog"
      >
        <Icon name="upload" size={13} /> Replace
      </button>
    </div>
  );
}
