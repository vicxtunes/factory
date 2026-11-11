// Uploads kept on this device (IndexedDB) until they're in, so a closed tab,
// a reload or a phone killing the app loses nothing: they come back in the
// transfers panel (./store.ts). Every kind of upload is kept here; Drive's
// were first, hence the database's name.
import type { Via } from "@repo/lib/files/core";

import type { Progress, UploadTarget } from "./senders";

const DB_NAME = "drive-uploads";
const STORE = "uploads";

export interface SavedUpload extends Progress {
  id: string;
  name: string;
  /** Where it's going, to show. */
  where: string;
  target: UploadTarget;
  file: File;
  /** The uploader and the office were told it's having trouble (order photos). */
  reported?: boolean;
}

/** As Drive uploads were kept before 2026-11-11. */
type OldDriveUpload = { id: string; name: string; where: string; file: File; folderId: string | null; via: Via; target?: undefined };

function open(name: string, upgrade: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open(DB_NAME, (d) => d.createObjectStore(STORE, { keyPath: "id" }));
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

/** False when the device wouldn't keep it (out of space, private browsing): it still uploads, from memory. */
export const keepUpload = (u: SavedUpload) =>
  run("readwrite", (s) => s.put(u)).then(
    () => true,
    () => false,
  );
export const forgetUpload = (id: string) => run("readwrite", (s) => s.delete(id)).catch(() => undefined);

export async function forgetAllUploads() {
  await run("readwrite", (s) => s.clear()).catch(() => undefined);
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(OLD_ORDER_PHOTOS);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

export async function savedUploads(): Promise<SavedUpload[]> {
  const rows = await run<(SavedUpload | OldDriveUpload)[]>("readonly", (s) => s.getAll() as IDBRequest<(SavedUpload | OldDriveUpload)[]>).catch(() => []);
  const saved = rows.map((r): SavedUpload => (r.target ? r : { id: r.id, name: r.name, where: r.where, file: r.file, target: { kind: "drive", via: r.via, folderId: r.folderId } }));
  return [...saved, ...(await takeOldOrderPhotos())];
}

// Order photos had a queue of their own until 2026-11-11 (offline-media-queue).
// Any still waiting on a device move here, so none is lost.
const OLD_ORDER_PHOTOS = "offline-media-queue";
type OldOrderPhoto = { id: string; orderItemId: string; fileName: string; file: File; reported?: boolean };

async function takeOldOrderPhotos(): Promise<SavedUpload[]> {
  try {
    // Browsers that can't list databases just open it (an empty one is deleted below).
    const known = await indexedDB.databases?.();
    if (known && !known.some((d) => d.name === OLD_ORDER_PHOTOS)) return [];
    const db = await open(OLD_ORDER_PHOTOS, (d) => d.createObjectStore("uploads", { keyPath: "id" }));
    const old = await new Promise<OldOrderPhoto[]>((resolve, reject) => {
      const req = db.transaction("uploads", "readonly").objectStore("uploads").getAll();
      req.onsuccess = () => resolve(req.result as OldOrderPhoto[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    const moved = old.map((o): SavedUpload => ({ id: o.id, name: o.fileName, where: "Order photos", file: o.file, target: { kind: "order-item", orderItemId: o.orderItemId }, reported: o.reported }));
    for (const m of moved) await keepUpload(m);
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(OLD_ORDER_PHOTOS);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
    return moved;
  } catch {
    return [];
  }
}
