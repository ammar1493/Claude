"use client";

import { useMemo } from "react";
import { fmtMonthYearFull } from "@/lib/dates";
import type { ClassSession, PlanWindow } from "@/lib/bookings/schedule";
import type { Booking, Conflict, Instructor } from "@/lib/bookings/types";
import { Card, SectionTitle } from "../Card";
import { Icon } from "../Icons";
import { Empty } from "./chrome";

/**
 * What would go wrong if the month ran as written.
 *
 * Split by what it asks of you rather than by what it is called: the errors
 * are the ones where the month cannot run — a class with nobody on it, a
 * trainer in two rooms at once, a trainer on leave — and everything below them
 * is a thing to check with someone before the day arrives.
 */

const TITLE: Record<Conflict["severity"], string> = {
  error: "Has to be fixed",
  warning: "Worth checking",
};

function Tile({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="surface-card rounded-xl bg-white px-4 py-3">
      <p className="text-xs font-medium text-slate-ink">{label}</p>
      <p className="text-2xl font-bold text-navy">{value}</p>
      {note && <p className="text-[11px] text-slate-ink">{note}</p>}
    </div>
  );
}

export function ConflictsPanel({
  conflicts,
  bookings,
  instructors,
  classes,
  window: planWindow,
  month,
}: {
  conflicts: Conflict[];
  bookings: Booking[];
  instructors: Instructor[];
  classes: ClassSession[];
  window: PlanWindow;
  month: Date;
}) {
  const refs = useMemo(() => new Map(bookings.map((b) => [b.id, b.ref])), [bookings]);

  const stats = useMemo(() => {
    const scope = classes.filter(
      (c) => c.active && c.startDate <= planWindow.to && c.endDate >= planWindow.from,
    );
    const assigned = scope.filter((c) => c.instructorId).length;
    const teachingDays = scope.reduce(
      (n, c) => n + c.days.filter((d) => d >= planWindow.from && d <= planWindow.to).length,
      0,
    );
    return {
      classes: scope.length,
      assigned,
      open: scope.length - assigned,
      trainees: scope.reduce((n, c) => n + c.seats, 0),
      teachingDays,
      perInstructor: instructors.filter((i) => i.active).length
        ? (teachingDays / instructors.filter((i) => i.active).length).toFixed(1)
        : "—",
    };
  }, [classes, planWindow, instructors]);

  const grouped = useMemo(() => {
    const out: Record<Conflict["severity"], Conflict[]> = { error: [], warning: [] };
    for (const c of conflicts) out[c.severity].push(c);
    return out;
  }, [conflicts]);

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle>Plan check — {fmtMonthYearFull(month)}</SectionTitle>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Tile label="Classes" value={stats.classes} />
        <Tile label="With an instructor" value={stats.assigned} />
        <Tile
          label="Still open"
          value={stats.open}
          note={stats.open ? "nobody assigned" : "all covered"}
        />
        <Tile label="Trainees" value={stats.trainees.toLocaleString("en-US")} />
        <Tile label="Teaching days" value={stats.teachingDays} />
        <Tile label="Days per instructor" value={stats.perInstructor} note="active roster" />
      </div>

      {(["error", "warning"] as const).map((severity) => (
        <Card
          key={severity}
          title={`${TITLE[severity]} — ${grouped[severity].length}`}
          tone={severity === "error" ? "marked" : "plain"}
          expandable={false}
        >
          {!grouped[severity].length ? (
            <Empty>
              {severity === "error"
                ? "Nothing in this month blocks the plan."
                : "Nothing to check."}
            </Empty>
          ) : (
            <ul className="flex flex-col divide-y divide-hairline">
              {grouped[severity].map((c, index) => (
                <li key={`${c.code}-${c.date}-${index}`} className="flex gap-3 py-2.5">
                  <span
                    className={`mt-0.5 shrink-0 ${severity === "error" ? "text-navy" : "text-slate-ink"}`}
                  >
                    <Icon name={severity === "error" ? "warning" : "info"} size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-navy">
                      {c.title}
                      <span className="ms-2 font-medium text-slate-ink">{c.date}</span>
                    </p>
                    <p className="text-xs leading-relaxed text-slate-ink">{c.detail}</p>
                    <p className="mt-0.5 text-[11px] text-slate-ink">
                      {[...new Set(c.bookingIds.map((id) => refs.get(id)).filter(Boolean))]
                        .slice(0, 8)
                        .join(" · ")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}
