import { knownLength } from "./bookings/courses";
import { MONTH_NAMES } from "./dates";

/** DATA & GLOBALS block of app.R. */
export const REQUIRED_COLUMNS = [
  "Actual Date",
  "Course Name",
  "Client",
  "Instructor Name",
  "Participant's Name",
  "Actual Sessions",
] as const;

export const GOOGLE_XLSX_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ6oTyvG8VEl4GJ4N6eVAN8CMNep_o9TltK6j6UxSlOryk4WMzqXomVippcX2jrySnmkuHnH7pVe5QV/pub?output=xlsx";

/** Manual 2023 data (the year that predates the workbook). */
export const MANUAL_2023: { year: number; monthNum: number; participants: number }[] = [
  { year: 2023, monthNum: 1, participants: 1561 },
  { year: 2023, monthNum: 2, participants: 1508 },
  { year: 2023, monthNum: 3, participants: 1934 },
  { year: 2023, monthNum: 4, participants: 862 },
  { year: 2023, monthNum: 5, participants: 1910 },
  { year: 2023, monthNum: 6, participants: 1737 },
  { year: 2023, monthNum: 7, participants: 2144 },
  { year: 2023, monthNum: 8, participants: 2498 },
  { year: 2023, monthNum: 9, participants: 2627 },
  { year: 2023, monthNum: 10, participants: 3364 },
  { year: 2023, monthNum: 11, participants: 2260 },
  { year: 2023, monthNum: 12, participants: 2314 },
];

export const TOTAL_2023_PARTICIPANTS = MANUAL_2023.reduce((a, r) => a + r.participants, 0);

/** Instructor-evaluation questions -> Google Sheet tab name. */
export const QUESTIONS_MAP: { label: string; sheet: string }[] = [
  { label: "Q1 = Was the instructor well prepared?", sheet: "Well prepared" },
  { label: "Q2 = Did the instructor demonstrate good knowledge?", sheet: "Demonstrated Knowledge" },
  { label: "Q3 = Was the instructor professional?", sheet: "Professionalism" },
  { label: "Q4 = Did the instructor use effective teaching techniques?", sheet: "Teaching Techniques" },
  { label: "Q5 = Would you recommend this instructor to others?", sheet: "Recommend Instructor" },
  { label: "Q6 = Did the instructor encourage learning?", sheet: "Encourages Learning" },
  { label: "Q7 = Was the content expressed clearly?", sheet: "Clarity" },
  { label: "Q8 = Was the instructor enthusiastic?", sheet: "Enthusiasm" },
  { label: "Q9 = Did the instructor respond to questions clearly and helpfully?", sheet: "Tutor Response" },
  { label: "Q10 = Were you happy with the course?", sheet: "Happy on the whole" },
  { label: "Q11 = Were the materials sufficient?", sheet: "Materials" },
  { label: "Q12 = Did you have enough time?", sheet: "Enough Time" },
  { label: "Q13 = Would you recommend NEFT to others?", sheet: "Recommend NEFT" },
];

/** WellSharp course hours mapping (standard names). */
export interface WellSharpHours {
  courseName: string;
  days: number;
  hoursPerDay: number;
  totalHours: number;
}

/**
 * One row of the table, with its days taken from the accredited lengths in
 * `bookings/courses.ts` wherever that list knows the course.
 *
 * The two used to be written out separately and drifted: this table carried
 * the figures the Shiny app was written with, a day short on all six of the
 * courses the office names, which understated WellSharp teaching hours by
 * about 30%. Deriving one from the other is what stops that happening again;
 * the days written here are the fallback for the courses that list does not
 * cover, and `npm run check:schedule` fails if the two ever disagree.
 */
const wellsharp = (courseName: string, days: number, hoursPerDay = 6): WellSharpHours => {
  const accredited = knownLength(courseName)?.days ?? days;
  return { courseName, days: accredited, hoursPerDay, totalHours: accredited * hoursPerDay };
};

export const WELLSHARP_HOURS: WellSharpHours[] = [
  wellsharp("IADC - WELLSHARP DRILLING DRILLER LEVEL", 5),
  wellsharp("IADC - WELLSHARP DRILLING SUPERVISORY LEVEL", 5),
  wellsharp("IADC - WELLSHARP WELL SERVICING OGO", 5),
  wellsharp("IADC - WELLSHARP WELL SERVICING COILED TUBING", 3),
  wellsharp("IADC - WELLSHARP WELL SERVICING WIRELINE", 3),
  wellsharp("IADC - WELLSHARP WELL SERVICING WORKOVER", 3),
  // Not among the six the office stated, so these keep the figures the Shiny
  // app used. Neither appears in the booking sheet at all.
  wellsharp("IADC - WELLSHARP WELL SERVICING SNUBBING", 2),
  wellsharp("IADC - WELLSHARP DRILLING INTRODUCTORY LEVEL", 3),
  // Retake Exam variants: the exam alone, one day.
  wellsharp("IADC - WELLSHARP DRILLING DRILLER LEVEL (RETAKE EXAM)", 1),
  wellsharp("IADC - WELLSHARP DRILLING SUPERVISORY LEVEL (RETAKE EXAM)", 1),
  wellsharp("IADC - WELLSHARP WELL SERVICING OGO (RETAKE EXAM)", 1),
  wellsharp("IADC - WELLSHARP WELL SERVICING COILED TUBING (RETAKE EXAM)", 1),
  wellsharp("IADC - WELLSHARP WELL SERVICING WIRELINE (RETAKE EXAM)", 1),
  wellsharp("IADC - WELLSHARP WELL SERVICING WORKOVER (RETAKE EXAM)", 1),
  wellsharp("IADC - WELLSHARP WELL SERVICING SNUBBING (RETAKE EXAM)", 1),
  wellsharp("IADC - WELLSHARP DRILLING INTRODUCTORY LEVEL (RETAKE EXAM)", 1),
];

/**
 * HSE course keywords, kept verbatim from app.R for reference.
 * Note: the R implementation of `is_hse_course()` does not consult this list —
 * it treats every non-WellSharp course as HSE. That behaviour is reproduced
 * exactly in `lib/hse.ts`; this constant stays here so the keyword list can be
 * wired in later without hunting for it.
 */
export const HSE_KEYWORDS = [
  "HSE",
  "SAFETY",
  "ENVIRONMENT",
  "HEALTH",
  "RISK",
  "OSHA",
  "FIRST AID",
  "FIRE",
  "ERGONOMICS",
  "COSH",
  "CONFINED SPACE",
  "WORK AT HEIGHT",
  "PTW",
  "ENVIRONMENTAL",
];

/** Any uploaded workbook whose name matches is treated as a QCTA file. */
export const QIDDIYA_FILE_PATTERN = /qcta|qiddiya/i;

export const MONTH_CHOICES = MONTH_NAMES.map((name, i) => ({ value: i + 1, label: name }));

export const YEAR_CHOICES = ["2023", "2024", "2025", "2026"];
