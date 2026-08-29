"use client";

import { useEffect, useRef } from "react";
import { PLOT_FONT } from "@/lib/brand";

type PlotlyModule = import("plotly.js-dist-min").PlotlyStatic;

let plotlyPromise: Promise<PlotlyModule> | null = null;

/** plotly.js is ~3 MB, so it is fetched once, lazily, on the client only. */
function loadPlotly(): Promise<PlotlyModule> {
  if (!plotlyPromise) plotlyPromise = import("plotly.js-dist-min").then((m) => m.default ?? m);
  return plotlyPromise;
}

export interface PlotProps {
  data: Record<string, unknown>[];
  layout?: Record<string, unknown>;
  height?: number;
  className?: string;
  /** Rendered instead of the chart when there is nothing to draw. */
  emptyMessage?: string | null;
}

const BASE_LAYOUT: Record<string, unknown> = {
  font: { ...PLOT_FONT, size: 12, color: "#002147" },
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  hoverlabel: { font: { ...PLOT_FONT, size: 12 } },
  xaxis: { gridcolor: "#e9edf2", zerolinecolor: "#e9edf2", automargin: true },
  yaxis: { gridcolor: "#e9edf2", zerolinecolor: "#e9edf2", automargin: true },
};

const CONFIG = {
  displaylogo: false,
  responsive: true,
  modeBarButtonsToRemove: ["lasso2d", "select2d"] as const,
  toImageButtonOptions: { filename: "neft-chart", scale: 2 },
};

function mergeAxis(base: unknown, extra: unknown): Record<string, unknown> {
  return { ...(base as object), ...(extra as object) };
}

export default function Plot({ data, layout, height = 420, className, emptyMessage }: PlotProps) {
  const ref = useRef<HTMLDivElement>(null);
  const plotted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const node = ref.current;
    if (!node) return;
    if (emptyMessage) return;

    const merged: Record<string, unknown> = {
      ...BASE_LAYOUT,
      ...layout,
      height,
      xaxis: mergeAxis(BASE_LAYOUT.xaxis, layout?.xaxis),
      yaxis: mergeAxis(BASE_LAYOUT.yaxis, layout?.yaxis),
      margin: { l: 60, r: 30, t: 40, b: 50, ...(layout?.margin as object) },
    };

    loadPlotly().then((Plotly) => {
      if (cancelled || !ref.current) return;
      void Plotly.react(ref.current, data, merged, { ...CONFIG });
      plotted.current = true;
    });

    return () => {
      cancelled = true;
    };
  }, [data, layout, height, emptyMessage]);

  useEffect(() => {
    const node = ref.current;
    return () => {
      if (!node || !plotted.current) return;
      loadPlotly().then((Plotly) => Plotly.purge(node));
    };
  }, []);

  if (emptyMessage) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-500 ${className ?? ""}`}
        style={{ height }}
      >
        {emptyMessage}
      </div>
    );
  }

  return <div ref={ref} className={className} style={{ height, width: "100%" }} />;
}
