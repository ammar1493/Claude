"use client";

import { Icon } from "../Icons";
import { Button } from "./chrome";

/**
 * What the platform says when it holds nothing yet.
 *
 * There are two ways to start and neither is more correct than the other: an
 * office with a booking sheet imports it once, and an office without one — or
 * one that has stopped keeping the sheet at all — types its first booking in.
 * The import used to be a gate across every tab, which made the sheet look
 * compulsory when it never was. This is a signpost instead, and it disappears
 * the moment the register holds anything.
 */
export function EmptyRegister({
  onAddBooking,
  onImport,
}: {
  onAddBooking: () => void;
  onImport: () => void;
}) {
  return (
    <div className="surface-card mb-4 rounded-2xl bg-white px-5 py-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-050 text-navy">
          <Icon name="calendar" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-navy">Nothing in the register yet</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-ink">
            You can start either way. Type the first booking in and work entirely in the platform,
            or import an existing booking sheet to bring a year of work across in one go. The rest
            of the app — the roster, leave, the schedule, the checks — works the same whichever you
            choose.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button tone="primary" onClick={onAddBooking}>
              <Icon name="plus" size={14} /> Add the first booking
            </Button>
            <Button onClick={onImport}>
              <Icon name="upload" size={14} /> Import a booking sheet
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
