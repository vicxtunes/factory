"use client";

import { formatDate, monthWeeks, shiftMonth } from "./dates";
import { Popover } from "./Popover";

// Month view: Monday-first grid with items (tasks, usually) as chips on
// their date, up to three a day then "+N more" opening the full list.
// Today is ringed, other months' days are dimmed. On phones the chips
// shrink to coloured dots so the grid still fits. Caller owns the month
// shown and handles clicks.
// Draft — lives in the Design Room until a page adopts it.

export interface CalendarItem {
  key: string;
  label: string;
  /** ISO date. */
  date: string;
  tone?: "default" | "overdue" | "done";
}

const CHIP = {
  default: "bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-400",
  overdue: "bg-error-50 text-error-700 hover:bg-error-100 dark:bg-error-500/15 dark:text-error-400",
  done: "bg-gray-100 text-gray-500 line-through hover:bg-gray-200 dark:bg-white/5 dark:text-gray-400",
};

const DOT = { default: "bg-brand-500", overdue: "bg-error-500", done: "bg-gray-400" };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS = 3;

function Chip({ item, onItemClick }: { item: CalendarItem; onItemClick?: (key: string) => void }) {
  const cls = `block w-full truncate rounded px-1.5 py-0.5 text-left text-[0.7rem] font-medium ${CHIP[item.tone ?? "default"]}`;
  return onItemClick ? (
    <button type="button" title={item.label} onClick={() => onItemClick(item.key)} className={cls}>
      {item.label}
    </button>
  ) : (
    <span title={item.label} className={cls}>
      {item.label}
    </span>
  );
}

export function CalendarMonth({
  month,
  items,
  today,
  onMonthChange,
  onItemClick,
}: {
  /** "YYYY-MM". */
  month: string;
  items: CalendarItem[];
  /** ISO date to ring. */
  today: string;
  onMonthChange: (month: string) => void;
  onItemClick?: (key: string) => void;
}) {
  const weeks = monthWeeks(month);

  return (
    <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
        <h3 className="text-sm font-semibold" aria-live="polite">
          {formatDate(`${month}-01`, { month: "long", year: "numeric" })}
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMonthChange(today.slice(0, 7))}
            className="min-h-9 rounded-lg px-3 text-xs font-medium text-muted hover:bg-background hover:text-foreground"
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => onMonthChange(shiftMonth(month, -1))}
            className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-background hover:text-foreground"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => onMonthChange(shiftMonth(month, 1))}
            className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-background hover:text-foreground"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-1.5 text-center font-mono text-[0.65rem] uppercase tracking-widest text-muted">
            <span className="sm:hidden">{d[0]}</span>
            <span className="hidden sm:inline">{d}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {weeks.flat().map((day, i) => {
          const dayItems = items.filter((it) => it.date === day);
          const inMonth = day.slice(0, 7) === month;
          const isToday = day === today;
          const extra = dayItems.length - MAX_CHIPS;
          const dateLabel = formatDate(day, { weekday: "long", day: "numeric", month: "long" });
          return (
            <div
              key={day}
              aria-label={`${dateLabel}${dayItems.length ? `, ${dayItems.length} item${dayItems.length === 1 ? "" : "s"}` : ""}`}
              role="group"
              className={`min-h-16 space-y-1 border-border p-1 sm:min-h-28 sm:p-1.5 ${i % 7 !== 6 ? "border-r" : ""} ${i < weeks.length * 7 - 7 ? "border-b" : ""} ${
                inMonth ? "" : "bg-gray-50/80 dark:bg-white/[0.02]"
              }`}
            >
              <span
                className={`ml-auto flex size-6 items-center justify-center rounded-full text-xs tnum ${
                  isToday ? "bg-brand-500 font-semibold text-white" : inMonth ? "" : "text-gray-400 dark:text-white/25"
                }`}
              >
                {Number(day.slice(8))}
              </span>
              {/* Phones: dots only. */}
              {dayItems.length > 0 ? (
                <span aria-hidden className="flex flex-wrap justify-center gap-0.5 sm:hidden">
                  {dayItems.slice(0, 4).map((it) => (
                    <span key={it.key} className={`size-1.5 rounded-full ${DOT[it.tone ?? "default"]}`} />
                  ))}
                </span>
              ) : null}
              <div className="hidden space-y-1 sm:block">
                {dayItems.slice(0, MAX_CHIPS).map((it) => (
                  <Chip key={it.key} item={it} onItemClick={onItemClick} />
                ))}
                {extra > 0 ? (
                  <Popover bare narrow ariaLabel={`Show all ${dayItems.length} items on ${dateLabel}`} label={<span className="px-1.5 text-[0.7rem] font-medium text-muted">+{extra} more</span>}>
                    <div className="space-y-1">
                      <p className="pb-1 text-xs font-semibold">{formatDate(day, { weekday: "short", day: "numeric", month: "short" })}</p>
                      {dayItems.map((it) => (
                        <Chip key={it.key} item={it} onItemClick={onItemClick} />
                      ))}
                    </div>
                  </Popover>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
