"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Card, SectionTitle } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { Icon } from "@/components/Icons";
import Plot from "@/components/Plot";
import { StatTile, ValueBox } from "@/components/ValueBox";
import { NEFT_NAVY, NEFT_SLATE } from "@/lib/brand";
import { fmtInt, fmtNum } from "@/lib/format";
import { hbar, headroom, rankedColorsOf } from "@/lib/plots";
import {
  buildScorecard,
  questionText,
  SCORE_BANDS,
  scoreColor,
  scoreTextColor,
  weightedAverage,
  type QualitySheet,
} from "@/lib/quality";

interface Payload {
  sheets: QualitySheet[];
  missing: string[];
}

function useQuality() {
  const [state, setState] = useState<{
    status: "loading" | "ready" | "error";
    data: Payload | null;
    error: string | null;
  }>({ status: "loading", data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/quality")
      .then(async (res) => {
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({ status: "error", data: null, error: body.message ?? `HTTP ${res.status}` });
          return;
        }
        setState({ status: "ready", data: body as Payload, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: "error", data: null, error: (err as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function QualityMetrics() {
  const { status, data, error } = useQuality();
  const [sort, setSort] = useState<"score" | "responses" | "name">("score");

  const board = useMemo(() => (data ? buildScorecard(data.sheets) : null), [data]);

  const instructors = useMemo(() => {
    if (!board) return [];
    const rows = [...board.instructors];
    if (sort === "responses") rows.sort((a, b) => b.responses - a.responses);
    else if (sort === "name") rows.sort((a, b) => a.instructor.localeCompare(b.instructor));
    return rows;
  }, [board, sort]);

  if (status === "loading") {
    return (
      <Alert tone="info" icon={<Icon name="info" size={16} />}>
        Loading the published evaluation workbook…
      </Alert>
    );
  }

  if (status === "error" || !board) {
    return (
      <Alert tone="warning" icon={<Icon name="warning" size={16} />}>
        <strong>The evaluation workbook could not be read.</strong> {error}
        <br />
        This tab reads the published Google workbook, one tab per question, with the instructor in
        the first column and the counts of 1–5 star responses in the next five. Check the workbook is
        still published to the web, or point <code className="rounded bg-fog px-1">NEFT_QUALITY_XLSX_URL</code>{" "}
        at a different one.
      </Alert>
    );
  }

  const rated = board.instructors.length;
  const strong = board.instructors.filter((i) => i.avg >= 4.5).length;
  const needsAttention = board.instructors.filter((i) => i.avg < 4).length;

  const questionsRanked = [...board.questions].sort((a, b) => a.avg - b.avg);

  return (
    <div className="space-y-6">
      {!!data?.missing.length && (
        <Alert tone="warning" icon={<Icon name="warning" size={16} />}>
          {data.missing.length} evaluation tab(s) were not found in the workbook and are excluded:{" "}
          {data.missing.join(", ")}.
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ValueBox
          title="Overall Score"
          value={fmtNum(board.overallAvg, 2)}
          showcase={<Icon name="star" size={28} />}
          theme="primary"
          compact
          footer={<span className="text-xs">Weighted across every question</span>}
        />
        <ValueBox
          title="Responses"
          value={fmtInt(board.totalResponses)}
          showcase={<Icon name="people" size={28} />}
          theme="accent"
          compact
          footer={<span className="text-xs">{board.questions.length} questions</span>}
        />
        <ValueBox
          title="Instructors Rated"
          value={fmtInt(rated)}
          showcase={<Icon name="mortarboard" size={28} />}
          theme="light"
          compact
          footer={<span className="text-slate-ink">{strong} scoring 4.5 or above</span>}
        />
        <ValueBox
          title="Below 4.0"
          value={fmtInt(needsAttention)}
          showcase={<Icon name="warning" size={28} />}
          theme={needsAttention > 0 ? "outline" : "light"}
          compact
          footer={
            <span className="text-slate-ink">
              {needsAttention > 0 ? "Instructors worth a conversation" : "Nobody below 4.0"}
            </span>
          }
        />
      </div>

      <SectionTitle>What scores well, and what does not</SectionTitle>
      <div className="grid gap-4 xl:grid-cols-12">
        <Card title="Average Score by Question" tone="marked" className="xl:col-span-7">
          <p className="mb-2 text-xs text-slate-ink">
            Weakest at the top. This is the whole school, not one instructor.
          </p>
          <Plot
            height={420}
            data={[
              hbar({
                labels: questionsRanked.map((q) => q.code),
                values: questionsRanked.map((q) => Number(q.avg.toFixed(2))),
                color: rankedColorsOf(NEFT_NAVY, questionsRanked.length, "first"),
                text: questionsRanked.map((q) => q.avg.toFixed(2)),
                customdata: questionsRanked.map((q) => [questionText(q.question), fmtInt(q.responses)]),
                hovertemplate:
                  "<b>%{y}</b> — %{customdata[0]}<br>Average: %{x:.2f}<br>Responses: %{customdata[1]}<extra></extra>",
              }),
            ]}
            layout={{
              xaxis: { title: { text: "Average score (1–5)" }, range: [0, 5.6], nticks: 6 },
              yaxis: { title: { text: "" }, type: "category", autorange: "reversed" },
              margin: { l: 55, r: 60, t: 20, b: 45 },
              showlegend: false,
            }}
          />
        </Card>

        <Card title="Response Mix" tone="marked" className="xl:col-span-5" inset>
          <p className="mb-2 text-xs text-slate-ink">
            How every response was scored, across all questions.
          </p>
          <Plot
            height={230}
            data={[
              hbar({
                labels: ["1 star", "2", "3", "4", "5 stars"],
                values: board.distribution,
                color: board.distribution.map((_, i) => scoreColor(i + 1)),
                text: board.distribution.map(
                  (c) =>
                    `${fmtInt(c)}  (${board.totalResponses ? ((c / board.totalResponses) * 100).toFixed(1) : "0"}%)`,
                ),
                hovertemplate: "<b>%{y}</b><br>%{x:,} responses<extra></extra>",
              }),
            ]}
            layout={{
              xaxis: {
                title: { text: "Responses" },
                range: headroom(board.distribution, 1.45),
                tickformat: "~s",
                nticks: 4,
              },
              yaxis: { title: { text: "" }, type: "category" },
              margin: { l: 65, r: 30, t: 15, b: 45 },
              showlegend: false,
            }}
          />
          <div className="mt-3 grid grid-cols-3 gap-2">
            <StatTile value={fmtNum(board.overallAvg, 2)} label="Mean score" accent />
            <StatTile
              value={`${board.totalResponses ? (((board.distribution[3] + board.distribution[4]) / board.totalResponses) * 100).toFixed(0) : 0}%`}
              label="Rated 4 or 5"
            />
            <StatTile
              value={`${board.totalResponses ? (((board.distribution[0] + board.distribution[1]) / board.totalResponses) * 100).toFixed(1) : 0}%`}
              label="Rated 1 or 2"
            />
          </div>
        </Card>
      </div>

      <SectionTitle>Instructor scorecard</SectionTitle>
      <Card
        title="Every instructor against every question"
        tone="navy"
        action={
          <div className="flex items-center gap-2 text-[13px] font-normal">
            <span className="text-white/70">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="rounded border border-white/20 bg-white px-2 py-1 text-navy"
            >
              <option value="score">Overall score</option>
              <option value="responses">Responses</option>
              <option value="name">Name</option>
            </select>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-ink">
          <span className="font-semibold">Score bands</span>
          {SCORE_BANDS.map((b) => (
            <span key={b.label} className="flex items-center gap-1.5">
              <span aria-hidden className="h-3 w-3 rounded-sm" style={{ background: b.color }} />
              {b.label}
            </span>
          ))}
        </div>

        <div className="neft-scroll overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-slate-ink">
                  Instructor
                </th>
                <th className="px-2 py-2 text-right text-xs font-bold uppercase tracking-wide text-slate-ink">
                  Overall
                </th>
                <th className="px-2 py-2 text-right text-xs font-bold uppercase tracking-wide text-slate-ink">
                  Resp.
                </th>
                {board.questions.map((q) => (
                  <th
                    key={q.sheet}
                    title={questionText(q.question)}
                    className="px-1 py-2 text-center text-xs font-bold text-slate-ink"
                  >
                    {q.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {instructors.map((ins) => (
                <tr key={ins.instructor} className="hover:bg-navy/5">
                  <td className="sticky left-0 z-10 whitespace-nowrap border-t border-hairline bg-white px-3 py-1.5 font-medium text-navy">
                    {ins.instructor}
                  </td>
                  <td className="border-t border-hairline px-2 py-1.5 text-right font-bold tabular-nums text-navy">
                    {ins.avg.toFixed(2)}
                  </td>
                  <td className="border-t border-hairline px-2 py-1.5 text-right tabular-nums text-slate-ink">
                    {fmtInt(ins.responses)}
                  </td>
                  {board.questions.map((q) => {
                    const cell = ins.byQuestion.get(q.sheet);
                    if (!cell) {
                      return (
                        <td
                          key={q.sheet}
                          className="border-t border-hairline px-1 py-1.5 text-center text-xs text-slate-ink/40"
                        >
                          –
                        </td>
                      );
                    }
                    return (
                      <td key={q.sheet} className="border-t border-hairline px-1 py-1.5">
                        <span
                          title={`${questionText(q.question)} — ${cell.avg.toFixed(2)} from ${fmtInt(cell.responses)} responses`}
                          className="mx-auto flex h-7 w-11 items-center justify-center rounded text-xs font-bold tabular-nums"
                          style={{ background: scoreColor(cell.avg), color: scoreTextColor(cell.avg) }}
                        >
                          {cell.avg.toFixed(1)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <SectionTitle>Where to focus</SectionTitle>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Lowest Overall Scores" tone="marked" inset>
          <p className="mb-2 text-xs text-slate-ink">
            The weakest question for each is named, so a conversation has a starting point.
          </p>
          <DataTable
            rows={[...board.instructors].sort((a, b) => a.avg - b.avg).slice(0, 10)}
            pageLength={10}
            dense
            emptyMessage="No instructor data"
            columns={
              [
                { key: "i", header: "Instructor", value: (r) => r.instructor },
                {
                  key: "s",
                  header: "Overall",
                  value: (r) => Number(r.avg.toFixed(2)),
                  align: "right",
                  render: (r) => (
                    <span className="font-bold" style={{ color: scoreColor(r.avg) }}>
                      {r.avg.toFixed(2)}
                    </span>
                  ),
                },
                { key: "n", header: "Responses", value: (r) => r.responses, align: "right" },
                {
                  key: "w",
                  header: "Weakest areas",
                  value: (r) => r.weakest.map((w) => w.code).join(", "),
                  render: (r) => (
                    <span className="text-xs text-slate-ink">
                      {r.weakest.map((w) => `${w.code} ${w.avg.toFixed(1)}`).join(" · ")}
                    </span>
                  ),
                },
              ] as Column<(typeof board.instructors)[number]>[]
            }
          />
        </Card>

        <Card title="Highest Overall Scores" tone="marked" inset>
          <p className="mb-2 text-xs text-slate-ink">Ranked by weighted average across all questions.</p>
          <DataTable
            rows={board.instructors.slice(0, 10)}
            pageLength={10}
            dense
            emptyMessage="No instructor data"
            columns={
              [
                { key: "i", header: "Instructor", value: (r) => r.instructor },
                {
                  key: "s",
                  header: "Overall",
                  value: (r) => Number(r.avg.toFixed(2)),
                  align: "right",
                  render: (r) => (
                    <span className="font-bold" style={{ color: scoreColor(r.avg) }}>
                      {r.avg.toFixed(2)}
                    </span>
                  ),
                },
                { key: "n", header: "Responses", value: (r) => r.responses, align: "right" },
              ] as Column<(typeof board.instructors)[number]>[]
            }
          />
        </Card>
      </div>

      <SectionTitle>Question detail</SectionTitle>
      <QuestionDetail sheets={data?.sheets ?? []} />
    </div>
  );
}

/** The original per-question table, kept for looking at raw counts. */
function QuestionDetail({ sheets }: { sheets: QualitySheet[] }) {
  const [sheet, setSheet] = useState(sheets[0]?.sheet ?? "");
  const active = sheets.find((s) => s.sheet === sheet) ?? sheets[0];

  const rows = useMemo(() => {
    if (!active) return [];
    return active.rows
      .map((r) => {
        const { avg, responses } = weightedAverage(r.counts);
        return { ...r, avg, responses };
      })
      .sort((a, b) => b.avg - a.avg);
  }, [active]);

  if (!active) return null;

  return (
    <Card
      title={questionText(active.question)}
      tone="marked"
      action={
        <select
          value={sheet}
          onChange={(e) => setSheet(e.target.value)}
          className="rounded-md border border-hairline bg-white px-2 py-1 text-[13px] font-normal text-navy"
        >
          {sheets.map((s) => (
            <option key={s.sheet} value={s.sheet}>
              {s.question}
            </option>
          ))}
        </select>
      }
    >
      <DataTable
        rows={rows}
        pageLength={12}
        emptyMessage="No responses recorded for this question"
        columns={[
          { key: "i", header: "Instructor", value: (r) => r.instructor },
          {
            key: "a",
            header: "Average",
            value: (r) => Number(r.avg.toFixed(2)),
            align: "right",
            render: (r) => (
              <span className="font-bold" style={{ color: scoreColor(r.avg) }}>
                {r.avg.toFixed(2)}
              </span>
            ),
          },
          { key: "n", header: "Responses", value: (r) => r.responses, align: "right" },
          { key: "c1", header: "1★", value: (r) => r.counts[0], align: "right" },
          { key: "c2", header: "2★", value: (r) => r.counts[1], align: "right" },
          { key: "c3", header: "3★", value: (r) => r.counts[2], align: "right" },
          { key: "c4", header: "4★", value: (r) => r.counts[3], align: "right" },
          { key: "c5", header: "5★", value: (r) => r.counts[4], align: "right" },
        ]}
      />
    </Card>
  );
}
