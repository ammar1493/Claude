import type { ClaimSection, IncentiveSheet, RecordRow, SiteDistance, SiteKind } from "./types";

/**
 * Where a day of training happened, and therefore which rate band pays it.
 *
 * The incentive scheme prices a day by distance from the NEFT centre, but
 * neither the record sheet nor the trainers' sheets carry a distance — they
 * carry a place name ("SANAD", "AD 36", "BAE SYSTEM TAIF"). Anything that is
 * not the NEFT centre is an outbound course; how far out is a fact only the
 * office holds, so it is entered once per site here and remembered.
 *
 * A rig or well is its own case: the scheme pays the top band for one
 * "onshore/offshore" whatever the distance, so a site marked as a rig never
 * needs a kilometre figure.
 */

/** The scheme's own thresholds, from the rate lines on every sheet. */
export const NEAR_MAX_KM = 150;
export const MID_MAX_KM = 350;

/** Names that are the training centre itself, however they are spelled. */
const CENTRE_NAMES = [
  "NEFT",
  "NEEFT",
  "NEFT ENERGIES",
  "NEFT ENERGIES COMPANY",
  "NEFT FACILITY",
  "IN HOUSE",
  "INHOUSE",
];

export function siteKey(name: string): string {
  return String(name ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** A site's display name, tidied of the line breaks that creep into the export. */
export function siteLabel(name: string): string {
  return String(name ?? "").replace(/\s+/g, " ").trim();
}

export function isCentreName(name: string): boolean {
  return CENTRE_NAMES.includes(siteKey(name));
}

/**
 * Guess for a site the office has not classified yet. Only the centre is
 * decided outright; a rig is *offered* on the strength of its name, because
 * calling a place a rig moves it to the top band and that is the office's call.
 */
const RIG_PATTERN = /^(AD|ADM|ADES|RIG|WELL|NABORS|ARO)[\s-]*\d|(\bRIG\b|\bWELL\b|OFFSHORE|JACK[\s-]?UP)/i;

export function suggestKind(name: string): SiteKind | null {
  if (isCentreName(name)) return "centre";
  if (RIG_PATTERN.test(siteLabel(name))) return "rig";
  return null;
}

export function defaultSite(name: string): SiteDistance {
  const centre = isCentreName(name);
  return {
    name: siteLabel(name),
    kind: centre ? "centre" : "unknown",
    km: centre ? 0 : null,
    note: "",
  };
}

/** The rate band a site falls in, or null while its distance is unknown. */
export function bandForSite(site: SiteDistance | undefined | null): ClaimSection | null {
  if (!site) return null;
  if (site.kind === "centre") return "near";
  if (site.kind === "rig") return "far";
  if (site.km === null || !Number.isFinite(site.km)) return null;
  if (site.km <= NEAR_MAX_KM) return "near";
  if (site.km <= MID_MAX_KM) return "mid";
  return "far";
}

/** How a site's band reads in a sentence. */
export function describeSite(site: SiteDistance): string {
  if (site.kind === "centre") return "the NEFT centre";
  if (site.kind === "rig") return `${site.name} (rig or well)`;
  if (site.km === null) return `${site.name} (distance not set)`;
  return `${site.name} (${site.km} km from NEFT)`;
}

export class SiteTable {
  private byKey: Map<string, SiteDistance>;

  constructor(sites: SiteDistance[]) {
    this.byKey = new Map(sites.map((s) => [siteKey(s.name), s]));
    for (const name of CENTRE_NAMES) {
      if (!this.byKey.has(name)) {
        this.byKey.set(name, { name, kind: "centre", km: 0, note: "" });
      }
    }
  }

  get(name: string): SiteDistance | null {
    const key = siteKey(name);
    if (!key) return null;
    return this.byKey.get(key) ?? null;
  }

  band(name: string): ClaimSection | null {
    return bandForSite(this.get(name));
  }

  /** All sites in the table, centre names the office never touched excluded. */
  list(): SiteDistance[] {
    return [...this.byKey.values()];
  }
}

export interface SiteUsage {
  name: string;
  key: string;
  /** Certificates issued at this site in the record sheet. */
  certificates: number;
  /** Instructor-days the site appears on. */
  days: number;
  instructors: string[];
  /** True when the name only appears on trainers' verification logs. */
  logOnly: boolean;
  suggestion: SiteKind | null;
}

/**
 * Every place name the month mentions, with enough context for the office to
 * price it: how much training happened there, and whose sheets depend on it.
 */
export function collectSites(rows: RecordRow[], sheets: IncentiveSheet[]): SiteUsage[] {
  const usage = new Map<string, SiteUsage & { dayKeys: Set<string> }>();

  const touch = (name: string, logOnly: boolean) => {
    const key = siteKey(name);
    if (!key) return null;
    let entry = usage.get(key);
    if (!entry) {
      entry = {
        name: siteLabel(name),
        key,
        certificates: 0,
        days: 0,
        instructors: [],
        logOnly,
        suggestion: suggestKind(name),
        dayKeys: new Set<string>(),
      };
      usage.set(key, entry);
    }
    if (!logOnly) entry.logOnly = false;
    return entry;
  };

  for (const r of rows) {
    const entry = touch(r.location, false);
    if (!entry) continue;
    entry.certificates += 1;
    entry.dayKeys.add(`${r.instructorName}|${r.date.toDateString()}`);
    if (!entry.instructors.includes(r.instructorName)) entry.instructors.push(r.instructorName);
  }

  for (const sheet of sheets) {
    for (const line of sheet.verification) {
      const entry = touch(line.location, true);
      if (!entry) continue;
      const who = sheet.instructorName || sheet.fileName;
      if (!entry.instructors.includes(who)) entry.instructors.push(who);
    }
  }

  return [...usage.values()]
    .map(({ dayKeys, ...rest }) => ({ ...rest, days: dayKeys.size }))
    .sort((a, b) => b.certificates - a.certificates || a.name.localeCompare(b.name));
}

/** Merge freshly seen sites into a saved table, keeping what the office set. */
export function mergeSites(saved: SiteDistance[], seen: SiteUsage[]): SiteDistance[] {
  const byKey = new Map(saved.map((s) => [siteKey(s.name), s]));
  for (const site of seen) {
    if (!byKey.has(site.key)) byKey.set(site.key, defaultSite(site.name));
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}
