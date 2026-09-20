import * as XLSX from "xlsx";
import { cellToDate, cellToNumber, cellToString } from "../xlsx";
import { parseDurationLabel } from "./courses";
import type {
  ClaimKind,
  ClaimRow,
  ClaimSection,
  IncentiveSheet,
  VerificationEntry,
  VerificationLayout,
} from "./types";

type Grid = (string | number | boolean | Date | null)[][];

function cellAt(grid: Grid, row: number, col: number): unknown {
  return grid[row]?.[col] ?? null;
}

function text(grid: Grid, row: number, col: number): string {
  return cellToString(cellAt(grid, row, col)).replace(/\s+/g, " ").trim();
}

/** A1-style address from zero-based row/column. */
export function addr(row: number, col: number): string {
  return `${XLSX.utils.encode_col(col)}${row + 1}`;
}

/**
 * Read a sheet as a grid whose indices are the real ones: grid[0][0] is A1.
 *
 * sheet_to_json starts at the sheet's used range, and these workbooks start at
 * A4 — the header block above the grid is merged cells with nothing in column
 * A. Without the padding every cell reference in a finding would point three
 * rows too high, which is worse than no reference at all.
 */
function sheetToGrid(sheet: XLSX.WorkSheet): Grid {
  const body = XLSX.utils.sheet_to_json<Grid[number]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: true,
  });
  const ref = sheet["!ref"];
  if (!ref) return body;
  const origin = XLSX.utils.decode_range(ref).s;
  const padded = origin.c > 0 ? body.map((r) => [...new Array(origin.c).fill(null), ...r]) : body;
  if (origin.r <= 0) return padded;
  return [...Array.from({ length: origin.r }, () => [] as Grid[number]), ...padded];
}

/* ------------------------------------------------------------------ *
 * Claim-grid row classification
 * ------------------------------------------------------------------ */

/*
 * Order matters. The middle band is headed "…more than 150 KM-350KM from
 * NEFT", which ends in the same words as the far band's heading — tested the
 * other way round, every 150-350 km claim would be filed and described as a
 * rig trip.
 */
/** From a string so the en dash survives any bundler and any charset. */
const AFTERNOON_SLOT = new RegExp("\\b1\\s*(to|-|\\u2013)\\s*5\\b|afternoon|pm\\b");
/** "Half Day" on the 2025 form, "Half-Day" on NE-HR050. */
const HALF_DAY = /half[\s-]*day/;
const FULL_DAY = /full[\s-]*day/;

const SECTION_PATTERNS: [RegExp, ClaimSection][] = [
  /* The three "Per Diem -" headings differ only by who they are for, so the
     two narrow ones have to be tried before the word all three share. */
  /* Anchored: the per-diem heading ends "...outside special project", and an
     unanchored test would file the whole per-diem block under Special
     Projects. Both real headings open with the words. */
  [/^special\s*projects?\b/i, "special"],
  [/office\s*boy|janitor/i, "officeboy"],
  [/admins?\s*(and|&|\/)\s*coordinator/i, "admin"],
  [/per\s*diem|trainings?\s+with\s+distance\s+over/i, "perdiem"],
  /* Still before "far": the 2025 mid heading ends "...150 KM-350KM from
     NEFT", so a far pattern loose enough to catch a bare 350 would take it. */
  [/more\s*than\s*150\s*k?m|150\s*k?m\s*-\s*350|15[01]\s*k?m\s*(to|\u2013|-)\s*350/i, "mid"],
  [/more\s*than\s*350\s*k?m|351\s*k?m|remote\s*locations?|rig\s*(or|\/)\s*well/i, "far"],
  [/neft\s*facility|within\s*150\s*km|training\s*sessions?/i, "near"],
];

function sectionOf(label: string): ClaimSection | null {
  for (const [re, section] of SECTION_PATTERNS) if (re.test(label)) return section;
  return null;
}

/**
 * Which rate line a row is.
 *
 * Matched on the wording rather than the row number: trainers copy the sheet
 * forward year after year, and a row inserted anywhere above would otherwise
 * shift every rule by one.
 */
