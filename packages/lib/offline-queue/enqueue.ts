import { addQueuedUpload, removeQueuedUpload, listQueuedUploads, type QueuedUpload } from "./db";
import { reportUploadTrouble } from "@repo/lib/storage/actions";
import { uploadFileToStorage } from "@repo/lib/storage/upload-client";

export const QUEUE_CHANGED_EVENT = "offline-queue:changed";

/** Where one queued photo is, for screens that show it (packages/ui/media/UploadQueueStatus.tsx). */
export type QueuedState = "waiting" | "uploading" | "done" | "failed";

// Only for this page load: entries leave the database once uploaded, and a
// failed one stays there to be tried again.
const states = new Map<string, { state: QueuedState; progress: number }>();

/** Upload progress only; QUEUE_CHANGED_EVENT is for an entry changing state. */
export const QUEUE_PROGRESS_EVENT = "offline-queue:progress";

function setState(id: string, state: QueuedState, progress = 0): void {
  const same = states.get(id)?.state === state;
  states.set(id, { state, progress });
  window.dispatchEvent(new Event(same ? QUEUE_PROGRESS_EVENT : QUEUE_CHANGED_EVENT));
}

/** Keeps the photo on this device until it's uploaded; returns its queue id. */
export async function enqueueUpload(orderItemId: string, file: File): Promise<string> {
  const id = crypto.randomUUID();
  await addQueuedUpload({ id, orderItemId, fileName: file.name, file, createdAt: Date.now() });
  setState(id, "waiting");
  return id;
}

export async function pendingUploadsFor(orderItemId: string): Promise<number> {
  const all = await listQueuedUploads();
  return all.filter((u) => u.orderItemId === orderItemId).length;
}

export function queuedState(id: string): { state: QueuedState; progress: number } {
  return states.get(id) ?? { state: "waiting", progress: 0 };
}

let running: Promise<void> | null = null;
let again = false;

// Replays every queued upload through the normal upload path (which retries
// a few times itself). Called right after an order is placed, and on `online`
// and `visibilitychange` (packages/lib/offline-queue/flush.ts). One run at a
// time; a call during a run starts another when it ends. A failure leaves the
// entry queued for the next trigger rather than dropping it, and the first
// time, the uploader and the office are told.
export function flushQueuedUploads(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      const queued: QueuedUpload[] = await listQueuedUploads();
      for (const entry of queued) {
        setState(entry.id, "uploading");
        const res = await uploadFileToStorage(entry.orderItemId, entry.file, (p) => setState(entry.id, "uploading", p));
        if (res.ok) {
          await removeQueuedUpload(entry.id);
          setState(entry.id, "done", 1);
          continue;
        }
        setState(entry.id, "failed");
        if (!entry.reported) {
          const told = await reportUploadTrouble(entry.orderItemId, entry.fileName).catch(() => ({ ok: false }));
          if (told.ok) await addQueuedUpload({ ...entry, reported: true });
        }
      }
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}
