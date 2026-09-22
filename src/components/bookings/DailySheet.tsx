"use client";

import { DAILY_COLUMNS, dailySheetLines, type DailyLine } from "@/lib/bookings/dailySheet";
import type { ClassSession } from "@/lib/bookings/schedule";
import type { Instructor } from "@/lib/bookings/types";
import { Empty } from "./chrome";

/**
 * The day's schedule as the sheet that goes out by email.
 *
 * The same nine columns and the same blocking as the exported workbook, drawn
 * on screen so the coordinator sees what they are about to send before they
 * send it — and so the browser's own print dialog can turn it into the PDF,
 * which is how the dashboard already makes a report.
 *
 * Deliberately not the brand's navy: this sheet has been going out looking
 * like this for years, and the point of the export is that the people who
 * receive it every morning do not have to notice it changed hands.
 */

const HEADER = "#2e75b6";
const BAND = "#ddebf7";
const GRID = "#9dc3e6";

export function DailySheet({
  classes,
  instructors,
  day,
}: {
  classes: ClassSession[];
  instructors: Instructor[];
  day: string;
}) {
  const lines: DailyLine[] = dailySheetLines(classes, instructors, day);
  if (!lines.length)
    return <Empty>Nothing is running on this day, so there is no sheet to send.</Empty>;

  // Banding runs down the classes and skips the separators, matching the file.
  let band = 0;

  return (
    <div className="neft-scroll overflow-x-auto">
      <table className="w-full border-collapse text-[12px]" style={{ borderColor: GRID }}>
        <thead>
          <tr>
            {DAILY_COLUMNS.map((c) => (
              <th
                key={c}
                className="border px-2 py-2 text-center font-bold text-white"
                style={{ background: HEADER, borderColor: GRID }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            if (!line) {
              return (
                <tr key={`gap-${index}`} aria-hidden>
                  <td colSpan={DAILY_COLUMNS.length} className="h-3" />
                </tr>
              );
            }
            const shaded = band % 2 === 1;
            band += 1;
            const cells = [
              line.title,
              line.time,
              line.instructor,
              line.venue,
              line.date,
              String(line.participants),
              line.session,
              line.classroom,
              line.company,
            ];
            return (
              <tr key={`${line.title}-${index}`} style={{ background: shaded ? BAND : "#fff" }}>
                {cells.map((value, i) => (
                  <td
                    key={i}
                    className={`border px-2 py-1.5 text-center align-middle ${
                      i === 0 ? "text-start font-medium" : ""
                    } ${i === 2 && !value ? "font-bold text-navy" : "text-navy"}`}
                    style={{ borderColor: GRID }}
                  >
                    {/* An empty instructor cell is the one thing on this sheet
                        that must not go out unnoticed. */}
                    {i === 2 && !value ? "NOT ASSIGNED" : value}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
