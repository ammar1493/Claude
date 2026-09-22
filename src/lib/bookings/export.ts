import * as XLSX from "xlsx";
import { saveFile } from "@/lib/incentives/download";
import { DAILY_COLUMNS, dailyRowValues, dailySheetLines, sheetDate } from "./dailySheet";
import { buildStyledSheet, type SheetRow } from "./xlsxSheet";
import { fmtClock } from "./parse";
import {
  buildClasses,
  datesBetween,
  findConflicts,
  type ClassSession,
  type PlanWindow,
} from "./schedule";
import {
  BOOKING_STATUS_LABEL,
  LANGUAGE_LABEL,
  MODE_LABEL,
  PO_STATUS_LABEL,
  type Booking,
  type Instructor,
  type Leave,
  LEAVE_LABEL,
} from "./types";

/**
 * Handing the register back as a workbook.
 *
 * Nothing here edits the office's original file — this is a new workbook, so
 * SheetJS builds it from scratch and the caution about round-tripping a
 * trainer's template does not apply. It keeps the sheet's own column order and
 * wording so it reads as the same document, and adds the columns the sheet
 * could not carry: the booking reference, the statuses, and who is teaching.
 */

const dayName = (iso: string) =>
  ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
    new Date(`${iso}T00:00:00`).getDay()
  ];

function registerRows(bookings: Booking[], instructorName: (id: string | null) => string) {
  return bookings.flatMap((b) => {
    const base = {
      "Booking Ref": b.ref,
      LOCATION: `${LANGUAGE_LABEL[b.language]} / ${MODE_LABEL[b.mode]}`,
      "Received Request Date": b.requestDate ?? "",
      From: b.startDate,
      To: b.endDate,
      "Course Duration": datesBetween(b.startDate, b.endDate).length,
      "COURSE NAME": b.courseName,
      "Course Code": b.courseCode,
      "From (time)": fmtClock(b.startMin),
      "To (time)": fmtClock(b.endMin),
      "Duration of Course (hours)": b.hours || "",
      Instructor: instructorName(b.instructorId),
      Requestor: b.requestor,
      "PO#": b.poNumber,
      "PO Status": PO_STATUS_LABEL[b.poStatus],
      Company: b.company,
      "Booking Status": BOOKING_STATUS_LABEL[b.status],
      Location: b.venue,
      Participants: b.participants.length,
      Remarks: b.notes,
    };
    // One row per participant, as the office's own sheet is laid out; a
    // booking nobody has been entered against still gets its row, or it would
    // vanish from the register it was exported from.
    if (!b.participants.length)
      return [
        {
          ...base,
          "Participant Name": "",
          POSITION: "",
          "IQAMA/PASSPORT": "",
          "GIN NUMBER": "",
          "CANDIDATES EMAIL": "",
          "MOBILE NUMBER": "",
          "RIG NO / SEGMENT": "",
        },
      ];
    return b.participants.map((p) => ({
      ...base,
      "Participant Name": p.name,
      POSITION: p.position,
      "IQAMA/PASSPORT": p.idNo,
      "GIN NUMBER": p.gin,
      "CANDIDATES EMAIL": p.email,
      "MOBILE NUMBER": p.mobile,
      "RIG NO / SEGMENT": p.rig,
    }));
  });
}

/**
 * "month" is the working export: the planning month, small enough to mail.
 * "all" is the backup — every booking the register holds, which for two years
 * of history is tens of thousands of participant rows and a workbook to match.
 */
export type ExportScope = "month" | "all";