function classify(label: string, section: ClaimSection): { kind: ClaimKind; dayValue: number } {
  const l = label.toLowerCase();
  if (section === "perdiem") return { kind: "perdiem", dayValue: 0 };
  if (section === "admin" || section === "officeboy") return { kind: "admin", dayValue: 0 };
  if (section === "special") {
    // The section also carries a sentence of prose about prorating a part
    // week; only the lines quoting a rate are lines.
    return /weekly|daily|daliy/.test(l)
      ? { kind: "special", dayValue: 0 }
      : { kind: "unknown", dayValue: 0 };
  }
  if (section === "near") {
    if (/saturday/.test(l)) {
      return /full/.test(l) ? { kind: "satFull", dayValue: 1 } : { kind: "satHalf", dayValue: 0.5 };
    }
    if (/friday/.test(l)) {
      return /full/.test(l) ? { kind: "friFull", dayValue: 1 } : { kind: "friHalf", dayValue: 0.5 };
    }
    if (/other\s*holiday/.test(l)) return { kind: "holiday", dayValue: 1 };
    if (HALF_DAY.test(l)) {
      const pm = AFTERNOON_SLOT.test(l);
      return { kind: pm ? "halfPM" : "halfAM", dayValue: 0.5 };
    }
    if (FULL_DAY.test(l)) return { kind: "full", dayValue: 1 };
    return { kind: "unknown", dayValue: 0 };
  }
  // mid / far bands
  if (/travel|standby|stand\s*by/.test(l)) return { kind: "travel", dayValue: 1 };
  if (/friday/.test(l)) return { kind: "friday", dayValue: 1 };
  if (/daily\s*rate/.test(l)) return { kind: "daily", dayValue: 1 };
  return { kind: "unknown", dayValue: 0 };
}

export const SECTION_LABELS: Record<ClaimSection, string> = {
  near: "NEFT facility / within 150 km",
  mid: "150–350 km from NEFT",
  far: "Over 350 km, rig or well",
  perdiem: "Per diem",
  admin: "Admins and coordinators",
  officeboy: "Office boy / maintenance / janitor",
  special: "Special projects",
};

export const KIND_LABELS: Record<ClaimKind, string> = {
  halfAM: "Half day (08:00–12:00)",
  halfPM: "Half day (13:00–17:00)",
  full: "Full day (08:00–16:00)",
  satHalf: "Saturday half day",
  satFull: "Saturday full day",
  friHalf: "Friday half day",
  friFull: "Friday full day",
  holiday: "Other holiday",
  daily: "Daily rate",
  travel: "Travelling / standby day",
  friday: "Friday",
  perdiem: "Per diem",
  admin: "Admin / coordinator",
  special: "Special project, weekly",
  unknown: "Unrecognised line",
};

export const FRIDAY = 5;
export const SATURDAY = 6;

/** The half- and full-day lines a given weekday is paid on. */
export function expectedKinds(weekday: number): { half: ClaimKind; full: ClaimKind } {
  if (weekday === FRIDAY) return { half: "friHalf", full: "friFull" };
  if (weekday === SATURDAY) return { half: "satHalf", full: "satFull" };
  return { half: "halfAM", full: "full" };
}

/**
 * The rate line a day of this size, on this weekday, in this band belongs on.
 *
 * Shared by the verifier, which uses it to say where a wrongly-placed tick
 * should move, and by the generator, which uses it to place the ticks on a
 * sheet nobody submitted. Null when the day is worth nothing.
 */
export function targetKind(
  sheet: IncentiveSheet,
  section: ClaimSection,
  weekday: number,
  days: number,
): ClaimKind | null {
  if (days <= 0) return null;
  if (section === "near") {
    const { half, full } = expectedKinds(weekday);
    return days <= 0.5 ? half : full;
  }
  const hasFriday = sheet.rows.some((r) => r.section === section && r.kind === "friday" && r.rate > 0);
  return weekday === FRIDAY && hasFriday ? "friday" : "daily";
}

/** The cell a rate line's tick for a day of the month goes in. */
export function claimCell(
  sheet: IncentiveSheet,
  section: ClaimSection,
  kind: ClaimKind,
  day: number,
): string | null {
  const row = sheet.rows.find((r) => r.section === section && r.kind === kind);
  const column = sheet.dayColumns.find((d) => !d.nextMonth && d.day === day)?.column;
  return row && column ? `${column}${row.rowIndex}` : null;
}

