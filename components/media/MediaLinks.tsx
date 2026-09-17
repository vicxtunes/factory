"use client";

import { useEffect, useRef, useState } from "react";

import { getCurrentActor } from "@/lib/notes/actions";
import { deleteOrderItemMedia, updateMediaLink } from "@/lib/storage/actions";
import { replaceFileInStorage } from "@/lib/storage/upload-client";
import type { OrderItemMedia } from "@/lib/types";

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
// Downloads folder with no way for a site to ask for a location.
async function downloadWithPicker(
  url: string,
  fallbackName: string,
  fileType?: { description: string; accept: Record<string, string[]> },
): Promise<void> {
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
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return; // user cancelled the picker
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

type Preview = { url: string; name: string; downloadHref: string };

// "Replace" for an uploaded file re-runs the same signed-upload flow and
// swaps the file at this row's existing id; for a pasted link it's a quick
// inline URL edit. "Delete" removes the row (and the Storage object, if
// any). Only the person who added this file — or the boss — can do either;
// the server enforces this too (see canManageMedia in lib/storage/actions),
// this is just the matching UI gate so the buttons don't even appear when
// they'd be refused.
function MediaActions({ file, onChanged }: { file: OrderItemMedia; onChanged?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [editingLink, setEditingLink] = useState(false);
  const [linkValue, setLinkValue] = useState(file.secure_url);
  const [error, setError] = useState<string | null>(null);
  const [actor, setActor] = useState<{ type: string; id: string; role?: string } | null | undefined>(
    undefined,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isLink = isPastedLink(file);

  useEffect(() => {
    getCurrentActor().then(setActor);
  }, []);

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

  if (actor === undefined) return null; // still resolving who's viewing

  if (!canManage) {
    return file.uploaded_by_name ? (
      <p className="mt-1 text-[0.65rem] text-muted">Added by {file.uploaded_by_name}</p>
    ) : null;
  }

  if (editingLink) {
    return (
      <div className="mt-1 flex items-center gap-1 text-[0.65rem]">
        <input
          type="url"
          value={linkValue}
          onChange={(e) => setLinkValue(e.target.value)}
          className="min-w-0 flex-1 rounded border border-border bg-surface px-1.5 py-0.5"
        />
        <button type="button" disabled={busy} onClick={saveLink} className="text-brand-600">
          Save
        </button>
        <button type="button" onClick={() => setEditingLink(false)} className="text-muted">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="mt-1 flex flex-col gap-0.5 text-[0.65rem]">
      <div className="flex items-center gap-2">
        {isLink ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setLinkValue(file.secure_url);
              setEditingLink(true);
            }}
            className="text-brand-600"
          >
            Replace
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="text-brand-600"
            >
              {busy ? "Replacing…" : "Replace"}
            </button>
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
          </>
        )}
        <button type="button" disabled={busy} onClick={handleDelete} className="text-[var(--rush)]">
          Delete
        </button>
      </div>
      {error ? <p className="text-[var(--rush)]">{error}</p> : null}
    </div>
  );
}

function Thumbnail({
  thumbUrl,
  downloadHref,
  name,
  onOpen,
}: {
  thumbUrl: string;
  downloadHref: string;
  name: string;
  onOpen: () => void;
}) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    setDownloading(true);
    try {
      await downloadWithPicker(downloadHref, name);
    } catch {
      // best-effort — this tile has no room for an inline error message
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="group relative h-16 w-16 shrink-0">
      <button
        type="button"
        onClick={onOpen}
        title={name}
        className="h-16 w-16 overflow-hidden rounded-[var(--radius)] border border-border"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary remote hosts (Cloudinary/Supabase Storage/pasted links), can't be allowlisted for next/image */}
        <img src={thumbUrl} alt={name} loading="lazy" className="h-full w-full object-cover" />
      </button>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        title={`Download ${name}`}
        className="absolute bottom-0.5 right-0.5 inline-flex h-5 w-5 items-center justify-center rounded bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 disabled:opacity-100"
      >
        <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor" aria-hidden="true">
          <path d="M8 1a1 1 0 0 1 1 1v6.086l1.793-1.793a1 1 0 1 1 1.414 1.414l-3.5 3.5a1 1 0 0 1-1.414 0l-3.5-3.5a1 1 0 1 1 1.414-1.414L7 8.086V2a1 1 0 0 1 1-1zM2 13a1 1 0 0 1 1-1h10a1 1 0 1 1 0 2H3a1 1 0 0 1-1-1z" />
        </svg>
      </button>
    </div>
  );
}

