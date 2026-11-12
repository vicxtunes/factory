"use client";

import { useCallback, useEffect, useState } from "react";

import { UploadRow } from "@repo/ui/UploadRow";
import { attachDriveToItem, myOrderItemDrive, myOrderItemDriveFolder } from "@repo/lib/storage/actions";
import { MAX_FILE_BYTES } from "@repo/lib/files/core";
import { uploadToDrive } from "@repo/ui/transfers/store";

import { DrivePicker } from "./DrivePicker";
import { FolderArt } from "./FolderArt";

type Attached = { folders: { id: string; name: string }[]; files: { id: string; name: string }[] };

const VIA = { as: "studio" } as const;

/**
 * A client's order item and their Drive (owner, 2026-11-12): what's attached
 * from it, opening in the Drive, plus picking more from it or uploading big
 * files into the order's own folder there. Uploads go in the background
 * (packages/ui/transfers) and carry on if the connection drops; the factory
 * sees the folder's files as they land.
 */
export function OrderDrive({ itemId }: { itemId: string }) {
  const [attached, setAttached] = useState<Attached | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await myOrderItemDrive(itemId);
    if (res.ok) setAttached(res.data);
    else setError(res.error);
  }, [itemId]);
  useEffect(() => {
    let current = true;
    myOrderItemDrive(itemId).then((res) => {
      if (!current) return;
      if (res.ok) setAttached(res.data);
      else setError(res.error);
    });
    return () => {
      current = false;
    };
  }, [itemId]);

  async function upload(list: FileList) {
    setError(null);
    setNote(null);
    const chosen = Array.from(list);
    const tooBig = chosen.filter((f) => f.size > MAX_FILE_BYTES);
    const files = chosen.filter((f) => f.size <= MAX_FILE_BYTES);
    if (tooBig.length) setError(`${tooBig.map((f) => f.name).join(", ")}: too big. A file can be up to 1 GB.`);
    if (!files.length) return;
    setBusy(true);
    const folder = await myOrderItemDriveFolder(itemId);
    setBusy(false);
    if (!folder.ok) return setError(folder.error);
    uploadToDrive(VIA, folder.data.id, folder.data.name, files);
    setNote(`${files.length} ${files.length === 1 ? "file is" : "files are"} going into “${folder.data.name}” in your Drive. You can leave this page: the uploads panel shows how they're doing.`);
    await load();
  }

  const empty = attached !== null && attached.folders.length === 0 && attached.files.length === 0;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">Big photo sets and videos go best through your Drive: they upload in the background, carry on if the connection drops, and our team sees them as they land.</p>
      {attached === null && !error ? <p className="text-xs text-muted">Loading…</p> : null}
      {empty ? <p className="text-sm text-muted">Nothing from your Drive on this order yet.</p> : null}
      {attached && !empty ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {attached.folders.map((f) => (
            <li key={f.id}>
              <a href={`/drive?folder=${f.id}`} className="flex items-center gap-2 rounded-xl border border-border p-2 hover:bg-brand-50 dark:hover:bg-white/5">
                <FolderArt className="h-8 w-8 shrink-0" />
                <span className="min-w-0 truncate font-medium">{f.name}</span>
              </a>
            </li>
          ))}
          {attached.files.map((f) => (
            <li key={f.id} className="truncate rounded-xl border border-border p-2 text-sm">
              {f.name}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <UploadRow label="Upload to my Drive for this order" hint="Photos, PDFs or videos, up to 1 GB each" accept="image/*,application/pdf,video/*" multiple disabled={busy} onFiles={(list) => void upload(list)} />
        <DrivePicker
          picked={[]}
          onAdd={(picks) => {
            setError(null);
            void attachDriveToItem(itemId, {
              folderIds: picks.flatMap((p) => (p.kind === "folder" ? [p.id] : [])),
              fileIds: picks.flatMap((p) => (p.kind === "file" ? [p.id] : [])),
            }).then((res) => (res.ok ? load() : setError(res.error)));
          }}
        />
      </div>
      {note ? <p className="text-xs text-success-700 dark:text-success-500">{note}</p> : null}
      {error ? <p className="text-xs text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}
