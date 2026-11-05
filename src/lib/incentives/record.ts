import * as XLSX from "xlsx";
import { cellToDate, cellToNumber, cellToString } from "../xlsx";
import { CourseCatalog, courseFamily } from "./courses";
import { matchInstructor } from "./names";
import type { RecordDay, RecordRow, TeachingBlock } from "./types";

/**
 * The columns a record sheet needs, and the spellings they arrive under.
 *
 * The export has been renamed at least once: what used to be CertNo /
 * StudentName / PrintedCourseName / IssuedOn now comes out as Participant's
 * Name / Course Name / Actual Date, with no certificate number at all. Both
 * are the same record of what was taught, so both are read, and a sheet is
 * matched on what it carries rather than on one fixed set of headings.
 *
 * Only four are required. They are the four a day is checked from — who
 * taught, what, when, and under which session — and requiring more would
 * turn a renamed column into a workbook the app refuses to open.
 */
const COLUMNS = {
  instructor: { names: ["InstructorName", "Instructor"], required: true },
  course: { names: ["PrintedCourseName", "CourseName", "Course"], required: true },
  date: { names: ["IssuedOn", "ActualDate", "Date"], required: true },
  session: { names: ["SessionNo", "Session"], required: true },
  student: { names: ["StudentName", "ParticipantsName", "ParticipantName"], required: false },
  client: { names: ["ClientName", "Client"], required: false },
  location: { names: ["Location"], required: false },
  rig: { names: ["RigNo", "Rig"], required: false },
  /** "Actual Sessions" — the office's own grouping of rows into classes. */
  classKey: { names: ["ActualSessions", "ActualSession"], required: false },
} as const;

type ColumnName = keyof typeof COLUMNS;

export const RECORD_COLUMNS = (Object.keys(COLUMNS) as ColumnName[])
  .filter((k) => COLUMNS[k].required)
  .map((k) => COLUMNS[k].names[0]);

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
  /**
   * Every month the sheet holds rows for, busiest first.
   *
   * The old export was one month per file. The newer one is the whole record
   * \u2014 the file we were given runs from January 2024 to October 2026 \u2014 so the
   * month cannot be read off the file and has to be chosen.
   */
  months: { year: number; month: number; label: string; rows: number }[];
}

export function monthLabelOf(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

/**
 * The same record sheet, narrowed to one month.
 *
 * Everything downstream reads `year`, `month` and `monthLabel` off this and
 * bounds itself to them, so picking a month is a matter of handing the rest of
 * the app a record sheet that is about that month \u2014 rather than threading a
 * date through every call that takes one.
 *
 * The rows of the five weeks before it come too. A course that started on the
 * 30th and runs four days is taught on the 1st and the 2nd, and dropping its
 * only row would turn those into days nobody delivered.
 */
export function recordForMonth(
  parsed: ParsedRecordSheet,
  year: number,
  month: number,
): ParsedRecordSheet {
  const start = new Date(year, month, 1);
  const leadIn = new Date(year, month, 1 - 35);
  const end = new Date(year, month + 1, 0);
  const rows = parsed.rows.filter((r) => r.date >= leadIn && r.date <= end);
  const inMonth = rows.filter((r) => r.date >= start);
  return {
    ...parsed,
    rows,
    instructors: [...new Set(inMonth.map((r) => r.instructorName).filter(Boolean))].sort(),
    dates: [...new Set(inMonth.map((r) => dayKey(r.date)))].sort(),
    year,
    month,
    monthLabel: monthLabelOf(year, month),
  };
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
    /* The first spelling of a column that this sheet actually uses. */
    const find = (name: ColumnName): number => {
      for (const spelling of COLUMNS[name].names) {
        const at = header.indexOf(normaliseHeader(spelling));
        if (at >= 0) return at;
      }
      return -1;
    };
    const at = Object.fromEntries(
      (Object.keys(COLUMNS) as ColumnName[]).map((k) => [k, find(k)]),
    ) as Record<ColumnName, number>;

    const missing = (Object.keys(COLUMNS) as ColumnName[])
      .filter((k) => COLUMNS[k].required && at[k] < 0)
      .map((k) => COLUMNS[k].names.join(" / "));
    if (missing.length) {
      tried.push(`${sheetName} (missing ${missing.join(", ")})`);
      continue;
    }

    // Certificate numbers are gone from the newer export, so a row is
    // identified by its session and its course instead.
    const cCert = find("classKey") >= 0 ? -1 : header.indexOf(normaliseHeader("CertNo"));
    const cStudent = at.student;
    const cClient = at.client;
    const cInstructor = at.instructor;
    const cCourse = at.course;
    const cDate = at.date;
    const cLocation = at.location;
    const cSession = at.session;
    const cRig = at.rig;
    const cClassKey = at.classKey;

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
        certNo: cCert >= 0 ? cellToString(r[cCert]) : "",
        classKey: cClassKey >= 0 ? cellToString(r[cClassKey]).trim() : "",
        studentName: cStudent >= 0 ? cellToString(r[cStudent]) : "",
        clientName: cClient >= 0 ? cellToString(r[cClient]) : "",
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
    const months = [...monthCounts.entries()]
      .map(([k, count]) => {
        const [y, m] = k.split("-").map(Number);
        return { year: y, month: m, label: monthLabelOf(y, m), rows: count };
      })
      .sort((a, b) => b.year - a.year || b.month - a.month);
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
      months,
      monthLabel: monthLabelOf(year, month),
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
  /*
   * When the sheet says which rows are one class, believe it.
   *
   * The newer export carries an "Actual Sessions" column — course, instructor
   * and date rolled into one key — which is the office stating the grouping
   * everything below this has to infer. On 1 January 2024 it puts Asif Farid's
   * three session numbers in one class, and a third of the instructor-days in
   * that file are the same shape: counted by session number they would read as
   * two or three half days where one class ran.
   *
   * So where the column is there the clustering is skipped entirely. Inferring
   * a thing the evidence already settles is how you get a confident wrong
   * answer.
   */
  if (rows.length && rows.every((r) => r.classKey)) {
    const byClass = new Map<string, RecordRow[]>();
    for (const r of rows) {
      const list = byClass.get(r.classKey);
      if (list) list.push(r);
      else byClass.set(r.classKey, [r]);
    }
    return [...byClass.values()]
      .sort((a, b) => (a[0].sessionSeq ?? 0) - (b[0].sessionSeq ?? 0))
      .map((flat) => buildBlock(flat, catalog));
  }

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

  return clusters.map((cluster) => buildBlock(cluster.flat(), catalog));
}

/** One cluster of certificate rows, valued as a teaching block. */
function buildBlock(flat: RecordRow[], catalog: CourseCatalog): TeachingBlock {
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
