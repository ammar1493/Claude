import type { ClaimRow, FreelanceRates } from "./types";

/**
 * Pricing a freelancer's sheet.
 *
 * The rates printed down the SAR column of NE-HR050 are staff rates: 50 for a
 * morning at the centre, 100 for the day, 250 for a rig. A freelancer is not
 * on that table at all — their teaching allowance is a flat rate a day and
 * half of it for a half day, wherever the course ran — so leaving the printed
 * figures in their sheet leaves the sheet saying something untrue about them,
 * and every total below it adds up to the wrong answer.
 *
 * So the day lines get their rate rewritten and the totals recomputed. The
 * ticks are untouched: which days were worked, and whether each was a morning,
 * an afternoon or a whole day, is a question about the month and not about how
 * the person is engaged.
 *
 * Per diems, the admin and office-boy lines and the special-project weeks keep
 * the form's own figures. A hotel night costs what it costs whoever slept in
 * it, and none of those lines is a teaching day.
 */

/** Riyals one tick on this row is worth to a freelancer, or null to leave it. */
export function freelanceSarRate(row: ClaimRow, rates: FreelanceRates): number | null {
  if (row.dayValue <= 0) return null;
  const usd = row.dayValue <= 0.5 ? rates.half : rates.day;
  return usd * rates.sarPerUsd;
}

/** True for the rows whose rate a freelancer's sheet rewrites. */
export function isDayLine(row: ClaimRow): boolean {
  return row.dayValue > 0;
}

/**
 * The line written under the total, so the sheet explains itself.
 *
 * Without it a reader finds 281.25 in a column the blank form prints 100 in,
 * and no way to tell whether that is the scheme or a typo.
 */
export function freelanceNote(rates: FreelanceRates): string {
  const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return (
    `Freelance teaching allowance: $${money(rates.day)} a day, $${money(rates.half)} a half day, ` +
    `converted at ${money(rates.sarPerUsd)} SAR to the US dollar. ` +
    `The day rates above are this allowance, not the staff rate table; per diems are unchanged.`
  );
}
