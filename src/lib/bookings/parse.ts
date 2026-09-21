import * as XLSX from "xlsx";
import { cellToDate, cellToNumber, cellToString } from "@/lib/xlsx";
import { addDays, diffDays, toISODate } from "@/lib/dates";
import type {
  Booking,
  BookingStatus,
  CourseRef,
  DeliveryMode,
  Language,
  Participant,
  PoStatus,
} from "./types";

/**
 * Reading the office's booking workbook.
 *
 * Columns are found by their heading rather than by position, because the
 * sheet has two columns both called some form of "Location" and the office
 * adds one whenever it needs to. Every value is matched on wording: dates
 * arrive as "31/Dec/25" and as Excel serials, times as "8:30 AM", "04:00PM",
 * and "09:3O AM" with a letter O in it. A row that cannot be read is reported
 * rather than dropped silently.
 */

/** Headings, lowercased and stripped of punctuation, in preference order. */
const FIELDS = {
  mode: ["location"],
  requestDate: ["received request date", "request date"],
  from: ["from"],
  to: ["to"],
  days: ["course duration"],
  course: ["course name"],
  code: ["course code"],
  startTime: ["from 2", "from time"],
  endTime: ["to 2", "to time"],
  hours: ["duration of course hours", "duration of course"],
  participant: ["participant name"],
  position: ["position"],
  idNo: ["iqama passport", "iqama"],
  gin: ["gin number", "gin"],
  email: ["candidates email", "email"],
  mobile: ["mobile number", "mobile"],
  rig: ["rig no segment", "rig no"],
  requestor: ["requestor"],
  po: ["po"],
  company: ["company"],
  status: ["booking status"],
  remarks: ["remarks"],
  venue: ["location"],
} as const;

type Field = keyof typeof FIELDS;

