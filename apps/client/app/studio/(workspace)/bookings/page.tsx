import Link from "next/link";

import { BookingsCalendar } from "@repo/ui/bookings/BookingsCalendar";
import { localDate } from "@repo/lib/accounting/core/period";
import { calendarViewSchema, viewRange } from "@repo/lib/bookings/core";
import { bookings } from "@repo/lib/bookings/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Bookings · My Studio" };

export default async function StudioBookingsPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const { scope } = await requireStudio();
  const params = await searchParams;
  const today = localDate(new Date(), scope.timeZone);
  const view = calendarViewSchema.catch("month").parse(params.view);
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") && !Number.isNaN(Date.parse(params.date!)) ? params.date! : today;
  const { from, to } = viewRange(view, anchor);
  const list = await bookings.between(scope, from, to);

  return (
    <>
      <div className="flex justify-end">
        <Link
          href={`/studio/bookings/new?date=${anchor}`}
          className="inline-flex min-h-11 items-center rounded-[var(--radius)] bg-brand-500 px-4 text-sm text-white shadow-theme-xs hover:bg-brand-600"
        >
          New booking
        </Link>
      </div>
      <BookingsCalendar view={view} anchor={anchor} today={today} bookings={list} scope={scope} basePath="/studio/bookings" />
    </>
  );
}
