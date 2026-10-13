"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ActionMenu } from "@repo/ui/ActionMenu";
import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { FilesIcon } from "@repo/ui/icons";
import { UploadRow } from "@repo/ui/UploadRow";
import { putSigned } from "@repo/ui/photos/browser";
import {
  confirmFileUpload,
  createFolder,
  deleteFile,
  deleteFolder,
  moveFile,
  moveFolder,
  renameFile,
  renameFolder,
  startFileUpload,
} from "@repo/lib/files/actions";
import { isWithin, MAX_FILE_BYTES, MAX_FILES_PER_BATCH, pathTo, type Folder, type FolderListing } from "@repo/lib/files/core";
import { formatBytes } from "@repo/lib/photos/core";
import { formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

type Item = { kind: "folder" | "file"; id: string; name: string };
/** What a row is doing instead of showing itself: being renamed, or choosing where to go. */
type Editing = (Item & { mode: "rename"; value: string }) | (Item & { mode: "move"; value: string });
type Upload = { name: string; state: "waiting" | "uploading" | "done" | "failed"; progress: number; error?: string };

/** The top's value in the "Move to" list. */
const TOP = "";

function FileGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
      />
    </svg>
  );
}

/** Runs `work` over `items`, `limit` at a time. */
async function pool<T>(items: T[], limit: number, work: (item: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await work(items[i], i);
      }
    }),
  );
}

/**
 * One folder of a business's files: the way back up, its folders and files,
 * a new folder, uploads (straight to storage, then checked by the server
 * against the allowance), and rename, move, delete and download on each row.
 */