/* ------------------------------------------------------------------ *
 * The claim grid
 * ------------------------------------------------------------------ */

interface GridLayout {
  headerRow: number;
  labelCol: number;
  dayCols: { day: number; col: number; nextMonth: boolean }[];
  rateCol: number;
  totalCol: number;
  initialsCol: number;
}

/**
 * Locate the grid: the header row carries "Description" and then the days of
 * the month, and ends with SAR / INITIALS / Total.
 */
function findGrid(grid: Grid): GridLayout | null {
  for (let row = 0; row < Math.min(grid.length, 30); row += 1) {
    const width = grid[row]?.length ?? 0;
    if (width < 10) continue;
    let labelCol = -1;
    for (let c = 0; c < Math.min(width, 4); c += 1) {
      if (/^description/i.test(text(grid, row, c))) {
        labelCol = c;
        break;
      }
    }
    if (labelCol < 0) continue;

    const dayCols: GridLayout["dayCols"] = [];
    let rateCol = -1;
    let totalCol = -1;
    let initialsCol = -1;
    let seenDay1 = false;
    for (let c = labelCol + 1; c < width; c += 1) {
      const raw = cellAt(grid, row, c);
      const label = cellToString(raw);
      if (/^sar$/i.test(label)) rateCol = c;
      else if (/^initials$/i.test(label)) initialsCol = c;
      else if (/^total/i.test(label)) totalCol = c;
      else if (typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 31) {
        // The template repeats a "1" after the 31st for the next month's
        // first day; the second run of low numbers belongs to that month.
        const nextMonth = seenDay1 && raw === 1;
        if (raw === 1) seenDay1 = true;
        dayCols.push({ day: raw, col: c, nextMonth });
      }
    }
    if (dayCols.length >= 20 && totalCol >= 0) {
      return { headerRow: row, labelCol, dayCols, rateCol, totalCol, initialsCol };
    }
  }
  return null;
}

function parseClaimRows(grid: Grid, layout: GridLayout): { rows: ClaimRow[]; grandTotalRow: number } {
  const rows: ClaimRow[] = [];
  let section: ClaimSection = "near";
  let grandTotalRow = -1;

  for (let row = layout.headerRow + 1; row < grid.length; row += 1) {
    const label = text(grid, row, layout.labelCol);

    // "Total" sits one column in from the labels and closes the grid.
    if (/^total\b/i.test(text(grid, row, layout.labelCol + 1))) {
      grandTotalRow = row;
      break;
    }
    if (!label) continue;
    if (/^standards to comply/i.test(label)) break;

    const asSection = sectionOf(label);
    const rate = layout.rateCol >= 0 ? cellToNumber(cellAt(grid, row, layout.rateCol)) : 0;
    // A section heading spans the grid and carries no rate of its own.
    if (asSection && rate === 0) {
      section = asSection;
      continue;
    }

    const { kind, dayValue } = classify(label, section);
    if (kind === "unknown" && rate === 0) continue;

    const days: number[] = [];
    const cells: string[] = [];
    for (const { day, col, nextMonth } of layout.dayCols) {
      const v = cellAt(grid, row, col);
      if (v === null || v === "" || v === false) continue;
      const n = typeof v === "number" ? v : cellToNumber(v);
      const ticks = Number.isFinite(n) && n > 0 ? Math.round(n) : 1;
      for (let i = 0; i < Math.max(1, ticks); i += 1) days.push(nextMonth ? day + 100 : day);
      cells.push(addr(row, col));
    }

    const statedRaw = cellAt(grid, row, layout.totalCol);
    rows.push({
      rowIndex: row + 1,
      label,
      section,
      kind,
      rate,
      dayValue,
      days,
      cells,
      statedTotal: statedRaw === null || statedRaw === "" ? null : cellToNumber(statedRaw),
      totalCell: addr(row, layout.totalCol),
    });
  }

  return { rows, grandTotalRow };
}

/* ------------------------------------------------------------------ *
 * The trainer's own verification log
 * ------------------------------------------------------------------ */

