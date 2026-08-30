"use client";

import { useMemo } from "react";
import { nDistinct, sumBy } from "@/lib/agg";
import { filterWindow, withDates } from "@/lib/manual";
import type { PeriodStats } from "@/lib/selectors";
import type { ManualEntry, QiddiyaStore } from "@/lib/types";
import { useDashboard } from "@/state/DashboardContext";

export interface ProjectSplit {
  qdParticipants: number;
  qdSessions: number;
  qdDays: number;
  tkParticipants: number;
  tkSessions: number;
  participants: number;
  sessions: number;
}

const EMPTY: ProjectSplit = {
  qdParticipants: 0,
  qdSessions: 0,
  qdDays: 0,
  tkParticipants: 0,
  tkSessions: 0,
  participants: 0,
  sessions: 0,
};

/**
 * Qiddiya + Takamol totals over an arbitrary window, or over every record when
 * the window is null. Qiddiya is the QCTA workbook plus its manual months;
 * Takamol is manual only.
 *
 * Neither carries a client or course, so neither responds to those filters —
 * the split is always surfaced next to the combined figure so the make-up of a
 * filtered number stays readable.
 */
export function projectTotalsForWindow(
  qiddiya: QiddiyaStore | null,
  qdManual: ManualEntry[],
  tkManual: ManualEntry[],
  window: { start: Date; end: Date } | null,
): ProjectSplit {
  let sessions = qiddiya?.sessions ?? [];
  let days = qiddiya?.days ?? [];
  if (window) {
    sessions = sessions.filter((s) => s.date >= window.start && s.date <= window.end);
    days = days.filter((d) => d.date >= window.start && d.date <= window.end);
  }

  const qman = window ? filterWindow(qdManual, window.start, window.end) : withDates(qdManual);
  const tman = window ? filterWindow(tkManual, window.start, window.end) : withDates(tkManual);

  const qdParticipants = sumBy(sessions, (s) => s.students) + sumBy(qman, (m) => m.participants);
  const qdSessions = sessions.length + sumBy(qman, (m) => m.sessions);
  const qdDays = days.length + sumBy(qman, (m) => m.teachingDays);
  const tkParticipants = sumBy(tman, (m) => m.participants);
  const tkSessions = sumBy(tman, (m) => m.sessions);

  return {
    qdParticipants,
    qdSessions,
    qdDays,
    tkParticipants,
    tkSessions,
    participants: qdParticipants + tkParticipants,
    sessions: qdSessions + tkSessions,
  };
}

export interface ProjectTotals extends ProjectSplit {
  scope: "all" | "period";
  label: string;
  /** The NEFT training workbook on its own. */
  neftParticipants: number;
  neftSessions: number;
  grandParticipants: number;
  grandSessions: number;
}

/** exec_project_totals(): the Special Projects card, with its own scope toggle. */
export function useProjectTotals(scope: "all" | "period", ps: PeriodStats): ProjectTotals {
  const { dataset, qiddiya, qdManual, tkManual } = useDashboard();

  return useMemo(() => {
    const window = scope === "period" ? { start: ps.curStart, end: ps.curEnd } : null;
    const split = projectTotalsForWindow(qiddiya, qdManual, tkManual, window);

    const neftParticipants = scope === "period" ? ps.cur.length : dataset.rows.length;
    const neftSessions =
      scope === "period"
        ? nDistinct(ps.cur.map((r) => r.actualSession))
        : nDistinct(dataset.rows.map((r) => r.actualSession));

    return {
      ...split,
      scope,
      label: scope === "period" ? ps.labelMain : "All records",
      neftParticipants,
      neftSessions,
      grandParticipants: neftParticipants + split.participants,
      grandSessions: neftSessions + split.sessions,
    };
  }, [scope, ps, qiddiya, qdManual, tkManual, dataset.rows]);
}

/**
 * The headline KPIs: the NEFT workbook plus both projects, for the executive
 * period and for the comparable prior period.
 */
export function usePeriodTotals(ps: PeriodStats) {
  const { qiddiya, qdManual, tkManual } = useDashboard();

  return useMemo(() => {
    const cur = projectTotalsForWindow(qiddiya, qdManual, tkManual, {
      start: ps.curStart,
      end: ps.curEnd,
    });
    const prev = projectTotalsForWindow(qiddiya, qdManual, tkManual, {
      start: ps.prevStart,
      end: ps.prevEnd,
    });

    const neftCurParticipants = ps.cur.length;
    const neftPrevParticipants = ps.prev.length;
    const neftCurSessions = nDistinct(ps.cur.map((r) => r.actualSession));
    const neftPrevSessions = nDistinct(ps.prev.map((r) => r.actualSession));

    const participants = neftCurParticipants + cur.participants;
    const sessions = neftCurSessions + cur.sessions;

    return {
      split: cur,
      neftParticipants: neftCurParticipants,
      neftSessions: neftCurSessions,
      participants,
      sessions,
      prevParticipants: neftPrevParticipants + prev.participants,
      prevSessions: neftPrevSessions + prev.sessions,
      avgClassSize: sessions ? Math.round((participants / sessions) * 10) / 10 : null,
      hasProjects: cur.participants + cur.sessions > 0,
    };
  }, [ps, qiddiya, qdManual, tkManual]);
}
