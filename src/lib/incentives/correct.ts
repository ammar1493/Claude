import { describeTimecard } from "./timecards";
import { KIND_LABELS } from "./timesheet";
import type { CellEdit, Finding, SheetReport } from "./types";
import {
  forceRecalc,
  entryText,
  openWorkbook,
  saveWorkbook,
  setCachedValue,
  setCell,
  setEntryText,
  splitRef,
  updateDimension,
} from "./xlsxEdit";

/**
 * Writing the corrected sheet.
 *
 * The output is the trainer's own workbook with the accepted corrections made
 * — not a reconstruction of it. Everything the file carried comes through
 * untouched, because only the cells that change are rewritten; see
 * xlsxEdit.ts for why that matters.
 *
 * Row totals and the grand total are recomputed from the ticks that survive,
 * both as cached values (so every reader shows the right figure) and by asking
 * Excel to recalculate on open (so its own formulas confirm it).
 */

export interface CorrectionPlan {
  edits: CellEdit[];
  /** Findings accepted but with nothing to apply — noted, not silent. */
  acknowledged: Finding[];
  /** Cells two accepted corrections disagree about. */
  conflicts: { cell: string; values: (string | number | null)[] }[];
}

const same = (a: CellEdit["value"], b: CellEdit["value"]) => a === b;

/** Merge the accepted findings' edits, flagging anything that disagrees. */
export function buildPlan(report: SheetReport, accepted: Set<string>): CorrectionPlan {
  const byCell = new Map<string, CellEdit>();
  const conflicts: CorrectionPlan["conflicts"] = [];
  const acknowledged: Finding[] = [];

  for (const finding of report.findings) {
    if (!accepted.has(finding.id)) continue;
    if (!finding.fix || !finding.fix.length) {
      acknowledged.push(finding);
      continue;
    }
    for (const edit of finding.fix) {
      const key = `${edit.sheet}!${edit.cell}`;
      const existing = byCell.get(key);
      if (!existing) {
        byCell.set(key, edit);
        continue;
      }
      if (same(existing.value, edit.value)) continue;
      // Clearing a cell and ticking it are not the same instruction; ticking
      // wins, because the clear is always one half of a move.
      if (existing.value === null) byCell.set(key, edit);
      else if (edit.value === null) continue;
      else conflicts.push({ cell: edit.cell, values: [existing.value, edit.value] });
    }
  }

  return { edits: [...byCell.values()], acknowledged, conflicts };
}

/** The claim grid as it will read once the plan is applied. */
export function previewRows(
  report: SheetReport,
  plan: CorrectionPlan,
): { rowIndex: number; label: string; rate: number; days: number[]; total: number }[] {
  const columnDay = new Map<string, number>();
  for (const d of report.sheet.dayColumns) {
    if (!d.nextMonth) columnDay.set(d.column, d.day);
  }

  return report.sheet.rows.map((row) => {
    const days = new Set(row.days.filter((d) => d <= 31));
    for (const edit of plan.edits) {
      if (edit.sheet !== "timesheet") continue;
      const pos = splitRef(edit.cell);
      if (!pos || pos.row !== row.rowIndex) continue;
      const day = columnDay.get(pos.col);
      if (day === undefined) continue;
      if (edit.value === null) days.delete(day);
      else days.add(day);
    }
    const list = [...days].sort((a, b) => a - b);
    return {
      rowIndex: row.rowIndex,
      label: row.label,
      rate: row.rate,
      days: list,
      total: list.length * row.rate,
    };
  });
}

export interface CorrectOptions {
  /**
   * Replace the verification log with what the record sheet and the timecards
   * actually hold, rather than only correcting the lines with findings.
   */
  rebuildLog: boolean;
}

export interface CorrectionResult {
  data: Uint8Array;
  fileName: string;
  applied: string[];
  skipped: string[];
  newTotal: number;
}

/**
 * Dates on a rebuilt log are written as text, not as a serial.
 *
 * A serial only reads as a date when the cell carries a date format, and the
 * blank rows these logs run into carry a general one — so the date would show
 * as 46259. ISO text is unambiguous in a month where 10/08 and 08/10 are both
 * written for the same day, and reads back cleanly.
 */
/**
 * A file name the browser will actually use.
 *
 * Chromium discards a download-attribute name containing anything outside
 * plain ASCII and saves the file as "download" instead — an em dash between
 * the trainer and the month is enough to lose it. Everything else is kept.
 */
function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 5 ? cleaned : "Incentive sheet corrected.xlsx";
}

function fmtLogDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export async function buildCorrectedWorkbook(
  original: ArrayBuffer,
  report: SheetReport,
  plan: CorrectionPlan,
  options: CorrectOptions,
): Promise<CorrectionResult> {
  const book = await openWorkbook(original);
  const { sheet } = report;

  const timePath = book.sheetPaths.get(sheet.timeSheetName);
  if (!timePath) throw new Error(`The tab "${sheet.timeSheetName}" is not in this workbook.`);
  const logPath = sheet.verificationSheetName
    ? (book.sheetPaths.get(sheet.verificationSheetName) ?? null)
    : null;

  const xml = { timesheet: entryText(book, timePath), verification: logPath ? entryText(book, logPath) : null };
  if (!xml.timesheet) throw new Error("The time-sheet tab could not be read.");

  const applied: string[] = [];
  const skipped: string[] = [];

  const write = (which: "timesheet" | "verification", cell: string, value: CellEdit["value"], note: string) => {
    const current = xml[which];
    if (!current) {
      skipped.push(`${note} — that tab is not in this workbook.`);
      return;
    }
    const outcome = setCell(current, cell, value);
    xml[which] = outcome.xml;
    if (outcome.applied) applied.push(note);
    else skipped.push(outcome.skipped ?? note);
  };

  for (const edit of plan.edits) write(edit.sheet, edit.cell, edit.value, edit.describe);

  /* Totals, from the ticks that survived. */
  const rows = previewRows(report, plan);
  let grand = 0;
  for (const row of rows) {
    grand += row.total;
    const target = sheet.rows.find((r) => r.rowIndex === row.rowIndex);
    if (target?.totalCell && xml.timesheet) {
      xml.timesheet = setCachedValue(xml.timesheet, target.totalCell, row.total);
    }
  }
  if (sheet.grandTotalCell && xml.timesheet) {
    xml.timesheet = setCachedValue(xml.timesheet, sheet.grandTotalCell, grand);
  }

  /* The verification log, rebuilt from the evidence if asked. */
  if (options.rebuildLog && xml.verification && sheet.verificationLayout) {
    const layout = sheet.verificationLayout;
    const lines: { date: Date; course: string; location: string; session: string; duration: string }[] = [];
    for (const day of report.days) {
      // Continuations belong on the log as much as first days do: a four-day
      // WellSharp is taught on all four, and a log that only names the day the
      // certificates were issued reads as three days of nothing.
      for (const block of [...(day.record?.blocks ?? []), ...(day.record?.continuations ?? [])]) {
        lines.push({
          date: day.date,
          course: block.courseNames.join(" + "),
          location: block.locations.join(", "),
          session: block.sessionNos.join(", "),
          duration: block.duration?.label ?? "",
        });
      }
      for (const cover of day.covers) {
        lines.push({
          date: day.date,
          course: cover.timecard.activity,
          location: cover.timecard.unit,
          session: cover.timecard.attachmentName ?? "timecard",
          duration: "1 Full Day",
        });
      }
    }
    lines.sort((a, b) => a.date.getTime() - b.date.getTime());

    let row = layout.headerRow + 1;
    for (const line of lines) {
      write("verification", `${layout.dateColumn}${row}`, fmtLogDate(line.date), `Log row ${row}: ${line.course}`);
      write("verification", `${layout.courseColumn}${row}`, line.course, `Log row ${row} course`);
      write("verification", `${layout.locationColumn}${row}`, line.location, `Log row ${row} location`);
      write("verification", `${layout.sessionColumn}${row}`, line.session, `Log row ${row} session`);
      write("verification", `${layout.durationColumn}${row}`, line.duration, `Log row ${row} duration`);
      row += 1;
    }
    // Anything left below the rebuilt list belonged to the old log.
    for (let stale = row; stale <= layout.lastRow; stale += 1) {
      for (const col of [
        layout.dateColumn,
        layout.courseColumn,
        layout.locationColumn,
        layout.sessionColumn,
        layout.durationColumn,
      ]) {
        const outcome = setCell(xml.verification, `${col}${stale}`, null);
        xml.verification = outcome.xml;
      }
    }
    applied.push(`Rebuilt the verification log — ${lines.length} line${lines.length === 1 ? "" : "s"}.`);
  }

  setEntryText(book, timePath, updateDimension(xml.timesheet));
  if (logPath && xml.verification) setEntryText(book, logPath, updateDimension(xml.verification));

  const workbookXml = entryText(book, "xl/workbook.xml");
  if (workbookXml) setEntryText(book, "xl/workbook.xml", forceRecalc(workbookXml));

  const who = report.matchedInstructor ?? sheet.instructorName ?? "instructor";
  const month = sheet.monthLabel || "";
  return {
    data: await saveWorkbook(book),
    fileName: safeFileName(`${who}${month ? ` ${month}` : ""} corrected.xlsx`),
    applied,
    skipped,
    newTotal: grand,
  };
}

/** A one-line summary of a finding's correction, for the plan list. */
export function describeFix(finding: Finding): string {
  if (!finding.fix || !finding.fix.length) return "Nothing to apply — needs a person.";
  return finding.fix.map((e) => e.describe).join("; ");
}

export { describeTimecard, KIND_LABELS };
