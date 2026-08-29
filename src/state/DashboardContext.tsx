"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { addDays, today } from "@/lib/dates";
import type { Filters } from "@/lib/selectors";
import {
  QIDDIYA_MANUAL_KEY,
  TAKAMOL_MANUAL_KEY,
  readManualEntries,
  writeManualEntries,
} from "@/lib/manual";
import { loadQiddiyaAll } from "@/lib/qiddiya";
import { deleteWorkbook, getWorkbook, listWorkbooks, putWorkbook } from "@/lib/storage";
import type { ManualEntry, QiddiyaStore, TrainingRow } from "@/lib/types";
import { parseTrainingWorkbook } from "@/lib/xlsx";

export type DatasetStatus = "loading" | "ready" | "empty" | "error";

export interface Toast {
  id: number;
  message: string;
  tone: "message" | "warning" | "error";
}

interface DatasetState {
  status: DatasetStatus;
  rows: TrainingRow[];
  columns: string[];
  /** Where the workbook came from — shown in the data source panel. */
  source: string;
  error: string | null;
}

interface DashboardValue {
  dataset: DatasetState;
  filters: Filters;
  setFilters: (patch: Partial<Filters>) => void;
  clientChoices: string[];
  courseChoices: string[];

  qiddiya: QiddiyaStore | null;
  qiddiyaFiles: string[];
  reloadQiddiya: () => Promise<void>;
  addQiddiyaWorkbook: (file: File) => Promise<void>;
  removeQiddiyaWorkbook: (name: string) => Promise<void>;

  qdManual: ManualEntry[];
  setQdManual: (rows: ManualEntry[]) => void;
  tkManual: ManualEntry[];
  setTkManual: (rows: ManualEntry[]) => void;

  uploadDataset: (file: File) => Promise<void>;
  clearUploadedDataset: () => Promise<void>;
  refetchDataset: () => Promise<void>;

  toasts: Toast[];
  notify: (message: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: number) => void;
}

const DashboardContext = createContext<DashboardValue | null>(null);

