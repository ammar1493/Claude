import type { ReactNode } from "react";

type Tone = "plain" | "navy" | "gold" | "dark" | "hse" | "danger";

const TONES: Record<Tone, string> = {
  plain: "bg-white text-navy border-b border-slate-200",
  navy: "bg-navy text-white",
  gold: "bg-gold text-navy",
  dark: "bg-slate-800 text-white",
  hse: "bg-hse text-white",
  danger: "bg-red-600 text-white",
};

export function Card({
  title,
  tone = "plain",
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  tone?: Tone;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`print-block flex flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200/70 ${className ?? ""}`}
    >
      {title !== undefined && (
        <header
          className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm font-bold ${TONES[tone]}`}
        >
          <span>{title}</span>
          {action}
        </header>
      )}
      <div className={`flex-1 p-4 ${bodyClassName ?? ""}`}>{children}</div>
    </section>
  );
}

export function Alert({
  tone,
  icon,
  children,
}: {
  tone: "info" | "success" | "secondary" | "warning";
  icon?: ReactNode;
  children: ReactNode;
}) {
  const tones = {
    info: "bg-sky-50 text-sky-900 ring-sky-200",
    success: "bg-emerald-50 text-emerald-900 ring-emerald-200",
    secondary: "bg-slate-100 text-slate-700 ring-slate-200",
    warning: "bg-amber-50 text-amber-900 ring-amber-200",
  } as const;
  return (
    <div className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm ring-1 ${tones[tone]}`}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div>{children}</div>
    </div>
  );
}

export function SectionTitle({
  children,
  tone = "navy",
  className,
}: {
  children: ReactNode;
  tone?: "navy" | "hse";
  className?: string;
}) {
  return (
    <h2
      className={`text-lg font-bold ${tone === "hse" ? "text-hse" : "text-navy"} ${className ?? ""}`}
    >
      {children}
    </h2>
  );
}
