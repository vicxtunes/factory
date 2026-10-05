"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { ActionMenu, type ActionMenuEntry } from "@repo/ui/ActionMenu";
import { Spinner } from "@repo/ui/Spinner";

import { getCurrentActor } from "@repo/lib/notes/actions";
import { deleteOrderItemMedia, markMediaDownloaded, updateMediaLink } from "@repo/lib/storage/actions";
import { replaceFileInStorage } from "@repo/lib/storage/upload-client";
import type { OrderItemMedia } from "@repo/lib/types";

import { CheckCircleIcon, CloseIcon, DocumentIcon, DownloadIcon, ExternalIcon, LinkIcon } from "./icons";

// Chromium-only File System Access API — feature-detected. Where it's not
// available (Firefox/Safari) downloads still work, just via the browser's
// normal silent-save-to-Downloads behavior rather than a folder prompt.
declare global {
  interface Window {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<{
      createWritable: () => Promise<{
        write: (data: Blob) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  }
}

function filenameFromContentDisposition(header: string | null, fallback: string): string {
  const match = header?.match(/filename="?([^"]+)"?/);
  return match?.[1] ?? fallback;
}

// Fetches the file ourselves (rather than a plain <a href> navigation) so we
// can prompt "Save As" via the File System Access API when the browser
// supports it — a plain download link always saves silently to the default
// Downloads folder with no way for a site to ask for a location. Resolves
// false when the person cancelled the Save As picker.
async function downloadWithPicker(
  url: string,
  fallbackName: string,
  fileType?: { description: string; accept: Record<string, string[]> },
): Promise<boolean> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Download failed.");
  const filename = filenameFromContentDisposition(res.headers.get("Content-Disposition"), fallbackName);
  const blob = await res.blob();

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: fileType ? [fileType] : undefined,
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return false; // user cancelled the picker
      // Fall through to the plain-link fallback below on any other failure.
    }
  }

  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
  return true;
}

const IMAGE_EXTENSION = /\.(jpe?g|png|gif|webp|bmp|svg)(\?.*)?$/i;

function isImage(url: string, mimeType?: string | null): boolean {
  if (mimeType) return mimeType.startsWith("image/");
  return IMAGE_EXTENSION.test(url);
}

// Cloudinary thumbnails: insert a resize transformation right after
// "/upload/" in the delivery URL — much cheaper than fetching the
// full-resolution asset just to render a small preview tile. Only valid for
// Cloudinary-era rows (cloudinary_public_id set) — Supabase Storage has no
// equivalent on-the-fly transform, so those rows just render the full image
// CSS-sized into the tile.
function cloudinaryThumbUrl(url: string): string {
  const marker = "/upload/";
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  return `${url.slice(0, idx + marker.length)}w_200,h_200,c_fill,q_auto,f_auto/${url.slice(idx + marker.length)}`;
}

// The fl_attachment value below is embedded inside a Cloudinary
// transformation *component* of the URL path, so it can't contain "/"
// (path/component separator — breaks even percent-encoded, since Cloudinary
// decodes then re-splits), "." (Cloudinary docs: omit the extension, it
// reattaches the real one itself — any dot after it is parsed as another,
// invalid flag), or "," "(" ")" (chained-transformation/parameter
// separators). Strip to a bare extensionless base name so any real-world
// filename (which almost always has a folder-ish public_id or a ".jpg")
// survives instead of 400ing.
function sanitizeCloudinaryAttachmentName(name: string): string {
  const base = name.split("/").pop() || name;
  const withoutExtension = base.replace(/\.[^./]+$/, "");
  const safe = withoutExtension.replace(/[,:().]/g, "_").trim();
  return safe || "download";
}

// Forces a real file download (with the original filename) instead of the
// browser just navigating to the asset — Cloudinary's fl_attachment flag
// sets Content-Disposition: attachment on delivery, and reattaches the
// asset's real extension on its own.
function cloudinaryDownloadUrl(url: string, name: string): string {
  const marker = "/upload/";
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const safeName = sanitizeCloudinaryAttachmentName(name);
  return `${url.slice(0, idx + marker.length)}fl_attachment:${encodeURIComponent(safeName)}/${url.slice(idx + marker.length)}`;
}

// Supabase Storage's public-URL endpoint honors a plain ?download= query
// param (sets Content-Disposition: attachment server-side) — the stored
// secure_url carries no existing query string, so this is a safe append.
function storageDownloadUrl(url: string, name: string): string {
  return `${url}?download=${encodeURIComponent(name)}`;
}

