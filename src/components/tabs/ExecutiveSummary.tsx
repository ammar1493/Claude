"use client";

import { useMemo } from "react";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icons";
import Plot from "@/components/Plot";
import { Delta, DeltaPct, StatTile, ValueBox } from "@/components/ValueBox";
import { ascending, groupBy, nDistinct, topN } from "@/lib/agg";
import { NEFT_GOLD, NEFT_NAVY } from "@/lib/brand";
import { floorMonth, fmtMonthShort, periodFloor } from "@/lib/dates";
import { fmtInt, fmtNum, pct, round1 } from "@/lib/format";
import { hbar, headroom, line, rankedColors, vbar } from "@/lib/plots";
import { chartDf, periodStats, sessionsCount, strategicDf } from "@/lib/selectors";
import { isWellSharpCourse } from "@/lib/wellsharp";
import { useDashboard } from "@/state/DashboardContext";
import { usePeriodTotals, useProjectTotals } from "./projectTotals";

/** Shows what a combined KPI is made of, so a filtered figure stays readable. */
function SourceSplit({
  neft,
  qd,
  tk,
  show,
}: {
  neft: number;
  qd: number;
  tk: number;
  show: boolean;
}) {
  if (!show) return null;
  return (
    <span className="block text-[11px] font-normal opacity-80">
      NEFT {fmtInt(neft)}
      {qd > 0 ? ` + Qiddiya ${fmtInt(qd)}` : ""}
      {tk > 0 ? ` + Takamol ${fmtInt(tk)}` : ""}
    </span>
  );
}

