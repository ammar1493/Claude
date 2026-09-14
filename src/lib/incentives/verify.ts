import { CourseCatalog } from "./courses";
import { matchInstructor } from "./names";
import { bandForSite, describeSite, SiteTable, siteLabel } from "./sites";
import { coverageFor, cardsFor, describeTimecard, parseIsoDate, siteForTimecard, spanDays } from "./timecards";
import {
  addDays,
  buildRecordDays,
  buildSessionIndex,
  dayKey,
  sessionCandidates,
  type ParsedRecordSheet,
} from "./record";
import { KIND_LABELS, SECTION_LABELS } from "./timesheet";
import type {
  ClaimKind,
  ClaimSection,
  CourseDuration,
  SiteDistance,
  Timecard,
  TimecardCover,
  ClaimRow,
  DayReport,
  Finding,
  IncentiveSheet,
  RecordDay,
  Severity,
  SheetReport,
  TeachingBlock,
} from "./types";

const FRIDAY = 5;
const SATURDAY = 6;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

const fmtDays = (n: number) =>
  n === 0 ? "nothing" : n === 0.5 ? "half a day" : n === 1 ? "a full day" : `${n} days`;

const sar = (n: number) => `${Math.round(n).toLocaleString("en-US")} SAR`;

function describeBlock(b: TeachingBlock): string {
  const names = b.courseNames.join(" + ") || "(unnamed course)";
  const dur = b.duration ? b.duration.label : "not in the course list";
  const where = b.locations.join(", ") || "no location";
  const sessions = b.sessionNos.join(", ");
  return `${names} — ${dur} · ${b.participants} participant${b.participants === 1 ? "" : "s"} · ${where}${sessions ? ` · ${sessions}` : ""}`;
}

function evidenceFor(day: RecordDay | null): string[] {
  if (!day) return [];
  return [
    ...day.blocks.map(describeBlock),
    ...day.continuations.map((b) => `${describeBlock(b)} (continues from an earlier day)`),
  ];
}

/* ------------------------------------------------------------------ *
 * Which rate line a given day should have used
 * ------------------------------------------------------------------ */

function expectedKinds(weekday: number): { half: ClaimKind; full: ClaimKind } {
  if (weekday === FRIDAY) return { half: "friHalf", full: "friFull" };
  if (weekday === SATURDAY) return { half: "satHalf", full: "satFull" };
  return { half: "halfAM", full: "full" };
}

type DayCategory = "weekday" | "friday" | "saturday";

/**
 * Which block of rate lines a day belongs to. The morning and afternoon
 * half-day lines are one category — a trainer may tick either or both — so
 * only Friday and Saturday are distinguished here.
 */
function categoryOfKind(kind: ClaimKind): DayCategory | null {
  if (kind === "satHalf" || kind === "satFull") return "saturday";
  if (kind === "friHalf" || kind === "friFull") return "friday";
  if (kind === "halfAM" || kind === "halfPM" || kind === "full") return "weekday";
  return null;
}

function categoryOfDate(weekday: number): DayCategory {
  if (weekday === FRIDAY) return "friday";
  if (weekday === SATURDAY) return "saturday";
  return "weekday";
}

/** Rate the sheet itself prints for a line, so corrections quote the trainer's own table. */
function rateFor(sheet: IncentiveSheet, kind: ClaimKind): number | null {
  const row = sheet.rows.find((r) => r.section === "near" && r.kind === kind && r.rate > 0);
  return row ? row.rate : null;
}

/**
 * The daily rate a distance band pays, from the sheet's own table.
 *
 * Friday has its own line in both bands, so a Friday inside a distance band is
 * priced from that rather than the ordinary daily rate.
 */
function bandDayRate(sheet: IncentiveSheet, band: ClaimSection, weekday?: number): number | null {
  const rows = sheet.rows.filter((r) => r.section === band && r.rate > 0);
  if (weekday === FRIDAY) {
    const friday = rows.find((r) => r.kind === "friday");
    if (friday) return friday.rate;
  }
  const daily = rows.find((r) => r.kind === "daily");
  return daily ? daily.rate : null;
}

function suggestedSarFor(sheet: IncentiveSheet, weekday: number, days: number): number | null {
  if (days <= 0) return 0;
  const { half, full } = expectedKinds(weekday);
  if (days <= 0.5) return rateFor(sheet, half);
  const fullRate = rateFor(sheet, full);
  if (fullRate === null) return null;
  if (days <= 1) return fullRate;
  return fullRate * days;
}

/* ------------------------------------------------------------------ */

let counter = 0;
function makeFinding(f: Omit<Finding, "id">): Finding {
  counter += 1;
  return { id: `f${counter}`, ...f };
}

export interface VerifyOptions {
  /** Year and month the claim grid's day numbers belong to. */
  year: number;
  month: number;
  /** Distances the office has set, which decide the rate band per site. */
  sites: SiteTable;
  /** Signed assessor timecards, the evidence for days that issue no papers. */
  timecards: Timecard[];
}