export function FileBrowser({ listing, basePath, scope }: { listing: FolderListing; basePath: string; scope: Pick<TenantScope, "locale" | "timeZone"> }) {
  const router = useRouter();
  const here = listing.folder?.id ?? null;
  const [newFolder, setNewFolder] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const href = (folderId: string | null) => (folderId ? `${basePath}?folder=${folderId}` : basePath);

  function run(work: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    start(async () => {
      const res = await work();
      if (!res.ok) return setError(res.error ?? "Something went wrong.");
      after?.();
      router.refresh();
    });
  }

  function remove(item: Item) {
    const question =
      item.kind === "folder" ? `Delete the folder "${item.name}" and everything in it? This can't be undone.` : `Delete "${item.name}"? This can't be undone.`;
    if (!window.confirm(question)) return;
    run(() => (item.kind === "folder" ? deleteFolder(item.id) : deleteFile(item.id)));
  }

  function save(edit: Editing) {
    const done = () => setEditing(null);
    if (edit.mode === "rename") return run(() => (edit.kind === "folder" ? renameFolder(edit.id, edit.value) : renameFile(edit.id, edit.value)), done);
    const to = edit.value === TOP ? null : edit.value;
    run(() => (edit.kind === "folder" ? moveFolder(edit.id, to) : moveFile(edit.id, to)), done);
  }

  /** Where `item` can go: the top and every folder, except where it is and (for a folder) itself and what's in it. */
  function destinations(item: Item): { value: string; label: string }[] {
    const all: { value: string; label: string; id: string | null }[] = [
      { value: TOP, label: "Files (top)", id: null },
      ...listing.allFolders.map((f: Folder) => ({ value: f.id, label: pathTo(listing.allFolders, f.id).map((p) => p.name).join(" / "), id: f.id })),
    ];
    return all.filter((d) => d.id !== here && !(item.kind === "folder" && d.id && isWithin(listing.allFolders, d.id, item.id)));
  }

  async function upload(chosen: File[]) {
    setError(null);
    const tooBig = chosen.filter((f) => f.size > MAX_FILE_BYTES);
    const files = chosen.filter((f) => f.size <= MAX_FILE_BYTES);
    if (tooBig.length) setError(`${tooBig.map((f) => f.name).join(", ")}: too big. A file can be up to ${formatBytes(MAX_FILE_BYTES)}.`);
    if (!files.length) return;
    setUploading(true);
    setUploads(files.map((f) => ({ name: f.name, state: "waiting", progress: 0 })));
    const update = (i: number, patch: Partial<Upload>) => setUploads((u) => u.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    for (let from = 0; from < files.length; from += MAX_FILES_PER_BATCH) {
      const batch = files.slice(from, from + MAX_FILES_PER_BATCH);
      const res = await startFileUpload({ folderId: here, files: batch.map((f) => ({ name: f.name, bytes: f.size, contentType: f.type })) });
      if (!res.ok) {
        setError(res.error);
        batch.forEach((_, k) => update(from + k, { state: "failed", error: "Not uploaded." }));
        break;
      }
      await pool(batch, 3, async (file, k) => {
        const at = from + k;
        update(at, { state: "uploading" });
        try {
          const ticket = res.data[k];
          await putSigned(ticket.url, file, (progress) => update(at, { progress }), ticket.contentType);
          const done = await confirmFileUpload({ folderId: here, fileId: ticket.fileId, name: file.name, contentType: ticket.contentType });
          update(at, done.ok ? { state: "done", progress: 1 } : { state: "failed", error: done.error });
        } catch (err) {
          update(at, { state: "failed", error: err instanceof Error ? err.message : "Upload failed." });
        }
      });
      router.refresh();
    }
    setUploading(false);
  }

  const rows: Item[] = [...listing.folders.map((f) => ({ kind: "folder" as const, id: f.id, name: f.name })), ...listing.files.map((f) => ({ kind: "file" as const, id: f.id, name: f.name }))];
  const fileOf = (id: string) => listing.files.find((f) => f.id === id)!;

  return (
    <div className="space-y-4">
      <nav aria-label="Folder" className="flex flex-wrap items-center gap-1 text-sm">
        {listing.path.length === 0 ? (
          <span className="font-medium">Files</span>
        ) : (
          <Link href={href(null)} className="text-muted hover:underline">
            Files
          </Link>
        )}
        {listing.path.map((f, i) => (
          <span key={f.id} className="flex items-center gap-1">
            <span className="text-muted">/</span>
            {i === listing.path.length - 1 ? (
              <span className="font-medium">{f.name}</span>
            ) : (
              <Link href={href(f.id)} className="text-muted hover:underline">
                {f.name}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
        <UploadRow
          label="Add files"
          hint={`Any file, up to ${formatBytes(MAX_FILE_BYTES)} each, kept as it is — or drop them here`}
          accept="*/*"
          multiple
          disabled={uploading}
          onFiles={(files) => upload([...files])}
        />
        {uploads.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {uploads.map((u, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <span className="truncate">{u.name}</span>
                <span className={`shrink-0 text-xs ${u.state === "failed" ? "text-error-600 dark:text-error-400" : "text-muted"}`}>
                  {u.state === "done" ? "Uploaded" : u.state === "failed" ? (u.error ?? "Failed") : u.state === "waiting" ? "Waiting" : `${Math.round(u.progress * 100)}%`}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => createFolder({ parentId: here, name: newFolder }), () => setNewFolder(""));
          }}
        >
          <div className="min-w-48 flex-1">
            <Field label="New folder">
              <TextInput value={newFolder} onChange={(e) => setNewFolder(e.target.value)} required maxLength={120} placeholder="Contracts" />
            </Field>
          </div>
          <Button type="submit" variant="secondary" loading={pending && !editing} disabled={pending}>
            Create folder
          </Button>
        </form>
      </section>

      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">{here ? "This folder is empty." : "No files yet."}</p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-theme-xs">
          {rows.map((item) => {
            const edit = editing?.kind === item.kind && editing.id === item.id ? editing : null;
            const file = item.kind === "file" ? fileOf(item.id) : null;
            const Glyph = item.kind === "folder" ? FilesIcon : FileGlyph;
            return (
              <li key={`${item.kind}-${item.id}`} className="flex items-center gap-3 p-3">
                <Glyph className="h-5 w-5 shrink-0 text-muted" />
                {edit ? (
                  <form
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      save(edit);
                    }}
                  >
                    {edit.mode === "rename" ? (
                      <TextInput
                        aria-label="Name"
                        value={edit.value}
                        onChange={(e) => setEditing({ ...edit, value: e.target.value })}
                        maxLength={item.kind === "folder" ? 120 : 200}
                        required
                        autoFocus
                        className="min-w-40 flex-1"
                      />
                    ) : (
                      <select
                        aria-label={`Move ${item.name} to`}
                        value={edit.value}
                        onChange={(e) => setEditing({ ...edit, value: e.target.value })}
                        autoFocus
                        className="min-h-10 min-w-40 flex-1 rounded-lg border border-border bg-background px-3 text-sm"
                      >
                        {destinations(item).map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    )}
                    <Button type="submit" className="min-h-8 text-xs" loading={pending} disabled={pending}>
                      {edit.mode === "rename" ? "Save" : "Move"}
                    </Button>
                    <Button type="button" variant="secondary" className="min-h-8 text-xs" onClick={() => setEditing(null)} disabled={pending}>
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      {file ? (
                        <a href={file.downloadUrl} className="block truncate font-medium hover:underline">
                          {item.name}
                        </a>
                      ) : (
                        <Link href={href(item.id)} className="block truncate font-medium hover:underline">
                          {item.name}
                        </Link>
                      )}
                      <p className="text-xs text-muted">{file ? `${formatBytes(file.bytes)} · ${formatDay(scope, file.createdAt)}` : "Folder"}</p>
                    </div>
                    <ActionMenu
                      label={`Actions for ${item.name}`}
                      focusKey={`${item.kind}-${item.id}`}
                      items={[
                        { label: "Rename", onSelect: () => setEditing({ ...item, mode: "rename", value: item.name }) },
                        {
                          label: "Move",
                          disabled: destinations(item).length === 0,
                          onSelect: () => setEditing({ ...item, mode: "move", value: destinations(item)[0]?.value ?? TOP }),
                        },
                        { label: "Delete", onSelect: () => remove(item) },
                      ]}
                    />
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
