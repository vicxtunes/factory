"use client";

import Link from "next/link";
import { useState } from "react";

import type { FeedItem } from "@repo/lib/studio-portal/core";
import { businessKindLabel, studioInitials, vendorCategory, VENDOR_GROUPS, type VendorGroup } from "@repo/lib/studios/core";

// The work grid on Aming's front page (landing.tsx), like Behance's: search
// and fields of work on top, then the work as big tiles, each one opening
// its business's page for it.

type Field = { id: string; label: string; matches: (b: FeedItem["business"]) => boolean };

const FIELDS: Field[] = [
  { id: "all", label: "All", matches: () => true },
  { id: "studio", label: "Photography", matches: (b) => b.kind === "studio" },
  { id: "photo_editor", label: "Photo editing", matches: (b) => b.vendorCategory === "photo_editor" },
  { id: "videographer", label: "Video", matches: (b) => b.vendorCategory === "videographer" },
  ...(Object.keys(VENDOR_GROUPS) as VendorGroup[])
    .filter((g) => g !== "photo")
    .map((g) => ({ id: g, label: VENDOR_GROUPS[g], matches: (b: FeedItem["business"]) => vendorCategory(b.vendorCategory)?.group === g })),
];

export function ExploreFeed({ items }: { items: FeedItem[] }) {
  const [field, setField] = useState("all");
  const [query, setQuery] = useState("");
  // Photography and its vendors always; the other fields once someone shows work in them.
  const fields = FIELDS.filter((f, i) => i < 4 || items.some((item) => f.matches(item.business)));
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = items.filter((item) => {
    if (!FIELDS.find((f) => f.id === field)!.matches(item.business)) return false;
    const text = `${item.title} ${item.business.name} ${businessKindLabel(item.business.kind, item.business.vendorCategory)}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });

  return (
    <section aria-label="Work on Aming">
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 sm:px-6 md:flex-row md:items-center">
          <label className="relative block md:w-80 md:shrink-0">
            <span className="sr-only">Search work</span>
            <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="9" r="6" />
              <path d="m14 14 4 4" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search photographers, editors, work…"
              className="h-11 w-full rounded-full border border-border bg-surface pr-4 pl-10 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </label>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 sm:-mx-6 sm:px-6 md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
            {fields.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={field === f.id}
                onClick={() => setField(f.id)}
                className={`h-9 shrink-0 rounded-full px-4 text-sm font-medium transition-colors ${
                  field === f.id ? "bg-foreground text-background" : "bg-gray-100 text-foreground hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/15"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        {shown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center">
            <p className="font-semibold">{items.length === 0 ? "Work from businesses on Aming shows here" : "Nothing matches that yet"}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">
              {items.length === 0
                ? "Photographers, photo editors and videographers on Aming can show their albums and services here."
                : "Try another word, or another field of work."}
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-x-6 gap-y-8 min-[520px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {shown.map((item) => (
              <li key={item.id}>
                <WorkTile item={item} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function WorkTile({ item }: { item: FeedItem }) {
  const { business } = item;
  return (
    <article>
      <Link href={item.href} className="group relative block overflow-hidden rounded-lg bg-gray-100 dark:bg-white/5">
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
        <Link href={`/${business.slug}`} className="flex min-w-0 items-center gap-2 hover:underline">
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
        <span className="shrink-0 text-xs text-muted">{businessKindLabel(business.kind, business.vendorCategory)}</span>
      </div>
    </article>
  );
}
