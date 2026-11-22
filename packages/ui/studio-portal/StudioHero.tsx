"use client";

import { useEffect, useState, type ReactNode } from "react";
import { preload } from "react-dom";
import { animated, to, useReducedMotion, useScroll, useSpring, useTrail, type SpringValue } from "@react-spring/web";

/**
 * A studio's hero, after an owner-supplied flyer (2026-11-18): its best photo
 * full bleed with the headline and contact card, a slanted strip of more
 * photos, and a white panel with "Book a photo session" over its services.
 * Everything comes from the studio; phones stack the three, desktop sets them
 * side by side. Colors follow the studio's brand (BrandStyle).
 *
 * The studio's landing page opens on it (owner, 2026-11-21), with motion by
 * react-spring: the pieces spring in on arrival, and while scrolling the photo
 * sinks slower than the page, the strip rises against it and the arc turns
 * (parallax). Nothing moves for people who ask their device for less motion.
 */
export interface StudioHeroProps {
  name: string;
  /** Service categories, the headline's lines ("Photography", "Videography"…). */
  headline: string[];
  services: string[];
  phone: string | null;
  email: string | null;
  address: string | null;
  location: { lat: number; lng: number } | null;
  socials: { tiktok: string | null; instagram: string | null; facebook: string | null; linkedin: string | null };
  logoUrl: string | null;
  /** The first leads; the next five fill the strip. */
  photos: HeroPhoto[];
  bookHref: string;
  /** Top right: "Log in" or the signed-in client's way to their page. */
  account?: ReactNode;
}

/** A photo's small copy (600 px, ~50 KB) and its large one (2400 px, up to 700 KB). */
export interface HeroPhoto {
  small: string;
  large: string;
}

/**
 * Built for Uganda's slowest phones (owner, 2026-11-21: large photos drew in
 * pieces "like a puzzle"). The lead photo shows its small copy at once; the
 * large one downloads out of sight and replaces it only once it's whole and
 * decoded, and not at all on 2G or with data saving on.
 */