// Picks the right thumbnail/download URL strategy per row's backend.
// Pasted links (Drive/Dropbox/etc., neither field set) fall back to the
// plain stored URL — no forced download available for an arbitrary
// third-party host, same as before.
function resolveThumbUrl(file: OrderItemMedia): string {
  if (file.cloudinary_public_id) return cloudinaryThumbUrl(file.secure_url);
  return file.secure_url;
}

function resolveDownloadUrl(file: OrderItemMedia): string {
  if (file.cloudinary_public_id) return cloudinaryDownloadUrl(file.secure_url, file.file_name);
  if (file.storage_path) return storageDownloadUrl(file.secure_url, file.file_name);
  return file.secure_url;
}

// A batch of early Cloudinary-era uploads stored the full folder-qualified
// public_id (e.g. "orders/2026-0001/Normal Board/xyz") in file_name instead
// of a plain filename, due to a since-fixed bug in the (now removed)
// Cloudinary upload code — there's no DB backfill for those rows, so fall
// back to deriving a clean name from the delivery URL's last path segment
// (which always carries the real filename + extension) whenever file_name
// still looks like a path.
function resolveDisplayName(file: OrderItemMedia): string {
  if (!file.file_name.includes("/")) return file.file_name;
  try {
    const path = new URL(file.secure_url).pathname;
    return decodeURIComponent(path.slice(path.lastIndexOf("/") + 1)) || file.file_name;
  } catch {
    return file.file_name;
  }
}

// A row with neither backend field set is a pasted third-party link (Drive,
// Dropbox, a webpage, ...), not a file we uploaded ourselves — there's no
// guarantee its bytes are even fetchable cross-origin, so it must not go
// through downloadWithPicker. It should just open like a normal link.
function isPastedLink(file: OrderItemMedia): boolean {
  return !file.storage_path && !file.cloudinary_public_id;
}

type Preview = { url: string; name: string; downloadHref: string; onSaved?: () => void };

/** Whether staff have downloaded a file yet (only where downloads are tracked). */
type DownloadState = { at: string; by: string | null } | null;

