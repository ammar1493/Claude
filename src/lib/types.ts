/** One enrolment row of the training workbook (one row = one participant seat). */
export interface TrainingRow {
  date: Date;
  courseName: string;
  client: string;
  instructorName: string;
  participantName: string;
  actualSession: string;
  /** Everything else from the sheet, kept for the raw Data Table tab. */
  extra: Record<string, string | number | null>;
}

/** A row of a WellSharp-matched enrolment, joined with its course-hours lookup. */
export interface WellSharpRow extends TrainingRow {
  courseKey: string;
  days: number;
  hoursPerDay: number;
  totalHours: number;
}

/** One parsed class-block cell of a QCTA trainer-utilization workbook. */
export interface QiddiyaSession {
  date: Date;
  class: string;
  course: string;
  instructor: string;
  students: number;
  sessionDays: number;
  sourceFile: string;
  sourceSheet: string;
}

/** One instructor-day cell of a QCTA workbook. */
export interface QiddiyaDay {
  date: Date;
  class: string;
  instructor: string;
  sourceFile: string;
  sourceSheet: string;
}

export interface QiddiyaStore {
  sessions: QiddiyaSession[];
  days: QiddiyaDay[];
  files: string[];
}

/** A manually keyed month of project numbers (Qiddiya or Takamol). */
export interface ManualEntry {
  id: string;
  year: number;
  month: number;
  participants: number;
  sessions: number;
  teachingDays: number;
  note: string;
  addedOn: string;
}

export interface ManualEntryDated extends ManualEntry {
  periodDate: Date;
  periodLabel: string;
}