export function ExecutiveSummary({
  projectScope,
  onProjectScopeChange,
}: {
  projectScope: "all" | "period";
  onProjectScopeChange: (scope: "all" | "period") => void;
}) {
  const { dataset, filters } = useDashboard();
  const rows = dataset.rows;

  const ps = useMemo(() => periodStats(rows, filters), [rows, filters]);
  const chart = useMemo(() => chartDf(rows, filters), [rows, filters]);
  const strategic = useMemo(() => strategicDf(rows, filters), [rows, filters]);
  const projects = useProjectTotals(projectScope, ps);

  /**
   * The headline KPIs cover every source: the NEFT training workbook plus
   * Qiddiya and Takamol, both clipped to the same period so the comparison
   * against the prior window stays like-for-like.
   */
  const totals = usePeriodTotals(ps);
  const avgClassSize = totals.avgClassSize;

  // --- WellSharp at a glance (wellsharp_period_stats) ---
  const wsCur = useMemo(() => ps.cur.filter((r) => isWellSharpCourse(r.courseName)), [ps.cur]);
  const wsPrev = useMemo(() => ps.prev.filter((r) => isWellSharpCourse(r.courseName)), [ps.prev]);
  const wsCourses = nDistinct(wsCur.map((r) => r.courseName));
  const wsVsPrior = wsPrev.length ? pct(wsCur.length - wsPrev.length, wsPrev.length) : null;
  // WellSharp courses only ever appear in the NEFT workbook, so the share is
  // taken against NEFT participants rather than the all-sources headline.
  const wsPctOfTotal = ps.cur.length ? pct(wsCur.length, ps.cur.length) : 0;

  // --- Charts ---
  const trend = useMemo(() => {
    const buckets = groupBy(chart, (r) => periodFloor(r.date, filters.granularity).getTime());
    return [...buckets.entries()]
      .map(([t, rs]) => ({ period: new Date(t), participants: rs.length }))
      .sort((a, b) => a.period.getTime() - b.period.getTime());
  }, [chart, filters.granularity]);

  const topClients = useMemo(() => {
    const agg = [...groupBy(chart, (r) => r.client).entries()].map(([client, rs]) => ({
      client,
      participants: rs.length,
    }));
    return ascending(topN(agg, (a) => a.participants, 10), (a) => a.participants);
  }, [chart]);

  const monthly = useMemo(() => {
    const buckets = groupBy(strategic, (r) => floorMonth(r.date).getTime());
    return [...buckets.entries()]
      .map(([t, rs]) => ({ month: new Date(t), participants: rs.length }))
      .sort((a, b) => a.month.getTime() - b.month.getTime());
  }, [strategic]);

  const workload = useMemo(() => {
    const agg = [...groupBy(ps.cur, (r) => r.instructorName).entries()].map(([instructor, rs]) => ({
      instructor,
      sessions: nDistinct(rs.map((r) => r.actualSession)),
      participants: rs.length,
    }));
    return ascending(topN(agg, (a) => a.sessions, 10), (a) => a.sessions);
  }, [ps.cur]);

  const capacity = useMemo(() => {
    if (!ps.cur.length) return null;
    const instructors = nDistinct(ps.cur.map((r) => r.instructorName));
    const sessions = sessionsCount(ps.cur);
    const participants = ps.cur.length;
    const byInstructor = [...groupBy(ps.cur, (r) => r.instructorName).entries()]
      .map(([instructor, rs]) => ({ instructor, sessions: nDistinct(rs.map((r) => r.actualSession)) }))
      .sort((a, b) => b.sessions - a.sessions);
    return {
      instructors,
      sessions,
      participants,
      avgSessionsPerInstructor: instructors ? round1(sessions / instructors) : 0,
      avgParticipantsPerInstructor: instructors ? round1(participants / instructors) : 0,
      avgClassSize: sessions ? round1(participants / sessions) : 0,
      top: byInstructor[0],
    };
  }, [ps.cur]);

  const xTitle =
    filters.granularity === "daily"
      ? "Date"
      : filters.granularity === "weekly"
        ? "Week"
        : filters.granularity === "monthly"
          ? "Month"
          : "Year";

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="print-block rounded-lg bg-navy px-6 py-7 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-[2rem]">
          {ps.labelMain}
        </h1>
        <p className="mt-2 flex items-center justify-center gap-3 text-sm font-medium text-white/70">
          <span aria-hidden className="h-px w-8 bg-gold" />
          {ps.labelSub}
          <span aria-hidden className="h-px w-8 bg-gold" />
        </p>
      </div>

      {/* Headline KPIs: NEFT Data + Qiddiya + Takamol */}
      <div className="grid gap-4 md:grid-cols-3">
        <ValueBox
          title="Total Participants"
          value={fmtInt(totals.participants)}
          showcase={<Icon name="people" size={34} />}
          theme="primary"
          footer={
            <div className="space-y-0.5">
              <Delta diff={totals.participants - totals.prevParticipants} />
              <SourceSplit
                neft={totals.neftParticipants}
                qd={totals.split.qdParticipants}
                tk={totals.split.tkParticipants}
                show={totals.hasProjects}
              />
            </div>
          }
        />
        <ValueBox
          title="Unique Sessions"
          value={fmtInt(totals.sessions)}
          showcase={<Icon name="calendar" size={34} />}
          theme="accent"
          footer={
            <div className="space-y-0.5">
              <Delta diff={totals.sessions - totals.prevSessions} />
              <SourceSplit
                neft={totals.neftSessions}
                qd={totals.split.qdSessions}
                tk={totals.split.tkSessions}
                show={totals.hasProjects}
              />
            </div>
          }
        />
        <ValueBox
          title="Avg Class Size"
          value={avgClassSize === null ? "N/A" : fmtNum(avgClassSize)}
          showcase={<Icon name="speedometer" size={34} />}
          theme="light"
          footer={<span className="text-slate-ink">Participants per session, all sources</span>}
        />
      </div>

      {/* WellSharp at a Glance */}
      <Card title="WellSharp at a Glance" tone="navy">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ValueBox
            title="WellSharp Courses"
            value={fmtInt(wsCourses)}
            showcase={<Icon name="mortarboard" size={28} />}
            theme="primary"
            compact
          />
          <ValueBox
            title="WellSharp Participants"
            value={fmtInt(wsCur.length)}
            showcase={<Icon name="people" size={28} />}
            theme="accent"
            compact
            footer={
              wsCur.length && wsPrev.length ? (
                <Delta diff={wsCur.length - wsPrev.length} small />
              ) : null
            }
          />
          <ValueBox
            title="vs Prior Period"
            value={wsVsPrior === null ? "N/A" : <DeltaPct value={wsVsPrior} />}
            showcase={<Icon name="arrow-up" size={28} />}
            theme="accent"
            compact
          />
          <ValueBox
            title="% of NEFT Data"
            value={`${wsPctOfTotal}%`}
            showcase={<Icon name="pie" size={28} />}
            theme="light"
            compact
          />
        </div>
      </Card>

      {/* Special Projects */}
      <Card
        title="Special Projects — Qiddiya Academy &amp; Takamol"
        tone="navy"
        action={
          <div className="flex gap-3 text-[13px] font-normal">
            {(
              [
                ["all", "Cumulative (all records)"],
                ["period", "Selected period only"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name="project_scope"
                  checked={projectScope === value}
                  onChange={() => onProjectScopeChange(value)}
                  className="accent-gold"
                />
                {label}
              </label>
            ))}
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ValueBox
            title="Qiddiya Participants"
            value={fmtInt(projects.qdParticipants)}
            showcase={<Icon name="building" size={28} />}
            theme="primary"
            compact
            footer={`${fmtInt(projects.qdSessions)} sessions | ${fmtInt(projects.qdDays)} teaching days`}
          />
          <ValueBox
            title="Takamol Participants"
            value={fmtInt(projects.tkParticipants)}
            showcase={<Icon name="diagram" size={28} />}
            theme="accent"
            compact
            footer={projects.tkSessions > 0 ? `${fmtInt(projects.tkSessions)} sessions` : "Manually entered"}
          />
          <ValueBox
            title="Grand Total Participants"
            value={fmtInt(projects.grandParticipants)}
            showcase={<Icon name="people" size={28} />}
            theme="light"
            compact
            footer={
              <span className="text-slate-ink">
                NEFT Data {fmtInt(projects.neftParticipants)} + Qiddiya{" "}
                {fmtInt(projects.qdParticipants)} + Takamol {fmtInt(projects.tkParticipants)}
              </span>
            }
          />
          <ValueBox
            title="Grand Total Sessions"
            value={fmtInt(projects.grandSessions)}
            showcase={<Icon name="calendar-check" size={28} />}
            theme="light"
            compact
            footer={
              <span className="text-slate-ink">
                NEFT Data {fmtInt(projects.neftSessions)} + Qiddiya {fmtInt(projects.qdSessions)} +
                Takamol {fmtInt(projects.tkSessions)}
              </span>
            }
          />
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs text-slate-500">
          <Icon name="info" size={14} className="mt-0.5 shrink-0" />
          Scope: {projects.label}. Qiddiya combines the QCTA workbook with manual entries; Takamol is
          fully manual. Neither carries a client or course, so the Filter by Client and Filter by
          Course controls apply to the NEFT Data figures only.
        </p>
      </Card>

      {/* Trend + Top clients */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={`${label(filters.granularity)} Activity Trend`}>
          <Plot
            height={420}
            emptyMessage={trend.length ? null : "No data for the current filters"}
            data={[
              line({
                x: trend.map((t) => t.period),
                y: trend.map((t) => t.participants),
                color: NEFT_NAVY,
                fill: true,
                showText: true,
                hovertemplate: "<b>%{x}</b><br>Participants: %{y}<extra></extra>",
              }),
            ]}
            layout={{
              xaxis: { title: { text: xTitle } },
              yaxis: {
                title: { text: "Participants" },
                range: headroom(trend.map((t) => t.participants), 1.25),
              },
              margin: { l: 60, r: 30, t: 40, b: 40 },
              showlegend: false,
            }}
          />
        </Card>

        <Card title="Top Clients">
          <Plot
            height={420}
            emptyMessage={topClients.length ? null : "No data for the current filters"}
            data={[
              hbar({
                labels: topClients.map((c) => c.client),
                values: topClients.map((c) => c.participants),
                color: rankedColors(topClients.length),
                hovertemplate: "<b>%{y}</b><br>Participants: %{x}<extra></extra>",
              }),
            ]}
            layout={{
              xaxis: {
                title: { text: "Participants" },
                range: headroom(topClients.map((c) => c.participants)),
              },
              yaxis: { title: { text: "" }, tickfont: { size: 10 }, type: "category" },
              margin: { l: 160, r: 80, t: 20, b: 40 },
              showlegend: false,
            }}
          />
        </Card>
      </div>

      {/* Monthly participants for the selected year */}
      <Card title={`Monthly Participants — ${filters.year}`} tone="marked">
        <Plot
          height={380}
          emptyMessage={monthly.length ? null : `No records for ${filters.year}`}
          data={[
            vbar({
              labels: monthly.map((m) => fmtMonthShort(m.month)),
              values: monthly.map((m) => m.participants),
              color: NEFT_NAVY,
              hovertemplate: "<b>%{x}</b><br>Participants: %{y}<extra></extra>",
            }),
          ]}
          layout={{
            xaxis: { title: { text: "" }, type: "category", tickangle: 0 },
            yaxis: {
              title: { text: "Participants" },
              tickformat: ",",
              range: headroom(monthly.map((m) => m.participants), 1.25),
            },
            margin: { l: 80, r: 40, t: 40, b: 50 },
            showlegend: false,
          }}
        />
      </Card>

      {/* Instructor capacity */}
      <Card title="Instructor Capacity Overview" tone="marked">
        <p className="mb-3 text-xs text-slate-500">
          Active instructor workload distribution and performance metrics
        </p>
        <div className="grid gap-4 xl:grid-cols-12">
          <div className="xl:col-span-7">
            <h3 className="mb-3 text-sm font-bold text-navy">Top 10 Instructors — Sessions &amp; Participants</h3>
            <Plot
              height={400}
              emptyMessage={workload.length ? null : "No data for the current period"}
              data={[
                hbar({
                  labels: workload.map((w) => w.instructor),
                  values: workload.map((w) => w.sessions),
                  color: NEFT_NAVY,
                  hovertemplate: "<b>%{y}</b><br>Sessions: %{x}<extra></extra>",
                }),
                hbar({
                  labels: workload.map((w) => w.instructor),
                  values: workload.map((w) => w.participants),
                  color: NEFT_GOLD,
                  hovertemplate: "<b>%{y}</b><br>Participants: %{x}<extra></extra>",
                }),
              ].map((t, i) => ({ ...t, name: i === 0 ? "Sessions" : "Participants" }))}
              layout={{
                barmode: "group",
                xaxis: {
                  title: { text: "Count" },
                  tickfont: { size: 10 },
                  range: headroom(workload.map((w) => w.participants), 1.25),
                },
                yaxis: { title: { text: "" }, tickfont: { size: 10 }, type: "category" },
                legend: { orientation: "h", x: 0.3, y: 1.08, font: { size: 11 } },
                margin: { l: 180, r: 80, t: 50, b: 40 },
                showlegend: true,
              }}
            />
          </div>

          <div className="xl:col-span-5">
            <h3 className="mb-3 text-sm font-bold text-navy">Capacity Metrics</h3>
            {!capacity ? (
              <p className="text-sm text-slate-500">No data for the current period.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <StatTile value={fmtInt(capacity.instructors)} label="Active Instructors" />
                  <StatTile
                    value={fmtNum(capacity.avgSessionsPerInstructor)}
                    label="Avg Sessions/Instructor"
                    accent
                  />
                  <StatTile
                    value={fmtNum(capacity.avgParticipantsPerInstructor)}
                    label="Avg Participants/Instructor"
                  />
                  <StatTile value={fmtNum(capacity.avgClassSize)} label="Avg Class Size" />
                </div>
                {capacity.top && (
                  <div className="mt-3 rounded-lg bg-navy p-3 text-white">
                    <div className="flex items-center gap-2 text-sm font-bold">
                      <Icon name="trophy" size={16} /> Top Performer
                    </div>
                    <div className="mt-2 text-sm">
                      <strong>{capacity.top.instructor}</strong> — {capacity.top.sessions} sessions
                      delivered
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </Card>

    </div>
  );
}

function label(g: string): string {
  return g.charAt(0).toUpperCase() + g.slice(1);
}
