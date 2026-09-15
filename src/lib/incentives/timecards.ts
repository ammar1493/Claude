import { matchInstructor, nameSimilarity } from "./names";
import { addDays, dayKey } from "./record";
import type { SiteDistance, Timecard, TimecardCategory, TimecardCover } from "./types";
import { bandForSite } from "./sites";

/**
 * Assessor timecards.
 *
 * Rig competency assessment issues no certificates, so a fortnight offshore
 * leaves no trace in the record sheet and reads as a fortnight of unsupported
 * claim. What it does leave is a client-signed timecard — provider, assessor,
 * unit, dates, days — and that is what these carry.
 *
 * The cards arrive as signed scans with no text layer, so they are entered as
 * a few fields with the scan kept beside them for the audit trail rather than
 * read automatically; guessing dates off a photograph is not the kind of
 * evidence a payment should rest on.
 */

export function parseIsoDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toIsoDate(d: Date): string {
  return dayKey(d);
}

/** Days a card covers, both ends included — the way the cards count them. */
export function spanDays(card: Timecard): number {
  const start = parseIsoDate(card.start);
  const end = parseIsoDate(card.end);
  if (!start || !end) return 0;
  const ms = end.getTime() - start.getTime();
  if (ms < 0) return 0;
  return Math.round(ms / 86_400_000) + 1;
}

export function timecardDates(card: Timecard): Date[] {
  const start = parseIsoDate(card.start);
  const n = spanDays(card);
  if (!start || n <= 0) return [];
  return Array.from({ length: n }, (_, i) => addDays(start, i));
}

/** The site record a card stands for, so it prices like any other location. */
export function siteForTimecard(card: Timecard): SiteDistance {
  return { name: card.unit || card.activity || "timecard", kind: card.kind, km: card.km, note: "" };
}

export function bandForTimecard(card: Timecard) {
  return bandForSite(siteForTimecard(card));
}

/**
 * Cards belonging to one instructor, keyed by the dates they cover.
 *
 * A card names its assessor in the client's spelling, so it is matched the
 * same way an incentive sheet is — on the name, not on an exact string.
 */
export function coverageFor(
  cards: Timecard[],
  names: string[],
): Map<string, TimecardCover[]> {
  const usable = names.filter(Boolean);
  const map = new Map<string, TimecardCover[]>();
  for (const card of cards) {
    if (!matchesAnyName(card.assessor, usable)) continue;
    const cover: TimecardCover = { timecard: card, spanDays: spanDays(card) };
    for (const date of timecardDates(card)) {
      const key = dayKey(date);
      const list = map.get(key);
      if (list) list.push(cover);
      else map.set(key, [cover]);
    }
  }
  return map;
}

function matchesAnyName(assessor: string, names: string[]): boolean {
  if (!assessor) return false;
  return names.some((n) => nameSimilarity(assessor, n) >= 0.6);
}

/** Cards that belong to this instructor at all, covered dates or not. */
export function cardsFor(cards: Timecard[], names: string[]): Timecard[] {
  const usable = names.filter(Boolean);
  return cards.filter((c) => matchesAnyName(c.assessor, usable));
}

export const CATEGORY_LABELS: Record<TimecardCategory, string> = {
  assessment: "Assessment",
  report: "Report writing",
  other: "Other",
};

/**
 * Days a set of cards confirms, split by what they were for.
 *
 * `assessment` is the figure that answers "how many days does the timecard
 * confirm" — the report-writing days are worked and paid, but they are not
 * days on the unit and counting them there would overstate the trip.
 */
export function daysByCategory(cards: Timecard[]): Record<TimecardCategory, number> {
  const out: Record<TimecardCategory, number> = { assessment: 0, report: 0, other: 0 };
  for (const card of cards) out[card.category] += spanDays(card);
  return out;
}

export function describeTimecard(card: Timecard): string {
  const start = parseIsoDate(card.start);
  const end = parseIsoDate(card.end);
  const fmt = (d: Date | null) =>
    d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "?";
  const where = card.unit ? ` · ${card.unit}` : "";
  const days = spanDays(card);
  const kind = card.category === "assessment" ? "" : ` · ${CATEGORY_LABELS[card.category].toLowerCase()}`;
  return `${card.activity || "Timecard"}${where}${kind} · ${fmt(start)}–${fmt(end)} · ${days} day${days === 1 ? "" : "s"}${
    card.provider ? ` · ${card.provider}` : ""
  }${card.attachmentName ? ` · ${card.attachmentName}` : ""}`;
}

export function newTimecard(partial?: Partial<Timecard>): Timecard {
  return {
    id: `tc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    assessor: "",
    provider: "",
    unit: "",
    activity: "Competency assessment",
    category: "assessment",
    start: "",
    end: "",
    totalDays: null,
    kind: "rig",
    km: null,
    attachmentName: null,
    note: "",
    ...partial,
  };
}

export { matchInstructor };
