"use client";

import { useMemo } from "react";
import { Alert, Card, SectionTitle } from "@/components/Card";
import { Icon } from "@/components/Icons";
import Plot from "@/components/Plot";
import { ValueBox } from "@/components/ValueBox";
import { ascending, groupBy, nDistinct, sliceRange, topN } from "@/lib/agg";
import { HSE_COLOR, MUTED_BAR, NEFT_GOLD } from "@/lib/brand";
import { periodFloor } from "@/lib/dates";
import { fmtInt } from "@/lib/format";
import { hbar, headroom, line, rankedColorsOf } from "@/lib/plots";
import { filterHse } from "@/lib/hse";
import { hseBase } from "@/lib/selectors";
import { useDashboard } from "@/state/DashboardContext";

type Ranked = { label: string; value: number };

function rank(rows: { key: string }[]): Ranked[] {
  return [...groupBy(rows, (r) => r.key).entries()]
    .map(([label, rs]) => ({ label, value: rs.length }))
    .sort((a, b) => b.value - a.value);
}

function RankedPair({
  title,
  nextTitle,
  ranked,
  unit,
  leftMargin,
}: {
  title: string;
  nextTitle: string;
  ranked: Ranked[];
  unit: string;
  leftMargin: number;
}) {
  const top = ascending(topN(ranked, (r) => r.value, 10), (r) => r.value);
  const next = ascending(sliceRange(ranked, 11, 20), (r) => r.value);

  // Only the leader of the actual top 10 earns the gold accent; ranks 11-20 are
  // a continuation, so they stay in one neutral tone.
  const chart = (rows: Ranked[], color: string, empty: string, markLeader: boolean) => (
    <Plot
      height={420}
      emptyMessage={rows.length ? null : empty}
      data={[
        hbar({
          labels: rows.map((r) => r.label),
          values: rows.map((r) => r.value),
          color: markLeader ? rankedColorsOf(color, rows.length) : color,
          hovertemplate: `<b>%{y}</b><br>${unit}: %{x}<extra></extra>`,
        }),
      ]}
      layout={{
        xaxis: { title: { text: unit }, range: headroom(rows.map((r) => r.value)) },
        yaxis: { title: { text: "" }, type: "category", tickfont: { size: 10 } },
        margin: { l: leftMargin, r: 70, t: 20, b: 40 },
        showlegend: false,
      }}
    />
  );

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title={title} tone="marked">
        {chart(top, HSE_COLOR, "No HSE data for the current filters", true)}
      </Card>
      <Card title={nextTitle}>
        {chart(next, MUTED_BAR, "Fewer than 11 entries in this period", false)}
      </Card>
    </div>
  );
}

export function Hse() {
  const { dataset, filters } = useDashboard();

  const hse = useMemo(() => filterHse(hseBase(dataset.rows, filters)), [dataset.rows, filters]);

  const clients = useMemo(() => rank(hse.map((r) => ({ key: r.client }))), [hse]);
  const courses = useMemo(() => rank(hse.map((r) => ({ key: r.courseName }))), [hse]);
  const instructors = useMemo(() => rank(hse.map((r) => ({ key: r.instructorName }))), [hse]);

  const trend = useMemo(() => {
    const buckets = groupBy(hse, (r) => periodFloor(r.date, filters.granularity).getTime());
    return [...buckets.entries()]
      .map(([t, rs]) => ({
        period: new Date(t),
        participants: rs.length,
        sessions: nDistinct(rs.map((r) => r.actualSession)),
      }))
      .sort((a, b) => a.period.getTime() - b.period.getTime());
  }, [hse, filters.granularity]);

  return (
    <div className="space-y-6">
      <Alert tone="success" icon={<Icon name="leaf" size={16} />}>
        <strong>Health, Safety &amp; Environment Training</strong> — all charts reflect HSE courses only
        (every course outside the IADC WellSharp catalogue).
      </Alert>

      <SectionTitle>HSE at a Glance</SectionTitle>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ValueBox
          title="HSE Courses"
          value={fmtInt(nDistinct(hse.map((r) => r.courseName)))}
          showcase={<Icon name="book" size={26} />}
          theme="primary"
          compact
        />
        <ValueBox
          title="HSE Participants"
          value={fmtInt(hse.length)}
          showcase={<Icon name="people" size={26} />}
          theme="primary"
          compact
        />
        <ValueBox
          title="Avg Pass Rate"
          value={<span className="text-lg">Future Enhancement</span>}
          showcase={<Icon name="check-circle" size={26} />}
          theme="light"
          compact
        />
        <ValueBox
          title="HSE Training Hours"
          value={<span className="text-lg">Future Enhancement</span>}
          showcase={<Icon name="clock" size={26} />}
          theme="light"
          compact
        />
      </div>

      <SectionTitle>Top 10 HSE Clients</SectionTitle>
      <RankedPair
        title="Top 10 Clients by Participants"
        nextTitle="Next 10 Clients (11–20)"
        ranked={clients}
        unit="Participants"
        leftMargin={200}
      />

      <SectionTitle>Top 10 HSE Courses</SectionTitle>
      <RankedPair
        title="Top 10 Courses by Enrollment"
        nextTitle="Next 10 Courses (11–20)"
        ranked={courses}
        unit="Enrollments"
        leftMargin={300}
      />

      <SectionTitle>Top 10 HSE Instructors</SectionTitle>
      <RankedPair
        title="Top 10 Instructors by Participants"
        nextTitle="Next 10 Instructors (11–20)"
        ranked={instructors}
        unit="Participants"
        leftMargin={200}
      />

      <SectionTitle>HSE Trends</SectionTitle>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="HSE Participants Over Time" tone="marked">
          <Plot
            height={420}
            emptyMessage={trend.length ? null : "No HSE data for the current filters"}
            data={[
              line({
                x: trend.map((t) => t.period),
                y: trend.map((t) => t.participants),
                color: HSE_COLOR,
                markerSize: 6,
                hovertemplate: "<b>%{x}</b><br>Participants: %{y}<extra></extra>",
              }),
            ]}
            layout={{
              xaxis: { title: { text: "" } },
              yaxis: { title: { text: "Participants" } },
              showlegend: false,
            }}
          />
        </Card>

        <Card title="HSE Sessions Over Time">
          <Plot
            height={420}
            emptyMessage={trend.length ? null : "No HSE data for the current filters"}
            data={[
              line({
                x: trend.map((t) => t.period),
                y: trend.map((t) => t.sessions),
                color: NEFT_GOLD,
                markerSize: 6,
                hovertemplate: "<b>%{x}</b><br>Sessions: %{y}<extra></extra>",
              }),
            ]}
            layout={{
              xaxis: { title: { text: "" } },
              yaxis: { title: { text: "Sessions" } },
              showlegend: false,
            }}
          />
        </Card>
      </div>
    </div>
  );
}
