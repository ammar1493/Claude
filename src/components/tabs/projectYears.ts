"use client";

import { useMemo } from "react";
import { sumBy } from "@/lib/agg";
import { withDates } from "@/lib/manual";
import { useDashboard } from "@/state/DashboardContext";

export interface ProjectYear {
  year: number;
  qdParticipants: number;
  qdSessions: number;
  qdDays: number;
  tkParticipants: number;
  tkSessions: number;
}

/**
 * Qiddiya and Takamol totals broken down by calendar year, for the
 * Year-over-Year tab.
 *
 * Qiddiya = the QCTA workbook (dated per session) plus its manual months;
 * Takamol is manual only. Both are independent of the sidebar filters, exactly
 * as they are on their own tabs and in the Executive Summary.
 */
export function useProjectYears(): ProjectYear[] {
  const { qiddiya, qdManual, tkManual } = useDashboard();

  return useMemo(() => {
    const byYear = new Map<number, ProjectYear>();
    const at = (year: number): ProjectYear => {
      let hit = byYear.get(year);
      if (!hit) {
        hit = {
          year,
          qdParticipants: 0,
          qdSessions: 0,
          qdDays: 0,
          tkParticipants: 0,
          tkSessions: 0,
        };
        byYear.set(year, hit);
      }
      return hit;
    };

    for (const s of qiddiya?.sessions ?? []) {
      const y = at(s.date.getFullYear());
      y.qdParticipants += s.students;
      y.qdSessions += 1;
    }
    for (const d of qiddiya?.days ?? []) {
      at(d.date.getFullYear()).qdDays += 1;
    }
    for (const m of withDates(qdManual)) {
      const y = at(m.year);
      y.qdParticipants += m.participants;
      y.qdSessions += m.sessions;
      y.qdDays += m.teachingDays;
    }
    for (const m of withDates(tkManual)) {
      const y = at(m.year);
      y.tkParticipants += m.participants;
      y.tkSessions += m.sessions;
    }

    return [...byYear.values()].sort((a, b) => a.year - b.year);
  }, [qiddiya, qdManual, tkManual]);
}

/** Totals across every year, for the section's summary line. */
export function projectGrandTotals(rows: ProjectYear[]) {
  return {
    qdParticipants: sumBy(rows, (r) => r.qdParticipants),
    qdSessions: sumBy(rows, (r) => r.qdSessions),
    tkParticipants: sumBy(rows, (r) => r.tkParticipants),
    tkSessions: sumBy(rows, (r) => r.tkSessions),
  };
}
