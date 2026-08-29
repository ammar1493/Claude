"use client";

import { useMemo } from "react";
import { nDistinct, sumBy } from "@/lib/agg";
import { filterWindow, withDates } from "@/lib/manual";
import type { PeriodStats } from "@/lib/selectors";
import { useDashboard } from "@/state/DashboardContext";

export interface ProjectTotals {
  scope: "all" | "period";
  label: string;
  qdP: number;
  qdS: number;
  qdD: number;
  tkP: number;
  tkS: number;
  coreP: number;
  coreS: number;
  grandP: number;
  grandS: number;
}

/**
 * exec_project_totals(): Qiddiya = workbook + manual, Takamol = manual only,
 * core = the untouched NEFT dataset. "Cumulative" uses every record; "Selected
 * period only" clips all three to the executive period window.
 */
export function useProjectTotals(scope: "all" | "period", ps: PeriodStats): ProjectTotals {
  const { dataset, qiddiya, qdManual, tkManual } = useDashboard();

  return useMemo(() => {
    const window = scope === "period" ? { start: ps.curStart, end: ps.curEnd } : null;

    let sessions = qiddiya?.sessions ?? [];
    let days = qiddiya?.days ?? [];
    if (window) {
      sessions = sessions.filter((s) => s.date >= window.start && s.date <= window.end);
      days = days.filter((d) => d.date >= window.start && d.date <= window.end);
    }

    const qman = window ? filterWindow(qdManual, window.start, window.end) : withDates(qdManual);
    const tman = window ? filterWindow(tkManual, window.start, window.end) : withDates(tkManual);

    const qdP = sumBy(sessions, (s) => s.students) + sumBy(qman, (m) => m.participants);
    const qdS = sessions.length + sumBy(qman, (m) => m.sessions);
    const qdD = days.length + sumBy(qman, (m) => m.teachingDays);
    const tkP = sumBy(tman, (m) => m.participants);
    const tkS = sumBy(tman, (m) => m.sessions);

    const coreP = scope === "period" ? ps.cur.length : dataset.rows.length;
    const coreS =
      scope === "period"
        ? nDistinct(ps.cur.map((r) => r.actualSession))
        : nDistinct(dataset.rows.map((r) => r.actualSession));

    return {
      scope,
      label: scope === "period" ? ps.labelMain : "All records",
      qdP, qdS, qdD, tkP, tkS, coreP, coreS,
      grandP: coreP + qdP + tkP,
      grandS: coreS + qdS + tkS,
    };
  }, [scope, ps, qiddiya, qdManual, tkManual, dataset.rows]);
}
