"use client";

import { useMemo, useState } from "react";
import { toISODate } from "@/lib/dates";
import { fmtClock } from "@/lib/bookings/parse";
import type { PlanWindow } from "@/lib/bookings/schedule";
import {
  BOOKING_STATUS_LABEL,
  PO_STATUS_LABEL,
  type Booking,
  type BookingStatus,
  type CourseRef,
  type Instructor,
  type PoStatus,
} from "@/lib/bookings/types";
import { Card, SectionTitle } from "../Card";
import { DataTable, type Column } from "../DataTable";
import { Icon } from "../Icons";
import { BookingEditor } from "./BookingEditor";
import { Button, PoChip, StatusChip, controlClass } from "./chrome";

/**
 * The register.
 *
 * The two things that change most — has the customer confirmed, and is the PO
 * in — are edited in the row itself, because chasing them is a morning's work
 * and opening a form for each one is not. Everything else goes through the
 * editor.
 */

type Scope = "month" | "upcoming" | "all";

export function BookingsTable({
  bookings,
  instructors,
  courses,
  window: planWindow,
  onPatch,
  onAdd,
  onRemove,
  onNotice,
}: {
  bookings: Booking[];
  instructors: Instructor[];
  courses: CourseRef[];
  window: PlanWindow;
  onPatch: (id: string, patch: Partial<Booking>) => void;
  onAdd: (booking: Booking) => void;
  onRemove: (id: string) => void;
  onNotice: (message: string) => void;
}) {
  const [scope, setScope] = useState<Scope>("upcoming");
  const [status, setStatus] = useState<BookingStatus | "">("");
  const [po, setPo] = useState<PoStatus | "">("");
  const [editing, setEditing] = useState<Booking | null>(null);
  const [adding, setAdding] = useState(false);

  const names = useMemo(() => new Map(instructors.map((i) => [i.id, i.name])), [instructors]);

  /* A booking typed in continues the register's own numbering rather than
     starting a second scheme beside it. */
  const nextRef = useMemo(() => {
    const highest = bookings.reduce((max, b) => {
      const n = Number(/^NB-(\d+)$/.exec(b.ref)?.[1] ?? 0);
      return n > max ? n : max;
    }, 0);
    return `NB-${String(highest + 1).padStart(4, "0")}`;
  }, [bookings]);
  const today = toISODate(new Date());

  const rows = useMemo(() => {
    let out = bookings;
    if (scope === "month") {
      out = out.filter((b) => b.startDate <= planWindow.to && b.endDate >= planWindow.from);
    } else if (scope === "upcoming") {
      out = out.filter((b) => b.endDate >= today);
    }
    if (status) out = out.filter((b) => b.status === status);
    if (po) out = out.filter((b) => b.poStatus === po);
    return [...out].sort(
      (a, b) => a.startDate.localeCompare(b.startDate) || a.startMin - b.startMin,
    );
  }, [bookings, scope, status, po, planWindow, today]);

  const columns: Column<Booking>[] = [
    { key: "ref", header: "Ref", value: (b) => b.ref, width: "84px" },
    {
      key: "dates",
      header: "Dates",
      value: (b) => b.startDate,
      render: (b) => (
        <span className="whitespace-nowrap">
          {b.startDate === b.endDate ? b.startDate : `${b.startDate} → ${b.endDate}`}
          <span className="block text-[11px] text-slate-ink">
            {fmtClock(b.startMin)} – {fmtClock(b.endMin)}
          </span>
        </span>
      ),
    },
    {
      key: "course",
      header: "Course",
      value: (b) => b.courseName,
      render: (b) => (
        <span>
          <span className="font-medium text-navy">{b.courseName}</span>
          {b.courseCode && <span className="block text-[11px] text-slate-ink">{b.courseCode}</span>}
        </span>
      ),
    },
    {
      key: "company",
      header: "Company",
      value: (b) => b.company,
      render: (b) => (
        <span>
          {b.company}
          <span className="block text-[11px] text-slate-ink">
            {b.participants.length} trainee{b.participants.length === 1 ? "" : "s"}
          </span>
        </span>
      ),
    },
    { key: "venue", header: "Venue", value: (b) => b.venue },
    {
      key: "status",
      header: "Booking",
      value: (b) => BOOKING_STATUS_LABEL[b.status],
      render: (b) => (
        <select
          value={b.status}
          onChange={(e) => onPatch(b.id, { status: e.target.value as BookingStatus })}
          className="rounded-md border border-hairline bg-white px-1.5 py-1 text-xs text-navy outline-none focus:border-gold"
        >
          {(Object.keys(BOOKING_STATUS_LABEL) as BookingStatus[]).map((s) => (
            <option key={s} value={s}>
              {BOOKING_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "po",
      header: "PO",
      value: (b) => `${PO_STATUS_LABEL[b.poStatus]} ${b.poNumber}`,
      render: (b) => (
        <span className="flex flex-col gap-1">
          <select
            value={b.poStatus}
            onChange={(e) => onPatch(b.id, { poStatus: e.target.value as PoStatus })}
            className="rounded-md border border-hairline bg-white px-1.5 py-1 text-xs text-navy outline-none focus:border-gold"
          >
            {(Object.keys(PO_STATUS_LABEL) as PoStatus[]).map((s) => (
              <option key={s} value={s}>
                {PO_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          {b.poNumber && <span className="text-[11px] text-slate-ink">{b.poNumber}</span>}
        </span>
      ),
    },
    {
      key: "instructor",
      header: "Instructor",
      value: (b) => (b.instructorId ? (names.get(b.instructorId) ?? "") : ""),
      render: (b) => (
        <select
          value={b.instructorId ?? ""}
          onChange={(e) => onPatch(b.id, { instructorId: e.target.value || null })}
          className={`rounded-md border bg-white px-1.5 py-1 text-xs text-navy outline-none focus:border-gold ${
            b.instructorId || b.status === "cancelled" ? "border-hairline" : "border-gold"
          }`}
        >
          <option value="">—</option>
          {instructors
            .filter((i) => i.active || i.id === b.instructorId)
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
        </select>
      ),
    },
    {
      key: "edit",
      header: "",
      value: () => "",
      align: "center",
      render: (b) => (
        <button
          type="button"
          onClick={() => {
            setAdding(false);
            setEditing(b);
          }}
          aria-label={`Edit ${b.ref}`}
          className="rounded-md p-1 text-slate-ink transition-colors hover:bg-navy-050 hover:text-navy"
        >
          <Icon name="pencil" size={15} />
        </button>
      ),
    },
  ];

  const counts = useMemo(() => {
    const by = { tentative: 0, confirmed: 0, delivered: 0, cancelled: 0 } as Record<
      BookingStatus,
      number
    >;
    for (const b of rows) by[b.status]++;
    const noPo = rows.filter(
      (b) =>
        b.status !== "cancelled" &&
        (b.poStatus === "not-received" || b.poStatus === "under-process"),
    ).length;
    return { by, noPo };
  }, [rows]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <SectionTitle className="me-auto">Booking register</SectionTitle>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as Scope)}
          className={controlClass}
        >
          <option value="upcoming">Today onwards</option>
          <option value="month">Planning month</option>
          <option value="all">Everything</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as BookingStatus | "")}
          className={controlClass}
        >
          <option value="">Any booking status</option>
          {(Object.keys(BOOKING_STATUS_LABEL) as BookingStatus[]).map((s) => (
            <option key={s} value={s}>
              {BOOKING_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          value={po}
          onChange={(e) => setPo(e.target.value as PoStatus | "")}
          className={controlClass}
        >
          <option value="">Any PO status</option>
          {(Object.keys(PO_STATUS_LABEL) as PoStatus[]).map((s) => (
            <option key={s} value={s}>
              {PO_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <Button
          tone="primary"
          onClick={() => {
            setEditing(null);
            setAdding(true);
          }}
        >
          <Icon name="plus" size={14} /> New booking
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {(Object.keys(BOOKING_STATUS_LABEL) as BookingStatus[]).map((s) =>
          counts.by[s] ? (
            <span
              key={s}
              className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 ring-1 ring-hairline"
            >
              <StatusChip status={s} />
              <strong className="text-navy">{counts.by[s]}</strong>
            </span>
          ) : null,
        )}
        {counts.noPo > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 ring-1 ring-hairline">
            <PoChip status="not-received" />
            <strong className="text-navy">{counts.noPo}</strong> waiting
          </span>
        )}
      </div>

      {(adding || editing) && (
        <BookingEditor
          key={editing?.id ?? "new"}
          booking={editing ?? undefined}
          courses={courses}
          instructors={instructors}
          nextRef={nextRef}
          onSave={(booking) => {
            if (editing) onPatch(booking.id, booking);
            else onAdd(booking);
            onNotice(editing ? `${booking.ref} updated.` : `${booking.ref} added to the register.`);
            setEditing(null);
            setAdding(false);
          }}
          onCancel={() => {
            setEditing(null);
            setAdding(false);
          }}
          onDelete={(id) => {
            onRemove(id);
            onNotice("Booking removed from the register.");
            setEditing(null);
          }}
        />
      )}

      <Card title={`${rows.length.toLocaleString("en-US")} booking(s)`} expandable={false} inset>
        <DataTable
          rows={rows}
          columns={columns}
          pageLength={25}
          dense
          emptyMessage="Nothing matches these filters."
        />
      </Card>
    </div>
  );
}
