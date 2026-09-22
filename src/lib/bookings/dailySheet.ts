import { fromISODate } from "@/lib/dates";
import { fmtClock } from "./parse";
import { classesOnDay, type ClassSession } from "./schedule";
import { LANGUAGE_LABEL, type Instructor } from "./types";

/**
 * The day's schedule, in the shape the office already emails.
 *
 * Nine columns and a blank line between blocks — the sheet the training floor
 * reads and the one that goes out each morning. Everything in it is derived
 * from the register except the classroom, which is typed in, and the
 * instructor, which is assigned.
 */

export interface DailyRow {
  title: string;
  time: string;
  instructor: string;
  venue: string;
  date: string;
  participants: number;
  session: string;
  classroom: string;
  company: string;
}

/** A null is the blank line between two blocks. */
export type DailyLine = DailyRow | null;

export const DAILY_COLUMNS = [
  "COURSE TITLE",
  "CLASS TIME",
  "INSTRUCTOR NAME",
  "VENUE",
  "DATE",
  "Number of Participant",
  "SESSION",
  "CLASSROOM",
  "COMPANY",
] as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 22-Sep-26, the way the office writes a date on this sheet. */
export function sheetDate(iso: string): string {
  const d = fromISODate(iso);
  return `${String(d.getDate()).padStart(2, "0")}-${MONTHS[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;
}

/**
 * How the class is delivered, which is what the office's SESSION column says.
 * Anything that is not NEFT's own classroom is outbound, whoever's site it is.
 */
function sessionOf(cls: ClassSession): string {
  if (cls.bookings.some((b) => b.mode === "online")) return "ONLINE";
  return cls.venue === "NEFT" ? "CLASSROOM" : "OUTBOUND";
}

/**
 * The title as the sheet writes it: the course, the language it runs in, and
 * which day of it this is. "H2S" on its own does not tell a coordinator
 * whether the Arabic or the English class is the one in room 5, and on a
 * five-day course it does not say whether today is the first day or the last.
 */
function titleOf(cls: ClassSession, dayISO: string): string {
  const parts = [cls.courseName.trim()];
  if (cls.language !== "other") parts.push(LANGUAGE_LABEL[cls.language].toUpperCase());
  if (cls.days.length > 1) {
    const index = cls.days.indexOf(dayISO);
    if (index >= 0) parts.push(`(DAY ${index + 1})`);
  }
  return parts.join(" ");
}

/**
 * One line per class, blocked by session and start time.
 *
 * Chronological, because that is the order the day happens in, with a blank
 * line wherever the hour or the kind of delivery changes — which is what puts
 * the morning classroom courses, the outbound work and the afternoon intake
 * into the separate blocks the office's own sheet has.
 */
export function dailySheetLines(
  classes: ClassSession[],
  instructors: Instructor[],
  dayISO: string,
): DailyLine[] {
  const names = new Map(instructors.map((i) => [i.id, i.name]));
  const running = classesOnDay(classes, dayISO)
    .filter((c) => c.active)
    .sort(
      (a, b) =>
        a.startMin - b.startMin ||
        sessionOf(a).localeCompare(sessionOf(b)) ||
        a.venue.localeCompare(b.venue) ||
        a.courseName.localeCompare(b.courseName),
    );

  const out: DailyLine[] = [];
  let block = "";
  for (const cls of running) {
    const session = sessionOf(cls);
    const key = `${cls.startMin}|${session}`;
    if (block && key !== block) out.push(null);
    block = key;
    out.push({
      title: titleOf(cls, dayISO),
      time: fmtClock(cls.startMin),
      instructor: cls.instructorId ? (names.get(cls.instructorId) ?? "") : "",
      venue: cls.venue,
      date: sheetDate(dayISO),
      participants: cls.seats,
      session,
      // Off site there is no room of ours to name, so the sheet carries where
      // it is instead — which is what the office's own does.
      classroom: cls.room || (cls.venue === "NEFT" ? "" : cls.venue),
      company: [...new Set(cls.bookings.map((b) => b.company))].join("/"),
    });
  }
  return out;
}

export const dailyRowValues = (row: DailyRow): (string | number)[] => [
  row.title,
  row.time,
  row.instructor,
  row.venue,
  row.date,
  row.participants,
  row.session,
  row.classroom,
  row.company,
];
