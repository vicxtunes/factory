"use client";

import type { ReactNode } from "react";
import { Autoplay, EffectFade } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";

import "swiper/css";
import "swiper/css/effect-fade";

// Fully automatic — no nav arrows/dots by request. Swiper handles the
// looping/autoplay/transition timing instead of hand-rolled CSS, so the
// cross-fade is a real GPU-eased transition rather than a translateX track.
export function Carousel({
  children,
  autoPlayMs = 6000,
}: {
  children: ReactNode[];
  autoPlayMs?: number;
}) {
  if (children.length === 0) return null;

  const multiple = children.length > 1;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
      <Swiper
        modules={[Autoplay, EffectFade]}
        effect="fade"
        fadeEffect={{ crossFade: true }}
        speed={800}
        loop={multiple}
        autoHeight
        allowTouchMove={multiple}
        autoplay={multiple ? { delay: autoPlayMs, disableOnInteraction: false, pauseOnMouseEnter: true } : false}
      >
        {children.map((child, i) => (
          <SwiperSlide key={i}>{child}</SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
