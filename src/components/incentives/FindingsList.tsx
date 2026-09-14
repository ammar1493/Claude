"use client";

import type { ReactNode } from "react";

import type { Decision, Finding, Severity, SheetReport } from "@/lib/incentives/types";
import { Icon } from "../Icons";
import { DecisionControls } from "./CorrectionPanel";
import { SEVERITY, SEVERITY_ORDER } from "./severity";

const sar = (n: number) => `${Math.round(n).toLocaleString("en-US")} SAR`;

/** Finding ids carry file names and cell refs; an element id cannot. */
export const cssId = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, "_");

function FindingCard({
  finding,
  selected,
  onSelect,
  tabName,
  decision,
  onDecide,
  extra,
}: {
  finding: Finding;
  selected: boolean;
  onSelect: () => void;
  tabName: string;
  decision: Decision;
  onDecide: (decision: Decision) => void;
  extra?: ReactNode;
}) {
  const tone = SEVERITY[finding.severity];
  const decided =
    decision === "accepted"
      ? "ring-2 ring-teal"
      : decision === "kept"
        ? "opacity-60"
        : "";
  return (
    <article
      id={`finding-${cssId(finding.id)}`}
      onClick={onSelect}
      className={`surface-card print-block cursor-pointer rounded-xl border-l-4 bg-white px-4 py-3 ${tone.rule} ${
        selected ? "ring-2 ring-navy" : decided
      }`}
    >
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase ${tone.chip}`}>
          {tone.label}
        </span>
        <h4 className="text-sm font-bold text-navy">{finding.title}</h4>
        {finding.date && (
          <span className="text-xs font-medium text-slate-ink">
            {finding.date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
          </span>
        )}
        {finding.cells.length > 0 && (
          <span className="rounded bg-fog px-1.5 py-0.5 font-mono text-[10px] text-slate-ink">
            {tabName} · {finding.cells.slice(0, 6).join(", ")}
            {finding.cells.length > 6 ? ` +${finding.cells.length - 6}` : ""}
          </span>
        )}
      </header>

      <p className="mt-1.5 text-[13px] leading-relaxed text-slate-ink">{finding.why}</p>

      {(finding.suggestion || finding.delta !== null) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {finding.suggestion && (
            <span className="font-medium text-navy">
              <Icon name="pencil" size={12} className="mr-1 inline align-[-1px]" />
              {finding.suggestion}
            </span>
          )}
          {/* An arithmetic fix moves a cell, not the payment: its riyals are
              already inside the "ticks add up to" figure, so showing a delta
              here would read as money on top. The suggestion names the cell. */}
          {finding.delta !== null && finding.delta !== 0 && finding.code !== "arithmetic" && (
            <span className={`font-bold tabular-nums ${finding.delta < 0 ? "text-[#B3261E]" : "text-teal"}`}>
              {finding.delta < 0 ? "−" : "+"}
              {sar(Math.abs(finding.delta))}
            </span>
          )}
        </div>
      )}

      {extra}

      {finding.evidence.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-navy select-none">
            Record sheet for this day ({finding.evidence.length})
          </summary>
          <ul className="mt-1 space-y-1 border-l border-hairline pl-3 text-[11px] leading-relaxed text-slate-ink">
            {finding.evidence.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </details>
      )}

      <DecisionControls finding={finding} decision={decision} onDecide={onDecide} />
    </article>
  );
}

export function FindingsList({
  report,
  selectedId,
  onSelect,
  filter,
  decisions,
  onDecide,
  renderExtra,
}: {
  report: SheetReport;
  selectedId: string | null;
  onSelect: (finding: Finding) => void;
  filter: Set<Severity>;
  decisions: Record<string, Decision>;
  onDecide: (id: string, decision: Decision) => void;
  /** Slot for a control a particular finding needs — a distance, say. */
  renderExtra?: (finding: Finding) => ReactNode;
}) {
  const shown = report.findings.filter((f) => filter.has(f.severity));

  if (!report.findings.length) {
    return (
      <div className="surface-card flex items-center gap-3 rounded-xl border-l-4 border-l-teal bg-white px-4 py-3 text-sm text-slate-ink">
        <Icon name="check-circle" size={18} className="text-teal" />
        Every claimed day matches a session in the record sheet, at the duration the course list gives
        it. Nothing to change.
      </div>
    );
  }

  if (!shown.length) {
    return (
      <p className="px-1 py-6 text-center text-sm text-slate-ink">
        Nothing at this level. {report.findings.length} finding
        {report.findings.length === 1 ? "" : "s"} hidden by the filter.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {SEVERITY_ORDER.filter((s) => filter.has(s)).map((severity) => {
        const group = shown.filter((f) => f.severity === severity);
        if (!group.length) return null;
        return (
          <section key={severity}>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-bold tracking-wide text-slate-ink uppercase">
              <span aria-hidden className={`h-2 w-2 rounded-full ${SEVERITY[severity].dot}`} />
              {group.length} {SEVERITY[severity].plural}
            </h3>
            <div className="space-y-2">
              {group.map((f) => (
                <FindingCard
                  key={f.id}
                  finding={f}
                  selected={f.id === selectedId}
                  onSelect={() => onSelect(f)}
                  decision={decisions[f.id] ?? "pending"}
                  onDecide={(d) => onDecide(f.id, d)}
                  extra={renderExtra?.(f)}
                  tabName={
                    f.sheet === "timesheet"
                      ? report.sheet.timeSheetName
                      : (report.sheet.verificationSheetName ?? "log")
                  }
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
