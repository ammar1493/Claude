"use client";

import { useMemo } from "react";
import { Alert, Card, SectionTitle } from "@/components/Card";
import { DataTable } from "@/components/DataTable";
import { Icon } from "@/components/Icons";
import Plot from "@/components/Plot";
import { groupBy, nDistinct } from "@/lib/agg";
import { NEFT_GOLD, NEFT_GREEN, NEFT_NAVY, NEFT_SLATE, NEFT_TEAL } from "@/lib/brand";
import { MANUAL_2023, TOTAL_2023_PARTICIPANTS } from "@/lib/config";
import { floorMonth, fmtMonthShort } from "@/lib/dates";
import { headroom, vbar } from "@/lib/plots";
import { fmtInt } from "@/lib/format";
import { useDashboard } from "@/state/DashboardContext";
import { projectGrandTotals, useProjectYears } from "./projectYears";

/** Percentage change in NEFT participants against the previous year. */
function yearChange(
  rows: { year: number; neftParticipants: number }[],
  year: number,
): number | null {
  const i = rows.findIndex((r) => r.year === year);
  if (i <= 0) return null;
  const prev = rows[i - 1].neftParticipants;
  if (!prev) return null;
  return ((rows[i].neftParticipants - prev) / prev) * 100;
}

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-ink/50">—</span>;
  const up = value >= 0;
  return (
    <span className={`font-semibold tabular-nums ${up ? "text-teal" : "text-slate-ink"}`}>
      {up ? "▲" : "▼"} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

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
        label: fmtMonthShort(new Date(m.year, m.monthNum - 1, 1)),
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
      .map((m) => ({ label: fmtMonthShort(m.month), participants: m.participants, sessions: m.sessions }));
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
      const neftParticipants = core?.participants ?? 0;
      const neftSessions = core?.sessions ?? 0;
      return {
        year,
        label: String(year),
        neftParticipants,
        neftSessions,
        qdParticipants: proj?.qdParticipants ?? 0,
        qdSessions: proj?.qdSessions ?? 0,
        tkParticipants: proj?.tkParticipants ?? 0,
        tkSessions: proj?.tkSessions ?? 0,
        grandParticipants:
          neftParticipants + (proj?.qdParticipants ?? 0) + (proj?.tkParticipants ?? 0),
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
            NEFT Data only; Qiddiya and Takamol are below. The grey bar is 2023, which
            predates the workbook and comes from the figures built into the app.
          </p>
          <Plot
            height={470}
            emptyMessage={yearly.length ? null : "No data loaded"}
            data={[
              vbar({
                labels: yearly.map((y) => String(y.year)),
                values: yearly.map((y) => y.participants),
                // 2023 predates the workbook and comes from the built-in
                // monthly table, so it is drawn as the different thing it is.
                color: yearly.map((y) => (y.sessions === null ? NEFT_SLATE : NEFT_NAVY)),
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

      <Card title="Year Totals" tone="navy">
        <p className="mb-3 text-xs text-slate-ink">
          The same figures as the charts above, exactly. Change is against the previous year.
        </p>
        <DataTable
          rows={combined}
          pageLength={12}
          dense
          emptyMessage="No data loaded"
          columns={[
            {
              key: "y",
              header: "Year",
              value: (r) => r.year,
              render: (r) => (
                <span className="font-bold text-navy">
                  {r.year}
                  {r.year === 2023 && <span className="ml-1 text-[10px] text-slate-ink">built-in</span>}
                </span>
              ),
            },
            {
              key: "n",
              header: "NEFT Participants",
              value: (r) => r.neftParticipants,
              align: "right",
              render: (r) => <span className="font-semibold tabular-nums">{fmtInt(r.neftParticipants)}</span>,
            },
            {
              key: "c",
              header: "Change",
              value: (r) => yearChange(combined, r.year) ?? -Infinity,
              align: "right",
              render: (r) => <Change value={yearChange(combined, r.year)} />,
            },
            {
              key: "s",
              header: "NEFT Sessions",
              value: (r) => r.neftSessions,
              align: "right",
              render: (r) => (
                <span className="tabular-nums">{r.neftSessions ? fmtInt(r.neftSessions) : "—"}</span>
              ),
            },
            {
              key: "q",
              header: "Qiddiya",
              value: (r) => r.qdParticipants,
              align: "right",
              render: (r) => (
                <span className="tabular-nums">{r.qdParticipants ? fmtInt(r.qdParticipants) : "—"}</span>
              ),
            },
            {
              key: "t",
              header: "Takamol",
              value: (r) => r.tkParticipants,
              align: "right",
              render: (r) => (
                <span className="tabular-nums">{r.tkParticipants ? fmtInt(r.tkParticipants) : "—"}</span>
              ),
            },
            {
              key: "g",
              header: "Grand Total",
              value: (r) => r.grandParticipants,
              align: "right",
              render: (r) => (
                <span className="font-bold tabular-nums text-navy">{fmtInt(r.grandParticipants)}</span>
              ),
            },
          ]}
        />
      </Card>

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
          NEFT Data, Qiddiya Academy and Takamol stacked into one figure per year.
        </p>
        <Plot
          height={420}
          emptyMessage={combined.length ? null : "No data loaded"}
          data={[
            vbar({
              labels: combined.map((c) => c.label),
              values: combined.map((c) => c.neftParticipants),
              color: NEFT_NAVY,
              name: "NEFT Data",
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
              xaxis: { title: { text: "" }, type: "category", tickangle: 0 },
              yaxis: {
                title: { text: "Participants" },
                tickformat: ",",
                range: headroom(monthly.map((m) => m.participants), 1.25),
              },
              margin: { l: 80, r: 50, t: 50, b: 50 },
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
              xaxis: { title: { text: "" }, type: "category", tickangle: 0 },
              yaxis: {
                title: { text: "Sessions" },
                tickformat: ",",
                range: headroom(monthlySessions.map((m) => m.sessions), 1.25),
              },
              margin: { l: 80, r: 50, t: 50, b: 50 },
              showlegend: false,
            }}
          />
        </Card>
      </div>
    </div>
  );
}
