"use client";

import { useState } from "react";

import { FormSheet } from "@repo/ui/FormSheet";
import { Lightbox } from "@repo/ui/Lightbox";
import { PhotoGrid } from "@repo/ui/PhotoGrid";
import { describeOffer, offerPrice, offerPriceParts } from "@repo/lib/vendors/core";

import type { OfferView } from "./OfferList";

const samplesLabel = (n: number) => (n ? `${n} sample${n === 1 ? "" : "s"}` : "No samples yet");

/**
 * One service as a card: a panel with its name and price told big (its first
 * sample faint behind), the first line of what it is, one dark button, and
 * the rest of the description as what's included, ending with its samples.
 */
export function ServiceTile({ offer, action, onOpen }: { offer: OfferView; action: string; onOpen: () => void }) {
  const cover = offer.sampleUrls.find(Boolean);
  const price = offerPriceParts(offer);
  const { lead, points } = describeOffer(offer.description);
  const included = [...points.slice(0, 4), samplesLabel(offer.sampleUrls.length)];

  return (
    <article className="flex h-full flex-col rounded-[28px] bg-surface shadow-theme-md ring-1 ring-gray-200/70 dark:ring-white/10">
      <div className="space-y-4 rounded-[28px] bg-surface p-3 pb-4 shadow-theme-md ring-1 ring-gray-200/70 dark:ring-white/10">
        <div className="relative flex min-h-36 flex-col justify-between overflow-hidden rounded-[22px] bg-gradient-to-br from-gray-100 to-brand-50 p-4 dark:from-white/5 dark:to-brand-500/10">
          {cover ? (
            // A short-lived signed link to the private bucket: a plain img, faint behind the price.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="absolute inset-0 size-full object-cover opacity-20 dark:opacity-25" />
          ) : null}
          <span className="relative max-w-full self-start truncate rounded-full bg-surface px-3.5 py-1.5 text-xs font-medium shadow-theme-xs">{offer.name}</span>
          <p className="relative mt-6 flex items-baseline gap-1 tracking-tight">
            {price ? (
              <>
                <span className="text-sm font-medium text-muted">UGX</span>
                <span className="text-4xl font-semibold tabular-nums">{price.amount}</span>
                <span className="text-base font-medium">{price.per}</span>
              </>
            ) : (
              <span className="text-3xl font-semibold">On request</span>
            )}
          </p>
        </div>
        {lead ? <p className="line-clamp-2 px-2 text-sm font-medium">{lead}</p> : null}
        <button
          type="button"
          onClick={onOpen}
          className="flex h-12 w-full items-center justify-center rounded-full bg-gray-900 text-sm font-medium text-white shadow-theme-md transition hover:bg-gray-800 active:scale-[0.99] dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
        >
          {action}
        </button>
      </div>
      <ul className="space-y-2.5 px-5 pt-5 pb-6 text-sm">
        {included.map((point, i) => (
          <li key={i} className="flex items-start gap-3">
            <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m5 12 5 5 9-10" />
            </svg>
            <span className={i === included.length - 1 ? "text-muted" : ""}>{point}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

/** As many cards a row as fit at 16rem or more each: one on a phone, three or four on a desktop. */
export const SERVICE_GRID = "grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-5";

/**
 * A vendor's services to look through: the tiles, each opening its details
 * (price, what it is, and its samples to view full screen).
 */
export function ServiceTiles({ offers }: { offers: OfferView[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const offer = offers.find((o) => o.id === open) ?? null;
  const photos = offer ? offer.sampleUrls.flatMap((src, i) => (src ? [{ key: String(i), src, alt: `${offer.name}, sample ${i + 1}` }] : [])) : [];

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
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-lg font-semibold tabular-nums">{offerPrice(offer)}</p>
              {offer.description ? <p className="text-sm whitespace-pre-line text-muted">{offer.description}</p> : null}
            </div>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">{samplesLabel(photos.length)}</h3>
              {photos.length ? (
                <PhotoGrid photos={photos} onOpen={setViewing} />
              ) : (
                <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">No samples of this service yet.</p>
              )}
            </section>
          </div>
        ) : null}
      </FormSheet>
      <Lightbox photos={photos} index={viewing} onIndexChange={setViewing} onClose={() => setViewing(null)} />
    </>
  );
}
