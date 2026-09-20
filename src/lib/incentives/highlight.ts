import { FRIDAY, SATURDAY } from "./timesheet";
import type { IncentiveSheet, VerificationLayout } from "./types";
import { DAY_FILL, fillCell, type StyleTable } from "./xlsxEdit";

/**
 * Colouring the days.
 *
 * The form asks for it in as many words — "Highlight in above listed colors
 * for days" — and prints the two swatches beside the words Friday and
 * Saturday, so the colours here are the ones lifted out of the template's own
 * legend rather than a pair that merely look right: FFFF00 and A9D18E.
 *
 * Trainers were doing this by hand, which is why so few of the submitted
 * sheets had it done consistently. A weekend day is paid at a different rate
 * from a weekday, so the colour is not decoration: it is the thing that makes
 * a misplaced tick visible at a glance, before anybody adds a column up.
 *
 * Only Friday and Saturday are coloured in the verification log. The blue is
 * for the claim grid, where it separates the days that were taught from the
 * thirty-one boxes that were not.
 */

/** A day of the month to the colour its ticks and its column get. */
function colourOf(weekday: number, taught: boolean): string | null {
  if (weekday === FRIDAY) return DAY_FILL.friday;
  if (weekday === SATURDAY) return DAY_FILL.saturday;
  return taught ? DAY_FILL.course : null;
}

export interface GridHighlight {
  /** Day of the month to the cells ticked on it. */
  tickedByDay: Map<number, string[]>;
  /** The month, so a column can be turned into a weekday. */
  year: number;
  month: number;
}

/**
 * Paint the claim grid: the day numbers along the top, and every tick.
 *
 * The header runs the whole month, so the weekends are marked whether or not
 * anything was claimed on them — an empty yellow column is a Friday nobody
 * worked, which is a different thing from a Friday nobody noticed.
 */
export function highlightGrid(
  xml: string,
  sheet: IncentiveSheet,
  info: GridHighlight,
  styles: StyleTable,
): string {
  let out = xml;
  for (const { day, column, nextMonth } of sheet.dayColumns) {
    if (nextMonth) continue;
    const date = new Date(info.year, info.month, day);
    if (date.getDate() !== day) continue; // a 31st the month does not have
    const ticks = info.tickedByDay.get(day) ?? [];
    const colour = colourOf(date.getDay(), ticks.length > 0);
    if (!colour) continue;

    out = fillCell(out, `${column}${sheet.headerRow}`, colour, styles);
    for (const cell of ticks) out = fillCell(out, cell, colour, styles);
  }
  return out;
}

/** Paint the log's weekend rows, across the five columns it uses. */
export function highlightLog(
  xml: string,
  layout: VerificationLayout,
  rows: { row: number; date: Date }[],
  styles: StyleTable,
): string {
  let out = xml;
  const columns = [
    layout.dateColumn,
    layout.courseColumn,
    layout.locationColumn,
    layout.sessionColumn,
    layout.durationColumn,
  ];
  for (const { row, date } of rows) {
    const weekday = date.getDay();
    if (weekday !== FRIDAY && weekday !== SATURDAY) continue;
    const colour = weekday === FRIDAY ? DAY_FILL.friday : DAY_FILL.saturday;
    for (const col of columns) out = fillCell(out, `${col}${row}`, colour, styles);
  }
  return out;
}
