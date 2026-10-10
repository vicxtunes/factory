"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

import { canOptimizeImage } from "@repo/lib/storage/client";

/** One photo card; it opens the item's own page (Showcase.tsx). */
export interface ShowroomCard {
  id: string;
  label: string;
  image: string | null;
  href: string;
}

/** A titled row of cards that scrolls sideways. */
export interface ShowroomSection {
  id: string;
  title: string;
  cards: ShowroomCard[];
  /** Shown when the section has no cards. */
  emptyText: string;
}

/** A tab: titled rows of cards (`sections`), or one wrapping grid (`cards`). */
export type ShowroomTab = { key: string; label: string; emptyText: string } & (
  | { sections: ShowroomSection[] }
  | { cards: ShowroomCard[] }
);

const PLACEHOLDER = "/showroom/placeholder.PNG";

/** `fill`: as wide as its grid column (two a row on a phone) instead of its fixed width. */
function PhotoCard({ card, fill = false }: { card: ShowroomCard; fill?: boolean }) {
  const className = `relative block h-48 shrink-0 overflow-hidden rounded-xl text-left shadow-theme-sm ${fill ? "w-full" : "w-40"}`;
  return (
    <Link href={card.href} className={className}>
      <Image
        src={card.image ?? PLACEHOLDER}
        alt={card.label}
        fill
        sizes={fill ? "(max-width: 640px) 50vw, 160px" : "160px"}
        unoptimized={!!card.image && !canOptimizeImage(card.image)}
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <p className="absolute inset-x-0 bottom-3 px-2 text-center text-sm font-bold text-white">{card.label}</p>
    </Link>
  );
}

/** The full-bleed photo banner at the top of a showroom. No photo: the brand color alone (a studio's page before it has any). */
export function ShowroomBanner({ title, subtitle, imageUrl }: { title: string; subtitle: string; imageUrl: string | null }) {
  return (
    <div className="relative -mx-4 -mt-6 mb-6 h-48 overflow-hidden sm:-mx-6 sm:h-64">
      {imageUrl ? (
        <>
          <Image src={imageUrl} alt="" fill priority unoptimized={!canOptimizeImage(imageUrl)} className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#1b2a4b]/90 via-[#1b2a4b]/50 to-brand-600/60" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-r from-brand-900 via-brand-700 to-brand-500" />
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        <h1 className="text-3xl font-extrabold uppercase tracking-wide text-white underline decoration-brand-400 decoration-4 underline-offset-8 sm:text-5xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-white/80 sm:text-base">{subtitle}</p>
      </div>
    </div>
  );
}

// Visual language lifted from the "Show Room v1" mockup (apps/client
// public/showroom): a full-bleed photo banner, a tab bar, and under each tab
// either a section per group listing its items as photo cards, or one grid
// of cards. Clicking a card opens the item's own page, which shows
// Showcase.tsx and can be shared. Falls back to the shared placeholder
// image for any item without its own image yet.
export function ShowroomGallery({
  banner,
  notice,
  tabs,
  wrap = false,
}: {
  /** The full-bleed photo banner; left out where the page has its own header. */
  banner?: { title: string; subtitle: string; imageUrl: string | null };
  /** Between the banner and the tabs, e.g. a sign-in prompt. */
  notice?: ReactNode;
  /** With just one, its content shows without a tab bar. */
  tabs: ShowroomTab[];
  /** A section's cards wrap into a grid instead of sliding sideways in one row. */
  wrap?: boolean;
}) {
  const [tabKey, setTabKey] = useState(tabs[0]?.key);
  const tab = tabs.find((t) => t.key === tabKey) ?? tabs[0];

  return (
    <div className="overflow-x-clip">
      {banner ? <ShowroomBanner {...banner} /> : null}

      {notice}

      {/* Tab bar: full-width split buttons on mobile, natural-width compact
          pills from `sm` up. `flex-1` on mobile keeps every tab an equal tap
          target; `sm:flex-none` + `sm:min-w-0` lets them shrink to content
          on desktop instead of stretching across the row. */}
      {tabs.length > 1 ? (
        <div
          role="tablist"
          className="mb-6 flex w-full overflow-x-auto rounded-lg"
          style={{ scrollbarWidth: "none" }}
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTabKey(t.key)}
              className={`min-w-[7.5rem] flex-1 whitespace-nowrap px-5 py-2.5 text-sm font-bold transition-colors sm:min-w-0 sm:flex-none sm:px-4 sm:py-2 sm:text-xs ${
                tab === t
                  ? "bg-[#1b2a4b] text-white"
                  : "bg-brand-100 text-[#1b2a4b] hover:bg-brand-200 dark:bg-brand-500/15 dark:text-brand-400 dark:hover:bg-brand-500/25"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Fixed-min-height stage. Every tab renders into this slot, so the
          page height (and anything below it) never jumps between tabs. */}
      <div className={tabs.length < 2 ? "" : "min-h-[65vh]"}>
        {!tab ? null : "sections" in tab ? (
          tab.sections.length === 0 ? (
            <p className="rounded-[var(--radius)] border border-dashed border-border p-4 text-sm text-muted">
              {tab.emptyText}
            </p>
          ) : (
            <div className="space-y-8">
              {tab.sections.map((section) => (
                <section key={section.id}>
                  <h2 className="text-xl font-bold text-[#1b2a4b] dark:text-foreground">{section.title}</h2>
                  <div className="mb-4 mt-1 h-1 w-10 bg-brand-500" />
                  {section.cards.length === 0 ? (
                    <p className="text-sm text-muted">{section.emptyText}</p>
                  ) : wrap ? (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,10rem)]">
                      {section.cards.map((card) => (
                        <PhotoCard key={card.id} card={card} fill />
                      ))}
                    </div>
                  ) : (
                    // `overflow-x-auto` gets a reserved gutter so the row's
                    // height doesn't change when the scrollbar appears.
                    <div
                      className="flex gap-4 overflow-x-auto pb-2"
                      style={{ scrollbarGutter: "stable" }}
                    >
                      {section.cards.map((card) => (
                        <PhotoCard key={card.id} card={card} />
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )
        ) : tab.cards.length === 0 ? (
          <p className="text-sm text-muted">{tab.emptyText}</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {tab.cards.map((card) => (
              <PhotoCard key={card.id} card={card} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
