import { addDays, diffDays, fromISODate, toISODate } from "@/lib/dates";
import { knownLength } from "./courses";
import { classKey } from "./parse";
import type { Booking, Conflict, Instructor, Leave, Language } from "./types";

/**
 * Turning the register into a plan.
 *
 * A booking belongs to one company; a class is what actually runs. Two
 * companies sitting in the same room on the same course at the same hour are
 * two bookings and one class, and an instructor is booked for the class — so
 * teaching both is not a clash, which is the whole reason the two are kept
 * apart.
 */

export interface ClassSession {
  key: string;
  bookings: Booking[];
  courseName: string;
  courseCode: string;
  startDate: string;
  endDate: string;
  startMin: number;
  endMin: number;
  venue: string;
  language: Language;
  /** Every calendar day the class occupies, start to end inclusive. */
  days: string[];
  seats: number;
  /** Set when every booking in the class agrees; null while any is unassigned. */
  instructorId: string | null;
  /** False once every booking in it is cancelled or already delivered. */
  active: boolean;
  /** True while any booking in it is still only a request. */
  hasTentative: boolean;
}

export function datesBetween(startISO: string, endISO: string): string[] {
  const start = fromISODate(startISO);
  const span = Math.max(0, diffDays(fromISODate(endISO), start));
  // A mistyped range is clamped by the parser; this guard is for a booking
  // typed into the app afterwards.
  const n = Math.min(span, 365);
  return Array.from({ length: n + 1 }, (_, i) => toISODate(addDays(start, i)));
}

export function buildClasses(bookings: Booking[]): ClassSession[] {
  const byKey = new Map<string, Booking[]>();
  for (const b of bookings) {
    const key = classKey(b);
    const list = byKey.get(key);
    if (list) list.push(b);
    else byKey.set(key, [b]);
  }

  const out: ClassSession[] = [];
  for (const [key, list] of byKey) {
    const head = list[0];
    const assigned = new Set(list.map((b) => b.instructorId));
    out.push({
      key,
      bookings: list,
      courseName: head.courseName,
      courseCode: head.courseCode || list.find((b) => b.courseCode)?.courseCode || "",
      startDate: head.startDate,
      endDate: list.reduce((max, b) => (b.endDate > max ? b.endDate : max), head.endDate),
      startMin: head.startMin,
      endMin: list.reduce((max, b) => Math.max(max, b.endMin), head.endMin),
      venue: head.venue,
      language: head.language,
      days: datesBetween(
        head.startDate,
        list.reduce((max, b) => (b.endDate > max ? b.endDate : max), head.endDate),
      ),
      seats: list.reduce((n, b) => n + (b.status === "cancelled" ? 0 : b.participants.length), 0),
      instructorId: assigned.size === 1 ? head.instructorId : null,
      active: list.some((b) => b.status === "confirmed" || b.status === "tentative"),
      hasTentative: list.some((b) => b.status === "tentative"),
    });
  }
  return out.sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      a.startMin - b.startMin ||
      a.courseName.localeCompare(b.courseName),
  );
}

export function classesOnDay(classes: ClassSession[], dayISO: string): ClassSession[] {
  return classes
    .filter((c) => c.startDate <= dayISO && dayISO <= c.endDate)
    .sort((a, b) => a.startMin - b.startMin || a.courseName.localeCompare(b.courseName));
}

export function onLeave(leaves: Leave[], instructorId: string, dayISO: string): Leave | undefined {
  return leaves.find((l) => l.instructorId === instructorId && l.from <= dayISO && dayISO <= l.to);
}

/**
 * Whether one instructor may take one class.
 *
 * An empty course list or an empty language list means "anything": an office
 * that has not filled the approval matrix in yet still gets a schedule, and
 * fills the matrix in when it wants the schedule to respect it.
 */
