"use client";

import { Button, buttonClass } from "@repo/ui/Button";
import type { Announcement } from "@repo/lib/types";

import { ShareButton } from "./ShareButton";

type Shown = Pick<Announcement, "title" | "body" | "image_url" | "button_label" | "link_url">;

// The pop-up itself, for Aming's announcements (./AnnouncementPopup.tsx) and
// a business's own on its page (./StudioAnnouncementPopup.tsx). A designed
// poster shows whole, with × to close and its button under it (owner,
// 2026-11-21); a plain one shows its title, message and "Got it".
//
// Either way the card fits the visible screen (dvh, notch and home bar
// included), so the way out is never pushed off it. A poster fills the card's
// width; on a computer the card is 80% of its phone width, so its caption and
// buttons show (owner, 2026-11-22: shrinking the poster left white bands). `shareable`: a Share
// button beside its button (Aming's always, a business's with Pro).
export function AnnouncementCard({ announcement: a, busy, onClose, shareable = false }: { announcement: Shown; busy: boolean; onClose: () => void; shareable?: boolean }) {
  const frame =
    "fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/70 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]";
  const fit = "max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))]";

  if (a.image_url) {
    return (
      <div role="dialog" aria-modal="true" aria-label={a.title} className={frame} onClick={busy ? undefined : onClose}>
        <div className={`relative flex ${fit} w-full max-w-md flex-col overflow-hidden rounded-2xl bg-surface shadow-theme-xl sm:max-w-[22.4rem]`} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
            className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-gray-950/60 text-white backdrop-blur hover:bg-gray-950/80"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {/* eslint-disable-next-line @next/next/no-img-element -- an uploaded poster of any shape, shown whole */}
            <img src={a.image_url} alt={a.title} className="block w-full" />
            {a.body ? <p className="whitespace-pre-wrap px-5 py-3 text-sm text-muted">{a.body}</p> : null}
          </div>
          {a.link_url || shareable ? (
            <div className="flex shrink-0">
              {a.link_url ? (
                <a
                  href={a.link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onClose}
                  className="flex flex-1 items-center justify-center gap-2 bg-brand-500 px-4 py-3.5 text-base font-medium text-white hover:bg-brand-600"
                >
                  {a.button_label}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden>
                    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              ) : null}
              {shareable ? (
                <ShareButton
                  title={a.title}
                  text={a.body}
                  url={a.link_url ?? (typeof window === "undefined" ? "" : window.location.href)}
                  imageUrl={a.image_url}
                  boxClassName={a.link_url ? "" : "flex-1"}
                  className={`flex h-full items-center justify-center gap-2 px-5 py-3.5 text-base font-medium ${a.link_url ? "border-l border-white/25 bg-brand-600 text-white hover:bg-brand-700" : "w-full bg-brand-500 text-white hover:bg-brand-600"}`}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="announcement-title" className={frame}>
      <div className={`flex ${fit} w-full max-w-md flex-col rounded-2xl border border-border bg-surface shadow-theme-xl`}>
        <p id="announcement-title" className="shrink-0 px-6 pt-6 text-lg font-semibold">
          {a.title}
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-2">
          <p className="whitespace-pre-wrap text-sm text-muted">{a.body}</p>
        </div>
        <div className="shrink-0 space-y-2 border-t border-border px-6 pb-6 pt-4">
          {a.link_url ? (
            <a href={a.link_url} target="_blank" rel="noopener noreferrer" onClick={onClose} className={`${buttonClass("primary")} w-full`}>
              {a.button_label}
            </a>
          ) : null}
          <Button variant={a.link_url ? "secondary" : "primary"} className="w-full" disabled={busy} onClick={onClose}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}
