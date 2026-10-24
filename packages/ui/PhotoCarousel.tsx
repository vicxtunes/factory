"use client";

import { useRef, useState } from "react";
import type { Swiper as Slider } from "swiper";
import { Keyboard } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";

import "swiper/css";

import type { GalleryPhoto } from "./PhotoGrid";

// Hand-driven slideshow: one photo at a time, with ‹ › arrows, dots, swipe
// and ← / → when focused. Unlike the existing Carousel (auto-playing
// cross-fade for marketing), nothing moves unless the viewer moves it. Swiper,
// as every photo viewer: the photo follows the finger and snaps to the next,
// mouse drag too. Fixed 3:2 frame; photos of other shapes are letterboxed
// rather than cropped, so a proof is never cut off.

export function PhotoCarousel({ photos, label }: { photos: GalleryPhoto[]; /** Accessible name, e.g. "Wedding album preview". */ label: string }) {
  const slider = useRef<Slider | null>(null);
  const [current, setCurrent] = useState(0);

  const arrow =
    "absolute top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-xl text-gray-800 shadow-theme-md hover:bg-white dark:bg-gray-900/80 dark:text-white";

  return (
    <section aria-roledescription="carousel" aria-label={label} className="space-y-3">
      <div className="relative overflow-hidden rounded-[var(--radius)] border border-border bg-gray-100 dark:bg-white/5">
        <Swiper
          className="aspect-[3/2]"
          modules={[Keyboard]}
          keyboard={{ enabled: true, onlyInViewport: true }}
          rewind
          grabCursor
          onSwiper={(s) => (slider.current = s)}
          onSlideChange={(s) => setCurrent(s.activeIndex)}
        >
          {photos.map((p, i) => (
            <SwiperSlide key={p.key} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${photos.length}: ${p.alt}`} className="!flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary photo hosts, can't be allowlisted for next/image */}
              <img src={p.src} alt={p.alt} loading={i === 0 ? "eager" : "lazy"} draggable={false} className="max-h-full max-w-full object-contain" />
            </SwiperSlide>
          ))}
        </Swiper>
        {photos.length > 1 ? (
          <>
            <button type="button" onClick={() => slider.current?.slidePrev()} aria-label="Previous photo" className={`${arrow} left-3`}>
              ‹
            </button>
            <button type="button" onClick={() => slider.current?.slideNext()} aria-label="Next photo" className={`${arrow} right-3`}>
              ›
            </button>
            <span className="absolute bottom-3 right-3 z-10 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white tnum">
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
              onClick={() => slider.current?.slideTo(i)}
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
