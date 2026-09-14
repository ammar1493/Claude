/**
 * Incentive-sheet verification.
 *
 * Three inputs meet here:
 *   - the monthly **Record Sheet** — one row per certificate issued, so it is
 *     the evidence that a session actually ran, who taught it and where;
 *   - **Courses Duration** — the master list that says whether a course is a
 *     half day, a full day or runs over several days;
 *   - the trainers' own **incentive sheets** — a claim grid plus a
 *     self-declared verification log.
 *
 * Everything below describes those three shapes and the findings that come out
 * of comparing them.
 */

/** What a course occupies of a working day, from the Courses Duration list. */
export interface CourseDuration {
  /** The course name exactly as the master list spells it. */
  name: string;
  /** The raw cell — "Half Day", "1 Full Day", "3 Days" … */
  label: string;
  /** Days the course runs: 0.5, 1, 2, 3 … */
  days: number;
}

/** One certificate row of the Record Sheet. */
export interface RecordRow {
  certNo: string;
  studentName: string;
  clientName: string;
  instructorName: string;
  courseName: string;
  date: Date;
  location: string;
  sessionNo: string;
  rigNo: string;
  /** Trailing digits of the session number, for ordering sessions in a day. */
  sessionSeq: number | null;
}

/**
 * A teaching block: the sessions that make up one class.
 *
 * A class rarely maps to a single session number — a morning H2S class splits
 * into an Awareness group and a Level-2 group, each with its own number, and a
 * big class splits again per client. Blocks put those back together so a day
 * reads as "one morning class and one afternoon class" rather than as six
 * sessions. See groupSessionsIntoBlocks() for the rule.
 */
export interface TeachingBlock {
  courseName: string;
  /** Every course name that landed in this block. */
  courseNames: string[];
  sessionNos: string[];
  clients: string[];
  locations: string[];
  rigNos: string[];
  participants: number;
  /** Master-list duration of the block's longest course, null when unlisted. */
  duration: CourseDuration | null;
  /** Days this block occupies: 0.5, 1, or 1 per day of a multi-day course. */
  dayValue: number;
  /** Days the whole course runs, 1 unless it is a multi-day course. */
  spanDays: number;
}

/** What the Record Sheet says one instructor did on one date. */
export interface RecordDay {
  /** ISO yyyy-mm-dd, the key everything joins on. */
  key: string;
  date: Date;
  blocks: TeachingBlock[];
  /** Blocks running on this date because a multi-day course started earlier. */
  continuations: TeachingBlock[];
  /** Sum of the day's block values — can exceed 1, which is itself a finding. */
  rawLoad: number;
  /** rawLoad capped at one working day; what a claim is measured against. */
  load: number;
  /** True when every location on the day is the NEFT training centre. */
  allInHouse: boolean;
  locations: string[];
}

export type ClaimSection = "near" | "mid" | "far" | "perdiem" | "admin";

export type ClaimKind =
  | "halfAM"
  | "halfPM"
  | "full"
  | "satHalf"
  | "satFull"
  | "friHalf"
  | "friFull"
  | "holiday"
  | "daily"
  | "travel"
  | "friday"
  | "perdiem"
  | "admin"
  | "unknown";

/** One rate line of the claim grid — a row of the trainer's time sheet. */
export interface ClaimRow {
  /** 1-based row number in the sheet, so a finding can point at a cell. */
  rowIndex: number;
  label: string;
  section: ClaimSection;
  kind: ClaimKind;
  rate: number;
  /** Days one tick on this row is worth (0 for per-diem and other allowances). */
  dayValue: number;
  /** Day-of-month numbers ticked on this row. */
  days: number[];
  /** Cell addresses of those ticks, parallel to `days`. */
  cells: string[];
  /** The row's own Total cell, as the sheet computed it. */
  statedTotal: number | null;
  totalCell: string;
}

/** One line of the trainer's self-declared verification log. */
export interface VerificationEntry {
  rowIndex: number;
  date: Date | null;
  rawDate: string;
  courseName: string;
  location: string;
  sessionNo: string;
  durationLabel: string;
  /** Days the written duration is worth, null when it is not a known phrase. */
  durationDays: number | null;
}

/** A parsed incentive workbook. */
export interface IncentiveSheet {
  fileName: string;
  instructorName: string;
  monthLabel: string;
  timeSheetName: string;
  verificationSheetName: string | null;
  headerRow: number;
  /** Day-of-month number for each grid column, in column order. */
  dayColumns: { day: number; column: string; nextMonth: boolean }[];
  rows: ClaimRow[];
  statedGrandTotal: number | null;
  grandTotalCell: string;
  verification: VerificationEntry[];
  /** Problems hit while reading the file, before any cross-checking. */
  parseWarnings: string[];
}

export type Severity = "error" | "warning" | "info";

/**
 * One thing to change on a sheet.
 *
 * `cells` are the exact cells to highlight; `why` is the sentence the verifier
 * sends back to the trainer. `delta` is the SAR the correction moves, negative
 * when the claim comes down.
 */
export interface Finding {
  id: string;
  severity: Severity;
  /** Short machine code, e.g. "over-claim" — also the filter key in the UI. */
  code: string;
  title: string;
  why: string;
  /** What the sheet should say instead, when there is a single right answer. */
  suggestion: string | null;
  sheet: "timesheet" | "verification";
  cells: string[];
  date: Date | null;
  claimedSar: number | null;
  suggestedSar: number | null;
  delta: number | null;
  /** Record Sheet lines that back the finding, for the evidence panel. */
  evidence: string[];
}

/** Everything the app knows about one trainer's month. */
export interface SheetReport {
  sheet: IncentiveSheet;
  /** The Record Sheet spelling of the instructor, once matched. */
  matchedInstructor: string | null;
  matchConfidence: number;
  findings: Finding[];
  days: DayReport[];
  /** What the trainer asks for — the sheet's own Total cell. */
  claimedTotal: number;
  /** What the ticks add up to at the sheet's own rates. */
  computedTotal: number;
  /** computedTotal after every priced correction. */
  verifiedTotal: number;
  /** Errors whose money impact needs a human — a distance to confirm, say. */
  unpricedCount: number;
  errorCount: number;
  warningCount: number;
}

/** A single date, with the claim and the evidence side by side. */
export interface DayReport {
  key: string;
  date: Date;
  weekday: number;
  claimedDays: number;
  claimedSar: number;
  recordDays: number;
  rawRecordDays: number;
  claims: { row: ClaimRow; cell: string }[];
  record: RecordDay | null;
  findingIds: string[];
}
