"use client";

import type { ReactNode } from "react";
import { Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";

import type { MarketingSlide } from "@repo/lib/types";

import { MarketingSlideView } from "./marketing-carousel";

import "swiper/css";
import "swiper/css/pagination";

// The top of the home screen on phones and tablets: the Aming card first,
// then Aming's adverts, in one slider swiped sideways (dots under it). It
// doesn't move on its own, so the balance stays put until it's swiped away.
// From lg up the card and the adverts sit apart (apps/client/app/dashboard.tsx).
export function HomeSlider({ wallet, slides }: { wallet: ReactNode; slides: MarketingSlide[] }) {
  const cards = [
    ...(wallet ? [{ key: "wallet", body: wallet }] : []),
    ...slides.map((slide) => ({
      key: slide.id,
      body: (
        <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-theme-xs">
          <MarketingSlideView slide={slide} />
        </div>
      ),
    })),
  ];
  if (cards.length === 0) return null;
  if (cards.length === 1) return <>{cards[0].body}</>;
  return (
    <Swiper
      modules={[Pagination]}
      spaceBetween={12}
      autoHeight
      pagination={{ clickable: true }}
      // Room under the slides for the dots, in the brand color.
      className="!pb-7"
      style={{ "--swiper-pagination-color": "var(--color-brand-500)", "--swiper-pagination-bottom": "0px" } as React.CSSProperties}
    >
      {cards.map((card) => (
        <SwiperSlide key={card.key}>{card.body}</SwiperSlide>
      ))}
    </Swiper>
  );
}
