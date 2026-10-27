"use client";

import { useEffect, useState } from "react";

import { Button } from "@repo/ui/Button";
import { FormSheet } from "@repo/ui/FormSheet";
import { DocumentIcon, CloseIcon } from "@repo/ui/media/icons";
import { drivePickerFolder, drivePickerFolderFiles } from "@repo/lib/files/actions";
import type { FileView, Folder, FolderListing } from "@repo/lib/files/core";

import { FileBrowser } from "./FileBrowser";
import { FolderArt } from "./FolderArt";

/**
 * What was picked from the Drive, waiting to be copied onto an order
 * (copyDriveFileToItem): a file, or a whole folder with the photos and PDFs
 * in it (and in the folders inside it) at the time it was added.
 */
export type DrivePick =
  | { kind: "file"; id: string; name: string; thumbUrl: string | null }
  | { kind: "folder"; id: string; name: string; files: { id: string; name: string }[] };

/** Every file a set of picks stands for, once each. */
export function drivePickFiles(picks: DrivePick[]): { id: string; name: string }[] {
  const all = picks.flatMap((p) => (p.kind === "file" ? [{ id: p.id, name: p.name }] : p.files));
  return [...new Map(all.map((f) => [f.id, f])).values()];
}

const toPick = (f: FileView): DrivePick => ({ kind: "file", id: f.id, name: f.name, thumbUrl: f.thumbUrl });
type Chosen = { kind: "file"; pick: DrivePick } | { kind: "folder"; folder: Folder };

// "From my Drive" on the order form: the studio's own Drive, as the Drive
// screen itself shows it (./FileBrowser.tsx in its pick mode), to tick photos
// and PDFs, or all of a folder's, and add them to an item. Nothing is copied
// here: the order form copies them, server to server, once the order is placed.
export function DrivePicker({ picked, onAdd }: { picked: DrivePick[]; onAdd: (files: DrivePick[]) => void }) {
  const [open, setOpen] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [shown, setShown] = useState<{ listing: FolderListing; scope: { locale: string; timeZone: string } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Map<string, Chosen>>(new Map());
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    drivePickerFolder(folderId).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setShown(res.data);
        setError(null);
      } else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [open, folderId]);

  const already = new Set(picked.map((f) => f.id));
  const here = (shown?.listing.files ?? []).filter((f) => !already.has(f.id));
  const allHereChosen = here.length > 0 && here.every((f) => chosen.has(f.id));

  function toggle(id: string, item: Chosen) {
    if (already.has(id)) return;
    const next = new Map(chosen);
    if (next.has(id)) next.delete(id);
    else next.set(id, item);
    setChosen(next);
  }

  function toggleAll() {
    const next = new Map(chosen);
    for (const f of here) {
      if (allHereChosen) next.delete(f.id);
      else next.set(f.id, { kind: "file", pick: toPick(f) });
    }
    setChosen(next);
  }

  // A ticked folder is opened up on Add: what's in it (and in its folders) then.
  async function add() {
    setAdding(true);
    setError(null);
    const picks: DrivePick[] = [];
    for (const item of chosen.values()) {
      if (item.kind === "file") {
        picks.push(item.pick);
        continue;
      }
      const res = await drivePickerFolderFiles(item.folder.id);
      if (!res.ok) {
        setAdding(false);
        return setError(`${item.folder.name}: ${res.error}`);
      }
      if (res.data.length) picks.push({ kind: "folder", id: item.folder.id, name: item.folder.name, files: res.data });
    }
    setAdding(false);
    if (!picks.length) return setError("There are no photos or PDFs in what you ticked.");
    onAdd(picks);
    close();
  }

  function close() {
    setOpen(false);
    setChosen(new Map());
  }

  return (
    <>
      <Button type="button" variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        From my Drive
      </Button>
      <FormSheet open={open} onClose={close} title="From my Drive" size="lg">
        <div className="space-y-3">
          {here.length ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted">Tap photos to tick them, or tick a whole folder.</p>
              <Button type="button" size="sm" variant="secondary" onClick={toggleAll}>
                {allHereChosen ? "Untick this folder" : `Tick all ${here.length}`}
              </Button>
            </div>
          ) : null}

          {error ? <p className="text-sm text-error-600">{error}</p> : null}
          {shown ? (
            <FileBrowser
              key={shown.listing.folder?.id ?? "top"}
              listing={shown.listing}
              basePath="#"
              scope={shown.scope}
              via={{ as: "studio" }}
              topLabel="My Drive"
              picker={{
                picked: new Set([...already, ...chosen.keys()]),
                onToggle: (file) => toggle(file.id, { kind: "file", pick: toPick(file) }),
                onToggleFolder: (folder) => toggle(folder.id, { kind: "folder", folder }),
                onOpen: (id) => {
                  setShown(null);
                  setFolderId(id);
                },
              }}
            />
          ) : !error ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : null}

          <div className="sticky bottom-0 flex gap-2 border-t border-border bg-surface pt-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={close}>
              Cancel
            </Button>
            <Button type="button" className="flex-1" disabled={chosen.size === 0 || adding} loading={adding} onClick={add}>
              {chosen.size ? `Add ${chosen.size}` : "Add"}
            </Button>
          </div>
        </div>
      </FormSheet>
    </>
  );
}

function Preview({ file }: { file: DrivePick }) {
  if (file.kind === "folder") {
    return (
      <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 p-1">
        <FolderArt className="h-6 w-7" />
        <span className="w-full truncate text-center text-[0.6rem] font-medium">{file.name}</span>
        <span className="text-[0.6rem] text-muted">{file.files.length} files</span>
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed thumbnail from the Drive
  if (file.thumbUrl) return <img src={file.thumbUrl} alt={file.name} loading="lazy" className="h-full w-full object-cover" />;
  return (
    <span className="flex h-full w-full flex-col items-center justify-center gap-1 p-1 text-muted">
      <DocumentIcon className="h-6 w-6" />
      <span className="w-full truncate text-center text-[0.6rem]">{file.name}</span>
    </span>
  );
}

/** The files picked from the Drive for one item, each with × to take it off again. */
export function DrivePicks({ files, onRemove }: { files: DrivePick[]; onRemove: (id: string) => void }) {
  if (!files.length) return null;
  return (
    <div>
      <p className="mb-1 text-xs text-muted">{drivePickFiles(files).length} from your Drive, copied once the order is placed</p>
      <ul className="flex flex-wrap gap-2">
        {files.map((f) => (
          <li key={f.id} className="relative h-16 w-16 overflow-hidden rounded-lg border border-border bg-background">
            <Preview file={f} />
            <button
              type="button"
              aria-label={`Remove ${f.name}`}
              onClick={() => onRemove(f.id)}
              className="absolute right-0.5 top-0.5 rounded-full bg-gray-950/70 p-0.5 text-white"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
