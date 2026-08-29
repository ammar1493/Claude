import type { ReactNode } from "react";

/**
 * KPI tile, following the card system on page 06 of the brand guidelines:
 * a navy panel, a gold uppercase micro-label, and a large figure.
 *
 * Gold is never used as a panel fill — the guidelines reserve it for single
 * accents and for numerals, so the "accent" theme puts gold on the figure
 * itself rather than behind it.
 */
export type ValueBoxTheme = "primary" | "accent" | "light" | "outline" | "deep";

const THEMES: Record<
  ValueBoxTheme,
  { shell: string; title: string; value: string; icon: string; footer: string }
> = {
  // Navy panel, white figure — the default surface.
  primary: {
    shell: "bg-navy",
    title: "text-gold",
    value: "text-white",
    icon: "text-white/35",
    footer: "text-white/70",
  },
  // Navy panel, gold figure — "key figures" get the accent, not the panel.
  accent: {
    shell: "bg-navy",
    title: "text-white/70",
    value: "text-gold",
    icon: "text-white/30",
    footer: "text-white/70",
  },
  // White panel on the fog background.
  light: {
    shell: "bg-white ring-1 ring-hairline",
    title: "text-slate-ink",
    value: "text-navy",
    icon: "text-navy/20",
    footer: "text-slate-ink",
  },
  // White panel with a gold section marker down the leading edge.
  outline: {
    shell: "bg-white ring-1 ring-hairline border-l-4 border-gold",
    title: "text-slate-ink",
    value: "text-navy",
    icon: "text-navy/20",
    footer: "text-slate-ink",
  },
  // Deeper navy for a third level of grouping.
  deep: {
    shell: "bg-navy-700",
    title: "text-white/70",
    value: "text-white",
    icon: "text-white/30",
    footer: "text-white/70",
  },
};

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
    <div className={`print-block flex flex-col justify-between rounded-lg px-4 py-3 ${t.shell}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[11px] font-medium uppercase tracking-[0.08em] ${t.title}`}>{title}</p>
          <div
            className={`mt-1.5 font-extrabold leading-none tabular-nums ${t.value} ${
              compact ? "text-[1.75rem]" : "text-[2rem]"
            }`}
          >
            {value}
          </div>
        </div>
        {showcase && <div className={`shrink-0 ${t.icon}`}>{showcase}</div>}
      </div>
      {footer && <div className={`mt-2 text-xs ${t.footer}`}>{footer}</div>}
    </div>
  );
}

/**
 * The "N vs prior" line under the executive KPIs. Direction is a status
 * marker, so it carries a colour; gold marks a rise, slate a fall, keeping the
 * palette to the brand set.
 */
export function Delta({ diff, suffix = "vs prior", small }: { diff: number; suffix?: string; small?: boolean }) {
  const up = diff >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold ${up ? "text-gold" : "text-white/60"} ${
        small ? "text-xs" : "text-sm"
      }`}
    >
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      {Math.abs(diff).toLocaleString("en-US")} {suffix}
    </span>
  );
}

export function DeltaPct({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[2rem] font-extrabold tabular-nums ${
        up ? "text-gold" : "text-white"
      }`}
    >
      <span aria-hidden className="text-lg">
        {up ? "▲" : "▼"}
      </span>
      {Math.abs(value)}%
    </span>
  );
}

/** A small stat tile, used by the capacity / summary panels. */
export function StatTile({
  value,
  label,
  sub,
  accent,
}: {
  value: ReactNode;
  label: string;
  sub?: string;
  /** Marks the one figure worth pulling out of the group. */
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg bg-fog p-3 text-center ring-1 ring-hairline ${
        accent ? "border-b-2 border-gold" : ""
      }`}
    >
      <div className={`text-2xl font-extrabold tabular-nums ${accent ? "text-gold" : "text-navy"}`}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-slate-ink">{label}</div>
      {sub && <div className="text-[11px] text-slate-ink/70">{sub}</div>}
    </div>
  );
}