export function qualifies(instructor: Instructor, cls: ClassSession): boolean {
  if (instructor.courses.length) {
    const want = cls.courseName.toUpperCase().trim();
    const code = cls.courseCode.toUpperCase().trim();
    const ok = instructor.courses.some((c) => {
      const t = c.toUpperCase().trim();
      return t === want || (code !== "" && t === code);
    });
    if (!ok) return false;
  }
  if (instructor.languages.length && cls.language !== "other") {
    if (!instructor.languages.includes(cls.language)) return false;
  }
  return true;
}

const overlaps = (a: ClassSession, b: ClassSession) =>
  a.startMin < b.endMin && b.startMin < a.endMin && a.days.some((d) => b.days.includes(d));

export interface PlanWindow {
  from: string;
  to: string;
}

const inWindow = (cls: ClassSession, w: PlanWindow) =>
  cls.startDate <= w.to && cls.endDate >= w.from;

/**
 * Everything wrong with the plan in one window, worst first.
 *
 * Errors are things that cannot happen as written — nobody assigned, one
 * person in two rooms, a trainer teaching while on leave. Warnings are things
 * that can happen but should not — an approval nobody has checked, a
 * confirmed course with no purchase order behind it, a class next week that
 * the customer has still not confirmed.
 */
export function findConflicts(
  classes: ClassSession[],
  instructors: Instructor[],
  leaves: Leave[],
  window: PlanWindow,
  today = toISODate(new Date()),
): Conflict[] {
  const byId = new Map(instructors.map((i) => [i.id, i]));
  const scope = classes.filter((c) => c.active && inWindow(c, window));
  const out: Conflict[] = [];

  for (const cls of scope) {
    const where = `${cls.courseName} · ${cls.venue}`;
    if (!cls.instructorId) {
      const split = new Set(cls.bookings.map((b) => b.instructorId)).size > 1;
      out.push({
        code: "unassigned",
        severity:
          cls.hasTentative && !cls.bookings.some((b) => b.status === "confirmed")
            ? "warning"
            : "error",
        date: cls.startDate,
        bookingIds: cls.bookings.map((b) => b.id),
        instructorId: null,
        title: split ? "Class split between instructors" : "No instructor assigned",
        detail: split
          ? `${where} has more than one instructor across its bookings. One class, one instructor.`
          : `${where} runs with nobody assigned to teach it.`,
      });
      continue;
    }

    const instructor = byId.get(cls.instructorId);
    if (!instructor) {
      out.push({
        code: "unassigned",
        severity: "error",
        date: cls.startDate,
        bookingIds: cls.bookings.map((b) => b.id),
        instructorId: null,
        title: "Assigned to someone who is no longer on the roster",
        detail: `${where} points at an instructor who has been removed.`,
      });
      continue;
    }

    for (const day of cls.days) {
      const leave = onLeave(leaves, instructor.id, day);
      if (leave) {
        out.push({
          code: "on-leave",
          severity: "error",
          date: day,
          bookingIds: cls.bookings.map((b) => b.id),
          instructorId: instructor.id,
          title: `${instructor.name} is on leave`,
          detail: `${where} on ${day}, while ${instructor.name} is on leave ${leave.from} to ${leave.to}.`,
        });
        break;
      }
    }

    if (!instructor.active) {
      out.push({
        code: "not-qualified",
        severity: "warning",
        date: cls.startDate,
        bookingIds: cls.bookings.map((b) => b.id),
        instructorId: instructor.id,
        title: `${instructor.name} is marked inactive`,
        detail: `${where} is assigned to an instructor who is no longer taking classes.`,
      });
    } else if (!qualifies(instructor, cls)) {
      /*
       * Either list can be the one that rules them out, and an instructor with
       * no course list at all can still be ruled out by the language, so what
       * failed is worked out rather than assumed.
       */
      const languageOnly =
        !instructor.courses.length ||
        instructor.courses.some((c) => {
          const t = c.toUpperCase().trim();
          return (
            t === cls.courseName.toUpperCase().trim() ||
            (cls.courseCode !== "" && t === cls.courseCode.toUpperCase().trim())
          );
        });
      out.push({
        code: languageOnly ? "language" : "not-qualified",
        severity: "warning",
        date: cls.startDate,
        bookingIds: cls.bookings.map((b) => b.id),
        instructorId: instructor.id,
        title: languageOnly
          ? `${instructor.name} is not listed for ${cls.language}`
          : `${instructor.name} is not approved for this course`,
        detail: `${where}. Add it to ${instructor.name}'s list if the approval exists.`,
      });
    }
  }

  /*
   * A course with an accredited length runs for that many days or it does not
   * certify, so a class whose dates say otherwise is worth a look before the
   * seats are sold — not an error, because the office books exam-only sittings
   * and the odd extended class on purpose.
   */
  for (const cls of scope) {
    const accredited = knownLength(cls.courseName);
    if (!accredited || cls.days.length === accredited.days) continue;
    out.push({
      code: "course-length",
      severity: "warning",
      date: cls.startDate,
      bookingIds: cls.bookings.map((b) => b.id),
      instructorId: cls.instructorId,
      title: `${cls.courseName} is booked over ${cls.days.length} day(s)`,
      detail:
        `${accredited.label} is accredited at ${accredited.days} day(s)` +
        `${accredited.retake ? " for a retake" : ""}, and this class runs ${cls.days.length}.`,
    });
  }

  /*
   * One person in two places. Grouped by instructor before pairing, so a
   * year-wide window compares each trainer's own dozen classes rather than
   * every class against every other.
   */
  const byInstructor = new Map<string, ClassSession[]>();
  for (const cls of scope) {
    if (!cls.instructorId) continue;
    const list = byInstructor.get(cls.instructorId);
    if (list) list.push(cls);
    else byInstructor.set(cls.instructorId, [cls]);
  }
  for (const assigned of byInstructor.values()) {
    for (let i = 0; i < assigned.length; i++) {
      for (let j = i + 1; j < assigned.length; j++) {
        const a = assigned[i];
        const b = assigned[j];
        if (!overlaps(a, b)) continue;
        const day = a.days.find((d) => b.days.includes(d)) ?? a.startDate;
        const name = byId.get(a.instructorId!)?.name ?? "This instructor";
        out.push({
          code: "double-booked",
          severity: "error",
          date: day,
          bookingIds: [...a.bookings.map((x) => x.id), ...b.bookings.map((x) => x.id)],
          instructorId: a.instructorId,
          title: `${name} is booked twice`,
          detail: `On ${day}: ${a.courseName} at ${a.venue} and ${b.courseName} at ${b.venue} overlap.`,
        });
      }
    }
  }

  // Commercial cover, read per booking because the PO is the company's, not the class's.
  const soon = toISODate(addDays(fromISODate(today), 14));
  for (const cls of scope) {
    for (const b of cls.bookings) {
      if (
        b.status === "confirmed" &&
        (b.poStatus === "not-received" || b.poStatus === "under-process")
      ) {
        out.push({
          code: "po-missing",
          severity: "warning",
          date: b.startDate,
          bookingIds: [b.id],
          instructorId: cls.instructorId,
          title: `${b.company}: no purchase order yet`,
          detail: `${b.ref} ${b.courseName} on ${b.startDate} is confirmed with the PO still ${
            b.poStatus === "under-process" ? "under process" : "not received"
          }.`,
        });
      }
      if (b.status === "tentative" && b.startDate <= soon && b.startDate >= today) {
        out.push({
          code: "unconfirmed",
          severity: "warning",
          date: b.startDate,
          bookingIds: [b.id],
          instructorId: cls.instructorId,
          title: `${b.company}: not confirmed and starting soon`,
          detail: `${b.ref} ${b.courseName} starts ${b.startDate} and is still only a request.`,
        });
      }
    }
  }

  const rank = { error: 0, warning: 1 } as const;
  return out.sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] ||
      a.date.localeCompare(b.date) ||
      a.title.localeCompare(b.title),
  );
}

