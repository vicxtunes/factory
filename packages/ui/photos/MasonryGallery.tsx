"use client";

import { useState } from "react";

import type { PhotoView } from "@repo/lib/photos/core";

import { Lightbox } from "../Lightbox";

/**
 * Photos in a Pinterest-style masonry grid (small copies, lazy-loaded), and
 * the shared full-screen viewer (large copies; smooth swipe, pinch zoom). With
 * `downloads`, each photo can be saved from the viewer.
 */
export function MasonryGallery({ photos, downloads = false }: { photos: PhotoView[]; downloads?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);

  if (photos.length === 0) return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">No photos yet.</p>;
  const viewerPhotos = photos.map((p, i) => ({ key: p.id, src: p.largeUrl, thumb: p.thumbUrl, alt: p.caption ?? `Photo ${i + 1}` }));

  return (
    <>
      <ul className="columns-2 gap-2 sm:columns-3 lg:columns-4 [&>li]:mb-2">
        {photos.map((p, i) => (
          <li key={p.id} className="break-inside-avoid">
            <button type="button" onClick={() => setOpen(i)} className="block w-full overflow-hidden rounded-xl" aria-label={p.caption ?? `Photo ${i + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- signed storage links, already resized */}
              <img src={p.thumbUrl} alt={p.caption ?? ""} width={p.width} height={p.height} loading="lazy" className="h-auto w-full transition-transform hover:scale-[1.02]" />
            </button>
          </li>
        ))}
      </ul>

      <Lightbox
        photos={viewerPhotos}
        index={open}
        onIndexChange={setOpen}
        onClose={() => setOpen(null)}
        actions={
          downloads
            ? (i) => (
                <a href={photos[i].downloadUrl ?? photos[i].largeUrl} download className="inline-flex min-h-11 items-center rounded-full bg-white/10 px-4 text-sm font-medium hover:bg-white/20">
                  Download
                </a>
              )
            : undefined
        }
      />
    </>
  );
}
