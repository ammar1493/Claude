import * as XLSX from "xlsx";
import { cellToDate, cellToNumber, cellToString } from "../xlsx";
import { CourseCatalog, courseFamily } from "./courses";
import { matchInstructor } from "./names";
import type { RecordDay, RecordRow, TeachingBlock } from "./types";

export const RECORD_COLUMNS = [
  "CertNo",
  "StudentName",
  "ClientName",
  "InstructorName",
  "PrintedCourseName",
  "IssuedOn",
  "SessionNo",
] as const;

function normaliseHeader(h: string): string {
  return h.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Trailing digits of "SEN-2026-03328", used only to order a day's sessions. */
export function sessionSequence(sessionNo: string): number | null {
  const m = /(\d{2,})\s*$/.exec(String(sessionNo ?? "").trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Session numbers compare on their serial alone.
 *
 * The record sheet writes "SEN-2026-03332"; trainers write "SEN - 2026 - 3332",
 * "SEN02026-3604", "3364", or several at once ("SEN-2026-3559, 60, 61, 62").
 * So the year is dropped, leading zeros go, and every serial in the cell is
 * returned — a line quoting two sessions is supported by either.
 */
export function sessionCandidates(sessionNo: string): string[] {
  const groups = String(sessionNo ?? "").match(/\d+/g) ?? [];
  const out: string[] = [];
  for (const g of groups) {
    const trimmed = g.replace(/^0+/, "") || "0";
    // 19xx/20xx four-digit groups are the year part of the prefix.
    if (g.length === 4 && /^(19|20)\d\d$/.test(g)) continue;
    if (trimmed.length < 3) continue;
    if (!out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}

/** The single serial a session number resolves to, or "" when it is unusable. */
export function canonicalSession(sessionNo: string): string {
  return sessionCandidates(sessionNo)[0] ?? "";
}

export interface ParsedRecordSheet {
  rows: RecordRow[];
  sheetName: string;
  instructors: string[];
  /** Every date the sheet covers, ISO, ascending. */
  dates: string[];
  monthLabel: string;
  year: number;
  month: number;
}

export function parseRecordSheet(data: ArrayBuffer | Uint8Array): ParsedRecordSheet {
  const wb = XLSX.read(data, { cellDates: false });
  const tried: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const aoa = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: null,
      raw: true,
    });
    if (aoa.length < 2) continue;

    const header = (aoa[0] ?? []).map((c) => normaliseHeader(cellToString(c)));
    const idx = (want: string) => header.indexOf(normaliseHeader(want));
    const missing = RECORD_COLUMNS.filter((c) => idx(c) < 0);
    if (missing.length) {
      tried.push(`${sheetName} (missing ${missing.join(", ")})`);
      continue;
    }

    const cCert = idx("CertNo");
    const cStudent = idx("StudentName");
    const cClient = idx("ClientName");
    const cInstructor = idx("InstructorName");
    const cCourse = idx("PrintedCourseName");
    const cDate = idx("IssuedOn");
    const cLocation = idx("Location");
    const cSession = idx("SessionNo");
    const cRig = idx("RigNo");

    const rows: RecordRow[] = [];
    for (let i = 1; i < aoa.length; i += 1) {
      const r = aoa[i];
      if (!r) continue;
      const date = cellToDate(r[cDate]);
      if (!date) continue;
      const instructorName = cellToString(r[cInstructor]);
      const courseName = cellToString(r[cCourse]);
      if (!instructorName && !courseName) continue;
      const sessionNo = cellToString(r[cSession]);
      rows.push({
        certNo: cellToString(r[cCert]),
        studentName: cellToString(r[cStudent]),
        clientName: cellToString(r[cClient]),
        instructorName,
        courseName,
        date,
        location: cLocation >= 0 ? cellToString(r[cLocation]).replace(/\s+/g, " ") : "",
        sessionNo,
        rigNo: cRig >= 0 ? cellToString(r[cRig]) : "",
        sessionSeq: sessionSequence(sessionNo),
      });
    }
    if (!rows.length) {
      tried.push(`${sheetName} (no dated rows)`);
      continue;
    }

    const instructors = [...new Set(rows.map((r) => r.instructorName).filter(Boolean))].sort();
    const dates = [...new Set(rows.map((r) => dayKey(r.date)))].sort();

    // The month the sheet is about: the one most of its rows fall in.
    const monthCounts = new Map<string, number>();
    for (const r of rows) {
      const k = `${r.date.getFullYear()}-${r.date.getMonth()}`;
      monthCounts.set(k, (monthCounts.get(k) ?? 0) + 1);
    }
    const [topMonth] = [...monthCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const [yearStr, monthStr] = topMonth.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);

    return {
      rows,
      sheetName,
      instructors,
      dates,
      year,
      month,
      monthLabel: new Date(year, month, 1).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      }),
    };
  }

  throw new Error(
    `No sheet carries the Record Sheet columns (${RECORD_COLUMNS.join(", ")}). ` +
      (tried.length ? `Checked: ${tried.join("; ")}.` : "The workbook has no readable sheets."),
  );
}

/**
 * Split one instructor-day's certificate rows into teaching blocks.
 *
 * Sessions are numbered in the order they are booked, so the sessions of one
 * class sit next to each other. A new block starts when the subject changes,
 * or when the numbering jumps — the same subject taught morning *and*
 * afternoon shows up as two clusters of numbers with a gap between them
 * (Abdelrahman Salama, 20 Aug: H2S at 3640-1 and again at 3648-9).
 */
