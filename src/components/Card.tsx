import type { ReactNode } from "react";

/**
 * Card tones. The guidelines keep gold, teal and green out of large flat
 * fills, so a card is either white or navy; emphasis comes from a gold marker
 * rule rather than a coloured header bar.
 */
type Tone = "plain" | "navy" | "marked";

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
  const navy = tone === "navy";
  return (
    <section
      className={`print-block flex flex-col overflow-hidden rounded-lg bg-white ring-1 ring-hairline ${className ?? ""}`}
    >
      {title !== undefined && (
        <header
          className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm font-bold ${
            navy ? "bg-navy text-white" : "border-b border-hairline text-navy"
          } ${tone === "marked" ? "border-l-4 border-l-gold" : ""}`}
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
  // Notes sit on white with a coloured marker rule, keeping tinted washes off
  // the fog background.
  const rules = {
    info: "border-l-navy",
    success: "border-l-teal",
    secondary: "border-l-slate-ink",
    warning: "border-l-gold",
  } as const;
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border-l-4 bg-white px-4 py-3 text-sm text-slate-ink ring-1 ring-hairline ${rules[tone]}`}
    >
      {icon && <span className="mt-0.5 shrink-0 text-navy">{icon}</span>}
      <div>{children}</div>
    </div>
  );
}

/**
 * Section heading. The eyebrow rule is the gold "section marker" the
 * guidelines call for.
 */
export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`flex items-center gap-2.5 text-lg font-bold text-navy ${className ?? ""}`}>
      <span aria-hidden className="h-4 w-1 rounded-full bg-gold" />
      {children}
    </h2>
  );
}
