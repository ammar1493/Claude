import { NEFT_GOLD, NEFT_NAVY, PLOT_FONT } from "./brand";

/**
 * Builders for the plotly shapes app.R uses over and over: a horizontal bar
 * with the value printed outside, a vertical bar, and a filled trend line.
 * Keeping the padding factors here means the headroom above the labels stays
 * identical to the R version (`range = c(0, max * 1.2)` and friends).
 */

export interface HBarOptions {
  labels: string[];
  values: number[];
  /** One colour for the series, or one per bar. */
  color: string | string[];
  text?: string[];
  hovertemplate?: string;
  textColor?: string;
  textSize?: number;
  outlineColor?: string;
  outlineWidth?: number;
  customdata?: unknown[];
}

export function hbar(o: HBarOptions): Record<string, unknown> {
  return {
    type: "bar",
    orientation: "h",
    y: o.labels,
    x: o.values,
    marker: {
      color: o.color,
      ...(o.outlineColor ? { line: { color: o.outlineColor, width: o.outlineWidth ?? 1.5 } } : {}),
    },
    text: o.text ?? o.values.map((v) => v.toLocaleString("en-US")),
    textposition: "outside",
    cliponaxis: false,
    textfont: { ...PLOT_FONT, size: o.textSize ?? 11, color: o.textColor ?? NEFT_NAVY },
    hovertemplate: o.hovertemplate ?? "<b>%{y}</b><br>%{x}<extra></extra>",
    ...(o.customdata ? { customdata: o.customdata } : {}),
  };
}

export interface VBarOptions {
  labels: (string | number)[];
  values: number[];
  color: string | string[];
  name?: string;
  text?: string[];
  hovertemplate?: string;
  textSize?: number;
  outlineColor?: string;
}

export function vbar(o: VBarOptions): Record<string, unknown> {
  // An explicitly empty `text` means "no value labels", matching the plain
  // add_bars() calls in app.R.
  const labelled = !(o.text && o.text.length === 0);
  return {
    type: "bar",
    x: o.labels,
    y: o.values,
    ...(o.name ? { name: o.name } : {}),
    marker: {
      color: o.color,
      ...(o.outlineColor ? { line: { color: o.outlineColor, width: 1.5 } } : {}),
    },
    ...(labelled
      ? {
          text: o.text ?? o.values.map((v) => v.toLocaleString("en-US")),
          textposition: "outside",
          cliponaxis: false,
          textfont: { ...PLOT_FONT, size: o.textSize ?? 11, color: NEFT_NAVY },
        }
      : {}),
    hovertemplate: o.hovertemplate ?? "<b>%{x}</b><br>%{y}<extra></extra>",
  };
}

export interface LineOptions {
  x: (string | number | Date)[];
  y: number[];
  color: string;
  name?: string;
  fill?: boolean;
  fillcolor?: string;
  markerSize?: number;
  markerColor?: string;
  text?: string[];
  showText?: boolean;
  hovertemplate?: string;
  width?: number;
}

export function line(o: LineOptions): Record<string, unknown> {
  return {
    type: "scatter",
    mode: o.showText ? "lines+markers+text" : "lines+markers",
    x: o.x,
    y: o.y,
    ...(o.name ? { name: o.name } : {}),
    line: { color: o.color, width: o.width ?? 3 },
    marker: {
      size: o.markerSize ?? 8,
      color: o.markerColor ?? o.color,
      ...(o.markerColor ? { line: { color: o.color, width: 1 } } : {}),
    },
    ...(o.showText
      ? {
          text: o.text ?? o.y.map((v) => v.toLocaleString("en-US")),
          textposition: "top center",
          textfont: { ...PLOT_FONT, size: 10, color: NEFT_NAVY },
        }
      : {}),
    ...(o.fill ? { fill: "tozeroy", fillcolor: o.fillcolor ?? "rgba(0, 33, 71, 0.1)" } : {}),
    hovertemplate: o.hovertemplate ?? "<b>%{x}</b><br>%{y}<extra></extra>",
  };
}

/**
 * Ranked bars are drawn in navy with the leading bar in gold: the guidelines
 * reserve gold for single accents and key figures, so it marks the top of a
 * ranking rather than filling every bar. Horizontal bars are sorted ascending
 * before plotting, so the leader is the last element.
 */
export function rankedColors(count: number, leader: "last" | "first" = "last"): string[] {
  const at = leader === "last" ? count - 1 : 0;
  return Array.from({ length: count }, (_, i) => (i === at ? NEFT_GOLD : NEFT_NAVY));
}

/** Same idea for a non-navy series (HSE teal, Qiddiya, …). */
export function rankedColorsOf(base: string, count: number, leader: "last" | "first" = "last"): string[] {
  const at = leader === "last" ? count - 1 : 0;
  return Array.from({ length: count }, (_, i) => (i === at ? NEFT_GOLD : base));
}

/** `range = c(0, max(values) * factor)` — the headroom for outside labels. */
export function headroom(values: number[], factor = 1.2, plus = 0): [number, number] {
  const max = values.reduce((m, v) => (Number.isFinite(v) && v > m ? v : m), 0);
  return [0, max * factor + plus || 1];
}

/** Categorical palette for stacked breakdowns, from the brand series colours. */
export { SERIES_COLORS as CATEGORY_COLORS } from "./brand";
