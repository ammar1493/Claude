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
const SECTION_PATTERNS: [RegExp, ClaimSection][] = [
  [/per\s*diem|trainings?\s+with\s+distance\s+over/i, "perdiem"],
  [/admins?\s*(and|&)\s*coordinator/i, "admin"],
  [/more\s*than\s*150\s*k?m|150\s*k?m\s*-\s*350\s*k?m/i, "mid"],
  [/more\s*than\s*350\s*k?m|rig\s*\/\s*well/i, "far"],
  [/neft\s*facility|within\s*150\s*km/i, "near"],
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
  if (section === "admin") return { kind: "admin", dayValue: 0 };
  if (section === "near") {
    if (/saturday/.test(l)) {
      return /full/.test(l) ? { kind: "satFull", dayValue: 1 } : { kind: "satHalf", dayValue: 0.5 };
    }
    if (/friday/.test(l)) {
      return /full/.test(l) ? { kind: "friFull", dayValue: 1 } : { kind: "friHalf", dayValue: 0.5 };
    }
    if (/other\s*holiday/.test(l)) return { kind: "holiday", dayValue: 1 };
    if (/half\s*day/.test(l)) {
      const pm = /\b1\s*(to|-|–)\s*5\b|afternoon|pm\b/.test(l);
      return { kind: pm ? "halfPM" : "halfAM", dayValue: 0.5 };
    }
    if (/full\s*day/.test(l)) return { kind: "full", dayValue: 1 };
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
  unknown: "Unrecognised line",
};

/* ------------------------------------------------------------------ *
 * The claim grid
 * ------------------------------------------------------------------ */

interface GridLayout {
  headerRow: number;
  labelCol: number;
  dayCols: { day: number; col: number; nextMonth: boolean }[];
  rateCol: number;
  totalCol: number;
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
    let seenDay1 = false;
    for (let c = labelCol + 1; c < width; c += 1) {
      const raw = cellAt(grid, row, c);
      const label = cellToString(raw);
      if (/^sar$/i.test(label)) rateCol = c;
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
      return { headerRow: row, labelCol, dayCols, rateCol, totalCol };
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

/** Read a labelled header field: the first filled cell right of the label. */
function labelledValue(grid: Grid, upto: number, pattern: RegExp): string {
  for (let row = 0; row < Math.min(grid.length, upto); row += 1) {
    const width = grid[row]?.length ?? 0;
    for (let c = 0; c < width; c += 1) {
      if (!pattern.test(text(grid, row, c))) continue;
      for (let k = c + 1; k < width; k += 1) {
        const v = cellAt(grid, row, k);
        if (v === null || v === "") continue;
        // A month typed as a date arrives as an Excel serial; "August" does not.
        const asDate =
          v instanceof Date || (typeof v === "number" && v > 20000 && v < 80000)
            ? cellToDate(v)
            : null;
        if (asDate) return asDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
        return cellToString(v).replace(/\s+/g, " ").trim();
      }
    }
  }
  return "";
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

  const instructorName = labelledValue(grid, layout.headerRow, /instructor\s*'?s?\s*name/i);
  const monthLabel = labelledValue(grid, layout.headerRow, /^month\b/i);
  if (!instructorName) parseWarnings.push("No instructor name is written on the time sheet.");
  if (!verification) parseWarnings.push("This workbook has no verification log tab.");

  return {
    fileName,
    instructorName,
    monthLabel,
    timeSheetName,
    verificationSheetName,
    headerRow: layout.headerRow + 1,
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
