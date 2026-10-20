import Link from "next/link";

import { BookingForm } from "@repo/ui/bookings/BookingForm";
import { buttonClass } from "@repo/ui/Button";
import { FormSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { UrlSheet } from "@repo/ui/UrlSheet";
import type { Booking } from "@repo/lib/bookings/core";
import { bookings } from "@repo/lib/bookings/server";
import { customers } from "@repo/lib/customers/server";
import { offeringLabel } from "@repo/lib/offerings/core";
import { offerings } from "@repo/lib/offerings/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

// A booking's forms in the sheet: "New booking" over the calendar (?new, maybe
// with the day, a quotation to book from, or a client), "Edit" over the
// booking (?edit). Saving opens the booking.

export function NewBookingSheet({ scope, closeHref, date, quotation, client }: { scope: TenantScope; closeHref: string; date?: string; quotation?: string; client?: string }) {
  return (
    <UrlSheet title="New booking" closeHref={closeHref} size="lg">
      <Loading skeleton={<FormSkeleton />}>
        <NewForm scope={scope} date={date} quotation={quotation} client={client} />
      </Loading>
    </UrlSheet>
  );
}

export function EditBookingSheet({ scope, booking }: { scope: TenantScope; booking: Booking }) {
  return (
    <UrlSheet title="Edit booking" closeHref={`/studio/bookings/${booking.id}`} size="lg">
      <Loading skeleton={<FormSkeleton />}>
        <EditForm scope={scope} b={booking} />
      </Loading>
    </UrlSheet>
  );
}

async function NewForm({ scope, date, quotation, client }: { scope: TenantScope; date?: string; quotation?: string; client?: string }) {
  const [clients, onSale, draft] = await Promise.all([
    customers.list(scope),
    offerings.onSale(scope, "service"),
    // Looked up in the caller's studio only; anything else gives no draft.
    quotation && /^[0-9a-f-]{36}$/i.test(quotation) ? bookings.draftFromQuotation(scope, quotation) : null,
  ]);

  return clients.length === 0 ? (
    <div className="space-y-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
      <p>Add a client first.</p>
      <Link href="/studio/clients?new" className={buttonClass("primary", "sm")}>
        New client
      </Link>
    </div>
  ) : (
    <BookingForm
      draft={draft ?? undefined}
      date={date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined}
      presetCustomerId={clients.some((c) => c.id === client) ? client : undefined}
      customers={clients.map((c) => ({ id: c.id, name: c.name }))}
      packages={onSale.map((o) => ({ label: offeringLabel(o), price: o.price }))}
      scope={scope}
      basePath="/studio/bookings"
    />
  );
}

async function EditForm({ scope, b }: { scope: TenantScope; b: Booking }) {
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
