import { BackLink } from "@repo/ui/navigation/back";
import { notFound } from "next/navigation";

import { BookingForm } from "@repo/ui/bookings/BookingForm";
import { FormSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { bookingIdSchema, canEditBooking, type Booking } from "@repo/lib/bookings/core";
import { bookings } from "@repo/lib/bookings/server";
import { customers } from "@repo/lib/customers/server";
import { offeringLabel } from "@repo/lib/offerings/core";
import { offerings } from "@repo/lib/offerings/server";
import { requireStudio } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

export const metadata = { title: "Edit booking · My Business" };

export default async function EditBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { scope } = await requireStudio("bookings");
  const id = bookingIdSchema.safeParse((await params).id);
  const view = id.success ? await bookings.get(scope, id.data) : null;
  if (!view) notFound();
  const b = view.booking;
  if (!canEditBooking(b.status)) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
        This booking can&apos;t be changed any more.{" "}
        <BackLink href={`/studio/bookings/${b.id}`} className="font-medium text-brand-600 underline">
          Back to it
        </BackLink>
      </p>
    );
  }

  return (
    <>
      <BackLink href={`/studio/bookings/${b.id}`} className="text-xs font-medium text-brand-600 hover:underline">
        ← {b.title}
      </BackLink>
      <Loading skeleton={<FormSkeleton />}>
        <Form scope={scope} b={b} />
      </Loading>
    </>
  );
}

async function Form({ scope, b }: { scope: TenantScope; b: Booking }) {
  const [clients, onSale] = await Promise.all([customers.list(scope), offerings.onSale(scope, "service")]);
  // Keep the booking's own client selectable even if they've since been archived.
  const choices = clients.some((c) => c.id === b.customerId) ? clients : [...clients, { id: b.customerId, name: `${b.customerName} (archived)` }];

  return (
    <BookingForm
      booking={b}
      customers={choices.map((c) => ({ id: c.id, name: c.name }))}
      packages={onSale.map((o) => ({ label: offeringLabel(o), price: o.price }))}
      scope={scope}
      basePath="/studio/bookings"
    />
  );
}
