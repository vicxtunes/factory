"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import type { GalleryPhoto } from "./PhotoGrid";

// Hand-driven slideshow: one photo at a time, with ‹ › arrows, dots, swipe
// (native CSS scroll-snap, no library) and ← / → when focused. Unlike the
// existing Carousel (auto-playing cross-fade for marketing), nothing moves
// unless the viewer moves it. Fixed 3:2 frame; photos of other shapes are
// letterboxed rather than cropped, so a proof is never cut off.
// Draft — lives in the Design Room until a page adopts it.

export function PhotoCarousel({ photos, label }: { photos: GalleryPhoto[]; /** Accessible name, e.g. "Wedding album preview". */ label: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);

  // The slide most in view is the current one — works for arrows, dots and swipes alike.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCurrent(Number((e.target as HTMLElement).dataset.slide));
      },
      { root: track, threshold: 0.6 },
    );
    track.querySelectorAll("[data-slide]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [photos]);

  function go(i: number) {
    const track = trackRef.current;
    if (!track) return;
    const next = (i + photos.length) % photos.length;
    track.scrollTo({ left: next * track.clientWidth, behavior: "smooth" });
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowRight") go(current + 1);
    else if (e.key === "ArrowLeft") go(current - 1);
    else return;
    e.preventDefault();
  }

  const arrow =
    "absolute top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-xl text-gray-800 shadow-theme-md hover:bg-white dark:bg-gray-900/80 dark:text-white";

  return (
    <section aria-roledescription="carousel" aria-label={label} className="space-y-3">
      <div className="relative overflow-hidden rounded-[var(--radius)] border border-border bg-gray-100 dark:bg-white/5">
        <div
          ref={trackRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          aria-live="polite"
          className="flex aspect-[3/2] snap-x snap-mandatory overflow-x-auto outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-brand-500/40"
          style={{ scrollbarWidth: "none" }}
        >
          {photos.map((p, i) => (
            <div
              key={p.key}
              data-slide={i}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${photos.length}: ${p.alt}`}
              className="flex size-full shrink-0 snap-center items-center justify-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary photo hosts, can't be allowlisted for next/image */}
              <img src={p.src} alt={p.alt} loading={i === 0 ? "eager" : "lazy"} draggable={false} className="max-h-full max-w-full object-contain" />
            </div>
          ))}
        </div>
        {photos.length > 1 ? (
          <>
            <button type="button" onClick={() => go(current - 1)} aria-label="Previous photo" className={`${arrow} left-3`}>
              ‹
            </button>
            <button type="button" onClick={() => go(current + 1)} aria-label="Next photo" className={`${arrow} right-3`}>
              ›
            </button>
            <span className="absolute bottom-3 right-3 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white tnum">
              {current + 1} / {photos.length}
            </span>
          </>
        ) : null}
      </div>
      {photos.length > 1 ? (
        <div className="flex flex-wrap justify-center gap-0.5">
          {photos.map((p, i) => (
            <button
              key={p.key}
              type="button"
              onClick={() => go(i)}
              aria-label={`Go to photo ${i + 1}`}
              aria-current={i === current}
              className="flex size-7 items-center justify-center"
            >
              <span className={`block h-2 rounded-full transition-all ${i === current ? "w-5 bg-brand-500" : "w-2 bg-gray-300 dark:bg-white/25"}`} />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
