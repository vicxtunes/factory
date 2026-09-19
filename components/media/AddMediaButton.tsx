"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { UploadRow } from "@/components/ui/UploadRow";
import { addMediaLink } from "@/lib/storage/actions";
import { uploadFileToStorage } from "@/lib/storage/upload-client";
import { enqueueUpload, pendingUploadsFor, QUEUE_CHANGED_EVENT } from "@/lib/offline-queue/enqueue";

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

  useEffect(() => {
    const refresh = () => pendingUploadsFor(orderItemId).then(setPendingUploads);
    refresh();
    window.addEventListener(QUEUE_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(QUEUE_CHANGED_EVENT, refresh);
  }, [orderItemId]);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setStatus(null);
    startTransition(async () => {
      let failed = 0;
      let queued = 0;
      for (const file of list) {
        // Skip the request entirely when we already know we're offline —
        // avoids a doomed round trip before falling back to the queue.
        if (!navigator.onLine) {
          await enqueueUpload(orderItemId, file);
          queued += 1;
          continue;
        }
        const res = await uploadFileToStorage(orderItemId, file);
        if (!res.ok) {
          // Connectivity dropped mid-upload (still offline after the
          // attempt) — queue it. Otherwise it's a genuine error (bad file,
          // server rejection) and should surface, not silently retry forever.
          if (!navigator.onLine) {
            await enqueueUpload(orderItemId, file);
            queued += 1;
          } else {
            failed += 1;
            setStatus(res.error);
          }
        }
      }
      if (queued > 0) setStatus(`Queued ${queued} file(s) — will upload when back online.`);
      else if (failed === 0) setStatus(`Uploaded ${list.length} file(s).`);
      onUploaded?.();
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
            disabled={pending || !link.trim()}
            onClick={handleAddLink}
          >
            Add
          </Button>
        </div>
      ) : null}

      {pending ? (
        <span className="text-xs text-muted">Uploading…</span>
      ) : status ? (
        <span className="text-xs text-muted">{status}</span>
      ) : null}
      {pendingUploads > 0 ? (
        <span className="text-xs text-[var(--urgent)]">
          {pendingUploads} upload{pendingUploads === 1 ? "" : "s"} queued — sends automatically when back online.
        </span>
      ) : null}
    </div>
  );
}
