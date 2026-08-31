"use client";

import { useCallback, useRef, useState } from "react";
import { REQUIRED_COLUMNS } from "@/lib/config";
import { useDashboard } from "@/state/DashboardContext";
import { Icon } from "./Icons";

/**
 * First-run state. The workbook is uploaded on each visit, so the drop zone is
 * the main surface until a dataset is in hand rather than a control tucked into
 * the sidebar.
 */
export function WorkbookDropzone({ note }: { note?: string | null }) {
  const { uploadDataset, refetchDataset, notify } = useDashboard();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!/\.xlsx?$/i.test(file.name)) {
        notify("Please choose an .xlsx workbook.", "warning");
        return;
      }
      setBusy(true);
      try {
        await uploadDataset(file);
      } catch (err) {
        notify((err as Error).message, "error");
      } finally {
        setBusy(false);
      }
    },
    [uploadDataset, notify],
  );

  return (
    <div className="mx-auto max-w-3xl py-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void accept(e.dataTransfer.files?.[0]);
        }}
        className={`stage stage-1 rounded-2xl border-2 border-dashed bg-white px-8 py-12 text-center transition-[border-color,background-color] duration-150 ease-out ${
          dragging ? "border-gold bg-gold-050" : "border-hairline"
        }`}
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-navy text-white">
          <Icon name="upload" size={26} />
        </div>
        <h2 className="text-xl font-bold text-navy">Load the training workbook</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-ink">
          Drop the NEFT data export here, or choose it below. It stays in this browser — it is never
          uploaded to a server — and is remembered until you replace or clear it.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            void accept(file);
          }}
        />
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-md bg-gold px-5 py-2.5 text-sm font-bold text-navy transition-[color,background-color,box-shadow,scale] duration-150 ease-out active:scale-[0.96] hover:brightness-105 disabled:opacity-60 disabled:active:scale-100"
          >
            {busy ? "Reading workbook…" : "Choose workbook"}
          </button>
          <button
            type="button"
            onClick={() => void refetchDataset()}
            className="rounded-md border border-hairline px-4 py-2.5 text-sm font-bold text-navy transition-[color,background-color,box-shadow,scale] duration-150 ease-out active:scale-[0.96] hover:bg-fog"
          >
            Retry server source
          </button>
        </div>

        {note && <p className="mt-5 text-xs text-slate-ink">{note}</p>}
      </div>

      <div className="surface-card stage stage-2 mt-4 rounded-xl border-l-4 border-l-navy bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-ink">
          Expected columns
        </p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {REQUIRED_COLUMNS.map((c) => (
            <li key={c} className="rounded bg-fog px-2 py-1 font-mono text-xs text-navy">
              {c}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-slate-ink">
          One row per participant seat. Any additional columns (Location, Session No, Duplicates …)
          are carried through to the Data Table untouched. 2023 figures are built into the app, so
          the workbook only needs 2024 onwards.
        </p>
      </div>
    </div>
  );
}