function formatDownloadedAt(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`;
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toUpperCase().slice(0, 4) : "FILE";
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

/** Runs a download and reports back; `busy` drives the tile's spinner. */
function useDownload(href: string, name: string, onSaved?: () => void) {
  const [busy, setBusy] = useState(false);
  async function start() {
    if (busy) return;
    setBusy(true);
    try {
      if (await downloadWithPicker(href, name)) onSaved?.();
    } catch {
      // best-effort: the tile stays pending, so it's clear it didn't save
    } finally {
      setBusy(false);
    }
  }
  return { busy, start };
}

// "Replace" for an uploaded file re-runs the same signed-upload flow and
// swaps the file at this row's existing id; for a pasted link it's a quick
// inline URL edit. "Delete" removes the row (and the Storage object, if
// any). Only the person who added this file — or the boss — can do either;
// the server enforces this too (see canManageMedia in packages/lib/storage/actions),
// this is just the matching UI gate so the menu doesn't even appear when
// it'd be refused.
function useMediaActions(file: OrderItemMedia, editable: boolean, onChanged?: () => void) {
  const [busy, setBusy] = useState(false);
  const [editingLink, setEditingLink] = useState(false);
  const [linkValue, setLinkValue] = useState(file.secure_url);
  const [error, setError] = useState<string | null>(null);
  const [actor, setActor] = useState<{ type: string; id: string; role?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isLink = isPastedLink(file);

  useEffect(() => {
    if (editable) getCurrentActor().then(setActor);
  }, [editable]);

  const canManage =
    !!actor &&
    (actor.role === "boss" || (file.uploaded_by_type === actor.type && file.uploaded_by_id === actor.id));

  async function handleDelete() {
    if (!window.confirm(`Remove "${resolveDisplayName(file)}"?`)) return;
    setBusy(true);
    setError(null);
    const res = await deleteOrderItemMedia(file.id);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onChanged?.();
  }

  async function handleReplaceFile(f: File) {
    setBusy(true);
    setError(null);
    const res = await replaceFileInStorage(file.id, file.order_item_id, f);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onChanged?.();
  }

  async function saveLink() {
    setBusy(true);
    setError(null);
    const res = await updateMediaLink(file.id, linkValue);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setEditingLink(false);
    onChanged?.();
  }

  const menu: ActionMenuEntry[] = canManage
    ? [
        {
          label: isLink ? "Change link" : "Replace file",
          disabled: busy,
          onSelect: () => {
            if (isLink) {
              setLinkValue(file.secure_url);
              setEditingLink(true);
            } else {
              fileInputRef.current?.click();
            }
          },
        },
        { label: "Delete", disabled: busy, onSelect: handleDelete },
      ]
    : [];

  const extras: ReactNode = (
    <>
      {canManage && !isLink ? (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleReplaceFile(f);
            e.target.value = "";
          }}
        />
      ) : null}
      {editingLink ? (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          <input
            type="url"
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1"
          />
          <button type="button" disabled={busy} onClick={saveLink} className="font-medium text-brand-600">
            Save
          </button>
          <button type="button" onClick={() => setEditingLink(false)} className="text-muted">
            Cancel
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-1 text-xs text-[var(--rush)]">{error}</p> : null}
    </>
  );

  return { menu, busy, extras };
}

const OVERLAY_BUTTON =
  "inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition hover:bg-black/65 focus-visible:outline-2 focus-visible:outline-white";

// One file on an order item, as a square tile. Where downloads are tracked
// (staff), a photo stays blurred behind a download button until someone
// downloads it — nobody sees or prints it by accident — then shows clear
// with who downloaded it and when.
function MediaTile({
  file,
  tracked,
  state,
  editable,
  onSaved,
  onOpen,
  onChanged,
}: {
  file: OrderItemMedia;
  tracked: boolean;
  state: DownloadState;
  editable: boolean;
  onSaved?: () => void;
  onOpen: () => void;
  onChanged?: () => void;
}) {
  const name = resolveDisplayName(file);
  const link = isPastedLink(file);
  const image = !link && isImage(file.secure_url, file.mime_type);
  const pending = tracked && !state;
  const download = useDownload(resolveDownloadUrl(file), name, onSaved);
  const actions = useMediaActions(file, editable, onChanged);
  const working = download.busy || actions.busy;
  const title = [name, file.uploaded_by_name ? `Added by ${file.uploaded_by_name}` : null].filter(Boolean).join(" · ");

  let body: ReactNode;
  if (link) {
    body = (
      <a
        href={file.secure_url}
        target="_blank"
        rel="noopener noreferrer"
        title={file.secure_url}
        className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-background px-2 text-center text-muted hover:text-foreground"
      >
        <LinkIcon className="h-6 w-6" />
        <span className="w-full truncate text-[11px] font-medium">{hostOf(file.secure_url)}</span>
        <span className="inline-flex items-center gap-1 text-[10px] text-brand-600">
          Open <ExternalIcon className="h-3 w-3" />
        </span>
      </a>
    );
  } else if (pending) {
    body = (
      <button
        type="button"
        onClick={download.start}
        disabled={working}
        aria-label={`Download ${name}`}
        className="group/pending relative flex h-full w-full items-center justify-center overflow-hidden bg-gray-900"
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary remote hosts (Cloudinary/Supabase Storage), can't be allowlisted for next/image
          <img
            src={resolveThumbUrl(file)}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full scale-125 object-cover blur-xl brightness-75"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center bg-background text-muted/40">
            <DocumentIcon className="h-12 w-12" />
          </span>
        )}
        <span className="relative flex flex-col items-center gap-1.5">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-900 shadow-lg transition group-hover/pending:scale-105">
            {download.busy ? <Spinner className="h-4 w-4" /> : <DownloadIcon className="h-5 w-5" />}
          </span>
          <span className={`text-[11px] font-medium ${image ? "text-white" : "text-foreground"}`}>
            {download.busy ? "Downloading…" : image ? "Download" : fileExtension(name)}
          </span>
        </span>
      </button>
    );
  } else if (image) {
    body = (
      <button type="button" onClick={onOpen} aria-label={`View ${name}`} className="block h-full w-full">
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary remote hosts (Cloudinary/Supabase Storage/pasted links), can't be allowlisted for next/image */}
        <img src={resolveThumbUrl(file)} alt={name} loading="lazy" className="h-full w-full object-cover" />
      </button>
    );
  } else {
    body = (
      <button
        type="button"
        onClick={download.start}
        disabled={working}
        aria-label={`Download ${name}`}
        className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-background px-2 text-muted hover:text-foreground"
      >
        {download.busy ? <Spinner className="h-6 w-6" /> : <DocumentIcon className="h-7 w-7" />}
        <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-semibold tracking-wide">{fileExtension(name)}</span>
        <span className="w-full truncate text-center text-[11px]">{name}</span>
      </button>
    );
  }

  return (
    <div className="min-w-0">
      {/* The tile itself doesn't clip (so the ⋯ menu can open over its
          neighbours); the picture layer inside it does. focus-within lifts
          the tile above the next ones while its menu is open. */}
      <div title={title} className="group relative aspect-square rounded-xl shadow-theme-xs focus-within:z-20">
        <div className="absolute inset-0 overflow-hidden rounded-xl border border-border bg-background">
          {body}

          {/* Downloaded: who and when, on a soft shade along the bottom. */}
          {tracked && state ? (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-5 text-[10px] text-white"
              title={`Downloaded ${new Date(state.at).toLocaleString()}`}
            >
              <CheckCircleIcon className="h-3.5 w-3.5 shrink-0 text-success-400" />
              <span className="truncate">
                {state.by ? `${state.by} · ` : ""}
                {formatDownloadedAt(state.at)}
              </span>
            </div>
          ) : null}
          {actions.busy ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
              <Spinner className="h-5 w-5" />
            </div>
          ) : null}
        </div>

        {/* Top-right controls: a quick download on viewable tiles, and the ⋯ menu. */}
        <div className="absolute right-1.5 top-1.5 z-10 flex gap-1 opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
          {!link && !pending && image ? (
            <button
              type="button"
              onClick={download.start}
              disabled={working}
              aria-label={`Download ${name}`}
              title="Download"
              className={OVERLAY_BUTTON}
            >
              {download.busy ? <Spinner className="h-3.5 w-3.5" /> : <DownloadIcon className="h-4 w-4" />}
            </button>
          ) : null}
          {editable && actions.menu.length > 0 ? (
            <ActionMenu
              label={`Actions for ${name}`}
              focusKey={file.id}
              items={actions.menu}
              triggerClassName={OVERLAY_BUTTON}
            />
          ) : null}
        </div>
      </div>
      {editable ? actions.extras : null}
    </div>
  );
}

// The zip of an item's files (all of them, or only `ids`). Fetched by hand
// (see downloadWithPicker) so Chromium can offer Save As for the zip too.
function ZipButton({
  orderItemId,
  label,
  ids,
  primary,
  onSaved,
}: {
  orderItemId: string;
  label: string;
  /** Zip only these files; all of the item's files when omitted. */
  ids?: string[];
  primary?: boolean;
  onSaved?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const query = ids ? `?ids=${ids.join(",")}` : "";
      const saved = await downloadWithPicker(`/api/order-items/${orderItemId}/media-zip${query}`, "media.zip", {
        description: "Zip archive",
        accept: { "application/zip": [".zip"] },
      });
      if (saved) onSaved?.();
    } catch {
      setError("Couldn't make the zip. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition disabled:opacity-60 ${
          primary
            ? "bg-brand-500 text-white shadow-theme-xs hover:bg-brand-600"
            : "border border-border bg-surface text-foreground hover:bg-background"
        }`}
      >
        {busy ? <Spinner className="h-3.5 w-3.5" /> : <DownloadIcon className="h-4 w-4" />}
        {busy ? "Preparing zip…" : label}
      </button>
      {error ? <span className="text-xs text-[var(--rush)]">{error}</span> : null}
    </span>
  );
}

