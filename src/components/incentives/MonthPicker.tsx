"use client";

import { useMemo } from "react";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export interface AvailableMonth {
  year: number;
  month: number;
  label: string;
  rows: number;
}

/**
 * Choosing the month to check.
 *
 * The newer export is the whole record rather than one month — the file we
 * were given runs from January 2024 to October 2026 — so the month is a
 * choice, and it is the choice everything else in the page is about.
 *
 * Year and month separately, rather than one list of every month in the file.
 * Thirty-four entries in a dropdown is a scroll with no shape to it, and the
 * office already thinks of a month as a month and a year: "check August" is
 * the question, and which year is usually obvious from where you are standing.
 *
 * Only the months the file actually holds are offered. A month with nothing in
 * it would verify every trainer as having taught nothing, which is a worse
 * answer than not being able to ask.
 */
export function MonthPicker({
  months,
  year,
  month,
  onChange,
}: {
  /** Every month the record sheet holds rows for. */
  months: AvailableMonth[];
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
}) {
  const years = useMemo(
    () => [...new Set(months.map((m) => m.year))].sort((a, b) => b - a),
    [months],
  );

  /* Calendar order within the year, which is how a year is read. */
  const inYear = useMemo(
    () => months.filter((m) => m.year === year).sort((a, b) => a.month - b.month),
    [months, year],
  );

  const current = months.find((m) => m.year === year && m.month === month) ?? null;

  const pickYear = (next: number) => {
    const available = months.filter((m) => m.year === next);
    if (!available.length) return;
    // Keep the month if that year has it, so stepping back a year to compare
    // the same month does not also move the month.
    const same = available.find((m) => m.month === month);
    const latest = available.reduce((a, b) => (b.month > a.month ? b : a));
    onChange(next, (same ?? latest).month);
  };

  return (
    <div className="no-print mt-2 space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-bold text-navy">Check</span>
        <select
          aria-label="Month to check"
          value={month}
          onChange={(e) => onChange(year, Number(e.target.value))}
          className="rounded-md border border-hairline bg-white px-2 py-1 text-xs font-medium text-navy outline-none focus:border-gold focus:ring-2 focus:ring-gold/30"
        >
          {inYear.map((m) => (
            <option key={m.month} value={m.month}>
              {MONTH_NAMES[m.month]}
            </option>
          ))}
        </select>
        <select
          aria-label="Year to check"
          value={year}
          onChange={(e) => pickYear(Number(e.target.value))}
          className="rounded-md border border-hairline bg-white px-2 py-1 text-xs font-medium text-navy outline-none focus:border-gold focus:ring-2 focus:ring-gold/30"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <p className="text-[11px] leading-snug text-slate-ink">
        {current ? `${current.rows.toLocaleString("en-US")} rows in this month` : "No rows"} ·{" "}
        {months.length} month{months.length === 1 ? "" : "s"} in this file
        {years.length > 1 ? `, ${years[years.length - 1]}–${years[0]}` : ""}
      </p>
    </div>
  );
}
