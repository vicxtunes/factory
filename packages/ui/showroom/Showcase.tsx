"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import type { Swiper as SwiperInstance } from "swiper";
import { Swiper, SwiperSlide } from "swiper/react";

import "swiper/css";

import { canOptimizeImage } from "@repo/lib/storage/client";

import { useCloseOnBack } from "../navigation/back";

const PLACEHOLDER = "/showroom/placeholder.PNG";

// Deterministic per-item backdrop pick (was `index % themes.length` when
// this was driven by a shuffled deck position — an item has no such index
// on its own, so hash its id instead, same effect: stable, varied colors).
// The 6 `.showroom-theme-N` classes (light + dark variants) live in
// globals.css as plain CSS custom properties, not Tailwind theme tokens,
// since the gradient formula below is arbitrary shape Tailwind utilities
// can't express — this just picks which class supplies the var() values.
const THEME_COUNT = 6;
function themeIndexFor(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % THEME_COUNT;
}

export interface ShowcaseMedia {
  url: string;
  kind: "photo" | "video";
}

function ArrowButton({ direction, onClick }: { direction: "prev" | "next"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === "prev" ? "Previous photo" : "Next photo"}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-showroom-ink/40 text-showroom-ink transition-colors hover:bg-showroom-ink/10"
    >
      {direction === "prev" ? "‹" : "›"}
    </button>
  );
}

// Shares the page's own URL: the phone's share sheet where there is one
// (WhatsApp, SMS, …), otherwise copies the link.
function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // Closing the share sheet rejects; nothing to do.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-showroom-ink transition-opacity hover:opacity-70"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z"
        />
      </svg>
      <span aria-live="polite">{copied ? "Link copied" : "Share"}</span>
    </button>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-showroom-ink transition-opacity hover:opacity-70"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
      </svg>
      Back to showroom
    </button>
  );
}

// Full-screen single-photo viewer over the "More details" waterfall — steps
// through only the *photo* entries (videos already have their own inline
// controls in the waterfall and aren't worth re-opening full-screen), via
// the same arrow buttons/counter/keyboard-arrows pattern as the main
// showcase carousel above, just restyled for this overlay's black backdrop
// instead of the showroom theme.
function GalleryLightbox({
  media,
  photoIndices,
  index,
  onIndexChange,
  onClose,
}: {
  media: ShowcaseMedia[];
  photoIndices: number[];
  index: number;
  onIndexChange: (mediaIndex: number) => void;
  onClose: () => void;
}) {
  const pos = photoIndices.indexOf(index);
  // Swiper does the sliding (finger drag, arrows, arrow keys); at either end it rewinds to the other.
  const swiper = useRef<SwiperInstance | null>(null);

  // Escape is deliberately not handled here — it's owned by Showcase's
  // single keydown effect, which knows about every stacked overlay (video /
  // gallery / this lightbox) and closes exactly the topmost one. A second,
  // independent listener here would *also* fire on the same Escape press
  // (window keydown listeners don't stop each other via stopPropagation —
  // that only affects DOM bubbling between different elements), closing the
  // lightbox and the whole gallery in one keystroke instead of one at a time.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") swiper.current?.slideNext();
      else if (e.key === "ArrowLeft") swiper.current?.slidePrev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-[70] bg-black/95" onClick={onClose}>
      <Swiper
        className="h-full w-full"
        initialSlide={Math.max(pos, 0)}
        rewind
        spaceBetween={16}
        onSwiper={(sw) => (swiper.current = sw)}
        onSlideChange={(sw) => onIndexChange(photoIndices[sw.activeIndex])}
      >
        {photoIndices.map((mediaIndex) => (
          <SwiperSlide key={mediaIndex} className="!flex items-center justify-center p-4">
            <Image
              src={media[mediaIndex].url}
              alt=""
              width={1600}
              height={1600}
              sizes="100vw"
              unoptimized={!canOptimizeImage(media[mediaIndex].url)}
              draggable={false}
              className="h-auto max-h-full w-auto max-w-full select-none rounded-xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </SwiperSlide>
        ))}
      </Swiper>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg text-white transition-colors hover:bg-white/20"
      >
        ✕
      </button>

      {photoIndices.length > 1 ? (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              swiper.current?.slidePrev();
            }}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-2xl text-white transition-colors hover:bg-white/20 sm:left-4"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              swiper.current?.slideNext();
            }}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-2xl text-white transition-colors hover:bg-white/20 sm:right-4"
          >
            ›
          </button>
          <span className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 text-xs uppercase tracking-widest text-white/70">
            {pos + 1} / {photoIndices.length}
          </span>
        </>
      ) : null}
    </div>
  );
}

