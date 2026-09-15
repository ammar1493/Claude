import { CourseCatalog } from "./courses";
import { nameSimilarity } from "./names";
import { addDays, buildRecordDays, dayKey, type ParsedRecordSheet } from "./record";
import { resolveBand, SiteTable, type NamedSite } from "./sites";
import { cardsFor, coverageFor, describeTimecard, siteForTimecard } from "./timecards";
import { claimCell, KIND_LABELS, SECTION_LABELS, targetKind } from "./timesheet";
import type {
  ClaimSection,
  IncentiveSheet,
  RecordDay,
  Timecard,
  TimecardCover,
} from "./types";
import {
  entryText,
  forceRecalc,
  openWorkbook,
  saveWorkbook,
  setCachedValue,
  setCell,
  setEntryText,
  updateDimension,
  writeZip,
} from "./xlsxEdit";

/**
 * Sheets for the trainers who never sent one.
 *
 * At the end of a month some sheets are in and some are not, and the ones that
 * are not are invisible — nobody is reminded of a claim that was never made.
 * The record sheet already knows who taught, on what day, at what length: that
 * is a filled time sheet in everything but form. So the missing ones are
 * drafted from it, on the same template the others arrived on, ready to be
 * checked and signed rather than chased from nothing.
 *
 * A drafted sheet is a draft. It is what the record sheet says the trainer is
 * owed, not what the trainer has claimed, and the two are not the same thing —
 * a day spent travelling, a per diem, an evening class the certificates do not
 * show. Its file name says so and the app never calls it anything else.
 */

export interface MissingInstructor {
  /** The name as the record sheet spells it. */
  name: string;
  /** Instructor-days the record sheet holds for them this month. */
  days: number;
  /** Day-equivalents, so a month of half days does not read as a full one. */
  dayValue: number;
  sessions: number;
  participants: number;
  /** Timecard days that are theirs, whether or not a course was certified. */
  timecardDays: number;
  /** What the draft would come to at the template's rates, null if unpriceable. */
  estimate: number | null;
  /** Sites on their month with no distance set — the estimate is short by those. */
  unpriced: string[];
}

/** Names that are not people, so a missing sheet for them is not missing. */
const NOT_A_TRAINER =
  /^(freelancer|atlas copco|maharat|external|tbd|n\/?a|unknown|vendor|supplier)$/i;

export function looksLikeATrainer(name: string): boolean {
  return Boolean(name.trim()) && !NOT_A_TRAINER.test(name.trim());
}

/**
 * Who taught this month and did not send a sheet.
 *
 * Matched the same way an uploaded sheet is matched — on the name, not on an
 * exact string — so a trainer who signs "ASIF FARID" is not chased for a sheet
 * they already sent as "Asif Farid Israr Ulhaq".
 */
export function findMissingInstructors(
  record: ParsedRecordSheet,
  catalog: CourseCatalog,
  submittedNames: string[],
  timecards: Timecard[],
  sites: SiteTable,
  template: IncentiveSheet | null,
  excluded: string[] = [],
): MissingInstructor[] {
  const excludedSet = new Set(excluded.map((n) => n.trim().toLowerCase()));
  const out: MissingInstructor[] = [];

  const candidates = new Set(record.instructors.filter(looksLikeATrainer));
  // A timecard can be the only trace of a trainer whose month issued no
  // certificates at all; they need a sheet more than anyone.
  for (const card of timecards) {
    if (card.assessor.trim() && looksLikeATrainer(card.assessor)) candidates.add(card.assessor.trim());
  }

  for (const name of candidates) {
    if (excludedSet.has(name.trim().toLowerCase())) continue;
    if (submittedNames.some((s) => nameSimilarity(s, name) >= 0.6)) continue;

    const days = buildRecordDays(record.rows, name, catalog);
    const cards = cardsFor(timecards, [name]);
    const coverage = coverageFor(cards, [name]);
    const dates = monthDates(record, days, coverage);
    if (!dates.length) continue;

    let dayValue = 0;
    let sessions = 0;
    let participants = 0;
    let estimate: number | null = 0;
    const unpriced = new Set<string>();

    for (const date of dates) {
      const key = dayKey(date);
      const rec = days.get(key) ?? null;
      const covers = coverage.get(key) ?? [];
      const load = Math.max(rec?.load ?? 0, covers.length ? 1 : 0);
      dayValue += load;
      sessions += rec?.blocks.length ?? 0;
      for (const block of rec?.blocks ?? []) participants += block.participants;

      const resolved = bandOfDay(rec, covers, sites);
      for (const u of resolved.unpriced) unpriced.add(u);
      if (!template || estimate === null) continue;
      const rate = rateFor(template, resolved.band ?? "near", date.getDay(), load);
      if (rate === null) estimate = null;
      else estimate += rate;
    }

    out.push({
      name,
      days: dates.length,
      dayValue,
      sessions,
      participants,
      timecardDays: coverage.size,
      estimate,
      unpriced: [...unpriced],
    });
  }

  return out.sort((a, b) => b.dayValue - a.dayValue || a.name.localeCompare(b.name));
}

