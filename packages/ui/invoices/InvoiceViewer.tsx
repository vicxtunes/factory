"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { CloseIcon } from "@repo/ui/media/icons";
import { useCloseOnBack } from "@repo/ui/navigation/back";
import type { InvoiceView } from "@repo/lib/invoices/types";

import { InvoicePdf } from "./InvoicePdf";

// Full-screen view of an invoice for staff: the invoice itself, large and
// sharp, as the client gets it (its PDF, page by page) on a dark backdrop,
// with a bar of actions on top and a side panel (`aside`: what's paid,
// record a payment, edit…). On a phone the panel follows the pages. Nothing
// opens in another tab. Escape or ✕ closes it and focus goes back to
// whatever opened it. Rendered on <body>, so it covers the whole screen even
// when opened from inside a drawer.

export function InvoiceViewer({
  invoice,
  heading,
  actions,
  aside,
  onClose,
}: {
  invoice: InvoiceView;
  /** Left of the bar: the invoice number, status… */
  heading: ReactNode;
  /** Right of the bar, before ✕: icon buttons, a ⋯ menu. */
  actions: ReactNode;
  aside: ReactNode;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useCloseOnBack(true, onClose);

  // While open: lock page scroll, focus ✕, and give focus back on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // A ⋯ menu that's open takes Escape first (it stops at the menu).
      if (e.key === "Escape" && !document.querySelector("[role=dialog][data-invoice-viewer] [role=menu]")) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Invoice ${invoice.invoiceNo}`}
      data-invoice-viewer
      className="fixed inset-0 z-[60] flex flex-col bg-gray-950/90 backdrop-blur-sm"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-3 py-2 text-white sm:px-5">
        <div className="min-w-0 flex-1">{heading}</div>
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
        <button
          ref={closeRef}
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="inline-flex size-11 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
        >
          <CloseIcon className="size-5" />
        </button>
      </header>

      {/* One scroll on a phone (pages, then the panel); side by side, each scrolling, from lg. */}
      <div className="min-h-0 flex-1 overflow-y-auto lg:flex lg:overflow-hidden">
        <main className="px-3 py-4 sm:px-8 sm:py-8 lg:flex-1 lg:overflow-y-auto">
          <div className="mx-auto w-full max-w-[820px]">
            <InvoicePdf invoice={invoice} download={false} />
          </div>
        </main>
        <aside className="rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:w-[380px] lg:shrink-0 lg:overflow-y-auto lg:rounded-none lg:border-l lg:border-border">
          {aside}
        </aside>
      </div>
    </div>,
    document.body,
  );
}

/** A round icon button for the viewer's dark bar. */
export function ViewerAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex size-11 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}

/** The viewer's backdrop while the invoice loads (or why it couldn't). */
export function ViewerLoading({ error, onClose }: { error: string | null; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Invoice" className="fixed inset-0 z-[60] grid place-items-center bg-gray-950/90 p-6 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-3 top-2 inline-flex size-11 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
      >
        <CloseIcon className="size-5" />
      </button>
      {error ? (
        <p className="text-sm text-white">{error}</p>
      ) : (
        <div role="status" aria-label="Loading the invoice" className="aspect-[210/297] w-full max-w-[420px] animate-pulse rounded-sm bg-white/90" />
      )}
    </div>,
    document.body,
  );
}
