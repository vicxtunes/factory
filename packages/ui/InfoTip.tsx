"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

// An ⓘ button that shows a small tooltip bubble — on tap / click / Enter,
// and on mouse hover. It floats over the page, so opening it
// never pushes content around. Closes on a second tap, a tap elsewhere, or
// Escape.

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M12 11v5M12 7.5v.01" />
    </svg>
  );
}

export function InfoTip({
  label,
  children,
  className = "",
}: {
  /** What the button is for, for screen readers (e.g. "About Photobook 12x12 Mat"). */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // How far the bubble is nudged sideways to stay on screen (px); the pointer
  // is moved back by the same amount so it still points at the icon.
  const [shift, setShift] = useState(0);
  const rootRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const tipId = useId();

  useLayoutEffect(() => {
    if (!open || !tipRef.current) return;
    const EDGE = 8;
    const rect = tipRef.current.getBoundingClientRect();
    const centred = rect.left - shift; // where it would sit with no nudge
    const right = centred + rect.width;
    const next =
      centred < EDGE ? EDGE - centred : right > window.innerWidth - EDGE ? window.innerWidth - EDGE - right : 0;
    if (next !== shift) setShift(next);
  }, [open, shift]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span
      ref={rootRef}
      className={`relative inline-flex align-middle ${className}`}
      // Hover only for a real mouse: on touch screens a tap also fires
      // pointer-enter, which would fight the tap's own toggle.
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${open ? "text-brand-600" : "text-muted"} hover:text-brand-600`}
      >
        <InfoIcon className="h-4 w-4" />
      </button>
      {open ? (
        <span
          ref={tipRef}
          id={tipId}
          role="tooltip"
          style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
          className="absolute left-1/2 top-full z-30 mt-1.5 w-60 max-w-[calc(100vw-1rem)] rounded-lg bg-gray-900 px-3 py-2 text-left text-xs font-normal leading-snug text-white shadow-theme-lg dark:bg-gray-700"
        >
          {/* The little pointer up to the icon. */}
          <span
            aria-hidden
            style={{ transform: `translateX(calc(-50% - ${shift}px)) rotate(45deg)` }}
            className="absolute -top-1 left-1/2 h-2 w-2 bg-gray-900 dark:bg-gray-700"
          />
          {children}
        </span>
      ) : null}
    </span>
  );
}
