"use client";

import { useEffect, type ReactNode } from "react";

import { useCloseOnBack } from "./navigation/back";

/**
 * A sheet for one short task (pay, book, confirm): it rises from the bottom
 * of a phone, under the thumb, with a grab handle; on a wider screen it's a
 * card in the middle. The page behind dims and stays put. Closes on the
 * backdrop, Escape, the ✕ and the phone's Back.
 */
export function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  useCloseOnBack(open, onClose);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = before;
    };
  }, [open, onClose]);

  return (
    <div className={`fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4 ${open ? "" : "pointer-events-none"}`}>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`absolute inset-0 bg-gray-900/40 backdrop-blur-[3px] transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        className={`relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-surface shadow-theme-xl transition-[transform,opacity] duration-300 ease-out sm:max-w-md sm:rounded-3xl ${
          open ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 sm:translate-y-4"
        }`}
      >
        <div aria-hidden className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-gray-300 sm:hidden dark:bg-gray-600" />
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-3 sm:pt-5">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-gray-100 hover:text-foreground dark:hover:bg-white/5"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
      </section>
    </div>
  );
}
