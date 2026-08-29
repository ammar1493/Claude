"use client";

import { useMemo } from "react";
import { Alert, Card, SectionTitle } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { Icon } from "@/components/Icons";
import Plot from "@/components/Plot";
import { StatTile } from "@/components/ValueBox";
import { ascending, groupBy, nDistinct, sumBy, topN } from "@/lib/agg";
import { DANGER, NEFT_GOLD, NEFT_NAVY } from "@/lib/brand";
import { WELLSHARP_HOURS } from "@/lib/config";
import {
  addDays,
  floorMonth,
  floorWeek,
  fmtDayMonth,
  fmtDayMonthYear,
  fmtMonthYear,
} from "@/lib/dates";
import { fmtInt, fmtNum, round1 } from "@/lib/format";
import { CATEGORY_COLORS, hbar, headroom, line, rankedColors, vbar } from "@/lib/plots";
import type { WellSharpRow } from "@/lib/types";
import {
  instructorCourseBreakdown,
  instructorTeachingHours,
  isRetake,
  sessionHours,
  shortCourse,
  toWellSharpRows,
} from "@/lib/wellsharp";
import { useDashboard } from "@/state/DashboardContext";

export function WellSharp() {
  const { dataset, filters } = useDashboard();
  const mode = filters.granularity;

  const all = useMemo(() => toWellSharpRows(dataset.rows), [dataset.rows]);

  const byYear = useMemo(
    () => all.filter((r) => r.date.getFullYear() === Number(filters.year)),
    [all, filters.year],
  );
  const byRange = useMemo(
    () => all.filter((r) => r.date >= filters.startDate && r.date <= filters.endDate),
    [all, filters.startDate, filters.endDate],
  );

  /** ws_period_data(): daily & weekly use the date range, monthly the year, yearly everything. */
  const period: WellSharpRow[] =
    mode === "daily" || mode === "weekly" ? byRange : mode === "monthly" ? byYear : all;

  const periodLabel =
    mode === "daily" || mode === "weekly"
      ? `WellSharp Analysis — ${fmtDayMonth(filters.startDate)} to ${fmtDayMonthYear(filters.endDate)}`
      : mode === "monthly"
        ? `WellSharp Analysis — ${filters.year}`
        : "WellSharp Analysis — All Years";

  const modeLabel =
    mode === "monthly" ? `Monthly - ${filters.year}` : mode.charAt(0).toUpperCase() + mode.slice(1);

  // ---- Teaching hours by period -------------------------------------------
  const hoursSeries = useMemo(() => {
    const sess = sessionHours(period);
    const key = (d: Date) => {
      if (mode === "daily") return d.getTime();
      if (mode === "weekly") return floorWeek(d, 5).getTime();
      if (mode === "monthly") return floorMonth(d).getTime();
      return new Date(d.getFullYear(), 0, 1).getTime();
    };
    const buckets = groupBy(sess, (s) => key(s.date));
    return [...buckets.entries()]
      .map(([t, rs]) => ({ at: new Date(t), hours: sumBy(rs, (r) => r.totalHours) }))
      .sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [period, mode]);

  const countsSeries = useMemo(() => {
    const key = (d: Date) => {
      if (mode === "daily") return d.getTime();
      if (mode === "weekly") return floorWeek(d, 5).getTime();
      if (mode === "monthly") return floorMonth(d).getTime();
      return new Date(d.getFullYear(), 0, 1).getTime();
    };
    const buckets = groupBy(period, (r) => key(r.date));
    return [...buckets.entries()]
      .map(([t, rs]) => ({
        at: new Date(t),
        sessions: nDistinct(rs.map((r) => r.actualSession)),
        participants: rs.length,
      }))
      .sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [period, mode]);

  const bucketLabel = (d: Date) => {
    if (mode === "weekly") return `${fmtDayMonth(d)} - ${fmtDayMonth(addDays(d, 6))}`;
    if (mode === "monthly") return fmtMonthYear(d);
    if (mode === "yearly") return String(d.getFullYear());
    return fmtDayMonthYear(d);
  };

  // ---- Instructor aggregates ----------------------------------------------
  const topInstructors = useMemo(
    () => ascending(topN(instructorTeachingHours(period), (i) => i.teachingHours, 6), (i) => i.teachingHours),
    [period],
  );

  const summary = useMemo(() => {
    if (!period.length) return null;
    const totalHours = sumBy(
      // group_by(`Actual Sessions`, `Course Name`) — the date is not part of the key here
      [...groupBy(period, (r) => `${r.actualSession}|${r.courseName}`).entries()].map(([, rs]) => rs[0]),
      (r) => r.totalHours,
    );
    const courseCounts = [...groupBy(period, (r) => r.courseName).entries()]
      .map(([courseName, rs]) => ({ courseName, n: rs.length }))
      .sort((a, b) => b.n - a.n);
    const totalSessions = nDistinct(period.map((r) => r.actualSession));
    return {
      participants: period.length,
      instructors: nDistinct(period.map((r) => r.instructorName)),
      sessions: totalSessions,
      courses: nDistinct(period.map((r) => r.courseName)),
      totalHours,
      retakes: period.filter((r) => isRetake(r.courseName)).length,
      avgClassSize: totalSessions ? round1(period.length / totalSessions) : 0,
      topCourse: courseCounts[0],
    };
  }, [period]);

  const breakdown = useMemo(() => {
    const top6 = new Set(
      topN(instructorTeachingHours(period), (i) => i.teachingHours, 6).map((i) => i.instructor),
    );
    const rows = instructorCourseBreakdown(period).filter((b) => top6.has(b.instructor));
    const courses = [...new Set(rows.map((r) => shortCourse(r.courseName)))].sort();
    const instructors = [...new Set(rows.map((r) => r.instructor))];
    return courses.map((course, i) => ({
      type: "bar",
      orientation: "h",
      name: course,
      y: instructors,
      x: instructors.map((ins) =>
        sumBy(
          rows.filter((r) => r.instructor === ins && shortCourse(r.courseName) === course),
          (r) => r.hours,
        ),
      ),
      marker: { color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] },
      text: instructors.map((ins) => {
        const h = sumBy(
          rows.filter((r) => r.instructor === ins && shortCourse(r.courseName) === course),
          (r) => r.hours,
        );
        return h ? `${h}h` : "";
      }),
      textposition: "inside",
      textfont: { size: 10, color: "white" },
      hovertemplate: `<b>%{y}</b><br>Course: ${course}<br>Hours: %{x}<extra></extra>`,
    }));
  }, [period]);

  const retakesByCourse = useMemo(() => {
    const retakes = period.filter((r) => isRetake(r.courseName));
    const agg = [...groupBy(retakes, (r) => r.courseName).entries()].map(([courseName, rs]) => ({
      label: shortCourse(courseName),
      value: rs.length,
    }));
    return ascending(agg, (a) => a.value);
  }, [period]);

  const retakeDetail = useMemo(() => {
    const retakes = period.filter((r) => isRetake(r.courseName));
    return [...groupBy(retakes, (r) => `${r.participantName}|${r.courseName}`).entries()]
      .map(([, rs]) => ({
        participant: rs[0].participantName,
        course: rs[0].courseName,
        retakeSessions: nDistinct(rs.map((r) => r.actualSession)),
      }))
      .sort((a, b) => b.retakeSessions - a.retakeSessions);
  }, [period]);

  const top5Clients = useMemo(() => {
    const agg = [...groupBy(period, (r) => r.client).entries()].map(([client, rs]) => ({
      client,
      participants: rs.length,
      sessions: nDistinct(rs.map((r) => r.actualSession)),
      retakes: rs.filter((r) => isRetake(r.courseName)).length,
    }));
    return ascending(topN(agg, (a) => a.participants, 5), (a) => a.participants);
  }, [period]);

  const instructorParticipants = useMemo(() => {
    const agg = [...groupBy(period, (r) => r.instructorName).entries()].map(([instructor, rs]) => ({
      instructor,
      participants: rs.length,
      sessions: nDistinct(rs.map((r) => r.actualSession)),
    }));
    return ascending(agg, (a) => a.participants);
  }, [period]);

  const detailRows = useMemo(() => {
    const triples = [...groupBy(period, (r) => `${r.instructorName}|${r.courseName}|${r.actualSession}`).entries()].map(
      ([, rs]) => ({
        instructor: rs[0].instructorName,
        course: rs[0].courseName,
        hours: rs[0].totalHours,
        participants: rs.length,
      }),
    );
    return [...groupBy(triples, (t) => `${t.instructor}|${t.course}`).entries()]
      .map(([, rs]) => ({
        instructor: rs[0].instructor,
        course: rs[0].course,
        sessions: rs.length,
        teachingHours: sumBy(rs, (r) => r.hours),
        participants: sumBy(rs, (r) => r.participants),
      }))
      .sort((a, b) => b.teachingHours - a.teachingHours);
  }, [period]);

  const noData = period.length === 0;
  const emptyMsg = "No WellSharp data for selected period";

  const refColumns: Column<(typeof WELLSHARP_HOURS)[number]>[] = [
    { key: "course", header: "Course Name", value: (r) => r.courseName },
    { key: "days", header: "Days", value: (r) => r.days, align: "center" },
    { key: "hpd", header: "Hours/Day", value: (r) => r.hoursPerDay, align: "center" },
    { key: "total", header: "Total Hours", value: (r) => r.totalHours, align: "center" },
  ];

  return (
    <div className="space-y-6">
      <Alert tone="info" icon={<Icon name="award" size={16} />}>
        <strong>WellSharp Course Analysis:</strong> Top instructors by teaching hours for IADC WellSharp
        courses.
      </Alert>

      <Card title="WellSharp Course Hours Reference" tone="navy" className="min-h-[380px]">
        <DataTable rows={WELLSHARP_HOURS} columns={refColumns} pageLength={7} dense />
      </Card>

      <div>
        <SectionTitle>WellSharp Period Analysis</SectionTitle>
        <p className="mt-1 flex items-start gap-2 text-sm text-slate-500">
          <Icon name="info" size={15} className="mt-0.5 shrink-0" />
          Use the &ldquo;Charts View&rdquo; selector in the sidebar. Weekly uses the date range (weeks start
          Friday). Monthly uses &ldquo;Year for Analysis&rdquo;. Yearly shows all years.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={`WellSharp ${modeLabel} Teaching Hours`} tone="marked">
          <Plot
            height={420}
            emptyMessage={noData ? emptyMsg : null}
            data={
              mode === "daily"
                ? [
                    line({
                      x: hoursSeries.map((h) => h.at),
                      y: hoursSeries.map((h) => h.hours),
                      color: NEFT_NAVY,
                      showText: true,
                      text: hoursSeries.map((h) => `${h.hours}h`),
                      hovertemplate: "<b>%{x}</b><br>Teaching Hours: %{y}<extra></extra>",
                    }),
                  ]
                : [
                    vbar({
                      labels: hoursSeries.map((h) => bucketLabel(h.at)),
                      values: hoursSeries.map((h) => h.hours),
                      color: NEFT_NAVY,
                      text: hoursSeries.map((h) => `${fmtInt(h.hours)}h`),
                      textSize: mode === "yearly" ? 13 : 11,
                      hovertemplate: "<b>%{x}</b><br>Teaching Hours: %{y}<extra></extra>",
                    }),
                  ]
            }
            layout={{
              xaxis: {
                title: { text: mode === "yearly" ? "Year" : "" },
                tickangle: mode === "weekly" || mode === "monthly" ? -45 : 0,
                tickfont: { size: mode === "yearly" ? 12 : 10 },
                ...(mode === "daily" ? {} : { type: "category" }),
              },
              yaxis: {
                title: { text: "Teaching Hours" },
                range: headroom(hoursSeries.map((h) => h.hours), 1.25),
              },
              margin: { l: 70, r: 60, t: 45, b: mode === "weekly" ? 120 : mode === "monthly" ? 110 : 50 },
              showlegend: false,
            }}
          />
        </Card>

        <Card title={`WellSharp ${modeLabel} Sessions & Participants`} tone="marked">
          <Plot
            height={420}
            emptyMessage={noData ? emptyMsg : null}
            data={
              mode === "daily"
                ? [
                    line({
                      x: countsSeries.map((c) => c.at),
                      y: countsSeries.map((c) => c.sessions),
                      color: NEFT_NAVY,
                      name: "Sessions",
                      markerSize: 7,
                    }),
                    line({
                      x: countsSeries.map((c) => c.at),
                      y: countsSeries.map((c) => c.participants),
                      color: NEFT_GOLD,
                      name: "Participants",
                      markerSize: 7,
                    }),
                  ]
                : [
                    vbar({
                      labels: countsSeries.map((c) => bucketLabel(c.at)),
                      values: countsSeries.map((c) => c.sessions),
                      color: NEFT_NAVY,
                      name: "Sessions",
                      textSize: mode === "yearly" ? 12 : 10,
                    }),
                    vbar({
                      labels: countsSeries.map((c) => bucketLabel(c.at)),
                      values: countsSeries.map((c) => c.participants),
                      color: NEFT_GOLD,
                      name: "Participants",
                      textSize: mode === "yearly" ? 12 : 10,
                    }),
                  ]
            }
            layout={{
              barmode: "group",
              xaxis: {
                title: { text: mode === "yearly" ? "Year" : "" },
                tickangle: mode === "weekly" || mode === "monthly" ? -45 : 0,
                tickfont: { size: mode === "yearly" ? 12 : 10 },
                ...(mode === "daily" ? {} : { type: "category" }),
              },
              yaxis: {
                title: { text: "Count" },
                range: headroom(countsSeries.map((c) => c.participants), 1.25),
              },
              legend: { orientation: "h", x: 0.25, y: 1.08, font: { size: 11 } },
              margin: { l: 70, r: 60, t: 55, b: mode === "weekly" ? 120 : mode === "monthly" ? 110 : 50 },
              showlegend: true,
            }}
          />
        </Card>
      </div>

      <SectionTitle>{periodLabel}</SectionTitle>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card title="Top 6 Instructors by Teaching Hours" tone="marked" className="xl:col-span-7">
          <p className="mb-2 text-xs text-slate-500">Teaching hours = sessions × course hours</p>
          <Plot
            height={440}
            emptyMessage={topInstructors.length ? null : "No WellSharp course data found"}
            data={[
              hbar({
                labels: topInstructors.map((i) => i.instructor),
                values: topInstructors.map((i) => i.teachingHours),
                color: rankedColors(topInstructors.length),
                textSize: 12,
                text: topInstructors.map(
                  (i) => `${fmtInt(i.teachingHours)} hrs (${i.sessionsCount} sessions)`,
                ),
                hovertemplate: "<b>%{y}</b><br>Teaching Hours: %{x}<extra></extra>",
              }),
            ]}
            layout={{
              xaxis: {
                title: { text: "Teaching Hours" },
                range: headroom(topInstructors.map((i) => i.teachingHours), 1.35),
              },
              yaxis: { title: { text: "" }, type: "category", tickfont: { size: 12 } },
              margin: { l: 200, r: 140, t: 30, b: 50 },
              showlegend: false,
            }}
          />
        </Card>

        <Card title="WellSharp Summary" tone="navy" className="xl:col-span-5">
          {!summary ? (
            <div className="flex h-64 flex-col items-center justify-center text-slate-400">
              <Icon name="warning" size={40} />
              <p className="mt-3 font-semibold">No WellSharp data found</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatTile
                  value={fmtInt(summary.participants)}
                  label="Total Participants"
                  sub="(incl. retakes)"
                />
                <StatTile value={fmtInt(summary.instructors)} label="Instructors" />
                <StatTile value={fmtInt(summary.sessions)} label="Total Sessions" />
                <StatTile value={fmtInt(summary.totalHours)} label="Total Teaching Hours" accent />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <StatTile value={fmtInt(summary.courses)} label="Active Courses" />
                <StatTile value={fmtInt(summary.retakes)} label="Course Retakes" />
                <StatTile value={fmtNum(summary.avgClassSize)} label="Avg Class Size" />
              </div>
              {summary.topCourse && (
                <div className="mt-3 rounded-lg bg-navy p-3 text-white">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <Icon name="star" size={16} /> Most Taught Course
                  </div>
                  <div className="mt-2 text-sm">
                    <strong>{summary.topCourse.courseName}</strong> — {fmtInt(summary.topCourse.n)}{" "}
                    participants
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Course Breakdown by Instructor">
          <Plot
            height={520}
            emptyMessage={breakdown.length ? null : emptyMsg}
            data={breakdown}
            layout={{
              barmode: "stack",
              xaxis: { title: { text: "Teaching Hours" }, tickfont: { size: 11 } },
              yaxis: { title: { text: "" }, type: "category", tickfont: { size: 11 } },
              legend: { orientation: "h", y: -0.2, font: { size: 9 } },
              margin: { l: 200, r: 50, t: 30, b: 120 },
              showlegend: true,
            }}
          />
        </Card>

        <Card title="Course Retakes Analysis" tone="marked">
          <p className="mb-2 text-xs text-slate-500">Participants who took Retake Exam</p>
          <Plot
            height={250}
            emptyMessage={
              noData ? emptyMsg : retakesByCourse.length ? null : "No retakes found in selected period"
            }
            data={[
              hbar({
                labels: retakesByCourse.map((r) => r.label),
                values: retakesByCourse.map((r) => r.value),
                color: DANGER,
                textColor: DANGER,
                textSize: 12,
                hovertemplate: "<b>%{y}</b><br>Retakes: %{x}<extra></extra>",
              }),
            ]}
            layout={{
              xaxis: {
                title: { text: "Number of Retakes" },
                tickfont: { size: 10 },
                range: headroom(retakesByCourse.map((r) => r.value), 1.3),
              },
              yaxis: { title: { text: "" }, type: "category", tickfont: { size: 10 } },
              margin: { l: 220, r: 80, t: 20, b: 40 },
              showlegend: false,
            }}
          />
          <hr className="my-3 border-slate-200" />
          <DataTable
            rows={retakeDetail}
            pageLength={5}
            dense
            emptyMessage="No retakes found in selected period"
            columns={[
              { key: "p", header: "Participant", value: (r) => r.participant },
              { key: "c", header: "Course", value: (r) => r.course },
              { key: "n", header: "Retake Sessions", value: (r) => r.retakeSessions, align: "center" },
            ]}
          />
        </Card>
      </div>

      <SectionTitle>Top 5 WellSharp Clients</SectionTitle>
      <Card title="Top 5 Clients by Participants" tone="marked">
        <p className="mb-2 text-xs text-slate-500">
          Clients with highest WellSharp participant counts (includes retakes)
        </p>
        <Plot
          height={420}
          emptyMessage={top5Clients.length ? null : "No client data found"}
          data={[
            hbar({
              labels: top5Clients.map((c) => c.client),
              values: top5Clients.map((c) => c.participants),
              color: rankedColors(top5Clients.length),
              text: top5Clients.map(
                (c) => `${fmtInt(c.participants)} participants (${c.sessions} sessions, ${c.retakes} retakes)`,
              ),
              customdata: top5Clients.map((c) => [c.sessions, c.retakes]),
              hovertemplate:
                "<b>%{y}</b><br>Participants: %{x}<br>Sessions: %{customdata[0]}<br>Retakes: %{customdata[1]}<extra></extra>",
            }),
          ]}
          layout={{
            xaxis: {
              title: { text: "Number of Participants" },
              range: headroom(top5Clients.map((c) => c.participants), 1.4),
            },
            yaxis: { title: { text: "" }, type: "category", tickfont: { size: 11 } },
            margin: { l: 250, r: 180, t: 30, b: 50 },
            showlegend: false,
          }}
        />
      </Card>

      <Card title="Instructors vs No. of Participants Taught" tone="marked">
        <p className="mb-2 text-xs text-slate-500">Total participants trained per WellSharp instructor</p>
        <Plot
          height={520}
          emptyMessage={instructorParticipants.length ? null : "No WellSharp data found"}
          data={[
            hbar({
              labels: instructorParticipants.map((i) => i.instructor),
              values: instructorParticipants.map((i) => i.participants),
              color: rankedColors(instructorParticipants.length),
              text: instructorParticipants.map(
                (i) => `${fmtInt(i.participants)} participants (${i.sessions} sessions)`,
              ),
              hovertemplate: "<b>%{y}</b><br>Participants: %{x}<extra></extra>",
            }),
          ]}
          layout={{
            xaxis: {
              title: { text: "Number of Participants" },
              range: headroom(instructorParticipants.map((i) => i.participants), 1.4),
            },
            yaxis: { title: { text: "" }, type: "category", tickfont: { size: 11 } },
            margin: { l: 200, r: 160, t: 30, b: 50 },
            showlegend: false,
          }}
        />
      </Card>

      <Card title="Instructor Detail Table" tone="navy">
        <DataTable
          rows={detailRows}
          pageLength={15}
          emptyMessage="No WellSharp data found"
          columns={[
            { key: "i", header: "Instructor Name", value: (r) => r.instructor },
            { key: "c", header: "Course Name", value: (r) => r.course },
            { key: "s", header: "Sessions", value: (r) => r.sessions, align: "center" },
            {
              key: "h",
              header: "Teaching Hours",
              value: (r) => r.teachingHours,
              align: "center",
              render: (r) => fmtInt(r.teachingHours),
            },
            {
              key: "p",
              header: "Total Participants",
              value: (r) => r.participants,
              align: "center",
              render: (r) => fmtInt(r.participants),
            },
          ]}
        />
      </Card>
    </div>
  );
}