function parseVerification(
  grid: Grid,
): { entries: VerificationEntry[]; layout: VerificationLayout } | null {
  let headerRow = -1;
  let dateCol = -1;
  for (let row = 0; row < Math.min(grid.length, 20) && headerRow < 0; row += 1) {
    const width = grid[row]?.length ?? 0;
    for (let c = 0; c < Math.min(width, 6); c += 1) {
      if (/^actual\s*date$/i.test(text(grid, row, c))) {
        headerRow = row;
        dateCol = c;
        break;
      }
    }
  }
  if (headerRow < 0) return null;

  const width = grid[headerRow]?.length ?? 0;
  let courseCol = dateCol + 1;
  let locationCol = dateCol + 2;
  let sessionCol = dateCol + 3;
  let durationCol = dateCol + 4;
  for (let c = dateCol + 1; c < width; c += 1) {
    const h = text(grid, headerRow, c).toLowerCase();
    if (/course/.test(h)) courseCol = c;
    else if (/location/.test(h)) locationCol = c;
    else if (/session/.test(h)) sessionCol = c;
    else if (/duration/.test(h)) durationCol = c;
  }

  const layout: VerificationLayout = {
    headerRow: headerRow + 1,
    dateColumn: XLSX.utils.encode_col(dateCol),
    courseColumn: XLSX.utils.encode_col(courseCol),
    locationColumn: XLSX.utils.encode_col(locationCol),
    sessionColumn: XLSX.utils.encode_col(sessionCol),
    durationColumn: XLSX.utils.encode_col(durationCol),
    lastRow: headerRow + 1,
  };

  const entries: VerificationEntry[] = [];
  for (let row = headerRow + 1; row < grid.length; row += 1) {
    const rawDate = cellToString(cellAt(grid, row, dateCol));
    const courseName = text(grid, row, courseCol);
    const location = text(grid, row, locationCol);
    const sessionNo = text(grid, row, sessionCol);
    const durationLabel = text(grid, row, durationCol);
    // Pre-printed date columns run past the last entry; a row is only a claim
    // once the trainer has written something on it.
    // The pre-printed date column runs past the last entry, so the last row
    // that matters is the last one with something written on it — that is what
    // a rebuilt log has to clear down to.
    if (rawDate || courseName || sessionNo || durationLabel) layout.lastRow = row + 1;
    if (!courseName && !sessionNo && !durationLabel) continue;
    entries.push({
      rowIndex: row + 1,
      date: cellToDate(cellAt(grid, row, dateCol)),
      rawDate,
      courseName,
      location,
      sessionNo,
      durationLabel,
      durationDays: parseDurationLabel(durationLabel),
    });
  }
  return { entries, layout };
}

/* ------------------------------------------------------------------ *
 * Header fields
 * ------------------------------------------------------------------ */

/** A merged range, as the sheet declares it. */
export interface Merge {
  s: { r: number; c: number };
  e: { r: number; c: number };
}

/** The merged range covering a cell, if any. */
function mergeAt(merges: Merge[], row: number, col: number): Merge | null {
  return (
    merges.find((m) => row >= m.s.r && row <= m.e.r && col >= m.s.c && col <= m.e.c) ?? null
  );
}

/**
 * The address a value written at this position will actually show at.
 *
 * Only the top-left cell of a merged range holds anything; the rest are
 * painted over by it.
 */
function anchor(merges: Merge[], row: number, col: number): string {
  const m = mergeAt(merges, row, col);
  return m ? addr(m.s.r, m.s.c) : addr(row, col);
}

/**
 * Find a labelled field: "Instructor Name:" and the cell holding the answer.
 *
 * The address matters as much as the value — a sheet generated for a trainer
 * who never sent one has to write their name into the same cell the template
 * uses, whichever column the label happens to sit in.
 */
