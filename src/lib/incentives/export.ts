import * as XLSX from "xlsx";
import { KIND_LABELS } from "./timesheet";
import type { SheetReport } from "./types";

const SEVERITY_LABEL = {
  error: "Must change",
  warning: "Check",
  info: "Note",
} as const;

function fmtDate(d: Date | null): string {
  return d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
}

/**
 * The findings workbook.
 *
 * Cell fills cannot be written by the community build of SheetJS, so the
 * highlighting stays in the app and on the printed report; the workbook
 * carries the same information as columns instead — which cell, what is wrong,
 * what it should say, and what it moves in riyals — so it can be filtered,
 * sorted and pasted into an email back to the trainer.
 */
export function buildFindingsWorkbook(reports: SheetReport[], monthLabel: string): XLSX.WorkBook {
  const summary = reports.map((r) => ({
    "Instructor (as written)": r.sheet.instructorName || "—",
    "Instructor (record sheet)": r.matchedInstructor ?? "not matched",
    File: r.sheet.fileName,
    Month: r.sheet.monthLabel || "—",
    "Claimed (SAR)": r.claimedTotal,
    "Ticks add up to (SAR)": r.computedTotal,
    "Verified (SAR)": r.verifiedTotal,
    "Difference (SAR)": r.verifiedTotal - r.claimedTotal,
    "Must change": r.errorCount,
    Check: r.warningCount,
    "Needs a decision": r.unpricedCount,
  }));

  const findings = reports.flatMap((r) =>
    r.findings.map((f) => ({
      Instructor: r.matchedInstructor ?? r.sheet.instructorName,
      File: r.sheet.fileName,
      Severity: SEVERITY_LABEL[f.severity],
      Type: f.code,
      Date: fmtDate(f.date),
      Tab: f.sheet === "timesheet" ? r.sheet.timeSheetName : (r.sheet.verificationSheetName ?? ""),
      Cells: f.cells.join(", "),
      Finding: f.title,
      "Why it has to change": f.why,
      "What it should say": f.suggestion ?? "",
      "Claimed (SAR)": f.claimedSar ?? "",
      "Should be (SAR)": f.suggestedSar ?? "",
      "Difference (SAR)": f.delta ?? "",
    })),
  );

  const days = reports.flatMap((r) =>
    r.days.map((d) => ({
      Instructor: r.matchedInstructor ?? r.sheet.instructorName,
      Date: fmtDate(d.date),
      Day: d.date.toLocaleDateString("en-GB", { weekday: "long" }),
      "Claimed lines": d.claims.map((c) => `${KIND_LABELS[c.row.kind]} (${c.cell})`).join("; "),
      "Days claimed": d.claimedDays,
      "Days in record sheet": d.recordDays,
      "Sessions in record sheet": d.record
        ? [...d.record.blocks, ...d.record.continuations]
            .map((b) => `${b.courseNames.join(" + ")} [${b.duration?.label ?? "unlisted"}]`)
            .join("; ")
        : "none",
      Location: d.record?.locations.join(", ") ?? "",
      "Claimed (SAR)": d.claimedSar,
    })),
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(findings.length ? findings : [{ Finding: "Nothing to change." }]),
    "Findings",
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(days), "Day by day");

  const sheet = wb.Sheets.Findings;
  if (sheet) {
    sheet["!cols"] = [
      { wch: 26 }, { wch: 34 }, { wch: 12 }, { wch: 14 }, { wch: 13 }, { wch: 20 },
      { wch: 14 }, { wch: 42 }, { wch: 90 }, { wch: 34 }, { wch: 13 }, { wch: 14 }, { wch: 14 },
    ];
  }
  if (wb.Sheets.Summary) {
    wb.Sheets.Summary["!cols"] = [
      { wch: 26 }, { wch: 28 }, { wch: 40 }, { wch: 16 }, { wch: 14 },
      { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 16 },
    ];
  }
  if (wb.Sheets["Day by day"]) {
    wb.Sheets["Day by day"]["!cols"] = [
      { wch: 26 }, { wch: 13 }, { wch: 11 }, { wch: 40 }, { wch: 12 },
      { wch: 18 }, { wch: 60 }, { wch: 22 }, { wch: 13 },
    ];
  }

  wb.Props = { Title: `Incentive verification — ${monthLabel}` };
  return wb;
}

export function downloadFindingsWorkbook(reports: SheetReport[], monthLabel: string): void {
  const wb = buildFindingsWorkbook(reports, monthLabel);
  XLSX.writeFile(wb, `Incentive verification — ${monthLabel}.xlsx`, { compression: true });
}
