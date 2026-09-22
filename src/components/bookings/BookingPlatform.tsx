"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BRAND, HAS_DASHBOARD } from "@/lib/brand";
import {
  ceilingMonth,
  addDays,
  floorMonth,
  fmtMonthYearFull,
  fromISODate,
  toISODate,
} from "@/lib/dates";
import { downloadRegister, type ExportScope } from "@/lib/bookings/export";
import { parseBookingWorkbook } from "@/lib/bookings/parse";
import { buildClasses, findConflicts, type PlanWindow } from "@/lib/bookings/schedule";
import {
  loadBookings,
  loadCourses,
  loadInstructors,
  loadLeave,
  loadMeta,
  saveBookings,
  saveCourses,
  saveInstructors,
  saveLeave,
  saveMeta,
  type RegisterMeta,
} from "@/lib/bookings/store";
import type { Booking, CourseRef, Instructor, Leave } from "@/lib/bookings/types";
import { Icon, type IconName } from "../Icons";
import { Button } from "./chrome";
import { BookingsTable } from "./BookingsTable";
import { ConflictsPanel } from "./ConflictsPanel";
import { DaySchedule } from "./DaySchedule";
import { ImportPanel } from "./ImportPanel";
import { InstructorsPanel } from "./InstructorsPanel";

/**
 * The booking platform.
 *
 * It holds its own record rather than reading the dashboard's training
 * workbook: that workbook is what was delivered, and this is what is still to
 * come. The office uploads its booking sheet once, and from then on the
 * register lives here — new bookings are typed in, statuses are set, and the
 * Excel file becomes an export rather than the system of record.
 */

const TABS: { id: string; label: string; icon: IconName }[] = [
  { id: "schedule", label: "Daily schedule", icon: "calendar-check" },
  { id: "register", label: "Bookings", icon: "table" },
  { id: "instructors", label: "Instructors & leave", icon: "people" },
  { id: "plan", label: "Plan check", icon: "shield" },
  { id: "import", label: "Import / export", icon: "upload" },
];

const monthWindow = (d: Date): PlanWindow => ({
  from: toISODate(floorMonth(d)),
  to: toISODate(addDays(ceilingMonth(d), -1)),
});

