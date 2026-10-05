"use client";

import { useEffect, useRef, useState } from "react";

// Small "⋯" dropdown of actions — KanbanBoard's and SubtaskChecklist's move
// menus, and Replace/Delete on order files (media/MediaLinks.tsx). Its clicks don't reach whatever it sits on (a clickable card or
// row), so opening it never also opens the item. Escape closes it and puts
// focus back on the button. `focusKey` lands on the button as
// data-focus-key, so a parent can re-focus it after the item moves.

export type ActionMenuEntry = { label: string; onSelect: () => void; disabled?: boolean } | { heading: string };

export function ActionMenu({
  label,
  focusKey,
  items,
  triggerClassName,
}: {
  label: string;
  focusKey: string;
  items: ActionMenuEntry[];
  /** Replaces the plain list-row trigger look, e.g. a round button floating on a photo. */
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={rootRef} className={`relative shrink-0 ${triggerClassName ? "" : "-my-2.5 -mr-2"}`} onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        data-focus-key={focusKey}
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName ?? "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted hover:text-foreground"}
      >
        <svg aria-hidden viewBox="0 0 16 16" fill="currentColor" className="size-4">
          <circle cx="3" cy="8" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="13" cy="8" r="1.4" />
        </svg>
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 top-full z-30 mt-1 w-52 rounded-[var(--radius)] border border-border bg-surface py-1 text-left shadow-theme-xl"
        >
          {items.map((item) =>
            "heading" in item ? (
              <p
                key={item.heading}
                className="mt-1 border-t border-border px-3 pt-2 pb-1 text-[0.7rem] font-semibold uppercase tracking-wide text-muted"
              >
                {item.heading}
              </p>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className="flex min-h-10 w-full items-center px-3 text-left text-sm hover:bg-background disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </span>
  );
}
