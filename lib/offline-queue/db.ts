// Native IndexedDB wrapper for queued photo uploads (lib/storage/upload-client.ts's
// step 2 is a direct client fetch to Supabase Storage, not a Server Action, so it's
// the one write in this app experimental.useOffline doesn't cover — see
// components/media/AddMediaButton.tsx and lib/offline-queue/enqueue.ts). No new
// dependency: the native indexedDB API is enough for one object store.
const DB_NAME = "offline-media-queue";
const STORE = "uploads";
const DB_VERSION = 1;

export interface QueuedUpload {
  id: string;
  orderItemId: string;
  fileName: string;
  file: File;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addQueuedUpload(entry: QueuedUpload): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listQueuedUploads(): Promise<QueuedUpload[]> {
  const db = await openDb();
  const result = await new Promise<QueuedUpload[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueuedUpload[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

export async function removeQueuedUpload(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