function monthDates(
  record: ParsedRecordSheet,
  days: Map<string, RecordDay>,
  coverage: Map<string, TimecardCover[]>,
): Date[] {
  const last = new Date(record.year, record.month + 1, 0).getDate();
  const start = new Date(record.year, record.month, 1);
  const end = new Date(record.year, record.month, last);
  const keys = new Set<string>();
  for (const [key, rec] of days) if (rec.load > 0) keys.add(key);
  for (const key of coverage.keys()) keys.add(key);
  return [...keys]
    .map((k) => new Date(`${k}T00:00:00`))
    .filter((d) => d >= start && d <= end)
    .sort((a, b) => a.getTime() - b.getTime());
}

function bandOfDay(rec: RecordDay | null, covers: TimecardCover[], sites: SiteTable) {
  const named: NamedSite[] = [];
  for (const name of rec?.locations ?? []) named.push({ name, site: sites.get(name) });
  for (const cover of covers) {
    const site = siteForTimecard(cover.timecard);
    named.push({ name: site.name, site });
  }
  return resolveBand(named);
}

function rateFor(
  sheet: IncentiveSheet,
  section: ClaimSection,
  weekday: number,
  days: number,
): number | null {
  const kind = targetKind(sheet, section, weekday, days);
  if (!kind) return 0;
  const row = sheet.rows.find((r) => r.section === section && r.kind === kind && r.rate > 0);
  return row ? row.rate : null;
}

export interface GeneratedSheet {
  data: Uint8Array;
  fileName: string;
  instructor: string;
  /** Ticks placed on the draft — one per working day. */
  days: number;
  /** Those days in day-equivalents, so a month of half days reads as half. */
  dayValue: number;
  total: number;
  /** Anything the draft could not settle, for the covering note. */
  notes: string[];
}

/** File names a browser will actually use: plain ASCII, no path characters. */
function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 5 ? cleaned : "Incentive sheet draft.xlsx";
}

function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Draft one trainer's sheet on the template another trainer submitted.
 *
 * The template is wiped first — every tick, the initials column, the signature
 * cells — so nothing of whoever's sheet it came from survives into someone
 * else's claim.
 */
