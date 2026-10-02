"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

// Lightweight click-to-open panel anchored to a trigger button. Closes on
// outside click or Escape. For the Orders filter panel — the Drawer is a
// full-height sheet, too heavy for this.
export function Popover({
  label,
  children,
  align = "left",
}: {
  label: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
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
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface px-3 text-sm shadow-theme-xs hover:bg-background"
      >
        {label}
        <span aria-hidden className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
      {open ? (
        <div
          id={panelId}
          className={`absolute z-40 mt-1 w-72 rounded-[var(--radius)] border border-border bg-surface p-3 shadow-theme-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