// Both single-file affordances below go through downloadWithPicker too, so
// "Save As" behaves the same everywhere in this component instead of only
// on the "Download all" zip — a plain <a download> never prompts for a
// location, which read as inconsistent/disorganized next to the zip flow.
function FileDownloadLink({ href, name }: { href: string; name: string }) {
  const [downloading, setDownloading] = useState(false);

  async function handleClick() {
    setDownloading(true);
    try {
      await downloadWithPicker(href, name);
    } catch {
      // best-effort
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={downloading}
      className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-border px-3 text-xs disabled:opacity-60"
    >
      {downloading ? "Downloading…" : name}
    </button>
  );
}

// A pasted third-party link renders as a plain navigation, not a download —
// see isPastedLink. Browsers can't be asked to force-save an arbitrary
// cross-origin page anyway; this just opens it in a new tab like any link.
function OpenLink({ href, name }: { href: string; name: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-border px-3 text-xs text-blue-600 underline underline-offset-2 dark:text-blue-400"
    >
      {name}
    </a>
  );
}

function LightboxDownloadButton({ href, name }: { href: string; name: string }) {
  const [downloading, setDownloading] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    setDownloading(true);
    try {
      await downloadWithPicker(href, name);
    } catch {
      // best-effort
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={downloading}
      className="inline-flex min-h-11 items-center rounded-[var(--radius)] bg-white px-3 text-xs font-medium text-gray-900 disabled:opacity-60"
    >
      {downloading ? "Downloading…" : "Download"}
    </button>
  );
}

// Fetches the zip itself (see downloadWithPicker) instead of a plain link,
// so Chromium browsers can prompt "Save As" for a location instead of
// always silently landing in the default Downloads folder.
function DownloadAllButton({ orderItemId, count }: { orderItemId: string; count: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      await downloadWithPicker(`/api/order-items/${orderItemId}/media-zip`, "media.zip", {
        description: "Zip archive",
        accept: { "application/zip": [".zip"] },
      });
    } catch {
      setError("Could not download the zip.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="inline-flex min-h-11 w-fit items-center rounded-[var(--radius)] border border-border px-3 text-xs"
      >
        {busy ? "Preparing…" : `Download all (${count})`}
      </button>
      {error ? <p className="text-xs text-[var(--rush)]">{error}</p> : null}
    </div>
  );
}

function Lightbox({ preview, onClose }: { preview: Preview; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary remote hosts, can't be allowlisted for next/image */}
      <img
        src={preview.url}
        alt={preview.name}
        className="max-h-full max-w-full rounded-[var(--radius)] object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <div className="absolute bottom-6 right-6 flex gap-2">
        <LightboxDownloadButton href={preview.downloadHref} name={preview.name} />
        <a
          href={preview.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex min-h-11 items-center rounded-[var(--radius)] bg-white px-3 text-xs font-medium text-gray-900"
        >
          Open original
        </a>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-6 top-6 inline-flex min-h-11 items-center rounded-[var(--radius)] bg-white px-3 text-xs font-medium text-gray-900"
      >
        Close
      </button>
    </div>
  );
}

// Renders an item's uploaded files (image previews, other file types as a
// plain link) and falls back to the legacy pasted media_link (item-level,
// then order-level) for orders created before this feature existed, so old
// rows keep working with no data migration. Uploaded rows may come from
// either backend the app has used over time (Cloudinary or Supabase
// Storage, distinguished by which of cloudinary_public_id/storage_path is
// set) or be a plain pasted link (neither set) — resolveThumbUrl/
// resolveDownloadUrl pick the right URL strategy per row.
export function MediaLinks({
  media,
  legacyLink,
  editable = false,
  onChanged,
}: {
  media: OrderItemMedia[];
  legacyLink?: string | null;
  editable?: boolean;
  onChanged?: () => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);

  let content: React.ReactNode = null;

  if (media.length > 0) {
    content = (
      <div className="flex flex-col gap-2">
        {media.length > 1 ? (
          <DownloadAllButton orderItemId={media[0].order_item_id} count={media.length} />
        ) : null}
        <div className="flex flex-wrap gap-3">
          {media.map((file) => (
            <div key={file.id} className="flex flex-col items-start">
              {isImage(file.secure_url, file.mime_type) ? (
                <Thumbnail
                  thumbUrl={resolveThumbUrl(file)}
                  downloadHref={resolveDownloadUrl(file)}
                  name={resolveDisplayName(file)}
                  onOpen={() =>
                    setPreview({
                      url: file.secure_url,
                      name: resolveDisplayName(file),
                      downloadHref: resolveDownloadUrl(file),
                    })
                  }
                />
              ) : isPastedLink(file) ? (
                <OpenLink href={file.secure_url} name={file.file_name} />
              ) : (
                <FileDownloadLink href={resolveDownloadUrl(file)} name={resolveDisplayName(file)} />
              )}
              {editable ? <MediaActions file={file} onChanged={onChanged} /> : null}
            </div>
          ))}
        </div>
      </div>
    );
  } else if (legacyLink) {
    content = isImage(legacyLink) ? (
      <Thumbnail
        thumbUrl={legacyLink}
        downloadHref={legacyLink}
        name="Photo"
        onOpen={() => setPreview({ url: legacyLink, name: "Photo", downloadHref: legacyLink })}
      />
    ) : (
      <a
        href={legacyLink}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-border px-3 text-xs"
      >
        View photos
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
