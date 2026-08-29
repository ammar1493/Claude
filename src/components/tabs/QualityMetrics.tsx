"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import Plot from "@/components/Plot";
import { DANGER, NEFT_GOLD, NEFT_GREEN, NEFT_TEAL } from "@/lib/brand";
import { QUESTIONS_MAP } from "@/lib/config";
import { headroom } from "@/lib/plots";

interface SheetPayload {
  header: string[];
  rows: (string | number | null)[][];
}

const selectClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-navy outline-none focus:border-navy";

/**
 * Colour bands from instructor_performance_chart(), remapped onto the brand
 * palette — teal and green carry the strong scores, gold the middle, and the
 * one alert colour marks a score below 3.
 */
function scoreColor(score: number): string {
  if (score >= 4.5) return NEFT_GREEN;
  if (score >= 4.0) return NEFT_TEAL;
  if (score >= 3.5) return NEFT_GOLD;
  if (score >= 3.0) return "#C98A1E";
  return DANGER;
}

function useSheet(name: string) {
  const [state, setState] = useState<{
    status: "loading" | "ready" | "error";
    data: SheetPayload | null;
    error: string | null;
  }>({ status: "loading", data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", data: null, error: null });
    fetch(`/api/sheet?name=${encodeURIComponent(name)}`)
      .then(async (res) => {
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({ status: "error", data: null, error: body.message ?? `HTTP ${res.status}` });
          return;
        }
        setState({ status: "ready", data: body as SheetPayload, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: "error", data: null, error: (err as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [name]);

  return state;
}

export function QualityMetrics() {
  const [chartSheet, setChartSheet] = useState(QUESTIONS_MAP[0].sheet);
  const [tableSheet, setTableSheet] = useState(QUESTIONS_MAP[0].sheet);

  const chartData = useSheet(chartSheet);
  const tableData = useSheet(tableSheet);

  /**
   * Columns 2–6 hold the counts of 1..5 star responses, so the average is the
   * weighted mean of those five buckets — the same arithmetic as app.R.
   */
  const scores = useMemo(() => {
    const d = chartData.data;
    if (!d || d.header.length < 6) return null;
    const out = d.rows
      .map((row) => {
        const counts = [1, 2, 3, 4, 5].map((i) => {
          const v = Number(row[i]);
          return Number.isFinite(v) ? v : 0;
        });
        const total = counts.reduce((a, b) => a + b, 0);
        const weighted = counts.reduce((a, b, i) => a + b * (i + 1), 0);
        return {
          instructor: String(row[0] ?? "").trim(),
          avg: total > 0 ? weighted / total : 0,
          responses: total,
        };
      })
      .filter((r) => r.responses > 0 && r.instructor)
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 10);
    // Horizontal bars read bottom-to-top.
    return out.reverse();
  }, [chartData.data]);

  const tableColumns: Column<(string | number | null)[]>[] = useMemo(() => {
    const header = tableData.data?.header ?? [];
    return header.map((h, i) => ({
      key: `c${i}`,
      header: h || `Column ${i + 1}`,
      value: (row) => (row[i] === null || row[i] === undefined ? "" : (row[i] as string | number)),
      align: i === 0 ? "left" : "right",
    }));
  }, [tableData.data]);

  const chartEmpty =
    chartData.status === "loading"
      ? "Loading the published evaluation workbook…"
      : chartData.status === "error"
        ? chartData.error ?? "No data available for selected metric"
        : !chartData.data || chartData.data.header.length < 6
          ? "Not enough columns found. Need at least 6 columns (Name + 5 score columns)."
          : !scores?.length
            ? "No instructor data with responses found"
            : null;

  return (
    <div className="space-y-6">
      <Card title="Instructor Performance Comparison" tone="navy">
        <label className="mb-3 block text-sm font-semibold">
          Select Metric:
          <select
            value={chartSheet}
            onChange={(e) => setChartSheet(e.target.value)}
            className={`mt-1 ${selectClass}`}
          >
            {QUESTIONS_MAP.map((q) => (
              <option key={q.sheet} value={q.sheet}>
                {q.label}
              </option>
            ))}
          </select>
        </label>
        <Plot
          height={320}
          emptyMessage={chartEmpty}
          data={[
            {
              type: "bar",
              orientation: "h",
              y: (scores ?? []).map((s) => s.instructor),
              x: (scores ?? []).map((s) => s.avg),
              marker: { color: (scores ?? []).map((s) => scoreColor(s.avg)) },
              text: (scores ?? []).map(
                (s) => `${s.avg.toFixed(2)} (${s.responses.toLocaleString("en-US")} resp.)`,
              ),
              textposition: "outside",
              cliponaxis: false,
              textfont: { size: 10 },
              customdata: (scores ?? []).map((s) => s.responses),
              hovertemplate:
                "<b>%{y}</b><br>Average Score: %{x:.2f}<br>Total Responses: %{customdata}<extra></extra>",
            },
          ]}
          layout={{
            xaxis: { title: { text: "Average Score (1-5)" }, range: [0, 5.8], tickfont: { size: 10 } },
            yaxis: { title: { text: "" }, type: "category", tickfont: { size: 10 } },
            margin: { l: 180, r: 120, t: 20, b: 40 },
            showlegend: false,
          }}
        />
      </Card>

      <Card title="Detailed Evaluation Scores" tone="marked">
        <label className="mb-3 block text-sm font-semibold">
          Select Metric:
          <select
            value={tableSheet}
            onChange={(e) => setTableSheet(e.target.value)}
            className={`mt-1 ${selectClass}`}
          >
            {QUESTIONS_MAP.map((q) => (
              <option key={q.sheet} value={q.sheet}>
                {q.label}
              </option>
            ))}
          </select>
        </label>
        {tableData.status === "error" ? (
          <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            Unable to load Google Sheet data — {tableData.error}
          </p>
        ) : (
          <DataTable
            rows={tableData.data?.rows ?? []}
            columns={tableColumns}
            pageLength={10}
            emptyMessage={tableData.status === "loading" ? "Loading…" : "No rows on this tab"}
          />
        )}
      </Card>
    </div>
  );
}
