"use client";

import { useRef, useState } from "react";
import type { ImportResult } from "@/lib/bookings/parse";
import type { RegisterMeta } from "@/lib/bookings/store";
import { Alert, Card, SectionTitle } from "../Card";
import { Icon } from "../Icons";
import { Button, Empty } from "./chrome";

/**
 * The one-time upload, and the way back out.
 *
 * The booking sheet comes in once and becomes the register; after that an
 * import is a top-up, which is why "merge" is the default and only adds
 * bookings the register has never seen — it will not walk over a status or an
 * instructor somebody has already set here. Export writes the whole thing back
 * out as a workbook, so nothing in this app is a one-way door.
 */

export function ImportPanel({
  meta,
  bookingCount,
  onImport,
  onClear,
  onExportAll,
  onNotice,
}: {
  meta: RegisterMeta | undefined;
  bookingCount: number;
  onImport: (file: File, mode: "replace" | "merge") => Promise<ImportResult>;
  onClear: () => void;
  onExportAll: () => void;
  onNotice: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const warnings = result?.warnings ?? meta?.warnings;

  const take = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const mode = bookingCount ? "merge" : "replace";
      const parsed = await onImport(file, mode);
      setResult(parsed);
      onNotice(
        mode === "merge"
          ? `Merged ${file.name} — new bookings added, nothing already decided here was touched.`
          : `Imported ${parsed.bookings.length} bookings from ${parsed.rowCount} rows.`,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle>Import the booking sheet</SectionTitle>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void take(e.dataTransfer.files[0]);
        }}
        className={`surface-card flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed bg-white px-6 py-10 text-center transition-[border-color,background-color] duration-150 ${
          dragging ? "border-gold bg-gold-050" : "border-hairline"
        }`}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-050 text-navy">
          <Icon name="upload" size={22} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-navy">
            {bookingCount ? "Add a newer booking sheet" : "Drop the booking workbook here"}
          </h3>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-ink">
            The <strong>Booking</strong> tab is read one row per participant and grouped into
            bookings — one company, one course, one set of dates. The <strong>CODE</strong> tab
            becomes the course list behind the new-booking form. Everything stays in this browser.
          </p>
        </div>
        <input
          ref={input}
          type="file"
          accept=".xlsx,.xlsm,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            void take(file);
          }}
        />
        <Button tone="primary" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? "Reading…" : "Choose the workbook"}
        </Button>
      </div>

      {error && <Alert tone="warning">{error}</Alert>}

      {meta && (
        <Card title="What is loaded" expandable={false}>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-slate-ink">File</dt>
              <dd className="font-bold text-navy">{meta.fileName}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-ink">Participant rows read</dt>
              <dd className="font-bold text-navy">{meta.rowCount.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-ink">Covering</dt>
              <dd className="font-bold text-navy">
                {meta.firstDate} → {meta.lastDate}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-ink">Imported</dt>
              <dd className="font-bold text-navy">
                {new Date(meta.importedAt).toLocaleString("en-GB")}
              </dd>
            </div>
          </dl>
        </Card>
      )}

      {/* Read from the stored import rather than from this visit's parse, so
          the list is still here tomorrow when somebody gets round to fixing
          the sheet. */}
      {warnings && (
        <Card title={`Rows the sheet could not settle — ${warnings.length}`} expandable={false}>
          {!warnings.length ? (
            <Empty>Every row read cleanly.</Empty>
          ) : (
            <ul className="flex list-disc flex-col gap-1 ps-5 text-xs leading-relaxed text-slate-ink">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {bookingCount > 0 && (
        <Card title="The whole register" expandable={false}>
          <p className="mb-3 text-xs leading-relaxed text-slate-ink">
            The header's <strong>Export the month</strong> writes the planning month — small enough
            to mail round. This writes every booking the register holds, history included, which is
            the backup to keep somewhere outside this browser.
          </p>
          <Button onClick={onExportAll}>
            <Icon name="download" size={14} /> Export every booking
          </Button>
        </Card>
      )}

      {bookingCount > 0 && (
        <Card title="Start again" expandable={false}>
          <p className="mb-3 text-xs leading-relaxed text-slate-ink">
            Clearing the register removes every booking held in this browser, along with the
            statuses, purchase orders and instructor assignments set against them. The roster and
            the leave stay. Export first if you want a copy.
          </p>
          {confirmClear ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-navy">
                Clear {bookingCount.toLocaleString("en-US")} bookings?
              </span>
              <Button
                tone="primary"
                onClick={() => {
                  onClear();
                  setConfirmClear(false);
                  setResult(null);
                  onNotice("The register is empty.");
                }}
              >
                Yes, clear it
              </Button>
              <Button onClick={() => setConfirmClear(false)}>Keep it</Button>
            </div>
          ) : (
            <Button onClick={() => setConfirmClear(true)}>
              <Icon name="trash" size={14} /> Clear the register
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}
