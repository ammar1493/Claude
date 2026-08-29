import type { ReactNode } from "react";

export type ValueBoxTheme = "primary" | "secondary" | "light" | "warning" | "success" | "dark" | "hse";

const THEMES: Record<ValueBoxTheme, { shell: string; title: string; value: string; icon: string }> = {
  primary: { shell: "bg-navy text-white", title: "text-white/70", value: "text-white", icon: "text-gold/80" },
  secondary: { shell: "bg-gold text-navy", title: "text-navy/70", value: "text-navy", icon: "text-navy/40" },
  light: { shell: "bg-white text-navy ring-1 ring-slate-200", title: "text-slate-500", value: "text-navy", icon: "text-navy/25" },
  warning: { shell: "bg-amber-100 text-navy ring-1 ring-amber-200", title: "text-amber-800", value: "text-navy", icon: "text-amber-500/60" },
  success: { shell: "bg-hse text-white", title: "text-white/75", value: "text-white", icon: "text-white/40" },
  dark: { shell: "bg-slate-800 text-white", title: "text-white/70", value: "text-white", icon: "text-white/30" },
  hse: { shell: "bg-hse text-white", title: "text-white/75", value: "text-white", icon: "text-white/40" },
};

/**
 * bslib::value_box() equivalent: a title, a big value, an optional showcase
 * icon and an optional footer slot for the delta text.
 */
export function ValueBox({
  title,
  value,
  showcase,
  theme = "light",
  footer,
  compact,
}: {
  title: string;
  value: ReactNode;
  showcase?: ReactNode;
  theme?: ValueBoxTheme;
  footer?: ReactNode;
  compact?: boolean;
}) {
  const t = THEMES[theme];
  return (
    <div className={`print-block relative flex flex-col justify-between overflow-hidden rounded-xl px-4 py-3 shadow-sm ${t.shell}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[11px] font-semibold uppercase tracking-wide ${t.title}`}>{title}</p>
          <div className={`mt-1 font-bold leading-none ${t.value} ${compact ? "text-2xl" : "text-3xl"}`}>
            {value}
          </div>
        </div>
        {showcase && <div className={`shrink-0 ${t.icon}`}>{showcase}</div>}
      </div>
      {footer && <div className="mt-2 text-xs">{footer}</div>}
    </div>
  );
}

/** The "N vs prior" line under the executive KPIs. */
export function Delta({ diff, suffix = "vs prior", small }: { diff: number; suffix?: string; small?: boolean }) {
  const up = diff >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold ${up ? "text-emerald-500" : "text-red-400"} ${small ? "text-xs" : "text-sm"}`}
    >
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      {Math.abs(diff).toLocaleString("en-US")} {suffix}
    </span>
  );
}

export function DeltaPct({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-2xl font-bold ${up ? "text-emerald-600" : "text-red-600"}`}>
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      {Math.abs(value)}%
    </span>
  );
}

/** A small stat tile, used by the capacity / summary panels. */
export function StatTile({
  value,
  label,
  sub,
  tone = "navy",
}: {
  value: ReactNode;
  label: string;
  sub?: string;
  tone?: "navy" | "gold" | "green" | "cyan" | "red" | "slate";
}) {
  const tones = {
    navy: "text-navy",
    gold: "text-amber-500",
    green: "text-emerald-600",
    cyan: "text-sky-600",
    red: "text-red-600",
    slate: "text-slate-500",
  } as const;
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-center ring-1 ring-slate-200/60">
      <div className={`text-2xl font-bold ${tones[tone]}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
      {sub && <div className="text-[11px] italic text-slate-400">{sub}</div>}
    </div>
  );
}
