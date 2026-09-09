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
// full-resolution asset just to render a small preview tile. Pasted links
// (Drive/Dropbox/etc.) don't match this shape, so they pass through as-is.
function thumbnailUrl(url: string): string {
  const marker = "/upload/";
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  return `${url.slice(0, idx + marker.length)}w_200,h_200,c_fill,q_auto,f_auto/${url.slice(idx + marker.length)}`;
}

type Preview = { url: string; name: string };

function Thumbnail({ url, name, onOpen }: { url: string; name: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={name}
      className="h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius)] border border-border"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary remote hosts (Cloudinary + pasted links), can't be allowlisted for next/image */}
      <img src={thumbnailUrl(url)} alt={name} loading="lazy" className="h-full w-full object-cover" />
    </button>
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
      <a
        href={preview.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-6 right-6 inline-flex min-h-11 items-center rounded-[var(--radius)] bg-white px-3 text-xs font-medium text-gray-900"
      >
        Open original
      </a>
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

// Renders an item's uploaded Cloudinary files (image previews, other file
// types as a plain link) and falls back to the legacy pasted media_link
// (item-level, then order-level) for orders created before this feature
// existed, so old rows keep working with no data migration.
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
              url={file.secure_url}
              name={file.file_name}
              onOpen={() => setPreview({ url: file.secure_url, name: file.file_name })}
            />
          ) : (
            <a
              key={file.id}
              href={file.secure_url}
              target="_blank"
              rel="noopener noreferrer"
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
      <Thumbnail url={legacyLink} name="Photo" onOpen={() => setPreview({ url: legacyLink, name: "Photo" })} />
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
