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

// Light studio sweep: pale wall, bright white spotlight, soft shadowed
// base. INK is the dark tone everything textual uses now that the
// backdrop is light. Lifted from the original Free Walk deck (see git
// history) — same visual language, now themed per product instead of per
// shuffle position.
const INK = "#1b2a4b";

interface StudioTheme {
  base: string;
  glow: string;
  floor: string;
}

const PALETTE: StudioTheme[] = [
  { base: "#f6f9ff", glow: "#ffffff", floor: "#e6ecf8" }, // near-white blue
  { base: "#fff8f2", glow: "#ffffff", floor: "#f4e4d6" }, // near-white peach
  { base: "#f3fcf6", glow: "#ffffff", floor: "#e0efe6" }, // near-white mint
  { base: "#f9f5ff", glow: "#ffffff", floor: "#e9e0f8" }, // near-white lavender
  { base: "#f2fbfd", glow: "#ffffff", floor: "#dceef3" }, // near-white aqua
  { base: "#fff5f9", glow: "#ffffff", floor: "#f5dfe9" }, // near-white blush
];

// Deterministic per-product theme pick (was `index % PALETTE.length` when
// this was driven by a shuffled deck position — a product has no such index
// on its own, so hash its id instead, same effect: stable, varied colors).
function paletteFor(id: string): StudioTheme {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
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
      className="flex h-9 w-9 items-center justify-center rounded-full border border-[#1b2a4b]/40 text-[#1b2a4b] transition-colors hover:bg-[#1b2a4b]/10"
    >
      {direction === "prev" ? "‹" : "›"}
    </button>
  );
}

function ExitButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="group fixed right-4 top-4 z-20 flex items-center gap-2 sm:right-6 sm:top-6">
      <span
        className="pointer-events-none rounded-full bg-[#1b2a4b]/15 px-3 py-1 text-xs font-medium text-[#1b2a4b]/80 backdrop-blur-sm transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100"
        aria-hidden="true"
      >
        Press ESC to exit
      </span>
      <button
        type="button"
        onClick={onClick}
        aria-label="Close product view"
        title="Close (ESC)"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-[#1b2a4b]/40 bg-white/60 text-lg text-[#1b2a4b] backdrop-blur-sm transition-colors hover:bg-white/90"
      >
        ✕
      </button>
    </div>
  );
}

// Full-screen studio view for one specific product — the client lands here
// by clicking a product card in the regular showroom grid (see
// showroom-content.tsx). Visually this is the old "Free Walk" per-card
// layout (studio background, big image area, size picker), just locked to
// a single product instead of scrolling through a shuffled deck of many —
// that shuffled-browsing feature is retired (see git history), but its
// look lives on here, and its 3D scene component is reused as one of two
// interchangeable image displays (see `viewMode`).
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
  const theme = useMemo(() => paletteFor(product.id), [product.id]);
  const media = useMemo<ShowcaseMedia[]>(() => {
    const list: ShowcaseMedia[] = [];
    if (product.display_image_url) list.push({ url: product.display_image_url, kind: "photo" });
    for (const m of product.media) list.push({ url: m.secure_url, kind: m.kind });
    return list.length > 0 ? list : [{ url: PLACEHOLDER, kind: "photo" }];
  }, [product]);
  const photos = useMemo(() => media.filter((m) => m.kind === "photo"), [media]);

  const [index, setIndex] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const sceneRef = useRef<ShowroomSceneHandle>(null);

  function advanceImage(direction: 1 | -1) {
    const len = viewMode === "scene" ? photos.length : media.length;
    setIndex((i) => (i + direction + len) % len);
  }

  // Body scroll lock with scrollbar compensation, so the page underneath
  // doesn't shift when the overlay opens or closes.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevPadding = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPadding;
    };
  }, []);

  // ESC exits the fullscreen overlay.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onExit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  const current = media[index] ?? media[0];

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto px-6 py-10 sm:px-10"
      style={
        {
          "--showroom-base": theme.base,
          "--showroom-glow": theme.glow,
          "--showroom-floor": theme.floor,
          backgroundImage: `
            radial-gradient(115% 80% at 50% 6%,  var(--showroom-glow) 0%, transparent 58%),
            radial-gradient(130% 95% at 50% 112%, var(--showroom-floor) 0%, transparent 72%),
            linear-gradient(180deg, var(--showroom-base) 0%, var(--showroom-floor) 100%)
          `,
        } as React.CSSProperties
      }
    >
      <ExitButton onClick={onExit} />

      <div className="pointer-events-none relative z-10 mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-8 py-6">
        <div className="pointer-events-auto relative h-72 w-full shrink-0 sm:h-80 lg:h-96">
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
        </div>

        <div
          className="pointer-events-auto flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10"
          style={{ color: INK }}
        >
          <div className="flex flex-1 flex-col gap-4">
            {media.length > 1 ? (
              <div className="flex items-center gap-2">
                <ArrowButton
                  direction="prev"
                  onClick={() => (viewMode === "scene" ? sceneRef.current?.advance(-1) : advanceImage(-1))}
                />
                <ArrowButton
                  direction="next"
                  onClick={() => (viewMode === "scene" ? sceneRef.current?.advance(1) : advanceImage(1))}
                />
                <span className="ml-1 text-xs uppercase tracking-widest text-[#1b2a4b]/60">
                  {(index % media.length) + 1} / {media.length}
                </span>
              </div>
            ) : null}

            <p className="truncate text-xs font-semibold uppercase tracking-widest text-[#1b2a4b]/60">
              {category.name}
            </p>

            <h2 className="line-clamp-2 min-h-[2.5em] text-4xl font-extrabold leading-tight sm:text-5xl">
              {product.name}
            </h2>

            <p className="line-clamp-1 min-h-[1.25rem] text-sm text-[#1b2a4b]/70">
              {category.attributes.length > 0
                ? `Customizable: ${category.attributes.map((a) => a.name).join(", ")}`
                : " "}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Link
                href={`/client-side/new?category=${category.id}&product=${product.id}${
                  selectedVariantId ? `&variant=${selectedVariantId}` : ""
                }`}
              >
                <Button variant="primary">Place an order</Button>
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:w-64 lg:shrink-0 lg:pt-1">
            <p className="text-sm font-medium text-[#1b2a4b]/70">Pricing confirmed after review</p>

            <div className="min-h-[4.5rem]">
              {product.variants.length > 0 ? (
                <>
                  <p className="mb-1.5 text-xs uppercase tracking-widest text-[#1b2a4b]/60">Choose a size</p>
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
                            selected
                              ? "border-[#1b2a4b] bg-[#1b2a4b] text-white"
                              : "border-[#1b2a4b]/40 bg-white/40 text-[#1b2a4b] hover:bg-white/70"
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
                <p className="mb-1.5 text-xs uppercase tracking-widest text-[#1b2a4b]/60">Customize</p>
                <ul className="space-y-1 text-xs text-[#1b2a4b]/70">
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
      </div>
    </div>
  );
}
