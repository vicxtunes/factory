"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { UploadRow } from "@repo/ui/UploadRow";
import { UploadThumbs, uploadKey, type UploadThumb } from "@repo/ui/UploadThumbs";
import { addMediaLink } from "@repo/lib/storage/actions";
import { uploadFileToStorage } from "@repo/lib/storage/upload-client";
import { enqueueUpload, pendingUploadsFor, QUEUE_CHANGED_EVENT } from "@repo/lib/offline-queue/enqueue";

// Lets a signed-in user (dashboard order entry, worker, or designer) attach
// more photos — or paste a link (Drive, Dropbox, WeTransfer, etc.) — to an
// existing order item after the fact. Reuses the same direct-to-Storage
// upload path as order entry, so a failed upload there isn't a dead end.
export function AddMediaButton({
  orderItemId,
  onUploaded,
}: {
  orderItemId: string;
  onUploaded?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [pendingUploads, setPendingUploads] = useState(0);
  const [items, setItems] = useState<UploadThumb[]>([]);

  useEffect(() => {
    const refresh = () => pendingUploadsFor(orderItemId).then(setPendingUploads);
    refresh();
    window.addEventListener(QUEUE_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(QUEUE_CHANGED_EVENT, refresh);
  }, [orderItemId]);

  const update = (key: string, patch: Partial<UploadThumb>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  // One file: upload with progress, or queue it when the connection's gone.
  // Returns false only for a real failure (shown on its thumbnail).
  async function uploadOne(key: string, file: File): Promise<boolean> {
    // Skip the request entirely when we already know we're offline —
    // avoids a doomed round trip before falling back to the queue.
    if (!navigator.onLine) {
      await enqueueUpload(orderItemId, file);
      setItems((prev) => prev.filter((i) => i.key !== key)); // the queued line below covers it
      return true;
    }
    update(key, { state: "uploading", progress: 0, error: undefined });
    const res = await uploadFileToStorage(orderItemId, file, (progress) => update(key, { progress }));
    if (res.ok) {
      update(key, { state: "done", progress: 1 });
      return true;
    }
    // Connectivity dropped mid-upload (still offline after the attempt) —
    // queue it. Otherwise it's a genuine error (bad file, server rejection)
    // and should surface, not silently retry forever.
    if (!navigator.onLine) {
      await enqueueUpload(orderItemId, file);
      setItems((prev) => prev.filter((i) => i.key !== key));
      return true;
    }
    update(key, { state: "failed", error: res.error });
    return false;
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const added = Array.from(files).map((file) => ({ key: `${uploadKey(file)}-${Date.now()}`, file, state: "uploading" as const, progress: 0 }));
    setItems((prev) => [...prev, ...added]);
    setStatus(null);
    startTransition(async () => {
      for (const { key, file } of added) await uploadOne(key, file);
      onUploaded?.();
    });
  }

  function handleRetry(key: string) {
    const item = items.find((i) => i.key === key);
    if (!item) return;
    startTransition(async () => {
      if (await uploadOne(key, item.file)) onUploaded?.();
    });
  }

  function handleAddLink() {
    const trimmed = link.trim();
    if (!trimmed) return;
    setStatus(null);
    startTransition(async () => {
      const res = await addMediaLink(orderItemId, trimmed);
      if (!res.ok) {
        setStatus(res.error);
        return;
      }
      setLink("");
      setLinkOpen(false);
      setStatus("Link added.");
      onUploaded?.();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <UploadRow
        label="Add photos"
        hint="Photos or PDFs, uploaded straight to this item — or drop them here"
        accept="image/*,application/pdf"
        multiple
        disabled={pending}
        onFiles={handleFiles}
      />
      <UploadThumbs items={items} onRetry={pending ? undefined : handleRetry} />

      <button
        type="button"
        className="inline-flex min-h-11 w-fit items-center rounded-[var(--radius)] border border-border px-3 text-xs"
        disabled={pending}
        onClick={() => setLinkOpen((v) => !v)}
      >
        Add link instead
      </button>

      {linkOpen ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Paste a link (Drive, Dropbox, etc.)"
            className="min-h-11 min-w-0 flex-1 rounded-[var(--radius)] border border-border bg-surface px-3 text-xs outline-none focus:border-brand-300"
            disabled={pending}
          />
          <Button
            type="button"
            variant="secondary"
            className="text-xs"
            loading={pending} disabled={pending || !link.trim()}
            onClick={handleAddLink}
          >
            Add
          </Button>
        </div>
      ) : null}

      {status ? <span className="text-xs text-muted">{status}</span> : null}
      {pendingUploads > 0 ? (
        <span className="text-xs text-[var(--urgent)]">
          {pendingUploads} upload{pendingUploads === 1 ? "" : "s"} queued — sends automatically when back online.
        </span>
      ) : null}
    </div>
  );
}
