"use client";

import { useMemo, useState } from "react";
import { buildCorrectedWorkbook, previewRows, type CorrectionPlan } from "@/lib/incentives/correct";
import type { Decision, Finding, SheetReport } from "@/lib/incentives/types";
import { Card } from "../Card";
import { Icon } from "../Icons";
import { SEVERITY } from "./severity";

const sar = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * Decide, then generate.
 *
 * A verifier goes through the findings saying "yes, change that" or "no, the
 * trainer is right" — and what comes out is the trainer's own workbook with
 * the agreed changes made, same template, ready to sign. Nothing is applied
 * that was not accepted, and anything accepted that has no mechanical fix is
 * listed rather than quietly dropped.
 */
export function CorrectionPanel({
  report,
  decisions,
  plan,
  original,
  onDecideMany,
}: {
  report: SheetReport;
  decisions: Record<string, Decision>;
  /** Built once by the report view, which also draws it onto the grid. */
  plan: CorrectionPlan;
  original: ArrayBuffer | null;
  onDecideMany: (ids: string[], decision: Decision) => void;
}) {
  const [rebuildLog, setRebuildLog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ applied: string[]; skipped: string[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPlan, setShowPlan] = useState(false);

  const acceptedCount = report.findings.filter((f) => decisions[f.id] === "accepted").length;
  const rows = useMemo(() => previewRows(report, plan), [report, plan]);
  const newTotal = rows.reduce((s, r) => s + r.total, 0);

  const undecided = report.findings.filter((f) => (decisions[f.id] ?? "pending") === "pending");
  const mustChange = report.findings.filter(
    (f) => f.severity === "error" && f.fix && f.fix.length && (decisions[f.id] ?? "pending") === "pending",
  );

  const generate = async () => {
    if (!original) {
      setError("The original workbook is no longer in this browser — re-upload the sheet to generate a corrected copy.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const out = await buildCorrectedWorkbook(original, report, plan, { rebuildLog });
      const url = URL.createObjectURL(
        new Blob([out.data as BlobPart], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = out.fileName;
      // Chromium only honours the download attribute on an anchor that is in
      // the document; detached, the file saves as "download".
      a.style.display = "none";
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setResult({ applied: out.applied, skipped: out.skipped, total: out.newTotal });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Corrected sheet" tone="marked">
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
          <span className="text-slate-ink">
            <span className="font-bold text-navy">{acceptedCount}</span> accepted ·{" "}
            <span className="font-bold text-navy">
              {report.findings.filter((f) => decisions[f.id] === "kept").length}
            </span>{" "}
            kept as claimed ·{" "}
            <span className={undecided.length ? "font-bold text-gold" : "text-slate-ink"}>
              {undecided.length} still to decide
            </span>
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!mustChange.length}
            onClick={() => onDecideMany(mustChange.map((f) => f.id), "accepted")}
            className="rounded-md bg-navy px-3 py-1.5 text-xs font-bold text-white transition-[background-color,scale] duration-150 ease-out hover:bg-navy-600 active:scale-[0.96] disabled:opacity-40 disabled:active:scale-100"
          >
            Accept the {mustChange.length} must-change {mustChange.length === 1 ? "fix" : "fixes"}
          </button>
          <button
            type="button"
            disabled={!undecided.length}
            onClick={() => onDecideMany(undecided.map((f) => f.id), "kept")}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-ink transition-colors duration-150 hover:bg-navy-050 hover:text-navy disabled:opacity-40"
          >
            Keep the rest as claimed
          </button>
          {acceptedCount > 0 && (
            <button
              type="button"
              onClick={() => onDecideMany(report.findings.map((f) => f.id), "pending")}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-ink transition-colors duration-150 hover:bg-navy-050 hover:text-navy"
            >
              Start again
            </button>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-fog px-3 py-2">
            <dt className="text-[11px] font-bold tracking-wide text-slate-ink uppercase">On the sheet</dt>
            <dd className="text-lg font-black tabular-nums text-navy">{sar(report.claimedTotal)} SAR</dd>
          </div>
          <div className="rounded-lg bg-fog px-3 py-2">
            <dt className="text-[11px] font-bold tracking-wide text-slate-ink uppercase">After the fixes</dt>
            <dd className="text-lg font-black tabular-nums text-teal">{sar(newTotal)} SAR</dd>
          </div>
          <div className="rounded-lg bg-fog px-3 py-2">
            <dt className="text-[11px] font-bold tracking-wide text-slate-ink uppercase">Cells changed</dt>
            <dd className="text-lg font-black tabular-nums text-navy">{plan.edits.length}</dd>
          </div>
        </dl>

        {plan.conflicts.length > 0 && (
          <div className={`rounded-lg px-3 py-2 text-xs ${SEVERITY.error.chip}`}>
            <strong>Two accepted corrections disagree.</strong>{" "}
            {plan.conflicts.map((c) => `${c.cell} would be set to ${c.values.join(" and to ")}`).join("; ")}. Keep
            one of them as claimed before generating.
          </div>
        )}

        {plan.acknowledged.length > 0 && (
          <p className="text-xs leading-relaxed text-slate-ink">
            {plan.acknowledged.length} accepted finding{plan.acknowledged.length === 1 ? "" : "s"} cannot be
            fixed by changing a cell — a conflict to settle, a session number to look up. They stay on the
            report for whoever signs it.
          </p>
        )}

        <label className="flex items-start gap-2 text-xs leading-relaxed text-slate-ink">
          <input
            type="checkbox"
            checked={rebuildLog}
            onChange={(e) => setRebuildLog(e.target.checked)}
            className="mt-0.5 accent-navy"
          />
          <span>
            <strong className="text-navy">Rewrite the verification log from the record sheet.</strong> One line
            per session actually delivered — date, course, location, session number and the duration the
            course list gives it — plus any timecard days. Off, only the lines with findings are corrected.
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void generate()}
            disabled={busy || plan.conflicts.length > 0 || !original}
            className="flex items-center gap-1.5 rounded-md bg-gold px-4 py-2 text-sm font-bold text-navy transition-[filter,scale] duration-150 ease-out hover:brightness-105 active:scale-[0.96] disabled:opacity-50 disabled:active:scale-100"
          >
            <Icon name="download" size={15} />
            {busy ? "Writing…" : "Generate the corrected sheet"}
          </button>
          {plan.edits.length > 0 && (
            <button
              type="button"
              onClick={() => setShowPlan((v) => !v)}
              className="rounded-md px-2.5 py-2 text-xs font-medium text-slate-ink transition-colors duration-150 hover:bg-navy-050 hover:text-navy"
            >
              {showPlan ? "Hide" : "Show"} the {plan.edits.length} changes
            </button>
          )}
        </div>

        <p className="text-[11px] leading-relaxed text-slate-ink">
          The file that comes out is this trainer&apos;s own workbook — same template, same rates, same
          signature blocks — with only the accepted cells rewritten and the totals recalculated.
        </p>

        {showPlan && (
          <div className="neft-scroll max-h-64 overflow-auto rounded-lg border border-hairline">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-fog">
                <tr className="text-[10px] font-bold tracking-wide text-slate-ink uppercase">
                  <th className="px-2 py-1.5">Tab</th>
                  <th className="px-2 py-1.5">Cell</th>
                  <th className="px-2 py-1.5">Change</th>
                </tr>
              </thead>
              <tbody>
                {plan.edits.map((e) => (
                  <tr key={`${e.sheet}-${e.cell}`} className="border-t border-hairline">
                    <td className="px-2 py-1 text-slate-ink">
                      {e.sheet === "timesheet" ? report.sheet.timeSheetName : report.sheet.verificationSheetName}
                    </td>
                    <td className="px-2 py-1 font-mono text-[11px] text-navy">{e.cell}</td>
                    <td className="px-2 py-1 text-slate-ink">{e.describe}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && <p className={`rounded-lg px-3 py-2 text-xs ${SEVERITY.error.chip}`}>{error}</p>}

        {result && (
          <div className="rounded-lg border-l-4 border-l-teal bg-fog px-3 py-2 text-xs leading-relaxed text-slate-ink">
            <strong className="text-navy">Downloaded.</strong> {result.applied.length} change
            {result.applied.length === 1 ? "" : "s"} made, new total {sar(result.total)} SAR.
            {result.skipped.length > 0 && (
              <>
                {" "}
                {result.skipped.length} could not be applied: {result.skipped.slice(0, 3).join("; ")}
                {result.skipped.length > 3 ? " …" : ""}
              </>
            )}{" "}
            Open it, check it reads right, and send it back to the trainer to sign.
          </div>
        )}
      </div>
    </Card>
  );
}

/** The Apply / Keep buttons that sit on each finding card. */
export function DecisionControls({
  finding,
  decision,
  onDecide,
}: {
  finding: Finding;
  decision: Decision;
  onDecide: (decision: Decision) => void;
}) {
  const applicable = Boolean(finding.fix && finding.fix.length);
  return (
    <div className="no-print mt-2 flex flex-wrap items-center gap-1.5 border-t border-hairline pt-2">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDecide(decision === "accepted" ? "pending" : "accepted");
        }}
        aria-pressed={decision === "accepted"}
        className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.95] ${
          decision === "accepted" ? "bg-teal text-white" : "bg-navy-050 text-navy hover:bg-navy hover:text-white"
        }`}
      >
        {applicable ? "Apply the fix" : "Accept — note it"}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDecide(decision === "kept" ? "pending" : "kept");
        }}
        aria-pressed={decision === "kept"}
        className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.95] ${
          decision === "kept" ? "bg-navy text-white" : "text-slate-ink hover:bg-navy-050 hover:text-navy"
        }`}
      >
        Keep as claimed
      </button>
      {applicable && (
        <span className="font-mono text-[10px] text-slate-ink/70">
          {finding.fix!.map((e) => e.describe).join(" · ")}
        </span>
      )}
      {!applicable && (
        <span className="text-[10px] text-slate-ink/70">No cell change — this one needs a person.</span>
      )}
    </div>
  );
}
