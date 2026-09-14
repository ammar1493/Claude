"use client";

import { useMemo } from "react";
import { KIND_LABELS } from "@/lib/incentives/timesheet";
import type { Finding, SheetReport } from "@/lib/incentives/types";
import { SEVERITY, worstSeverity } from "./severity";

const fmtDays = (n: number) => (n === 0 ? "—" : n === 0.5 ? "½" : String(n));

/**
 * Claim against evidence, one row per date.
 *
 * This is the table a verifier would otherwise build by hand: what the trainer
 * asked for on the left, what the record sheet holds for that day on the
 * right. Days delivered but never claimed appear too, because an incentive
 * sheet is as wrong when it is short as when it is long.
 */
export function DayLedger({
  report,
  selectedId,
  onSelect,
}: {
  report: SheetReport;
  selectedId: string | null;
  onSelect: (finding: Finding) => void;
}) {
  const rows = useMemo(() => {
    const byKey = new Map<
      string,
      { date: Date; claimed: number; sar: number; lines: string[]; findings: Finding[]; record: SheetReport["days"][number]["record"] }
    >();
    for (const d of report.days) {
      byKey.set(d.key, {
        date: d.date,
        claimed: d.claimedDays,
        sar: d.claimedSar,
        lines: d.claims.map((c) => `${KIND_LABELS[c.row.kind]} · ${c.cell}`),
        findings: report.findings.filter((f) => d.findingIds.includes(f.id)),
        record: d.record,
      });
    }
    for (const f of report.findings) {
      if (f.code !== "not-claimed" || !f.date) continue;
      const key = f.date.toISOString().slice(0, 10);
      if (byKey.has(key)) continue;
      byKey.set(key, { date: f.date, claimed: 0, sar: 0, lines: [], findings: [f], record: null });
    }
    return [...byKey.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, v]) => ({ key, ...v }));
  }, [report]);

  if (!rows.length) return <p className="py-6 text-center text-sm text-slate-ink">No days claimed.</p>;

  return (
    <div className="neft-scroll overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-xs">
        <thead>
          <tr className="text-left text-[11px] font-bold tracking-wide text-slate-ink uppercase">
            <th className="border-b border-hairline px-2 py-2">Date</th>
            <th className="border-b border-hairline px-2 py-2">Claimed as</th>
            <th className="border-b border-hairline px-2 py-2 text-center">Days</th>
            <th className="border-b border-hairline px-2 py-2 text-center">Record</th>
            <th className="border-b border-hairline px-2 py-2">What the record sheet holds</th>
            <th className="border-b border-hairline px-2 py-2 text-right">SAR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const severity = worstSeverity(r.findings.map((f) => f.severity));
            const recordDays = r.record?.load ?? 0;
            const mismatch = Math.abs(recordDays - r.claimed) > 0.001;
            const blocks = r.record ? [...r.record.blocks, ...r.record.continuations] : [];
            return (
              <tr
                key={r.key}
                onClick={() => r.findings[0] && onSelect(r.findings[0])}
                className={`align-top ${severity ? SEVERITY[severity].row : ""} ${
                  r.findings.some((f) => f.id === selectedId) ? "outline-2 -outline-offset-2 outline-navy" : ""
                } ${r.findings.length ? "cursor-pointer" : ""}`}
              >
                <td className="border-b border-hairline px-2 py-1.5 whitespace-nowrap">
                  <span className="font-bold text-navy">
                    {r.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                  </span>
                  <span className="ms-1 text-slate-ink">
                    {r.date.toLocaleDateString("en-GB", { weekday: "short" })}
                  </span>
                </td>
                <td className="border-b border-hairline px-2 py-1.5 text-slate-ink">
                  {r.lines.length ? r.lines.join(" + ") : <em>not claimed</em>}
                </td>
                <td
                  className={`border-b border-hairline px-2 py-1.5 text-center font-bold tabular-nums ${
                    mismatch ? "text-[#B3261E]" : "text-navy"
                  }`}
                >
                  {fmtDays(r.claimed)}
                </td>
                <td className="border-b border-hairline px-2 py-1.5 text-center font-bold tabular-nums text-navy">
                  {fmtDays(recordDays)}
                </td>
                <td className="border-b border-hairline px-2 py-1.5 text-slate-ink">
                  {blocks.length ? (
                    <ul className="space-y-0.5">
                      {blocks.map((b, i) => (
                        <li key={i}>
                          {b.courseNames.join(" + ")}{" "}
                          <span className="text-[10px] text-slate-ink/70">
                            [{b.duration?.label ?? "not in the course list"}
                            {b.locations.length ? ` · ${b.locations.join(", ")}` : ""}]
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <em>no session recorded</em>
                  )}
                </td>
                <td className="border-b border-hairline px-2 py-1.5 text-right tabular-nums text-navy">
                  {r.sar ? r.sar.toLocaleString("en-US") : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