export function BookingPlatform() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [courses, setCourses] = useState<CourseRef[]>([]);
  const [meta, setMeta] = useState<RegisterMeta | undefined>();
  const [restored, setRestored] = useState(false);
  const [tab, setTab] = useState("schedule");
  const [notice, setNotice] = useState<string | null>(null);
  const [month, setMonth] = useState(() => floorMonth(new Date()));

  useEffect(() => {
    void (async () => {
      const [b, i, l, c, m] = await Promise.all([
        loadBookings(),
        loadInstructors(),
        loadLeave(),
        loadCourses(),
        loadMeta(),
      ]);
      setBookings(b);
      setInstructors(i);
      setLeaves(l);
      setCourses(c);
      setMeta(m);
      setRestored(true);
    })();
  }, []);

  /*
   * The register is written back whole, so a run of edits — retyping a note,
   * stepping an instructor through a select — waits for the typing to stop
   * rather than serialising four megabytes per keystroke.
   */
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!restored) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void saveBookings(bookings), 400);
    return () => window.clearTimeout(timer.current);
  }, [bookings, restored]);
  useEffect(() => {
    if (restored) void saveInstructors(instructors);
  }, [instructors, restored]);
  useEffect(() => {
    if (restored) void saveLeave(leaves);
  }, [leaves, restored]);

  const window_ = useMemo(() => monthWindow(month), [month]);
  const classes = useMemo(() => buildClasses(bookings), [bookings]);
  const conflicts = useMemo(
    () => findConflicts(classes, instructors, leaves, window_),
    [classes, instructors, leaves, window_],
  );
  const errorCount = conflicts.filter((c) => c.severity === "error").length;

  const patchBooking = useCallback((id: string, patch: Partial<Booking>) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch, updatedAt: Date.now() } : b)),
    );
  }, []);

  const patchMany = useCallback((ids: string[], patch: Partial<Booking>) => {
    const set = new Set(ids);
    setBookings((prev) =>
      prev.map((b) => (set.has(b.id) ? { ...b, ...patch, updatedAt: Date.now() } : b)),
    );
  }, []);

  const applyAssignments = useCallback((assignments: Record<string, string>) => {
    setBookings((prev) =>
      prev.map((b) =>
        assignments[b.id] ? { ...b, instructorId: assignments[b.id], updatedAt: Date.now() } : b,
      ),
    );
  }, []);

  const addBooking = useCallback((booking: Booking) => {
    setBookings((prev) => [...prev, booking]);
  }, []);

  const removeBooking = useCallback((id: string) => {
    setBookings((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const importWorkbook = useCallback(async (file: File, mode: "replace" | "merge") => {
    const parsed = parseBookingWorkbook(await file.arrayBuffer());
    setBookings((prev) => {
      if (mode === "replace") return parsed.bookings;
      // Merging keeps what the office has already decided here — the status,
      // the PO, the instructor — and takes only bookings the register has
      // never seen. An import is a top-up, not an overwrite.
      const known = new Set(prev.map((b) => b.id));
      const added = parsed.bookings.filter((b) => !known.has(b.id));
      return [...prev, ...added];
    });
    setCourses((prev) => {
      const next = parsed.courses.length ? parsed.courses : prev;
      void saveCourses(next);
      return next;
    });
    const nextMeta: RegisterMeta = {
      fileName: file.name,
      importedAt: Date.now(),
      rowCount: parsed.rowCount,
      firstDate: parsed.firstDate,
      lastDate: parsed.lastDate,
    };
    setMeta(nextMeta);
    void saveMeta(nextMeta);
    return parsed;
  }, []);

  const clearRegister = useCallback(() => {
    setBookings([]);
    setMeta(undefined);
    void saveBookings([]);
    void saveMeta(null);
  }, []);

  const exportRegister = useCallback(
    async (scope: ExportScope) => {
      if (!bookings.length) {
        setNotice("There is nothing in the register to export yet.");
        return;
      }
      await downloadRegister(bookings, instructors, leaves, window_, scope);
      setNotice(
        scope === "all"
          ? `Exported the whole register — ${bookings.length.toLocaleString("en-US")} bookings.`
          : `Exported ${fmtMonthYearFull(month)}: its bookings, its schedule and its conflicts.`,
      );
    },
    [bookings, instructors, leaves, window_, month],
  );

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(id);
  }, [notice]);

  const totalTrainees = useMemo(
    () => bookings.reduce((n, b) => n + (b.status === "cancelled" ? 0 : b.participants.length), 0),
    [bookings],
  );

  return (
    <div className="min-h-screen [--nav-h:64px]">
      {/* The sheet view is printed to make the morning's PDF, so the app's own
          chrome stays off the page. */}
      <header className="no-print sticky top-0 z-30 border-b border-hairline bg-white">
        <div className="flex h-(--nav-h) flex-wrap items-center gap-3 px-4">
          <img src={BRAND.logo} alt="NEFT Energies" className="h-9 w-auto shrink-0" />
          <span className="text-base font-bold tracking-tight text-navy sm:text-lg">
            Booking &amp; Scheduling
          </span>
          <nav className="no-print ml-auto flex flex-wrap items-center gap-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-[color,background-color,scale] duration-150 ease-out active:scale-[0.96] ${
                  tab === t.id
                    ? "bg-navy text-white"
                    : "text-slate-ink hover:bg-navy-050 hover:text-navy"
                }`}
              >
                <Icon name={t.icon} size={15} />
                <span className="hidden lg:inline">{t.label}</span>
                {t.id === "plan" && errorCount > 0 && (
                  <span className="rounded-full bg-gold px-1.5 text-[11px] font-bold text-navy">
                    {errorCount}
                  </span>
                )}
              </button>
            ))}
            {/* Only the booking platform is hosted in the standalone build,
                so the link back to the dashboard would go nowhere. */}
            {HAS_DASHBOARD && (
              <a
                href="/"
                className="ms-1 flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1.5 text-[13px] font-medium text-slate-ink transition-[color,background-color,scale] duration-150 ease-out hover:bg-navy-050 hover:text-navy active:scale-[0.96]"
              >
                <Icon name="gauge" size={15} />
                <span className="hidden lg:inline">Dashboard</span>
              </a>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-5">
        {/* The register bar. What the dashboard's workbook bar does for the
            training export: says what is loaded before anyone questions a
            number that comes out of it. */}
        <div className="no-print surface-card mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-white px-4 py-3 text-sm">
          <span className="flex items-center gap-2 font-bold text-navy">
            <Icon name="calendar" size={16} />
            {meta ? meta.fileName : "No booking sheet imported yet"}
          </span>
          <span className="text-slate-ink">
            <strong className="text-navy">{bookings.length.toLocaleString("en-US")}</strong>{" "}
            bookings ·{" "}
            <strong className="text-navy">{totalTrainees.toLocaleString("en-US")}</strong> trainees
            · <strong className="text-navy">{classes.length.toLocaleString("en-US")}</strong>{" "}
            classes
          </span>
          {meta?.firstDate && (
            <span className="text-slate-ink">
              covering {meta.firstDate} to {meta.lastDate}
            </span>
          )}
          <span className="ms-auto flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-ink">
              Planning month
              <input
                type="month"
                value={toISODate(month).slice(0, 7)}
                onChange={(e) =>
                  e.target.value && setMonth(floorMonth(fromISODate(`${e.target.value}-01`)))
                }
                className="rounded-md border border-hairline bg-white px-2 py-1 text-sm text-navy outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
              />
            </label>
            <Button
              onClick={() => void exportRegister("month")}
              tone="plain"
              title="The planning month: its bookings, the daily schedule, the roster, the leave and the conflicts"
            >
              <Icon name="download" size={14} /> Export the month
            </Button>
          </span>
        </div>

        {notice && (
          <p className="no-print mb-4 rounded-xl border-l-4 border-l-gold bg-white px-4 py-3 text-sm text-slate-ink shadow-[var(--shadow-card)]">
            {notice}
          </p>
        )}

        {!restored ? (
          <p className="rounded-xl bg-white px-4 py-8 text-center text-sm text-slate-ink">
            Opening the register…
          </p>
        ) : !bookings.length && tab !== "import" ? (
          <ImportPanel
            meta={meta}
            bookingCount={0}
            onExportAll={() => void exportRegister("all")}
            onImport={importWorkbook}
            onClear={clearRegister}
            onNotice={setNotice}
          />
        ) : (
          <>
            {tab === "schedule" && (
              <DaySchedule
                classes={classes}
                instructors={instructors}
                leaves={leaves}
                window={window_}
                onAssign={(ids, instructorId) => patchMany(ids, { instructorId })}
                onRoom={(ids, room) => patchMany(ids, { room })}
                onApply={applyAssignments}
                onNotice={setNotice}
              />
            )}
            {tab === "register" && (
              <BookingsTable
                bookings={bookings}
                instructors={instructors}
                courses={courses}
                window={window_}
                onPatch={patchBooking}
                onAdd={addBooking}
                onRemove={removeBooking}
                onNotice={setNotice}
              />
            )}
            {tab === "instructors" && (
              <InstructorsPanel
                instructors={instructors}
                leaves={leaves}
                classes={classes}
                courses={courses}
                window={window_}
                onInstructors={setInstructors}
                onLeaves={setLeaves}
                onNotice={setNotice}
              />
            )}
            {tab === "plan" && (
              <ConflictsPanel
                conflicts={conflicts}
                bookings={bookings}
                instructors={instructors}
                classes={classes}
                window={window_}
                month={month}
              />
            )}
            {tab === "import" && (
              <ImportPanel
                meta={meta}
                bookingCount={bookings.length}
                onExportAll={() => void exportRegister("all")}
                onImport={importWorkbook}
                onClear={clearRegister}
                onNotice={setNotice}
              />
            )}
          </>
        )}

        <footer className="no-print mt-10 flex flex-col items-center gap-3 border-t border-hairline pt-6 text-center text-xs text-slate-ink">
          <img src={BRAND.logo} alt="" aria-hidden className="h-7 w-auto opacity-70" />
          <p>
            {BRAND.name} · Booking &amp; Scheduling · {new Date().getFullYear()}
          </p>
        </footer>
      </main>
    </div>
  );
}
