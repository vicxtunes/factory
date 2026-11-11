"use client";

import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { UploadRow } from "@repo/ui/UploadRow";
import { UploadThumbs, type UploadThumb } from "@repo/ui/UploadThumbs";
import { addMediaLink } from "@repo/lib/storage/actions";
import { retryUploads, startUploads, useUploads, whenUploaded } from "@repo/ui/transfers/store";

// Lets a signed-in user (dashboard order entry, worker, or designer) attach
// more photos — or paste a link (Drive, Dropbox, WeTransfer, etc.) — to an
// existing order item after the fact. The files upload in the background
// (packages/ui/transfers): the person can close this and carry on; the
// transfers panel follows them, and they're kept on the device until they're in.
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
  const jobs = useUploads((t) => t.kind === "order-item" && t.orderItemId === orderItemId);
  const items: UploadThumb[] = jobs.map((j) => ({
    key: j.id,
    file: j.file,
    state: j.state === "done" ? "done" : j.state === "failed" || j.state === "paused" ? "failed" : "uploading",
    progress: j.progress,
    error: j.note,
  }));
  const waiting = jobs.filter((j) => j.state === "failed" && j.retryable).length;

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setStatus(null);
    const ids = startUploads(Array.from(files).map((file) => ({ file, target: { kind: "order-item", orderItemId }, where: "Order item" })));
    void whenUploaded(ids).then(({ done }) => done && onUploaded?.());
  }

  function handleRetry(key: string) {
    retryUploads(false, [key]);
    void whenUploaded([key]).then(({ done }) => done && onUploaded?.());
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
      <UploadThumbs items={items} onRetry={handleRetry} />

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
      {waiting > 0 ? (
        <span className="text-xs text-[var(--urgent)]">
          {waiting} upload{waiting === 1 ? "" : "s"} waiting for the connection — they go again by themselves when it&apos;s back.
        </span>
      ) : null}
    </div>
  );
}
