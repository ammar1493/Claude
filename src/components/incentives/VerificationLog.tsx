"use client";

import { useMemo } from "react";
import type { Finding, SheetReport } from "@/lib/incentives/types";
import { SEVERITY, worstSeverity } from "./severity";

/** The trainer's own verification tab, with the lines that do not hold up marked. */
export function VerificationLog({
  report,
  selectedId,
  onSelect,
}: {
  report: SheetReport;
  selectedId: string | null;
  onSelect: (finding: Finding) => void;
}) {
  const byRow = useMemo(() => {
    const map = new Map<number, Finding[]>();
    for (const f of report.findings) {
      if (f.sheet !== "verification") continue;
      for (const cell of f.cells) {
        const row = Number(cell.replace(/^[A-Z]+/, ""));
        if (!Number.isFinite(row)) continue;
        const list = map.get(row);
        if (list) {
          if (!list.includes(f)) list.push(f);
        } else map.set(row, [f]);
      }
    }
    return map;
  }, [report.findings]);

  if (!report.sheet.verification.length) {
    return (
      <p className="py-6 text-center text-sm text-slate-ink">
        {report.sheet.verificationSheetName
          ? "The verification tab is empty — no course lines to check."
          : "This workbook has no verification tab."}
      </p>
    );
  }

  return (
    <div className="neft-scroll overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-xs">
        <thead>
          <tr className="text-left text-[11px] font-bold tracking-wide text-slate-ink uppercase">
            <th className="border-b border-hairline px-2 py-2">Row</th>
            <th className="border-b border-hairline px-2 py-2">Date</th>
            <th className="border-b border-hairline px-2 py-2">Course</th>
            <th className="border-b border-hairline px-2 py-2">Location</th>
            <th className="border-b border-hairline px-2 py-2">Session no.</th>
            <th className="border-b border-hairline px-2 py-2">Duration</th>
          </tr>
        </thead>
        <tbody>
          {report.sheet.verification.map((entry) => {
            const findings = byRow.get(entry.rowIndex) ?? [];
            const severity = worstSeverity(findings.map((f) => f.severity));
            return (
              <tr
                key={entry.rowIndex}
                onClick={() => findings[0] && onSelect(findings[0])}
                title={findings.map((f) => f.title).join(" · ")}
                className={`${severity ? SEVERITY[severity].row : ""} ${
                  findings.some((f) => f.id === selectedId) ? "outline-2 -outline-offset-2 outline-navy" : ""
                } ${findings.length ? "cursor-pointer" : ""}`}
              >
                <td className="border-b border-hairline px-2 py-1.5 font-mono text-[10px] text-slate-ink">
                  {entry.rowIndex}
                </td>
                <td className="border-b border-hairline px-2 py-1.5 whitespace-nowrap text-navy">
                  {entry.date
                    ? entry.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
                    : (entry.rawDate ?? "")}
                </td>
                <td className="border-b border-hairline px-2 py-1.5 text-navy">{entry.courseName}</td>
                <td className="border-b border-hairline px-2 py-1.5 text-slate-ink">{entry.location}</td>
                <td className="border-b border-hairline px-2 py-1.5 font-mono text-[10px] text-slate-ink">
                  {entry.sessionNo}
                </td>
                <td className="border-b border-hairline px-2 py-1.5 text-slate-ink">
                  {entry.durationLabel}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
