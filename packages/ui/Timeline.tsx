import { addDays, daysBetween, formatDate, weekdayIndex } from "./dates";

// Gantt-style timeline: one row per task, a bar from its start to its end
// date (shaded by progress), milestones as diamonds, weekends tinted and a
// line on today. Task names stay pinned on the left while the dates scroll
// sideways. Read-only — no dragging bars to reschedule (yet), and no
// dependency arrows (planned for v2).
// Draft — lives in the Design Room until a page adopts it.

export interface TimelineItem {
  key: string;
  label: string;
  /** ISO dates, inclusive. A milestone uses `start` and ignores `end`. */
  start: string;
  end: string;
  /** 0–1; the bar's darker fill. */
  progress?: number;
  milestone?: boolean;
}

const DAY_WIDTH = { day: 40, week: 18 } as const;
const NAME_WIDTH = 224; // px — matches w-56

export function Timeline({
  items,
  range,
  today,
  scale = "day",
  onItemClick,
}: {
  items: TimelineItem[];
  /** First and last day shown (ISO, inclusive). */
  range: { start: string; end: string };
  /** ISO date for the today line; outside the range, no line. */
  today: string;
  /** "day" labels every day; "week" packs the same dates tighter and labels each Monday. */
  scale?: "day" | "week";
  onItemClick?: (key: string) => void;
}) {
  const dayWidth = DAY_WIDTH[scale];
  const dayCount = daysBetween(range.start, range.end) + 1;
  const days = Array.from({ length: dayCount }, (_, i) => addDays(range.start, i));
  const trackWidth = dayCount * dayWidth;
  const todayOffset = daysBetween(range.start, today);
  const showToday = todayOffset >= 0 && todayOffset < dayCount;

  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-border bg-surface" style={{ scrollbarWidth: "none" }}>
      <div className="relative" style={{ width: NAME_WIDTH + trackWidth }}>
        {/* Background: weekend tint + today line, behind every row. */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0" style={{ left: NAME_WIDTH, width: trackWidth }}>
          {days.map((d, i) =>
            weekdayIndex(d) >= 5 ? (
              <div key={d} className="absolute inset-y-0 bg-gray-100/70 dark:bg-white/[0.03]" style={{ left: i * dayWidth, width: dayWidth }} />
            ) : null,
          )}
          {showToday ? (
            <div className="absolute inset-y-0 z-[1] w-0.5 bg-brand-500" style={{ left: todayOffset * dayWidth + dayWidth / 2 - 1 }} />
          ) : null}
        </div>

        {/* Date header */}
        <div className="relative flex border-b border-border">
          <div className="sticky left-0 z-10 flex w-56 shrink-0 items-end border-r border-border bg-surface px-4 pb-2 font-mono text-[0.6875rem] uppercase tracking-widest text-muted">
            Task
          </div>
          <div className="relative flex h-12" style={{ width: trackWidth }}>
            {days.map((d, i) => {
              const isToday = i === todayOffset;
              if (scale === "week") {
                return weekdayIndex(d) === 0 ? (
                  <span
                    key={d}
                    className="absolute bottom-2 whitespace-nowrap border-l border-border pl-1.5 text-xs text-muted"
                    style={{ left: i * dayWidth }}
                  >
                    {formatDate(d, { day: "numeric", month: "short" })}
                  </span>
                ) : null;
              }
              return (
                <div
                  key={d}
                  className={`flex shrink-0 flex-col items-center justify-end pb-1.5 text-[0.65rem] leading-tight ${
                    isToday ? "font-semibold text-brand-600 dark:text-brand-400" : "text-muted"
                  }`}
                  style={{ width: dayWidth }}
                >
                  <span>{formatDate(d, { weekday: "narrow" })}</span>
                  <span className="text-xs tnum">{formatDate(d, { day: "numeric" })}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rows */}
        <ul>
          {items.map((item) => {
            const from = Math.max(daysBetween(range.start, item.start), 0);
            const to = Math.min(daysBetween(range.start, item.milestone ? item.start : item.end), dayCount - 1);
            const visible = to >= 0 && from < dayCount;
            const dates = item.milestone
              ? formatDate(item.start, { day: "numeric", month: "short" })
              : `${formatDate(item.start, { day: "numeric", month: "short" })} – ${formatDate(item.end, { day: "numeric", month: "short" })}`;
            const name = `${item.label}, ${item.milestone ? "milestone, " : ""}${dates}${
              item.progress !== undefined ? `, ${Math.round(item.progress * 100)}% done` : ""
            }`;

            const bar = item.milestone ? (
              <span className="block size-3.5 rotate-45 rounded-[2px] bg-violet-500 ring-2 ring-surface" />
            ) : (
              <span className="relative block h-6 w-full overflow-hidden rounded-md bg-brand-200 dark:bg-brand-500/30">
                <span
                  className={`absolute inset-y-0 left-0 ${item.progress === 1 ? "bg-success-500" : "bg-brand-500"}`}
                  style={{ width: `${(item.progress ?? 0) * 100}%` }}
                />
              </span>
            );

            return (
              <li key={item.key} className="flex h-11 border-b border-border last:border-0">
                <div className="sticky left-0 z-10 flex w-56 shrink-0 items-center gap-2 border-r border-border bg-surface px-4 text-sm">
                  {item.milestone ? <span aria-hidden className="size-2 shrink-0 rotate-45 bg-violet-500" /> : null}
                  <span className="truncate" title={item.label}>
                    {item.label}
                  </span>
                </div>
                <div className="relative" style={{ width: trackWidth }}>
                  {visible ? (
                    <div
                      className="absolute inset-y-0 z-[2] flex items-center"
                      style={
                        item.milestone
                          ? { left: from * dayWidth, width: dayWidth, justifyContent: "center" }
                          : { left: from * dayWidth + 3, width: (to - from + 1) * dayWidth - 6 }
                      }
                    >
                      {onItemClick ? (
                        <button
                          type="button"
                          aria-label={name}
                          title={name}
                          onClick={() => onItemClick(item.key)}
                          className="flex w-full items-center justify-center rounded-md outline-none transition-opacity hover:opacity-80 focus-visible:ring-3 focus-visible:ring-brand-500/30"
                        >
                          {bar}
                        </button>
                      ) : (
                        <span title={name} className="flex w-full items-center justify-center">
                          {bar}
                        </span>
                      )}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
