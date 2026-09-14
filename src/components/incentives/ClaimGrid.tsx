"use client";

import { Fragment, useMemo } from "react";
import { SECTION_LABELS } from "@/lib/incentives/timesheet";
import type { ClaimSection, Finding, SheetReport } from "@/lib/incentives/types";
import { SEVERITY, worstSeverity } from "./severity";

const SECTION_ORDER: ClaimSection[] = ["near", "mid", "far", "perdiem", "admin"];
const WEEKDAY_INITIAL = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * The trainer's own claim grid, re-drawn with the problems on it.
 *
 * A findings list on its own makes a verifier hold the sheet in their head.
 * Drawn back as the grid they already know — rate lines down, days across —
 * a wrong tick is in the place they would have looked for it anyway, and the
 * shape of a month (a run of rig days, a missing week) reads at a glance.
 */
export function ClaimGrid({
  report,
  selectedId,
  onSelect,
}: {
  report: SheetReport;
  selectedId: string | null;
  onSelect: (finding: Finding) => void;
}) {
  const { sheet } = report;

  const byCell = useMemo(() => {
    const map = new Map<string, Finding[]>();
    for (const f of report.findings) {
      for (const cell of f.cells) {
        const list = map.get(cell);
        if (list) list.push(f);
        else map.set(cell, [f]);
      }
    }
    return map;
  }, [report.findings]);

  const dayInfo = useMemo(() => {
    const map = new Map<number, { claimed: number; record: number; findings: Finding[] }>();
    for (const d of report.days) {
      map.set(d.date.getDate(), {
        claimed: d.claimedDays,
        record: d.recordDays,
        findings: report.findings.filter((f) => d.findingIds.includes(f.id)),
      });
    }
    // Days delivered but never claimed have no claim row, so they only exist
    // as a finding; mark their column so the gap is visible in the grid.
    for (const f of report.findings) {
      if (f.code !== "not-claimed" || !f.date) continue;
      const day = f.date.getDate();
      const existing = map.get(day);
      if (existing) existing.findings.push(f);
      else map.set(day, { claimed: 0, record: 0, findings: [f] });
    }
    return map;
  }, [report.days, report.findings]);

  const days = sheet.dayColumns.filter((d) => !d.nextMonth);
  const year = report.days[0]?.date.getFullYear() ?? new Date().getFullYear();
  const month = report.days[0]?.date.getMonth() ?? 0;

  const rowsBySection = SECTION_ORDER.map((section) => ({
    section,
    rows: sheet.rows.filter((r) => r.section === section),
  })).filter((g) => g.rows.length);

  return (
    <div className="neft-scroll overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-[11px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 min-w-[220px] bg-white px-2 py-1.5 text-left font-bold text-navy">
              Rate line
            </th>
            <th className="bg-white px-1.5 py-1.5 text-right font-bold text-navy">SAR</th>
            {days.map((d) => {
              const date = new Date(year, month, d.day);
              const weekend = date.getDay() === 5 || date.getDay() === 6;
              const info = dayInfo.get(d.day);
              const severity = worstSeverity((info?.findings ?? []).map((f) => f.severity));
              return (
                <th
                  key={d.day}
                  scope="col"
                  title={`${date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}${
                    info ? ` — claimed ${info.claimed}, record shows ${info.record}` : ""
                  }`}
                  className={`w-7 min-w-7 px-0 py-1 text-center font-bold ${
                    weekend ? "bg-navy-050 text-navy" : "bg-white text-slate-ink"
                  }`}
                >
                  <span className="block leading-tight">{d.day}</span>
                  <span className="block text-[9px] leading-tight font-medium opacity-60">
                    {WEEKDAY_INITIAL[date.getDay()]}
                  </span>
                  <span
                    aria-hidden
                    className={`mx-auto mt-0.5 block h-1 w-1 rounded-full ${severity ? SEVERITY[severity].dot : "bg-transparent"}`}
                  />
                </th>
              );
            })}
            <th className="min-w-[64px] bg-white px-2 py-1.5 text-right font-bold text-navy">Total</th>
          </tr>
        </thead>
        <tbody>
          {rowsBySection.map(({ section, rows }) => (
            <Fragment key={section}>
              <tr>
                <th
                  colSpan={days.length + 3}
                  scope="colgroup"
                  className="sticky left-0 border-t border-hairline bg-fog px-2 py-1 text-left text-[10px] font-bold tracking-wide text-slate-ink uppercase"
                >
                  {SECTION_LABELS[section]}
                </th>
              </tr>
              {rows.map((row) => {
                const totalFindings = byCell.get(row.totalCell) ?? [];
                const totalSeverity = worstSeverity(totalFindings.map((f) => f.severity));
                return (
                  <tr key={`${section}-${row.rowIndex}`} className="hover:bg-navy-050/40">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 max-w-[240px] truncate border-t border-hairline bg-white px-2 py-1 text-left font-medium text-navy"
                      title={row.label}
                    >
                      {row.label}
                    </th>
                    <td className="border-t border-hairline px-1.5 py-1 text-right tabular-nums text-slate-ink">
                      {row.rate || ""}
                    </td>
                    {days.map((d) => {
                      const cell = `${d.column}${row.rowIndex}`;
                      const ticked = row.days.includes(d.day);
                      const findings = byCell.get(cell) ?? [];
                      const severity = worstSeverity(findings.map((f) => f.severity));
                      const selected = findings.some((f) => f.id === selectedId);
                      if (!ticked) {
                        return <td key={d.day} className="border-t border-hairline px-0 py-1" />;
                      }
                      const base =
                        "mx-auto flex h-5 w-5 items-center justify-center rounded font-bold transition-[scale,box-shadow] duration-150 ease-out";
                      if (!severity) {
                        return (
                          <td key={d.day} className="border-t border-hairline px-0 py-1">
                            <span className={`${base} bg-navy text-white`} title="Checks out">
                              ✓
                            </span>
                          </td>
                        );
                      }
                      return (
                        <td key={d.day} className="border-t border-hairline px-0 py-1">
                          <button
                            type="button"
                            onClick={() => onSelect(findings[0])}
                            title={findings.map((f) => f.title).join(" · ")}
                            aria-label={`${cell}: ${findings.map((f) => f.title).join("; ")}`}
                            className={`${base} ${SEVERITY[severity].cell} active:scale-[0.9] ${
                              selected ? "ring-2 ring-navy ring-offset-1" : ""
                            }`}
                          >
                            !
                          </button>
                        </td>
                      );
                    })}
                    <td
                      className={`border-t border-hairline px-2 py-1 text-right tabular-nums ${
                        totalSeverity ? SEVERITY[totalSeverity].chip : "text-navy"
                      }`}
                    >
                      {row.statedTotal ?? ""}
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th
              scope="row"
              colSpan={days.length + 2}
              className="sticky left-0 border-t-2 border-navy bg-white px-2 py-1.5 text-left font-bold text-navy"
            >
              Total claimed
            </th>
            <td className="border-t-2 border-navy px-2 py-1.5 text-right font-bold tabular-nums text-navy">
              {report.claimedTotal.toLocaleString("en-US")}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
