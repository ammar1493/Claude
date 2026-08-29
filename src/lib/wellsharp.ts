import { WELLSHARP_HOURS } from "./config";
import type { TrainingRow, WellSharpRow } from "./types";

/** normalize_wellsharp_course() from app.R. */
export function normalizeWellsharpCourse(x: string): string {
  return String(x ?? "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*\+\s*STUCK PIPE AVOIDANCE COURSE\s*$/, "")
    .replace(/SUPERVIOSRY/g, "SUPERVISORY")
    .replace(/SUPERVIOSR/g, "SUPERVISORY");
}

const HOURS_LOOKUP = new Map(
  WELLSHARP_HOURS.map((h) => [normalizeWellsharpCourse(h.courseName), h]),
);

export const WELLSHARP_KEYS = new Set(HOURS_LOOKUP.keys());

export function isWellSharpCourse(courseName: string): boolean {
  return WELLSHARP_KEYS.has(normalizeWellsharpCourse(courseName));
}

/** wellsharp_data(): keep WellSharp rows and left-join the hours lookup. */
export function toWellSharpRows(rows: TrainingRow[]): WellSharpRow[] {
  const out: WellSharpRow[] = [];
  for (const r of rows) {
    const key = normalizeWellsharpCourse(r.courseName);
    const hours = HOURS_LOOKUP.get(key);
    if (!hours) continue;
    out.push({
      ...r,
      courseKey: key,
      days: hours.days,
      hoursPerDay: hours.hoursPerDay,
      totalHours: hours.totalHours,
    });
  }
  return out;
}

export const RETAKE_RE = /\(Retake Exam\)/i;

export function isRetake(courseName: string): boolean {
  return RETAKE_RE.test(courseName);
}

/** gsub("IADC - WELLSHARP ", "", x) — the chart label shortener. */
export function shortCourse(courseName: string): string {
  return courseName.replace(/IADC - WELLSHARP /i, "");
}

/**
 * ws_session_hours(): collapse to one row per (date, session, course), keeping
 * that course's TotalHours once so hours are never double-counted per seat.
 */
export interface SessionHours {
  date: Date;
  session: string;
  courseName: string;
  totalHours: number;
  participants: number;
}

export function sessionHours(rows: WellSharpRow[]): SessionHours[] {
  const map = new Map<string, SessionHours>();
  for (const r of rows) {
    const k = `${r.date.getTime()}|${r.actualSession}|${r.courseName}`;
    const hit = map.get(k);
    if (hit) hit.participants += 1;
    else
      map.set(k, {
        date: r.date,
        session: r.actualSession,
        courseName: r.courseName,
        totalHours: r.totalHours,
        participants: 1,
      });
  }
  return [...map.values()];
}

/**
 * Teaching hours per instructor: each distinct (instructor, course, session)
 * triple contributes that course's TotalHours exactly once.
 */
export function instructorTeachingHours(
  rows: WellSharpRow[],
): { instructor: string; teachingHours: number; sessionsCount: number }[] {
  const triples = new Map<string, { instructor: string; hours: number }>();
  for (const r of rows) {
    const k = `${r.instructorName}|${r.courseName}|${r.actualSession}`;
    if (!triples.has(k)) triples.set(k, { instructor: r.instructorName, hours: r.totalHours });
  }
  const byInstructor = new Map<string, { instructor: string; teachingHours: number; sessionsCount: number }>();
  for (const t of triples.values()) {
    const hit = byInstructor.get(t.instructor);
    if (hit) {
      hit.teachingHours += t.hours;
      hit.sessionsCount += 1;
    } else {
      byInstructor.set(t.instructor, {
        instructor: t.instructor,
        teachingHours: t.hours,
        sessionsCount: 1,
      });
    }
  }
  return [...byInstructor.values()];
}

/** Per (instructor, course) hours and session counts, for the stacked breakdown. */
export function instructorCourseBreakdown(
  rows: WellSharpRow[],
): { instructor: string; courseName: string; hours: number; sessions: number }[] {
  const triples = new Map<string, { instructor: string; courseName: string; hours: number }>();
  for (const r of rows) {
    const k = `${r.instructorName}|${r.courseName}|${r.actualSession}`;
    if (!triples.has(k))
      triples.set(k, { instructor: r.instructorName, courseName: r.courseName, hours: r.totalHours });
  }
  const agg = new Map<string, { instructor: string; courseName: string; hours: number; sessions: number }>();
  for (const t of triples.values()) {
    const k = `${t.instructor}|${t.courseName}`;
    const hit = agg.get(k);
    if (hit) {
      hit.hours += t.hours;
      hit.sessions += 1;
    } else {
      agg.set(k, { instructor: t.instructor, courseName: t.courseName, hours: t.hours, sessions: 1 });
    }
  }
  return [...agg.values()];
}
