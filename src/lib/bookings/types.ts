/**
 * The booking register.
 *
 * The office keeps every booking in one Excel sheet, one row per participant,
 * 17,000 rows and growing. The rows carry no instructor and no status worth
 * the name — "Booking Status" is "Confirmed" on all but 80 of them — so the
 * daily plan is made by eye and a clash is found on the morning it happens.
 *
 * Here a booking is the unit the office actually sells: one company's group,
 * on one course, on one set of dates, at one start time, in one venue. The
 * participant rows hang off it. Everything the sheet could not say — who
 * teaches it, whether the PO is in, whether a trainer is on leave that week —
 * is a field rather than a convention.
 */

/**
 * Where a booking is in the pipeline.
 *
 * `tentative` is a request that is not yet committed — the "not confirmed" the
 * office asks for. `delivered` is set on import for anything that already
 * finished, so the schedule shows the work ahead rather than two years of
 * history, and is set by hand afterwards.
 */
export type BookingStatus = "tentative" | "confirmed" | "delivered" | "cancelled";

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  tentative: "Not confirmed",
  confirmed: "Confirmed",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** `not-required` is NEFT's own staff — there is no customer to raise one. */
export type PoStatus = "not-required" | "not-received" | "under-process" | "received";

export const PO_STATUS_LABEL: Record<PoStatus, string> = {
  "not-required": "Not required",
  "not-received": "PO not received",
  "under-process": "PO under process",
  received: "PO received",
};

export type DeliveryMode = "classroom" | "online" | "site";

export const MODE_LABEL: Record<DeliveryMode, string> = {
  classroom: "Classroom",
  online: "Online",
  site: "Client site",
};

/**
 * The sheet's first column states the language the class runs in ("ENG /
 * CLASSROOM", "ARABIC / CLASSROOM", "URDU / CLASSROOM"), and it decides who
 * can teach it as firmly as the course does.
 */
export type Language = "english" | "arabic" | "urdu" | "other";

export const LANGUAGE_LABEL: Record<Language, string> = {
  english: "English",
  arabic: "Arabic",
  urdu: "Urdu",
  other: "Not stated",
};

export interface Participant {
  name: string;
  position: string;
  /** Iqama or passport number, as written. */
  idNo: string;
  gin: string;
  email: string;
  mobile: string;
  /** The trainee's own rig or segment — never where the course runs. */
  rig: string;
}

export interface Booking {
  /** Derived from the booking's own content, so re-importing does not duplicate. */
  id: string;
  /** What the office quotes on the phone: NB-0001. Assigned in import order. */
  ref: string;
  courseName: string;
  courseCode: string;
  /** ISO yyyy-mm-dd. A course of several days runs start..end inclusive. */
  startDate: string;
  endDate: string;
  /** Minutes from midnight, so an overlap is arithmetic rather than string work. */
  startMin: number;
  endMin: number;
  /** Contact hours per day, as the sheet states them. */
  hours: number;
  /** Normalised venue: "NEFT", "NEFT-OUTBOUND", or the client site. */
  venue: string;
  mode: DeliveryMode;
  language: Language;
  company: string;
  requestor: string;
  requestDate: string | null;
  poNumber: string;
  poStatus: PoStatus;
  status: BookingStatus;
  /** Null until someone assigns it, which is what the conflicts view counts. */
  instructorId: string | null;
  participants: Participant[];
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface Instructor {
  id: string;
  name: string;
  employeeNo: string;
  /**
   * Course names this instructor is approved for. Empty means "anything" —
   * an office that has not filled the matrix in yet still gets a schedule.
   */
  courses: string[];
  /** Languages they can deliver in. Empty means "any". */
  languages: Language[];
  active: boolean;
}

export type LeaveKind = "vacation" | "sick" | "training" | "other";

export const LEAVE_LABEL: Record<LeaveKind, string> = {
  vacation: "Vacation",
  sick: "Sick leave",
  training: "Own training",
  other: "Other",
};

export interface Leave {
  id: string;
  instructorId: string;
  /** Inclusive ISO dates. */
  from: string;
  to: string;
  kind: LeaveKind;
  note: string;
}

/** The course list on the workbook's CODE tab, kept so new bookings can pick from it. */
export interface CourseRef {
  name: string;
  code: string;
  location: string;
}

export type ConflictCode =
  | "unassigned"
  | "double-booked"
  | "on-leave"
  | "not-qualified"
  | "language"
  | "po-missing"
  | "unconfirmed";

export interface Conflict {
  code: ConflictCode;
  severity: "error" | "warning";
  /** The day it bites, so the list sorts into the order the office will hit it. */
  date: string;
  bookingIds: string[];
  instructorId: string | null;
  title: string;
  detail: string;
}