function Lightbox({ preview, onClose }: { preview: Preview; onClose: () => void }) {
  const download = useDownload(preview.downloadHref, preview.name, preview.onSaved);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const barButton =
    "inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-medium text-white backdrop-blur hover:bg-white/20 disabled:opacity-60";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={onClose} role="dialog" aria-modal aria-label={preview.name}>
      <div className="flex items-center gap-2 px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">{preview.name}</p>
        <button type="button" onClick={download.start} disabled={download.busy} className={barButton}>
          {download.busy ? <Spinner className="h-3.5 w-3.5" /> : <DownloadIcon className="h-4 w-4" />}
          <span className="hidden sm:inline">{download.busy ? "Downloading…" : "Download"}</span>
        </button>
        <a href={preview.url} target="_blank" rel="noopener noreferrer" className={barButton}>
          <ExternalIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Original</span>
        </a>
        <button type="button" onClick={onClose} aria-label="Close" className={barButton}>
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4 pt-0">
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary remote hosts, can't be allowlisted for next/image */}
        <img
          src={preview.url}
          alt={preview.name}
          className="max-h-full max-w-full rounded-lg object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}

// Renders an item's uploaded files as a grid of tiles and falls back to the
// legacy pasted media_link (item-level, then order-level) for orders created
// before this feature existed, so old rows keep working with no data
// migration. Uploaded rows may come from either backend the app has used
// over time (Cloudinary or Supabase Storage, distinguished by which of
// cloudinary_public_id/storage_path is set) or be a plain pasted link
// (neither set) — resolveThumbUrl/resolveDownloadUrl pick the right URL
// strategy per row.
export function MediaLinks({
  media,
  legacyLink,
  editable = false,
  trackDownloads = false,
  onChanged,
}: {
  media: OrderItemMedia[];
  legacyLink?: string | null;
  editable?: boolean;
  /**
   * Staff screens: photos stay blurred until someone downloads them, and each
   * file shows who downloaded it and when (for printing). Viewing never counts.
   */
  trackDownloads?: boolean;
  onChanged?: () => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  // Downloads made on this screen, shown at once instead of waiting for a refetch.
  const [saved, setSaved] = useState<Record<string, { at: string; by: string }>>({});

  const downloadState = (file: OrderItemMedia): DownloadState =>
    saved[file.id] ?? (file.downloaded_at ? { at: file.downloaded_at, by: file.downloaded_by_name } : null);

  async function recordDownload(ids: string[]) {
    if (!trackDownloads || ids.length === 0) return;
    const res = await markMediaDownloaded(media[0].order_item_id, ids);
    if (!res.ok) return; // e.g. a client's own download: nothing to show
    setSaved((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, { at: res.at, by: res.by }])) }));
    onChanged?.();
  }

  let content: ReactNode = null;

  if (media.length > 0) {
    const files = media.filter((file) => !isPastedLink(file));
    const pending = trackDownloads ? files.filter((file) => !downloadState(file)) : [];
    const done = files.length - pending.length;
    const showHeader = (trackDownloads && files.length > 0) || files.length > 1;

    content = (
      <div className="space-y-3">
        {showHeader ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {trackDownloads && files.length > 0 ? (
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  {pending.length === 0 ? (
                    <>
                      <CheckCircleIcon className="h-4 w-4 text-success-500" /> All {files.length} downloaded
                    </>
                  ) : (
                    <>
                      {done} of {files.length} downloaded
                      <span className="font-normal text-muted">· {pending.length} pending</span>
                    </>
                  )}
                </p>
                <div className="mt-1.5 h-1 w-40 overflow-hidden rounded-full bg-border">
                  <div
                    className={`h-full rounded-full transition-[width] ${pending.length === 0 ? "bg-success-500" : "bg-brand-500"}`}
                    style={{ width: `${(done / files.length) * 100}%` }}
                  />
                </div>
              </div>
            ) : (
              <span />
            )}
            <div className="flex flex-wrap gap-2">
              {pending.length > 0 && done > 0 ? (
                <ZipButton
                  orderItemId={media[0].order_item_id}
                  label={`Download ${pending.length} pending`}
                  ids={pending.map((file) => file.id)}
                  primary
                  onSaved={() => recordDownload(pending.map((file) => file.id))}
                />
              ) : null}
              {files.length > 1 ? (
                <ZipButton
                  orderItemId={media[0].order_item_id}
                  label={`Download all ${files.length}`}
                  primary={trackDownloads && done === 0}
                  onSaved={() => recordDownload(files.map((file) => file.id))}
                />
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2.5">
          {media.map((file) => {
            const tracked = trackDownloads && !isPastedLink(file);
            const onSaved = tracked ? () => recordDownload([file.id]) : undefined;
            return (
              <MediaTile
                key={file.id}
                file={file}
                tracked={tracked}
                state={tracked ? downloadState(file) : null}
                editable={editable}
                onSaved={onSaved}
                onChanged={onChanged}
                onOpen={() =>
                  setPreview({
                    url: file.secure_url,
                    name: resolveDisplayName(file),
                    downloadHref: resolveDownloadUrl(file),
                    onSaved,
                  })
                }
              />
            );
          })}
        </div>
      </div>
    );
  } else if (legacyLink) {
    content = isImage(legacyLink) ? (
      <button
        type="button"
        onClick={() => setPreview({ url: legacyLink, name: "Photo", downloadHref: legacyLink })}
        className="block h-28 w-28 overflow-hidden rounded-xl border border-border shadow-theme-xs"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary remote hosts, can't be allowlisted for next/image */}
        <img src={legacyLink} alt="Photo" loading="lazy" className="h-full w-full object-cover" />
      </button>
    ) : (
      <a
        href={legacyLink}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium hover:bg-background"
      >
        <LinkIcon className="h-4 w-4" /> View photos
        <ExternalIcon className="h-3.5 w-3.5 text-muted" />
      </a>
    );
  }

  if (!content) return null;

  return (
    <>
      {content}
      {preview ? <Lightbox preview={preview} onClose={() => setPreview(null)} /> : null}
    </>
  );
}
