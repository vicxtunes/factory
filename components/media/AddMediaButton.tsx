"use client";

import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { addMediaLink } from "@/lib/storage/actions";
import { uploadFileToStorage } from "@/lib/storage/upload-client";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setStatus(null);
    startTransition(async () => {
      let failed = 0;
      for (const file of list) {
        const res = await uploadFileToStorage(orderItemId, file);
        if (!res.ok) {
          failed += 1;
          setStatus(res.error);
        }
      }
      if (failed === 0) setStatus(`Uploaded ${list.length} file(s).`);
      if (inputRef.current) inputRef.current.value = "";
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
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex min-h-11 w-fit cursor-pointer items-center rounded-[var(--radius)] border border-border px-3 text-xs">
          {pending ? "Uploading…" : "Add photos"}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="hidden"
            disabled={pending}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
        <button
          type="button"
          className="inline-flex min-h-11 w-fit items-center rounded-[var(--radius)] border border-border px-3 text-xs"
          disabled={pending}
          onClick={() => setLinkOpen((v) => !v)}
        >
          Add link
        </button>
      </div>

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

      {status ? <span className="text-xs text-muted">{status}</span> : null}
    </div>
  );
}
