import * as XLSX from "xlsx";
import { REQUIRED_COLUMNS } from "./config";
import type { TrainingRow } from "./types";

/**
 * Excel stores dates as a serial number counted from 1899-12-30 (the same
 * origin R uses in `as.Date(num, origin = "1899-12-30")`).
 */
export function excelSerialToDate(serial: number): Date {
  const days = Math.floor(serial);
  const ms = Date.UTC(1899, 11, 30) + days * 86_400_000;
  const utc = new Date(ms);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

/**
 * Coerce any cell into a local-midnight Date, or null.
 *
 * Workbooks are read with cellDates disabled, so a date cell arrives as its raw
 * Excel serial and is converted here — a fixed arithmetic on the 1899-12-30
 * origin that gives the same day in every timezone.
 *
 * SheetJS's own cellDates conversion builds Dates at *local* midnight. Reading
 * the UTC parts of one of those moves the date back a day for any viewer ahead
 * of UTC, which silently reassigns every 1 January row to the previous year.
 * If a Date does reach here, its local parts are therefore the intended day.
 */
export function cellToDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return excelSerialToDate(value);
  }
  const s = String(value).trim();
  if (!s) return null;
  const asNum = Number(s);
  if (Number.isFinite(asNum) && asNum > 20000 && asNum < 80000) return excelSerialToDate(asNum);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }
  return null;
}

export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

export function cellToNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

type SheetRow = Record<string, unknown>;

function normaliseHeader(h: string): string {
  return h.replace(/\s+/g, " ").trim().toLowerCase().replace(/[’‘`]/g, "'");
}

/** Map the workbook's actual headers onto the required column names. */
function headerIndex(rows: SheetRow[]): Map<string, string> | null {
  if (!rows.length) return null;
  const present = new Map<string, string>();
  for (const key of Object.keys(rows[0])) present.set(normaliseHeader(key), key);
  const resolved = new Map<string, string>();
  for (const required of REQUIRED_COLUMNS) {
    const hit = present.get(normaliseHeader(required));
    if (!hit) return null;
    resolved.set(required, hit);
  }
  return resolved;
}

export interface ParsedWorkbook {
  rows: TrainingRow[];
  sheetName: string;
  /** Column names as they appeared in the workbook, in sheet order. */
  columns: string[];
}

/**
 * load_data_local() equivalent. `read_excel()` reads the first sheet, so the
 * first sheet is tried first; if its headers do not carry every required
 * column the remaining sheets are scanned rather than failing outright.
 */
export function parseTrainingWorkbook(data: ArrayBuffer | Uint8Array): ParsedWorkbook {
  // cellDates is deliberately off — see cellToDate().
  const wb = XLSX.read(data, { cellDates: false });
  const errors: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const raw = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: null, raw: true });
    if (!raw.length) continue;
    const cols = headerIndex(raw);
    if (!cols) {
      errors.push(sheetName);
      continue;
    }

    const dateCol = cols.get("Actual Date")!;
    const courseCol = cols.get("Course Name")!;
    const clientCol = cols.get("Client")!;
    const instructorCol = cols.get("Instructor Name")!;
    const participantCol = cols.get("Participant's Name")!;
    const sessionCol = cols.get("Actual Sessions")!;

    const rows: TrainingRow[] = [];
    for (const r of raw) {
      const date = cellToDate(r[dateCol]);
      if (!date) continue; // as.Date() would give NA; those rows never match a filter
      const extra: Record<string, string | number | null> = {};
      for (const [k, v] of Object.entries(r)) {
        extra[k] = v instanceof Date ? cellToString(v) : (v as string | number | null);
      }
      rows.push({
        date,
        courseName: cellToString(r[courseCol]),
        client: cellToString(r[clientCol]),
        instructorName: cellToString(r[instructorCol]),
        participantName: cellToString(r[participantCol]),
        actualSession: cellToString(r[sessionCol]),
        extra,
      });
    }

    return { rows, sheetName, columns: Object.keys(raw[0]) };
  }

  throw new Error(
    `No sheet contains all required columns (${REQUIRED_COLUMNS.join(", ")}). ` +
      (errors.length ? `Checked: ${errors.join(", ")}.` : "The workbook has no readable sheets."),
  );
}

/** get_google_sheet_tab(): read one named tab of the published workbook. */
export function readSheetAsMatrix(
  data: ArrayBuffer | Uint8Array,
  sheetName: string,
): { header: string[]; rows: (string | number | null)[][] } | null {
  const wb = XLSX.read(data, { cellDates: false });
  const match =
    wb.SheetNames.find((n) => n === sheetName) ??
    wb.SheetNames.find((n) => n.trim().toLowerCase() === sheetName.trim().toLowerCase());
  if (!match) return null;
  const sheet = wb.Sheets[match];
  const aoa = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });
  if (!aoa.length) return { header: [], rows: [] };
  const header = (aoa[0] ?? []).map((h) => cellToString(h));
  const rows = aoa.slice(1).filter((r) => r.some((c) => c !== null && c !== ""));
  return { header, rows };
}

export function listSheetNames(data: ArrayBuffer | Uint8Array): string[] {
  return XLSX.read(data, { bookSheets: true }).SheetNames;
}
