"use client";

import type { ReactNode } from "react";
import { fromISODate } from "@/lib/dates";
import {
  BOOKING_STATUS_LABEL,
  PO_STATUS_LABEL,
  type BookingStatus,
  type PoStatus,
} from "@/lib/bookings/types";

/**
 * The small pieces the booking views share.
 *
 * Status is the thing the office reads first, so it is a chip rather than a
 * word in a column — and it is coloured by what it asks of you, not by how it
 * sounds: anything waiting on someone carries the gold marker the brand
 * reserves for a call to action, anything settled is quiet.
 */

const STATUS_TONE: Record<BookingStatus, string> = {
  tentative: "bg-gold-050 text-navy ring-1 ring-gold/40",
  confirmed: "bg-navy text-white",
  delivered: "bg-navy-050 text-navy",
  cancelled: "bg-white text-slate-ink ring-1 ring-hairline line-through",
};

const PO_TONE: Record<PoStatus, string> = {
  "not-required": "bg-navy-050 text-slate-ink",
  "not-received": "bg-gold-050 text-navy ring-1 ring-gold/40",
  "under-process": "bg-gold-050 text-navy ring-1 ring-gold/40",
  received: "bg-navy-050 text-navy",
};

export function StatusChip({ status }: { status: BookingStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[status]}`}
    >
      {BOOKING_STATUS_LABEL[status]}
    </span>
  );
}

export function PoChip({ status }: { status: PoStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${PO_TONE[status]}`}
    >
      {PO_STATUS_LABEL[status]}
    </span>
  );
}

export const controlClass =
  "rounded-md border border-hairline bg-white px-2.5 py-1.5 text-sm text-navy outline-none transition-[border-color,box-shadow] duration-150 focus:border-gold focus:ring-2 focus:ring-gold/25";

export function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-ink">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Button({
  children,
  onClick,
  tone = "plain",
  disabled,
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "primary" | "plain" | "quiet";
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  const tones = {
    primary: "bg-navy text-white hover:bg-navy-600",
    plain: "border border-hairline bg-white text-navy hover:bg-navy-050",
    quiet: "text-slate-ink hover:text-navy",
  } as const;
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Friday and Saturday are the Saudi weekend — the schedule says so out loud. */
export const isWeekend = (iso: string) => {
  const day = fromISODate(iso).getDay();
  return day === 5 || day === 6;
};

export const weekdayName = (iso: string) => WEEKDAYS[fromISODate(iso).getDay()];

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-hairline bg-white px-4 py-8 text-center text-sm text-slate-ink">
      {children}
    </p>
  );
}
