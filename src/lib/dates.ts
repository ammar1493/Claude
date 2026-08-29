/**
 * Date helpers mirroring the lubridate calls used by app.R.
 * All dates are handled as local-midnight `Date` objects so that
 * bucketing never shifts across a timezone boundary.
 */

export type Granularity = "daily" | "weekly" | "monthly" | "yearly";

export function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function today(): Date {
  return atMidnight(new Date());
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + n);
  return out;
}

export function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

/** lubridate::floor_date(d, "month") */
export function floorMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** lubridate::ceiling_date(d, "month") */
export function ceilingMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

/** lubridate::floor_date(d, "year") */
export function floorYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}

/** lubridate::ceiling_date(d, "year") */
export function ceilingYear(d: Date): Date {
  return new Date(d.getFullYear() + 1, 0, 1);
}

/**
 * lubridate::floor_date(d, "week", week_start = n).
 * week_start follows lubridate: 1 = Monday ... 7 = Sunday.
 * The app relies on the default (7 = Sunday) for the generic charts and on
 * week_start = 5 (Friday) for the WellSharp weekly charts.
 */
export function floorWeek(d: Date, weekStart = 7): Date {
  // JS getDay(): 0 = Sunday .. 6 = Saturday. lubridate: 1 = Monday .. 7 = Sunday.
  const lubriDay = d.getDay() === 0 ? 7 : d.getDay();
  let delta = lubriDay - weekStart;
  if (delta < 0) delta += 7;
  return addDays(atMidnight(d), -delta);
}

/** period_floor() from app.R */
export function periodFloor(d: Date, mode: Granularity): Date {
  switch (mode) {
    case "weekly":
      return floorWeek(d);
    case "monthly":
      return floorMonth(d);
    case "yearly":
      return floorYear(d);
    default:
      return atMidnight(d);
  }
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const MONTH_NAMES = MONTHS_FULL;

const pad = (n: number) => String(n).padStart(2, "0");

/** format(d, "%b %Y") */
export const fmtMonthYear = (d: Date) => `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
/** format(d, "%B %Y") */
export const fmtMonthYearFull = (d: Date) => `${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
/** format(d, "%d %b") */
export const fmtDayMonth = (d: Date) => `${pad(d.getDate())} ${MONTHS_SHORT[d.getMonth()]}`;
/** format(d, "%d %b %Y") */
export const fmtDayMonthYear = (d: Date) =>
  `${pad(d.getDate())} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
/** ISO yyyy-mm-dd, used for <input type="date"> round-trips. */
export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** yyyy-mm period key */
export const toPeriodKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

export function fromISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Parse a period key ("2026-03") back into the first of that month. */
export function fromPeriodKey(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, 1);
}
