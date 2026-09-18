"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import type { Product, ProductCategory, ShowroomViewMode } from "@/lib/types";

import type { ShowroomSceneHandle } from "./showroom-scene";

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
}: {
  media: ShowcaseMedia[];
  productName: string;
  onClose: () => void;
}) {
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
                // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL, can't be allowlisted for next/image
                <img src={m.url} alt="" className="w-full" />
              )}
            </div>
          ))}
        </div>
      </div>
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
  onExit,
}: {
  product: Product;
  category: ProductCategory;
  // Boss-configurable (dashboard Products page): whether the image area is
  // the scroll-driven 3D scene or a plain photo/video carousel. The scene
  // can only flip through actual photos (WebGL textures need static
  // images), so it silently drops any video; the carousel shows everything.
  viewMode: ShowroomViewMode;
  onExit: () => void;
}) {
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
  const sceneRef = useRef<ShowroomSceneHandle>(null);

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

  // ESC closes whichever overlay is open, otherwise leaves the product view.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (videoOpen) setVideoOpen(false);
      else if (galleryOpen) setGalleryOpen(false);
      else onExit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [videoOpen, galleryOpen, onExit]);

  const current = media[index] ?? media[0];

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
            <div className="absolute inset-0 overflow-hidden rounded-2xl bg-black/5">
              {current.kind === "video" ? (
                <video src={current.url} controls className="h-full w-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL, can't be allowlisted for next/image
                <img src={current.url} alt={product.name} className="h-full w-full object-cover" />
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

        <div className="flex flex-col gap-6 text-showroom-ink lg:flex-row lg:items-start lg:gap-10">
          <div className="flex flex-1 flex-col gap-4">
            {(() => {
              // Scene mode only ever cycles through `photos` (the preview
              // video is unreachable from it except via the overlay
              // button) — the nav/counter must agree with that, not with
              // `media.length`, or arrows would show a count that never
              // advances.
              const cycleLength = viewMode === "scene" ? photos.length : media.length;
              return cycleLength > 1 ? (
                <div className="flex items-center gap-2">
                  <ArrowButton
                    direction="prev"
                    onClick={() => (viewMode === "scene" ? sceneRef.current?.advance(-1) : advanceImage(-1))}
                  />
                  <ArrowButton
                    direction="next"
                    onClick={() => (viewMode === "scene" ? sceneRef.current?.advance(1) : advanceImage(1))}
                  />
                  <span className="ml-1 text-xs uppercase tracking-widest text-showroom-ink/60">
                    {(index % cycleLength) + 1} / {cycleLength}
                  </span>
                </div>
              ) : null;
            })()}

            <p className="truncate text-xs font-semibold uppercase tracking-widest text-showroom-ink/60">
              {category.name}
            </p>

            <h2 className="line-clamp-2 min-h-[2.5em] text-4xl font-extrabold leading-tight sm:text-5xl">
              {product.name}
            </h2>

            <p className="line-clamp-1 min-h-[1.25rem] text-sm text-showroom-ink/70">
              {category.attributes.length > 0
                ? `Customizable: ${category.attributes.map((a) => a.name).join(", ")}`
                : " "}
            </p>

          </div>

          <div className="flex flex-col gap-4 lg:w-64 lg:shrink-0 lg:pt-1">
            <p className="text-sm font-medium text-showroom-ink/70">Pricing confirmed after review</p>

            <div className="min-h-[4.5rem]">
              {product.variants.length > 0 ? (
                <>
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
                            // token — same reasoning as the "Watch preview"
                            // button above: a solid accent shouldn't flip
                            // light↔dark the way ink (built for text) does.
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
                </>
              ) : null}
            </div>

            {category.attributes.length > 0 ? (
              <div>
                <p className="mb-1.5 text-xs uppercase tracking-widest text-showroom-ink/60">Customize</p>
                <ul className="space-y-1 text-xs text-showroom-ink/70">
                  {category.attributes.map((a) => (
                    <li key={a.id}>
                      {a.name}
                      {a.options?.length ? `: ${a.options.join(" / ")}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>

        {/* Last in the queue of display, deliberately — after the client's
            read through the name, size options and customization, not
            competing with those for attention up top. */}
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
        <MoreDetailsGallery media={extraMedia} productName={product.name} onClose={() => setGalleryOpen(false)} />
      ) : null}
    </div>
  );
}
