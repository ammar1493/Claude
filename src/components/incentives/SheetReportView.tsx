"use client";

import { useEffect, useState } from "react";
import type { Finding, Severity, SheetReport } from "@/lib/incentives/types";
import { Card, SectionTitle } from "../Card";
import { Icon } from "../Icons";
import { ClaimGrid } from "./ClaimGrid";
import { DayLedger } from "./DayLedger";
import { FindingsList } from "./FindingsList";
import { SEVERITY, SEVERITY_ORDER } from "./severity";
import { VerificationLog } from "./VerificationLog";

const sar = (n: number) => Math.round(n).toLocaleString("en-US");

function Figure({
  label,
  value,
  tone = "navy",
  note,
}: {
  label: string;
  value: string;
  tone?: "navy" | "gold" | "danger" | "teal";
  note?: string;
}) {
  const colour = {
    navy: "text-navy",
    gold: "text-gold",
    danger: "text-[#B3261E]",
    teal: "text-teal",
  }[tone];
  return (
    <div className="surface-card print-block rounded-xl bg-white px-4 py-3">
      <p className="text-[11px] font-bold tracking-wide text-slate-ink uppercase">{label}</p>
      <p className={`mt-0.5 text-2xl leading-tight font-black tabular-nums ${colour}`}>{value}</p>
      {note && <p className="mt-0.5 text-[11px] leading-snug text-slate-ink">{note}</p>}
    </div>
  );
}

export function SheetReportView({ report }: { report: SheetReport }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<Set<Severity>>(new Set(SEVERITY_ORDER));

  // A different trainer is a different sheet; keep nothing from the last one.
  useEffect(() => {
    setSelected(null);
  }, [report.sheet.fileName]);

  const select = (finding: Finding) => {
    setSelected(finding.id);
    document
      .getElementById(`finding-${finding.id}`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const toggle = (severity: Severity) => {
    setFilter((prev) => {
      const next = new Set(prev);
      if (next.has(severity) && next.size > 1) next.delete(severity);
      else next.add(severity);
      return next;
    });
  };

  const difference = report.verifiedTotal - report.claimedTotal;
  const counts: Record<Severity, number> = {
    error: report.findings.filter((f) => f.severity === "error").length,
    warning: report.findings.filter((f) => f.severity === "warning").length,
    info: report.findings.filter((f) => f.severity === "info").length,
  };

  return (
    <div className="space-y-4">
      <header className="stage stage-1">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl leading-tight font-black text-navy">
              {report.sheet.instructorName || "Unnamed instructor"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-ink">
              {report.sheet.fileName}
              {report.sheet.monthLabel ? ` · ${report.sheet.monthLabel}` : ""}
              {report.matchedInstructor && report.matchedInstructor !== report.sheet.instructorName
                ? ` · record sheet: ${report.matchedInstructor}`
                : ""}
            </p>
          </div>
          <div className="no-print flex flex-wrap gap-1.5">
            {SEVERITY_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggle(s)}
                aria-pressed={filter.has(s)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.96] ${
                  filter.has(s) ? SEVERITY[s].chip : "bg-white text-slate-ink/60"
                }`}
              >
                <span aria-hidden className={`h-2 w-2 rounded-full ${SEVERITY[s].dot}`} />
                {counts[s]} {SEVERITY[s].label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="stage stage-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Claimed on the sheet" value={`${sar(report.claimedTotal)} SAR`} />
        <Figure
          label="Ticks add up to"
          value={`${sar(report.computedTotal)} SAR`}
          note={
            report.computedTotal !== report.claimedTotal
              ? "The sheet's own total disagrees with its ticks."
              : undefined
          }
        />
        <Figure
          label="Verified"
          value={`${sar(report.verifiedTotal)} SAR`}
          tone="teal"
          note={
            report.unpricedCount
              ? `${report.unpricedCount} more finding${report.unpricedCount === 1 ? " needs" : "s need"} a decision before this is final.`
              : undefined
          }
        />
        <Figure
          label="Difference"
          value={`${difference === 0 ? "" : difference < 0 ? "−" : "+"}${sar(Math.abs(difference))} SAR`}
          tone={difference < 0 ? "danger" : difference > 0 ? "gold" : "navy"}
        />
      </div>

      {/* The grid takes the full width: thirty-one day columns and the rate
          lines do not fit beside the findings panel, and a grid that has to be
          scrolled sideways to be read is no better than the spreadsheet. */}
      <div className="stage stage-3">
        <Card title={`Claim grid — ${report.sheet.timeSheetName}`} tone="marked" inset>
          <ClaimGrid report={report} selectedId={selected} onSelect={select} />
          <p className="no-print mt-2 px-2 text-[11px] text-slate-ink">
            <Icon name="info" size={12} className="mr-1 inline align-[-2px]" />
            Every tick the record sheet backs is navy. Coloured ticks carry a finding — select one to
            read why.
          </p>
        </Card>
      </div>

      <div className="stage stage-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
        {/* min-w-0: a grid item sizes to its content by default, so the wide
            tables inside would stretch the column past the viewport instead of
            scrolling within it. */}
        <div className="min-w-0 space-y-4">
          <Card title="Day by day" tone="plain" inset>
            <DayLedger report={report} selectedId={selected} onSelect={select} />
          </Card>

          <Card
            title={`Verification log — ${report.sheet.verificationSheetName ?? "missing"}`}
            tone="plain"
            inset
          >
            <VerificationLog report={report} selectedId={selected} onSelect={select} />
          </Card>
        </div>

        <div className="min-w-0 space-y-2 xl:sticky xl:top-[calc(var(--nav-h)+12px)] xl:max-h-[calc(100vh-var(--nav-h)-24px)] xl:self-start xl:overflow-y-auto xl:pe-1 neft-scroll">
          <SectionTitle className="print-block">What has to change</SectionTitle>
          <FindingsList report={report} selectedId={selected} onSelect={select} filter={filter} />
        </div>
      </div>
    </div>
  );
}