// Preview video (if any) followed by a Pinterest-style waterfall of every
// extra photo/video an item has — a single overlay reached from one
// button on the media box (see the comment above it below). CSS
// multi-column (`columns-*` + `break-inside-avoid`) rather than a JS
// masonry library for the waterfall: items keep their natural aspect ratio
// (no forced object-cover box), which is exactly what produces the
// variable-height look, and it degrades to a single column gracefully with
// zero layout JS.
function DetailsOverlay({
  videoUrl,
  media,
  itemName,
  onClose,
  lightboxIndex,
  onOpenLightbox,
  onCloseLightbox,
}: {
  videoUrl?: string;
  media: ShowcaseMedia[];
  itemName: string;
  onClose: () => void;
  // Lifted to Showcase, not owned here — see the Escape-handling
  // comment in GalleryLightbox for why.
  lightboxIndex: number | null;
  onOpenLightbox: (mediaIndex: number) => void;
  onCloseLightbox: () => void;
}) {
  const photoIndices = useMemo(
    () => media.map((m, i) => (m.kind === "photo" ? i : -1)).filter((i) => i !== -1),
    [media],
  );

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/90 p-4 sm:p-8" onClick={onClose}>
      <div className="mx-auto max-w-5xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="truncate text-base font-semibold text-white sm:text-lg">{itemName} — more photos &amp; videos</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            ✕
          </button>
        </div>
        {videoUrl ? (
          <video src={videoUrl} controls preload="metadata" className="mb-4 w-full rounded-xl" />
        ) : null}
        <div className="columns-2 gap-3 sm:columns-3">
          {media.map((m, i) => (
            <div key={m.url + i} className="mb-3 break-inside-avoid overflow-hidden rounded-xl bg-white/5">
              {m.kind === "video" ? (
                <video src={m.url} controls preload="metadata" className="w-full" />
              ) : (
                <button type="button" onClick={() => onOpenLightbox(i)} className="block w-full">
                  <Image
                    src={m.url}
                    alt=""
                    width={800}
                    height={800}
                    sizes="(max-width: 640px) 50vw, 256px"
                    unoptimized={!canOptimizeImage(m.url)}
                    className="h-auto w-full transition-opacity hover:opacity-90"
                  />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {lightboxIndex != null ? (
        <GalleryLightbox
          media={media}
          photoIndices={photoIndices}
          index={lightboxIndex}
          onIndexChange={onOpenLightbox}
          onClose={onCloseLightbox}
        />
      ) : null}
    </div>
  );
}

// The page for one showroom item — a factory product (apps/client
// product-showcase.tsx) or a studio's service — reached by clicking its card
// in the showroom grid (ShowroomGallery.tsx). Visually this is the old "Free
// Walk" per-card layout (studio background, big image area), locked to a
// single item instead of scrolling through a shuffled deck of many — that
// shuffled-browsing feature is retired (see git history), but its look lives
// on here, with a photo carousel (videos play in the overlay). What's for sale (price, options, the
// call to action) is the caller's: `details` and `action`.
//
// On desktop this is an in-page card, not a full-screen takeover (the boss
// wants the navbar/sidebar to stay visible). On mobile it *does* go
// full-screen (`max-sm:fixed inset-0`) — the sidebar's already collapsed
// behind a hamburger there, so there's no chrome to lose, and the extra
// screen real estate matters more on a small viewport.
export function Showcase({
  item,
  details,
  action,
  onExit,
  shareable = false,
}: {
  item: {
    id: string;
    name: string;
    description: string | null;
    coverUrl: string | null;
    previewVideoUrl: string | null;
    /** Everything else: shown after the cover and video, and in "More details". */
    gallery: ShowcaseMedia[];
  };
  /** Under the description: price, options. */
  details?: ReactNode;
  /** Below everything: the call to action. */
  action?: ReactNode;
  onExit: () => void;
  /** Show a Share button for the page's URL (on the item's own page). */
  shareable?: boolean;
}) {
  const themeIndex = useMemo(() => themeIndexFor(item.id), [item.id]);
  const media = useMemo<ShowcaseMedia[]>(() => {
    const list: ShowcaseMedia[] = [];
    if (item.coverUrl) list.push({ url: item.coverUrl, kind: "photo" });
    // Photos only: the preview video and any gallery videos play in the
    // overlay behind the button on the media box ("Watch preview" / "More details").
    list.push(...item.gallery.filter((m) => m.kind === "photo"));
    return list.length > 0 ? list : [{ url: PLACEHOLDER, kind: "photo" }];
  }, [item]);
  const extraMedia = item.gallery;

  const [index, setIndex] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Which details-overlay photo is expanded full-screen, if any — lifted up
  // from DetailsOverlay so a single Escape handler below can close exactly
  // one overlay layer at a time (lightbox, then details, then exit) instead
  // of two independent keydown listeners both firing on the same press.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  function closeDetails() {
    setDetailsOpen(false);
    setLightboxIndex(null);
  }
  useCloseOnBack(detailsOpen, closeDetails);
  useCloseOnBack(lightboxIndex !== null, () => setLightboxIndex(null));

  // Swiper slides the photos (finger drag and the arrows below); at either end it rewinds to the other.
  const slider = useRef<SwiperInstance | null>(null);

  // Tracks the same breakpoint Tailwind's `sm:` prefix uses, so body-scroll
  // locking agrees with when the showcase itself goes full-screen (mobile
  // only — see the root className below) and reacts live if the viewport
  // crosses it (e.g. rotating a tablet).
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 639.98px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639.98px)");
    function onChange(e: MediaQueryListEvent) {
      setIsMobile(e.matches);
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Locked whenever the showcase itself is full-screen (mobile) or the
  // details overlay is open — a single effect recomputing from both, so
  // there's one lock/unlock lifecycle instead of two independent ones
  // fighting over the same body style.
  useEffect(() => {
    if (!isMobile && !detailsOpen) return;
    const prevOverflow = document.body.style.overflow;
    const prevPadding = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPadding;
    };
  }, [isMobile, detailsOpen]);

  // ESC closes whichever overlay is topmost, otherwise leaves the item
  // view — lightbox, then details, then exit, one layer per press (see the
  // lightboxIndex comment above for why this one effect owns all of it
  // instead of each overlay listening independently).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (lightboxIndex != null) setLightboxIndex(null);
      else if (detailsOpen) closeDetails();
      else onExit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, detailsOpen, onExit]);

  return (
    <div
      // Mobile only: this view is `fixed inset-0`, same z-40 as the bottom
      // home bar it sits behind in the DOM — a plain py-6 let the home bar
      // cover the "Place an order" button at the bottom of the scroll.
      // sm:py-8 below overrides both for desktop, where there's no home bar.
      className={`showroom-theme-${themeIndex} fixed inset-0 z-40 overflow-y-auto px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:static sm:inset-auto sm:z-auto sm:overflow-hidden sm:rounded-3xl sm:px-8 sm:py-8`}
      style={
        {
          backgroundImage: `
            radial-gradient(115% 80% at 50% 6%,  var(--showroom-glow) 0%, transparent 58%),
            radial-gradient(130% 95% at 50% 112%, var(--showroom-floor) 0%, transparent 72%),
            linear-gradient(180deg, var(--showroom-base) 0%, var(--showroom-floor) 100%)
          `,
        } as React.CSSProperties
      }
    >
      <div className="flex items-center justify-between gap-3">
        <BackLink onClick={onExit} />
        {shareable ? <ShareButton title={item.name} /> : null}
      </div>

      <div className="relative z-10 mx-auto mt-4 flex w-full max-w-3xl flex-col gap-8">
        <div className="relative h-72 w-full shrink-0 sm:h-80 lg:h-96">
          <div className="absolute inset-0 overflow-hidden rounded-2xl bg-black/5">
            <Swiper className="h-full w-full" rewind onSwiper={(sw) => (slider.current = sw)} onSlideChange={(sw) => setIndex(sw.activeIndex)}>
              {media.map((m, i) => (
                <SwiperSlide key={m.url + i}>
                  <Image
                    src={m.url}
                    alt={item.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 768px"
                    loading={i === 0 ? "eager" : "lazy"}
                    unoptimized={!canOptimizeImage(m.url)}
                    draggable={false}
                    className="select-none object-cover"
                  />
                </SwiperSlide>
              ))}
            </Swiper>
            {media.length > 1 ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex items-center justify-center gap-2">
                {media.map((m, i) => (
                  <span
                    key={m.url + i}
                    className={`h-1.5 w-1.5 rounded-full transition-colors ${i === index ? "bg-white" : "bg-white/40"}`}
                  />
                ))}
              </div>
            ) : null}
          </div>

          {/* One overlay button lives directly on the media box — right by
              the viewpoint, not buried in the details panel below where
              it'd need scrolling to reach on a short viewport. Opens the
              preview video (if any) followed by the rest of the item's
              photos/videos in one overlay — see DetailsOverlay above. */}
          {item.previewVideoUrl || extraMedia.length > 0 ? (
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              aria-label={item.previewVideoUrl ? "Watch preview video" : "More details"}
              // Solid brand orange, not the ink token — ink flips light↔dark
              // for text/outline use, which would turn this into a pale
              // pill instead of a solid accent button under dark mode.
              className="absolute bottom-3 right-3 z-10 flex items-center gap-2 rounded-full bg-brand-600/90 px-3 py-2 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-brand-600"
            >
              {item.previewVideoUrl ? (
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M8 5.5v13l11-6.5-11-6.5Z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 7.5A2.25 2.25 0 0 1 4.5 5.25h4.5l1.5 2.25h7.25A2.25 2.25 0 0 1 20 9.75v7A2.25 2.25 0 0 1 17.75 19H4.5a2.25 2.25 0 0 1-2.25-2.25v-9.25Z"
                  />
                </svg>
              )}
              {item.previewVideoUrl ? "Watch preview" : "More details"}
            </button>
          ) : null}
        </div>

        <div className="flex flex-col gap-4 text-showroom-ink">
          {media.length > 1 ? (
            <div className="flex items-center gap-2">
              <ArrowButton direction="prev" onClick={() => slider.current?.slidePrev()} />
              <ArrowButton direction="next" onClick={() => slider.current?.slideNext()} />
              <span className="ml-1 text-xs uppercase tracking-widest text-showroom-ink/60">
                {index + 1} / {media.length}
              </span>
            </div>
          ) : null}

          <h2 className="text-4xl font-extrabold leading-tight sm:text-5xl">{item.name}</h2>

          {item.description ? (
            <p className="whitespace-pre-line text-sm text-showroom-ink/60 sm:text-base">{item.description}</p>
          ) : null}

          {details}
        </div>
        {action}
      </div>

      {detailsOpen ? (
        <DetailsOverlay
          videoUrl={item.previewVideoUrl ?? undefined}
          media={extraMedia}
          itemName={item.name}
          onClose={closeDetails}
          lightboxIndex={lightboxIndex}
          onOpenLightbox={setLightboxIndex}
          onCloseLightbox={() => setLightboxIndex(null)}
        />
      ) : null}
    </div>
  );
}
