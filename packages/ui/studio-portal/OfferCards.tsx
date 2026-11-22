"use client";

/* eslint-disable @next/next/no-img-element -- signed storage URLs, already resized */

import Link from "next/link";
import { useState } from "react";
import { animated, to, useInView, useReducedMotion, useSpring } from "@react-spring/web";

/** A service or product on the studio's landing page, its prices already written out. */
export interface OfferCard {
  id: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  href: string;
  /** Its cheapest package after any deal ("UGX 150,000"); null when prices are hidden or it has none. */
  from: string | null;
  /** The same before the deal, when one is running. */
  was: string | null;
  dealPercent: number | null;
  /** How many packages (services) or sizes (products). */
  options: number;
  /** Its category, shown on the card ("Weddings", "Photo books"). */
  category: string;
}

// The studio's landing page cards (owner, 2026-11-21). Services: tall photo
// cards that lean towards the pointer, with the price and Book. Products: a
// lighter shop card, picture on top, sizes and Order. Each rises into view
// as it's scrolled to; nothing moves for people who ask for less motion.
export function OfferGrid({ kind, cards }: { kind: "service" | "product"; cards: OfferCard[] }) {
  return (
    <ul className={`grid gap-4 sm:gap-5 ${kind === "service" ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-2 lg:grid-cols-4 xl:grid-cols-5"}`}>
      {cards.map((c, i) => (
        <Reveal key={c.id} index={i}>
          {kind === "service" ? <ServiceCard card={c} /> : <ProductCard card={c} />}
        </Reveal>
      ))}
    </ul>
  );
}

/** Fades a card up the first time it scrolls into view, a little after the one before it. */
function Reveal({ index, children }: { index: number; children: React.ReactNode }) {
  const still = useReducedMotion() ?? false;
  const [ref, inView] = useInView({ rootMargin: "0px 0px -10% 0px", once: true });
  const style = useSpring({
    opacity: inView || still ? 1 : 0,
    y: inView || still ? 0 : 48,
    delay: still ? 0 : (index % 4) * 90,
    immediate: still,
    config: { tension: 200, friction: 24 },
  });
  return (
    <animated.li ref={ref} style={{ opacity: style.opacity, transform: style.y.to((y) => `translateY(${y}px)`) }}>
      {children}
    </animated.li>
  );
}

/** Leans towards the pointer (desktop) and springs back when it leaves. */
function useTilt(max: number) {
  const still = useReducedMotion() ?? false;
  const [spring, api] = useSpring(() => ({ rx: 0, ry: 0, s: 1, config: { tension: 300, friction: 20 } }));
  return {
    transform: to([spring.rx, spring.ry, spring.s], (rx, ry, s) => `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${s})`),
    handlers: still
      ? {}
      : {
          onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
            if (e.pointerType !== "mouse") return;
            const r = e.currentTarget.getBoundingClientRect();
            const px = (e.clientX - r.left) / r.width - 0.5;
            const py = (e.clientY - r.top) / r.height - 0.5;
            api.start({ rx: -py * max, ry: px * max, s: 1.02 });
          },
          onPointerLeave: () => api.start({ rx: 0, ry: 0, s: 1 }),
        },
  };
}

