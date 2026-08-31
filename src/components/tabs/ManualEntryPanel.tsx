"use client";

import { useRef, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { Icon } from "@/components/Icons";
import { MONTH_CHOICES } from "@/lib/config";
import { addManualRow, fromCSV, toCSV, withDates } from "@/lib/manual";
import type { ManualEntry } from "@/lib/types";
import { useDashboard } from "@/state/DashboardContext";

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-navy outline-none focus:border-navy focus:ring-2 focus:ring-navy/15";

/**
 * The "Add … Numbers Manually" panel shared by the Qiddiya and Takamol tabs.
 * app.R writes these rows to a CSV next to the app; here they live in the
 * browser, with CSV import/export so the two stay interchangeable.
 */
export function ManualEntryPanel({
  prefix,
  rows,
  onChange,
  showDays,
  csvName,
}: {
  prefix: "QD" | "TK";
  rows: ManualEntry[];
  onChange: (next: ManualEntry[]) => void;
  showDays: boolean;
  csvName: string;
}) {
  const { notify } = useDashboard();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [participants, setParticipants] = useState(0);
  const [sessions, setSessions] = useState(0);
  const [days, setDays] = useState(0);
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const importRef = useRef<HTMLInputElement>(null);

  const dated = withDates(rows);

  const submit = () => {
    const result = addManualRow(rows, {
      prefix,
      year,
      month,
      participants,
      sessions,
      teachingDays: showDays ? days : 0,
      note,
    });
    if (!result.ok) {
      notify(result.message, "warning");
      return;
    }
    onChange(result.rows);
    setSelected([]);
    notify(result.message);
  };

  const removeSelected = () => {
    if (!selected.length) {
      notify("Select at least one row in the table first.", "warning");
      return;
    }
    const drop = new Set(selected.map((i) => dated[i]?.id));
    onChange(rows.filter((r) => !drop.has(r.id)));
    setSelected([]);
    notify(`Removed ${selected.length} row(s).`);
  };

  const exportCsv = () => {
    const blob = new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <p className="mb-3 flex items-start gap-2 text-xs text-slate-500">
        <Icon name="pencil" size={14} className="mt-0.5 shrink-0" />
        {showDays ? (
          <span>
            Use this for months that are not yet in a workbook. Rows are stored in this browser and are
            added on top of the workbook figures in this tab and in the Executive Summary. Export them as{" "}
            <code className="rounded bg-slate-100 px-1">{csvName}</code> to keep a copy alongside the R app.
          </span>
        ) : (
          <span>
            Enter the participants trained for a given month. Adding the same month twice updates the
            existing row instead of duplicating it.
          </span>
        )}
      </p>

      <div className={`grid gap-3 ${showDays ? "md:grid-cols-6" : "md:grid-cols-5"}`}>
        <label className="text-xs font-semibold text-slate-600">
          Year
          <input
            type="number"
            min={2015}
            max={2100}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Month
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className={`mt-1 ${inputClass}`}
          >
            {MONTH_CHOICES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Participants
          <input
            type="number"
            min={0}
            value={participants}
            onChange={(e) => setParticipants(Number(e.target.value))}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          {showDays ? "Sessions" : "Sessions (optional)"}
          <input
            type="number"
            min={0}
            value={sessions}
            onChange={(e) => setSessions(Number(e.target.value))}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        {showDays && (
          <label className="text-xs font-semibold text-slate-600">
            Teaching Days
            <input
              type="number"
              min={0}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className={`mt-1 ${inputClass}`}
            />
          </label>
        )}
        <div className="flex items-end">
          <button
            type="button"
            onClick={submit}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-navy ps-3 pe-2.5 py-2 text-sm font-semibold text-white transition-[color,background-color,box-shadow,scale] duration-150 ease-out active:scale-[0.96] hover:brightness-110"
          >
            <Icon name="plus" size={15} /> Add / Update
          </button>
        </div>
      </div>

      <label className="mt-3 block text-xs font-semibold text-slate-600">
        Note (optional)
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            showDays ? "e.g. reported by QCTA operations" : "e.g. Takamol batch 3 - Dammam"
          }
          className={`mt-1 ${inputClass}`}
        />
      </label>

      <hr className="my-4 border-slate-200" />

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-bold">
          {showDays ? "Manual entries on record" : "Takamol entries on record"}
        </h4>
        <div className="flex gap-2">
          <input
            ref={importRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const imported = fromCSV(await file.text());
              if (!imported.length) {
                notify("No usable rows found in that CSV.", "warning");
                return;
              }
              const byId = new Map(rows.map((r) => [r.id, r]));
              for (const r of imported) byId.set(r.id, r);
              onChange([...byId.values()].sort((a, b) => a.year - b.year || a.month - b.month));
              notify(`Imported ${imported.length} row(s).`);
            }}
          />
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-navy transition-[color,background-color,box-shadow,scale] duration-150 ease-out active:scale-[0.96] hover:bg-fog"
          >
            Import CSV
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-navy transition-[color,background-color,box-shadow,scale] duration-150 ease-out active:scale-[0.96] hover:bg-fog"
          >
            Export CSV
          </button>
        </div>
      </div>

      <DataTable
        rows={dated}
        pageLength={5}
        dense
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        emptyMessage="No entries yet"
        columns={[
          { key: "period", header: "Period", value: (r) => r.periodLabel },
          { key: "p", header: "Participants", value: (r) => r.participants, align: "right" },
          { key: "s", header: "Sessions", value: (r) => r.sessions, align: "right" },
          ...(showDays
            ? [
                {
                  key: "d",
                  header: "Teaching Days",
                  value: (r: (typeof dated)[number]) => r.teachingDays,
                  align: "right" as const,
                },
              ]
            : []),
          { key: "n", header: "Note", value: (r) => r.note ?? "" },
          { key: "a", header: "Added On", value: (r) => r.addedOn ?? "" },
        ]}
      />

      <button
        type="button"
        onClick={removeSelected}
        className="mt-2 flex items-center gap-2 rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 transition-[color,background-color,box-shadow,scale] duration-150 ease-out active:scale-[0.96] hover:bg-red-50"
      >
        <Icon name="trash" size={14} /> Delete selected row(s)
      </button>
    </div>
  );
}
