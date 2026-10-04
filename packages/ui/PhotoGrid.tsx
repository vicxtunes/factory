"use client";

// Square thumbnails of a set of photos. Columns come from the container's
// own width (as many 9rem-min tiles as fit), not viewport breakpoints, so
// it reflows the same in a page, a drawer or a device preview.
//
// Plain mode: a tile click opens the photo (usually in Lightbox).
// With `selection` (e.g. a couple picking their 40 album photos): a tile
// click ticks it, the ⤢ corner button opens it, picked tiles get a ring and
// their pick number, and once `max` is reached the rest can't be ticked.
// Draft — lives in the Design Room until a page adopts it.

export interface GalleryPhoto {
  key: string;
  src: string;
  alt: string;
}

export interface PhotoSelection {
  /** Picked keys in pick order — the order drives the numbers on tiles. */
  selected: string[];
  onToggle: (key: string) => void;
  max?: number;
}

export function PhotoGrid({
  photos,
  onOpen,
  selection,
}: {
  photos: GalleryPhoto[];
  /** Index into `photos` of the one to open. */
  onOpen?: (index: number) => void;
  selection?: PhotoSelection;
}) {
  const full = !!selection?.max && selection.selected.length >= selection.max;

  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(9rem,100%),1fr))] gap-2">
      {photos.map((p, i) => {
        const pick = selection ? selection.selected.indexOf(p.key) + 1 : 0;
        const disabled = !!selection && !pick && full;
        const img = (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary photo hosts (Cloudinary/Supabase), can't be allowlisted for next/image
          <img src={p.src} alt={p.alt} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        );

        return (
          <li
            key={p.key}
            className={`group relative aspect-square overflow-hidden rounded-[var(--radius)] bg-gray-100 dark:bg-white/5 ${
              pick ? "ring-3 ring-brand-500 ring-offset-2 ring-offset-background" : ""
            } ${disabled ? "opacity-50" : ""}`}
          >
            {selection ? (
              <>
                <button
                  type="button"
                  aria-pressed={!!pick}
                  disabled={disabled}
                  onClick={() => selection.onToggle(p.key)}
                  aria-label={pick ? `Unpick ${p.alt} (pick ${pick})` : `Pick ${p.alt}`}
                  className="block size-full outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-brand-500 disabled:cursor-not-allowed"
                >
                  {img}
                </button>
                <span
                  aria-hidden
                  className={`pointer-events-none absolute left-2 top-2 flex size-6 items-center justify-center rounded-full text-xs font-semibold tnum shadow ${
                    pick ? "bg-brand-500 text-white" : "border-2 border-white bg-black/20"
                  }`}
                >
                  {pick || null}
                </span>
                {onOpen ? (
                  <button
                    type="button"
                    onClick={() => onOpen(i)}
                    aria-label={`View ${p.alt}`}
                    className="absolute right-1 top-1 flex size-9 items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity hover:bg-black/60 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                      <path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9" />
                    </svg>
                  </button>
                ) : null}
              </>
            ) : onOpen ? (
              <button
                type="button"
                onClick={() => onOpen(i)}
                aria-label={`View ${p.alt}`}
                className="block size-full outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-brand-500"
              >
                {img}
              </button>
            ) : (
              img
            )}
          </li>
        );
      })}
    </ul>
  );
}
