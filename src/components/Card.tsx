"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Icon } from "./Icons";

/**
 * Cards report whether they are expanded so a chart inside can fill the
 * viewport instead of its fixed inline height.
 */
export const CardExpandedContext = createContext(false);
export const useCardExpanded = () => useContext(CardExpandedContext);

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
  expandable = true,
}: {
  title?: ReactNode;
  tone?: Tone;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Full-screen toggle, the equivalent of bslib's `full_screen = TRUE`. */
  expandable?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const navy = tone === "navy";
  const canExpand = expandable && title !== undefined;

  // Escape closes, and the page behind should not scroll while covered.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [expanded]);

  const card = (
    <section
      className={
        expanded
          ? "fixed inset-3 z-50 flex flex-col overflow-hidden rounded-lg bg-white shadow-2xl ring-1 ring-hairline sm:inset-6"
          : `print-block flex flex-col overflow-hidden rounded-lg bg-white ring-1 ring-hairline ${className ?? ""}`
      }
    >
      {title !== undefined && (
        <header
          className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm font-bold ${
            navy ? "bg-navy text-white" : "border-b border-hairline text-navy"
          } ${tone === "marked" && !expanded ? "border-l-4 border-l-gold" : ""}`}
        >
          <span>{title}</span>
          <span className="flex items-center gap-2">
            {action}
            {canExpand && (
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                aria-label={expanded ? "Exit full screen" : "Expand to full screen"}
                title={expanded ? "Exit full screen (Esc)" : "Expand to full screen"}
                className={`no-print rounded p-1 transition ${
                  navy ? "text-white/70 hover:bg-white/15 hover:text-white" : "text-slate-ink hover:bg-navy-050 hover:text-navy"
                }`}
              >
                <Icon name={expanded ? "collapse" : "expand"} size={16} />
              </button>
            )}
          </span>
        </header>
      )}
      <div
        className={
          expanded
            ? "flex min-h-0 flex-1 flex-col overflow-auto p-4"
            : `flex-1 p-4 ${bodyClassName ?? ""}`
        }
      >
        <CardExpandedContext.Provider value={expanded}>{children}</CardExpandedContext.Provider>
      </div>
    </section>
  );

  if (!expanded) return card;

  return (
    <>
      {/* Keeps the grid from collapsing while the card is lifted out of flow. */}
      <div className={className} aria-hidden />
      <div
        className="fixed inset-0 z-40 bg-navy/40"
        onClick={() => setExpanded(false)}
        aria-hidden
      />
      {card}
    </>
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
