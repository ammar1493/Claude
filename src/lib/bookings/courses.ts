/**
 * Courses whose length is a fact of the course, not of the booking.
 *
 * The WellSharp programme is accredited at a fixed number of days, so a
 * booking that runs Driller Level over four is not a shorter course — it is a
 * typo, or a class that will not certify. The office states them as:
 *
 *   OGO, Drilling Supervisor, Drilling Driller   5 days
 *   Coiled Tubing, Wireline, Workover            3 days
 *
 * A retake sits outside that: it is the exam alone, one day, which is how the
 * booking sheet already writes it.
 *
 * These are the office's own figures, not something read out of the data —
 * though the booking sheet's `Course Duration` column agrees with all six on
 * the rows where it is filled in.
 *
 * This is the one place they are written down. `WELLSHARP_HOURS` in
 * `lib/config.ts`, which the dashboard's WellSharp hours are counted from,
 * reads its days from here rather than repeating them: the two were written
 * out separately once, drifted a day apart on all six, and understated
 * WellSharp teaching hours by about 30% until somebody compared them.
 */

export interface CourseLength {
  days: number;
  /** The course as IADC names it, for anything that has to say which it is. */
  label: string;
}

interface Entry extends CourseLength {
  /** Every spelling of it the booking sheet and the training export use. */
  names: string[];
}

const WELLSHARP: Entry[] = [
  {
    days: 5,
    label: "WellSharp Well Servicing OGO",
    names: ["OGO", "COMPLETION (OGO)", "WELL SERVICING OGO", "IADC - WELLSHARP WELL SERVICING OGO"],
  },
  {
    days: 5,
    label: "WellSharp Drilling Supervisory Level",
    names: [
      "DRILLING SUPERVISORY LEVEL 4",
      "DRILLING SUPERVISOR LEVEL 4",
      "DRILLER SUPERVISORY LEVEL 4",
      "DRILLING SUPERVISORY LEVEL",
      "IADC - WELLSHARP DRILLING SUPERVISORY LEVEL",
    ],
  },
  {
    days: 5,
    label: "WellSharp Drilling Driller Level",
    names: [
      "DRILLER LEVEL 3",
      "DRILLING DRILLER LEVEL 3",
      "DRILLING DRILLER LEVEL",
      "IADC - WELLSHARP DRILLING DRILLER LEVEL",
    ],
  },
  {
    days: 3,
    label: "WellSharp Well Servicing Coiled Tubing",
    names: [
      "COILED TUBING",
      "WELL SERVICING COILED TUBING",
      "IADC - WELLSHARP WELL SERVICING COILED TUBING",
    ],
  },
  {
    days: 3,
    label: "WellSharp Well Servicing Wireline",
    names: [
      "WIRELINE",
      "WIRELINES",
      "WELL SERVICING WIRELINE",
      "IADC - WELLSHARP WELL SERVICING WIRELINE",
    ],
  },
  {
    days: 3,
    label: "WellSharp Well Servicing Workover",
    names: ["WORKOVER", "WELL SERVICING WORKOVER", "IADC - WELLSHARP WELL SERVICING WORKOVER"],
  },
];

/**
 * Names are matched whole rather than by keyword, because the catalogue is
 * full of near misses that are different courses: "SLICK LINE/WIRELINE
 * APPLICATIONS" (NEFT T13) is not the WellSharp wireline course, "ADVANCED
 * WORKOVER OPERATIONS WORKSHOP" (NEFT T07) is not the workover one, and
 * "SCAFFOLDING SUPERVISOR" is not a supervisory level.
 */
const LOOKUP = new Map<string, CourseLength>();
for (const entry of WELLSHARP) {
  for (const name of entry.names) LOOKUP.set(name, { days: entry.days, label: entry.label });
}

/** A retake is the exam on its own — one day, whatever the course runs to. */
const RETAKE = /\(\s*(RE-?TAKE|RETEST|EXAM)[^)]*\)\s*$|\(\s*[^)]*\b(RETAKE|RETEST)\b[^)]*\)\s*$/;

export interface KnownLength extends CourseLength {
  /** True when the booking is the exam alone rather than the course. */
  retake: boolean;
}

/**
 * How long this course runs, or null when nothing is on record for it.
 *
 * The office's spellings drift — "LEEVEL" for LEVEL, "SUPERVIOSRY" for
 * SUPERVISORY — and a stuck-pipe course bolted onto a supervisory booking is
 * still the supervisory course, so both are repaired before the lookup rather
 * than added to it as phantom courses.
 */
export function knownLength(courseName: string): KnownLength | null {
  let name = String(courseName ?? "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/LEEVEL/g, "LEVEL")
    .replace(/SUPERVIOSRY|SUPERVIOSR/g, "SUPERVISORY")
    .replace(/\s*\+\s*STUCK PIPE.*$/, "")
    .trim();

  const retake = RETAKE.test(name);
  if (retake) name = name.replace(RETAKE, "").trim();

  const hit = LOOKUP.get(name);
  if (!hit) return null;
  return { days: retake ? 1 : hit.days, label: hit.label, retake };
}

/** The reference itself, for anywhere that wants to show it. */
export const COURSE_LENGTHS: { label: string; days: number }[] = WELLSHARP.map((e) => ({
  label: e.label,
  days: e.days,
}));
