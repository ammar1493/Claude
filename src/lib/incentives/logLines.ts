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
/** ...and a day spent getting somewhere, or waiting there. */
export const TRAVEL_COURSE = "Travelling / Standby";
/** The third value in the Duration dropdown: a day at a distance band. */
export const OUTBOUND_LABEL = "Outbound";

export interface LogDay {
  date: Date;
  record: RecordDay | null;
  covers: TimecardCover[];
  /** A Friday or Saturday claimed with no course behind it. */
  standby?: boolean;
  /**
   * A travelling or standby day whose tick survived the corrections.
   *
   * The record sheet has nothing for it \u2014 that is what a travelling day is \u2014
   * so without this the date would be paid and not appear in the log at all.
   */
  travel?: boolean;
  /** Where the trainer said that travelling day was. */
  travelLocation?: string;
  /**
   * Two or more classes in the day, so each is written as a half.
   *
   * A full-day course that shared its day with another course did not run a
   * full day, whatever the course list says it runs to; and two half days are
   * a morning and an afternoon rather than one full day. The claim grid is
   * ticked to match.
   */
  splitHalves?: boolean;
  /**
   * The trainer's own lines for this date.
   *
   * Used only when nothing else backs the day: a session the record sheet
   * never recorded, which the verifier has looked at and let stand. Their
   * wording is kept as they wrote it, because it is the only account of what
   * happened that anybody has.
   */
  claimed?: LogLine[];
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
      // One day of it, whatever the whole course runs to \u2014 and half of one
      // where the day held another class as well.
      duration:
        day.splitHalves || block.dayValue <= 0.5 ? HALF_DAY_LABEL : FULL_DAY_LABEL,
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

  if (day.travel) {
    lines.push({
      date: day.date,
      course: TRAVEL_COURSE,
      location: day.travelLocation ?? "",
      session: "",
      duration: OUTBOUND_LABEL,
    });
  }

  /*
   * Last, and only if the day would otherwise be blank: a session nobody
   * recorded, which the verifier has seen and let stand. A paid day missing
   * from the log reads as one somebody invented.
   */
  if (!lines.length && day.claimed?.length) {
    lines.push(...day.claimed.map((l) => ({ ...l, date: day.date })));
  }

  return lines;
}
