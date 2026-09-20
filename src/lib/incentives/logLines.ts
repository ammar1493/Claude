import type { RecordDay, TimecardCover } from "./types";

/**
 * The verification log, one line at a time.
 *
 * Shared by the corrected sheet and the drafted one, because a log the office
 * reads should not depend on which of the two wrote it.
 *
 * Two rules about the Duration column are worth stating, because both are
 * things the form now enforces and the old sheets did not:
 *
 * A multi-day course is written out day by day, each one a full day, never as
 * a single line saying "4 Days". The days of a four-day course are four days
 * of work on four dates, and the claim grid has a tick on each of them; a log
 * that collapses them into one line cannot be read against the grid at all.
 * The record sheet already carries them separately — the first day as a block
 * and the rest as continuations — so this is a matter of what goes in the
 * Duration cell rather than of finding the days.
 *
 * And the Duration cell only ever says Half Day or Full Day. NE-HR050 drops a
 * dropdown on the column offering Half Day, Full Day and Outbound, so
 * anything else a course list might call a duration — "4 Days", "6 Hrs" — is
 * not a value the cell accepts.
 */

export interface LogLine {
  date: Date;
  course: string;
  location: string;
  session: string;
  duration: string;
}

export const HALF_DAY_LABEL = "Half Day";
export const FULL_DAY_LABEL = "Full Day";

/** What the office calls a day it was called in for and did not teach. */
export const STANDBY_COURSE = "Standby";

export interface LogDay {
  date: Date;
  record: RecordDay | null;
  covers: TimecardCover[];
  /** A Friday or Saturday claimed with no course behind it. */
  standby?: boolean;
}

export function logLinesForDay(day: LogDay): LogLine[] {
  const lines: LogLine[] = [];

  /*
   * Standby earns its own line, named.
   *
   * Left off, the date simply does not appear in the log, and a verifier
   * reading the log against the grid finds a tick with nothing beside it —
   * which is exactly the shape of a day somebody invented. Naming it Standby
   * says the day was given up rather than taught.
   */
  if (day.standby) {
    lines.push({
      date: day.date,
      course: STANDBY_COURSE,
      location: "NEFT",
      session: "",
      duration: HALF_DAY_LABEL,
    });
    return lines;
  }

  for (const block of [...(day.record?.blocks ?? []), ...(day.record?.continuations ?? [])]) {
    lines.push({
      date: day.date,
      course: block.courseNames.join(" + "),
      location: block.locations.join(", "),
      session: block.sessionNos.join(", "),
      // One day of it, whatever the whole course runs to.
      duration: block.dayValue <= 0.5 ? HALF_DAY_LABEL : FULL_DAY_LABEL,
    });
  }

  for (const cover of day.covers) {
    lines.push({
      date: day.date,
      course: cover.timecard.activity,
      location: cover.timecard.unit,
      session: cover.timecard.attachmentName ?? "timecard",
      duration: FULL_DAY_LABEL,
    });
  }

  return lines;
}