/** Days an instructor is committed to inside a window, for balancing the load. */
export function instructorLoad(classes: ClassSession[], window: PlanWindow): Map<string, number> {
  const load = new Map<string, number>();
  for (const cls of classes) {
    if (!cls.instructorId || !cls.active) continue;
    for (const day of cls.days) {
      if (day < window.from || day > window.to) continue;
      load.set(cls.instructorId, (load.get(cls.instructorId) ?? 0) + 1);
    }
  }
  return load;
}

export interface AssignResult {
  /** bookingId → instructorId, ready to write back over the register. */
  assignments: Record<string, string>;
  filled: number;
  /** Classes nothing could take, with the reason, so the gap is visible. */
  unfilled: { cls: ClassSession; reason: string }[];
}

/**
 * Fill the empty classes in a window.
 *
 * The hardest class goes first — the one with the fewest people who could
 * teach it — because a class with one candidate loses it if an easier class
 * takes that person first. Among the candidates, the one carrying the fewest
 * days in the window takes it, so the month spreads rather than piling onto
 * whoever sorts first. Nothing already assigned is moved.
 */
export function autoAssign(
  classes: ClassSession[],
  instructors: Instructor[],
  leaves: Leave[],
  window: PlanWindow,
): AssignResult {
  const roster = instructors.filter((i) => i.active);
  const load = instructorLoad(classes, window);
  // Worked on copies: the caller keeps its derived class list, and only the
  // returned assignments are written back over the register.
  const work = classes.map((c) => ({ ...c }));
  // A working copy of what each instructor is holding, so a class assigned in
  // this pass blocks the next one.
  const held = new Map<string, ClassSession[]>();
  for (const cls of work) {
    if (!cls.instructorId) continue;
    const list = held.get(cls.instructorId);
    if (list) list.push(cls);
    else held.set(cls.instructorId, [cls]);
  }

  const open = work.filter((c) => c.active && !c.instructorId && inWindow(c, window));
  const free = (instructor: Instructor, cls: ClassSession) => {
    if (cls.days.some((d) => onLeave(leaves, instructor.id, d))) return false;
    return !(held.get(instructor.id) ?? []).some((other) => overlaps(other, cls));
  };
  const candidates = (cls: ClassSession) => roster.filter((i) => qualifies(i, cls) && free(i, cls));

  const assignments: Record<string, string> = {};
  const unfilled: AssignResult["unfilled"] = [];
  const queue = [...open];

  while (queue.length) {
    // Most constrained first, re-measured each round because every assignment
    // changes who is still free.
    let best = 0;
    let bestCount = Infinity;
    let bestPool: Instructor[] = [];
    for (let i = 0; i < queue.length; i++) {
      const pool = candidates(queue[i]);
      if (pool.length < bestCount) {
        best = i;
        bestCount = pool.length;
        bestPool = pool;
        if (bestCount === 0) break;
      }
    }
    const cls = queue.splice(best, 1)[0];

    if (!bestPool.length) {
      const anyQualified = roster.some((i) => qualifies(i, cls));
      unfilled.push({
        cls,
        reason: !roster.length
          ? "No instructors on the roster yet."
          : anyQualified
            ? "Everyone approved for it is already teaching, or on leave, that day."
            : "Nobody on the roster is approved for this course and language.",
      });
      continue;
    }

    const pick = bestPool.sort(
      (a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0) || a.name.localeCompare(b.name),
    )[0];
    cls.instructorId = pick.id;
    for (const b of cls.bookings) assignments[b.id] = pick.id;
    const list = held.get(pick.id);
    if (list) list.push(cls);
    else held.set(pick.id, [cls]);
    const billed = cls.days.filter((d) => d >= window.from && d <= window.to).length;
    load.set(pick.id, (load.get(pick.id) ?? 0) + billed);
  }

  return { assignments, filled: Object.keys(assignments).length, unfilled };
}
