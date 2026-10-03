"use client";

import { useEffect, useRef, type PointerEvent } from "react";

import type { GalleryPhoto, PhotoSelection } from "./PhotoGrid";

// Full-screen photo viewer: the photo fitted to the screen, prev / next
// (buttons, ← / → keys, or a swipe), "3 / 12", the caption, and a strip of
// thumbnails to jump with. Escape or ✕ closes and focus goes back to
// whatever opened it; Tab stays inside while it's open. With `selection`
// it also shows a Pick toggle, so photos can be picked while viewing them.
// The caller owns which photo is open (`index`, null = closed).
// Draft — lives in the Design Room until a page adopts it.

export function Lightbox({
  photos,
  index,
  onIndexChange,
  onClose,
  selection,
}: {
  photos: GalleryPhoto[];
  /** Open photo, or null when closed. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  selection?: PhotoSelection;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const swipeStart = useRef<number | null>(null);
  const open = index !== null;
  const count = photos.length;

  // While open: lock page scroll, focus ✕, and give focus back on close.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [open]);

  // Keep the current thumbnail in view in the strip.
  useEffect(() => {
    if (index === null) return;
    stripRef.current?.querySelector<HTMLElement>(`[data-thumb="${index}"]`)?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [index]);

  useEffect(() => {
    if (index === null) return;
    function onKey(e: KeyboardEvent) {
      if (index === null) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onIndexChange((index + 1) % count);
      else if (e.key === "ArrowLeft") onIndexChange((index - 1 + count) % count);
      else if (e.key === "Home") onIndexChange(0);
      else if (e.key === "End") onIndexChange(count - 1);
      else if (e.key === "Tab") {
        // Focus trap: wrap from last to first focusable and back.
        const focusable = [...(rootRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
        return;
      } else return;
      e.preventDefault();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, count, onClose, onIndexChange]);

  if (index === null) return null;
  const photo = photos[index];
  const pick = selection ? selection.selected.indexOf(photo.key) + 1 : 0;
  const full = !!selection?.max && selection.selected.length >= selection.max;

  function onPointerUp(e: PointerEvent) {
    if (swipeStart.current === null || index === null) return;
    const dx = e.clientX - swipeStart.current;
    swipeStart.current = null;
    if (Math.abs(dx) > 50) onIndexChange(dx < 0 ? (index + 1) % count : (index - 1 + count) % count);
  }

  const navButton = "flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl text-white hover:bg-white/20";

  return (
    <div ref={rootRef} role="dialog" aria-modal="true" aria-label={`Photo viewer: ${photo.alt}`} className="fixed inset-0 z-[70] flex flex-col bg-gray-950/95 text-white">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="min-w-0 truncate text-sm">
          <span className="tnum text-white/60">
            {index + 1} / {count}
          </span>
          <span className="ml-3">{photo.alt}</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {selection ? (
            <button
              type="button"
              aria-pressed={!!pick}
              disabled={!pick && full}
              onClick={() => selection.onToggle(photo.key)}
              className={`min-h-11 rounded-full px-4 text-sm font-medium disabled:opacity-40 ${pick ? "bg-brand-500 text-white" : "bg-white/10 hover:bg-white/20"}`}
            >
              {pick ? `Picked #${pick}` : full ? "Limit reached" : "Pick"}
            </button>
          ) : null}
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close viewer" className={navButton}>
            ✕
          </button>
        </div>
      </div>

      <div
        className="relative flex min-h-0 flex-1 touch-pan-y select-none items-center justify-center gap-2 px-2"
        onPointerDown={(e) => (swipeStart.current = e.clientX)}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipeStart.current = null)}
      >
        <button type="button" onClick={() => onIndexChange((index - 1 + count) % count)} aria-label="Previous photo" className={navButton}>
          ‹
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary photo hosts, can't be allowlisted for next/image */}
        <img key={photo.key} src={photo.src} alt={photo.alt} draggable={false} className="max-h-full min-w-0 max-w-full flex-1 object-contain" />
        <button type="button" onClick={() => onIndexChange((index + 1) % count)} aria-label="Next photo" className={navButton}>
          ›
        </button>
      </div>

      <div ref={stripRef} className="flex gap-1.5 overflow-x-auto px-4 py-3" style={{ scrollbarWidth: "none" }}>
        {photos.map((p, i) => (
          <button
            key={p.key}
            type="button"
            data-thumb={i}
            onClick={() => onIndexChange(i)}
            aria-label={`Show ${p.alt}`}
            aria-current={i === index}
            className={`size-14 shrink-0 overflow-hidden rounded-md transition-opacity ${i === index ? "ring-2 ring-white" : "opacity-50 hover:opacity-80"}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary photo hosts, can't be allowlisted for next/image */}
            <img src={p.src} alt="" loading="lazy" className="size-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
