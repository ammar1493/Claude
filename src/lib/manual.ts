"use client";

import { ceilingMonth, fmtMonthYear, addDays } from "./dates";
import type { ManualEntry, ManualEntryDated } from "./types";

/**
 * Manual-entry store.
 *
 * app.R persists these rows to `manual_entries/*.csv` next to the app. A Vercel
 * deployment has a read-only, ephemeral filesystem, so the browser's
 * localStorage takes that role: the rows survive a reload and a redeploy on the
 * machine that entered them, and the CSV import/export below keeps the same
 * file format the R app reads and writes.
 */

export const QIDDIYA_MANUAL_KEY = "neft.manual.qiddiya";
export const TAKAMOL_MANUAL_KEY = "neft.manual.takamol";

const CSV_COLUMNS = [
  "ID",
  "Year",
  "Month",
  "Participants",
  "Sessions",
  "TeachingDays",
  "Note",
  "AddedOn",
] as const;

export function readManualEntries(key: string): ManualEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isManualEntry).sort(byPeriod);
  } catch {
    return [];
  }
}

export function writeManualEntries(key: string, rows: ManualEntry[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(rows));
    return true;
  } catch {
    return false;
  }
}

function isManualEntry(v: unknown): v is ManualEntry {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === "string" && Number.isFinite(Number(r.year)) && Number.isFinite(Number(r.month));
}

function byPeriod(a: ManualEntry, b: ManualEntry): number {
  return a.year - b.year || a.month - b.month;
}

/** manual_with_dates(): NA numbers become 0 and each row gains its period. */
export function withDates(rows: ManualEntry[]): ManualEntryDated[] {
  const nowYear = new Date().getFullYear();
  return rows.map((r) => {
    const year = Number.isFinite(r.year) ? r.year : nowYear;
    const month = Number.isFinite(r.month) && r.month >= 1 && r.month <= 12 ? r.month : 1;
    const periodDate = new Date(year, month - 1, 1);
    return {
      ...r,
      year,
      month,
      participants: Number.isFinite(r.participants) ? r.participants : 0,
      sessions: Number.isFinite(r.sessions) ? r.sessions : 0,
      teachingDays: Number.isFinite(r.teachingDays) ? r.teachingDays : 0,
      periodDate,
      periodLabel: fmtMonthYear(periodDate),
    };
  });
}

/** filter_manual_window(): keep rows whose month overlaps [start, end]. */
export function filterWindow(rows: ManualEntry[], start: Date | null, end: Date | null): ManualEntryDated[] {
  const dated = withDates(rows);
  if (!start || !end) return dated;
  return dated.filter((r) => {
    const mStart = r.periodDate;
    const mEnd = addDays(ceilingMonth(r.periodDate), -1);
    return mStart <= end && mEnd >= start;
  });
}

export interface AddManualInput {
  prefix: "QD" | "TK";
  year: number;
  month: number;
  participants: number;
  sessions: number;
  teachingDays: number;
  note: string;
}

export type AddManualResult =
  | { ok: true; rows: ManualEntry[]; message: string }
  | { ok: false; message: string };

/** add_manual_row(): upserts on the (prefix, year, month) key. */
export function addManualRow(current: ManualEntry[], input: AddManualInput): AddManualResult {
  const year = Number(input.year);
  const month = Number(input.month);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return { ok: false, message: "Please choose a valid year and month." };
  }
  const num = (v: number) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
  const participants = num(input.participants);
  const sessions = num(input.sessions);
  const teachingDays = num(input.teachingDays);
  if (participants === 0 && sessions === 0 && teachingDays === 0) {
    return { ok: false, message: "Nothing to save — enter at least one number greater than zero." };
  }

  const key = `${input.prefix}-${year}-${String(month).padStart(2, "0")}`;
  const row: ManualEntry = {
    id: key,
    year,
    month,
    participants,
    sessions,
    teachingDays,
    note: input.note ?? "",
    addedOn: formatStamp(new Date()),
  };
  const rows = [...current.filter((r) => r.id !== key), row].sort(byPeriod);
  return {
    ok: true,
    rows,
    message: `Saved ${new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" })}.`,
  };
}

function formatStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Export in the exact CSV shape app.R writes, so the two stay interchangeable. */
export function toCSV(rows: ManualEntry[]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(
      [r.id, r.year, r.month, r.participants, r.sessions, r.teachingDays, r.note, r.addedOn]
        .map(esc)
        .join(","),
    );
  }
  return lines.join("\n");
}

/** Import a CSV written by app.R (or exported above). */
export function fromCSV(text: string): ManualEntry[] {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim());
  const idx = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const cols = {
    id: idx("ID"),
    year: idx("Year"),
    month: idx("Month"),
    participants: idx("Participants"),
    sessions: idx("Sessions"),
    teachingDays: idx("TeachingDays"),
    note: idx("Note"),
    addedOn: idx("AddedOn"),
  };
  const num = (v: string | undefined) => {
    const n = Number((v ?? "").trim());
    return Number.isFinite(n) ? n : 0;
  };
  const out: ManualEntry[] = [];
  for (const r of rows.slice(1)) {
    if (!r.length || r.every((c) => !c.trim())) continue;
    const year = num(r[cols.year]);
    const month = num(r[cols.month]);
    if (!year || month < 1 || month > 12) continue;
    out.push({
      id: (r[cols.id] ?? "").trim() || `IMP-${year}-${String(month).padStart(2, "0")}`,
      year,
      month,
      participants: num(r[cols.participants]),
      sessions: num(r[cols.sessions]),
      teachingDays: num(r[cols.teachingDays]),
      note: (r[cols.note] ?? "").trim(),
      addedOn: (r[cols.addedOn] ?? "").trim() || formatStamp(new Date()),
    });
  }
  return out.sort(byPeriod);
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
