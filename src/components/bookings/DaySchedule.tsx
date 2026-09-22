"use client";

import { useMemo, useState } from "react";
import { addDays, floorWeek, fmtDayMonthYear, fromISODate, toISODate } from "@/lib/dates";
import { fmtClock } from "@/lib/bookings/parse";
import {
  autoAssign,
  classesOnDay,
  onLeave,
  qualifies,
  type ClassSession,
  type PlanWindow,
} from "@/lib/bookings/schedule";
import { LANGUAGE_LABEL, type Instructor, type Leave } from "@/lib/bookings/types";
import { downloadDailySheet } from "@/lib/bookings/export";
import { Card, SectionTitle } from "../Card";
import { Icon } from "../Icons";
import { Button, Empty, StatusChip, controlClass, isWeekend, weekdayName } from "./chrome";
import { DailySheet } from "./DailySheet";

/**
 * The day the training floor actually runs.
 *
 * A class, not a booking, is the row here — the companies sitting in it are a
 * line inside it — because that is what one instructor is committed to. The
 * week strip above says where the trouble is before you click into it: a day
 * carrying an unassigned class is marked, so the gaps are found from the month
 * view rather than on the morning.
 */

/** Why an instructor would be a bad pick for this class — "" when they fit. */
function availabilityNote({
  cls,
  instructor,
  leaves,
  sameDay,
}: {
  cls: ClassSession;
  instructor: Instructor;
  leaves: Leave[];
  sameDay: ClassSession[];
}): string {
  const leave = cls.days.map((d) => onLeave(leaves, instructor.id, d)).find(Boolean);
  if (leave) return "on leave";
  const clash = sameDay.find(
    (other) =>
      other.key !== cls.key &&
      other.instructorId === instructor.id &&
      other.startMin < cls.endMin &&
      cls.startMin < other.endMin,
  );
  if (clash) return "already teaching";
  if (!qualifies(instructor, cls)) return "not approved";
  return "";
}

