"use client";

import { useState } from "react";

import type { OrderItemMedia } from "@/lib/types";

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

// Forces a real file download (with the original filename) instead of the
// browser just navigating to the asset — Cloudinary's fl_attachment flag
// sets Content-Disposition: attachment on delivery.
function cloudinaryDownloadUrl(url: string, name: string): string {
  const marker = "/upload/";
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  return `${url.slice(0, idx + marker.length)}fl_attachment:${encodeURIComponent(name)}/${url.slice(idx + marker.length)}`;
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

type Preview = { url: string; name: string; downloadHref: string };

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
      <a
        href={downloadHref}
        download={name}
        title={`Download ${name}`}
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-0.5 right-0.5 inline-flex h-5 w-5 items-center justify-center rounded bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
      >
        <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor" aria-hidden="true">
          <path d="M8 1a1 1 0 0 1 1 1v6.086l1.793-1.793a1 1 0 1 1 1.414 1.414l-3.5 3.5a1 1 0 0 1-1.414 0l-3.5-3.5a1 1 0 1 1 1.414-1.414L7 8.086V2a1 1 0 0 1 1-1zM2 13a1 1 0 0 1 1-1h10a1 1 0 1 1 0 2H3a1 1 0 0 1-1-1z" />
        </svg>
      </a>
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
        <a
          href={preview.downloadHref}
          download={preview.name}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex min-h-11 items-center rounded-[var(--radius)] bg-white px-3 text-xs font-medium text-gray-900"
        >
          Download
        </a>
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
}: {
  media: OrderItemMedia[];
  legacyLink?: string | null;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);

  let content: React.ReactNode = null;

  if (media.length > 0) {
    content = (
      <div className="flex flex-wrap gap-2">
        {media.map((file) =>
          isImage(file.secure_url, file.mime_type) ? (
            <Thumbnail
              key={file.id}
              thumbUrl={resolveThumbUrl(file)}
              downloadHref={resolveDownloadUrl(file)}
              name={file.file_name}
              onOpen={() =>
                setPreview({
                  url: file.secure_url,
                  name: file.file_name,
                  downloadHref: resolveDownloadUrl(file),
                })
              }
            />
          ) : (
            <a
              key={file.id}
              href={resolveDownloadUrl(file)}
              download={file.file_name}
              className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-border px-3 text-xs"
            >
              {file.file_name}
            </a>
          ),
        )}
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
