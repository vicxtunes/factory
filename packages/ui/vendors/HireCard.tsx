import type { ReactNode } from "react";

/** A button on the hire card (a link or a button), light or dark with the card. */
export const HIRE_CARD_BUTTON =
  "flex h-12 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-gray-100 text-sm font-medium text-gray-900 transition hover:bg-gray-200 dark:border-white/10 dark:bg-white/10 dark:text-white dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] dark:hover:bg-white/15";

/**
 * A vendor's card: what they do and where, their picture and name, taking
 * work or busy, two buttons (`actions`), and a line of their own on the
 * brand-coloured strip holding it. Light or dark with the theme.
 */
export function HireCard({
  role,
  place,
  name,
  photoUrl,
  available,
  line,
  actions,
}: {
  role: string;
  place: string | null;
  name: string;
  photoUrl: string | null;
  available: boolean;
  line: string;
  /** Two of HIRE_CARD_BUTTON, side by side. */
  actions: ReactNode;
}) {
  return (
    <div className="rounded-[28px] bg-brand-500 shadow-theme-md">
      <div className="space-y-5 rounded-[28px] bg-white p-5 text-gray-900 ring-1 ring-gray-200 dark:bg-gradient-to-b dark:from-gray-900 dark:to-gray-950 dark:text-white dark:ring-black/40">
        <div className="flex items-center justify-between gap-3 text-sm text-gray-500 dark:text-white/55">
          <span className="truncate">{role}</span>
          {place ? (
            <span className="flex shrink-0 items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
              </svg>
              {place}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-4">
          <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-gray-100 text-xl font-semibold text-gray-900 ring-4 ring-gray-100 dark:bg-white/90 dark:ring-white/10">
            {photoUrl ? (
              // A short-lived signed link to the private bucket: a plain img.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" className="size-full object-cover" />
            ) : (
              name.charAt(0).toUpperCase()
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xl font-medium">{name}</span>
            <span className="mt-0.5 flex items-center gap-2 text-sm text-gray-500 dark:text-white/55">
              <span className={`size-2 rounded-full ${available ? "bg-success-500" : "bg-gray-300 dark:bg-white/30"}`} />
              {available ? "Available for work" : "Busy for now"}
            </span>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">{actions}</div>
      </div>
      <p className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white">
        <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
          <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
        </svg>
        <span className="truncate">{line}</span>
      </p>
    </div>
  );
}
