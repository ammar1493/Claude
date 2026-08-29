"use client";

import { useMemo } from "react";
import { Alert, Card, SectionTitle } from "@/components/Card";
import { Icon } from "@/components/Icons";
import Plot from "@/components/Plot";
import { groupBy, nDistinct } from "@/lib/agg";
import { NEFT_GOLD, NEFT_NAVY } from "@/lib/brand";
import { MANUAL_2023, TOTAL_2023_PARTICIPANTS } from "@/lib/config";
import { floorMonth, fmtMonthYear } from "@/lib/dates";
import { headroom, vbar } from "@/lib/plots";
import { useDashboard } from "@/state/DashboardContext";

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

  return (
    <div className="space-y-6">
      <Alert tone="info" icon={<Icon name="info" size={16} />}>
        <strong>Multi-Year Analysis:</strong> Compare performance across 2023, 2024, and 2025.
      </Alert>

      <SectionTitle>Annual Performance Comparison</SectionTitle>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Total Participants by Year" tone="marked">
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
