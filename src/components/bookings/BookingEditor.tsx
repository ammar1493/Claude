"use client";

import { useState } from "react";
import { addDays, fromISODate, toISODate } from "@/lib/dates";
import { knownLength } from "@/lib/bookings/courses";
import { fmtClock, parseClock } from "@/lib/bookings/parse";
import { datesBetween } from "@/lib/bookings/schedule";
import { newId } from "@/lib/bookings/store";
import {
  BOOKING_STATUS_LABEL,
  LANGUAGE_LABEL,
  MODE_LABEL,
  PO_STATUS_LABEL,
  type Booking,
  type BookingStatus,
  type CourseRef,
  type DeliveryMode,
  type Instructor,
  type Language,
  type Participant,
  type PoStatus,
} from "@/lib/bookings/types";
import { Card } from "../Card";
import { Button, Labelled, controlClass } from "./chrome";

/**
 * Typing a booking in, which is the point of the whole thing: after the first
 * import the office adds the next one here rather than in the sheet.
 *
 * Participants are a plain list, one per line, because that is how they arrive
 * — pasted out of an email. A name in brackets is left exactly as written; the
 * sheet is full of "Ahmed AlBajhan(80071163)" and the number in it is the
 * customer's own reference, not something to parse away.
 */

const blank = (courses: CourseRef[], ref: string): Booking => {
  const today = toISODate(new Date());
  return {
    id: newId("bk"),
    ref,
    courseName: courses[0]?.name ?? "",
    courseCode: courses[0]?.code ?? "",
    startDate: today,
    endDate: today,
    startMin: 8 * 60 + 30,
    endMin: 12 * 60 + 30,
    hours: 4,
    venue: "NEFT",
    room: "",
    mode: "classroom",
    language: "english",
    company: "",
    requestor: "",
    requestDate: today,
    poNumber: "",
    poStatus: "not-received",
    status: "tentative",
    instructorId: null,
    participants: [],
    notes: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
};

const nameLines = (participants: Participant[]) => participants.map((p) => p.name).join("\n");

export function BookingEditor({
  booking,
  courses,
  instructors,
  nextRef,
  onSave,
  onCancel,
  onDelete,
}: {
  booking?: Booking;
  courses: CourseRef[];
  instructors: Instructor[];
  /** The next NB- number, so a booking typed in continues the sheet's own run. */
  nextRef: string;
  onSave: (booking: Booking) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Booking>(() => booking ?? blank(courses, nextRef));
  const [names, setNames] = useState(() => nameLines(draft.participants));
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Booking>) => setDraft((d) => ({ ...d, ...patch }));
  const accredited = knownLength(draft.courseName);
  const spanDays = datesBetween(draft.startDate, draft.endDate).length;

  const save = () => {
    if (!draft.courseName.trim()) return setError("A booking needs a course.");
    if (!draft.company.trim()) return setError("A booking needs a company.");
    if (draft.endDate < draft.startDate) return setError("The end date is before the start date.");
    if (draft.endMin <= draft.startMin)
      return setError("The finish time is before the start time.");
    const typed = names
      .split("\n")
      .map((n) => n.trim())
      .filter(Boolean);
    // Whatever was already known about a trainee survives an edit to the list;
    // a name typed in fresh carries only itself.
    const existing = new Map(draft.participants.map((p) => [p.name, p]));
    const participants = typed.map(
      (name) =>
        existing.get(name) ?? {
          name,
          position: "",
          idNo: "",
          gin: "",
          email: "",
          mobile: "",
          rig: "",
        },
    );
    onSave({ ...draft, participants, updatedAt: Date.now() });
  };

  const time = (min: number, onChange: (v: number) => void, label: string) => (
    <Labelled label={label}>
      <input
        type="time"
        value={`${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`}
        onChange={(e) => {
          const parsed = parseClock(e.target.value);
          if (parsed !== null) onChange(parsed);
        }}
        className={controlClass}
      />
    </Labelled>
  );

  return (
    <Card title={booking ? `Edit ${booking.ref}` : "New booking"} tone="marked" expandable={false}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Labelled label="Course">
            <input
              list="neft-course-list"
              value={draft.courseName}
              onChange={(e) => {
                const name = e.target.value;
                const match = courses.find((c) => c.name.toUpperCase() === name.toUpperCase());
                /* A course accredited at a fixed length carries its own last
                   day, so picking WellSharp Driller sets five days without
                   anyone counting them out. */
                const accredited = knownLength(name);
                set({
                  courseName: name,
                  courseCode: match?.code ?? draft.courseCode,
                  endDate: accredited
                    ? toISODate(addDays(fromISODate(draft.startDate), accredited.days - 1))
                    : draft.endDate,
                });
              }}
              className={controlClass}
            />
          </Labelled>
          <datalist id="neft-course-list">
            {courses.map((c) => (
              <option key={c.name} value={c.name}>
                {c.code}
              </option>
            ))}
          </datalist>
        </div>
        <Labelled label="Course code">
          <input
            value={draft.courseCode}
            onChange={(e) => set({ courseCode: e.target.value.toUpperCase() })}
            className={controlClass}
          />
        </Labelled>
        <Labelled label="Contact hours per day">
          <input
            type="number"
            min={0}
            step={0.5}
            value={draft.hours}
            onChange={(e) => set({ hours: Number(e.target.value) })}
            className={controlClass}
          />
        </Labelled>

        <Labelled label="First day">
          <input
            type="date"
            value={draft.startDate}
            onChange={(e) =>
              set({
                startDate: e.target.value,
                endDate: draft.endDate < e.target.value ? e.target.value : draft.endDate,
              })
            }
            className={controlClass}
          />
        </Labelled>
        <Labelled
          label={accredited ? `Last day — accredited at ${accredited.days} day(s)` : "Last day"}
        >
          <input
            type="date"
            value={draft.endDate}
            min={draft.startDate}
            onChange={(e) => set({ endDate: e.target.value })}
            className={`${controlClass} ${
              accredited && spanDays !== accredited.days ? "border-gold" : ""
            }`}
          />
        </Labelled>
        {time(draft.startMin, (startMin) => set({ startMin }), "Starts")}
        {time(draft.endMin, (endMin) => set({ endMin }), "Finishes")}

        <Labelled label="Company">
          <input
            value={draft.company}
            onChange={(e) => set({ company: e.target.value })}
            className={controlClass}
          />
        </Labelled>
        <Labelled label="Requestor">
          <input
            value={draft.requestor}
            onChange={(e) => set({ requestor: e.target.value })}
            className={controlClass}
          />
        </Labelled>
        <Labelled label="Venue">
          <input
            value={draft.venue}
            onChange={(e) => set({ venue: e.target.value.toUpperCase() })}
            className={controlClass}
          />
        </Labelled>
        <Labelled label="Classroom">
          <input
            value={draft.room}
            onChange={(e) => set({ room: e.target.value.toUpperCase() })}
            placeholder={draft.venue === "NEFT" ? "5, LAB…" : "off site"}
            className={controlClass}
          />
        </Labelled>
        <Labelled label="Delivery">
          <select
            value={draft.mode}
            onChange={(e) => set({ mode: e.target.value as DeliveryMode })}
            className={controlClass}
          >
            {(Object.keys(MODE_LABEL) as DeliveryMode[]).map((m) => (
              <option key={m} value={m}>
                {MODE_LABEL[m]}
              </option>
            ))}
          </select>
        </Labelled>

        <Labelled label="Language">
          <select
            value={draft.language}
            onChange={(e) => set({ language: e.target.value as Language })}
            className={controlClass}
          >
            {(Object.keys(LANGUAGE_LABEL) as Language[]).map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_LABEL[l]}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="Booking status">
          <select
            value={draft.status}
            onChange={(e) => set({ status: e.target.value as BookingStatus })}
            className={controlClass}
          >
            {(Object.keys(BOOKING_STATUS_LABEL) as BookingStatus[]).map((s) => (
              <option key={s} value={s}>
                {BOOKING_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="PO number">
          <input
            value={draft.poNumber}
            onChange={(e) => set({ poNumber: e.target.value })}
            className={controlClass}
          />
        </Labelled>
        <Labelled label="PO status">
          <select
            value={draft.poStatus}
            onChange={(e) => set({ poStatus: e.target.value as PoStatus })}
            className={controlClass}
          >
            {(Object.keys(PO_STATUS_LABEL) as PoStatus[]).map((s) => (
              <option key={s} value={s}>
                {PO_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Labelled>

        <Labelled label="Instructor">
          <select
            value={draft.instructorId ?? ""}
            onChange={(e) => set({ instructorId: e.target.value || null })}
            className={controlClass}
          >
            <option value="">— not assigned —</option>
            {instructors
              .filter((i) => i.active)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
          </select>
        </Labelled>
        <div className="sm:col-span-2 lg:col-span-3">
          <Labelled label="Note">
            <input
              value={draft.notes}
              onChange={(e) => set({ notes: e.target.value })}
              className={controlClass}
            />
          </Labelled>
        </div>

        <div className="sm:col-span-2 lg:col-span-4">
          <Labelled
            label={`Trainees — one name per line (${names.split("\n").filter((n) => n.trim()).length})`}
          >
            <textarea
              rows={4}
              value={names}
              onChange={(e) => setNames(e.target.value)}
              className={`${controlClass} font-mono text-xs`}
            />
          </Labelled>
        </div>
      </div>

      {error && <p className="mt-3 text-sm font-bold text-navy">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button tone="primary" onClick={save}>
          Save booking
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
        <span className="ms-auto text-xs text-slate-ink">
          {spanDays} day{spanDays === 1 ? "" : "s"} · {fmtClock(draft.startMin)} –{" "}
          {fmtClock(draft.endMin)}
          {accredited && spanDays !== accredited.days && (
            <strong className="ms-2 text-navy">
              {accredited.label} runs {accredited.days}
            </strong>
          )}
        </span>
        {booking && onDelete && (
          <Button tone="quiet" onClick={() => onDelete(booking.id)}>
            Delete this booking
          </Button>
        )}
      </div>
    </Card>
  );
}