function useSharp(photo: HeroPhoto | undefined): string | undefined {
  const [sharp, setSharp] = useState<string | null>(null);
  const large = photo?.large;
  useEffect(() => {
    if (!large) return;
    const net = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (net?.saveData || net?.effectiveType === "slow-2g" || net?.effectiveType === "2g") return;
    let live = true;
    const img = new Image();
    img.src = large;
    img
      .decode()
      .then(() => live && setSharp(large))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [large]);
  return sharp === large && large ? large : photo?.small;
}

export function StudioHero({ name, headline, services, phone, email, address, location, socials, logoUrl, photos, bookHref, account }: StudioHeroProps) {
  const [lead, ...rest] = photos;
  // The small copy first, ahead of everything else on the page.
  if (lead) preload(lead.small, { as: "image", fetchPriority: "high" });
  const main = useSharp(lead);
  // The band always shows five: fewer photos repeat.
  const pool = (rest.length ? rest : lead ? [lead] : []).map((p) => p.small);
  const strip = pool.length ? Array.from({ length: 5 }, (_, i) => pool[i % pool.length]) : [];
  const links = reachLinks({ socials, phone, email, location });
  const lines = headline.length ? headline.slice(0, 3) : ["Photography"];
  const shownServices = services.slice(0, 12);

  // Motion. Reduced motion: everything starts where it ends and scrolling moves nothing.
  const still = useReducedMotion() ?? false;
  const { scrollY } = useScroll({ config: { tension: 280, friction: 40 } });
  const k = still ? 0 : 1;
  const enter = { immediate: still, config: { tension: 170, friction: 22 } };
  const intro = useTrail(4, { from: { opacity: 0, y: 36 }, to: { opacity: 1, y: 0 }, delay: 150, ...enter });
  const frames = useTrail(strip.length, { from: { opacity: 0, s: 0.7 }, to: { opacity: 1, s: 1 }, delay: 350, ...enter });
  const panel = useSpring({ from: { opacity: 0, x: 60 }, to: { opacity: 1, x: 0 }, delay: 250, ...enter });
  const list = useTrail(shownServices.length, { from: { opacity: 0, x: 24 }, to: { opacity: 1, x: 0 }, delay: 500, ...enter });
  const icons = useTrail(links.length, { from: { s: 0 }, to: { s: 1 }, delay: 700, ...enter, config: { tension: 300, friction: 14 } });
  const logo = useSpring({ from: { opacity: 0, y: -20 }, to: { opacity: 1, y: 0 }, ...enter });

  const photoMove = scrollY.to((y) => `translate3d(0, ${y * 0.4 * k}px, 0) scale(${1.12 + Math.min(y, 800) * 0.00012 * k})`);
  const textMove = scrollY.to((y) => `translate3d(0, ${y * 0.18 * k}px, 0)`);
  const textFade = scrollY.to((y) => 1 - Math.min(y / 650, 0.85) * k);
  const stripMove = scrollY.to((y) => `translate3d(0, ${-y * 0.22 * k}px, 0)`);
  const arcTurn = scrollY.to((y) => `rotate(${y * 0.05 * k}deg)`);
  const panelMove = to([scrollY, panel.x], (y, x) => `translate3d(${x}px, ${y * 0.08 * k}px, 0)`);

  return (
    <section className="relative isolate overflow-hidden bg-neutral-950 text-white lg:grid lg:min-h-[max(640px,92svh)] lg:grid-cols-[1.2fr_0.5fr_1fr]">
      {account ? <div className="absolute right-4 top-4 z-30 sm:right-6 sm:top-6">{account}</div> : null}
      {/* The lead photo, darkened towards the text; it sinks slower than the page. */}
      <div className="relative flex min-h-[600px] flex-col justify-end overflow-hidden p-6 pb-28 sm:min-h-[680px] sm:p-10 sm:pb-36 lg:col-span-2 lg:col-start-1 lg:row-start-1 lg:min-h-0 lg:pr-[38%]">
        {main ? (
          <animated.img src={main} alt="" fetchPriority="high" decoding="async" style={{ transform: photoMove }} className="absolute inset-0 -z-10 h-full w-full origin-top object-cover object-[50%_35%] will-change-transform" />
        ) : (
          // No photos yet: the brand's color, and its initials large behind the name.
          <animated.div aria-hidden style={{ transform: photoMove }} className="absolute inset-0 -z-10 origin-top overflow-hidden bg-gradient-to-br from-brand-500 via-brand-800 to-neutral-950">
            <span className="absolute -bottom-[0.15em] -left-[0.05em] select-none font-serif text-[clamp(12rem,38vw,34rem)] leading-none text-white/[0.07]">
              {initials(name)}
            </span>
          </animated.div>
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black via-black/60 to-black/10 lg:bg-none lg:bg-black/40" />
        {logoUrl ? (
          <animated.img
            src={logoUrl}
            alt={name}
            style={{ opacity: logo.opacity, transform: logo.y.to((y) => `translateY(${y}px)`) }}
            className="absolute left-6 top-6 h-14 w-auto max-w-44 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)] sm:left-10 sm:top-10 sm:h-20"
          />
        ) : null}
        {/* Desktop: the photo fades into the white panel instead of a hard edge. */}
        <div className="absolute inset-y-0 right-0 -z-10 hidden w-1/3 bg-gradient-to-r from-transparent via-white/60 to-white lg:block" />
        <animated.div style={{ transform: textMove, opacity: textFade }} className="will-change-transform">
          <animated.h1 style={rise(intro[0])} className="text-balance break-words font-serif text-[clamp(1.75rem,8vw,3.5rem)] uppercase leading-[0.95] lg:text-[clamp(2rem,4.2vw,4.5rem)]">
            {name}
          </animated.h1>
          <animated.p style={rise(intro[1])} className="mt-4 text-xs uppercase tracking-[0.25em] text-white/80 sm:text-sm">
            {lines.length > 1 ? `${lines.slice(0, -1).join(", ")} & ${lines[lines.length - 1]}` : lines[0]} <span className="text-brand-400">services</span>
          </animated.p>
          <animated.p style={rise(intro[2])} className="mt-4 max-w-md text-sm italic text-white/80 sm:text-base">
            However complex your story, or however simple you like it, we tell it the way it is: yours.
          </animated.p>
          <animated.a
            style={rise(intro[3])}
            href={bookHref}
            className="mt-6 inline-flex w-fit rounded-full bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-brand-700"
          >
            Book now
          </animated.a>
        </animated.div>
      </div>

      {/* The slanted strip: a row on phones, a column on desktop; it rises against the photo. */}
      {strip.length ? (
        <animated.div style={{ transform: stripMove }} className="relative z-10 bg-white py-6 will-change-transform lg:col-start-2 lg:row-start-1 lg:bg-transparent lg:py-0">
          <div className="flex -rotate-3 gap-0 overflow-x-auto border-y-4 border-white px-6 shadow-xl lg:absolute lg:inset-y-[-12%] lg:left-1/2 lg:w-44 lg:-translate-x-1/2 lg:rotate-[14deg] lg:flex-col lg:justify-center lg:gap-0 lg:overflow-visible lg:border-x-[6px] lg:border-y-0 lg:px-0 xl:w-52">
            {frames.map((f, i) => (
              <animated.img
                key={i}
                src={strip[i]}
                alt=""
                decoding="async"
                style={{ opacity: f.opacity, transform: f.s.to((s) => `scale(${s})`) }}
                className="h-36 w-28 shrink-0 object-cover lg:h-auto lg:min-h-0 lg:w-full lg:flex-1"
              />
            ))}
          </div>
        </animated.div>
      ) : null}

      {/* The booking panel, with the grey arc behind. */}
      <div className="relative overflow-hidden bg-white p-6 pb-28 text-neutral-900 sm:p-10 sm:pb-36 lg:col-start-3 lg:row-start-1 lg:flex lg:flex-col lg:justify-center lg:pl-16 lg:pr-12 xl:pl-20">
        <animated.div
          aria-hidden
          style={{ transform: arcTurn }}
          className="absolute -right-[40%] -top-[25%] h-[150%] w-[130%] rounded-full border-[30px] border-neutral-300 shadow-[inset_10px_0_18px_rgba(0,0,0,0.25),-8px_0_14px_rgba(0,0,0,0.15)]"
        />
        {links.length ? (
          <ul className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2 sm:right-5">
            {icons.map((ic, i) => {
              const l = links[i];
              return (
                <animated.li key={l.label} style={{ transform: ic.s.to((s) => `scale(${s})`) }}>
                  <a
                    href={l.href}
                    target={l.href.startsWith("http") ? "_blank" : undefined}
                    rel="noreferrer"
                    aria-label={l.label}
                    title={l.label}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-white shadow-md transition-transform hover:scale-110 hover:bg-brand-600"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                      <path d={l.d} />
                    </svg>
                  </a>
                </animated.li>
              );
            })}
          </ul>
        ) : null}
        <animated.div style={{ opacity: panel.opacity, transform: panelMove }} className="relative pr-12">
          <h2 className="text-5xl font-black uppercase leading-[0.9] tracking-tight sm:text-6xl">
            Book a<br />
            photo
            <br />
            <span className="text-brand-600">session</span>
          </h2>
          {shownServices.length ? (
            <ul className="mt-5 space-y-0.5 text-sm uppercase tracking-wide sm:text-base">
              {list.map((st, i) => (
                <animated.li key={shownServices[i]} style={{ opacity: st.opacity, transform: st.x.to((x) => `translateX(${x}px)`) }}>
                  {shownServices[i]}
                </animated.li>
              ))}
            </ul>
          ) : null}
          <p className="mt-6 max-w-xs text-xs uppercase tracking-[0.2em] text-neutral-600">
            Book a session with {name} today and get your <span className="text-brand-600">visual identity elevated.</span>
          </p>
          {phone || address ? (
            <div className="mt-5 w-fit max-w-full rounded-2xl bg-neutral-900 p-3 text-sm text-white">
              {phone ? (
                <a href={`tel:${phone.replace(/\s+/g, "")}`} className="block rounded-lg bg-white/10 px-3 py-1.5">
                  <span className="block text-[10px] uppercase tracking-[0.3em] text-white/70">Contact us via</span>
                  <span className="font-semibold tnum">{phone}</span>
                </a>
              ) : null}
              {address ? <p className="mt-1.5 truncate px-3 font-semibold uppercase">{address}</p> : null}
            </div>
          ) : null}
        </animated.div>
      </div>
      {/* The bottom edge melts into the page. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-32 bg-gradient-to-b from-transparent via-background/50 to-background sm:h-44" />
    </section>
  );
}

/** "Hercules Media Production" → "HM". */
/** Ways to reach the studio, from what it has filled in: its socials, WhatsApp, call, email, directions. */
export function reachLinks({ socials, phone, email, location }: Pick<StudioHeroProps, "socials" | "phone" | "email" | "location">) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  return [
    socials.instagram && { label: "Instagram", href: socials.instagram, d: INSTAGRAM },
    socials.tiktok && { label: "TikTok", href: socials.tiktok, d: TIKTOK },
    socials.facebook && { label: "Facebook", href: socials.facebook, d: FACEBOOK },
    socials.linkedin && { label: "LinkedIn", href: socials.linkedin, d: LINKEDIN },
    digits && { label: "WhatsApp", href: `https://wa.me/${digits}`, d: WHATSAPP },
    phone && { label: "Call", href: `tel:${phone.replace(/\s+/g, "")}`, d: PHONE },
    email && { label: "Email", href: `mailto:${email}`, d: MAIL },
    location && { label: "Directions", href: `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`, d: PIN },
  ].filter((l): l is { label: string; href: string; d: string } => !!l);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

/** A trail step's fade-and-rise as style. */
function rise(t: { opacity: SpringValue<number>; y: SpringValue<number> }) {
  return { opacity: t.opacity, transform: t.y.to((y) => `translateY(${y}px)`) };
}

const INSTAGRAM =
  "M12 2.2c3.2 0 3.6 0 4.8.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8C2.4 3.9 3.9 2.4 7.2 2.3c1.2-.1 1.6-.1 4.8-.1Zm0 4.7a5.1 5.1 0 1 0 0 10.2 5.1 5.1 0 0 0 0-10.2Zm0 8.4a3.3 3.3 0 1 1 0-6.6 3.3 3.3 0 0 1 0 6.6Zm5.3-9.8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z";
const TIKTOK =
  "M16.6 2h-3.3v13.3a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9.1a6.2 6.2 0 1 0 5.3 6.2V8.6a7.9 7.9 0 0 0 4.6 1.5V6.8a4.6 4.6 0 0 1-4.6-4.6Z";
const FACEBOOK = "M14 8V6.3c0-.8.2-1.3 1.4-1.3H17V2h-2.6C11.4 2 10.4 3.5 10.4 6v2H8v3h2.4v11H14V11h2.6l.4-3Z";
const LINKEDIN =
  "M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.5h4V21H3V9.5Zm6.5 0h3.8v1.6h.1a4.2 4.2 0 0 1 3.8-2c4 0 4.8 2.6 4.8 6V21h-4v-5.2c0-1.2 0-2.9-1.8-2.9s-2 1.4-2 2.8V21h-4V9.5Z";
const WHATSAPP =
  "M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 4.9 4.9 0 0 0 1 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6a2.6 2.6 0 0 0 1.7-1.2 2.1 2.1 0 0 0 .2-1.2c-.1-.1-.3-.2-.5-.3Z";
const PHONE =
  "M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.2 11.4 11.4 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .6 3.6 1 1 0 0 1-.3 1Z";
const MAIL = "M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4-8 5-8-5V6l8 5 8-5Z";
const PIN = "M12 2a7 7 0 0 0-7 7c0 5.3 7 13 7 13s7-7.7 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z";
