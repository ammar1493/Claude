"use client";

import { useMemo, useRef, useState } from "react";
import { Alert, Card } from "@/components/Card";
import { DataTable } from "@/components/DataTable";
import { Icon } from "@/components/Icons";
import Plot from "@/components/Plot";
import { ValueBox } from "@/components/ValueBox";
import { ascending, groupBy, nDistinct, sumBy, topN } from "@/lib/agg";
import { CHART_MARGIN_H, CHART_MARGIN_V, NEFT_GOLD, NEFT_NAVY, NEFT_TEAL } from "@/lib/brand";
import {
  addDays,
  ceilingMonth,
  floorMonth,
  fmtDayMonthYear,
  fmtMonthYear,
  fmtMonthYearFull,
  fromPeriodKey,
  toPeriodKey,
} from "@/lib/dates";
import { fmtInt, fmtNum, round1 } from "@/lib/format";
import { filterWindow, withDates } from "@/lib/manual";
import { hbar, headroom, line, rankedColors, rankedColorsOf, vbar, wrapLabel } from "@/lib/plots";
import { useDashboard } from "@/state/DashboardContext";
import { ManualEntryPanel } from "./ManualEntryPanel";

const selectClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-navy outline-none focus:border-navy";

export function Qiddiya() {
  const {
    qiddiya,
    qiddiyaFiles,
    reloadQiddiya,
    addQiddiyaWorkbook,
    removeQiddiyaWorkbook,
    qdManual,
    setQdManual,
    notify,
  } = useDashboard();

  const [period, setPeriod] = useState("all");
  const [includeManual, setIncludeManual] = useState<"yes" | "no">("yes");
  const uploadRef = useRef<HTMLInputElement>(null);

  /** Period choices = every month present in the workbook or the manual rows. */
  const periodChoices = useMemo(() => {
    const keys = new Set<string>();
    for (const s of qiddiya?.sessions ?? []) keys.add(toPeriodKey(floorMonth(s.date)));
    for (const m of withDates(qdManual)) keys.add(toPeriodKey(m.periodDate));
    return [...keys].sort();
  }, [qiddiya, qdManual]);

  const window = useMemo(() => {
    if (period === "all") return null;
    const start = fromPeriodKey(period);
    if (!start) return null;
    return { start, end: addDays(ceilingMonth(start), -1) };
  }, [period]);

  const sessions = useMemo(() => {
    const all = qiddiya?.sessions ?? [];
    return window ? all.filter((s) => s.date >= window.start && s.date <= window.end) : all;
  }, [qiddiya, window]);

  const days = useMemo(() => {
    const all = qiddiya?.days ?? [];
    return window ? all.filter((d) => d.date >= window.start && d.date <= window.end) : all;
  }, [qiddiya, window]);

  const manual = useMemo(() => {
    if (includeManual !== "yes") return [];
    return window ? filterWindow(qdManual, window.start, window.end) : withDates(qdManual);
  }, [qdManual, includeManual, window]);

  /** qd_totals() */
  const totals = useMemo(() => {
    const wbP = sumBy(sessions, (s) => s.students);
    const wbS = sessions.length;
    const wbD = days.length;
    const mnP = sumBy(manual, (m) => m.participants);
    const mnS = sumBy(manual, (m) => m.sessions);
    const mnD = sumBy(manual, (m) => m.teachingDays);
    return {
      wbP, wbS, wbD, mnP, mnS, mnD,
      participants: wbP + mnP,
      sessions: wbS + mnS,
      days: wbD + mnD,
      instructors: nDistinct(days.map((d) => d.instructor)),
      courses: nDistinct(sessions.map((s) => s.course)),
    };
  }, [sessions, days, manual]);

  /** qd_monthly() — workbook sessions, workbook days and manual rows merged. */
  const monthly = useMemo(() => {
    const acc = new Map<number, { month: Date; participants: number; sessions: number; teachingDays: number }>();
    const bump = (month: Date, p: number, s: number, d: number) => {
      const k = month.getTime();
      const hit = acc.get(k);
      if (hit) {
        hit.participants += p;
        hit.sessions += s;
        hit.teachingDays += d;
      } else acc.set(k, { month, participants: p, sessions: s, teachingDays: d });
    };
    for (const s of sessions) bump(floorMonth(s.date), s.students, 1, 0);
    for (const d of days) bump(floorMonth(d.date), 0, 0, 1);
    for (const m of manual) bump(m.periodDate, m.participants, m.sessions, m.teachingDays);
    return [...acc.values()].sort((a, b) => a.month.getTime() - b.month.getTime());
  }, [sessions, days, manual]);

  const instructorRanking = useMemo(() => {
    const byDays = [...groupBy(days, (d) => d.instructor).entries()].map(([instructor, rs]) => ({
      instructor,
      teachingDays: rs.length,
    }));
    const students = new Map(
      [...groupBy(sessions, (s) => s.instructor).entries()].map(([k, rs]) => [
        k,
        sumBy(rs, (r) => r.students),
      ]),
    );
    return ascending(
      topN(byDays, (d) => d.teachingDays, 10).map((d) => ({
        ...d,
        students: students.get(d.instructor) ?? 0,
      })),
      (d) => d.teachingDays,
    );
  }, [days, sessions]);

  const courseRanking = useMemo(() => {
    const agg = [...groupBy(sessions, (s) => s.course).entries()].map(([course, rs]) => ({
      course,
      participants: sumBy(rs, (r) => r.students),
      sessions: rs.length,
    }));
    return ascending(topN(agg, (a) => a.participants, 10), (a) => a.participants);
  }, [sessions]);

  const classUtilisation = useMemo(() => {
    const agg = [...groupBy(sessions, (s) => s.class).entries()].map(([cls, rs]) => ({
      cls,
      participants: sumBy(rs, (r) => r.students),
      sessions: rs.length,
      teachingDays: days.filter((d) => d.class === cls).length,
    }));
    return agg.sort((a, b) => b.participants - a.participants);
  }, [sessions, days]);

  const daily = useMemo(() => {
    const buckets = groupBy(sessions, (s) => s.date.getTime());
    return [...buckets.entries()]
      .map(([t, rs]) => ({ date: new Date(t), participants: sumBy(rs, (r) => r.students) }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [sessions]);

  const splitNote = (wb: number, mn: number) => (
    <span className="text-xs">
      {fmtInt(wb)} from workbook{mn > 0 ? ` + ${fmtInt(mn)} manual` : ""}
    </span>
  );

  return (
    <div className="space-y-6">
      <Alert tone="secondary" icon={<Icon name="info" size={16} />}>
        <strong>Qiddiya Academy (QCTA):</strong> figures are read automatically from the QCTA
        trainer-utilization workbooks and combined with any numbers added manually below. This tab is
        independent of the sidebar filters.
      </Alert>

      <Card>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-bold">Period</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className={selectClass}>
              <option value="all">All periods</option>
              {periodChoices.map((p) => {
                const d = fromPeriodKey(p);
                return (
                  <option key={p} value={p}>
                    {d ? fmtMonthYearFull(d) : p}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold">Include manual entries</label>
            <select
              value={includeManual}
              onChange={(e) => setIncludeManual(e.target.value as "yes" | "no")}
              className={selectClass}
            >
              <option value="yes">Yes — workbook + manual</option>
              <option value="no">No — workbook only</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold">Data source</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  void reloadQiddiya().then(() => notify("Reloaded QCTA workbook files."));
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-md border border-navy px-3 py-2 text-sm font-semibold text-navy hover:bg-navy/5"
              >
                <Icon name="refresh" size={15} /> Reload
              </button>
              <input
                ref={uploadRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  await addQiddiyaWorkbook(file);
                }}
              />
              <button
                type="button"
                onClick={() => uploadRef.current?.click()}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:brightness-110"
              >
                <Icon name="upload" size={15} /> Add file
              </button>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {qiddiyaFiles.length === 0 ? (
                <span className="text-red-600">No QCTA workbook detected.</span>
              ) : (
                <span>
                  {qiddiyaFiles.length} file(s) loaded:{" "}
                  {qiddiyaFiles.map((f) => (
                    <button
                      key={f}
                      type="button"
                      title="Remove this workbook"
                      onClick={() => void removeQiddiyaWorkbook(f)}
                      className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 hover:bg-red-50 hover:text-red-600"
                    >
                      {f} ×
                    </button>
                  ))}
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ValueBox
          title="Participants Trained"
          value={fmtInt(totals.participants)}
          showcase={<Icon name="people" size={28} />}
          theme="primary"
          compact
          footer={splitNote(totals.wbP, totals.mnP)}
        />
        <ValueBox
          title="Sessions Delivered"
          value={fmtInt(totals.sessions)}
          showcase={<Icon name="calendar-check" size={28} />}
          theme="accent"
          compact
          footer={splitNote(totals.wbS, totals.mnS)}
        />
        <ValueBox
          title="Teaching Days"
          value={fmtInt(totals.days)}
          showcase={<Icon name="clock-history" size={28} />}
          theme="deep"
          compact
          footer={
            <span className="text-xs">
              {fmtInt(totals.wbD)} from workbook
              {totals.mnD > 0 ? ` + ${fmtInt(totals.mnD)} manual` : ""}
              {totals.instructors > 0 ? ` | ${totals.instructors} instructors` : ""}
            </span>
          }
        />
        <ValueBox
          title="Avg Class Size"
          value={totals.sessions ? fmtNum(round1(totals.participants / totals.sessions)) : "N/A"}
          showcase={<Icon name="speedometer" size={28} />}
          theme="light"
          compact
          footer={<span className="text-slate-500">Participants per session</span>}
        />
      </div>

      <Card title="Add Qiddiya Numbers Manually" tone="marked">
        <ManualEntryPanel
          prefix="QD"
          rows={qdManual}
          onChange={setQdManual}
          showDays
          csvName="qiddiya_manual_entries.csv"
        />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Participants by Month" tone="navy">
          <Plot
            height={420}
            emptyMessage={monthly.length ? null : "No Qiddiya data for this selection"}
            data={[
              vbar({
                labels: monthly.map((m) => fmtMonthYear(m.month)),
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

        <Card title="Sessions &amp; Teaching Days by Month" tone="marked">
          <Plot
            height={420}
            emptyMessage={monthly.length ? null : "No Qiddiya data for this selection"}
            data={[
              vbar({
                labels: monthly.map((m) => fmtMonthYear(m.month)),
                values: monthly.map((m) => m.sessions),
                color: NEFT_GOLD,
                name: "Sessions",
                text: [],
                hovertemplate: "<b>%{x}</b><br>Sessions: %{y}<extra></extra>",
              }),
              vbar({
                labels: monthly.map((m) => fmtMonthYear(m.month)),
                values: monthly.map((m) => m.teachingDays),
                color: NEFT_NAVY,
                name: "Teaching Days",
                text: [],
                hovertemplate: "<b>%{x}</b><br>Teaching days: %{y}<extra></extra>",
              }),
            ]}
            layout={{
              barmode: "group",
              xaxis: { title: { text: "" }, type: "category", tickfont: { size: 11 } },
              yaxis: { title: { text: "Count" } },
              legend: { orientation: "h", x: 0, y: 1.12 },
              margin: CHART_MARGIN_V,
            }}
          />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Top Instructors by Teaching Days" tone="navy">
          <Plot
            height={420}
            emptyMessage={instructorRanking.length ? null : "No instructor data in the workbook"}
            data={[
              hbar({
                labels: instructorRanking.map((i) => i.instructor),
                values: instructorRanking.map((i) => i.teachingDays),
                color: rankedColors(instructorRanking.length),
                text: instructorRanking.map((i) => `${i.teachingDays} days | ${i.students} participants`),
                hovertemplate: "<b>%{y}</b><br>Teaching days: %{x}<extra></extra>",
              }),
            ]}
            layout={{
              xaxis: {
                title: { text: "Teaching Days" },
                range: headroom(instructorRanking.map((i) => i.teachingDays), 1.6, 1),
              },
              yaxis: { title: { text: "" }, type: "category", tickfont: { size: 11 } },
              margin: CHART_MARGIN_H,
              showlegend: false,
            }}
          />
        </Card>

        <Card title="Top Courses by Participants">
          <Plot
            height={420}
            emptyMessage={courseRanking.length ? null : "No course data in the workbook"}
            data={[
              hbar({
                labels: courseRanking.map((c) => c.course),
                values: courseRanking.map((c) => c.participants),
                color: rankedColorsOf(NEFT_TEAL, courseRanking.length),
                text: courseRanking.map((c) => `${c.participants} (${c.sessions} sessions)`),
                hovertemplate: "<b>%{y}</b><br>Participants: %{x}<extra></extra>",
              }),
            ]}
            layout={{
              xaxis: {
                title: { text: "Participants" },
                range: headroom(courseRanking.map((c) => c.participants), 1.5, 1),
              },
              yaxis: { title: { text: "" }, type: "category", tickfont: { size: 10 } },
              margin: CHART_MARGIN_H,
              showlegend: false,
            }}
          />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Utilization by Class / Track" tone="navy">
          <Plot
            height={420}
            emptyMessage={classUtilisation.length ? null : "No class data in the workbook"}
            data={[
              vbar({
                labels: classUtilisation.map((c) => c.cls),
                values: classUtilisation.map((c) => c.participants),
                color: NEFT_NAVY,
                name: "Participants",
              }),
              vbar({
                labels: classUtilisation.map((c) => c.cls),
                values: classUtilisation.map((c) => c.teachingDays),
                color: NEFT_GOLD,
                name: "Teaching Days",
                text: [],
              }),
            ]}
            layout={{
              barmode: "group",
              // Track names run long ("Class 7 / Mobile / Outbound"), so each
              // tick is wrapped onto short lines instead of colliding with its
              // neighbour. The bars keep the full name in their hover text.
              xaxis: {
                title: { text: "" },
                type: "category",
                tickfont: { size: 10 },
                tickangle: 0,
                tickmode: "array",
                tickvals: classUtilisation.map((c) => c.cls),
                ticktext: classUtilisation.map((c) => wrapLabel(c.cls)),
              },
              yaxis: {
                title: { text: "Count" },
                range: headroom(classUtilisation.map((c) => c.participants), 1.25, 1),
              },
              legend: { orientation: "h", x: 0, y: 1.12 },
              margin: { ...CHART_MARGIN_V, b: 130 },
            }}
          />
        </Card>

        <Card title="Daily Participants Trend">
          <Plot
            height={420}
            emptyMessage={daily.length ? null : "No daily data in the workbook"}
            data={[
              line({
                x: daily.map((d) => d.date),
                y: daily.map((d) => d.participants),
                color: NEFT_NAVY,
                width: 2.5,
                markerColor: NEFT_GOLD,
                markerSize: 7,
                fill: true,
                fillcolor: "rgba(0, 33, 71, 0.15)",
                hovertemplate: "<b>%{x|%d %b %Y}</b><br>Participants: %{y}<extra></extra>",
              }),
            ]}
            layout={{
              xaxis: { title: { text: "" }, tickfont: { size: 10 } },
              yaxis: { title: { text: "Participants" } },
              margin: CHART_MARGIN_V,
              showlegend: false,
            }}
          />
        </Card>
      </div>

      <Card title="Session Detail (from workbook)" tone="navy">
        <DataTable
          rows={[...sessions].sort(
            (a, b) => a.date.getTime() - b.date.getTime() || a.class.localeCompare(b.class),
          )}
          pageLength={15}
          filterRow
          emptyMessage="No Qiddiya workbook rows for this selection."
          columns={[
            { key: "d", header: "Date", value: (r) => fmtDayMonthYear(r.date) },
            { key: "cl", header: "Class", value: (r) => r.class },
            { key: "co", header: "Course", value: (r) => r.course },
            { key: "i", header: "Instructor", value: (r) => r.instructor },
            { key: "p", header: "Participants", value: (r) => r.students, align: "right" },
            { key: "sd", header: "Session Days", value: (r) => r.sessionDays, align: "right" },
            { key: "src", header: "Source", value: (r) => r.sourceFile },
          ]}
        />
      </Card>
    </div>
  );
}
