import type { TrainingRow } from "./types";
import { isWellSharpCourse } from "./wellsharp";

/**
 * is_hse_course() from app.R.
 *
 * The R function computes the WellSharp match and returns its negation — every
 * course that is not a WellSharp course counts as HSE. The HSE_KEYWORDS list in
 * the original file is declared but never consulted, so it is not consulted
 * here either; changing that would change every number on the HSE tab.
 */
export function isHseCourse(courseName: string): boolean {
  return !isWellSharpCourse(courseName);
}

export function filterHse(rows: TrainingRow[]): TrainingRow[] {
  return rows.filter((r) => isHseCourse(r.courseName));
}

/** hse_with_hours(): placeholder of 8 estimated hours per HSE row. */
export const HSE_ESTIMATED_HOURS_PER_ROW = 8;
