"use client";

import { useRef, useState, useTransition } from "react";

import { uploadFileToCloudinary } from "@/lib/cloudinary/upload-client";

// Lets a signed-in user (dashboard order entry, worker, or designer) attach
// more photos to an existing order item after the fact — reuses the same
// direct-to-Cloudinary upload path as order entry, so a failed upload there
// isn't a dead end.
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

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setStatus(null);
    startTransition(async () => {
      let failed = 0;
      for (const file of list) {
        const res = await uploadFileToCloudinary(orderItemId, file);
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

  return (
    <div className="flex flex-col gap-1">
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
      {status ? <span className="text-xs text-muted">{status}</span> : null}
    </div>
  );
}
