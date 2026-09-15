import { addQueuedUpload, removeQueuedUpload, listQueuedUploads, type QueuedUpload } from "./db";
import { uploadFileToStorage } from "@/lib/storage/upload-client";

export const QUEUE_CHANGED_EVENT = "offline-queue:changed";

function notifyChanged(): void {
  window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
}

export async function enqueueUpload(orderItemId: string, file: File): Promise<void> {
  await addQueuedUpload({
    id: crypto.randomUUID(),
    orderItemId,
    fileName: file.name,
    file,
    createdAt: Date.now(),
  });
  notifyChanged();
}

export async function pendingUploadsFor(orderItemId: string): Promise<number> {
  const all = await listQueuedUploads();
  return all.filter((u) => u.orderItemId === orderItemId).length;
}

// Replays every queued upload through the normal upload path. Called on
// `online` and `visibilitychange` (see lib/offline-queue/flush.ts) — a
// failure just leaves the entry queued for the next trigger rather than
// dropping it, since "still offline" and "genuinely failed" look the same
// from here.
export async function flushQueuedUploads(): Promise<void> {
  const queued: QueuedUpload[] = await listQueuedUploads();
  for (const entry of queued) {
    const res = await uploadFileToStorage(entry.orderItemId, entry.file);
    if (res.ok) {
      await removeQueuedUpload(entry.id);
      notifyChanged();
    }
  }
}
