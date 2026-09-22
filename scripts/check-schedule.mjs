import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";

/**
 * The scheduling rules, checked against worked examples.
 *
 * These are the rules nobody can re-derive from the code six months later:
 * two companies in one classroom are one class and not a clash, a class that
 * ends before the next one starts is not a clash either, and an instructor is
 * never assigned over their own leave. They are asserted rather than
 * described, so changing a rule means changing a case here and saying why.
 *
 * Run with `npm run check:schedule`. The TypeScript is bundled through esbuild
 * — the repo has no test runner, and one check does not earn one.
 */

const root = path.resolve(import.meta.dirname, "..");
const dir = mkdtempSync(path.join(tmpdir(), "neft-check-"));
const entry = path.join(dir, "cases.ts");

writeFileSync(
  entry,
  `
import { toISODate } from "@/lib/dates";
import { autoAssign, buildClasses, findConflicts } from "@/lib/bookings/schedule";
import { parseClock, parseBookingDate } from "@/lib/bookings/parse";
import { knownLength } from "@/lib/bookings/courses";
import { dailySheetLines } from "@/lib/bookings/dailySheet";
import { WELLSHARP_HOURS } from "@/lib/config";
import type { Booking, Instructor, Leave } from "@/lib/bookings/types";

let seq = 0;
const failures: string[] = [];
const is = (what: string, got: unknown, want: unknown) => {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) failures.push(what + ": got " + a + ", wanted " + b);
};

const bk = (p: Partial<Booking>): Booking => ({
  id: "b" + ++seq, ref: "NB-" + seq, courseName: "H2S", courseCode: "NEFT 002",
  startDate: "2026-10-05", endDate: "2026-10-05", startMin: 510, endMin: 750, hours: 4,
  venue: "NEFT", room: "", mode: "classroom", language: "english", company: "SLB", requestor: "",
  requestDate: null, poNumber: "123", poStatus: "received", status: "confirmed",
  instructorId: null, participants: [], notes: "", createdAt: 0, updatedAt: 0, ...p,
});
const ins = (p: Partial<Instructor>): Instructor => ({
  id: "i1", name: "A", employeeNo: "", courses: [], languages: [], active: true, ...p,
});
const W = { from: "2026-10-01", to: "2026-10-31" };
const codes = (bs: Booking[], people: Instructor[], leaves: Leave[] = []) =>
  findConflicts(buildClasses(bs), people, leaves, W, "2026-10-01")
    .map((c) => c.severity + ":" + c.code)
    .sort();

// A booking is one company's group; a class is what runs. Two companies on the
// same course, hour and venue are one class, so one instructor covers both.
is("two companies make one class",
  buildClasses([bk({ instructorId: "i1" }), bk({ company: "ADES", instructorId: "i1" })]).length, 1);
is("one instructor over both is not a clash",
  codes([bk({ instructorId: "i1" }), bk({ company: "ADES", instructorId: "i1" })], [ins({})]), []);
is("a class split between two instructors is caught",
  codes([bk({ instructorId: "i1" }), bk({ company: "ADES", instructorId: "i2" })],
    [ins({}), ins({ id: "i2", name: "B" })]), ["error:unassigned"]);

// Two genuinely different classes at the same hour cannot share an instructor,
// but a morning and an afternoon class can.
is("overlapping classes clash",
  codes([bk({ instructorId: "i1" }), bk({ courseName: "PTW", instructorId: "i1" })], [ins({})]),
  ["error:double-booked"]);
is("back to back does not clash",
  codes([bk({ instructorId: "i1" }), bk({ courseName: "PTW", startMin: 810, endMin: 990, instructorId: "i1" })],
    [ins({})]), []);

// An empty course list means "any course", but an instructor restricted only
// by language is still ruled out by the language.
is("language restriction alone is still checked",
  codes([bk({ instructorId: "i1", language: "arabic" })], [ins({ languages: ["english"] })]),
  ["warning:language"]);
is("a course they are not approved for is checked",
  codes([bk({ instructorId: "i1" })], [ins({ courses: ["T-BOSIET"] })]), ["warning:not-qualified"]);

// Leave beats everything: it is reported when assigned over, and auto-assign
// will not reach for it even when the roster has nobody else.
const leave: Leave[] = [{ id: "l", instructorId: "i1", from: "2026-10-07", to: "2026-10-09", kind: "vacation", note: "" }];
is("leave over any day of a class is reported",
  codes([bk({ instructorId: "i1", endDate: "2026-10-08" })], [ins({})], leave), ["error:on-leave"]);
is("auto-assign leaves a class open rather than booking over leave",
  autoAssign(buildClasses([bk({ startDate: "2026-10-07", endDate: "2026-10-07" })]), [ins({})], leave, W).filled, 0);

// Cancelled and delivered work is history; it is not planned and not checked.
is("cancelled and delivered classes are out of the plan",
  codes([bk({ status: "cancelled" }), bk({ courseName: "PTW", status: "delivered" })], [ins({})]), []);

// A confirmed booking with no purchase order behind it is a thing to chase,
// not a thing that stops the class running.
is("a missing PO is a warning",
  codes([bk({ instructorId: "i1", poStatus: "not-received", poNumber: "" })], [ins({})]),
  ["warning:po-missing"]);

// The sheet that goes out by email: nine columns, blocked by the hour and the
// kind of delivery, with the day of a multi-day course spelled out.
{
  const people = [ins({ name: "A" }), ins({ id: "i2", name: "B" })];
  const lines = dailySheetLines(
    buildClasses([
      bk({ courseName: "H2S", instructorId: "i1", room: "5" }),
      bk({ courseName: "PTW", instructorId: "i2", startMin: 810, endMin: 990, room: "5" }),
      bk({ courseName: "RIGGER 3", venue: "ADES YARD", startMin: 450, endMin: 690,
           startDate: "2026-10-03", endDate: "2026-10-07" }),
    ]),
    people,
    "2026-10-05",
  );
  is("a blank line separates each hour and kind of delivery",
    lines.map((l) => (l ? l.title : "--")),
    ["RIGGER 3 ENGLISH (DAY 3)", "--", "H2S ENGLISH", "--", "PTW ENGLISH"]);
  is("NEFT's own room is the classroom", lines[2] && lines[2].classroom, "5");
  is("off site, the sheet names the place instead", lines[0] && lines[0].classroom, "ADES YARD");
  is("anything that is not NEFT's classroom is outbound",
    lines.filter(Boolean).map((l) => l.session), ["OUTBOUND", "CLASSROOM", "CLASSROOM"]);
  is("an unassigned class leaves the instructor blank for the sheet to shout about",
    lines[0] && lines[0].instructor, "");
}
// A room is a resource like a trainer: two classes cannot share one.
is("two classes in one room clash",
  codes([bk({ courseName: "H2S", instructorId: "i1", room: "5" }),
         bk({ courseName: "PTW", instructorId: "i2", room: "5" })],
    [ins({}), ins({ id: "i2", name: "B" })]),
  ["error:room-clash"]);
is("the same room at different hours does not",
  codes([bk({ courseName: "H2S", instructorId: "i1", room: "5" }),
         bk({ courseName: "PTW", instructorId: "i2", room: "5", startMin: 810, endMin: 990 })],
    [ins({}), ins({ id: "i2", name: "B" })]),
  []);
is("a room nobody has filled in is not a clash",
  codes([bk({ courseName: "H2S", instructorId: "i1" }), bk({ courseName: "PTW", instructorId: "i2" })],
    [ins({}), ins({ id: "i2", name: "B" })]),
  []);

// The office's WellSharp lengths: OGO, Supervisor and Driller run five days,
// Coiled Tubing, Wireline and Workover three, and a retake is the exam alone.
// They are matched on the whole name because the catalogue is full of near
// misses that are different courses entirely.
is("driller level is five days", knownLength("DRILLER LEVEL 3")?.days, 5);
is("supervisory level is five days", knownLength("DRILLING SUPERVISORY LEVEL 4")?.days, 5);
is("a LEEVEL typo still resolves", knownLength("DRILLING SUPERVISORY LEEVEL 4")?.days, 5);
is("stuck pipe bolted on is still the supervisory course",
  knownLength("DRILLING SUPERVISORY LEVEL 4 + STUCK PIPE")?.days, 5);
is("OGO is five days", knownLength("OGO")?.days, 5);
is("completion OGO is the same course", knownLength("COMPLETION (OGO)")?.days, 5);
is("coiled tubing is three days", knownLength("COILED TUBING")?.days, 3);
is("wireline is three days", knownLength("WIRELINES")?.days, 3);
is("workover is three days", knownLength("WORKOVER")?.days, 3);
is("a retake is the exam alone", knownLength("DRILLER LEVEL 3 (Retake Exam)")?.days, 1);
is("so is a retest", knownLength("DRILLER LEVEL 3 (retest)")?.days, 1);
is("a scaffolding supervisor is not a supervisory level",
  knownLength("SCAFFOLDING SUPERVISOR"), null);
is("a wireline applications course is not the WellSharp one",
  knownLength("SLICK LINE/WIRELINE APPLICATIONS"), null);
is("an advanced workover workshop is not the WellSharp one",
  knownLength("ADVANCED WORKOVER OPERATIONS WORKSHOP"), null);
is("a class booked short of its accreditation is flagged",
  codes([bk({ courseName: "DRILLER LEVEL 3", instructorId: "i1", endDate: "2026-10-07" })], [ins({})]),
  ["warning:course-length"]);
is("a class booked to its accreditation is not",
  codes([bk({ courseName: "DRILLER LEVEL 3", instructorId: "i1", endDate: "2026-10-09" })], [ins({})]),
  []);

// The dashboard's hours table and the accredited lengths are one table now.
// They were two, and drifted a day apart on all six courses, which understated
// WellSharp teaching hours by about 30% for as long as nobody compared them.
for (const row of WELLSHARP_HOURS) {
  const accredited = knownLength(row.courseName);
  if (!accredited) continue;
  is("WELLSHARP_HOURS agrees with the accreditation for " + row.courseName,
    { days: row.days, totalHours: row.totalHours },
    { days: accredited.days, totalHours: accredited.days * row.hoursPerDay });
}
is("the six the office named are 5/5/5/3/3/3",
  ["DRILLING DRILLER LEVEL", "DRILLING SUPERVISORY LEVEL", "WELL SERVICING OGO",
   "WELL SERVICING COILED TUBING", "WELL SERVICING WIRELINE", "WELL SERVICING WORKOVER"]
    .map((n) => WELLSHARP_HOURS.find((h) => h.courseName === "IADC - WELLSHARP " + n)?.days),
  [5, 5, 5, 3, 3, 3]);

// The sheet's own spellings. The letter O for a zero and a half-typed meridiem
// are what trainers actually type, and both have to read as a real time.
is("8:30 AM", parseClock("8:30 AM"), 510);
is("a letter O for a zero", parseClock("09:3O AM"), 570);
is("no space before the meridiem", parseClock("04:00PM"), 960);
is("a half-typed meridiem takes its first letter", parseClock("12:30 AP"), 30);
is("no time at all", parseClock("TBA"), null);
is("dd/MMM/yy", toISODate(parseBookingDate("31/Dec/25")!), "2025-12-31");

if (failures.length) {
  console.error("Scheduling rules broken:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("Scheduling rules: all cases hold.");
`,
);

const out = path.join(dir, "cases.cjs");
await build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: out,
  logLevel: "warning",
  alias: { "@": path.join(root, "src") },
});

// The cases assert as they load and exit non-zero on the first broken rule,
// so there is nothing to call — importing the bundle is running it.
await import(`file://${out}`);
rmSync(dir, { recursive: true, force: true });