const DATASET_UPLOAD_ID = "dataset";

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [dataset, setDataset] = useState<DatasetState>({
    status: "loading",
    rows: [],
    columns: [],
    source: "",
    error: null,
  });

  const [filters, setFiltersState] = useState<Filters>(() => ({
    // dateRangeInput(start = Sys.Date() - 7, end = Sys.Date())
    startDate: addDays(today(), -7),
    endDate: today(),
    granularity: "daily",
    timeContext: "custom",
    clients: [],
    courses: [],
    year: "2026",
  }));

  const [qiddiya, setQiddiya] = useState<QiddiyaStore | null>(null);
  const [qiddiyaFiles, setQiddiyaFiles] = useState<string[]>([]);
  const [qdManual, setQdManualState] = useState<ManualEntry[]>([]);
  const [tkManual, setTkManualState] = useState<ManualEntry[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const notify = useCallback((message: string, tone: Toast["tone"] = "message") => {
    const id = (toastId.current += 1);
    setToasts((t) => [...t, { id, message, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const setFilters = useCallback((patch: Partial<Filters>) => {
    setFiltersState((f) => ({ ...f, ...patch }));
  }, []);

  const applyWorkbook = useCallback((data: ArrayBuffer, source: string) => {
    const parsed = parseTrainingWorkbook(data);
    setDataset({
      status: parsed.rows.length ? "ready" : "empty",
      rows: parsed.rows,
      columns: parsed.columns,
      source: `${source} · sheet "${parsed.sheetName}"`,
      error: parsed.rows.length ? null : "The workbook has the right columns but no dated rows.",
    });
  }, []);

  /** load_data_local(): a stored upload wins, otherwise the server-side source. */
  const loadDataset = useCallback(async () => {
    setDataset((d) => ({ ...d, status: "loading", error: null }));

    const stored = await getWorkbook(DATASET_UPLOAD_ID);
    if (stored) {
      try {
        applyWorkbook(stored.data, `Uploaded file "${stored.name}"`);
        return;
      } catch (err) {
        // A bad upload should not block the configured source.
        await deleteWorkbook(DATASET_UPLOAD_ID);
        notify(`Stored upload could not be read: ${(err as Error).message}`, "warning");
      }
    }

    try {
      const res = await fetch("/api/dataset", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
        setDataset({
          status: "empty",
          rows: [],
          columns: [],
          source: "",
          error: body.message ?? `HTTP ${res.status}`,
        });
        return;
      }
      const source = res.headers.get("x-neft-source") ?? "server";
      applyWorkbook(await res.arrayBuffer(), sourceLabel(source));
    } catch (err) {
      setDataset({
        status: "error",
        rows: [],
        columns: [],
        source: "",
        error: (err as Error).message,
      });
    }
  }, [applyWorkbook, notify]);

  /** load_qiddiya_all(): bundled QCTA workbooks plus anything uploaded here. */
  const reloadQiddiya = useCallback(async () => {
    const inputs: { name: string; data: ArrayBuffer }[] = [];

    try {
      const res = await fetch("/api/qiddiya", { cache: "no-store" });
      if (res.ok) {
        const { files } = (await res.json()) as { files: string[] };
        for (const name of files) {
          const f = await fetch(`/api/qiddiya?file=${encodeURIComponent(name)}`);
          if (f.ok) inputs.push({ name, data: await f.arrayBuffer() });
        }
      }
    } catch {
      /* bundled workbooks are optional */
    }

    for (const wb of await listWorkbooks("qiddiya")) {
      if (!inputs.some((i) => i.name === wb.name)) inputs.push({ name: wb.name, data: wb.data });
    }

    setQiddiyaFiles(inputs.map((i) => i.name));
    setQiddiya(inputs.length ? loadQiddiyaAll(inputs) : null);
  }, []);

  useEffect(() => {
    void loadDataset();
    void reloadQiddiya();
    setQdManualState(readManualEntries(QIDDIYA_MANUAL_KEY));
    setTkManualState(readManualEntries(TAKAMOL_MANUAL_KEY));
  }, [loadDataset, reloadQiddiya]);

  const setQdManual = useCallback(
    (rows: ManualEntry[]) => {
      setQdManualState(rows);
      if (!writeManualEntries(QIDDIYA_MANUAL_KEY, rows)) {
        notify("Saved for this session only — local storage is unavailable.", "warning");
      }
    },
    [notify],
  );

  const setTkManual = useCallback(
    (rows: ManualEntry[]) => {
      setTkManualState(rows);
      if (!writeManualEntries(TAKAMOL_MANUAL_KEY, rows)) {
        notify("Saved for this session only — local storage is unavailable.", "warning");
      }
    },
    [notify],
  );

  const uploadDataset = useCallback(
    async (file: File) => {
      const data = await file.arrayBuffer();
      // Parse before storing so a bad file never becomes the persisted source.
      applyWorkbook(data, `Uploaded file "${file.name}"`);
      await putWorkbook({
        id: DATASET_UPLOAD_ID,
        name: file.name,
        kind: "dataset",
        savedAt: Date.now(),
        data,
      });
      notify(`Loaded ${file.name}.`);
    },
    [applyWorkbook, notify],
  );

  const clearUploadedDataset = useCallback(async () => {
    await deleteWorkbook(DATASET_UPLOAD_ID);
    await loadDataset();
    notify("Removed the uploaded workbook.");
  }, [loadDataset, notify]);

  const addQiddiyaWorkbook = useCallback(
    async (file: File) => {
      const data = await file.arrayBuffer();
      await putWorkbook({
        id: `qiddiya:${file.name}`,
        name: file.name,
        kind: "qiddiya",
        savedAt: Date.now(),
        data,
      });
      await reloadQiddiya();
      notify(`Added ${file.name}.`);
    },
    [reloadQiddiya, notify],
  );

  const removeQiddiyaWorkbook = useCallback(
    async (name: string) => {
      await deleteWorkbook(`qiddiya:${name}`);
      await reloadQiddiya();
      notify(`Removed ${name}.`);
    },
    [reloadQiddiya, notify],
  );

  /** updateSelectizeInput(choices = sort(unique(...))) */
  const clientChoices = useMemo(
    () => [...new Set(dataset.rows.map((r) => r.client).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [dataset.rows],
  );
  const courseChoices = useMemo(
    () => [...new Set(dataset.rows.map((r) => r.courseName).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [dataset.rows],
  );

  const value = useMemo<DashboardValue>(
    () => ({
      dataset,
      filters,
      setFilters,
      clientChoices,
      courseChoices,
      qiddiya,
      qiddiyaFiles,
      reloadQiddiya,
      addQiddiyaWorkbook,
      removeQiddiyaWorkbook,
      qdManual,
      setQdManual,
      tkManual,
      setTkManual,
      uploadDataset,
      clearUploadedDataset,
      refetchDataset: loadDataset,
      toasts,
      notify,
      dismissToast,
    }),
    [
      dataset, filters, setFilters, clientChoices, courseChoices, qiddiya, qiddiyaFiles,
      reloadQiddiya, addQiddiyaWorkbook, removeQiddiyaWorkbook, qdManual, setQdManual,
      tkManual, setTkManual, uploadDataset, clearUploadedDataset, loadDataset, toasts,
      notify, dismissToast,
    ],
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

function sourceLabel(source: string): string {
  if (source.startsWith("env:")) return "Configured workbook URL";
  if (source === "google-published-workbook") return "Published Google workbook";
  if (source.startsWith("public/")) return `Repository file ${source}`;
  return source;
}

export function useDashboard(): DashboardValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used inside <DashboardProvider>.");
  return ctx;
}
