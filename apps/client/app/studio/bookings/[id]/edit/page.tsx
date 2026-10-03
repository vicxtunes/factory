import Link from "next/link";
import { notFound } from "next/navigation";

import { BookingForm } from "@repo/ui/bookings/BookingForm";
import { bookingIdSchema, canEditBooking } from "@repo/lib/bookings/core";
import { bookings } from "@repo/lib/bookings/server";
import { customers } from "@repo/lib/customers/server";
import { offerings } from "@repo/lib/offerings/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Edit booking — My Studio" };

export default async function EditBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { scope } = await requireStudio();
  const id = bookingIdSchema.safeParse((await params).id);
  const view = id.success ? await bookings.get(scope, id.data) : null;
  if (!view) notFound();
  const b = view.booking;
  if (!canEditBooking(b.status)) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
        This booking can&apos;t be changed any more.{" "}
        <Link href={`/studio/bookings/${b.id}`} className="font-medium text-brand-600 underline">
          Back to it
        </Link>
      </p>
    );
  }
  const [clients, onSale] = await Promise.all([customers.list(scope), offerings.list(scope)]);
  // Keep the booking's own client selectable even if they've since been archived.
  const choices = clients.some((c) => c.id === b.customerId) ? clients : [...clients, { id: b.customerId, name: `${b.customerName} (archived)` }];

  return (
    <>
      <Link href={`/studio/bookings/${b.id}`} className="text-xs font-medium text-brand-600 hover:underline">
        ← {b.title}
      </Link>
      <BookingForm
        booking={b}
        customers={choices.map((c) => ({ id: c.id, name: c.name }))}
        packages={onSale.map((o) => o.name)}
        currency={scope.currency}
        basePath="/studio/bookings"
      />
    </>
  );
}