export async function buildGeneratedWorkbook(
  templateData: ArrayBuffer,
  template: IncentiveSheet,
  instructor: string,
  record: ParsedRecordSheet,
  catalog: CourseCatalog,
  sites: SiteTable,
  timecards: Timecard[],
): Promise<GeneratedSheet> {
  const book = await openWorkbook(templateData);
  const timePath = book.sheetPaths.get(template.timeSheetName);
  if (!timePath) throw new Error(`The tab "${template.timeSheetName}" is not in the template.`);
  const logPath = template.verificationSheetName
    ? (book.sheetPaths.get(template.verificationSheetName) ?? null)
    : null;

  let grid = entryText(book, timePath);
  let log = logPath ? entryText(book, logPath) : null;
  if (!grid) throw new Error("The template's time-sheet tab could not be read.");

  const notes: string[] = [];
  const put = (which: "grid" | "log", cell: string, value: string | number | null) => {
    if (which === "grid") {
      const outcome = setCell(grid!, cell, value);
      grid = outcome.xml;
    } else if (log) {
      const outcome = setCell(log, cell, value);
      log = outcome.xml;
    }
  };

  /* Wipe the template clean. */
  for (const row of template.rows) {
    for (const col of template.dayColumns) put("grid", `${col.column}${row.rowIndex}`, null);
    if (template.initialsColumn) put("grid", `${template.initialsColumn}${row.rowIndex}`, null);
  }
  for (const cell of template.signatureCells) put("grid", cell, null);

  if (template.instructorCell) put("grid", template.instructorCell, instructor);
  if (template.monthCell) put("grid", template.monthCell, record.monthLabel);

  /* Fill in the month from the evidence. */
  const days = buildRecordDays(record.rows, instructor, catalog);
  const cards = cardsFor(timecards, [instructor]);
  const coverage = coverageFor(cards, [instructor]);
  const dates = monthDates(record, days, coverage);

  const perRow = new Map<number, number>();
  let ticked = 0;
  let tickedValue = 0;
  const logLines: { date: Date; course: string; location: string; session: string; duration: string }[] = [];

  for (const date of dates) {
    const key = dayKey(date);
    const rec = days.get(key) ?? null;
    const covers = coverage.get(key) ?? [];
    const load = Math.max(rec?.load ?? 0, covers.length ? 1 : 0);
    if (load <= 0) continue;

    const resolved = bandOfDay(rec, covers, sites);
    if (!resolved.band) {
      notes.push(
        `${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}: no distance set for ${resolved.unpriced.join(", ")}, so the day is drafted at the in-house rate.`,
      );
    }
    const band = resolved.band ?? "near";
    const kind = targetKind(template, band, date.getDay(), load);
    const cell = kind ? claimCell(template, band, kind, date.getDate()) : null;
    if (!cell || !kind) {
      notes.push(
        `${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}: the template has no ${SECTION_LABELS[band]} line for this day, so it was left blank.`,
      );
      continue;
    }
    put("grid", cell, 1);
    ticked += 1;
    tickedValue += load;
    const row = template.rows.find((r) => r.section === band && r.kind === kind);
    if (row) perRow.set(row.rowIndex, (perRow.get(row.rowIndex) ?? 0) + 1);

    for (const block of [...(rec?.blocks ?? []), ...(rec?.continuations ?? [])]) {
      logLines.push({
        date,
        course: block.courseNames.join(" + "),
        location: block.locations.join(", "),
        session: block.sessionNos.join(", "),
        duration: block.duration?.label ?? "",
      });
    }
    for (const cover of covers) {
      logLines.push({
        date,
        course: cover.timecard.activity,
        location: cover.timecard.unit,
        session: cover.timecard.attachmentName ?? "timecard",
        duration: "1 Full Day",
      });
    }
  }

  /* Totals, from the ticks just written. */
  let total = 0;
  for (const row of template.rows) {
    const count = perRow.get(row.rowIndex) ?? 0;
    const value = count * row.rate;
    total += value;
    if (row.totalCell) grid = setCachedValue(grid, row.totalCell, value);
  }
  if (template.grandTotalCell) grid = setCachedValue(grid, template.grandTotalCell, total);

  /* The verification log, written from the same evidence. */
  if (log && template.verificationLayout) {
    const layout = template.verificationLayout;
    let row = layout.headerRow + 1;
    for (const line of logLines) {
      put("log", `${layout.dateColumn}${row}`, isoDate(line.date));
      put("log", `${layout.courseColumn}${row}`, line.course);
      put("log", `${layout.locationColumn}${row}`, line.location);
      put("log", `${layout.sessionColumn}${row}`, line.session);
      put("log", `${layout.durationColumn}${row}`, line.duration);
      row += 1;
    }
    for (let stale = row; stale <= Math.max(layout.lastRow, row + 40); stale += 1) {
      for (const col of [
        layout.dateColumn,
        layout.courseColumn,
        layout.locationColumn,
        layout.sessionColumn,
        layout.durationColumn,
      ]) {
        put("log", `${col}${stale}`, null);
      }
    }
  } else {
    notes.push("The template has no verification log tab, so the draft carries none.");
  }

  setEntryText(book, timePath, updateDimension(grid));
  if (logPath && log) setEntryText(book, logPath, updateDimension(log));
  const workbookXml = entryText(book, "xl/workbook.xml");
  if (workbookXml) setEntryText(book, "xl/workbook.xml", forceRecalc(workbookXml));

  if (cards.length) {
    notes.push(
      `${cards.length} timecard${cards.length === 1 ? "" : "s"} included: ${cards.map(describeTimecard).join("; ")}.`,
    );
  }

  return {
    data: await saveWorkbook(book),
    fileName: safeFileName(`${instructor} ${record.monthLabel} drafted.xlsx`),
    instructor,
    days: ticked,
    dayValue: tickedValue,
    total,
    notes,
  };
}

/** Every draft in one archive, for a month's worth of chasing at once. */
export async function zipGeneratedSheets(sheets: GeneratedSheet[]): Promise<Uint8Array> {
  return writeZip(sheets.map((s) => ({ name: s.fileName, data: s.data })));
}

export { addDays, KIND_LABELS };
