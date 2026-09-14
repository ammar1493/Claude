"use client";

import { useMemo, useState } from "react";
import {
  MID_MAX_KM,
  NEAR_MAX_KM,
  bandForSite,
  defaultSite,
  siteKey,
  type SiteUsage,
} from "@/lib/incentives/sites";
import { SECTION_LABELS } from "@/lib/incentives/timesheet";
import type { SiteDistance, SiteKind } from "@/lib/incentives/types";
import { Card } from "../Card";
import { Icon } from "../Icons";
import { SEVERITY } from "./severity";

const KIND_LABELS: Record<SiteKind, string> = {
  centre: "NEFT centre",
  site: "Outbound site",
  rig: "Rig or well",
  unknown: "Not set",
};

const BAND_TONE: Record<string, string> = {
  near: "bg-navy-050 text-navy",
  mid: "bg-gold-050 text-[#7A4F06]",
  far: "bg-teal/10 text-teal",
};

/**
 * The distance table.
 *
 * The record sheet says a course ran at "SANAD" or "AD 36"; the rate scheme
 * pays by kilometres from the NEFT centre. Nothing in either file bridges the
 * two, and guessing a distance would put money on a guess — so the office sets
 * it once per site here and every month after reuses it.
 *
 * Anything that is not the centre is an outbound course by definition; all the
 * office has to decide is how far out, or whether it is a rig, which the
 * scheme pays at the top band whatever the distance.
 */
