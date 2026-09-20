"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { useCurrency } from "@/lib/currency/useCurrency";
import type { Currency, Product, ProductCategory, ShowroomViewMode } from "@/lib/types";

import type { ShowroomSceneHandle } from "./showroom-scene";
import { useSwipe } from "./use-swipe";

const ShowroomScene = dynamic(() => import("./showroom-scene").then((m) => m.ShowroomScene), {
  ssr: false,
  loading: () => <div className="absolute inset-0 flex items-center justify-center text-sm text-ink/50">Loading…</div>,
});

const PLACEHOLDER = "/showroom/placeholder.PNG";

// Deterministic per-product backdrop pick (was `index % themes.length` when
// this was driven by a shuffled deck position — a product has no such index
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

interface ShowcaseMedia {
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

  function step(direction: 1 | -1) {
    const nextPos = (pos + direction + photoIndices.length) % photoIndices.length;
    onIndexChange(photoIndices[nextPos]);
  }

  // Finger swipe steps through photos too (buttons and arrow keys still work).
  const swipe = useSwipe(step, photoIndices.length > 1);

  // Escape is deliberately not handled here — it's owned by ProductShowcase's
  // single keydown effect, which knows about every stacked overlay (video /
  // gallery / this lightbox) and closes exactly the topmost one. A second,
  // independent listener here would *also* fire on the same Escape press
  // (window keydown listeners don't stop each other via stopPropagation —
  // that only affects DOM bubbling between different elements), closing the
  // lightbox and the whole gallery in one keystroke instead of one at a time.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, photoIndices]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 p-4"
      onClick={onClose}
      {...swipe.bind}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg text-white transition-colors hover:bg-white/20"
      >
        ✕
      </button>

