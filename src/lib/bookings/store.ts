"use client";

import { getSetting, putSetting } from "@/lib/storage";
import type { Booking, CourseRef, Instructor, Leave } from "./types";

/**
 * Where the booking platform keeps its record.
 *
 * The same place the incentive verifier keeps its reference tables: the
 * browser's IndexedDB, because Vercel gives the app no writable disk. The
 * register is written back whole on every change — four thousand bookings is
 * about 4 MB of JSON, which a single structured clone handles without a
 * schema or a migration to maintain.
 */

const KEYS = {
  bookings: "bookings:register",
  instructors: "bookings:instructors",
  leave: "bookings:leave",
  courses: "bookings:courses",
  meta: "bookings:meta",
} as const;

export interface RegisterMeta {
  /** The file the register was first imported from, so the bar can name it. */
  fileName: string;
  importedAt: number;
  rowCount: number;
  firstDate: string | null;
  lastDate: string | null;
}

export const loadBookings = () => getSetting<Booking[]>(KEYS.bookings).then((v) => v ?? []);
export const saveBookings = (v: Booking[]) => putSetting(KEYS.bookings, v);

export const loadInstructors = () =>
  getSetting<Instructor[]>(KEYS.instructors).then((v) => v ?? []);
export const saveInstructors = (v: Instructor[]) => putSetting(KEYS.instructors, v);

export const loadLeave = () => getSetting<Leave[]>(KEYS.leave).then((v) => v ?? []);
export const saveLeave = (v: Leave[]) => putSetting(KEYS.leave, v);

export const loadCourses = () => getSetting<CourseRef[]>(KEYS.courses).then((v) => v ?? []);
export const saveCourses = (v: CourseRef[]) => putSetting(KEYS.courses, v);

export const loadMeta = () => getSetting<RegisterMeta | undefined>(KEYS.meta);
export const saveMeta = (v: RegisterMeta | null) => putSetting(KEYS.meta, v);

/** Short, collision-free enough for records one office types by hand. */
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
