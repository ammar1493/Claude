import * as XLSX from "xlsx";
import { cellToString } from "../xlsx";
import type { CourseDuration } from "./types";

/**
 * Parse a duration cell of the Courses Duration workbook.
 *
 * The list uses five phrasings — "Half Day", "1 Full Day", "2 Days",
 * "3 Days", "15 Days" — but trainers type their own ("HALF DAY", "fullday",
 * "6 Hrs"), so this is deliberately forgiving and is reused for the duration
 * column of the verification log.
 */
export function parseDurationLabel(raw: unknown): number | null {
  const s = cellToString(raw).toLowerCase().replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (/half/.test(s)) return 0.5;
  const days = /(\d+(?:\.\d+)?)\s*(?:full\s*)?day/.exec(s);
  if (days) {
    const n = Number(days[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (/full/.test(s)) return 1;
  // "6 Hrs", "8 hours" — an 8-hour day is full, anything less is a half.
  const hours = /(\d+(?:\.\d+)?)\s*(?:hr|hrs|hour|hours)\b/.exec(s);
  if (hours) {
    const n = Number(hours[1]);
    if (Number.isFinite(n) && n > 0) return n >= 7 ? 1 : 0.5;
  }
  return null;
}

export function normaliseCourseKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface CourseLookup {
  /** The one course this name resolves to, or null. */
  course: CourseDuration | null;
  /** Every master entry the name could mean. */
  candidates: CourseDuration[];
  /** True when the candidates disagree on how long the course is. */
  ambiguous: boolean;
  /**
   * Set when a rule of the office's decided the reading rather than the list
   * doing it on its own, so a finding can say which rule it applied instead
   * of citing one entry out of several that all agree.
   */
  rule: string | null;
}

/** Is `needle` a whole-word run inside `haystack`? Both already normalised. */
function containsWords(haystack: string, needle: string): boolean {
  const i = haystack.indexOf(needle);
  if (i < 0) return false;
  const before = i === 0 || haystack[i - 1] === " ";
  const after = i + needle.length === haystack.length || haystack[i + needle.length] === " ";
  return before && after;
}

/**
 * Saudi Heart Association, as the list and the trainers write it.
 *
 * Applied to an already-normalised key, so the list's
 * "BASIC FIRST AID SAUDI HEART ASSOCIATION (SHA)" has lost its brackets by
 * the time this sees it. "Frst Aid Saudi Heart Association" — the spelling on
 * the sheets' own course list — is caught by the second half.
 */
const SAUDI_HEART = /\bSHA\b|\bSAUDI HEART\b/;

/**
 * What the first-aid rule says, in the words a trainer is answered with.
 * A finding that applied it prints this rather than citing one of the four
 * half-day entries as though the line had named it.
 */
const FIRST_AID_RULE =
  "Read under the first-aid rule: of the courses that mention first aid, only " +
  "BASIC FIRST AID SAUDI HEART ASSOCIATION (SHA) is a full day.";

/** "FRST AID" is the spelling on the sheets' own course list. */
const FIRST_AID = /\b(?:FIRST|FRST) AID\b/;

/**
 * First aid is one name over two prices.
 *
 * Five entries in the master list mention first aid and exactly one of them
 * is a full day: the Saudi Heart Association course, which everyone writes as
 * SHA. So the office's rule is that a first-aid line naming SHA is that
 * course and a line that does not is one of the half days — which is why
 * "first aid" on its own is now valued at half a day instead of being
 * reported as ambiguous.
 *
 * This narrows rather than decides: if the list ever gains a second full-day
 * first-aid course that is not SHA, the candidates disagree again and the
 * line goes back to being reported.
 */
function narrowFirstAid(key: string, candidates: CourseDuration[]): CourseDuration[] {
  if (!FIRST_AID.test(key)) return candidates;
  const wantsSaudiHeart = SAUDI_HEART.test(key);
  const narrowed = candidates.filter(
    (c) => SAUDI_HEART.test(normaliseCourseKey(c.name)) === wantsSaudiHeart,
  );
  return narrowed.length ? narrowed : candidates;
}

export class CourseCatalog {
  private byKey = new Map<string, CourseDuration>();

  constructor(public readonly courses: CourseDuration[]) {
    for (const c of courses) this.byKey.set(normaliseCourseKey(c.name), c);
  }

  get size(): number {
    return this.byKey.size;
  }

  /**
   * Resolve a written course name against the master list.
   *
   * Exact on the normalised name first. Otherwise every master entry that
   * shares a whole-word run with what was written is a candidate: that is what
   * lets "IADC WELLSHARP - WIRELINE" on a verification log find
   * "WELLSHARP - WIRELINE" in the list.
   *
   * Short-hand is the reason this returns candidates rather than a single
   * answer: where the matches disagree on how long the course runs, the
   * ambiguity is reported and the trainer is asked to write the course out
   * rather than a verdict being invented. First aid is the exception the
   * office settled by rule — see narrowFirstAid().
   */
  lookupDetailed(name: string): CourseLookup {
    const key = normaliseCourseKey(name);
    if (!key) return { course: null, candidates: [], ambiguous: false, rule: null };
    const exact = this.byKey.get(key);
    if (exact) return { course: exact, candidates: [exact], ambiguous: false, rule: null };

    /* The other half of the first-aid rule. "first aid SHA" shares no run of
       words with "BASIC FIRST AID SAUDI HEART ASSOCIATION (SHA)", so the
       matching below would find nothing at all; naming SHA is the office
       saying which course it is, and there is only one it can be. */
    if (FIRST_AID.test(key) && SAUDI_HEART.test(key)) {
      const sha = this.courses.filter((c) => {
        const k = normaliseCourseKey(c.name);
        return FIRST_AID.test(k) && SAUDI_HEART.test(k);
      });
      if (sha.length === 1) {
        return { course: sha[0], candidates: sha, ambiguous: false, rule: FIRST_AID_RULE };
      }
    }

    const candidates: CourseDuration[] = [];
    for (const [k, c] of this.byKey) {
      if (k.length < 6) continue;
      if (containsWords(key, k) || (key.length >= 6 && containsWords(k, key))) candidates.push(c);
    }
    if (!candidates.length) return { course: null, candidates: [], ambiguous: false, rule: null };

    const narrowed = narrowFirstAid(key, candidates);
    const rule = narrowed.length === candidates.length ? null : FIRST_AID_RULE;
    const durations = new Set(narrowed.map((c) => c.days));
    if (durations.size > 1) return { course: null, candidates: narrowed, ambiguous: true, rule };
    // All the same length, so the shortest name — the most specific reading of
    // what was written — stands in for the group.
    const course = narrowed.reduce((best, c) => (c.name.length < best.name.length ? c : best));
    return { course, candidates: narrowed, ambiguous: false, rule };
  }

  lookup(name: string): CourseDuration | null {
    return this.lookupDetailed(name).course;
  }
}

/**
 * Course family.
 *
 * Two sessions belong to the same class when they teach the same subject —
 * "H2S & SCBA LEVEL-2" and "H2S & SCBA AWARNESS" are one morning class taught
 * to one room, certified at two levels. The family key strips the level,
 * language and train-the-trainer wrappers so those collapse together, while
 * genuinely different subjects (FIRE FIGHTING vs FIRE WATCH) stay apart.
 */
const FAMILIES: [RegExp, string][] = [
  [/\bH2S\b|HYDROGEN SULFIDE/i, "H2S"],
  [/FIRE WATCH|FIRE WARDEN/i, "FIRE WATCH"],
  [/FIRE ?FIGHTING|FIREFIGHTING/i, "FIRE FIGHTING"],
  [/FIRST AID|CPR|AED/i, "FIRST AID"],
  [/HAZCOM/i, "HAZCOM"],
  [/HAZMAT/i, "HAZMAT"],
  [/CHEMICAL (HAZARD|HANDLING)/i, "CHEMICAL HAZARD"],
  [/HAZARD RECOGNITION/i, "HAZARD RECOGNITION"],
  [/CONFINED SPACE/i, "CONFINED SPACE"],
  [/FALL PROTECTION|WORKING AT HEIGHT/i, "FALL PROTECTION"],
  [/PERMIT TO WORK|\bPTW\b|WORK PERMIT/i, "PERMIT TO WORK"],
  [/LOCKOUT|TAGOUT|\bLOTO\b/i, "LOCKOUT TAGOUT"],
  [/GAS TESTER/i, "GAS TESTER"],
  [/RIGGING|SLINGER|RIGGER|BANKSMAN/i, "RIGGING & LIFTING"],
  [/SCAFFOLD/i, "SCAFFOLDING"],
  [/FORKLIFT/i, "FORKLIFT"],
  [/OVERHEAD CRANE/i, "OVERHEAD CRANE"],
  [/DEFENSIVE DRIVING|JOURNEY MANAGEMENT/i, "DRIVING"],
  [/SPILL PREVENTION/i, "SPILL PREVENTION"],
  [/RESPIRATORY/i, "RESPIRATORY PROTECTION"],
  [/EMERGENCY RESPONSE|\bERP\b|\bERT\b/i, "EMERGENCY RESPONSE"],
  [/FLOW LINE|RESTRAINT SYSTEM|\bFSR\b|TEMPORARY PIP/i, "FLOW LINE RESTRAINT"],
  [/WELLSHARP/i, "WELLSHARP"],
  [/\bIPAF\b|MANLIFT/i, "IPAF"],
  [/STOP WORK AUTHORITY|\bSWA\b/i, "STOP WORK AUTHORITY"],
  [/JOB SAFETY ANALYSIS|\bJSA\b/i, "JSA"],
  [/HIGH VOLTAGE|ELECTRICAL/i, "ELECTRICAL"],
  [/HIGH PRESSURE/i, "HIGH PRESSURE"],
  [/NOISE LEVEL/i, "NOISE"],
  [/RADIATION/i, "RADIATION"],
  [/DROPPED OBJECT|\bDROPS\b/i, "DROPS"],
  [/LINE OF FIRE/i, "LINE OF FIRE"],
  [/CARBON MONOXIDE/i, "CARBON MONOXIDE"],
  [/STANDBY MAN|STANDBYMAN/i, "STANDBY MAN"],
  [/STUCK PIPE/i, "STUCK PIPE"],
  [/MANUAL HANDLING|LOAD SECUR/i, "MANUAL HANDLING"],
  [/BOSIET|FOET|HUET|SURVIVAL/i, "OFFSHORE SURVIVAL"],
  [/NEBOSH/i, "NEBOSH"],
  [/RISK ASSESSMENT/i, "RISK ASSESSMENT"],
  [/ARO LEAD|LEADERSHIP|TEAMBUILDING/i, "LEADERSHIP"],
  [/SANDBLAST|SPRAY PAINT|ABRASIVE/i, "BLASTING & COATING"],
  [/GAS CYLINDER/i, "GAS CYLINDER"],
  [/WELLHEAD/i, "WELLHEAD"],
];

export function courseFamily(name: string): string {
  const s = name ?? "";
  for (const [re, family] of FAMILIES) if (re.test(s)) return family;
  // Nothing matched: fall back to the first few significant words so that at
  // least identical course names group together.
  return normaliseCourseKey(s).split(" ").slice(0, 3).join(" ") || "OTHER";
}

/** Read the Courses Duration workbook. Its first sheet is Course Name | Duration. */
export function parseCourseCatalog(data: ArrayBuffer | Uint8Array): CourseCatalog {
  const wb = XLSX.read(data, { cellDates: false });
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const aoa = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: null,
      raw: true,
    });
    const courses: CourseDuration[] = [];
    for (const row of aoa) {
      const name = cellToString(row?.[0]);
      const label = cellToString(row?.[1]);
      if (!name || !label) continue;
      if (/^course\s*name$/i.test(name)) continue;
      const days = parseDurationLabel(label);
      if (days === null) continue;
      courses.push({ name, label, days });
    }
    if (courses.length >= 5) return new CourseCatalog(courses);
  }
  throw new Error(
    "No sheet in this workbook looks like the course list — expected a Course Name column and a Duration column.",
  );
}
