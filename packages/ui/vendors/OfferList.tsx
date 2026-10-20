import { offerPrice, type VendorOffer } from "@repo/lib/vendors/core";

/** A service as shown: its samples' links (signed, short-lived; null when unavailable). */
export type OfferView = Pick<VendorOffer, "id" | "name" | "description" | "price" | "unit"> & { sampleUrls: (string | null)[] };

/** A vendor's services: each with its price, what it is, and its samples to swipe through. */
export function OfferList({ offers }: { offers: OfferView[] }) {
  return (
    <ul className="space-y-3">
      {offers.map((o) => (
        <li key={o.id} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-4">
            <p className="min-w-0 font-semibold">{o.name}</p>
            <p className="shrink-0 text-sm tabular-nums text-muted">{offerPrice(o)}</p>
          </div>
          {o.description ? <p className="text-sm whitespace-pre-line text-muted">{o.description}</p> : null}
          {o.sampleUrls.length ? (
            <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
              {o.sampleUrls.map((url, i) => (
                <div key={i} className="aspect-[4/3] w-40 shrink-0 snap-start overflow-hidden rounded-xl bg-background sm:w-48">
                  {url ? (
                    // A short-lived signed link to the private bucket: a plain img.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={`${o.name}, sample ${i + 1}`} className="size-full object-cover" />
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
