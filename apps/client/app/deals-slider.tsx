"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Swiper as SwiperInstance } from "swiper";
import { A11y, Autoplay, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";

import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { offerBadge, type Offer, type PendingOffer } from "@repo/lib/discounts/core";
import type { Product } from "@repo/lib/types";

import "swiper/css";
import "swiper/css/pagination";

/** Cards in the ring at least: enough to fill a wide screen on both sides of the middle one. */
const MIN_CARDS = 8;

// From sm up, a card is as wide as the screen's height allows, so the title,
// the whole middle card and Continue fit without scrolling on a laptop: the
// photo (square there) gets the height left after ~27rem of title, card text,
// dots and Continue; at most 20rem wide, at least 13rem.
const CARD_WIDTH = "clamp(13rem, calc(100dvh - 26rem), 20rem)";

/** A product on the running discount, with the order form's link for it. */
export interface Deal {
  product: Pick<Product, "id" | "name" | "slug" | "description" | "display_image_url">;
  categoryId: string;
  /** The product's own offer, or its best size's ("From …"); without prices when it's priced on a call. */
  offer: Offer | PendingOffer;
  fromSizes: boolean;
}

// "Seen this visit": once the client passes the welcome, it stays away until
// the app is opened again (sessionStorage lasts as long as the tab or the
// installed app's window). Kept outside React so every reader agrees.
const SEEN_KEY = "aming:deals-welcome-seen";
const seenListeners = new Set<() => void>();

let seenNow = false;

function seen(): boolean {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    // Storage blocked: show it, and let Continue hide it for this page.
    return seenNow;
  }
}

function markSeen() {
  seenNow = true;
  try {
    window.sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Storage blocked: hidden until the page is reloaded.
  }
  seenListeners.forEach((l) => l());
}

function subscribeSeen(listener: () => void) {
  seenListeners.add(listener);
  return () => seenListeners.delete(listener);
}