export function verifySheet(
  sheet: IncentiveSheet,
  record: ParsedRecordSheet,
  catalog: CourseCatalog,
  options?: Partial<VerifyOptions>,
): SheetReport {
  const year = options?.year ?? record.year;
  const month = options?.month ?? record.month;
  const sites = options?.sites ?? new SiteTable([]);
  const timecards = options?.timecards ?? [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const findings: Finding[] = [];

  for (const w of sheet.parseWarnings) {
    findings.push(
      makeFinding({
        severity: "warning",
        code: "sheet",
        title: "Sheet is incomplete",
        why: w,
        suggestion: null,
        sheet: "timesheet",
        cells: [],
        date: null,
        claimedSar: null,
        suggestedSar: null,
        delta: null,
        evidence: [],
      }),
    );
  }

  /* ---------------- the month the sheet is for ---------------- */

  /*
   * The Month cell is free text and gets everything: "August", "Augeust",
   * "AUG", "01 AUG- 31 AUG", and dates typed as 1/8/2026 that Excel reads as
   * 8 January. It is only a label — the claim grid's day numbers are read
   * against the record sheet's month either way — but a label pointing at the
   * wrong month is worth saying out loud.
   */
  const expectedMonthName = new Date(year, month, 1).toLocaleDateString("en-GB", { month: "long" });
  if (sheet.monthLabel) {
    const label = sheet.monthLabel.toLowerCase();
    const stem = expectedMonthName.slice(0, 3).toLowerCase();
    const namesAnotherMonth = MONTH_NAMES.some(
      (m, i) => i !== month && new RegExp(`\\b${m.slice(0, 3)}`, "i").test(label) && !label.includes(stem),
    );
    if (namesAnotherMonth) {
      findings.push(
        makeFinding({
          severity: "warning",
          code: "month",
          title: `Sheet is labelled for a different month`,
          why: `The Month cell reads "${sheet.monthLabel}", but this is being checked against ${record.monthLabel}'s record sheet. If the month was typed as a date, Excel has read it the American way round — write the month out, e.g. "${expectedMonthName} ${year}".`,
          suggestion: `Write "${expectedMonthName} ${year}".`,
          sheet: "timesheet",
          cells: [],
          date: null,
          claimedSar: null,
          suggestedSar: null,
          delta: null,
          evidence: [],
        }),
      );
    }
  }

  /* ---------------- instructor identity ---------------- */

  const match = sheet.instructorName
    ? matchInstructor(sheet.instructorName, record.instructors)
    : null;
  const matchedInstructor = match?.name ?? null;

  if (sheet.instructorName && !matchedInstructor) {
    findings.push(
      makeFinding({
        severity: "warning",
        code: "instructor",
        title: "Instructor not found in the record sheet",
        why: `"${sheet.instructorName}" does not match any instructor in ${record.monthLabel}'s record sheet, so none of this sheet's days could be checked against a delivered session. Correct the spelling on the sheet, or confirm the sessions were filed under a different name.`,
        suggestion: null,
        sheet: "timesheet",
        cells: [],
        date: null,
        claimedSar: null,
        suggestedSar: null,
        delta: null,
        evidence: [],
      }),
    );
  } else if (matchedInstructor && matchedInstructor !== sheet.instructorName) {
    findings.push(
      makeFinding({
        severity: "info",
        code: "instructor",
        title: "Name spelled differently in the record sheet",
        why: `The sheet says "${sheet.instructorName}"; the record sheet files these sessions under "${matchedInstructor}". Matched on the name, but worth aligning the two so future months join automatically.`,
        suggestion: null,
        sheet: "timesheet",
        cells: [],
        date: null,
        claimedSar: null,
        suggestedSar: null,
        delta: null,
        evidence: [],
      }),
    );
  }

  const recordDays = matchedInstructor
    ? buildRecordDays(record.rows, matchedInstructor, catalog)
    : new Map<string, RecordDay>();
  const sessionIndex = buildSessionIndex(record.rows);

  /* ---------------- timecards ---------------- */

  const myNames = [sheet.instructorName, matchedInstructor ?? ""].filter(Boolean);
  const myCards = cardsFor(timecards, myNames);
  const coverage = coverageFor(myCards, myNames);

  for (const card of myCards) {
    const span = spanDays(card);
    if (span <= 0) {
      findings.push(
        makeFinding({
          severity: "warning",
          code: "timecard",
          title: "Timecard has no usable dates",
          why: `The timecard for ${card.unit || card.activity} gives "${card.start}" to "${card.end}", which is not a date range. It cannot support any day until the dates are fixed.`,
          suggestion: "Set the card's start and end dates.",
          sheet: "timesheet",
          cells: [],
          date: null,
          claimedSar: null,
          suggestedSar: null,
          delta: null,
          evidence: [describeTimecard(card)],
        }),
      );
      continue;
    }
    if (card.totalDays !== null && Math.abs(card.totalDays - span) > 0.001) {
      findings.push(
        makeFinding({
          severity: "warning",
          code: "timecard",
          title: "Timecard days disagree with its dates",
          why: `The timecard for ${card.unit || card.activity} states ${card.totalDays} day${card.totalDays === 1 ? "" : "s"}, but ${card.start} to ${card.end} is ${span} day${span === 1 ? "" : "s"} counting both ends. Check which the client signed for.`,
          suggestion: `Either ${span} days, or correct the dates.`,
          sheet: "timesheet",
          cells: [],
          date: null,
          claimedSar: null,
          suggestedSar: null,
          delta: null,
          evidence: [describeTimecard(card)],
        }),
      );
    }
  }

  /*
   * Which band a day belongs in.
   *
   * The evidence names a place; the site table turns a place into a distance
   * and a distance into a band. A rig takes the top band whatever its
   * kilometres, and a day whose site the office has not priced yet returns
   * null — the verifier is told to set the distance rather than shown a guess.
   */
  const verificationSitesByDate = new Map<string, string[]>();
  for (const entry of sheet.verification) {
    if (!entry.date || !entry.location) continue;
    const key = dayKey(entry.date);
    const list = verificationSitesByDate.get(key) ?? [];
    if (!list.includes(entry.location)) list.push(entry.location);
    verificationSitesByDate.set(key, list);
  }

  const BAND_RANK: Record<string, number> = { near: 0, mid: 1, far: 2 };

  function bandOfDay(
    key: string,
    rec: RecordDay | null,
    covers: TimecardCover[],
  ): { band: ClaimSection | null; sites: string[]; unpriced: string[] } {
    const named: { name: string; site: SiteDistance | null }[] = [];
    for (const name of rec?.locations ?? []) named.push({ name, site: sites.get(name) });
    for (const cover of covers) {
      const site = siteForTimecard(cover.timecard);
      named.push({ name: site.name, site });
    }
    // A trainer's own log is the only clue on a day the record sheet leaves
    // blank, so it is consulted last rather than not at all.
    if (!named.length) {
      for (const name of verificationSitesByDate.get(key) ?? []) {
        named.push({ name, site: sites.get(name) });
      }
    }

    const seen = [...new Set(named.map((n) => siteLabel(n.name)).filter(Boolean))];
    const unpriced: string[] = [];
    let band: ClaimSection | null = null;
    for (const { name, site } of named) {
      const b = bandForSite(site);
      if (!b) {
        const label = siteLabel(name);
        if (label && !unpriced.includes(label)) unpriced.push(label);
        continue;
      }
      if (band === null || BAND_RANK[b] > BAND_RANK[band]) band = b;
    }
    // One unpriced site can only raise the band, so a day that already reads
    // "far" is settled; anything lower is still open.
    if (unpriced.length && band !== "far") return { band: null, sites: seen, unpriced };
    return { band, sites: seen, unpriced };
  }

  /* ---------------- collect the claims by date ---------------- */

  interface Claim {
    row: ClaimRow;
    cell: string;
    day: number;
    nextMonth: boolean;
  }
  const claims: Claim[] = [];
  const cellByRowDay = new Map<string, string>();
  for (const row of sheet.rows) {
    row.days.forEach((rawDay, i) => {
      const nextMonth = rawDay > 100;
      const day = nextMonth ? rawDay - 100 : rawDay;
      const cell = row.cells[i] ?? "";
      cellByRowDay.set(`${row.rowIndex}:${rawDay}`, cell);
      claims.push({ row, cell, day, nextMonth });
    });
  }

  const dayReports = new Map<string, DayReport>();
  const dateOf = (c: Claim) =>
    c.nextMonth ? new Date(year, month + 1, c.day) : new Date(year, month, c.day);

  for (const c of claims) {
    if (!c.nextMonth && c.day > daysInMonth) {
      findings.push(
        makeFinding({
          severity: "error",
          code: "calendar",
          title: `Day ${c.day} does not exist in ${record.monthLabel}`,
          why: `${record.monthLabel} has ${daysInMonth} days, so the tick in ${c.cell} on "${c.row.label.trim()}" cannot be a working day. Remove it.`,
          suggestion: "Remove the tick.",
          sheet: "timesheet",
          cells: [c.cell],
          date: null,
          claimedSar: c.row.rate,
          suggestedSar: 0,
          delta: -c.row.rate,
          evidence: [],
        }),
      );
      continue;
    }
    if (c.nextMonth) {
      findings.push(
        makeFinding({
          severity: "warning",
          code: "calendar",
          title: "Claim sits in the next month's column",
          why: `${c.cell} is the trailing column for the 1st of the following month, not a day of ${record.monthLabel}. Move it onto next month's sheet, or onto the right day of this one.`,
          suggestion: "Move the tick to the correct month.",
          sheet: "timesheet",
          cells: [c.cell],
          date: dateOf(c),
          claimedSar: c.row.rate,
          suggestedSar: 0,
          delta: -c.row.rate,
          evidence: [],
        }),
      );
      continue;
    }

    const date = dateOf(c);
    const key = dayKey(date);
    let report = dayReports.get(key);
    if (!report) {
      const rec = recordDays.get(key) ?? null;
      const covers = coverage.get(key) ?? [];
      const { band, sites: daySites } = bandOfDay(key, rec, covers);
      report = {
        key,
        date,
        weekday: date.getDay(),
        claimedDays: 0,
        claimedSar: 0,
        recordDays: rec?.load ?? 0,
        rawRecordDays: rec?.rawLoad ?? 0,
        claims: [],
        record: rec,
        covers,
        expectedBand: band,
        sites: daySites,
        findingIds: [],
      };
      dayReports.set(key, report);
    }
    report.claims.push({ row: c.row, cell: c.cell });
    report.claimedDays += c.row.dayValue;
    report.claimedSar += c.row.rate;
  }

  const addDayFinding = (report: DayReport, f: Omit<Finding, "id">) => {
    const finding = makeFinding(f);
    findings.push(finding);
    report.findingIds.push(finding.id);
    return finding;
  };

  /* ---------------- per-day rules ---------------- */

  for (const report of [...dayReports.values()].sort((a, b) => a.key.localeCompare(b.key))) {
    const { date, weekday, record: rec, covers } = report;
    const teachingClaims = report.claims.filter((c) => c.row.dayValue > 0);
    const travelClaims = report.claims.filter((c) => c.row.kind === "travel");
    const bandClaims = report.claims.filter((c) => c.row.section === "mid" || c.row.section === "far");
    const nearClaims = report.claims.filter((c) => c.row.section === "near");
    const evidence = [
      ...evidenceFor(rec),
      ...covers.map((c) => `Timecard: ${describeTimecard(c.timecard)}`),
    ];
    // A signed timecard buys the whole day, so a covered date is a full day of
    // supported work whatever the record sheet does or does not hold.
    const covered = covers.length > 0;
    const supportedDays = Math.max(rec?.load ?? 0, covered ? 1 : 0);

    /* Rate line vs the actual day of the week. */
    const wantCategory = categoryOfDate(weekday);
    for (const { row, cell } of nearClaims) {
      const lineCategory = categoryOfKind(row.kind);
      if (lineCategory === null || lineCategory === wantCategory) continue;

      const rightKind = row.dayValue <= 0.5 ? expectedKinds(weekday).half : expectedKinds(weekday).full;
      const rightRate = rateFor(sheet, rightKind);
      const dayName = date.toLocaleDateString("en-GB", { weekday: "long" });
      const why =
        lineCategory === "weekday"
          ? `${fmtDate(date)} is a ${dayName}, which has its own rate line — "${KIND_LABELS[row.kind]}" is the ordinary working-day rate.`
          : `${fmtDate(date)} is a ${dayName}, not a ${lineCategory === "saturday" ? "Saturday" : "Friday"}, so the ${sar(row.rate)} ${lineCategory} rate does not apply.`;
      addDayFinding(report, {
        severity: "error",
        code: "weekday",
        title: `Wrong rate line for a ${dayName}`,
        why: `${why} Move this tick to "${KIND_LABELS[rightKind]}"${rightRate !== null ? ` at ${sar(rightRate)}` : ""}.`,
        suggestion: `Move to "${KIND_LABELS[rightKind]}".`,
        sheet: "timesheet",
        cells: [cell],
        date,
        claimedSar: row.rate,
        suggestedSar: rightRate,
        delta: rightRate === null ? null : rightRate - row.rate,
        evidence,
      });
    }

    /* More than one working day claimed for one date. */
    if (report.claimedDays > 1.001) {
      addDayFinding(report, {
        severity: "error",
        code: "over-day",
        title: `${fmtDays(report.claimedDays)} claimed for one date`,
        why: `${fmtDate(date)} carries ${report.claims.length} ticks worth ${fmtDays(report.claimedDays)} in total (${report.claims.map((c) => `${KIND_LABELS[c.row.kind]} ${c.cell}`).join(", ")}). A single date cannot pay more than one working day — drop the extra ticks.`,
        suggestion: "Keep one day's worth of ticks for this date.",
        sheet: "timesheet",
        cells: report.claims.map((c) => c.cell),
        date,
        claimedSar: report.claimedSar,
        suggestedSar: suggestedSarFor(sheet, weekday, Math.min(1, report.recordDays || 1)),
        delta: null,
        evidence,
      });
    }

    /* Same date claimed under two distance bands. */
    const sections = new Set(report.claims.map((c) => c.row.section).filter((s) => s !== "perdiem"));
    if (sections.size > 1) {
      addDayFinding(report, {
        severity: "error",
        code: "band",
        title: "One date claimed under two distance bands",
        why: `${fmtDate(date)} appears under ${[...sections].map((s) => SECTION_LABELS[s]).join(" and ")}. A day is paid from one band only — keep the band that matches where the training actually ran.`,
        suggestion: "Keep a single band for this date.",
        sheet: "timesheet",
        cells: report.claims.map((c) => c.cell),
        date,
        claimedSar: report.claimedSar,
        suggestedSar: null,
        delta: null,
        evidence,
      });
    }

    /*
     * A trainer cannot be on a rig and in the classroom on the same day, and
     * here both say so. Which record is wrong is not something the sheets can
     * settle, so the day is reported and left unpriced rather than resolved
     * one way by the tool.
     */
    if (covered && rec && (rec.blocks.length > 0 || rec.continuations.length > 0)) {
      const sessions = rec.blocks.length
        ? `${rec.blocks.length} session${rec.blocks.length === 1 ? "" : "s"} delivered that day`
        : `a multi-day course still running that day (${rec.continuations.map((b) => b.courseNames.join(" + ")).join("; ")})`;
      addDayFinding(report, {
        severity: "error",
        code: "timecard-conflict",
        title: "Timecard and record sheet both claim this day",
        why: `${fmtDate(date)} is covered by a signed timecard (${covers.map((c) => `${c.timecard.activity} at ${c.timecard.unit}`).join("; ")}), but the record sheet also has ${sessions} at ${rec.locations.join(", ") || "an unnamed site"}. The trainer cannot be in both places — settle which before this day is paid.`,
        suggestion: "Confirm the timecard dates or correct the record sheet.",
        sheet: "timesheet",
        cells: teachingClaims.map((c) => c.cell),
        date,
        claimedSar: report.claimedSar,
        suggestedSar: null,
        delta: null,
        evidence,
      });
    }

    /* Nothing at all behind a claimed day. */
    if (!covered && (!rec || rec.load === 0)) {
      const onlyTravel = teachingClaims.length > 0 && teachingClaims.every((c) => c.row.kind === "travel");
      const severity: Severity = onlyTravel ? "warning" : "error";
      const cells = teachingClaims.map((c) => c.cell);
      if (cells.length) {
        addDayFinding(report, {
          severity,
          code: "no-record",
          title: onlyTravel ? "Travel day with no record entry" : "No session recorded on this day",
          why: onlyTravel
            ? `${fmtDate(date)} is claimed as a travelling/standby day. Travel issues no certificates, so the record sheet cannot confirm it — attach the trip approval before paying it.`
            : `The record sheet has no session for ${matchedInstructor ?? sheet.instructorName} on ${fmtDate(date)}, so there is nothing to support ${sar(report.claimedSar)} of claim. Remove the tick, or have the missing session filed in the record sheet first.`,
          suggestion: onlyTravel ? "Attach supporting approval." : "Remove the claim for this date.",
          sheet: "timesheet",
          cells,
          date,
          claimedSar: report.claimedSar,
          suggestedSar: onlyTravel ? null : 0,
          delta: onlyTravel ? null : -report.claimedSar,
          evidence,
        });
      }
      continue;
    }

    /*
     * The band comes first: whether a day was paid at the right rate decides
     * whether the "no half-day line in this band" note applies at all. A day
     * claimed in the wrong band gets the band correction and nothing else —
     * two notes pointing opposite ways help nobody.
     */
    const claimedBand = teachingClaims.length
      ? (teachingClaims[0].row.section as ClaimSection)
      : null;
    const { band: expectedBand, unpriced } = bandOfDay(report.key, rec, covers);
    report.expectedBand = expectedBand;
    const bandIsWrong = Boolean(
      teachingClaims.length && expectedBand && claimedBand && expectedBand !== claimedBand,
    );

    /* The headline check: claimed days against delivered days. */
    const claimedTeaching = teachingClaims.reduce((s, c) => s + c.row.dayValue, 0);
    // The distance bands pay one flat day rate with no half-day line, so a
    // half-day course at a rig still books the whole day. Comparing day
    // fractions there would flag every rig trip.
    const bandOnly = teachingClaims.length > 0 && nearClaims.length === 0 && bandClaims.length > 0;
    if (bandIsWrong) {
      /*
       * Left to the band finding below, which already names the right band and
       * its rate. Adding a day-value correction on top would subtract the same
       * riyals twice.
       */
    } else if (bandOnly && supportedDays < 1) {
      addDayFinding(report, {
        severity: "info",
        code: "band-day",
        title: "Distance day paid in full for a half-day course",
        why: `${fmtDate(date)} is claimed at the ${SECTION_LABELS[bandClaims[0].row.section]} day rate of ${sar(bandClaims[0].row.rate)}, and the record sheet shows ${fmtDays(supportedDays)} of teaching (${(rec?.blocks ?? []).map((b) => b.courseNames.join(" + ")).join("; ")}) at ${report.sites.join(", ") || "an unnamed site"}. The band has no half-day line, so this is right if the trip took the day — no change needed unless it did not.`,
        suggestion: null,
        sheet: "timesheet",
        cells: teachingClaims.map((c) => c.cell),
        date,
        claimedSar: report.claimedSar,
        suggestedSar: null,
        delta: null,
        evidence,
      });
    } else if (claimedTeaching > supportedDays + 0.001 && travelClaims.length === 0) {
      const blocks = rec?.blocks ?? [];
      const suggested = suggestedSarFor(sheet, weekday, supportedDays);
      const claimedSar = teachingClaims.reduce((s, c) => s + c.row.rate, 0);
      const courseList = blocks
        .map((b) => `${b.courseNames.join(" + ")} (${b.duration ? b.duration.label : "not in the course list"})`)
        .join("; ");
      addDayFinding(report, {
        severity: "error",
        code: "over-claim",
        title: `${fmtDays(claimedTeaching)} claimed, ${fmtDays(supportedDays)} delivered`,
        why:
          `On ${fmtDate(date)} the record sheet shows ${blocks.length === 1 ? "one session" : `${blocks.length} sessions`}: ${courseList}. ` +
          `By the course list that is ${fmtDays(supportedDays)}, but the sheet claims ${fmtDays(claimedTeaching)}. ` +
          `Change it to "${KIND_LABELS[supportedDays <= 0.5 ? expectedKinds(weekday).half : expectedKinds(weekday).full]}"` +
          (suggested !== null ? `, ${sar(suggested)} instead of ${sar(claimedSar)}.` : "."),
        suggestion: `Claim ${fmtDays(supportedDays)} for this date.`,
        sheet: "timesheet",
        cells: teachingClaims.map((c) => c.cell),
        date,
        claimedSar,
        suggestedSar: suggested,
        delta: suggested === null ? null : suggested - claimedSar,
        evidence,
      });
    } else if (!bandOnly && !covered && rec && claimedTeaching < rec.load - 0.001) {
      const suggested = suggestedSarFor(sheet, weekday, rec.load);
      const claimedSar = teachingClaims.reduce((s, c) => s + c.row.rate, 0);
      addDayFinding(report, {
        severity: "info",
        code: "under-claim",
        title: `${fmtDays(rec.load)} delivered, ${fmtDays(claimedTeaching)} claimed`,
        why: `The record sheet shows ${fmtDays(rec.load)} of teaching on ${fmtDate(date)} (${rec.blocks.map((b) => b.courseNames.join(" + ")).join("; ")}) but the sheet claims only ${fmtDays(claimedTeaching)}. Under-claimed — confirm with the trainer before paying the lower figure.`,
        suggestion: suggested === null ? null : `Claim ${fmtDays(rec.load)}, ${sar(suggested)}.`,
        sheet: "timesheet",
        cells: teachingClaims.map((c) => c.cell),
        date,
        claimedSar,
        suggestedSar: suggested,
        delta: suggested === null ? null : suggested - claimedSar,
        evidence,
      });
    }

    /*
     * Distance band against where the day actually happened.
     *
     * Once the office has given a site its kilometres the band is arithmetic,
     * so the correction is priced from the sheet's own rate table: what the
     * right band's line pays, against what was claimed. A site still without a
     * distance is reported as exactly that — the one thing the tool cannot
     * work out on its own.
     */
    if (bandIsWrong && expectedBand && claimedBand) {
      const claimedSar = teachingClaims.reduce((s, c) => s + c.row.rate, 0);
      const suggested =
        expectedBand === "near"
          ? suggestedSarFor(sheet, weekday, supportedDays)
          : bandDayRate(sheet, expectedBand, weekday);
      const where = report.sites.map((n) => describeSite(sites.get(n) ?? { name: n, kind: "unknown", km: null, note: "" })).join(", ");
      addDayFinding(report, {
        severity: "error",
        code: "band",
        title:
          expectedBand === "near"
            ? "Distance rate claimed for a day inside the 150 km band"
            : `Day belongs in the ${SECTION_LABELS[expectedBand]} band`,
        why:
          `${fmtDate(date)} is claimed under "${SECTION_LABELS[claimedBand]}" at ${sar(claimedSar)}, but the day ran at ${where || "an unnamed site"}, which the distance table puts in the ${SECTION_LABELS[expectedBand]} band. ` +
          (suggested !== null
            ? `Move it to that band — ${sar(suggested)} instead of ${sar(claimedSar)}.`
            : `Move it to that band.`),
        suggestion: `Move to the ${SECTION_LABELS[expectedBand]} band.`,
        sheet: "timesheet",
        cells: teachingClaims.map((c) => c.cell),
        date,
        claimedSar,
        suggestedSar: suggested,
        delta: suggested === null ? null : suggested - claimedSar,
        evidence,
      });
    } else if (teachingClaims.length && !expectedBand && unpriced.length) {
      addDayFinding(report, {
        severity: "warning",
        code: "site-unknown",
        title: `How far is ${unpriced[0]}?`,
        why: `${fmtDate(date)} ran at ${unpriced.join(", ")}, which is not the NEFT centre, so it is an outbound course — but the distance table has no kilometres for it, and the band decides the rate. Set the distance (or mark it a rig or well) and this day prices itself.`,
        suggestion: `Set a distance for ${unpriced.join(", ")}.`,
        sheet: "timesheet",
        cells: teachingClaims.map((c) => c.cell),
        date,
        claimedSar: teachingClaims.reduce((s, c) => s + c.row.rate, 0),
        suggestedSar: null,
        delta: null,
        evidence,
      });
    }

    /* Travel claimed on a day that also taught. */
    if (travelClaims.length && rec && rec.blocks.length) {
      addDayFinding(report, {
        severity: "warning",
        code: "travel",
        title: "Travel day also taught",
        why: `${fmtDate(date)} is claimed as a travelling/standby day, but the record sheet shows ${rec.blocks.length} session${rec.blocks.length === 1 ? "" : "s"} delivered that day. A day is either travel or teaching — pick one.`,
        suggestion: "Claim either the travel rate or the teaching rate.",
        sheet: "timesheet",
        cells: travelClaims.map((c) => c.cell),
        date,
        claimedSar: travelClaims.reduce((s, c) => s + c.row.rate, 0),
        suggestedSar: null,
        delta: null,
        evidence,
      });
    }

    /* The record itself says more than a day happened. */
    if (rec && rec.rawLoad > 1.001) {
      addDayFinding(report, {
        severity: "warning",
        code: "record-conflict",
        title: "Record sheet shows more than a full day",
        why: `${fmtDate(date)} carries ${rec.blocks.map((b) => `${b.courseNames.join(" + ")} (${b.duration?.label ?? "unlisted"})`).join(" and ")} — ${fmtDays(rec.rawLoad)} by the course list, which will not fit in one day. Either one of those courses ran short of its listed duration, or the record sheet has the wrong date on one of them. Resolved here as one day.`,
        suggestion: null,
        sheet: "timesheet",
        cells: report.claims.map((c) => c.cell),
        date,
        claimedSar: null,
        suggestedSar: null,
        delta: null,
        evidence,
      });
    }
  }

  /* ---------------- days delivered but never claimed ---------------- */

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month, daysInMonth);

  /*
   * Days the evidence carries but the sheet never claimed.
   *
   * These get a day report of their own as well as a finding, so the
   * day-by-day ledger shows the whole month — what was taught and not claimed
   * next to what was claimed — rather than only the dates the trainer ticked.
   */
  const addEvidenceDay = (key: string, date: Date) => {
    const rec = recordDays.get(key) ?? null;
    const covers = coverage.get(key) ?? [];
    const { band, sites: daySites } = bandOfDay(key, rec, covers);
    const report: DayReport = {
      key,
      date,
      weekday: date.getDay(),
      claimedDays: 0,
      claimedSar: 0,
      recordDays: rec?.load ?? 0,
      rawRecordDays: rec?.rawLoad ?? 0,
      claims: [],
      record: rec,
      covers,
      expectedBand: band,
      sites: daySites,
      findingIds: [],
    };
    dayReports.set(key, report);
    return report;
  };

  /* A signed timecard day with nothing claimed against it. */
  for (const [key, covers] of coverage) {
    if (dayReports.has(key)) continue;
    const date = parseIsoDate(key);
    if (!date || date < monthStart || date > monthEnd) continue;
    const dayReport = addEvidenceDay(key, date);
    const card = covers[0].timecard;
    const band = bandForSite(siteForTimecard(card));
    const rate = band && band !== "near" ? bandDayRate(sheet, band, date.getDay()) : null;
    findings.push(
      makeFinding({
        severity: "info",
        code: "timecard-not-claimed",
        title: "Timecard day not claimed",
        why: `A signed timecard covers ${fmtDate(date)} (${covers.map((c) => `${c.timecard.activity} at ${c.timecard.unit}`).join("; ")}) but the sheet claims nothing for it. Check whether the trainer missed the day.`,
        suggestion: rate === null ? null : `Add a ${SECTION_LABELS[band!]} day, ${sar(rate)}.`,
        sheet: "timesheet",
        cells: [],
        date,
        claimedSar: 0,
        suggestedSar: rate,
        delta: null,
        evidence: covers.map((c) => `Timecard: ${describeTimecard(c.timecard)}`),
      }),
    );
    dayReport.findingIds.push(findings[findings.length - 1].id);
  }

  for (const [key, rec] of recordDays) {
    if (dayReports.has(key)) continue;
    if (rec.date < monthStart || rec.date > monthEnd) continue;
    if (rec.load === 0) continue;
    const dayReport = addEvidenceDay(key, rec.date);
    findings.push(
      makeFinding({
        severity: "info",
        code: "not-claimed",
        title: "Delivered but not claimed",
        why: `The record sheet shows ${fmtDays(rec.load)} of teaching on ${fmtDate(rec.date)} (${[...rec.blocks, ...rec.continuations].map((b) => b.courseNames.join(" + ")).join("; ")}) with nothing claimed for it. Check whether the trainer missed a day.`,
        suggestion: `Add ${fmtDays(rec.load)} for ${fmtDate(rec.date)} if it is owed.`,
        sheet: "timesheet",
        cells: [],
        date: rec.date,
        claimedSar: 0,
        suggestedSar: suggestedSarFor(sheet, rec.date.getDay(), rec.load),
        delta: null,
        evidence: evidenceFor(rec),
      }),
    );
    dayReport.findingIds.push(findings[findings.length - 1].id);
  }

  /* ---------------- allowances and admin lines ---------------- */

  const distanceDayCount = claims.filter(
    (c) => (c.row.section === "mid" || c.row.section === "far") && c.row.dayValue > 0,
  ).length;
  for (const row of sheet.rows) {
    if (row.section === "perdiem" && row.days.length > distanceDayCount) {
      findings.push(
        makeFinding({
          severity: "warning",
          code: "perdiem",
          title: "More per-diem days than distance days",
          why: `"${row.label.trim()}" is claimed on ${row.days.length} day${row.days.length === 1 ? "" : "s"}, but only ${distanceDayCount} day${distanceDayCount === 1 ? " is" : "s are"} claimed under a distance band. Per diem only applies to trainings over 150 km — trim it to the days that qualify.`,
          suggestion: `Claim at most ${distanceDayCount} per-diem day${distanceDayCount === 1 ? "" : "s"}.`,
          sheet: "timesheet",
          cells: row.cells,
          date: null,
          claimedSar: row.days.length * row.rate,
          suggestedSar: distanceDayCount * row.rate,
          delta: (distanceDayCount - row.days.length) * row.rate,
          evidence: [],
        }),
      );
    }
    if (row.section === "admin" && row.days.length > 0) {
      findings.push(
        makeFinding({
          severity: "warning",
          code: "admin",
          title: "Admin rate used on an instructor sheet",
          why: `"${row.label.trim()}" belongs to the Admins and Coordinators block, not to an instructor's teaching days. Confirm the role before paying it.`,
          suggestion: "Move to an instructor line, or confirm the admin role.",
          sheet: "timesheet",
          cells: row.cells,
          date: null,
          claimedSar: row.days.length * row.rate,
          suggestedSar: null,
          delta: null,
          evidence: [],
        }),
      );
    }
  }

  /* ---------------- arithmetic ---------------- */

  let computedTotal = 0;
  for (const row of sheet.rows) {
    const expected = row.days.length * row.rate;
    computedTotal += expected;
    if (row.statedTotal !== null && Math.abs(row.statedTotal - expected) > 0.5) {
      findings.push(
        makeFinding({
          severity: "error",
          code: "arithmetic",
          title: "Row total does not match its ticks",
          why: `"${row.label.trim()}" has ${row.days.length} tick${row.days.length === 1 ? "" : "s"} at ${sar(row.rate)}, which is ${sar(expected)}, but ${row.totalCell} reads ${sar(row.statedTotal)}. The formula has been overtyped or is pointing at the wrong range.`,
          suggestion: `Set ${row.totalCell} to ${sar(expected)}.`,
          sheet: "timesheet",
          cells: [row.totalCell, ...row.cells],
          date: null,
          claimedSar: row.statedTotal,
          suggestedSar: expected,
          delta: expected - row.statedTotal,
          evidence: [],
        }),
      );
    }
  }

  if (sheet.statedGrandTotal !== null && Math.abs(sheet.statedGrandTotal - computedTotal) > 0.5) {
    findings.push(
      makeFinding({
        severity: "error",
        code: "arithmetic",
        title: "Grand total does not match the rows",
        why: `The rate lines add up to ${sar(computedTotal)}, but the total in ${sheet.grandTotalCell} reads ${sar(sheet.statedGrandTotal)}.`,
        suggestion: `Set ${sheet.grandTotalCell} to ${sar(computedTotal)}.`,
        sheet: "timesheet",
        cells: sheet.grandTotalCell ? [sheet.grandTotalCell] : [],
        date: null,
        claimedSar: sheet.statedGrandTotal,
        suggestedSar: computedTotal,
        delta: computedTotal - sheet.statedGrandTotal,
        evidence: [],
      }),
    );
  }

  /* ---------------- the trainer's verification log ---------------- */

  if (!sheet.verification.length && claims.length) {
    findings.push(
      makeFinding({
        severity: "warning",
        code: "verification",
        title: "Verification log is empty",
        why: `The claim grid has ${claims.length} tick${claims.length === 1 ? "" : "s"} but the verification tab lists no courses. The log is what the claim is checked against — it has to be filled in, one line per session, with the date, course, location, session number and duration.`,
        suggestion: "Fill in the verification tab.",
        sheet: "verification",
        cells: [],
        date: null,
        claimedSar: null,
        suggestedSar: null,
        delta: null,
        evidence: [],
      }),
    );
  }

  const verificationByDate = new Map<string, { days: number; readable: boolean }>();
  const unknownCourses: { row: number; written: string }[] = [];
  const ambiguousCourses: { row: number; written: string; options: CourseDuration[] }[] = [];
  for (const entry of sheet.verification) {
    const cells = [`A${entry.rowIndex}`, `B${entry.rowIndex}`, `E${entry.rowIndex}`];

    if (!entry.date) {
      findings.push(
        makeFinding({
          severity: "warning",
          code: "verification",
          title: "Verification line has no usable date",
          why: `Row ${entry.rowIndex} of the verification log reads "${entry.rawDate || "(blank)"}" in the date column, which is not a date. Write it as a real date so the line can be matched to the record sheet.`,
          suggestion: "Write a proper date.",
          sheet: "verification",
          cells: [`A${entry.rowIndex}`],
          date: null,
          claimedSar: null,
          suggestedSar: null,
          delta: null,
          evidence: [],
        }),
      );
    } else if (entry.date.getFullYear() !== year || entry.date.getMonth() !== month) {
      // Excel reads 10/08/2026 as 8 October unless the sheet is set to en-GB,
      // and these sheets are typed the other way round, so a date that lands in
      // the right month once day and month are swapped is almost always that.
      const swapped = new Date(entry.date.getFullYear(), entry.date.getDate() - 1, entry.date.getMonth() + 1);
      const looksSwapped =
        entry.date.getDate() <= 12 && swapped.getMonth() === month && swapped.getFullYear() === year;
      findings.push(
        makeFinding({
          severity: "error",
          code: "verification",
          title: "Verification line is outside the month",
          why:
            `Row ${entry.rowIndex} is dated ${entry.date.toLocaleDateString("en-GB")}, which is not in ${record.monthLabel}. A claim for ${record.monthLabel} cannot rest on it.` +
            (looksSwapped
              ? ` Written the other way round it is ${swapped.toLocaleDateString("en-GB")}, which is in the month — Excel reads a typed date as month-first unless told otherwise, so that is most likely what happened.`
              : " Correct the date, or move the line to the right month's sheet."),
          suggestion: looksSwapped
            ? `Re-date to ${swapped.toLocaleDateString("en-GB")}.`
            : `Re-date to ${record.monthLabel}, or remove.`,
          sheet: "verification",
          cells: [`A${entry.rowIndex}`],
          date: entry.date,
          claimedSar: null,
          suggestedSar: null,
          delta: null,
          evidence: [],
        }),
      );
    } else {
      const k = dayKey(entry.date);
      const acc = verificationByDate.get(k) ?? { days: 0, readable: true };
      acc.days += entry.durationDays ?? 0;
      // "Business Trip" in the duration column already has its own finding;
      // it would otherwise make the log look emptier than the grid.
      if (entry.durationDays === null) acc.readable = false;
      verificationByDate.set(k, acc);
    }

    /* Duration written against what the course list says. */
    const resolved = entry.courseName
      ? catalog.lookupDetailed(entry.courseName)
      : { course: null, candidates: [], ambiguous: false };
    const course = resolved.course;
    if (entry.courseName && resolved.ambiguous) {
      ambiguousCourses.push({ row: entry.rowIndex, written: entry.courseName, options: resolved.candidates });
    } else if (entry.courseName && !course) {
      unknownCourses.push({ row: entry.rowIndex, written: entry.courseName });
    }
    if (entry.courseName && entry.durationLabel) {
      if (entry.durationDays === null) {
        findings.push(
          makeFinding({
            severity: "warning",
            code: "verification",
            title: "Duration is not one of the allowed values",
            why: `Row ${entry.rowIndex} gives the duration of "${entry.courseName}" as "${entry.durationLabel}". Use the wording the course list uses — Half Day, 1 Full Day, or the number of days — so it can be checked.`,
            suggestion: course ? `Write "${course.label}".` : "Use Half Day / Full Day.",
            sheet: "verification",
            cells: [`E${entry.rowIndex}`],
            date: entry.date,
            claimedSar: null,
            suggestedSar: null,
            delta: null,
            evidence: course ? [`Course list: ${course.name} — ${course.label}`] : [],
          }),
        );
      } else if (course && Math.abs(Math.min(course.days, 1) - Math.min(entry.durationDays, 1)) > 0.001) {
        const over = entry.durationDays > course.days;
        findings.push(
          makeFinding({
            severity: over ? "error" : "warning",
            code: "duration",
            title: over
              ? `"${entry.courseName}" is a ${course.label.toLowerCase()} course`
              : `"${entry.courseName}" is listed as ${course.label.toLowerCase()}`,
            why: `Row ${entry.rowIndex} claims ${entry.durationLabel} for ${entry.courseName}, but the course list has ${course.name} as ${course.label}. ${
              over
                ? `A ${course.label.toLowerCase()} course cannot be claimed as ${entry.durationLabel.toLowerCase()} — correct the line to ${course.label} and bring the claim grid down with it.`
                : `Either the session ran short of its listed duration and the reason belongs on the line, or the duration is mistyped.`
            }`,
            suggestion: `Write "${course.label}".`,
            sheet: "verification",
            cells,
            date: entry.date,
            claimedSar: null,
            suggestedSar: null,
            delta: null,
            evidence: [`Course list: ${course.name} — ${course.label}`],
          }),
        );
      }
    }

    /* Session number against the record sheet. */
    const keys = sessionCandidates(entry.sessionNo);
    const key = keys[0] ?? "";
    if (entry.courseName && !key) {
      findings.push(
        makeFinding({
          severity: "warning",
          code: "session",
          title: "Session number missing or incomplete",
          why: `Row ${entry.rowIndex} gives "${entry.sessionNo || "(blank)"}" as the session number for ${entry.courseName}. Without the full number the line cannot be matched to the record sheet — write it out in full, e.g. SEN-2026-03328.`,
          suggestion: "Write the full session number.",
          sheet: "verification",
          cells: [`D${entry.rowIndex}`],
          date: entry.date,
          claimedSar: null,
          suggestedSar: null,
          delta: null,
          evidence: [],
        }),
      );
    } else if (key) {
      const hits = keys.flatMap((k) => sessionIndex.get(k) ?? []);
      if (!hits.length) {
        findings.push(
          makeFinding({
            severity: "warning",
            code: "session",
            title: "Session number is not in the record sheet",
            why: `Row ${entry.rowIndex} quotes session ${entry.sessionNo}, which does not appear anywhere in ${record.monthLabel}'s record sheet. Either the number is mistyped or the session was never filed — fix it before the day is paid.`,
            suggestion: "Correct the session number.",
            sheet: "verification",
            cells: [`D${entry.rowIndex}`],
            date: entry.date,
            claimedSar: null,
            suggestedSar: null,
            delta: null,
            evidence: [],
          }),
        );
      } else {
        const mine = matchedInstructor ? hits.filter((h) => h.instructorName === matchedInstructor) : hits;
        if (matchedInstructor && !mine.length) {
          const others = [...new Set(hits.map((h) => h.instructorName))].join(", ");
          findings.push(
            makeFinding({
              severity: "error",
              code: "session",
              title: "Session belongs to another instructor",
              why: `Row ${entry.rowIndex} claims session ${entry.sessionNo}, but the record sheet has it against ${others}, not ${matchedInstructor}. Remove the line, or have the record sheet corrected if the session really was taught here.`,
              suggestion: "Remove the line or correct the record sheet.",
              sheet: "verification",
              cells: [`D${entry.rowIndex}`],
              date: entry.date,
              claimedSar: null,
              suggestedSar: null,
              delta: null,
              evidence: hits.slice(0, 4).map((h) => `${h.sessionNo} · ${h.courseName} · ${h.instructorName} · ${h.date.toLocaleDateString("en-GB")}`),
            }),
          );
        } else if (entry.date && mine.length) {
          const recordedDate = mine[0].date;
          if (dayKey(recordedDate) !== dayKey(entry.date)) {
            findings.push(
              makeFinding({
                severity: "warning",
                code: "session",
                title: "Session is recorded on a different date",
                why: `Row ${entry.rowIndex} dates session ${entry.sessionNo} to ${entry.date.toLocaleDateString("en-GB")}, but the record sheet issued it on ${recordedDate.toLocaleDateString("en-GB")}. The claim should follow the date the session actually ran.`,
                suggestion: `Re-date the line to ${recordedDate.toLocaleDateString("en-GB")}.`,
                sheet: "verification",
                cells: [`A${entry.rowIndex}`, `D${entry.rowIndex}`],
                date: entry.date,
                claimedSar: null,
                suggestedSar: null,
                delta: null,
                evidence: mine.slice(0, 4).map((h) => `${h.sessionNo} · ${h.courseName} · ${h.date.toLocaleDateString("en-GB")} · ${h.location}`),
              }),
            );
          }
        }
      }
    }

  }

  /* One line per sheet rather than per row: short-hand course names are the
     rule on these logs, and forty copies of the same note buries everything
     else. */
  if (unknownCourses.length) {
    const names = [...new Set(unknownCourses.map((u) => u.written))];
    findings.push(
      makeFinding({
        severity: "info",
        code: "course",
        title: `${names.length} course name${names.length === 1 ? "" : "s"} not in the course list`,
        why: `The verification log writes ${names.map((n) => `"${n}"`).join(", ")}. None matches a course in the duration list, so those lines could not be checked for half day against full day. Write each course as the list spells it — or have the list extended if the course is genuinely new.`,
        suggestion: "Use the course list's spelling.",
        sheet: "verification",
        cells: unknownCourses.map((u) => `B${u.row}`),
        date: null,
        claimedSar: null,
        suggestedSar: null,
        delta: null,
        evidence: [],
      }),
    );
  }

  for (const a of ambiguousCourses) {
    const spread = [...new Set(a.options.map((c) => c.label))];
    findings.push(
      makeFinding({
        severity: "warning",
        code: "course",
        title: `"${a.written}" could be ${a.options.length} different courses`,
        why: `Row ${a.row} writes "${a.written}", which matches ${a.options.length} courses in the list running ${spread.join(" / ")}. Because they are not all the same length the day cannot be valued from this line — write the full course name.`,
        suggestion: `One of: ${a.options.slice(0, 4).map((c) => `${c.name} (${c.label})`).join("; ")}${a.options.length > 4 ? "; …" : ""}`,
        sheet: "verification",
        cells: [`B${a.row}`],
        date: null,
        claimedSar: null,
        suggestedSar: null,
        delta: null,
        evidence: a.options.map((c) => `${c.name} — ${c.label}`),
      }),
    );
  }

  /* Log against grid, date by date. */
  for (const [key, entry] of verificationByDate) {
    if (!entry.readable) continue;
    const logged = entry.days;
    const report = dayReports.get(key);
    const claimed = report?.claimedDays ?? 0;
    if (Math.abs(Math.min(logged, 1) - claimed) < 0.001) continue;
    const date = report?.date ?? new Date(`${key}T00:00:00`);
    const f = makeFinding({
      severity: logged < claimed ? "error" : "info",
      code: "log-vs-grid",
      title:
        logged < claimed
          ? "Claim grid asks for more than the log shows"
          : "Log shows more than the claim grid",
      why: `For ${fmtDate(date)} the verification log adds up to ${fmtDays(Math.min(logged, 1))} but the claim grid is ticked for ${fmtDays(claimed)}. The two have to agree — ${logged < claimed ? "bring the grid down to the log, or add the missing line to the log" : "tick the grid for the days the log records, or drop the extra log lines"}.`,
      suggestion: null,
      sheet: "timesheet",
      cells: report?.claims.map((c) => c.cell) ?? [],
      date,
      claimedSar: report?.claimedSar ?? null,
      suggestedSar: null,
      delta: null,
      evidence: sheet.verification
        .filter((e) => e.date && dayKey(e.date) === key)
        .map((e) => `Log row ${e.rowIndex}: ${e.courseName} · ${e.durationLabel || "no duration"} · ${e.location}`),
    });
    findings.push(f);
    report?.findingIds.push(f.id);
  }

  /* ---------------- totals ---------------- */

  /*
   * Two totals, and they are not the same subtraction.
   *
   * `claimedTotal` is what the trainer is asking for — the figure written in
   * the Total cell, mistakes in the sheet's own arithmetic included.
   * `verifiedTotal` starts from what the ticks actually add up to, so the
   * arithmetic findings are already inside it, and then applies the
   * corrections that change how many days are payable. Adding the arithmetic
   * deltas on top of that would count the same money twice.
   */
  const claimedTotal = sheet.statedGrandTotal ?? computedTotal;
  const priced = findings.filter(
    (f) => f.severity === "error" && f.code !== "arithmetic" && f.delta !== null,
  );
  const delta = priced.reduce((sum, f) => sum + (f.delta ?? 0), 0);
  const unpricedCount = findings.filter(
    (f) => f.severity === "error" && f.code !== "arithmetic" && f.delta === null,
  ).length;
  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => {
    if (order[a.severity] !== order[b.severity]) return order[a.severity] - order[b.severity];
    const da = a.date ? a.date.getTime() : 0;
    const db = b.date ? b.date.getTime() : 0;
    return da - db;
  });

  return {
    sheet,
    matchedInstructor,
    matchConfidence: match?.score ?? 0,
    findings,
    days: [...dayReports.values()].sort((a, b) => a.key.localeCompare(b.key)),
    claimedTotal,
    computedTotal,
    verifiedTotal: Math.max(0, computedTotal + delta),
    unpricedCount,
    errorCount: findings.filter((f) => f.severity === "error").length,
    warningCount: findings.filter((f) => f.severity === "warning").length,
  };
}

export { addDays };