export function DaySchedule({
  classes,
  instructors,
  leaves,
  window: planWindow,
  onAssign,
  onRoom,
  onApply,
  onNotice,
}: {
  classes: ClassSession[];
  instructors: Instructor[];
  leaves: Leave[];
  window: PlanWindow;
  onAssign: (bookingIds: string[], instructorId: string | null) => void;
  onRoom: (bookingIds: string[], room: string) => void;
  onApply: (assignments: Record<string, string>) => void;
  onNotice: (message: string) => void;
}) {
  // Opens on the planning month's first day, or on today when that month is
  // the one you are in — the office plans this month and works today.
  // The sheet view is what gets printed or mailed; the cards are for working.
  const [asSheet, setAsSheet] = useState(false);
  const [day, setDay] = useState(() => {
    const today = toISODate(new Date());
    return today >= planWindow.from && today <= planWindow.to ? today : planWindow.from;
  });

  const week = useMemo(() => {
    const start = floorWeek(fromISODate(day), 7);
    return Array.from({ length: 7 }, (_, i) => toISODate(addDays(start, i)));
  }, [day]);

  const dayCounts = useMemo(() => {
    const counts = new Map<string, { total: number; open: number }>();
    for (const iso of week) {
      const list = classesOnDay(classes, iso).filter((c) => c.active);
      counts.set(iso, { total: list.length, open: list.filter((c) => !c.instructorId).length });
    }
    return counts;
  }, [classes, week]);

  const today = classesOnDay(classes, day).filter((c) => c.active);
  const roster = instructors.filter((i) => i.active);

  const free = useMemo(
    () =>
      roster.filter(
        (i) => !onLeave(leaves, i.id, day) && !today.some((c) => c.instructorId === i.id),
      ),
    [roster, leaves, day, today],
  );
  const away = useMemo(
    () => roster.map((i) => ({ i, leave: onLeave(leaves, i.id, day) })).filter((x) => x.leave),
    [roster, leaves, day],
  );

  const fill = (window: PlanWindow, label: string) => {
    if (!roster.length) {
      onNotice("Add the instructors first — Instructors & leave.");
      return;
    }
    const result = autoAssign(classes, instructors, leaves, window);
    if (!result.filled) {
      onNotice(
        result.unfilled.length
          ? `Nothing could be filled for ${label}: ${result.unfilled[0].reason}`
          : `Nothing to fill for ${label} — every class already has an instructor.`,
      );
      return;
    }
    onApply(result.assignments);
    const short = result.unfilled.length ? `, ${result.unfilled.length} left open` : "";
    onNotice(`Filled ${result.filled} booking(s) for ${label}${short}.`);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <SectionTitle className="me-auto">
          {weekdayName(day)} {fmtDayMonthYear(fromISODate(day))}
        </SectionTitle>
        <Button onClick={() => setDay(toISODate(addDays(fromISODate(day), -1)))} tone="plain">
          ‹ Day
        </Button>
        <Button onClick={() => setDay(toISODate(new Date()))} tone="plain">
          Today
        </Button>
        <Button onClick={() => setDay(toISODate(addDays(fromISODate(day), 1)))} tone="plain">
          Day ›
        </Button>
        <input
          type="date"
          value={day}
          onChange={(e) => e.target.value && setDay(e.target.value)}
          className={controlClass}
          aria-label="Go to date"
        />
        <Button onClick={() => fill({ from: day, to: day }, "this day")} tone="plain">
          <Icon name="people" size={14} /> Fill this day
        </Button>
        <Button onClick={() => fill(planWindow, "the month")} tone="primary">
          <Icon name="calendar-check" size={14} /> Fill the month
        </Button>
      </div>

      <div className="no-print flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-hairline bg-white p-0.5 text-xs font-bold">
          {[
            { id: false, label: "Working view" },
            { id: true, label: "Sheet to send" },
          ].map((v) => (
            <button
              key={String(v.id)}
              type="button"
              onClick={() => setAsSheet(v.id)}
              aria-pressed={asSheet === v.id}
              className={`rounded px-3 py-1.5 transition-colors duration-150 ${
                asSheet === v.id ? "bg-navy text-white" : "text-slate-ink hover:text-navy"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        {asSheet && (
          <>
            <Button onClick={() => window.print()} tone="plain">
              <Icon name="printer" size={14} /> Print / save as PDF
            </Button>
            <Button
              tone="primary"
              onClick={() => {
                void (async () => {
                  const { rows } = await downloadDailySheet(classes, instructors, day);
                  onNotice(
                    rows
                      ? `Daily schedule for ${day} exported — ${rows} class(es).`
                      : "Nothing is running on this day, so there is no sheet to send.",
                  );
                })();
              }}
            >
              <Icon name="download" size={14} /> Export the sheet
            </Button>
          </>
        )}
        {asSheet && (
          <span className="text-xs text-slate-ink">
            Nine columns, the office’s own layout. Blank lines separate each hour and kind of
            delivery.
          </span>
        )}
      </div>

      {asSheet ? (
        <Card title={`Daily schedule — ${weekdayName(day)} ${day}`} expandable={false}>
          <DailySheet classes={classes} instructors={instructors} day={day} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1.5">
            {week.map((iso) => {
              const c = dayCounts.get(iso) ?? { total: 0, open: 0 };
              const selected = iso === day;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setDay(iso)}
                  className={`surface-card flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-center transition-[background-color,color] duration-150 ${
                    selected
                      ? "bg-navy text-white"
                      : isWeekend(iso)
                        ? "bg-navy-050 text-slate-ink"
                        : "bg-white text-navy"
                  }`}
                >
                  <span className="text-[10px] font-medium uppercase tracking-wider opacity-70">
                    {weekdayName(iso).slice(0, 3)}
                  </span>
                  <span className="text-base font-bold">{Number(iso.slice(8))}</span>
                  <span className="text-[11px] opacity-80">
                    {c.total ? `${c.total} class${c.total === 1 ? "" : "es"}` : "—"}
                  </span>
                  {c.open > 0 && (
                    <span
                      className={`rounded-full px-1.5 text-[10px] font-bold ${
                        selected ? "bg-gold text-navy" : "bg-gold-050 text-navy ring-1 ring-gold/40"
                      }`}
                    >
                      {c.open} open
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <Card title={`Classes on ${day}${isWeekend(day) ? " (weekend)" : ""}`} expandable={false}>
            {!today.length ? (
              <Empty>Nothing scheduled for this day.</Empty>
            ) : (
              <div className="flex flex-col gap-2">
                {today.map((cls) => {
                  const dayIndex = cls.days.indexOf(day) + 1;
                  return (
                    <article
                      key={cls.key}
                      className={`rounded-xl border-l-4 bg-white px-3 py-2.5 ring-1 ring-hairline ${
                        cls.instructorId ? "border-l-teal" : "border-l-gold"
                      }`}
                    >
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="font-mono text-sm font-bold text-navy">
                          {fmtClock(cls.startMin)} – {fmtClock(cls.endMin)}
                        </span>
                        <span className="text-sm font-bold text-navy">{cls.courseName}</span>
                        {cls.courseCode && (
                          <span className="text-xs text-slate-ink">{cls.courseCode}</span>
                        )}
                        {cls.days.length > 1 && (
                          <span className="rounded-full bg-navy-050 px-2 py-0.5 text-[11px] font-bold text-navy">
                            Day {dayIndex} of {cls.days.length}
                          </span>
                        )}
                        <span className="ms-auto flex flex-wrap items-center gap-1.5">
                          {cls.bookings.map((b) => (
                            <StatusChip key={b.id} status={b.status} />
                          ))}
                        </span>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-ink">
                        <span className="flex items-center gap-1">
                          <Icon name="building" size={13} /> {cls.venue}
                        </span>
                        <span>{LANGUAGE_LABEL[cls.language]}</span>
                        <span className="flex items-center gap-1">
                          <Icon name="people" size={13} /> {cls.seats} trainee
                          {cls.seats === 1 ? "" : "s"}
                        </span>
                        <span className="min-w-0 truncate">
                          {[...new Set(cls.bookings.map((b) => b.company))].join(", ")}
                        </span>
                        <span className="text-[11px]">
                          {cls.bookings.map((b) => b.ref).join(" · ")}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-2 text-xs font-medium text-slate-ink">
                          Instructor
                          <select
                            value={cls.instructorId ?? ""}
                            onChange={(e) =>
                              onAssign(
                                cls.bookings.map((b) => b.id),
                                e.target.value || null,
                              )
                            }
                            className={`${controlClass} ${cls.instructorId ? "" : "border-gold"}`}
                          >
                            <option value="">— not assigned —</option>
                            {roster.map((i) => {
                              const note = availabilityNote({
                                cls,
                                instructor: i,
                                leaves,
                                sameDay: today,
                              });
                              return (
                                <option key={i.id} value={i.id}>
                                  {i.name}
                                  {note ? ` (${note})` : ""}
                                </option>
                              );
                            })}
                          </select>
                        </label>
                        <label className="flex items-center gap-2 text-xs font-medium text-slate-ink">
                          Classroom
                          <input
                            value={cls.room}
                            onChange={(e) =>
                              onRoom(
                                cls.bookings.map((b) => b.id),
                                e.target.value.toUpperCase(),
                              )
                            }
                            placeholder={cls.venue === "NEFT" ? "5, LAB…" : cls.venue}
                            className={`${controlClass} w-28`}
                          />
                        </label>
                        {!cls.instructorId && (
                          <span className="text-xs font-bold text-navy">
                            Nobody is teaching this yet.
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Free that day" expandable={false}>
              {!roster.length ? (
                <Empty>
                  No instructors on the roster yet — add them under Instructors &amp; leave.
                </Empty>
              ) : !free.length ? (
                <p className="text-sm text-slate-ink">Everyone is either teaching or away.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {free.map((i) => (
                    <li
                      key={i.id}
                      className="rounded-full bg-navy-050 px-2.5 py-1 text-xs font-medium text-navy"
                    >
                      {i.name}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Away that day" expandable={false}>
              {!away.length ? (
                <p className="text-sm text-slate-ink">Nobody is on leave.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm text-slate-ink">
                  {away.map(({ i, leave }) => (
                    <li key={i.id}>
                      <strong className="text-navy">{i.name}</strong> — {leave!.from} to {leave!.to}
                      {leave!.note ? ` · ${leave!.note}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
