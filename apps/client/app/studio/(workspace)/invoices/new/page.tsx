import Link from "next/link";
import { BackLink } from "@repo/ui/navigation/back";

import { FormSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { DocumentEditor } from "@repo/ui/billing/DocumentEditor";
import { customers } from "@repo/lib/customers/server";
import { offerings } from "@repo/lib/offerings/server";
import { requireStudio } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { fromBooking } from "../../../_workspace/from-booking";
import { buttonClass } from "@repo/ui/Button";

export const metadata = { title: "New invoice · My Business" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ client?: string; booking?: string }> }) {
  const { scope } = await requireStudio("money");
  const { client, booking } = await searchParams;

  return (
    <>
      <BackLink href={booking ? `/studio/bookings/${booking}` : "/studio/invoices"} className="text-xs font-medium text-brand-600 hover:underline">
        {booking ? "← Booking" : "← Invoices"}
      </BackLink>
      <Loading skeleton={<FormSkeleton />}>
        <Form scope={scope} client={client} booking={booking} />
      </Loading>
    </>
  );
}

async function Form({ scope, client, booking }: { scope: TenantScope; client?: string; booking?: string }) {
  // From a booking ("Create invoice" on it): its client, when and package, already filled in.
  const [clients, onSale, from] = await Promise.all([customers.list(scope), offerings.onSale(scope), fromBooking(scope, booking, "invoice")]);
  return clients.length === 0 ? (
    <div className="space-y-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
      <p>Add a client first.</p>
      <Link href="/studio/clients?new" className={buttonClass("primary", "sm")}>
        New client
      </Link>
    </div>
  ) : (
    <DocumentEditor
      kind="invoice"
      customers={clients.map((c) => ({ id: c.id, name: c.name }))}
      offerings={onSale}
      presetCustomerId={clients.some((c) => c.id === client) ? client : undefined}
      fromBooking={from ?? undefined}
      scope={scope}
      basePath="/studio/invoices"
    />
  );
}
