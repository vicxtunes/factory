"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

// Lightweight click-to-open panel anchored to a trigger button. Closes on
// outside click or Escape. For the Orders filter panel — the Drawer is a
// full-height sheet, too heavy for this.
export function Popover({
  label,
  children,
  align = "left",
  dashed = false,
  bare = false,
  narrow = false,
  ariaLabel,
}: {
  label: ReactNode;
  /** A function gets `close`, for content that should shut the panel once a choice is made. */
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "left" | "right";
  /** Dashed outline — reads as an optional filter pill rather than a set control. */
  dashed?: boolean;
  /** Unstyled trigger (no border, no ▾) — `label` is the whole look, e.g. a badge or avatars that open a picker. */
  bare?: boolean;
  /** A 13rem panel instead of 18rem — for short option lists. */
  narrow?: boolean;
  /** Accessible name when `label` alone doesn't say what the button does. */
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const close = () => setOpen(false);

  // Closing unmounts the panel; if focus was inside it, it would fall to
  // <body>. Hand it back to the trigger instead (but not after an outside
  // click, where focus has already moved to whatever was clicked).
  useEffect(() => {
    if (wasOpen.current && !open && (!document.activeElement || document.activeElement === document.body)) {
      triggerRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className={
          bare
            ? "inline-flex min-h-11 items-center gap-1 rounded-[var(--radius)] text-left text-sm hover:bg-background"
            : `inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface px-3 text-sm hover:bg-background ${
                dashed ? "border-dashed" : "shadow-theme-xs"
              }`
        }
      >
        {label}
        {bare ? null : (
          <span aria-hidden className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}>
            ▾
          </span>
        )}
      </button>
      {open ? (
        <div
          id={panelId}
          className={`absolute z-40 mt-1 ${narrow ? "w-52" : "w-72"} rounded-[var(--radius)] border border-border bg-surface p-3 shadow-theme-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      ) : null}
    </div>
  );
}
