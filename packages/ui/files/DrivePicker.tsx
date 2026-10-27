"use client";

import { useEffect, useState } from "react";

import { Button } from "@repo/ui/Button";
import { FormSheet } from "@repo/ui/FormSheet";
import { CheckCircleIcon, CloseIcon, DocumentIcon } from "@repo/ui/media/icons";
import { drivePickerFolder, type DrivePickerFolder } from "@repo/lib/files/actions";

import { FolderArt } from "./FolderArt";

/** A file picked from the Drive, waiting to be copied onto an order (copyDriveFileToItem). */
export type DrivePick = DrivePickerFolder["files"][number];

// "From my Drive" on the order form: the studio's own Drive, a folder at a
// time, to tick photos and PDFs (or all of a folder's) and add them to an
// item. Nothing is copied here: the order form copies them, server to server,
// once the order is placed.
export function DrivePicker({ picked, onAdd }: { picked: DrivePick[]; onAdd: (files: DrivePick[]) => void }) {
  const [open, setOpen] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [listing, setListing] = useState<DrivePickerFolder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Map<string, DrivePick>>(new Map());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    drivePickerFolder(folderId).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setListing(res.data);
        setError(null);
      } else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [open, folderId]);

  const already = new Set(picked.map((f) => f.id));
  const here = (listing?.files ?? []).filter((f) => !already.has(f.id));
  const allHereChosen = here.length > 0 && here.every((f) => chosen.has(f.id));

  function go(id: string | null) {
    setListing(null);
    setFolderId(id);
  }

  function toggle(file: DrivePick) {
    const next = new Map(chosen);
    if (next.has(file.id)) next.delete(file.id);
    else next.set(file.id, file);
    setChosen(next);
  }

  function toggleAll() {
    const next = new Map(chosen);
    for (const f of here) {
      if (allHereChosen) next.delete(f.id);
      else next.set(f.id, f);
    }
    setChosen(next);
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
          <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Folder">
            <button type="button" className="font-semibold text-brand-600 hover:underline" onClick={() => go(null)}>
              My Drive
            </button>
            {listing?.path.map((f) => (
              <span key={f.id} className="flex items-center gap-1">
                <span className="text-muted">›</span>
                <button type="button" className="font-semibold text-brand-600 hover:underline" onClick={() => go(f.id)}>
                  {f.name}
                </button>
              </span>
            ))}
          </nav>

          {error ? <p className="text-sm text-error-600">{error}</p> : null}
          {!listing && !error ? <p className="text-sm text-muted">Loading…</p> : null}

          {listing ? (
            <>
              {listing.folders.length ? (
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {listing.folders.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => go(f.id)}
                        className="flex w-full items-center gap-2 rounded-xl border border-border p-2 text-left text-sm hover:bg-background"
                      >
                        <FolderArt className="h-7 w-8 shrink-0" />
                        <span className="min-w-0 truncate font-medium">{f.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {here.length ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted">Tap photos to choose them.</p>
                  <Button type="button" size="sm" variant="secondary" onClick={toggleAll}>
                    {allHereChosen ? "Clear this folder" : `Select all ${here.length}`}
                  </Button>
                </div>
              ) : null}

              {listing.files.length ? (
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                  {listing.files.map((f) => {
                    const added = already.has(f.id);
                    const on = added || chosen.has(f.id);
                    return (
                      <li key={f.id}>
                        <button
                          type="button"
                          disabled={added}
                          onClick={() => toggle(f)}
                          aria-pressed={on}
                          title={added ? `${f.name} (already added)` : f.name}
                          className={`relative block aspect-square w-full overflow-hidden rounded-lg border-2 bg-background ${on ? "border-brand-500" : "border-transparent"} disabled:opacity-60`}
                        >
                          <Preview file={f} />
                          {on ? <CheckCircleIcon className="absolute right-1 top-1 h-6 w-6 rounded-full bg-white text-brand-600" /> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : !listing.folders.length ? (
                <p className="text-sm text-muted">No photos or PDFs in this folder.</p>
              ) : null}
            </>
          ) : null}

          <div className="sticky bottom-0 flex gap-2 border-t border-border bg-surface pt-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={close}>
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={chosen.size === 0}
              onClick={() => {
                onAdd([...chosen.values()]);
                close();
              }}
            >
              {chosen.size ? `Add ${chosen.size}` : "Add"}
            </Button>
          </div>
        </div>
      </FormSheet>
    </>
  );
}

function Preview({ file }: { file: DrivePick }) {
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
      <p className="mb-1 text-xs text-muted">
        {files.length} from your Drive, copied once the order is placed
      </p>
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