function ServiceCard({ card: c }: { card: OfferCard }) {
  const { transform, handlers } = useTilt(8);
  return (
    <animated.div
      {...handlers}
      style={{ transform }}
      className="group will-change-transform"
    >
      <Link href={c.href} className="relative block aspect-[4/5] overflow-hidden rounded-3xl bg-neutral-900 text-white shadow-theme-lg">
        {c.coverUrl ? (
          <Photo src={c.coverUrl} className="absolute inset-0 h-full w-full object-cover transition-[transform,opacity] duration-700 group-hover:scale-110" />
        ) : (
          // No photo yet: its initial, large, over the brand color.
          <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-brand-500 via-brand-700 to-neutral-950">
            <span aria-hidden className="absolute -right-6 -top-10 font-serif text-[16rem] leading-none text-white/10">
              {c.name.trim().charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
        <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-2">
          <span className="truncate rounded-full bg-black/40 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.15em] backdrop-blur">{c.category}</span>
          {c.dealPercent ? <span className="shrink-0 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold tracking-wide shadow-md">−{c.dealPercent}% now</span> : null}
        </div>
        <div className="absolute inset-x-0 bottom-0 p-5">
          <h3 className="font-serif text-2xl uppercase leading-tight">{c.name}</h3>
          {c.description ? <p className="mt-1.5 line-clamp-2 text-sm text-white/75">{c.description}</p> : null}
          <div className="mt-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              {c.from ? (
                <>
                  <p className="text-[10px] uppercase tracking-[0.25em] text-white/60">From</p>
                  <p className="font-semibold tnum">
                    {c.from}
                    {c.was ? <span className="ml-2 text-xs font-normal text-white/50 line-through">{c.was}</span> : null}
                  </p>
                </>
              ) : (
                <p className="text-xs uppercase tracking-[0.2em] text-white/70">
                  {c.options} package{c.options === 1 ? "" : "s"}
                </p>
              )}
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-neutral-900 transition-colors group-hover:bg-brand-600 group-hover:text-white">
              Book
              <Arrow />
            </span>
          </div>
        </div>
      </Link>
    </animated.div>
  );
}

function ProductCard({ card: c }: { card: OfferCard }) {
  const still = useReducedMotion() ?? false;
  const [lift, api] = useSpring(() => ({ y: 0, config: { tension: 320, friction: 18 } }));
  return (
    <animated.div
      onPointerEnter={still ? undefined : () => api.start({ y: -8 })}
      onPointerLeave={still ? undefined : () => api.start({ y: 0 })}
      style={{ transform: lift.y.to((y) => `translateY(${y}px)`) }}
      className="group h-full"
    >
      <Link href={c.href} className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs transition-shadow group-hover:shadow-theme-lg">
        <div className="relative aspect-square overflow-hidden bg-neutral-100 dark:bg-white/5">
          {c.coverUrl ? (
            <Photo src={c.coverUrl} className="h-full w-full object-cover transition-[transform,opacity] duration-500 group-hover:scale-105" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted">No picture yet</div>
          )}
          {c.dealPercent ? <span className="absolute left-2 top-2 rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-bold text-white">−{c.dealPercent}%</span> : null}
        </div>
        <div className="flex flex-1 flex-col p-3 sm:p-4">
          <p className="truncate text-[11px] font-medium uppercase tracking-[0.15em] text-brand-600">{c.category}</p>
          <h3 className="mt-0.5 line-clamp-2 text-sm font-semibold sm:text-base">{c.name}</h3>
          <p className="mt-0.5 text-xs text-muted">
            {c.options} size{c.options === 1 ? "" : "s"}
          </p>
          <div className="mt-auto flex items-end justify-between gap-2 pt-3">
            <div className="min-w-0">
              {c.from ? (
                <>
                  <p className="truncate text-sm font-semibold tnum">{c.from}</p>
                  {c.was ? <p className="truncate text-xs text-muted line-through">{c.was}</p> : null}
                </>
              ) : null}
            </div>
            <span className="shrink-0 rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors group-hover:bg-brand-600 dark:bg-white dark:text-neutral-900">
              Order
            </span>
          </div>
        </div>
      </Link>
    </animated.div>
  );
}

/**
 * A card's photo (its small copy): fetched only when near the screen, and
 * hidden until it's whole, then faded in, so a slow line never shows it
 * drawing in pieces. Already there when the page wakes up: shown at once.
 */
function Photo({ src, className }: { src: string; className: string }) {
  const [ready, setReady] = useState(false);
  return (
    <img
      ref={(img) => {
        if (img?.complete && img.naturalWidth) setReady(true);
      }}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onLoad={() => setReady(true)}
      className={`${className} ${ready ? "opacity-100" : "opacity-0"}`}
    />
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-4 w-4" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The studio's public albums under "Our work": a photo wall, each opening its album. */
export function AlbumGrid({ albums }: { albums: { id: string; title: string; coverUrl: string | null; href: string; count: number }[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
      {albums.map((a, i) => (
        <Reveal key={a.id} index={i}>
          <Link href={a.href} className={`group relative block overflow-hidden rounded-2xl bg-neutral-900 ${i % 5 === 0 ? "aspect-[4/5]" : "aspect-square"}`}>
            {a.coverUrl ? <Photo src={a.coverUrl} className="absolute inset-0 h-full w-full object-cover transition-[transform,opacity] duration-700 group-hover:scale-110" /> : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-3 text-white sm:p-4">
              <p className="truncate font-semibold">{a.title}</p>
              <p className="text-xs text-white/70">
                {a.count} photo{a.count === 1 ? "" : "s"}
              </p>
            </div>
          </Link>
        </Reveal>
      ))}
    </ul>
  );
}
