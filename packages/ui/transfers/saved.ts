// Drive uploads kept on this device (IndexedDB) until they're in, so a closed
// tab, a reload or a phone killing the app loses nothing: they come back in
// the transfers panel to resume (packages/ui/transfers/store.ts). Order photos
// have their own queue (packages/lib/offline-queue).
import type { Via } from "@repo/lib/files/core";

const DB_NAME = "drive-uploads";
const STORE = "uploads";

export interface SavedUpload {
  id: string;
  name: string;
  folderId: string | null;
  via: Via;
  /** The folder's name, to show where it's going. */
  where: string;
  file: File;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** False when the device wouldn't keep it (out of space): it still uploads, from memory. */
export const keepUpload = (u: SavedUpload) =>
  run("readwrite", (s) => s.put(u)).then(
    () => true,
    () => false,
  );
export const forgetUpload = (id: string) => run("readwrite", (s) => s.delete(id)).catch(() => undefined);
export const forgetAllUploads = () => run("readwrite", (s) => s.clear()).catch(() => undefined);
export const savedUploads = () => run<SavedUpload[]>("readonly", (s) => s.getAll() as IDBRequest<SavedUpload[]>).catch(() => [] as SavedUpload[]);