const SESSION_GAP = 3;

export function groupSessionsIntoBlocks(
  rows: RecordRow[],
  catalog: CourseCatalog,
): TeachingBlock[] {
  // One entry per session number; a session is never split across blocks.
  const bySession = new Map<string, RecordRow[]>();
  for (const r of rows) {
    const key = r.sessionNo || `${r.courseName}|${r.certNo}`;
    const list = bySession.get(key);
    if (list) list.push(r);
    else bySession.set(key, [r]);
  }

  const sessions = [...bySession.values()].sort((a, b) => {
    const sa = a[0].sessionSeq;
    const sb = b[0].sessionSeq;
    if (sa === null || sb === null) return a[0].courseName.localeCompare(b[0].courseName);
    return sa - sb;
  });

  const clusters: RecordRow[][][] = [];
  let current: RecordRow[][] = [];
  let lastSeq: number | null = null;
  let lastFamily: string | null = null;

  for (const session of sessions) {
    const seq = session[0].sessionSeq;
    const family = courseFamily(session[0].courseName);
    const gapped = lastSeq !== null && seq !== null && seq - lastSeq > SESSION_GAP;
    const differentSubject = lastFamily !== null && family !== lastFamily;
    if (current.length && (gapped || differentSubject)) {
      clusters.push(current);
      current = [];
    }
    current.push(session);
    lastSeq = seq ?? lastSeq;
    lastFamily = family;
  }
  if (current.length) clusters.push(current);

  return clusters.map((cluster) => {
    const flat = cluster.flat();
    const courseNames = [...new Set(flat.map((r) => r.courseName).filter(Boolean))];
    // The block is worth its longest course: a class certified at Awareness
    // and Level-2 ran once, for the longer of the two.
    let duration = null as TeachingBlock["duration"];
    let best = -1;
    for (const name of courseNames) {
      const d = catalog.lookup(name);
      if (d && d.days > best) {
        best = d.days;
        duration = d;
      }
    }
    const spanDays = duration ? Math.max(1, Math.round(duration.days)) : 1;
    const dayValue = duration ? Math.min(1, duration.days) : 0.5;
    return {
      courseName: courseNames[0] ?? "",
      courseNames,
      sessionNos: [...new Set(flat.map((r) => r.sessionNo).filter(Boolean))],
      clients: [...new Set(flat.map((r) => r.clientName).filter(Boolean))],
      locations: [...new Set(flat.map((r) => r.location).filter(Boolean))],
      rigNos: [...new Set(flat.map((r) => r.rigNo).filter(Boolean))],
      participants: flat.length,
      duration,
      dayValue,
      spanDays,
    };
  });
}

const IN_HOUSE = /^(NEFT|NEEFT|NEFT ENERGIES|NEFT FACILITY|IN HOUSE|INHOUSE)$/i;

export function isInHouse(location: string): boolean {
  return IN_HOUSE.test(location.trim());
}

/** Everything the Record Sheet says about one instructor, keyed by date. */
export function buildRecordDays(
  rows: RecordRow[],
  instructorName: string,
  catalog: CourseCatalog,
): Map<string, RecordDay> {
  const mine = rows.filter((r) => r.instructorName === instructorName);
  const byDate = new Map<string, RecordRow[]>();
  for (const r of mine) {
    const k = dayKey(r.date);
    const list = byDate.get(k);
    if (list) list.push(r);
    else byDate.set(k, [r]);
  }

  const days = new Map<string, RecordDay>();
  for (const [key, dayRows] of byDate) {
    const blocks = groupSessionsIntoBlocks(dayRows, catalog);
    const locations = [...new Set(dayRows.map((r) => r.location).filter(Boolean))];
    const rawLoad = blocks.reduce((sum, b) => sum + b.dayValue, 0);
    days.set(key, {
      key,
      date: dayRows[0].date,
      blocks,
      continuations: [],
      rawLoad,
      load: Math.min(1, rawLoad),
      allInHouse: locations.length > 0 && locations.every(isInHouse),
      locations,
    });
  }

  // A multi-day course issues its certificates on day one but keeps the
  // instructor for its whole run, so the following days are teaching days too.
  for (const day of [...days.values()]) {
    for (const block of day.blocks) {
      if (block.spanDays <= 1) continue;
      for (let i = 1; i < block.spanDays; i += 1) {
        const date = addDays(day.date, i);
        const key = dayKey(date);
        const existing = days.get(key);
        if (existing) {
          existing.continuations.push(block);
          existing.load = Math.min(1, Math.max(existing.load, 1));
          if (!existing.locations.length) existing.locations = [...block.locations];
        } else {
          days.set(key, {
            key,
            date,
            blocks: [],
            continuations: [block],
            rawLoad: 1,
            load: 1,
            allInHouse: block.locations.length > 0 && block.locations.every(isInHouse),
            locations: [...block.locations],
          });
        }
      }
    }
  }

  return days;
}

/** Index of every session number in the sheet, for the verification log check. */
export function buildSessionIndex(rows: RecordRow[]): Map<string, RecordRow[]> {
  const index = new Map<string, RecordRow[]>();
  for (const r of rows) {
    for (const key of sessionCandidates(r.sessionNo)) {
      const list = index.get(key);
      if (list) list.push(r);
      else index.set(key, [r]);
    }
  }
  return index;
}

export function participantsOf(block: TeachingBlock): number {
  return block.participants;
}

export { matchInstructor, cellToNumber };
