import Link from "next/link";

import { BookingForm } from "@repo/ui/bookings/BookingForm";
import { bookings } from "@repo/lib/bookings/server";
import { customers } from "@repo/lib/customers/server";
import { offeringLabel } from "@repo/lib/offerings/core";
import { offerings } from "@repo/lib/offerings/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "New booking · My Studio" };

export default async function NewBookingPage({ searchParams }: { searchParams: Promise<{ date?: string; quotation?: string }> }) {
  const { scope } = await requireStudio();
  const { date, quotation } = await searchParams;
  const [clients, onSale, draft] = await Promise.all([
    customers.list(scope),
    offerings.onSale(scope),
    // Looked up in the caller's studio only; anything else gives no draft.
    quotation && /^[0-9a-f-]{36}$/i.test(quotation) ? bookings.draftFromQuotation(scope, quotation) : null,
  ]);

  return (
    <>
      <Link href="/studio/bookings" className="text-xs font-medium text-brand-600 hover:underline">
        ← Bookings
      </Link>
      {clients.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
          Add a client first:{" "}
          <Link href="/studio/clients/new" className="font-medium text-brand-600 underline">
            New client
          </Link>
        </p>
      ) : (
        <BookingForm
          draft={draft ?? undefined}
          date={date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined}
          customers={clients.map((c) => ({ id: c.id, name: c.name }))}
          packages={onSale.map(offeringLabel)}
          currency={scope.currency}
          basePath="/studio/bookings"
        />
      )}
    </>
  );
}
