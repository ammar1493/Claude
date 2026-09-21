"use client";

import { useMemo, useState } from "react";
import { datesBetween, type ClassSession, type PlanWindow } from "@/lib/bookings/schedule";
import { newId } from "@/lib/bookings/store";
import {
  LANGUAGE_LABEL,
  LEAVE_LABEL,
  type CourseRef,
  type Instructor,
  type Language,
  type Leave,
  type LeaveKind,
} from "@/lib/bookings/types";
import { Card, SectionTitle } from "../Card";
import { Icon } from "../Icons";
import { Button, Empty, Labelled, controlClass, isWeekend } from "./chrome";

/**
 * Who can teach, and when they are away.
 *
 * Neither fact is in the booking sheet — both live in people's heads and in a
 * separate leave file — so they are entered once here and reused every month,
 * the same way the verifier keeps site distances. Leave is entered against the
 * plan rather than beside it: booking a holiday over a class you are teaching
 * says so immediately, which is the whole reason a vacation gets moved at the
 * last minute today.
 */

const LANGUAGES = Object.keys(LANGUAGE_LABEL) as Language[];

export function InstructorsPanel({
  instructors,
  leaves,
  classes,
  courses,
  window: planWindow,
  onInstructors,
  onLeaves,
  onNotice,
}: {
  instructors: Instructor[];
  leaves: Leave[];
  classes: ClassSession[];
  courses: CourseRef[];
  window: PlanWindow;
  onInstructors: (next: Instructor[]) => void;
  onLeaves: (next: Leave[]) => void;
  onNotice: (message: string) => void;
}) {
  const [bulk, setBulk] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [leaveDraft, setLeaveDraft] = useState<Omit<Leave, "id">>(() => ({
    instructorId: "",
    from: planWindow.from,
    to: planWindow.from,
    kind: "vacation",
    note: "",
  }));

  const days = useMemo(() => datesBetween(planWindow.from, planWindow.to), [planWindow]);

  /** Day by day, what each instructor is doing in the planning month. */
  const grid = useMemo(() => {
    const out = new Map<string, Map<string, { kind: "class" | "leave"; label: string }>>();
    for (const i of instructors) out.set(i.id, new Map());
    for (const cls of classes) {
      if (!cls.instructorId || !cls.active) continue;
      const row = out.get(cls.instructorId);
      if (!row) continue;
      for (const d of cls.days) {
        if (d < planWindow.from || d > planWindow.to) continue;
        row.set(d, { kind: "class", label: `${cls.courseName} · ${cls.venue}` });
      }
    }
    for (const l of leaves) {
      const row = out.get(l.instructorId);
      if (!row) continue;
      for (const d of datesBetween(l.from, l.to)) {
        if (d < planWindow.from || d > planWindow.to) continue;
        // Leave sits on top: a class still showing under it is exactly the
        // clash the plan check reports.
        const clash = row.get(d)?.kind === "class";
        row.set(d, {
          kind: "leave",
          label: `${LEAVE_LABEL[l.kind]}${clash ? " — clashes with a class" : ""}`,
        });
      }
    }
    return out;
  }, [instructors, classes, leaves, planWindow]);

  const load = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [id, row] of grid) {
      counts.set(id, [...row.values()].filter((v) => v.kind === "class").length);
    }
    return counts;
  }, [grid]);

  const update = (id: string, patch: Partial<Instructor>) =>
    onInstructors(instructors.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const addNames = () => {
    const wanted = bulk
      .split("\n")
      .map((n) => n.trim())
      .filter(Boolean);
    if (!wanted.length) return;
    const known = new Set(instructors.map((i) => i.name.toUpperCase()));
    const added = wanted
      .filter((n) => !known.has(n.toUpperCase()))
      .map<Instructor>((name) => ({
        id: newId("in"),
        name,
        employeeNo: "",
        courses: [],
        languages: [],
        active: true,
      }));
    onInstructors([...instructors, ...added]);
    setBulk("");
    onNotice(
      added.length
        ? `Added ${added.length} instructor(s). They are approved for everything until you narrow it.`
        : "Those names are already on the roster.",
    );
  };

  const addLeave = () => {
    if (!leaveDraft.instructorId) return onNotice("Pick whose leave this is.");
    if (leaveDraft.to < leaveDraft.from) return onNotice("The leave ends before it starts.");
    const clash = classes.filter(
      (c) =>
        c.active &&
        c.instructorId === leaveDraft.instructorId &&
        c.days.some((d) => d >= leaveDraft.from && d <= leaveDraft.to),
    );
    onLeaves([...leaves, { ...leaveDraft, id: newId("lv") }]);
    onNotice(
      clash.length
        ? `Leave saved — but it covers ${clash.length} class(es) already assigned. See Plan check.`
        : "Leave saved.",
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle>Instructors</SectionTitle>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card
          title={`Roster — ${instructors.filter((i) => i.active).length} active`}
          expandable={false}
        >
          {!instructors.length ? (
            <Empty>Nobody on the roster yet. Paste the trainers' names on the right.</Empty>
          ) : (
            <ul className="flex flex-col divide-y divide-hairline">
              {instructors.map((i) => (
                <li key={i.id} className="py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setExpanded(expanded === i.id ? null : i.id)}
                      className="flex items-center gap-1.5 text-sm font-bold text-navy"
                    >
                      <Icon name={expanded === i.id ? "collapse" : "expand"} size={13} />
                      {i.name}
                    </button>
                    <span className="text-xs text-slate-ink">
                      {i.courses.length ? `${i.courses.length} course(s)` : "any course"} ·{" "}
                      {i.languages.length
                        ? i.languages.map((l) => LANGUAGE_LABEL[l]).join(", ")
                        : "any language"}
                    </span>
                    <span className="ms-auto flex items-center gap-2">
                      <span className="rounded-full bg-navy-050 px-2 py-0.5 text-[11px] font-bold text-navy">
                        {load.get(i.id) ?? 0} day(s) this month
                      </span>
                      <label className="flex items-center gap-1 text-xs text-slate-ink">
                        <input
                          type="checkbox"
                          checked={i.active}
                          onChange={(e) => update(i.id, { active: e.target.checked })}
                        />
                        active
                      </label>
                    </span>
                  </div>

                  {expanded === i.id && (
                    <div className="mt-2 grid gap-3 rounded-xl bg-fog p-3 sm:grid-cols-2">
                      <Labelled label="Name">
                        <input
                          value={i.name}
                          onChange={(e) => update(i.id, { name: e.target.value })}
                          className={controlClass}
                        />
                      </Labelled>
                      <Labelled label="Employee number">
                        <input
                          value={i.employeeNo}
                          onChange={(e) => update(i.id, { employeeNo: e.target.value })}
                          className={controlClass}
                        />
                      </Labelled>
                      <div className="sm:col-span-2">
                        <span className="text-xs font-medium text-slate-ink">
                          Languages — none ticked means any
                        </span>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {LANGUAGES.map((l) => (
                            <label
                              key={l}
                              className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs text-navy ring-1 ring-hairline"
                            >
                              <input
                                type="checkbox"
                                checked={i.languages.includes(l)}
                                onChange={(e) =>
                                  update(i.id, {
                                    languages: e.target.checked
                                      ? [...i.languages, l]
                                      : i.languages.filter((x) => x !== l),
                                  })
                                }
                              />
                              {LANGUAGE_LABEL[l]}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <Labelled label="Approved courses — one per line, empty means any">
                          <textarea
                            rows={4}
                            value={i.courses.join("\n")}
                            onChange={(e) =>
                              update(i.id, {
                                courses: e.target.value
                                  .split("\n")
                                  .map((c) => c.trim())
                                  .filter(Boolean),
                              })
                            }
                            className={`${controlClass} font-mono text-xs`}
                          />
                        </Labelled>
                        {/* Typed names have to match the register's spelling to
                            count, so the catalogue is offered rather than left
                            to memory. */}
                        <select
                          value=""
                          onChange={(e) => {
                            if (!e.target.value || i.courses.includes(e.target.value)) return;
                            update(i.id, { courses: [...i.courses, e.target.value] });
                          }}
                          className={`${controlClass} mt-1 w-full`}
                        >
                          <option value="">Add one from the course list…</option>
                          {courses.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <Button
                          tone="quiet"
                          onClick={() => {
                            onInstructors(instructors.filter((x) => x.id !== i.id));
                            onLeaves(leaves.filter((l) => l.instructorId !== i.id));
                            setExpanded(null);
                            onNotice(
                              `${i.name} removed. Classes they held now read as unassigned.`,
                            );
                          }}
                        >
                          Remove from roster
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Add instructors" expandable={false}>
          <p className="mb-2 text-xs leading-relaxed text-slate-ink">
            One name per line. A new instructor is approved for every course and language until you
            narrow it — so a schedule can be built on day one and tightened later.
          </p>
          <textarea
            rows={8}
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            placeholder={"Ahmed Abubakr\nAsif Farid\nMohammed Mansour"}
            className={`${controlClass} w-full font-mono text-xs`}
          />
          <div className="mt-2">
            <Button tone="primary" onClick={addNames}>
              <Icon name="plus" size={14} /> Add to roster
            </Button>
          </div>
        </Card>
      </div>

      <SectionTitle>Leave &amp; availability</SectionTitle>

      <Card title={`Who is where — ${planWindow.from} to ${planWindow.to}`} expandable={false}>
        {!instructors.length ? (
          <Empty>Add the roster first and the month fills in here.</Empty>
        ) : (
          <div className="neft-scroll overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky start-0 z-10 bg-white px-2 py-1 text-start font-bold text-navy">
                    Instructor
                  </th>
                  {days.map((d) => (
                    <th
                      key={d}
                      className={`px-0 py-1 text-center font-medium ${isWeekend(d) ? "text-slate-ink" : "text-navy"}`}
                    >
                      {Number(d.slice(8))}
                    </th>
                  ))}
                  <th className="px-2 py-1 text-end font-bold text-navy">Days</th>
                </tr>
              </thead>
              <tbody>
                {instructors.map((i) => (
                  <tr key={i.id}>
                    <td className="sticky start-0 z-10 whitespace-nowrap bg-white px-2 py-1 font-medium text-navy">
                      {i.name}
                    </td>
                    {days.map((d) => {
                      const cell = grid.get(i.id)?.get(d);
                      const tone = cell
                        ? cell.kind === "leave"
                          ? "bg-gold"
                          : "bg-navy"
                        : isWeekend(d)
                          ? "bg-navy-050"
                          : "bg-fog";
                      return (
                        <td key={d} className="px-px py-1">
                          <span
                            title={`${d}${cell ? ` — ${cell.label}` : ""}`}
                            className={`block h-4 w-4 rounded-[3px] ${tone}`}
                          />
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-end font-bold text-navy">
                      {load.get(i.id) ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-ink">
              <span className="flex items-center gap-1">
                <span className="h-3 w-3 rounded-[3px] bg-navy" /> teaching
              </span>
              <span className="flex items-center gap-1">
                <span className="h-3 w-3 rounded-[3px] bg-gold" /> on leave
              </span>
              <span className="flex items-center gap-1">
                <span className="h-3 w-3 rounded-[3px] bg-navy-050" /> weekend
              </span>
              <span>Hover a square for what it is.</span>
            </p>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card title="Book leave" expandable={false}>
          <div className="flex flex-col gap-3">
            <Labelled label="Instructor">
              <select
                value={leaveDraft.instructorId}
                onChange={(e) => setLeaveDraft({ ...leaveDraft, instructorId: e.target.value })}
                className={controlClass}
              >
                <option value="">— pick —</option>
                {instructors.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </Labelled>
            <Labelled label="Type">
              <select
                value={leaveDraft.kind}
                onChange={(e) =>
                  setLeaveDraft({ ...leaveDraft, kind: e.target.value as LeaveKind })
                }
                className={controlClass}
              >
                {(Object.keys(LEAVE_LABEL) as LeaveKind[]).map((k) => (
                  <option key={k} value={k}>
                    {LEAVE_LABEL[k]}
                  </option>
                ))}
              </select>
            </Labelled>
            <div className="grid grid-cols-2 gap-2">
              <Labelled label="From">
                <input
                  type="date"
                  value={leaveDraft.from}
                  onChange={(e) =>
                    setLeaveDraft({
                      ...leaveDraft,
                      from: e.target.value,
                      to: leaveDraft.to < e.target.value ? e.target.value : leaveDraft.to,
                    })
                  }
                  className={controlClass}
                />
              </Labelled>
              <Labelled label="To">
                <input
                  type="date"
                  value={leaveDraft.to}
                  min={leaveDraft.from}
                  onChange={(e) => setLeaveDraft({ ...leaveDraft, to: e.target.value })}
                  className={controlClass}
                />
              </Labelled>
            </div>
            <Labelled label="Note">
              <input
                value={leaveDraft.note}
                onChange={(e) => setLeaveDraft({ ...leaveDraft, note: e.target.value })}
                className={controlClass}
              />
            </Labelled>
            <Button tone="primary" onClick={addLeave}>
              <Icon name="plus" size={14} /> Book it
            </Button>
          </div>
        </Card>

        <Card title={`Leave on record — ${leaves.length}`} expandable={false}>
          {!leaves.length ? (
            <Empty>No leave booked.</Empty>
          ) : (
            <ul className="flex flex-col divide-y divide-hairline text-sm">
              {[...leaves]
                .sort((a, b) => a.from.localeCompare(b.from))
                .map((l) => {
                  const who = instructors.find((i) => i.id === l.instructorId);
                  const clash = classes.some(
                    (c) =>
                      c.active &&
                      c.instructorId === l.instructorId &&
                      c.days.some((d) => d >= l.from && d <= l.to),
                  );
                  return (
                    <li key={l.id} className="flex flex-wrap items-center gap-2 py-2">
                      <strong className="text-navy">{who?.name ?? "(removed)"}</strong>
                      <span className="text-slate-ink">
                        {LEAVE_LABEL[l.kind]} · {l.from} to {l.to} ·{" "}
                        {datesBetween(l.from, l.to).length} day(s)
                        {l.note ? ` · ${l.note}` : ""}
                      </span>
                      {clash && (
                        <span className="rounded-full bg-gold-050 px-2 py-0.5 text-[11px] font-bold text-navy ring-1 ring-gold/40">
                          clashes with a class
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => onLeaves(leaves.filter((x) => x.id !== l.id))}
                        aria-label="Remove this leave"
                        className="ms-auto rounded-md p-1 text-slate-ink transition-colors hover:bg-navy-050 hover:text-navy"
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
