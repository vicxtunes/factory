"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import type { Product, ProductCategory } from "@/lib/types";

import type { ShowroomSceneHandle } from "./showroom-scene";

const ShowroomScene = dynamic(() => import("./showroom-scene").then((m) => m.ShowroomScene), {
  ssr: false,
  loading: () => <div className="absolute inset-0 flex items-center justify-center text-sm text-ink/50">Loading…</div>,
});

const MAX_CARDS = 12;

// Light studio sweep: pale wall, bright white spotlight, soft shadowed
// base. INK is the dark tone everything textual uses now that the
// backdrop is light.
const INK = "#1b2a4b";

interface StudioTheme {
  base: string;
  glow: string;
  floor: string;
}

const PALETTE: StudioTheme[] = [
  { base: "#f6f9ff", glow: "#ffffff",   floor: "#e6ecf8" }, // near-white blue
  { base: "#fff8f2", glow: "#ffffff",   floor: "#f4e4d6" }, // near-white peach
  { base: "#f3fcf6", glow: "#ffffff",   floor: "#e0efe6" }, // near-white mint
  { base: "#f9f5ff", glow: "#ffffff",   floor: "#e9e0f8" }, // near-white lavender
  { base: "#f2fbfd", glow: "#ffffff",   floor: "#dceef3" }, // near-white aqua
  { base: "#fff5f9", glow: "#ffffff",   floor: "#f5dfe9" }, // near-white blush
];

interface Card {
  product: Product;
  category: ProductCategory;
}

function shuffledCards(catalog: ProductCategory[]): Card[] {
  const all = catalog.flatMap((category) => category.products.map((product) => ({ product, category })));
  const shuffled = [...all];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, MAX_CARDS);
}

function ArrowButton({
  direction,
  onClick,
}: {
  direction: "prev" | "next";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === "prev" ? "Previous product" : "Next product"}
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
        aria-label="Exit free work mode"
        title="Exit (ESC)"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-[#1b2a4b]/40 bg-white/60 text-lg text-[#1b2a4b] backdrop-blur-sm transition-colors hover:bg-white/90"
      >
        ✕
      </button>
    </div>
  );
}

export function ShowroomFreeMode({
  catalog,
  onSelect,
  onExit,
}: {
  catalog: ProductCategory[];
  onSelect: (product: Product, category: ProductCategory) => void;
  onExit?: () => void;
}) {
  const cards = useMemo(() => shuffledCards(catalog), [catalog]);
  const [index, setIndex] = useState(0);
  const sceneRef = useRef<ShowroomSceneHandle>(null);

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
    if (!onExit) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onExit?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  if (cards.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
        <p className="rounded-[var(--radius)] border border-dashed border-border bg-surface p-4 text-sm text-muted">
          Nothing in the showroom yet.
        </p>
        {onExit ? <ExitButton onClick={onExit} /> : null}
      </div>
    );
  }

  const current = cards[index];
  const next = cards[(index + 1) % cards.length];
  const theme = PALETTE[index % PALETTE.length];

  function advance(direction: 1 | -1) {
    setIndex((i) => (i + direction + cards.length) % cards.length);
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto px-6 py-10 sm:px-10"
      style={
        {
          "--showroom-base": theme.base,
          "--showroom-glow": theme.glow,
          "--showroom-floor": theme.floor,
          // Spotlight at top, shadow at the bottom, mid tone underneath —
          // reads like a cyclorama wall lit from above.
          backgroundImage: `
            radial-gradient(115% 80% at 50% 6%,  var(--showroom-glow) 0%, transparent 58%),
            radial-gradient(130% 95% at 50% 112%, var(--showroom-floor) 0%, transparent 72%),
            linear-gradient(180deg, var(--showroom-base) 0%, var(--showroom-floor) 100%)
          `,
          transition:
            "--showroom-base 500ms ease, --showroom-glow 500ms ease, --showroom-floor 500ms ease",
        } as React.CSSProperties
      }
    >
      {onExit ? <ExitButton onClick={onExit} /> : null}

      <div className="pointer-events-none relative z-10 mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-8 py-6">
        {/* 3D scene — full width on top. Both planes use the shared
            placeholder texture; the transition is purely a motion effect. */}
        <div className="pointer-events-auto relative h-72 w-full shrink-0 sm:h-80 lg:h-96">
          <ShowroomScene ref={sceneRef} onAdvance={advance} />
        </div>

        {/* Details row: stacked on mobile, side by side from `lg` up. */}
        <div
          className="pointer-events-auto flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10"
          style={{ color: INK }}
        >
          {/* Left: copy + CTA */}
          <div className="flex flex-1 flex-col gap-4">
            <div className="flex items-center gap-2">
              <ArrowButton direction="prev" onClick={() => sceneRef.current?.advance(-1)} />
              <ArrowButton direction="next" onClick={() => sceneRef.current?.advance(1)} />
              <span className="ml-1 text-xs uppercase tracking-widest text-[#1b2a4b]/60">
                {index + 1} / {cards.length}
              </span>
            </div>

            <p className="truncate text-xs font-semibold uppercase tracking-widest text-[#1b2a4b]/60">
              {current.category.name}
            </p>

            <h2 className="line-clamp-2 min-h-[2.5em] text-4xl font-extrabold leading-tight sm:text-5xl">
              {current.product.name}
            </h2>

            <p className="line-clamp-1 min-h-[1.25rem] text-sm text-[#1b2a4b]/70">
              {current.category.attributes.length > 0
                ? `Customizable: ${current.category.attributes.map((a) => a.name).join(", ")}`
                : "\u00A0"}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Link href={`/client-side/new?category=${current.category.id}&product=${current.product.id}`}>
                <Button variant="primary">Place an order</Button>
              </Link>
              <button
                type="button"
                onClick={() => onSelect(current.product, current.category)}
                className="text-sm text-[#1b2a4b]/80 underline-offset-2 hover:underline"
              >
                View details
              </button>
            </div>
          </div>

          {/* Right: price + variants */}
          <div className="flex flex-col gap-4 lg:w-64 lg:shrink-0 lg:pt-1">
            <p className="text-3xl font-extrabold tabular-nums">
              {current.product.price != null ? `$${current.product.price.toFixed(2)}` : "Ask for pricing"}
            </p>

            <div className="min-h-[4.5rem]">
              {current.product.variants.length > 0 ? (
                <>
                  <p className="mb-1.5 text-xs uppercase tracking-widest text-[#1b2a4b]/60">
                    Choose an option
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {current.product.variants.map((v) => (
                      <span
                        key={v.id}
                        className="rounded-full border border-[#1b2a4b]/40 bg-white/40 px-3 py-1 text-xs font-medium"
                      >
                        {v.name}
                      </span>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Next product's corner label */}
      {cards.length > 1 ? (
        <button
          type="button"
          onClick={() => sceneRef.current?.advance(1)}
          className="pointer-events-auto fixed bottom-4 right-4 z-20 rounded-xl bg-white/70 px-3 py-2 text-left text-xs text-[#1b2a4b]/80 backdrop-blur-sm transition-colors hover:bg-white/90"
        >
          Next
          <span className="block max-w-[8rem] truncate font-semibold text-[#1b2a4b]">
            {next.product.name}
          </span>
        </button>
      ) : null}
    </div>
  );
}