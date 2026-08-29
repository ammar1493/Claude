import { nDistinct } from "./agg";
import {
  addDays,
  ceilingMonth,
  ceilingYear,
  diffDays,
  floorMonth,
  floorYear,
  fmtDayMonth,
  fmtDayMonthYear,
  fmtMonthYearFull,
  type Granularity,
} from "./dates";
import type { TrainingRow } from "./types";

export type TimeContext = "custom" | "monthly" | "yearly";

export interface Filters {
  startDate: Date;
  endDate: Date;
  granularity: Granularity;
  timeContext: TimeContext;
  clients: string[];
  courses: string[];
  year: string;
}

const inRange = (d: Date, start: Date, end: Date) => d >= start && d <= end;

function applyClient(rows: TrainingRow[], clients: string[]): TrainingRow[] {
  if (!clients.length) return rows;
  const set = new Set(clients);
  return rows.filter((r) => set.has(r.client));
}

function applyCourse(rows: TrainingRow[], courses: string[]): TrainingRow[] {
  if (!courses.length) return rows;
  const set = new Set(courses);
  return rows.filter((r) => set.has(r.courseName));
}

/** valid_filtered_df(): date range + course + client. */
export function validFilteredDf(rows: TrainingRow[], f: Filters): TrainingRow[] {
  return applyClient(
    applyCourse(
      rows.filter((r) => inRange(r.date, f.startDate, f.endDate)),
      f.courses,
    ),
    f.clients,
  );
}

/**
 * chart_df(): monthly/yearly chart views switch to the "Year for Analysis"
 * filter; daily/weekly stay on the date range.
 */
export function chartDf(rows: TrainingRow[], f: Filters): TrainingRow[] {
  const year = Number(f.year);
  const base =
    f.granularity === "monthly" || f.granularity === "yearly"
      ? rows.filter((r) => r.date.getFullYear() === year)
      : rows.filter((r) => inRange(r.date, f.startDate, f.endDate));
  return applyClient(applyCourse(base, f.courses), f.clients);
}

/** strategic_df(): year filter + client filter (no course filter, as in app.R). */
export function strategicDf(rows: TrainingRow[], f: Filters): TrainingRow[] {
  const year = Number(f.year);
  return applyClient(
    rows.filter((r) => r.date.getFullYear() === year),
    f.clients,
  );
}

export interface PeriodStats {
  mode: TimeContext;
  cur: TrainingRow[];
  prev: TrainingRow[];
  labelMain: string;
  labelSub: string;
  curStart: Date;
  curEnd: Date;
  prevStart: Date;
  prevEnd: Date;
}

/**
 * period_stats(): the current window and the comparable prior window.
 * Only the client filter is applied here — app.R deliberately leaves the course
 * filter out of the executive KPI comparison.
 */
export function periodStats(rows: TrainingRow[], f: Filters): PeriodStats {
  const sDate = f.startDate;
  const eDate = f.endDate;

  let curStart = sDate;
  let curEnd = eDate;
  let prevStart = addDays(sDate, -diffDays(eDate, sDate) - 1);
  let prevEnd = addDays(sDate, -1);
  let labelMain = `${fmtDayMonth(sDate)} - ${fmtDayMonthYear(eDate)}`;
  let labelSub = `vs ${fmtDayMonth(prevStart)} - ${fmtDayMonth(prevEnd)}`;

  if (f.timeContext === "monthly") {
    curStart = floorMonth(eDate);
    curEnd = addDays(ceilingMonth(eDate), -1);
    prevStart = floorMonth(addDays(curStart, -1));
    prevEnd = addDays(ceilingMonth(addDays(curStart, -1)), -1);
    labelMain = fmtMonthYearFull(curStart);
    labelSub = `vs ${fmtMonthYearFull(prevStart)}`;
  }

  if (f.timeContext === "yearly") {
    curStart = floorYear(eDate);
    curEnd = addDays(ceilingYear(eDate), -1);
    prevStart = floorYear(addDays(curStart, -1));
    prevEnd = addDays(ceilingYear(addDays(curStart, -1)), -1);
    labelMain = String(curStart.getFullYear());
    labelSub = `vs ${prevStart.getFullYear()}`;
  }

  const cur = applyClient(rows.filter((r) => inRange(r.date, curStart, curEnd)), f.clients);
  const prev = applyClient(rows.filter((r) => inRange(r.date, prevStart, prevEnd)), f.clients);

  return { mode: f.timeContext, cur, prev, labelMain, labelSub, curStart, curEnd, prevStart, prevEnd };
}

/** hse_df() base: same windowing as chart_df(), before the HSE course test. */
export const hseBase = chartDf;

export function sessionsCount(rows: TrainingRow[]): number {
  return nDistinct(rows.map((r) => r.actualSession));
}
