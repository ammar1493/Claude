"use client";

import { useMemo } from "react";
import { Alert, Card } from "@/components/Card";
import { Icon } from "@/components/Icons";
import Plot from "@/components/Plot";
import { ValueBox } from "@/components/ValueBox";
import { groupBy, nDistinct, sumBy } from "@/lib/agg";
import { CHART_MARGIN_V, NEFT_GOLD, NEFT_NAVY } from "@/lib/brand";
import { fmtMonthYear } from "@/lib/dates";
import { fmtInt, fmtNum, round1 } from "@/lib/format";
import { withDates } from "@/lib/manual";
import { headroom, line, vbar } from "@/lib/plots";
import { useDashboard } from "@/state/DashboardContext";
import { ManualEntryPanel } from "./ManualEntryPanel";

export function Takamol() {
  const { tkManual, setTkManual } = useDashboard();
  const data = useMemo(() => withDates(tkManual), [tkManual]);

  const totals = useMemo(() => {
    if (!data.length) return { participants: 0, sessions: 0, periods: 0, avg: 0, years: 0 };
    const periods = nDistinct(data.map((d) => d.periodDate.getTime()));
    const participants = sumBy(data, (d) => d.participants);
    return {
      participants,
      sessions: sumBy(data, (d) => d.sessions),
      periods,
      avg: round1(participants / Math.max(1, periods)),
      years: nDistinct(data.map((d) => d.year)),
    };
  }, [data]);

  const monthly = useMemo(() => {
    const buckets = groupBy(data, (d) => d.periodDate.getTime());
    return [...buckets.entries()]
      .map(([t, rs]) => ({ at: new Date(t), participants: sumBy(rs, (r) => r.participants) }))
      .sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [data]);

  const cumulative = useMemo(() => {
    let running = 0;
    return monthly.map((m) => {
      running += m.participants;
      return { label: fmtMonthYear(m.at), cumulative: running };
    });
  }, [monthly]);

  const yearly = useMemo(() => {
    const buckets = groupBy(data, (d) => d.year);
    return [...buckets.entries()]
      .map(([year, rs]) => ({ year, participants: sumBy(rs, (r) => r.participants) }))
      .sort((a, b) => a.year - b.year);
  }, [data]);

  const range = data.length
    ? `${fmtMonthYear(data.reduce((a, b) => (a.periodDate < b.periodDate ? a : b)).periodDate)} to ${fmtMonthYear(
        data.reduce((a, b) => (a.periodDate > b.periodDate ? a : b)).periodDate,
      )}`
    : null;

  const empty = "Add Takamol numbers to see this chart";

  return (
    <div className="space-y-6">
      <Alert tone="secondary" icon={<Icon name="info" size={16} />}>
        <strong>Takamol Project:</strong> all figures on this tab are entered manually. They are stored in
        this browser (exportable as <code className="rounded bg-white/70 px-1">takamol_manual_entries.csv</code>)
        and feed straight into the Executive Summary.
      </Alert>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ValueBox
          title="Participants Trained"
          value={fmtInt(totals.participants)}
          showcase={<Icon name="people" size={28} />}
          theme="primary"
          compact
          footer={<span className="text-xs">{range ?? "No entries yet — add one below"}</span>}
        />
        <ValueBox
          title="Sessions Delivered"
          value={fmtInt(totals.sessions)}
          showcase={<Icon name="calendar-check" size={28} />}
          theme="accent"
          compact
          footer={<span className="text-xs">Optional — leave 0 if not tracked</span>}
        />
        <ValueBox
          title="Periods Recorded"
          value={fmtInt(totals.periods)}
          showcase={<Icon name="calendar" size={28} />}
          theme="deep"
          compact
          footer={totals.periods ? <span className="text-xs">{totals.years} year(s) recorded</span> : null}
        />
        <ValueBox
          title="Avg per Period"
          value={totals.periods ? fmtNum(totals.avg) : "N/A"}
          showcase={<Icon name="graph-up" size={28} />}
          theme="light"
          compact
          footer={<span className="text-slate-500">Participants per recorded month</span>}
        />
      </div>

      <Card title="Add Takamol Numbers" tone="marked">
        <ManualEntryPanel
          prefix="TK"
          rows={tkManual}
          onChange={setTkManual}
          showDays={false}
          csvName="takamol_manual_entries.csv"
        />
      </Card>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card title="Participants by Month" tone="marked" className="xl:col-span-7">
          <Plot
            height={420}
            emptyMessage={monthly.length ? null : empty}
            data={[
              vbar({
                labels: monthly.map((m) => fmtMonthYear(m.at)),
                values: monthly.map((m) => m.participants),
                color: NEFT_NAVY,
                outlineColor: NEFT_GOLD,
                textSize: 12,
                hovertemplate: "<b>%{x}</b><br>Participants: %{y}<extra></extra>",
              }),
            ]}
            layout={{
              xaxis: { title: { text: "" }, type: "category", tickfont: { size: 11 } },
              yaxis: {
                title: { text: "Participants" },
                range: headroom(monthly.map((m) => m.participants), 1.25, 1),
              },
              margin: CHART_MARGIN_V,
              showlegend: false,
            }}
          />
        </Card>

        <Card title="Cumulative Participants" tone="navy" className="xl:col-span-5">
          <Plot
            height={420}
            emptyMessage={cumulative.length ? null : empty}
            data={[
              line({
                x: cumulative.map((c) => c.label),
                y: cumulative.map((c) => c.cumulative),
                color: NEFT_GOLD,
                markerColor: NEFT_NAVY,
                fill: true,
                fillcolor: "rgba(255, 192, 0, 0.25)",
                hovertemplate: "<b>%{x}</b><br>Cumulative: %{y}<extra></extra>",
              }),
            ]}
            layout={{
              xaxis: { title: { text: "" }, type: "category", tickfont: { size: 11 } },
              yaxis: { title: { text: "Cumulative Participants" } },
              margin: CHART_MARGIN_V,
              showlegend: false,
            }}
          />
        </Card>
      </div>

      <Card title="Participants by Year" tone="navy">
        <Plot
          height={370}
          emptyMessage={yearly.length ? null : empty}
          data={[
            vbar({
              labels: yearly.map((y) => String(y.year)),
              values: yearly.map((y) => y.participants),
              color: NEFT_NAVY,
              outlineColor: NEFT_GOLD,
              textSize: 13,
              hovertemplate: "<b>%{x}</b><br>Participants: %{y}<extra></extra>",
            }),
          ]}
          layout={{
            xaxis: { title: { text: "Year" }, type: "category" },
            yaxis: {
              title: { text: "Participants" },
              range: headroom(yearly.map((y) => y.participants), 1.25, 1),
            },
            margin: CHART_MARGIN_V,
            showlegend: false,
          }}
        />
      </Card>
    </div>
  );
}
