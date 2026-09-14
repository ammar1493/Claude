"use client";

/**
 * Uploaded workbooks are kept in IndexedDB so that a refresh does not force a
 * re-upload. Vercel gives the app no writable disk, so the browser is the only
 * place a user-supplied workbook can live between visits.
 */

const DB_NAME = "neft-dashboard";
/** v2 added the settings store for the incentive verifier's reference tables. */
const DB_VERSION = 2;
const STORE = "workbooks";
const SETTINGS_STORE = "settings";

export interface StoredWorkbook {
  /**
   * "dataset" for the main training workbook, "qiddiya:<filename>" for QCTA,
   * "record"/"courses" for the incentive verifier's two reference workbooks,
   * "incentive:<filename>" for a trainer's sheet, and "timecard:<id>" for a
   * scanned timecard kept as the audit trail behind one.
   */
  id: string;
  name: string;
  kind: "dataset" | "qiddiya" | "record" | "courses" | "incentive" | "attachment";
  savedAt: number;
  data: ArrayBuffer;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable in this browser."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" }).createIndex("kind", "kind");
      }
      // Added without touching the workbook store, so an upgrade keeps
      // whatever the browser already holds.
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open the local workbook store."));
  });
}

function txOn<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const req = run(t.objectStore(storeName));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("Local workbook store request failed."));
        t.oncomplete = () => db.close();
      }),
  );
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return txOn(STORE, mode, run);
}

/**
 * Small JSON records the incentive verifier keeps between visits: the site
 * distance table and the assessor timecards. They are typed at the call site
 * and stored as plain structured-clonable values.
 */
interface SettingsRecord<T> {
  id: string;
  value: T;
  savedAt: number;
}

export async function getSetting<T>(id: string): Promise<T | undefined> {
  try {
    const row = await txOn<SettingsRecord<T> | undefined>(SETTINGS_STORE, "readonly", (s) =>
      s.get(id),
    );
    return row?.value;
  } catch {
    return undefined;
  }
}

export async function putSetting<T>(id: string, value: T): Promise<void> {
  try {
    await txOn(SETTINGS_STORE, "readwrite", (s) =>
      s.put({ id, value, savedAt: Date.now() } satisfies SettingsRecord<T>) as IDBRequest<IDBValidKey>,
    );
  } catch {
    /* a browser with no writable storage still works, it just forgets */
  }
}

export async function putWorkbook(wb: StoredWorkbook): Promise<void> {
  await tx("readwrite", (s) => s.put(wb) as IDBRequest<IDBValidKey>);
}

export async function getWorkbook(id: string): Promise<StoredWorkbook | undefined> {
  try {
    return await tx<StoredWorkbook | undefined>("readonly", (s) => s.get(id));
  } catch {
    return undefined;
  }
}

export async function listWorkbooks(kind?: StoredWorkbook["kind"]): Promise<StoredWorkbook[]> {
  try {
    const all = await tx<StoredWorkbook[]>("readonly", (s) => s.getAll() as IDBRequest<StoredWorkbook[]>);
    return kind ? all.filter((w) => w.kind === kind) : all;
  } catch {
    return [];
  }
}

export async function deleteWorkbook(id: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(id) as unknown as IDBRequest<undefined>);
  } catch {
    /* nothing to remove */
  }
}