export function SitesPanel({
  usage,
  sites,
  onChange,
}: {
  usage: SiteUsage[];
  sites: SiteDistance[];
  onChange: (next: SiteDistance[]) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  const byKey = useMemo(() => new Map(sites.map((s) => [siteKey(s.name), s])), [sites]);

  const rows = useMemo(() => {
    const seen = usage.map((u) => ({ usage: u, site: byKey.get(u.key) ?? defaultSite(u.name) }));
    return seen.filter((r) => showAll || r.site.kind !== "centre");
  }, [usage, byKey, showAll]);

  const unpriced = usage.filter((u) => {
    const site = byKey.get(u.key) ?? defaultSite(u.name);
    return bandForSite(site) === null;
  });

  const update = (name: string, patch: Partial<SiteDistance>) => {
    const key = siteKey(name);
    const next = sites.some((s) => siteKey(s.name) === key)
      ? sites.map((s) => (siteKey(s.name) === key ? { ...s, ...patch } : s))
      : [...sites, { ...defaultSite(name), ...patch }];
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <div className="stage stage-1 surface-card rounded-xl border-l-4 border-l-gold bg-white px-4 py-3">
        <h2 className="text-sm font-bold text-navy">Where the training happened</h2>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-slate-ink">
          Any location that is not the NEFT centre is an outbound course. The scheme pays those by
          distance — up to {NEAR_MAX_KM} km at the in-house rates, {NEAR_MAX_KM}–{MID_MAX_KM} km and
          over {MID_MAX_KM} km at their own daily rates, and a rig or well at the top rate whatever
          the distance. Set each site once and every claim against it prices itself, this month and
          every month after.
        </p>
        {unpriced.length > 0 && (
          <p className={`mt-2 inline-block rounded px-2 py-1 text-xs font-bold ${SEVERITY.warning.chip}`}>
            {unpriced.length} site{unpriced.length === 1 ? "" : "s"} still need a distance
          </p>
        )}
      </div>

      <Card
        title="Sites and distances"
        tone="marked"
        inset
        action={
          <label className="no-print flex items-center gap-1.5 text-xs font-medium text-slate-ink">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="accent-navy"
            />
            Show the NEFT centre too
          </label>
        }
      >
        <div className="neft-scroll overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-[11px] font-bold tracking-wide text-slate-ink uppercase">
                <th className="border-b border-hairline px-2 py-2">Location</th>
                <th className="border-b border-hairline px-2 py-2 text-right">Certificates</th>
                <th className="border-b border-hairline px-2 py-2">Instructors</th>
                <th className="border-b border-hairline px-2 py-2">What it is</th>
                <th className="border-b border-hairline px-2 py-2 text-right">km from NEFT</th>
                <th className="border-b border-hairline px-2 py-2">Pays at</th>
                <th className="border-b border-hairline px-2 py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ usage: u, site }) => {
                const band = bandForSite(site);
                const needsKm = site.kind === "site" && site.km === null;
                return (
                  <tr key={u.key} className={band === null ? SEVERITY.warning.row : undefined}>
                    <td className="border-b border-hairline px-2 py-1.5">
                      <span className="font-bold text-navy">{u.name}</span>
                      {u.logOnly && (
                        <span className="ms-2 rounded bg-fog px-1.5 py-0.5 text-[10px] text-slate-ink">
                          only on a verification log
                        </span>
                      )}
                      {u.suggestion === "rig" && site.kind === "unknown" && (
                        <button
                          type="button"
                          onClick={() => update(u.name, { kind: "rig", km: null })}
                          className="ms-2 rounded bg-navy-050 px-1.5 py-0.5 text-[10px] font-bold text-navy hover:bg-navy hover:text-white"
                        >
                          looks like a rig — set it
                        </button>
                      )}
                    </td>
                    <td className="border-b border-hairline px-2 py-1.5 text-right tabular-nums text-slate-ink">
                      {u.certificates || "—"}
                    </td>
                    <td className="max-w-[260px] truncate border-b border-hairline px-2 py-1.5 text-xs text-slate-ink">
                      {u.instructors.join(", ")}
                    </td>
                    <td className="border-b border-hairline px-2 py-1.5">
                      <select
                        value={site.kind}
                        onChange={(e) => {
                          const kind = e.target.value as SiteKind;
                          update(u.name, {
                            kind,
                            km: kind === "centre" ? 0 : kind === "rig" ? null : site.km,
                          });
                        }}
                        className="w-full rounded-md border border-hairline bg-white px-2 py-1 text-xs text-navy outline-none focus:border-gold focus:ring-2 focus:ring-gold/30"
                      >
                        {(["unknown", "centre", "site", "rig"] as SiteKind[]).map((k) => (
                          <option key={k} value={k}>
                            {KIND_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border-b border-hairline px-2 py-1.5 text-right">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        disabled={site.kind === "rig" || site.kind === "centre"}
                        value={site.km ?? ""}
                        placeholder={site.kind === "rig" ? "n/a" : "km"}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          const km = raw === "" ? null : Number(raw);
                          update(u.name, {
                            km: km === null || Number.isNaN(km) ? null : km,
                            // Typing a distance is itself the answer to "what
                            // is this place", so it stops being unknown.
                            kind: site.kind === "unknown" && raw !== "" ? "site" : site.kind,
                          });
                        }}
                        className={`w-24 rounded-md border bg-white px-2 py-1 text-right text-xs tabular-nums text-navy outline-none focus:border-gold focus:ring-2 focus:ring-gold/30 disabled:bg-fog disabled:text-slate-ink/50 ${
                          needsKm ? "border-gold" : "border-hairline"
                        }`}
                      />
                    </td>
                    <td className="border-b border-hairline px-2 py-1.5">
                      {band ? (
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${BAND_TONE[band]}`}>
                          {SECTION_LABELS[band]}
                        </span>
                      ) : (
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${SEVERITY.warning.chip}`}>
                          not priced yet
                        </span>
                      )}
                    </td>
                    <td className="border-b border-hairline px-2 py-1.5">
                      <input
                        type="text"
                        value={site.note ?? ""}
                        placeholder="optional"
                        onChange={(e) => update(u.name, { note: e.target.value })}
                        className="w-full min-w-[120px] rounded-md border border-hairline bg-white px-2 py-1 text-xs text-navy outline-none focus:border-gold focus:ring-2 focus:ring-gold/30"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <p className="py-6 text-center text-sm text-slate-ink">
            <Icon name="check-circle" size={16} className="me-1 inline align-[-3px] text-teal" />
            Every session this month ran at the NEFT centre — no distances to set.
          </p>
        )}
      </Card>
    </div>
  );
}
