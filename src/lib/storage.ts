"use client";

/**
 * Uploaded workbooks are kept in IndexedDB so that a refresh does not force a
 * re-upload. Vercel gives the app no writable disk, so the browser is the only
 * place a user-supplied workbook can live between visits.
 */

const DB_NAME = "neft-dashboard";
const DB_VERSION = 1;
const STORE = "workbooks";

export interface StoredWorkbook {
  /** "dataset" for the main training workbook, "qiddiya:<filename>" for QCTA. */
  id: string;
  name: string;
  kind: "dataset" | "qiddiya";
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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open the local workbook store."));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("Local workbook store request failed."));
        t.oncomplete = () => db.close();
      }),
  );
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
