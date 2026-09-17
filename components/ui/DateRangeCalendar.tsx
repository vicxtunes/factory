"use client";

import { useState } from "react";

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

// Desktop-only range picker for the Orders filter's "Custom range" date
// preset — a real calendar grid instead of two plain <input type="date">
// boxes, which is what was there before. Click a start day, then an end
// day; clicking again before the range is complete restarts it. Mobile
// keeps the native date inputs (a real date wheel is already the better
// touch experience there) — see the md:hidden/md:block split at the call
// site in app/dashboard/order-board.tsx and app/client-side/orders-board.tsx.
export function DateRangeCalendar({
  from,
  to,
  onChange,
}: {
  from: string; // yyyy-mm-dd, "" = unset
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const anchor = from ? parseISO(from) : to ? parseISO(to) : new Date();
  const [viewYear, setViewYear] = useState(anchor.getFullYear());
  const [viewMonth, setViewMonth] = useState(anchor.getMonth());

  const first = new Date(viewYear, viewMonth, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells: (Date | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewYear, viewMonth, i + 1)),
  ];

  function pick(day: Date) {
    const iso = toISO(day);
    if (!from || to) {
      onChange(iso, "");
    } else if (iso < from) {
      onChange(iso, from);
    } else {
      onChange(from, iso);
    }
  }

  function changeMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  return (
    <div className="select-none">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          aria-label="Previous month"
          className="rounded px-2 py-1 text-xs hover:bg-background"
        >
          ‹
        </button>
        <span className="text-xs font-medium">
          {first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </span>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          aria-label="Next month"
          className="rounded px-2 py-1 text-xs hover:bg-background"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center text-[0.65rem] text-muted">
        {WEEKDAYS.map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <span key={i} />;
          const iso = toISO(day);
          const isEndpoint = iso === from || iso === to;
          const within = !!from && !!to && iso >= from && iso <= to;
          return (
            <button
              key={i}
              type="button"
              onClick={() => pick(day)}
              className={`h-7 rounded text-xs tnum ${
                isEndpoint
                  ? "bg-brand-500 font-semibold text-white"
                  : within
                    ? "bg-brand-500/15 text-foreground"
                    : "text-foreground hover:bg-background"
              }`}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      {from ? (
        <div className="mt-2 flex items-center justify-between text-[0.65rem] text-muted">
          <span className="tnum">{to ? `${from} → ${to}` : `${from} → …`}</span>
          <button
            type="button"
            onClick={() => onChange("", "")}
            className="text-brand-600 hover:underline"
          >
            Clear
          </button>
        </div>
      ) : null}
    </div>
  );
}
