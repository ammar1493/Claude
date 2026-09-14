import type { Severity } from "@/lib/incentives/types";

/**
 * Severity is the one place this module needs colour outside data
 * visualization, so it borrows the brand's own three: the danger red for a
 * claim that has to change, gold for something a verifier must decide, navy
 * for a note. Each is a marker rule and a light wash — never a flat fill —
 * which keeps the grid readable and matches how the dashboard treats alerts.
 */
export const SEVERITY = {
  error: {
    label: "Must change",
    plural: "must change",
    cell: "bg-[#FDECEA] text-[#8C1D18] ring-1 ring-inset ring-[#B3261E]",
    dot: "bg-[#B3261E]",
    rule: "border-l-[#B3261E]",
    chip: "bg-[#FDECEA] text-[#8C1D18]",
    row: "bg-[#FDECEA]",
  },
  warning: {
    label: "Check",
    plural: "to check",
    cell: "bg-gold-050 text-[#7A4F06] ring-1 ring-inset ring-gold",
    dot: "bg-gold",
    rule: "border-l-gold",
    chip: "bg-gold-050 text-[#7A4F06]",
    row: "bg-gold-050",
  },
  info: {
    label: "Note",
    plural: "notes",
    cell: "bg-navy-050 text-navy ring-1 ring-inset ring-navy/25",
    dot: "bg-slate-ink",
    rule: "border-l-slate-ink",
    chip: "bg-navy-050 text-navy",
    row: "bg-navy-050",
  },
} as const satisfies Record<Severity, Record<string, string>>;

export const SEVERITY_ORDER: Severity[] = ["error", "warning", "info"];

/** The loudest severity in a set, or null when the set is empty. */
export function worstSeverity(severities: Severity[]): Severity | null {
  for (const s of SEVERITY_ORDER) if (severities.includes(s)) return s;
  return null;
}
