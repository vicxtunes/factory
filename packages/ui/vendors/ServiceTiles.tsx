"use client";

import Link from "next/link";
import { useState } from "react";

import { FormSheet } from "@repo/ui/FormSheet";
import { Lightbox } from "@repo/ui/Lightbox";
import { PhotoGrid } from "@repo/ui/PhotoGrid";
import { offerPrice, offerPriceParts, type VendorOffer } from "@repo/lib/vendors/core";
import { buttonClass } from "@repo/ui/Button";

/** A service as shown: its samples' links (signed, short-lived; null when unavailable). */
export type OfferView = Pick<VendorOffer, "id" | "name" | "description" | "price" | "unit" | "included"> & { sampleUrls: (string | null)[] };

/** As many cards a row as fit at 12rem or more each: three side by side even on a narrow page, one on a phone. */
export const SERVICE_GRID = "grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-4";

/** The ticks a card has room for; the rest are in its details. */
const TICKS = 4;

const samplesLabel = (n: number) => (n ? `${n} sample${n === 1 ? "" : "s"}` : "No samples yet");

function Tick() {
  return (
    <svg viewBox="0 0 24 24" className="mt-0.5 size-3.5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}

/**
 * One service as a card: a panel with its name and price told big (its first
 * sample faint behind), a line about it, one dark button, then what it
 * includes and its samples.
 */
export function ServiceTile({ offer, action, onOpen }: { offer: OfferView; action: string; onOpen: () => void }) {
  const cover = offer.sampleUrls.find(Boolean);
  const price = offerPriceParts(offer);
  const more = offer.included.length - TICKS;

  return (
    // The whole card opens it (the button says what opening does).
    <article onClick={onOpen} className="flex h-full cursor-pointer flex-col rounded-3xl bg-surface shadow-theme-sm ring-1 ring-gray-200/70 transition hover:shadow-theme-md dark:ring-white/10">
      <div className="space-y-3 rounded-3xl bg-surface p-2.5 pb-3 shadow-theme-sm ring-1 ring-gray-200/70 dark:ring-white/10">
        <div className="relative flex min-h-24 flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-gray-100 to-brand-50 p-3 dark:from-white/5 dark:to-brand-500/10">
          {cover ? (
            // A short-lived signed link to the private bucket: a plain img, faint behind the price.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="absolute inset-0 size-full object-cover opacity-20 dark:opacity-25" />
          ) : null}
          <span className="relative max-w-full self-start truncate rounded-full bg-surface px-2.5 py-1 text-[11px] font-medium shadow-theme-xs">{offer.name}</span>
          <p className="relative mt-4 flex items-baseline gap-1 tracking-tight">
            {price ? (
              <>
                <span className="text-[11px] font-medium text-muted">UGX</span>
                <span className="text-2xl font-semibold tabular-nums">{price.amount}</span>
                <span className="text-sm font-medium">{price.per}</span>
              </>
            ) : (
              <span className="text-xl font-semibold">On request</span>
            )}
          </p>
        </div>
        {offer.description ? <p className="line-clamp-2 px-1.5 text-xs font-medium">{offer.description}</p> : null}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="flex h-10 w-full items-center justify-center rounded-full bg-gray-900 text-sm font-medium text-white shadow-theme-sm transition hover:bg-gray-800 active:scale-[0.99] dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
        >
          {action}
        </button>
      </div>
      <ul className="space-y-2 px-4 pt-4 pb-5 text-[13px]">
        {offer.included.slice(0, TICKS).map((item) => (
          <li key={item} className="flex items-start gap-2.5">
            <Tick />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
        {more > 0 ? <li className="pl-6 text-muted">and {more} more</li> : null}
        <li className="flex items-start gap-2.5 text-muted">
          <Tick />
          {samplesLabel(offer.sampleUrls.length)}
        </li>
      </ul>
    </article>
  );
}

/** A studio hiring from the vendor's page: its projects in hand, to hire the vendor on at a service. */
export interface HireOn {
  vendorId: string;
  projects: { id: string; title: string; meta: string }[];
}

/**
 * A vendor's services to look through: the cards, each opening the work
 * (its samples, to view full screen), then its price and what it includes.
 * With `hire`, a studio then picks the project to hire the vendor on for it:
 * its hire form opens with both chosen.
 */
export function ServiceTiles({ offers, hire }: { offers: OfferView[]; hire?: HireOn }) {
  const [open, setOpen] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const offer = offers.find((o) => o.id === open) ?? null;
  const photos = offer ? offer.sampleUrls.flatMap((src, i) => (src ? [{ key: String(i), src, alt: `${offer.name}, sample ${i + 1}` }] : [])) : [];
  const heading = "text-sm font-semibold tracking-wide text-muted uppercase";

  return (
    <>
      <ul className={SERVICE_GRID}>
        {offers.map((o) => (
          <li key={o.id}>
            <ServiceTile offer={o} action="See the work" onOpen={() => setOpen(o.id)} />
          </li>
        ))}
      </ul>
      <FormSheet open={offer !== null} onClose={() => setOpen(null)} title={offer?.name} size="lg">
        {offer ? (
          // The work first (samples to view full screen), then what it costs and includes, then hiring for it.
          <div className="space-y-6">
            <section className="space-y-2">
              <h3 className={heading}>The work · {samplesLabel(photos.length)}</h3>
              {photos.length ? (
                <PhotoGrid photos={photos} onOpen={setViewing} />
              ) : (
                <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">No samples of this service yet.</p>
              )}
            </section>
            <div className="space-y-2">
              <p className="text-lg font-semibold tabular-nums">{offerPrice(offer)}</p>
              {offer.description ? <p className="text-sm whitespace-pre-line text-muted">{offer.description}</p> : null}
            </div>
            {offer.included.length ? (
              <section className="space-y-2">
                <h3 className={heading}>What&apos;s included</h3>
                <ul className="space-y-2 text-sm">
                  {offer.included.map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <Tick />
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {hire ? (
              <section className="space-y-2 border-t border-border pt-6">
                <h3 className="text-base font-semibold">Hire them for this</h3>
                <p className="text-sm text-muted">Choose the project. Its hire form opens with this service and its price.</p>
                {hire.projects.length ? (
                  <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
                    {hire.projects.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={`/studio/projects/${p.id}?hire=${hire.vendorId}&service=${offer.id}#vendors`}
                          className="flex items-center justify-between gap-3 p-3.5 hover:bg-background"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{p.title}</span>
                            <span className="block truncate text-xs text-muted">{p.meta}</span>
                          </span>
                          <span className="shrink-0 text-sm font-medium text-brand-600 dark:text-brand-400">Hire</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="space-y-3 rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted">
                    <p>No projects in hand to hire on.</p>
                    <Link href="/studio/projects?new" className={buttonClass("primary", "sm")}>
                      Start a project
                    </Link>
                  </div>
                )}
              </section>
            ) : null}
          </div>
        ) : null}
      </FormSheet>
      <Lightbox photos={photos} index={viewing} onIndexChange={setViewing} onClose={() => setViewing(null)} />
    </>
  );
}
