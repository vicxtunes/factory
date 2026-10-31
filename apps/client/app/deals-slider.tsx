"use client";

import Link from "next/link";
import { A11y, Autoplay, Navigation, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";

import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { offerBadge, type Offer } from "@repo/lib/discounts/core";
import type { Product } from "@repo/lib/types";

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";

/** Cards in the ring at least: enough to fill a wide screen on both sides of the middle one. */
const MIN_CARDS = 8;

/** A product on the running discount, with the order form's link for it. */
export interface Deal {
  product: Pick<Product, "id" | "name" | "slug" | "description" | "display_image_url">;
  categoryId: string;
  /** The product's own offer, or its best size's ("From …"). */
  offer: Offer;
  fromSizes: boolean;
}

// The top of the home screen while a discount runs (Black November): its
// products as a row of cards, the one in the middle large and dark, the ones
// beside it smaller and dimmed. It moves on by itself every few seconds,
// pauses while touched, and can be swiped or stepped with the arrows. Each
// card shows the deal (old price crossed out) and goes straight to the order
// form with that product picked. Shown only when there are deals
// (apps/client/app/page.tsx).
export function DealsSlider({ title, deals, showPrices }: { title: string; deals: Deal[]; showPrices: boolean }) {
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  // Always an endless ring: with only a few deals, they repeat until there
  // are enough cards for both sides of the middle one (Swiper's loop needs them).
  const ring = Array.from({ length: Math.ceil(MIN_CARDS / deals.length) }, () => deals).flat();

  return (
    <section aria-label={title} className="overflow-hidden">
      <div className="mb-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-500">On now</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
        <p className="mt-1 text-sm text-muted">Order these at the lower price while the deal lasts.</p>
      </div>
      <Swiper
        modules={[A11y, Autoplay, Navigation, Pagination]}
        centeredSlides
        slidesPerView="auto"
        spaceBetween={16}
        loop
        speed={500}
        autoplay={{ delay: 4500, disableOnInteraction: false, pauseOnMouseEnter: true }}
        navigation
        // A dot per product; none when the ring repeats them (dots would count copies).
        pagination={ring.length === deals.length ? { clickable: true } : false}
        // Arrows from sm up; on a phone the cards are swiped.
        className="!pb-9 [&_.swiper-button-next]:hidden [&_.swiper-button-prev]:hidden sm:[&_.swiper-button-next]:flex sm:[&_.swiper-button-prev]:flex"
        style={
          {
            "--swiper-pagination-color": "var(--color-brand-500)",
            "--swiper-pagination-bottom": "0px",
            "--swiper-navigation-size": "18px",
            "--swiper-navigation-color": "var(--color-gray-900)",
          } as React.CSSProperties
        }
      >
        {ring.map((deal, i) => (
          // `group`: the card styles itself from Swiper's swiper-slide-active class.
          <SwiperSlide key={`${deal.product.id}-${i}`} className="group !w-[70%] max-w-80 py-2 sm:!w-80">
            <DealCard deal={deal} money={money} showPrices={showPrices} />
          </SwiperSlide>
        ))}
      </Swiper>
    </section>
  );
}

function DealCard({ deal, money, showPrices }: { deal: Deal; money: (n: number) => string; showPrices: boolean }) {
  const { product, offer } = deal;
  return (
    <article className="flex h-full flex-col rounded-[2rem] bg-gray-500/70 p-2 text-white opacity-70 shadow-theme-sm transition duration-500 group-[.swiper-slide-active]:scale-100 group-[.swiper-slide-active]:bg-gray-950 group-[.swiper-slide-active]:opacity-100 group-[.swiper-slide-active]:shadow-theme-lg sm:scale-95 dark:bg-white/10 dark:group-[.swiper-slide-active]:bg-gray-900">
      <Link href={`/${encodeURIComponent(product.slug)}`} className="relative block aspect-[4/5] overflow-hidden rounded-[1.6rem] bg-gray-200 dark:bg-white/5">
        {product.display_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.display_image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : null}
        <span className="absolute left-3 top-3 rounded-full bg-error-600 px-3 py-1 text-xs font-bold tracking-wide text-white shadow-theme-xs">
          {offerBadge(offer, money)}
        </span>
      </Link>
      <div className="flex flex-1 flex-col items-center px-3 pb-3 pt-4 text-center">
        <h3 className="line-clamp-1 text-lg font-semibold">{product.name}</h3>
        {product.description ? <p className="mt-1 line-clamp-2 text-sm text-white/70">{product.description}</p> : null}
        {showPrices ? (
          <p className="mt-3 flex flex-wrap items-baseline justify-center gap-x-2">
            {deal.fromSizes ? <span className="text-xs text-white/70">From</span> : null}
            <span className="text-sm text-white/60 line-through">{money(offer.listPrice)}</span>
            <span className="text-xl font-bold tabular-nums">{money(offer.price)}</span>
          </p>
        ) : null}
        <div className="mt-auto pt-4">
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
