"use client";

import { useState } from "react";

import { FormSheet } from "@repo/ui/FormSheet";
import { Lightbox } from "@repo/ui/Lightbox";
import { PhotoGrid } from "@repo/ui/PhotoGrid";
import { offerPrice } from "@repo/lib/vendors/core";

import type { OfferView } from "./OfferList";

const samplesLabel = (n: number) => (n ? `${n} sample${n === 1 ? "" : "s"}` : "No samples yet");

/** One service as a tile: its first sample filling it behind a soft veil, the name, price and samples over it. */
export function ServiceTile({ offer, onOpen }: { offer: OfferView; onOpen: () => void }) {
  const cover = offer.sampleUrls.find(Boolean);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group @container relative grid aspect-[5/2] w-full place-items-center overflow-hidden rounded-3xl bg-gradient-to-br from-gray-700 to-gray-900 text-center text-white shadow-theme-md transition active:scale-[0.99] sm:aspect-video"
    >
      {cover ? (
        // A short-lived signed link to the private bucket: a plain img.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" className="absolute inset-0 size-full scale-105 object-cover blur-[2px] transition duration-500 group-hover:scale-110" />
      ) : null}
      <span className="absolute inset-0 bg-black/45 transition group-hover:bg-black/35" />
      <span className="relative space-y-1 px-4">
        <span className="line-clamp-2 block text-[clamp(1rem,7cqi,1.5rem)] leading-tight font-medium tracking-tight drop-shadow-sm">{offer.name}</span>
        <span className="block text-[clamp(0.6875rem,4cqi,0.8125rem)] text-white/80 tabular-nums">{offerPrice(offer)}</span>
        <span className="block text-[clamp(0.625rem,3.5cqi,0.75rem)] text-white/65">{samplesLabel(offer.sampleUrls.length)}</span>
      </span>
    </button>
  );
}

/** As many tiles a row as fit at 14rem or more each: one on a phone, three or four on a desktop. */
export const SERVICE_GRID = "grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4";

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
            <ServiceTile offer={o} onOpen={() => setOpen(o.id)} />
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
