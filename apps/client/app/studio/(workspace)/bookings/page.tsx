import Link from "next/link";

import { BookingsCalendar } from "@repo/ui/bookings/BookingsCalendar";
import { Skeleton } from "@repo/ui/Skeleton";
import { Loading } from "@repo/ui/skeletons/Loading";
import { localDate } from "@repo/lib/accounting/core/period";
import { calendarViewSchema, viewRange, type CalendarView } from "@repo/lib/bookings/core";
import { bookings } from "@repo/lib/bookings/server";
import { requireStudio } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

export const metadata = { title: "Bookings · My Business" };

export default async function StudioBookingsPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const { scope } = await requireStudio("bookings");
  const params = await searchParams;
  const today = localDate(new Date(), scope.timeZone);
  const view = calendarViewSchema.catch("month").parse(params.view);
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") && !Number.isNaN(Date.parse(params.date!)) ? params.date! : today;

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
      <Loading skeleton={<Skeleton className="h-[32rem] w-full rounded-2xl" />}>
        <Calendar scope={scope} view={view} anchor={anchor} today={today} />
      </Loading>
    </>
  );
}

async function Calendar({ scope, view, anchor, today }: { scope: TenantScope; view: CalendarView; anchor: string; today: string }) {
  const { from, to } = viewRange(view, anchor);
  const list = await bookings.between(scope, from, to);
  return <BookingsCalendar view={view} anchor={anchor} today={today} bookings={list} scope={scope} basePath="/studio/bookings" />;
}
