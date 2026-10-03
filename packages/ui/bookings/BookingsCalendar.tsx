import Link from "next/link";

import { daysBetween, stepAnchor, viewRange, type Booking, type CalendarView } from "@repo/lib/bookings/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { BookingsList, timeSpan } from "./BookingBits";

const VIEWS: { key: CalendarView; label: string }[] = [
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
  { key: "day", label: "Day" },
  { key: "list", label: "List" },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DOT: Record<Booking["status"], string> = {
  tentative: "bg-warning-500",
  confirmed: "bg-success-500",
  completed: "bg-gray-400",
  cancelled: "bg-error-500",
};

/**
 * The studio's bookings as a month, week, day or list. Server-rendered:
 * switching view or moving back and forward are plain links
 * (`${basePath}?view=…&date=…`), so there's nothing to load on a phone.
 */
export function BookingsCalendar({
  view,
  anchor,
  today,
  bookings,
  scope,
  basePath,
}: {
  view: CalendarView;
  /** The day the view is around, "yyyy-mm-dd". */
  anchor: string;
  today: string;
  /** Bookings within viewRange(view, anchor). */
  bookings: Booking[];
  scope: Pick<TenantScope, "locale" | "timeZone">;
  basePath: string;
}) {
  const href = (v: CalendarView, d: string) => `${basePath}?view=${v}&date=${d}`;
  const { from, to } = viewRange(view, anchor);
  const byDay = new Map<string, Booking[]>();
  for (const b of bookings) byDay.set(b.date, [...(byDay.get(b.date) ?? []), b]);
  const label = new Intl.DateTimeFormat(scope.locale, {
    timeZone: "UTC",
    ...(view === "month" ? { month: "long", year: "numeric" } : { day: "numeric", month: "short", year: "numeric" }),
  });
  const title = view === "month" ? label.format(new Date(`${anchor}T12:00:00Z`)) : `${label.format(new Date(`${from}T12:00:00Z`))}${from === to ? "" : ` – ${label.format(new Date(`${to}T12:00:00Z`))}`}`;
  const dayNumber = (d: string) => Number(d.slice(8));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href={href(view, stepAnchor(view, anchor, -1))} aria-label="Previous" className="rounded-[var(--radius)] border border-border px-3 py-2 text-sm hover:bg-background">
            ←
          </Link>
          <Link href={href(view, today)} className="rounded-[var(--radius)] border border-border px-3 py-2 text-sm hover:bg-background">
            Today
          </Link>
          <Link href={href(view, stepAnchor(view, anchor, 1))} aria-label="Next" className="rounded-[var(--radius)] border border-border px-3 py-2 text-sm hover:bg-background">
            →
          </Link>
          <h2 className="ml-1 text-base font-semibold">{title}</h2>
        </div>
        <nav aria-label="Calendar view" className="flex gap-1 rounded-[var(--radius)] border border-border p-1">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={href(v.key, anchor)}
              aria-current={v.key === view ? "page" : undefined}
              className={`rounded px-3 py-1 text-sm ${v.key === view ? "bg-brand-500 text-white" : "hover:bg-background"}`}
            >
              {v.label}
            </Link>
          ))}
        </nav>
      </div>

      {view === "month" ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
          <div className="grid grid-cols-7 border-b border-border text-center text-xs font-medium text-muted">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {daysBetween(from, to).map((d) => {
              const items = byDay.get(d) ?? [];
              const inMonth = d.slice(0, 7) === anchor.slice(0, 7);
              return (
                <Link
                  key={d}
                  href={href("day", d)}
                  className={`min-h-16 border-b border-r border-border p-1 text-left hover:bg-background sm:min-h-24 ${inMonth ? "" : "bg-background/60 text-muted"}`}
                >
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${d === today ? "bg-brand-500 font-semibold text-white" : ""}`}>
                    {dayNumber(d)}
                  </span>
                  {/* Phones: a dot per booking. Wider: the titles. */}
                  <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                    {items.map((b) => (
                      <span key={b.id} className={`h-1.5 w-1.5 rounded-full ${DOT[b.status]}`} />
                    ))}
                  </div>
                  <ul className="mt-1 hidden space-y-0.5 sm:block">
                    {items.slice(0, 3).map((b) => (
                      <li key={b.id} className={`truncate text-xs ${b.status === "cancelled" ? "line-through opacity-60" : ""}`}>
                        <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${DOT[b.status]}`} />
                        {b.startTime ? `${b.startTime} ` : ""}
                        {b.title}
                      </li>
                    ))}
                    {items.length > 3 ? <li className="text-xs text-muted">+{items.length - 3} more</li> : null}
                  </ul>
                </Link>
              );
            })}
          </div>
        </div>
      ) : view === "week" || view === "day" ? (
        <div className="space-y-3">
          {daysBetween(from, to).map((d) => {
            const items = byDay.get(d) ?? [];
            return (
              <section key={d} className="rounded-2xl border border-border bg-surface p-3 shadow-theme-xs">
                <div className="mb-2 flex items-center justify-between">
                  <Link href={href("day", d)} className={`text-sm font-semibold hover:underline ${d === today ? "text-brand-600" : ""}`}>
                    {new Intl.DateTimeFormat(scope.locale, { timeZone: "UTC", weekday: "long", day: "numeric", month: "short" }).format(new Date(`${d}T12:00:00Z`))}
                  </Link>
                  <Link href={`${basePath}/new?date=${d}`} className="text-xs font-medium text-brand-600 hover:underline">
                    + Book
                  </Link>
                </div>
                {items.length === 0 ? (
                  <p className="text-xs text-muted">Free</p>
                ) : (
                  <ul className="space-y-1">
                    {items.map((b) => (
                      <li key={b.id}>
                        <Link href={`${basePath}/${b.id}`} className={`flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-background ${b.status === "cancelled" ? "line-through opacity-60" : ""}`}>
                          <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[b.status]}`} />
                          <span className="w-24 shrink-0 text-xs text-muted tnum">{timeSpan(b)}</span>
                          <span className="truncate">
                            {b.title} <span className="text-muted">· {b.customerName}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <BookingsList bookings={bookings} scope={scope} basePath={basePath} empty="Nothing booked in the next 60 days." />
      )}
    </div>
  );
}