export function buildRegisterWorkbook(
  bookings: Booking[],
  instructors: Instructor[],
  leaves: Leave[],
  window: PlanWindow,
  scope: ExportScope = "month",
): XLSX.WorkBook {
  const names = new Map(instructors.map((i) => [i.id, i.name]));
  const instructorName = (id: string | null) => (id ? (names.get(id) ?? "(removed)") : "");
  const wb = XLSX.utils.book_new();

  const listed =
    scope === "all"
      ? bookings
      : bookings.filter((b) => b.startDate <= window.to && b.endDate >= window.from);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(registerRows(listed, instructorName)),
    "Bookings",
  );

  // The daily schedule: one row per class per day, which is the form the
  // training floor reads it in.
  const classes = buildClasses(bookings);
  const schedule = classes
    .filter((c) => c.active && c.endDate >= window.from && c.startDate <= window.to)
    .flatMap((c) =>
      c.days
        .filter((d) => d >= window.from && d <= window.to)
        .map((d, i) => ({
          Date: d,
          Day: dayName(d),
          From: fmtClock(c.startMin),
          To: fmtClock(c.endMin),
          Course: c.courseName,
          Code: c.courseCode,
          Venue: c.venue,
          Language: LANGUAGE_LABEL[c.language],
          Instructor: instructorName(c.instructorId) || "NOT ASSIGNED",
          "Day of": c.days.length > 1 ? `${i + 1} of ${c.days.length}` : "",
          Companies: [...new Set(c.bookings.map((b) => b.company))].join(", "),
          Trainees: c.seats,
          Refs: c.bookings.map((b) => b.ref).join(", "),
        })),
    )
    .sort((a, b) => a.Date.localeCompare(b.Date) || a.From.localeCompare(b.From));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(schedule), "Schedule");

  const roster = instructors.map((i) => ({
    Instructor: i.name,
    "Employee No": i.employeeNo,
    Status: i.active ? "Active" : "Inactive",
    Languages: i.languages.length ? i.languages.map((l) => LANGUAGE_LABEL[l]).join(", ") : "Any",
    "Approved courses": i.courses.length ? i.courses.join("; ") : "Any",
    "Days booked in window": classes
      .filter((c) => c.instructorId === i.id && c.active)
      .reduce((n, c) => n + c.days.filter((d) => d >= window.from && d <= window.to).length, 0),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(roster), "Instructors");

  const leaveRows = leaves
    .map((l) => ({
      Instructor: names.get(l.instructorId) ?? "(removed)",
      Type: LEAVE_LABEL[l.kind],
      From: l.from,
      To: l.to,
      Days: datesBetween(l.from, l.to).length,
      Note: l.note,
    }))
    .sort((a, b) => a.From.localeCompare(b.From));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(leaveRows), "Leave");

  const conflicts = findConflicts(classes, instructors, leaves, window).map((c) => ({
    Severity: c.severity === "error" ? "Must fix" : "Check",
    Date: c.date,
    Issue: c.title,
    Detail: c.detail,
    Bookings: c.bookingIds.length,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(conflicts), "Conflicts");

  return wb;
}

export async function downloadRegister(
  bookings: Booking[],
  instructors: Instructor[],
  leaves: Leave[],
  window: PlanWindow,
  scope: ExportScope = "month",
): Promise<void> {
  const wb = buildRegisterWorkbook(bookings, instructors, leaves, window, scope);
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  // Through saveFile rather than an anchor of its own: the artifact viewer's
  // sandbox makes an anchor download inert.
  await saveFile(
    scope === "all"
      ? `NEFT-Booking-Register-${window.to}.xlsx`
      : `NEFT-Bookings-${window.from}-to-${window.to}.xlsx`,
    new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  );
}

/** Column widths for the daily sheet, in Excel's character units. */
const DAILY_WIDTHS = [38, 11, 24, 16, 11, 12, 13, 12, 26];

/**
 * The day's schedule as the office's own one-page sheet.
 *
 * One file, one day, the nine columns it already has — the thing that gets
 * attached to an email at eight in the morning.
 */
export async function downloadDailySheet(
  classes: ClassSession[],
  instructors: Instructor[],
  dayISO: string,
): Promise<{ rows: number; saved: boolean }> {
  const lines = dailySheetLines(classes, instructors, dayISO);
  const rows: SheetRow[] = lines.map((line) => (line ? dailyRowValues(line) : null));
  const bytes = await buildStyledSheet(
    sheetDate(dayISO),
    DAILY_COLUMNS.map((header, i) => ({ header, width: DAILY_WIDTHS[i] })),
    rows,
  );
  const outcome = await saveFile(
    `NEFT-Daily-Schedule-${dayISO}.xlsx`,
    new Blob([bytes as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  return { rows: lines.filter(Boolean).length, saved: outcome !== "failed" };
}