// What a client sees first when they open the app while a discount runs
// (Black November): over the dashboard, its products as a row of cards, the
// one in the middle large and dark, the ones beside it smaller and dimmed.
// It moves on by itself every few seconds, pauses while touched, and can be
// swiped or stepped with the arrows. Each card shows the deal (old price
// crossed out) and goes straight to the order form with that product picked.
// Continue (or ✕, or Escape) passes it to the dashboard, once per visit.
// Shown only when there are deals (apps/client/app/page.tsx).
export function DealsWelcome({ title, deals, showPrices }: { title: string; deals: Deal[]; showPrices: boolean }) {
  // Hidden on the server and until the browser says whether it was seen.
  const open = !useSyncExternalStore(subscribeSeen, seen, () => true);

  useEffect(() => {
    if (!open) return;
    // The dashboard behind doesn't scroll while the welcome is up.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && markSeen();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[100] overflow-y-auto bg-background/95 backdrop-blur-sm">
      <button
        type="button"
        onClick={markSeen}
        aria-label="Close"
        className="fixed right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-surface text-xl shadow-theme-sm hover:bg-gray-100 dark:hover:bg-white/10"
      >
        ✕
      </button>
      <div className="flex min-h-full flex-col justify-center py-10 sm:py-4">
        <DealsSlider title={title} deals={deals} showPrices={showPrices} />
        <div className="mt-6 flex justify-center px-4 sm:mt-4">
          <button type="button" onClick={markSeen} className="min-h-11 rounded-full bg-gray-950 px-8 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-white/90">
            Continue to my dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

function DealsSlider({ title, deals, showPrices }: { title: string; deals: Deal[]; showPrices: boolean }) {
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const [swiper, setSwiper] = useState<SwiperInstance | null>(null);
  // Always an endless ring: with only a few deals, they repeat until there
  // are enough cards for both sides of the middle one (Swiper's loop needs them).
  const ring = Array.from({ length: Math.ceil(MIN_CARDS / deals.length) }, () => deals).flat();

  return (
    <section className="overflow-hidden" style={{ "--deal-w": CARD_WIDTH } as React.CSSProperties}>
      <div className="mb-6 px-4 text-center sm:mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-500">On now</p>
        <h2 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
        <p className="mt-1 text-sm text-muted">Order these at the lower price while the deal lasts.</p>
      </div>
      <div className="relative">
        <Swiper
          modules={[A11y, Autoplay, Pagination]}
          onSwiper={setSwiper}
          centeredSlides
          slidesPerView="auto"
          spaceBetween={16}
          loop
          speed={500}
          autoplay={{ delay: 4500, disableOnInteraction: false, pauseOnMouseEnter: true }}
          // A dot per product; none when the ring repeats them (dots would count copies).
          pagination={ring.length === deals.length ? { clickable: true } : false}
          className="!pb-9"
          style={
            {
              "--swiper-pagination-color": "var(--color-brand-500)",
              "--swiper-pagination-bottom": "0px",
            } as React.CSSProperties
          }
        >
          {ring.map((deal, i) => (
            // `group`: the card styles itself from Swiper's swiper-slide-active class.
            <SwiperSlide key={`${deal.product.id}-${i}`} className="group !w-[70%] max-w-80 py-2 sm:!w-[var(--deal-w)]">
              <DealCard deal={deal} money={money} showPrices={showPrices} />
            </SwiperSlide>
          ))}
        </Swiper>
        {/* Arrows from sm up, right beside the middle card (on a phone the cards are swiped). */}
        <ArrowButton side="prev" onClick={() => swiper?.slidePrev()} />
        <ArrowButton side="next" onClick={() => swiper?.slideNext()} />
      </div>
    </section>
  );
}

function ArrowButton({ side, onClick }: { side: "prev" | "next"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "prev" ? "Previous deal" : "Next deal"}
      className={`absolute top-[calc(50%-1.125rem)] z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white text-gray-950 shadow-theme-lg ring-1 ring-black/10 transition hover:scale-105 hover:bg-gray-50 sm:flex dark:bg-gray-800 dark:text-white dark:ring-white/15 dark:hover:bg-gray-700 ${
        side === "prev" ? "left-[calc(50%-var(--deal-w)/2-1.5rem)]" : "right-[calc(50%-var(--deal-w)/2-1.5rem)]"
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
        <path d={side === "prev" ? "M15 18l-6-6 6-6" : "M9 6l6 6-6 6"} />
      </svg>
    </button>
  );
}

function DealCard({ deal, money, showPrices }: { deal: Deal; money: (n: number) => string; showPrices: boolean }) {
  const { product, offer } = deal;
  return (
    <article className="flex h-full flex-col rounded-[2rem] bg-gray-500/70 p-2 text-white opacity-70 shadow-theme-sm transition duration-500 group-[.swiper-slide-active]:scale-100 group-[.swiper-slide-active]:bg-gray-950 group-[.swiper-slide-active]:opacity-100 group-[.swiper-slide-active]:shadow-theme-lg sm:scale-95 dark:bg-white/10 dark:group-[.swiper-slide-active]:bg-gray-900 dark:group-[.swiper-slide-active]:ring-1 dark:group-[.swiper-slide-active]:ring-white/20">
      <Link href={`/${encodeURIComponent(product.slug)}`} className="relative block aspect-[4/5] overflow-hidden sm:aspect-square rounded-[1.6rem] bg-gray-200 dark:bg-white/5">
        {product.display_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.display_image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : null}
        <span className="absolute left-3 top-3 rounded-full bg-error-600 px-3 py-1 text-xs font-bold tracking-wide text-white shadow-theme-xs">
          {offerBadge(offer, money)}
        </span>
      </Link>
      <div className="flex flex-1 flex-col items-center px-3 pb-3 pt-4 text-center sm:pt-3">
        <h3 className="line-clamp-1 text-lg font-semibold">{product.name}</h3>
        {product.description ? <p className="mt-1 line-clamp-2 text-sm text-white/70 sm:line-clamp-1">{product.description}</p> : null}
        {"price" in offer ? (
          showPrices ? (
            <p className="mt-3 flex flex-wrap items-baseline justify-center gap-x-2 sm:mt-2">
              {deal.fromSizes ? <span className="text-xs text-white/70">From</span> : null}
              <span className="text-sm text-white/60 line-through">{money(offer.listPrice)}</span>
              <span className="text-xl font-bold tabular-nums">{money(offer.price)}</span>
            </p>
          ) : null
        ) : (
          <p className="mt-3 text-sm text-white/80">Off the price we agree on your call</p>
        )}
        <div className="mt-auto pt-4 sm:pt-3">
          <Link
            href={`/new?category=${deal.categoryId}&product=${product.id}`}
            className="inline-flex min-h-11 items-center rounded-full bg-white/15 px-5 text-sm font-semibold hover:bg-white/25 group-[.swiper-slide-active]:bg-brand-500 group-[.swiper-slide-active]:hover:bg-brand-600"
          >
            Order now
          </Link>
        </div>
      </div>
    </article>
  );
}
