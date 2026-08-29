import * as XLSX from "xlsx";
import { cellToDate } from "./xlsx";
import type { QiddiyaDay, QiddiyaSession, QiddiyaStore } from "./types";

/**
 * QCTA trainer-utilization workbook parser.
 *
 * The workbook is a calendar grid: one column per day and, for every class, a
 * block of three rows (Instructor Name / Course Name / Number of Students). A
 * course that runs several days is merged across those columns, so a non-empty
 * course cell = one session and a non-empty instructor cell = one teaching day.
 * That reproduces the workbook's own totals exactly.
 *
 * Ported from parse_qiddiya_sheet() / load_qiddiya_all() in app.R.
 */

/** qd_clean_chr(): NA -> "" and str_squish(). */
function cleanChr(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = value instanceof Date ? String(value.getTime()) : String(value);
  return s.replace(/\s+/g, " ").trim();
}

/** qd_to_date(): Excel serials in the calendar band, else a parseable date. */
function toDate(value: unknown): Date | null {
  // A workbook read with cellDates:true hands back Date objects for the
  // calendar row; cleanChr() would turn those into an epoch far outside the
  // serial band below, so they are resolved before any string handling.
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : cellToDate(value);
  const s = cleanChr(value);
  if (!s) return null;
  const num = Number(s);
  if (Number.isFinite(num)) {
    // The R code only accepts serials inside the 20000-80000 band.
    if (num > 20000 && num < 80000) return cellToDate(num);
    return null;
  }
  return cellToDate(value);
}

interface SheetGrid {
  /** Untouched cell values, so calendar dates can still be read as serials. */
  raw: unknown[][];
  /** str_squish()-ed string view of the same grid. */
  text: string[][];
  nrow: number;
  ncol: number;
}

function sheetGrid(sheet: XLSX.WorkSheet): SheetGrid {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
  const ncol = aoa.reduce((w, r) => Math.max(w, r.length), 0);
  const raw: unknown[][] = [];
  const text: string[][] = [];
  for (const row of aoa) {
    const r = new Array<unknown>(ncol).fill(null);
    const t = new Array<string>(ncol).fill("");
    for (let i = 0; i < ncol; i += 1) {
      r[i] = row[i] ?? null;
      t[i] = cleanChr(row[i]);
    }
    raw.push(r);
    text.push(t);
  }
  return { raw, text, nrow: aoa.length, ncol };
}

interface SheetResult {
  sessions: Omit<QiddiyaSession, "sourceFile" | "sourceSheet">[];
  days: Omit<QiddiyaDay, "sourceFile" | "sourceSheet">[];
}

export function parseQiddiyaSheet(sheet: XLSX.WorkSheet): SheetResult | null {
  const grid = sheetGrid(sheet);
  const { raw, text: m, nrow: nr, ncol: nc } = grid;
  if (nr < 4 || nc < 3) return null;

  // Locate the row holding the calendar dates: the one with the most parseable
  // dates among the first 12 rows, needing at least 5 hits.
  let dateRow = -1;
  let best = 0;
  const scanRows = Math.min(nr, 12);
  for (let i = 0; i < scanRows; i += 1) {
    let k = 0;
    for (let j = 0; j < nc; j += 1) if (toDate(raw[i][j])) k += 1;
    if (k > best) {
      best = k;
      dateRow = i;
    }
  }
  if (dateRow < 0 || best < 5) return null;

  const dates = raw[dateRow].map((v) => toDate(v));

  // Ignore the Standby / Total block at the bottom.
  const labels = m.map((row) => (row[0] ?? "").toLowerCase());
  let lastRow = nr; // exclusive
  for (let i = dateRow + 1; i < nr; i += 1) {
    if (labels[i] === "standby" || labels[i] === "standby trainers" || labels[i] === "total") {
      lastRow = i;
      break;
    }
  }

  const instrRows: number[] = [];
  for (let i = 0; i < lastRow; i += 1) {
    if (/^instructor name/.test(labels[i])) instrRows.push(i);
  }
  if (!instrRows.length) return null;

  const sessions: SheetResult["sessions"] = [];
  const days: SheetResult["days"] = [];

  for (const ir of instrRows) {
    const cr = ir + 1;
    const sr = ir + 2;
    if (sr >= nr) continue;
    if (!/^course name/.test(labels[cr] ?? "")) continue;
    if (!/number of student/.test(labels[sr] ?? "")) continue;

    // Class label = nearest non-empty label above that is not a field name.
    let grp = "Unassigned";
    for (let j = ir - 1; j >= 0; j -= 1) {
      const lb = m[j][0];
      if (lb && !/^(instructor name|course name|number of student)/.test(lb.toLowerCase())) {
        grp = lb;
        break;
      }
    }

    const instr = m[ir];
    const crs = m[cr];
    const stu = m[sr].map((v) => {
      const n = Number(v);
      return v !== "" && Number.isFinite(n) ? n : NaN;
    });

    for (let cc = 0; cc < nc; cc += 1) {
      const date = dates[cc];
      if (!date) continue;

      if (instr[cc]) {
        days.push({ date, class: grp, instructor: instr[cc] });
      }

      if (crs[cc]) {
        // A merged multi-day course leaves the following course cells blank
        // while the instructor cells stay filled; those columns belong to the
        // same session.
        let len = 1;
        let k = cc + 1;
        while (k < nc && dates[k] && !crs[k] && instr[k]) {
          len += 1;
          k += 1;
        }
        sessions.push({
          date,
          class: grp,
          course: crs[cc],
          instructor: instr[cc] ? instr[cc] : "Not recorded",
          students: Number.isFinite(stu[cc]) ? stu[cc] : 0,
          sessionDays: len,
        });
      }
    }
  }

  if (!sessions.length && !days.length) return null;
  return { sessions, days };
}

export interface QiddiyaFileInput {
  name: string;
  data: ArrayBuffer | Uint8Array;
}

/** load_qiddiya_all(): parse every sheet of every QCTA workbook and de-duplicate. */
export function loadQiddiyaAll(files: QiddiyaFileInput[]): QiddiyaStore | null {
  const sessions: QiddiyaSession[] = [];
  const days: QiddiyaDay[] = [];
  const names: string[] = [];

  for (const file of files) {
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(file.data, { cellDates: true });
    } catch {
      continue;
    }
    names.push(file.name);
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      let parsed: SheetResult | null = null;
      try {
        parsed = parseQiddiyaSheet(sheet);
      } catch {
        parsed = null;
      }
      if (!parsed) continue;
      for (const s of parsed.sessions) {
        sessions.push({ ...s, sourceFile: file.name, sourceSheet: sheetName });
      }
      for (const d of parsed.days) {
        days.push({ ...d, sourceFile: file.name, sourceSheet: sheetName });
      }
    }
  }

  if (!sessions.length && !days.length) return null;

  // Safety net: if the same month appears in two workbooks (e.g. an "updated"
  // copy), identical sessions/days are counted only once.
  const seenS = new Set<string>();
  const uniqueSessions = sessions.filter((s) => {
    const k = `${s.date.getTime()}|${s.class}|${s.course}`;
    if (seenS.has(k)) return false;
    seenS.add(k);
    return true;
  });
  const seenD = new Set<string>();
  const uniqueDays = days.filter((d) => {
    const k = `${d.date.getTime()}|${d.class}|${d.instructor}`;
    if (seenD.has(k)) return false;
    seenD.add(k);
    return true;
  });

  return { sessions: uniqueSessions, days: uniqueDays, files: names };
}