function labelledField(
  grid: Grid,
  upto: number,
  pattern: RegExp,
  merges: Merge[] = [],
): { value: string; cell: string | null } {
  for (let row = 0; row < Math.min(grid.length, upto); row += 1) {
    const width = grid[row]?.length ?? 0;
    for (let c = 0; c < width; c += 1) {
      if (!pattern.test(text(grid, row, c))) continue;
      /*
       * Start after the label's own merge.
       *
       * NE-HR050 merges "Month :" across three columns and puts the answer in
       * the merge after it. Writing into the second column of the label's own
       * range is writing into a cell Excel never draws — the name would go in
       * and the sheet would come out blank.
       */
      const own = mergeAt(merges, row, c);
      const from = own ? own.e.c + 1 : c + 1;
      // Bounded, because the signature row carries "Verifier By:" and
      // "Approved by:" side by side — scanning the whole row for the first
      // filled cell would hand back the next label as this one's answer.
      const limit = Math.min(width, from + 10);
      for (let k = from; k < limit; k += 1) {
        const v = cellAt(grid, row, k);
        if (v === null || v === "") continue;
        if (/:$/.test(text(grid, row, k))) break;
        // A month typed as a date arrives as an Excel serial; "August" does not.
        const asDate =
          v instanceof Date || (typeof v === "number" && v > 20000 && v < 80000)
            ? cellToDate(v)
            : null;
        const value = asDate
          ? asDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
          : cellToString(v).replace(/\s+/g, " ").trim();
        return { value, cell: anchor(merges, row, k) };
      }
      // A label with nothing beside it still tells us where the answer goes:
      // the first cell past it, which a blank template leaves empty.
      return { value: "", cell: anchor(merges, row, from) };
    }
  }
  return { value: "", cell: null };
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

export function parseIncentiveSheet(
  fileName: string,
  data: ArrayBuffer | Uint8Array,
): IncentiveSheet {
  const wb = XLSX.read(data, { cellDates: false });
  const parseWarnings: string[] = [];

  let layout: GridLayout | null = null;
  let grid: Grid | null = null;
  let timeSheetName = "";
  /** The grid tab's merged ranges, so a label's answer lands where it shows. */
  let merges: Merge[] = [];
  let verification: VerificationEntry[] | null = null;
  let verificationLayout: VerificationLayout | null = null;
  let verificationSheetName: string | null = null;

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const g = sheetToGrid(sheet);

    if (!layout) {
      const found = findGrid(g);
      // The blank template ships as the first tab; the filled grid is the one
      // with rates on it.
      if (found) {
        const { rows } = parseClaimRows(g, found);
        const hasRates = rows.some((r) => r.rate > 0);
        if (hasRates) {
          layout = found;
          grid = g;
          timeSheetName = name;
          merges = (sheet["!merges"] ?? []) as Merge[];
        }
      }
    }
    if (!verification) {
      const found = parseVerification(g);
      if (found) {
        verification = found.entries;
        verificationLayout = found.layout;
        verificationSheetName = name;
      }
    }
  }

  if (!layout || !grid) {
    throw new Error(
      `${fileName}: no time-sheet grid found. Expected a "Description" row followed by the days of the month and a SAR rate column.`,
    );
  }

  const { rows, grandTotalRow } = parseClaimRows(grid, layout);
  const statedGrandTotal =
    grandTotalRow >= 0 ? cellToNumber(cellAt(grid, grandTotalRow, layout.totalCol)) : null;

  const instructor = labelledField(grid, layout.headerRow, /instructor\s*'?s?\s*name/i, merges);
  const month = labelledField(grid, layout.headerRow, /^month\b/i, merges);
  const instructorName = instructor.value;
  const monthLabel = month.value;
  // The signature blocks sit below the grid; a generated sheet must not carry
  // the initials of whoever verified the workbook it was copied from.
  const verifier = labelledField(grid, grid.length, /^verifier\s*(by)?\s*:?$/i, merges);
  const approver = labelledField(grid, grid.length, /^approved\s*by\s*:?$/i, merges);
  if (!instructorName) parseWarnings.push("No instructor name is written on the time sheet.");
  if (!verification) parseWarnings.push("This workbook has no verification log tab.");

  return {
    fileName,
    instructorName,
    monthLabel,
    timeSheetName,
    verificationSheetName,
    headerRow: layout.headerRow + 1,
    instructorCell: instructor.cell,
    monthCell: month.cell,
    initialsColumn: layout.initialsCol >= 0 ? XLSX.utils.encode_col(layout.initialsCol) : null,
    signatureCells: [verifier.cell, approver.cell].filter((c): c is string => Boolean(c)),
    dayColumns: layout.dayCols.map((d) => ({
      day: d.day,
      column: XLSX.utils.encode_col(d.col),
      nextMonth: d.nextMonth,
    })),
    rows,
    statedGrandTotal,
    grandTotalCell: grandTotalRow >= 0 ? addr(grandTotalRow, layout.totalCol) : "",
    verification: verification ?? [],
    verificationLayout,
    parseWarnings,
  };
}