      {photoIndices.length > 1 ? (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              step(-1);
            }}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-2xl text-white transition-colors hover:bg-white/20 sm:left-4"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              step(1);
            }}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-2xl text-white transition-colors hover:bg-white/20 sm:right-4"
          >
            ›
          </button>
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs uppercase tracking-widest text-white/70">
            {pos + 1} / {photoIndices.length}
          </span>
        </>
      ) : null}

      {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL, can't be allowlisted for next/image */}
      <img
        src={media[index].url}
        alt=""
        draggable={false}
        className={`max-h-full max-w-full select-none rounded-xl object-contain ${
          swipe.dragging ? "" : "transition-transform duration-200"
        }`}
        style={{ transform: `translateX(${swipe.offset}px)` }}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// Pinterest-style waterfall of every extra photo/video a product has,
// opened from "More details" — CSS multi-column (`columns-*` +
// `break-inside-avoid`) rather than a JS masonry library: items keep their
// natural aspect ratio (no forced object-cover box), which is exactly what
// produces the variable-height waterfall look, and it degrades to a single
// column gracefully with zero layout JS.
function MoreDetailsGallery({
  media,
  productName,
  onClose,
  lightboxIndex,
  onOpenLightbox,
  onCloseLightbox,
}: {
  media: ShowcaseMedia[];
  productName: string;
  onClose: () => void;
  // Lifted to ProductShowcase, not owned here — see the Escape-handling
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
          <h3 className="truncate text-base font-semibold text-white sm:text-lg">{productName} — more photos &amp; videos</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            ✕
          </button>
        </div>
        <div className="columns-2 gap-3 sm:columns-3">
          {media.map((m, i) => (
            <div key={m.url + i} className="mb-3 break-inside-avoid overflow-hidden rounded-xl bg-white/5">
              {m.kind === "video" ? (
                <video src={m.url} controls className="w-full" />
              ) : (
                <button type="button" onClick={() => onOpenLightbox(i)} className="block w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL, can't be allowlisted for next/image */}
                  <img src={m.url} alt="" className="w-full transition-opacity hover:opacity-90" />
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

// In-page studio view for one specific product — the client lands here by
// clicking a product card in the regular showroom grid (see
// showroom-content.tsx, which swaps this in for the grid/tabs but leaves
// ClientShell's sidebar/topbar alone). Visually this is the old "Free Walk"
// per-card layout (studio background, big image area, size picker), just
// locked to a single product instead of scrolling through a shuffled deck
// of many — that shuffled-browsing feature is retired (see git history),
// but its look lives on here, and its 3D scene component is reused as one
// of two interchangeable image displays (see `viewMode`).
//
// On desktop this is an in-page card, not a full-screen takeover (the boss
// wants the navbar/sidebar to stay visible). On mobile it *does* go
// full-screen (`max-sm:fixed inset-0`) — the sidebar's already collapsed
// behind a hamburger there, so there's no chrome to lose, and the extra
// screen real estate matters more on a small viewport.
export function ProductShowcase({
  product,
  category,
  viewMode,
  showPrices,
  currencies,
  onExit,
}: {
  product: Product;
  category: ProductCategory;
  // Boss-configurable (dashboard Products page): whether the image area is
  // the scroll-driven 3D scene or a plain photo/video carousel. The scene
  // can only flip through actual photos (WebGL textures need static
  // images), so it silently drops any video; the carousel shows everything.
  viewMode: ShowroomViewMode;
  // Boss-configurable (dashboard Products page) — see ShowroomSettings.
  showPrices: boolean;
  currencies: Currency[];
  onExit: () => void;
}) {
  const currency = useCurrency(currencies);
  const themeIndex = useMemo(() => themeIndexFor(product.id), [product.id]);
  const media = useMemo<ShowcaseMedia[]>(() => {
    const list: ShowcaseMedia[] = [];
    if (product.display_image_url) list.push({ url: product.display_image_url, kind: "photo" });
    // Right after the display image, ahead of the open-ended gallery — the
    // preview video is a dedicated upload slot (see product-panel.tsx), not
    // just another gallery item, so it gets a fixed, prominent position
    // rather than wherever it happened to land in `product.media`. In
    // carousel mode this is enough — it's just a normal playable slide. In
    // scene mode it's filtered out below (`photos`, WebGL can't texture
    // video) and instead gets a dedicated "Watch preview" overlay button —
    // the 3D view's only way to reach it at all.
    if (product.preview_video_url) list.push({ url: product.preview_video_url, kind: "video" });
    for (const m of product.media) list.push({ url: m.secure_url, kind: m.kind });
    return list.length > 0 ? list : [{ url: PLACEHOLDER, kind: "photo" }];
  }, [product]);
  const photos = useMemo(() => media.filter((m) => m.kind === "photo"), [media]);
  const extraMedia = useMemo<ShowcaseMedia[]>(
    () => product.media.map((m) => ({ url: m.secure_url, kind: m.kind })),
    [product],
  );

  const [index, setIndex] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [videoOpen, setVideoOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  // Which "More details" photo is expanded full-screen, if any — lifted up
  // from MoreDetailsGallery so a single Escape handler below can close
  // exactly one overlay layer at a time (lightbox, then gallery, then exit)
  // instead of two independent keydown listeners both firing on the same
  // press.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const sceneRef = useRef<ShowroomSceneHandle>(null);

  function closeGallery() {
    setGalleryOpen(false);
    setLightboxIndex(null);
  }

  function advanceImage(direction: 1 | -1) {
    const len = viewMode === "scene" ? photos.length : media.length;
    setIndex((i) => (i + direction + len) % len);
  }

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

  // Locked whenever the showcase itself is full-screen (mobile) or a
  // deliberate overlay (video / full gallery) is open — a single effect
  // recomputing from both, so there's one lock/unlock lifecycle instead of
  // two independent ones fighting over the same body style.
  useEffect(() => {
    if (!isMobile && !videoOpen && !galleryOpen) return;
    const prevOverflow = document.body.style.overflow;
    const prevPadding = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPadding;
    };
  }, [isMobile, videoOpen, galleryOpen]);

  // ESC closes whichever overlay is topmost, otherwise leaves the product
  // view — lightbox, then gallery, then video, then exit, one layer per
  // press (see the lightboxIndex comment above for why this one effect owns
  // all of it instead of each overlay listening independently).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (lightboxIndex != null) setLightboxIndex(null);
      else if (videoOpen) setVideoOpen(false);
      else if (galleryOpen) closeGallery();
      else onExit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, videoOpen, galleryOpen, onExit]);

  const current = media[index] ?? media[0];

  function stepImage(direction: 1 | -1) {
    if (viewMode === "scene") sceneRef.current?.advance(direction);
    else advanceImage(direction);
  }

  // Finger swipe on the flat photo view. Not for videos (horizontal drags on
  // their controls scrub the timeline) and not for the 3D scene, which has
  // its own touch handling.
  const mediaSwipe = useSwipe(stepImage, viewMode !== "scene" && current.kind !== "video" && media.length > 1);

  return (
    <div
      className={`showroom-theme-${themeIndex} fixed inset-0 z-40 overflow-y-auto px-4 py-6 sm:static sm:inset-auto sm:z-auto sm:overflow-hidden sm:rounded-3xl sm:px-8 sm:py-8`}
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
      <BackLink onClick={onExit} />

      <div className="relative z-10 mx-auto mt-4 flex w-full max-w-3xl flex-col gap-8">
        <div className="relative h-72 w-full shrink-0 sm:h-80 lg:h-96">
          {viewMode === "scene" ? (
            <ShowroomScene
              ref={sceneRef}
              onAdvance={advanceImage}
              currentImage={photos[index % photos.length]?.url ?? PLACEHOLDER}
              nextImage={photos[(index + 1) % photos.length]?.url ?? PLACEHOLDER}
            />
          ) : (
            <div className="absolute inset-0 overflow-hidden rounded-2xl bg-black/5" {...mediaSwipe.bind}>
              {current.kind === "video" ? (
                <video src={current.url} controls className="h-full w-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL, can't be allowlisted for next/image
                <img
                  src={current.url}
                  alt={product.name}
                  draggable={false}
                  className={`h-full w-full select-none object-cover ${
                    mediaSwipe.dragging ? "" : "transition-transform duration-200"
                  }`}
                  style={{ transform: `translateX(${mediaSwipe.offset}px)` }}
                />
              )}
              {media.length > 1 ? (
                <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2">
                  {media.map((m, i) => (
                    <span
                      key={m.url + i}
                      className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-white" : "bg-white/40"}`}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          )}

          {/* Both overlay buttons live directly on the media box — right by
              the viewpoint, not buried in the details panel below where
              they'd need scrolling to reach on a short viewport. */}
          {viewMode === "scene" && product.preview_video_url ? (
            <button
              type="button"
              onClick={() => setVideoOpen(true)}
              aria-label="Watch preview video"
              // Solid brand orange, not the ink token — ink flips light↔dark
              // for text/outline use, which would turn this into a pale
              // pill instead of a solid accent button under dark mode.
              className="absolute bottom-3 right-3 z-10 flex items-center gap-2 rounded-full bg-brand-600/90 px-3 py-2 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-brand-600"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M8 5.5v13l11-6.5-11-6.5Z" />
              </svg>
              Watch preview
            </button>
          ) : null}

          {extraMedia.length > 0 ? (
            <button
              type="button"
              onClick={() => setGalleryOpen(true)}
              className="absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-full bg-black/60 px-3 py-2 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-black/75"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 7.5A2.25 2.25 0 0 1 4.5 5.25h4.5l1.5 2.25h7.25A2.25 2.25 0 0 1 20 9.75v7A2.25 2.25 0 0 1 17.75 19H4.5a2.25 2.25 0 0 1-2.25-2.25v-9.25Z"
                />
              </svg>
              More details
            </button>
          ) : null}
        </div>

        <div className="flex flex-col gap-4 text-showroom-ink">
          {media.length > 1 || (viewMode === "scene" && photos.length > 1) ? (
            (() => {
              // Scene mode only cycles through `photos` — the nav/counter
              // must agree with that, not with `media.length`.
              const cycleLength = viewMode === "scene" ? photos.length : media.length;
              return (
                <div className="flex items-center gap-2">
                  <ArrowButton
                    direction="prev"
                    onClick={() => stepImage(-1)}
                  />
                  <ArrowButton
                    direction="next"
                    onClick={() => stepImage(1)}
                  />
                  <span className="ml-1 text-xs uppercase tracking-widest text-showroom-ink/60">
                    {(index % cycleLength) + 1} / {cycleLength}
                  </span>
                </div>
              );
            })()
          ) : null}

          <h2 className="text-4xl font-extrabold leading-tight sm:text-5xl">{product.name}</h2>

          {product.description ? (
            <p className="whitespace-pre-line text-sm text-showroom-ink/60 sm:text-base">{product.description}</p>
          ) : null}

          {(() => {
            const selectedVariant = product.variants.find((v) => v.id === selectedVariantId) ?? null;
            // A selected variant's own price overrides the product's base
            // price — see ProductVariant.price's comment in lib/types.ts.
            const effectivePrice = selectedVariant?.price ?? product.price ?? null;
            if (!showPrices || effectivePrice == null) {
              return <p className="text-lg font-semibold text-showroom-ink/70">Pricing confirmed after review</p>;
            }
            const amount = currency.format(effectivePrice);
            return (
              <p className="text-2xl font-bold tabular-nums text-brand-600 dark:text-brand-400 sm:text-3xl">
                {!selectedVariant && product.variants.length > 0 ? (
                  <span className="mr-2 text-sm font-medium text-showroom-ink/60">From</span>
                ) : null}
                {amount}
              </p>
            );
          })()}

          {product.variants.length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs uppercase tracking-widest text-showroom-ink/60">Choose a size</p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => {
                  const selected = v.id === selectedVariantId;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVariantId(selected ? "" : v.id)}
                      aria-pressed={selected}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        // Solid brand orange when selected, not the ink
                        // token — a solid accent shouldn't flip light↔dark
                        // the way ink (built for text) does.
                        selected
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "border-showroom-ink/40 bg-showroom-ink/5 text-showroom-ink hover:bg-showroom-ink/15"
                      }`}
                    >
                      {v.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
        <Link
          href={`/client-side/new?category=${category.id}&product=${product.id}${
            selectedVariantId ? `&variant=${selectedVariantId}` : ""
          }`}
        >
          <Button variant="primary" className="w-full sm:w-auto">
            Place an order
          </Button>
        </Link>
      </div>

      {videoOpen && product.preview_video_url ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setVideoOpen(false)}
        >
          <div className="relative w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setVideoOpen(false)}
              aria-label="Close preview video"
              className="absolute -top-10 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-lg text-white hover:bg-white/20"
            >
              ✕
            </button>
            <video src={product.preview_video_url} controls autoPlay className="w-full rounded-xl" />
          </div>
        </div>
      ) : null}

      {galleryOpen ? (
        <MoreDetailsGallery
          media={extraMedia}
          productName={product.name}
          onClose={closeGallery}
          lightboxIndex={lightboxIndex}
          onOpenLightbox={setLightboxIndex}
          onCloseLightbox={() => setLightboxIndex(null)}
        />
      ) : null}
    </div>
  );
}
