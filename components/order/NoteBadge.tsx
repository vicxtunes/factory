"use client";

import { useEffect, useRef, useState } from "react";

import { Linkify } from "@/components/ui/Linkify";
import type { OrderNote } from "@/lib/types";

function NoteGroup({ label, notes }: { label: string; notes: OrderNote[] }) {
  if (notes.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <ul className="space-y-2">
        {notes.map((n) => (
          <li key={n.id}>
            <p className="text-[0.65rem] font-medium text-muted">{n.author_name}</p>
            <Linkify text={n.body} className="text-foreground" />
          </li>
        ))}
      </ul>
    </div>
  );
}

// A standalone note icon for order/item cards — filled and colored so it's
// hard to miss, since a note is expected on every order and easy to skip
// past otherwise. Click pops the notes open right there, split into "Order
// notes" and "Item notes" so it's clear which one you're reading without
// opening the full detail view — the whole point is saving that trip. Read-
// only preview — editing a note (author-only) happens in the full
// NotesThread in order detail. Must render as a sibling of the card's own
// onOpen button, never nested inside it (nested <button>s are invalid HTML
// and would fire both handlers).
export function NoteBadge({
  orderNotes,
  itemNotes,
  align = "right",
}: {
  orderNotes: OrderNote[];
  itemNotes: OrderNote[];
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const total = orderNotes.length + itemNotes.length;

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
    <div ref={rootRef} className="relative z-10 shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Hide notes" : "View notes"}
        title={`${total} note${total === 1 ? "" : "s"}`}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full shadow-theme-xs transition-transform hover:scale-110 ${
          open ? "bg-brand-600" : "bg-[var(--urgent)]"
        } text-white`}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
          <path d="M3 1.5A1.5 1.5 0 0 0 1.5 3v10A1.5 1.5 0 0 0 3 14.5h10a1.5 1.5 0 0 0 1.5-1.5V6.621a1.5 1.5 0 0 0-.44-1.06L10.44 1.94A1.5 1.5 0 0 0 9.38 1.5H3ZM3 3h6v3a1 1 0 0 0 1 1h3v6H3V3Zm7 .621L12.379 6H10V3.621Z" />
        </svg>
      </button>
      {open ? (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-full z-40 mt-1 max-h-80 w-72 space-y-3 overflow-y-auto rounded-[var(--radius)] border border-border bg-surface p-3 text-xs shadow-theme-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <NoteGroup label="Order notes" notes={orderNotes} />
          <NoteGroup label="Item notes" notes={itemNotes} />
        </div>
      ) : null}
    </div>
  );
}