const norm = (s: unknown) =>
  cellToString(s)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Map each field to a column index.
 *
 * "Location" appears twice — first as the delivery mode and language ("ENG /
 * CLASSROOM"), last as the venue ("NEFT", "NEFT-OUTBOUND", a rig). The first
 * occurrence takes `mode` and the last takes `venue`; likewise "From"/"To"
 * are the dates and "From 2"/"To " the times, which is why the time headings
 * are looked up before the bare ones are allowed to match.
 */
function mapColumns(header: unknown[]): Record<Field, number> {
  const cells = header.map(norm);
  const out = {} as Record<Field, number>;
  const taken = new Set<number>();

  // Exact, most specific headings first, so "from 2" is claimed as the start
  // time before the bare "from" can take it.
  const order: Field[] = [
    "requestDate",
    "startTime",
    "endTime",
    "hours",
    "days",
    "course",
    "code",
    "participant",
    "position",
    "idNo",
    "gin",
    "email",
    "mobile",
    "rig",
    "requestor",
    "po",
    "company",
    "status",
    "remarks",
    "from",
    "to",
  ];
  for (const field of order) {
    let found = -1;
    for (const want of FIELDS[field]) {
      found = cells.findIndex((c, i) => !taken.has(i) && c === want);
      if (found < 0) found = cells.findIndex((c, i) => !taken.has(i) && c.startsWith(want));
      if (found >= 0) break;
    }
    out[field] = found;
    if (found >= 0) taken.add(found);
  }
  const locations = cells.map((c, i) => (c === "location" ? i : -1)).filter((i) => i >= 0);
  out.mode = locations[0] ?? -1;
  out.venue = locations.length > 1 ? locations[locations.length - 1] : -1;
  return out;
}

/** dd/MMM/yy, dd-MMM-yy, ISO, an Excel serial, or a real Date. */
export function parseBookingDate(value: unknown): Date | null {
  const s = cellToString(value);
  const m = /^(\d{1,2})[/\-. ]([A-Za-z]{3,})[/\-. ](\d{2,4})$/.exec(s);
  if (m) {
    const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (month >= 0) {
      const year = Number(m[3]);
      return new Date(year < 100 ? 2000 + year : year, month, Number(m[1]));
    }
  }
  return cellToDate(value);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * A clock time as minutes from midnight.
 *
 * Trainers type these by hand: "8:30 AM", "04:00PM", "09:3O AM" with a letter
 * O for the zero, "12:30 AP" with the meridiem half-typed. Letters that can
 * only be digits are folded, and the meridiem is read from its first letter,
 * which is the only part of it anyone gets right.
 */
export function parseClock(value: unknown): number | null {
  let s = cellToString(value).toUpperCase().replace(/\s+/g, " ").trim();
  if (!s || s === "TBA" || s === "N/A") return null;
  // A time cell Excel stored as a fraction of a day.
  const asNumber = Number(s);
  if (Number.isFinite(asNumber) && asNumber > 0 && asNumber < 1) {
    return Math.round(asNumber * 24 * 60);
  }
  s = s.replace(/O/g, "0");
  const m = /^(\d{1,2})[:.]?(\d{2})?\s*([AP])?/.exec(s);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  if (hour > 23 || minute > 59) return null;
  if (m[3] === "P" && hour < 12) hour += 12;
  if (m[3] === "A" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

export const fmtClock = (min: number): string => {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
};

function languageOf(mode: string): Language {
  if (/ARAB/.test(mode)) return "arabic";
  if (/URDU/.test(mode)) return "urdu";
  if (/\bENG\b|ENGLISH|ENG ?[/L]/.test(mode)) return "english";
  return "other";
}

function modeOf(modeCell: string, venue: string): DeliveryMode {
  if (/ONLINE|VIRTUAL|TEAMS|ZOOM/.test(modeCell)) return "online";
  if (/CLASSROOM/.test(modeCell)) return "classroom";
  if (/OUTBOUND|YARD|SITE|BASE|RIG|AD\d+/.test(`${modeCell} ${venue}`)) return "site";
  return "classroom";
}

/** The office's own typos for one venue, which would otherwise read as three. */
const VENUE_FIXES: [RegExp, string][] = [
  [/^NEFT[- ]?OUTB[OU]*ND$/, "NEFT-OUTBOUND"],
  [/^NEFT[- ]OUTBOUND$/, "NEFT-OUTBOUND"],
];

function normaliseVenue(raw: string, fallback: string): string {
  let v = raw.toUpperCase().replace(/\s+/g, " ").trim();
  if (!v || v === "N/A" || v === "N / A" || /^CONFIRM/.test(v)) {
    // The venue column is blank, or holds a value that slipped a column. The
    // mode column is the only other thing that names a place — and when all it
    // says is which language the classroom runs in, the classroom is NEFT's.
    v = fallback.toUpperCase().replace(/\s+/g, " ").trim();
    if (!v || /CLASSROOM|ONLINE/.test(v)) v = "NEFT";
  }
  for (const [re, to] of VENUE_FIXES) if (re.test(v)) return to;
  return v || "UNSPECIFIED";
}

function poStatusOf(po: string, company: string): PoStatus {
  const p = po.toUpperCase().trim();
  if (/^NEFT$/.test(p) || /^NEFT\b/.test(company.toUpperCase())) return "not-required";
  if (!p || p === "N/A" || p === "N / A" || p === "-" || /^TBA$/.test(p)) return "not-received";
  if (/UNDER\s*PROC/.test(p) || /^PENDING/.test(p) || /^WAITING/.test(p)) return "under-process";
  return "received";
}

/** FNV-1a over the grouping key, so a booking keeps its id across re-imports. */
function hashId(key: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, "0");
}

export interface ImportResult {
  bookings: Booking[];
  courses: CourseRef[];
  /** Rows the parser could not place, quoted back with their row number. */
  warnings: string[];
  rowCount: number;
  /** The span the file actually covers, which is what the office should check first. */
  firstDate: string | null;
  lastDate: string | null;
}

/**
 * One booking is one company's group on one delivery. Two companies sitting in
 * the same classroom are two bookings — they each have their own PO and their
 * own confirmation — and the schedule joins them back into one class.
 */
function groupKey(
  b: Omit<Booking, "id" | "ref" | "participants" | "createdAt" | "updatedAt">,
): string {
  return [
    b.startDate,
    b.endDate,
    b.courseName.toUpperCase(),
    b.startMin,
    b.venue,
    b.company.toUpperCase(),
  ].join("|");
}

/** Same delivery, whoever is paying: this is what an instructor is booked for. */
export function classKey(b: Booking): string {
  return [b.startDate, b.endDate, b.courseName.toUpperCase(), b.startMin, b.venue].join("|");
}

export function parseBookingWorkbook(data: ArrayBuffer, now = new Date()): ImportResult {
  const wb = XLSX.read(data, { type: "array" });
  const sheetName =
    wb.SheetNames.find((n) => norm(n) === "booking") ??
    wb.SheetNames.find((n) => norm(n).includes("booking")) ??
    wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error("The workbook has no Booking sheet.");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    raw: true,
  });
  const headerIndex = rows.findIndex((r) => r.some((c) => norm(c) === "course name"));
  if (headerIndex < 0) {
    throw new Error("No 'COURSE NAME' heading found — is this the booking sheet?");
  }
  const cols = mapColumns(rows[headerIndex]);
  const warnings: string[] = [];
  const warned = new Set<string>();
  const warn = (message: string) => {
    const key = message.replace(/\(row \d+\)/, "");
    if (warned.has(key)) return;
    warned.add(key);
    warnings.push(message);
  };
  const today = toISODate(now);

  const groups = new Map<string, { booking: Booking; seen: Set<string> }>();
  let rowCount = 0;
  let first: string | null = null;
  let last: string | null = null;

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.some((c) => cellToString(c) !== "")) continue;
    const at = (f: Field) => (cols[f] >= 0 ? row[cols[f]] : undefined);
    const courseName = cellToString(at("course")).replace(/\s+/g, " ").trim();
    if (!courseName) continue;
    rowCount++;

    const startDate = parseBookingDate(at("from"));
    if (!startDate) {
      warn(`${courseName} (row ${i + 1}): no readable start date — the row is skipped.`);
      continue;
    }
    /*
     * The date range is the truth about how long a course runs — the
     * "Course Duration" column disagrees with it on 2% of rows and is the one
     * that is wrong. But a range that runs backwards, or one that a mistyped
     * year stretches over three years, is not a range at all; there the
     * stated duration counts the days out from the start instead, and the row
     * is reported so someone fixes the sheet.
     */
    const statedDays = Math.max(1, Math.round(cellToNumber(at("days"))) || 1);
    let endDate = parseBookingDate(at("to"));
    if (!endDate || endDate < startDate || diffDays(endDate, startDate) > 60) {
      if (endDate) {
        // One booking is many rows, so the same bad range would otherwise be
        // reported once per participant.
        warn(
          `${courseName} on ${toISODate(startDate)} (row ${i + 1}): the sheet ends it ` +
            `${toISODate(endDate)} — read as ${statedDays} day(s) from the start date instead.`,
        );
      }
      endDate = addDays(startDate, statedDays - 1);
    }
    const startISO = toISODate(startDate);
    const endISO = toISODate(endDate);

    const modeCell = cellToString(at("mode")).toUpperCase();
    const venueCell = cellToString(at("venue"));
    const cancelled = /CANCEL/.test(`${modeCell} ${venueCell.toUpperCase()}`);
    const venue = normaliseVenue(
      cancelled ? venueCell.replace(/CANCELLED/i, "") : venueCell,
      modeCell,
    );

    let startMin = parseClock(at("startTime"));
    let endMin = parseClock(at("endTime"));
    if (startMin === null) startMin = 8 * 60 + 30;
    if (endMin === null) endMin = startMin + 60 * Math.max(1, cellToNumber(at("hours")) || 6);
    // "12:30 AP" and "12:00 AM" are half-typed afternoons, not midnights: a
    // class that ends before it starts is a meridiem the trainer did not
    // finish, and adding the twelve hours back is what they meant.
    if (endMin <= startMin && endMin + 12 * 60 > startMin) endMin += 12 * 60;

    const sheetStatus = cellToString(at("status")).toUpperCase();
    let status: BookingStatus = /CONFIRM/.test(sheetStatus) ? "confirmed" : "tentative";
    if (cancelled) status = "cancelled";
    // Anything that already finished is history, not plan. Set once, at
    // import, so the schedule opens on the work ahead.
    else if (status === "confirmed" && endISO < today) status = "delivered";

    const company = cellToString(at("company")) || "—";
    const poNumber = cellToString(at("po"));

    const draft = {
      courseName,
      courseCode: cellToString(at("code")).toUpperCase().replace(/\s+/g, " "),
      startDate: startISO,
      endDate: endISO,
      startMin,
      endMin,
      hours: cellToNumber(at("hours")),
      venue,
      mode: modeOf(modeCell, venue),
      language: languageOf(modeCell),
      company,
      requestor: cellToString(at("requestor")),
      requestDate: (() => {
        const d = parseBookingDate(at("requestDate"));
        return d ? toISODate(d) : null;
      })(),
      poNumber,
      poStatus: poStatusOf(poNumber, company),
      status,
      instructorId: null as string | null,
      notes: (() => {
        const r = cellToString(at("remarks"));
        return !r || r.toUpperCase().replace(/\s/g, "") === "N/A" ? "" : r;
      })(),
    };

    const key = groupKey(draft);
    let entry = groups.get(key);
    if (!entry) {
      entry = {
        booking: {
          ...draft,
          id: hashId(key),
          ref: "",
          participants: [],
          createdAt: now.getTime(),
          updatedAt: now.getTime(),
        },
        seen: new Set(),
      };
      groups.set(key, entry);
    }

    const participant: Participant = {
      name: cellToString(at("participant")),
      position: cellToString(at("position")),
      idNo: cellToString(at("idNo")),
      gin: cellToString(at("gin")),
      email: cellToString(at("email")),
      mobile: cellToString(at("mobile")),
      rig: cellToString(at("rig")),
    };
    // Repeated names are kept: the office's sheet flags its own duplicates and
    // still counts them, and a seat booked twice is a seat billed twice until
    // someone says otherwise.
    if (participant.name) entry.booking.participants.push(participant);

    if (!first || startISO < first) first = startISO;
    if (!last || endISO > last) last = endISO;
  }

  const bookings = [...groups.values()]
    .map((g) => g.booking)
    .sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        a.startMin - b.startMin ||
        a.courseName.localeCompare(b.courseName),
    );
  bookings.forEach((b, i) => {
    b.ref = `NB-${String(i + 1).padStart(4, "0")}`;
  });

  return {
    bookings,
    courses: parseCourseTab(wb),
    warnings,
    rowCount,
    firstDate: first,
    lastDate: last,
  };
}

/** The CODE tab: the office's course list, with the code it quotes on a certificate. */
export function parseCourseTab(wb: XLSX.WorkBook): CourseRef[] {
  const name =
    wb.SheetNames.find((n) => norm(n) === "code") ??
    wb.SheetNames.find((n) => norm(n).includes("code"));
  if (!name) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
    header: 1,
    blankrows: false,
    raw: true,
  });
  const out = new Map<string, CourseRef>();
  for (const row of rows) {
    const cells = row.map(cellToString);
    const codeIndex = cells.findIndex((c) => /^NEFT[\s-]?[A-Z]{0,3}\s?\d+/i.test(c));
    if (codeIndex < 1) continue;
    const courseName = cells[codeIndex - 1]?.replace(/\s+/g, " ").trim();
    if (!courseName) continue;
    const code = cells[codeIndex].toUpperCase().replace(/\s+/g, " ").trim();
    const key = courseName.toUpperCase();
    if (!out.has(key))
      out.set(key, { name: courseName, code, location: cells[codeIndex + 2] ?? "" });
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}
