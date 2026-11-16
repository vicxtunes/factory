"use client";

import Link from "next/link";
import { useState } from "react";


import type { FeedItem } from "@repo/lib/studio-portal/core";
import { studioInitials } from "@repo/lib/studios/core";
import { matchesSearch } from "@repo/lib/search";

// The work on Aming's front page (landing.tsx): a search, then the work as
// big tiles, each one opening its studio's page for it. A screenful at a
// time with "Show more", so the rest of the page stays within reach.

const PAGE = 12;

export function ExploreFeed({ items, wrap }: { items: FeedItem[]; /** The page's width and gutters, so the edges line up. */ wrap: string }) {
  const [query, setQuery] = useState("");
  const [count, setCount] = useState(PAGE);
  const matching = items.filter((item) => matchesSearch(query, [item.title, item.business.name]));
  const shown = matching.slice(0, count);

  return (
    <div className={`${wrap} mt-8`}>
      <label className="relative block sm:w-80">
        <span className="sr-only">Search work</span>
        <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="9" r="6" />
          <path d="m14 14 4 4" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCount(PAGE);
          }}
          placeholder="Search studios and their work…"
          className="h-11 w-full rounded-full border border-border bg-surface pr-4 pl-10 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
      </label>

      <div className="mt-8">
        {shown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center">
            <p className="font-semibold">{items.length === 0 ? "Work from businesses on Aming shows here" : "Nothing matches that yet"}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">
              {items.length === 0
                ? "Studios on Aming can show their albums and services here."
                : "Try another word."}
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-x-6 gap-y-8 min-[520px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((item) => (
              <li key={item.id}>
                <WorkTile item={item} />
              </li>
            ))}
          </ul>
        )}
        {matching.length > count ? (
          <div className="mt-10 flex justify-center">
            <button
              type="button"
              onClick={() => setCount((c) => c + PAGE)}
              className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-border bg-surface px-5 text-sm font-semibold hover:border-muted"
            >
              Show more ({matching.length - count} more)
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function WorkTile({ item }: { item: FeedItem }) {
  const { business } = item;
  // prefetch={false}: a screenful of tiles prefetched every work and studio
  // page at once, and for a signed-in visitor whose token had just expired
  // each prefetch tried to refresh the same session; Supabase refused the
  // duplicates or timed out, and the tapped tile waited minutes behind them.
  return (
    <article>
      <Link href={item.href} prefetch={false} className="group relative block overflow-hidden rounded-lg bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed storage link, already resized */}
        <img src={item.coverUrl} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-4 pt-10 pb-3 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100">
          <span className="truncate font-semibold">{item.title}</span>
          <span className="shrink-0 text-xs text-white/80">
            {item.kind === "service" ? "Service" : `${item.photoCount} photo${item.photoCount === 1 ? "" : "s"}`}
          </span>
        </span>
      </Link>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <Link href={`/${business.slug}`} prefetch={false} className="flex min-w-0 items-center gap-2 hover:underline">
          {business.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed storage link
            <img src={business.logoUrl} alt="" className="h-6 w-6 shrink-0 rounded-full border border-border object-cover" />
          ) : (
            <span
              aria-hidden
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-500 text-[10px] font-bold text-white"
              style={business.brandColor ? { background: business.brandColor } : undefined}
            >
              {studioInitials(business.name)}
            </span>
          )}
          <span className="truncate text-sm font-semibold">{business.name}</span>
        </Link>
      </div>
    </article>
  );
}
