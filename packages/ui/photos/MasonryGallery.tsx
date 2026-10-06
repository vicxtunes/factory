"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { PhotoView } from "@repo/lib/photos/core";

import { useCloseOnBack } from "../navigation/back";

/**
 * Photos in a Pinterest-style masonry grid (small copies, lazy-loaded), and
 * a full-screen viewer (large copies) with arrows, swipe and keyboard. With
 * `downloads`, each photo can be saved.
 */
export function MasonryGallery({ photos, downloads = false }: { photos: PhotoView[]; downloads?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const touchX = useRef<number | null>(null);
  const close = useCallback(() => setOpen(null), []);
  useCloseOnBack(open !== null, close);
  const step = useCallback((d: 1 | -1) => setOpen((i) => (i === null ? i : (i + d + photos.length) % photos.length)), [photos.length]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, step]);

  if (photos.length === 0) return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">No photos yet.</p>;
  const current = open === null ? null : photos[open];

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

      {current ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photo"
          className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white"
          onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
            touchX.current = null;
          }}
        >
          <div className="flex items-center justify-between gap-2 p-3 text-sm">
            <span className="tnum opacity-70">
              {open! + 1} / {photos.length}
            </span>
            <div className="flex items-center gap-4">
              {downloads ? (
                <a href={current.downloadUrl ?? current.largeUrl} download className="hover:underline">
                  Download
                </a>
              ) : null}
              <button type="button" onClick={() => setOpen(null)} className="text-lg" aria-label="Close">
                ✕
              </button>
            </div>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage links, already resized */}
            <img src={current.largeUrl} alt={current.caption ?? ""} className="max-h-full max-w-full object-contain" />
            {photos.length > 1 ? (
              <>
                <button type="button" onClick={() => step(-1)} aria-label="Previous" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-xl hover:bg-white/20">
                  ‹
                </button>
                <button type="button" onClick={() => step(1)} aria-label="Next" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-xl hover:bg-white/20">
                  ›
                </button>
              </>
            ) : null}
          </div>
          {current.caption ? <p className="p-3 text-center text-sm opacity-80">{current.caption}</p> : null}
        </div>
      ) : null}
    </>
  );
}
