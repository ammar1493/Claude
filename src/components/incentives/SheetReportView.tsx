"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildPlan } from "@/lib/incentives/correct";
import { siteKey } from "@/lib/incentives/sites";
import type { Decision, Finding, Severity, SheetReport, SiteDistance } from "@/lib/incentives/types";
import { Card, SectionTitle } from "../Card";
import { Icon } from "../Icons";
import { ClaimGrid } from "./ClaimGrid";
import { CorrectionPanel } from "./CorrectionPanel";
import { DayLedger } from "./DayLedger";
import { cssId, FindingsList } from "./FindingsList";
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

export function SheetReportView({
  report,
  original,
  sites,
  onSetSite,
}: {
  report: SheetReport;
  /** The uploaded workbook, so a corrected copy can be written from it. */
  original: ArrayBuffer | null;
  sites: SiteDistance[];
  onSetSite: (name: string, patch: Partial<SiteDistance>) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<Set<Severity>>(new Set(SEVERITY_ORDER));
  /*
   * Decisions are keyed on the finding id, which is derived from what the
   * finding is about — so setting a distance re-runs the rules without losing
   * the calls already made on everything else.
   */
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});

  // A different trainer is a different sheet; keep nothing from the last one.
  useEffect(() => {
    setSelected(null);
    setDecisions({});
  }, [report.sheet.fileName]);

  const decide = useCallback((id: string, decision: Decision) => {
    setDecisions((prev) => ({ ...prev, [id]: decision }));
  }, []);

  const decideMany = useCallback((ids: string[], decision: Decision) => {
    setDecisions((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = decision;
      return next;
    });
  }, []);

  const accepted = useMemo(
    () => new Set(report.findings.filter((f) => decisions[f.id] === "accepted").map((f) => f.id)),
    [report.findings, decisions],
  );
  const plan = useMemo(() => buildPlan(report, accepted), [report, accepted]);

  const select = (finding: Finding) => {
    setSelected(finding.id);
    document
      .getElementById(`finding-${cssId(finding.id)}`)
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
          <ClaimGrid report={report} selectedId={selected} onSelect={select} edits={plan.edits} />
          <p className="no-print mt-2 px-2 text-[11px] text-slate-ink">
            <Icon name="info" size={12} className="mr-1 inline align-[-2px]" />
            Every tick the record sheet backs is navy; a coloured tick carries a finding — select one
            to read why.
            {plan.edits.length > 0 && (
              <>
                {" "}
                A struck-through tick will be cleared and a teal <strong>+</strong> added, so this is
                the corrected sheet as it will be written.
              </>
            )}
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
          <CorrectionPanel
            report={report}
            decisions={decisions}
            plan={plan}
            original={original}
            onDecideMany={decideMany}
          />
          <FindingsList
            report={report}
            selectedId={selected}
            onSelect={select}
            filter={filter}
            decisions={decisions}
            onDecide={decide}
            renderExtra={(finding) =>
              finding.code === "site-unknown" ? (
                <SiteQuickSet finding={finding} sites={sites} onSetSite={onSetSite} />
              ) : null
            }
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Setting a distance where the question is asked.
 *
 * "How far is SANAD?" is answerable in the two seconds it takes to type a
 * number; sending the verifier to another tab to do it, and back again to find
 * their place, is not.
 */
function SiteQuickSet({
  finding,
  sites,
  onSetSite,
}: {
  finding: Finding;
  sites: SiteDistance[];
  onSetSite: (name: string, patch: Partial<SiteDistance>) => void;
}) {
  // The site's name is the first thing the title asks about.
  const name = finding.title.replace(/^How far is /, "").replace(/\?$/, "").trim();
  const site = sites.find((s) => siteKey(s.name) === siteKey(name));
  const [km, setKm] = useState("");

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="no-print mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-fog px-2.5 py-2"
    >
      <label className="text-[11px] font-bold text-navy" htmlFor={`km-${cssId(finding.id)}`}>
        {name}
      </label>
      <input
        id={`km-${cssId(finding.id)}`}
        type="number"
        min={0}
        value={km}
        placeholder="km"
        onChange={(e) => setKm(e.target.value)}
        onBlur={() => {
          const n = Number(km.trim());
          if (km.trim() !== "" && Number.isFinite(n)) onSetSite(name, { kind: "site", km: n });
        }}
        className="w-20 rounded-md border border-hairline bg-white px-2 py-1 text-right text-xs tabular-nums text-navy outline-none focus:border-gold focus:ring-2 focus:ring-gold/30"
      />
      <button
        type="button"
        onClick={() => onSetSite(name, { kind: "rig", km: null })}
        className={`rounded-md px-2 py-1 text-[11px] font-bold transition-colors duration-150 ${
          site?.kind === "rig" ? "bg-teal text-white" : "bg-navy-050 text-navy hover:bg-navy hover:text-white"
        }`}
      >
        It is a rig or well
      </button>
      <span className="text-[11px] text-slate-ink">Saved for every month after this one.</span>
    </div>
  );
}
