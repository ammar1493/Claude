"use client";

import { useMemo } from "react";
import { Alert, Card, SectionTitle } from "@/components/Card";
import { Icon } from "@/components/Icons";
import Plot from "@/components/Plot";
import { groupBy, nDistinct } from "@/lib/agg";
import { NEFT_GOLD, NEFT_GREEN, NEFT_NAVY, NEFT_TEAL } from "@/lib/brand";
import { MANUAL_2023, TOTAL_2023_PARTICIPANTS } from "@/lib/config";
import { floorMonth, fmtMonthYear } from "@/lib/dates";
import { headroom, vbar } from "@/lib/plots";
import { fmtInt } from "@/lib/format";
import { useDashboard } from "@/state/DashboardContext";
import { projectGrandTotals, useProjectYears } from "./projectYears";

export function YearOverYear() {
  const { dataset, filters } = useDashboard();
  const rows = dataset.rows;

  /** yearly_comparison_data(): the workbook years plus the manual 2023 total. */
  const yearly = useMemo(() => {
    const fromWorkbook = [...groupBy(rows, (r) => r.date.getFullYear()).entries()].map(
      ([year, rs]) => ({
        year,
        participants: rs.length,
        sessions: nDistinct(rs.map((r) => r.actualSession)) as number | null,
      }),
    );
    return [{ year: 2023, participants: TOTAL_2023_PARTICIPANTS, sessions: null }, ...fromWorkbook].sort(
      (a, b) => a.year - b.year,
    );
  }, [rows]);

  const yearlySessions = yearly.filter((y) => y.sessions !== null) as {
    year: number;
    participants: number;
    sessions: number;
  }[];

  /** monthly_comparison_data(): 2023 comes from the manual table. */
  const monthly = useMemo(() => {
    const year = Number(filters.year);
    if (year === 2023) {
      return MANUAL_2023.map((m) => ({
        label: fmtMonthYear(new Date(m.year, m.monthNum - 1, 1)),
        participants: m.participants,
        sessions: null as number | null,
      }));
    }
    const buckets = groupBy(
      rows.filter((r) => r.date.getFullYear() === year),
      (r) => floorMonth(r.date).getTime(),
    );
    return [...buckets.entries()]
      .map(([t, rs]) => ({
        month: new Date(t),
        participants: rs.length,
        sessions: nDistinct(rs.map((r) => r.actualSession)) as number | null,
      }))
      .sort((a, b) => a.month.getTime() - b.month.getTime())
      .map((m) => ({ label: fmtMonthYear(m.month), participants: m.participants, sessions: m.sessions }));
  }, [rows, filters.year]);

  const monthlySessions = monthly.filter((m) => m.sessions !== null) as {
    label: string;
    participants: number;
    sessions: number;
  }[];

  /**
   * Qiddiya and Takamol by year, lined up against the core dataset. The year
   * axis is the union of both, so a project year with no core records (or the
   * reverse) still gets a column.
   */
  const projectYears = useProjectYears();
  const projectTotals = projectGrandTotals(projectYears);
  const hasProjects = projectTotals.qdParticipants + projectTotals.tkParticipants > 0;

  const combined = useMemo(() => {
    const years = [...new Set([...yearly.map((y) => y.year), ...projectYears.map((y) => y.year)])].sort(
      (a, b) => a - b,
    );
    return years.map((year) => {
      const core = yearly.find((y) => y.year === year);
      const proj = projectYears.find((y) => y.year === year);
      const coreParticipants = core?.participants ?? 0;
      const coreSessions = core?.sessions ?? 0;
      return {
        year,
        label: String(year),
        coreParticipants,
        coreSessions,
        qdParticipants: proj?.qdParticipants ?? 0,
        qdSessions: proj?.qdSessions ?? 0,
        tkParticipants: proj?.tkParticipants ?? 0,
        tkSessions: proj?.tkSessions ?? 0,
        grandParticipants:
          coreParticipants + (proj?.qdParticipants ?? 0) + (proj?.tkParticipants ?? 0),
      };
    });
  }, [yearly, projectYears]);

  const projectsEmpty = hasProjects
    ? null
    : "No Qiddiya or Takamol figures yet — add a QCTA workbook on the Qiddiya Academy tab, or enter months manually there and on the Takamol tab.";

  /** A year with no activity for a project shows no label, only the gap. */
  const sparseLabels = (values: number[]) => values.map((v) => (v ? fmtInt(v) : ""));

  return (
    <div className="space-y-6">
      <Alert tone="info" icon={<Icon name="info" size={16} />}>
        <strong>Multi-Year Analysis:</strong> Compare performance across every year in the workbook, plus
        the 2023 figures built into the app, and the Qiddiya and Takamol projects.
      </Alert>

      <SectionTitle>Annual Performance Comparison</SectionTitle>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Total Participants by Year" tone="marked">
          <p className="mb-2 text-xs text-slate-ink">
            Core NEFT dataset only. Qiddiya and Takamol are shown separately below.
          </p>
          <Plot
            height={470}
            emptyMessage={yearly.length ? null : "No data loaded"}
            data={[
              vbar({
                labels: yearly.map((y) => String(y.year)),
                values: yearly.map((y) => y.participants),
                color: NEFT_NAVY,
                textSize: 14,
                hovertemplate: "<b>%{x}</b><br>Participants: %{y:,}<extra></extra>",
              }),
            ]}
            layout={{
              xaxis: { title: { text: "Year" }, type: "category" },
              yaxis: {
                title: { text: "Participants" },
                tickformat: ",",
                range: headroom(yearly.map((y) => y.participants)),
              },
              margin: { l: 70, r: 50, t: 50, b: 50 },
              showlegend: false,
            }}
          />
        </Card>

        <Card title="Total Sessions by Year" tone="marked">
          <p className="mb-2 text-xs italic text-slate-500">Note: Session data not available for 2023</p>
          <Plot
            height={440}
            emptyMessage={yearlySessions.length ? null : "No session data available"}
            data={[
              vbar({
                labels: yearlySessions.map((y) => String(y.year)),
                values: yearlySessions.map((y) => y.sessions),
                color: NEFT_GOLD,
                textSize: 14,
                hovertemplate: "<b>%{x}</b><br>Sessions: %{y:,}<extra></extra>",
              }),
            ]}
            layout={{
              xaxis: { title: { text: "Year" }, type: "category" },
              yaxis: {
                title: { text: "Sessions" },
                tickformat: ",",
                range: headroom(yearlySessions.map((y) => y.sessions)),
              },
              margin: { l: 70, r: 50, t: 50, b: 50 },
              showlegend: false,
            }}
          />
        </Card>
      </div>

      <SectionTitle className="mt-4">Special Projects by Year</SectionTitle>
      <p className="-mt-3 text-sm text-slate-ink">
        Qiddiya Academy combines the QCTA workbook with its manual months; Takamol is entered
        manually. Neither responds to the sidebar filters.
        {hasProjects && (
          <>
            {" "}
            Across all years: Qiddiya <strong className="text-navy">{fmtInt(projectTotals.qdParticipants)}</strong>{" "}
            participants over {fmtInt(projectTotals.qdSessions)} sessions, Takamol{" "}
            <strong className="text-navy">{fmtInt(projectTotals.tkParticipants)}</strong> participants.
          </>
        )}
      </p>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Project Participants by Year" tone="marked">
          <Plot
            height={420}
            emptyMessage={projectsEmpty}
            data={[
              vbar({
                labels: combined.map((c) => c.label),
                values: combined.map((c) => c.qdParticipants),
                text: sparseLabels(combined.map((c) => c.qdParticipants)),
                color: NEFT_TEAL,
                name: "Qiddiya Academy",
                textSize: 12,
                hovertemplate: "<b>%{x}</b><br>Qiddiya participants: %{y:,}<extra></extra>",
              }),
              vbar({
                labels: combined.map((c) => c.label),
                values: combined.map((c) => c.tkParticipants),
                text: sparseLabels(combined.map((c) => c.tkParticipants)),
                color: NEFT_GREEN,
                name: "Takamol",
                textSize: 12,
                hovertemplate: "<b>%{x}</b><br>Takamol participants: %{y:,}<extra></extra>",
              }),
            ]}
            layout={{
              barmode: "group",
              xaxis: { title: { text: "Year" }, type: "category" },
              yaxis: {
                title: { text: "Participants" },
                tickformat: ",",
                range: headroom(
                  combined.flatMap((c) => [c.qdParticipants, c.tkParticipants]),
                  1.25,
                ),
              },
              legend: { orientation: "h", x: 0, y: 1.1, font: { size: 11 } },
              margin: { l: 70, r: 50, t: 55, b: 50 },
              showlegend: true,
            }}
          />
        </Card>

        <Card title="Project Sessions by Year" tone="marked">
          <Plot
            height={420}
            emptyMessage={projectsEmpty}
            data={[
              vbar({
                labels: combined.map((c) => c.label),
                values: combined.map((c) => c.qdSessions),
                text: sparseLabels(combined.map((c) => c.qdSessions)),
                color: NEFT_TEAL,
                name: "Qiddiya Academy",
                textSize: 12,
                hovertemplate: "<b>%{x}</b><br>Qiddiya sessions: %{y:,}<extra></extra>",
              }),
              vbar({
                labels: combined.map((c) => c.label),
                values: combined.map((c) => c.tkSessions),
                text: sparseLabels(combined.map((c) => c.tkSessions)),
                color: NEFT_GREEN,
                name: "Takamol",
                textSize: 12,
                hovertemplate: "<b>%{x}</b><br>Takamol sessions: %{y:,}<extra></extra>",
              }),
            ]}
            layout={{
              barmode: "group",
              xaxis: { title: { text: "Year" }, type: "category" },
              yaxis: {
                title: { text: "Sessions" },
                tickformat: ",",
                range: headroom(combined.flatMap((c) => [c.qdSessions, c.tkSessions]), 1.25),
              },
              legend: { orientation: "h", x: 0, y: 1.1, font: { size: 11 } },
              margin: { l: 70, r: 50, t: 55, b: 50 },
              showlegend: true,
            }}
          />
        </Card>
      </div>

      <Card title="Grand Total Participants by Year" tone="navy">
        <p className="mb-2 text-xs text-slate-ink">
          Core NEFT dataset, Qiddiya Academy and Takamol stacked into one figure per year.
        </p>
        <Plot
          height={420}
          emptyMessage={combined.length ? null : "No data loaded"}
          data={[
            vbar({
              labels: combined.map((c) => c.label),
              values: combined.map((c) => c.coreParticipants),
              color: NEFT_NAVY,
              name: "Core NEFT",
              text: [],
              hovertemplate: "<b>%{x}</b><br>Core: %{y:,}<extra></extra>",
            }),
            vbar({
              labels: combined.map((c) => c.label),
              values: combined.map((c) => c.qdParticipants),
              color: NEFT_TEAL,
              name: "Qiddiya Academy",
              text: [],
              hovertemplate: "<b>%{x}</b><br>Qiddiya: %{y:,}<extra></extra>",
            }),
            vbar({
              labels: combined.map((c) => c.label),
              values: combined.map((c) => c.tkParticipants),
              color: NEFT_GREEN,
              name: "Takamol",
              text: [],
              hovertemplate: "<b>%{x}</b><br>Takamol: %{y:,}<extra></extra>",
            }),
            // A transparent trace carries the stack total as an outside label.
            {
              type: "scatter",
              mode: "text",
              x: combined.map((c) => c.label),
              y: combined.map((c) => c.grandParticipants),
              text: combined.map((c) => fmtInt(c.grandParticipants)),
              textposition: "top center",
              textfont: { size: 13, color: NEFT_NAVY },
              showlegend: false,
              hoverinfo: "skip",
            },
          ]}
          layout={{
            barmode: "stack",
            xaxis: { title: { text: "Year" }, type: "category" },
            yaxis: {
              title: { text: "Participants" },
              tickformat: ",",
              range: headroom(combined.map((c) => c.grandParticipants), 1.2),
            },
            legend: { orientation: "h", x: 0, y: 1.1, font: { size: 11 } },
            margin: { l: 70, r: 50, t: 55, b: 50 },
            showlegend: true,
          }}
        />
      </Card>

      <div>
        <SectionTitle className="mt-4">Monthly Analysis</SectionTitle>
        <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
          <Icon name="filter" size={15} />
          Use the &ldquo;Year for Analysis&rdquo; filter in the sidebar to select which year to view.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={`Participants by Month — ${filters.year}`} tone="marked">
          <Plot
            height={470}
            emptyMessage={monthly.length ? null : `No records for ${filters.year}`}
            data={[
              vbar({
                labels: monthly.map((m) => m.label),
                values: monthly.map((m) => m.participants),
                color: NEFT_NAVY,
                hovertemplate: "<b>%{x}</b><br>Participants: %{y:,}<extra></extra>",
              }),
            ]}
            layout={{
              xaxis: { title: { text: "" }, tickangle: -45, type: "category" },
              yaxis: {
                title: { text: "Participants" },
                tickformat: ",",
                range: headroom(monthly.map((m) => m.participants)),
              },
              margin: { l: 70, r: 50, t: 50, b: 110 },
              showlegend: false,
            }}
          />
        </Card>

        <Card title={`Sessions by Month — ${filters.year}`} tone="marked">
          {filters.year === "2023" && (
            <p className="mb-2 text-xs italic text-slate-500">Session data not available for 2023</p>
          )}
          <Plot
            height={440}
            emptyMessage={monthlySessions.length ? null : "No session data available"}
            data={[
              vbar({
                labels: monthlySessions.map((m) => m.label),
                values: monthlySessions.map((m) => m.sessions),
                color: NEFT_GOLD,
                hovertemplate: "<b>%{x}</b><br>Sessions: %{y:,}<extra></extra>",
              }),
            ]}
            layout={{
              xaxis: { title: { text: "" }, tickangle: -45, type: "category" },
              yaxis: {
                title: { text: "Sessions" },
                tickformat: ",",
                range: headroom(monthlySessions.map((m) => m.sessions)),
              },
              margin: { l: 70, r: 50, t: 50, b: 110 },
              showlegend: false,
            }}
          />
        </Card>
      </div>
    </div>
  );
}
