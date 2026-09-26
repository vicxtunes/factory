"use client";

import { useEffect, type ReactNode } from "react";

export function Drawer({
  open,
  onClose,
  title,
  children,
  size = "md",
  footer,
  scrollBody = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  // "md" (default) for detail panels; "lg" for form-heavy content like the
  // new-order wizard.
  size?: "md" | "lg";
  // Pinned below the body (never scrolls away) — for a drawer's primary
  // action, e.g. "Create group".
  footer?: ReactNode;
  // false when the content manages its own scrolling (e.g. a search box that
  // stays put above a scrolling list). The body then fills the space between
  // header and footer without scrolling itself.
  scrollBody?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-gray-400/50 backdrop-blur-[2px] transition-opacity duration-200 dark:bg-gray-950/60 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-surface shadow-theme-xl transition-transform duration-200 ${
          size === "lg" ? "max-w-2xl" : "max-w-md"
        } ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted hover:bg-gray-100 hover:text-foreground dark:hover:bg-white/5"
          >
            ✕
          </button>
        </div>
        <div className={scrollBody ? "min-h-0 flex-1 overflow-y-auto p-4" : "flex min-h-0 flex-1 flex-col p-4"}>
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-border bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : null}
      </aside>
    </>
  );
}
