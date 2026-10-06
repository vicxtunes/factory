import Link from "next/link";

import { BOOKING_STATUS_LABELS, type Booking, type BookingStatus } from "@repo/lib/bookings/core";
import { formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

const TONES: Record<BookingStatus, string> = {
  requested: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400",
  tentative: "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-500",
  confirmed: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500",
  completed: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400",
  cancelled: "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500",
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TONES[status]}`}>{BOOKING_STATUS_LABELS[status]}</span>;
}

/** "10:00–18:00", or "All day". */
export function timeSpan(b: Pick<Booking, "startTime" | "endTime">): string {
  return b.startTime && b.endTime ? `${b.startTime}–${b.endTime}` : "All day";
}

/** Bookings as a list: day, time, title, client, status. `basePath` null = read-only. */
export function BookingsList({
  bookings,
  scope,
  basePath,
  empty = "No bookings.",
}: {
  bookings: Booking[];
  scope: Pick<TenantScope, "locale" | "timeZone">;
  basePath: string | null;
  empty?: string;
}) {
  if (bookings.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">{empty}</p>;
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
      {bookings.map((b) => (
        <li key={b.id} className={`flex items-start justify-between gap-3 px-4 py-3 ${b.status === "cancelled" ? "opacity-60" : ""}`}>
          <div className="min-w-0">
            <p className="font-medium">
              {basePath ? (
                <Link href={`${basePath}/${b.id}`} className="hover:underline">
                  {b.title}
                </Link>
              ) : (
                b.title
              )}
            </p>
            <p className="text-xs text-muted">
              {formatDay(scope, b.date)} · {timeSpan(b)} · {b.customerName}
              {b.location ? ` · ${b.location}` : ""}
            </p>
          </div>
          <BookingStatusBadge status={b.status} />
        </li>
      ))}
    </ul>
  );
}
