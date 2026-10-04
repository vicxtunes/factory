"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { addDays, daysBetween, formatDate, monthWeeks, shiftMonth } from "./dates";
import { Popover } from "./Popover";

// A single due date: the trigger reads "6 Oct" (red once overdue, "No date"
// when unset) and opens shortcuts — Today, Tomorrow, Next week, No date —
// over a month grid. Arrow keys move a day / week in the grid, Enter picks.
// Picking closes the panel. Unlike DateRangeCalendar this is one date, not
// a range, and weeks start on Monday.
// Draft — lives in the Design Room until a page adopts it.

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function MonthGrid({ value, today, onPick }: { value?: string; today: string; onPick: (iso: string) => void }) {
  const [month, setMonth] = useState((value ?? today).slice(0, 7));
  // The one day in the grid that's tabbable (roving tabindex).
  const [focusDay, setFocusDay] = useState(value ?? today);
  const weeks = monthWeeks(month);
  const gridRef = useRef<HTMLDivElement>(null);

  // On open, put focus on the selected day (or today) so arrows work straight away.
  useEffect(() => {
    gridRef.current?.querySelector<HTMLElement>("[tabindex='0']")?.focus();
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = addDays(focusDay, step);
    setFocusDay(next);
    if (next.slice(0, 7) !== month) setMonth(next.slice(0, 7));
    // Focus after the re-render that makes `next` the tabbable day.
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus());
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-background hover:text-foreground"
        >
          ‹
        </button>
        <span className="text-sm font-medium" aria-live="polite">
          {formatDate(`${month}-01`, { month: "long", year: "numeric" })}
        </span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-background hover:text-foreground"
        >
          ›
        </button>
      </div>
      <div ref={gridRef} role="grid" aria-label="Choose a due date" onKeyDown={onKeyDown}>
        <div role="row" className="grid grid-cols-7 text-center text-[0.65rem] font-medium text-muted">
          {WEEKDAYS.map((d, i) => (
            <span key={i} role="columnheader" className="py-1">
              {d}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} role="row" className="grid grid-cols-7">
            {week.map((day) => {
              const inMonth = day.slice(0, 7) === month;
              const selected = day === value;
              const isToday = day === today;
              const tabbable = day === focusDay || (focusDay.slice(0, 7) !== month && day === `${month}-01`);
              return (
                <span key={day} role="gridcell" aria-selected={selected}>
                  <button
                    type="button"
                    data-day={day}
                    tabIndex={tabbable ? 0 : -1}
                    aria-label={formatDate(day, { weekday: "long", day: "numeric", month: "long" })}
                    onFocus={() => setFocusDay(day)}
                    onClick={() => onPick(day)}
                    className={`mx-auto flex size-9 items-center justify-center rounded-full text-sm tnum outline-none focus-visible:ring-3 focus-visible:ring-brand-500/30 ${
                      selected
                        ? "bg-brand-500 font-semibold text-white"
                        : isToday
                          ? "font-semibold text-brand-600 ring-1 ring-brand-500/40 hover:bg-background dark:text-brand-400"
                          : inMonth
                            ? "hover:bg-background"
                            : "text-gray-400 hover:bg-background dark:text-white/25"
                    }`}
                  >
                    {Number(day.slice(8))}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DueDatePicker({
  value,
  today,
  onChange,
}: {
  /** ISO date, or undefined for no due date. */
  value?: string;
  /** ISO date for the shortcuts, the "today" ring and overdue colouring. */
  today: string;
  onChange: (value: string | undefined) => void;
}) {
  const overdue = value !== undefined && daysBetween(today, value) < 0;
  const label = value ? formatDate(value, { day: "numeric", month: "short" }) : "No date";
  const shortcuts = [
    { label: "Today", date: today },
    { label: "Tomorrow", date: addDays(today, 1) },
    { label: "Next week", date: addDays(today, 7) },
  ];

  return (
    <Popover
      bare
      ariaLabel={value ? `Due date: ${formatDate(value, { day: "numeric", month: "long" })}${overdue ? ", overdue" : ""}. Change` : "Due date: none. Set"}
      label={
        <span
          className={`inline-flex items-center gap-1.5 px-2 text-sm whitespace-nowrap ${
            overdue ? "font-medium text-error-600 dark:text-error-400" : value ? "" : "text-muted"
          }`}
        >
          <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="size-3.5">
            <rect x="2.5" y="3.5" width="11" height="10" rx="2" />
            <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
          </svg>
          {label}
        </span>
      }
    >
      {(close) => (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {shortcuts.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => {
                  onChange(s.date);
                  close();
                }}
                className={`min-h-9 rounded-full border px-3 text-xs font-medium ${
                  value === s.date ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400" : "border-border hover:bg-background"
                }`}
              >
                {s.label}
              </button>
            ))}
            {value ? (
              <button
                type="button"
                onClick={() => {
                  onChange(undefined);
                  close();
                }}
                className="min-h-9 rounded-full px-3 text-xs font-medium text-muted hover:bg-background hover:text-foreground"
              >
                No date
              </button>
            ) : null}
          </div>
          <MonthGrid
            value={value}
            today={today}
            onPick={(d) => {
              onChange(d);
              close();
            }}
          />
        </div>
      )}
    </Popover>
  );
}
