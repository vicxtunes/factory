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

export const metadata = { title: "New quotation · My Business" };

export default async function NewQuotationPage({ searchParams }: { searchParams: Promise<{ client?: string; booking?: string }> }) {
  const { scope } = await requireStudio();
  const { client, booking } = await searchParams;

  return (
    <>
      <BackLink href={booking ? `/studio/bookings/${booking}` : "/studio/quotations"} className="text-xs font-medium text-brand-600 hover:underline">
        {booking ? "← Booking" : "← Quotations"}
      </BackLink>
      <Loading skeleton={<FormSkeleton />}>
        <Form scope={scope} client={client} booking={booking} />
      </Loading>
    </>
  );
}

async function Form({ scope, client, booking }: { scope: TenantScope; client?: string; booking?: string }) {
  // From a booking ("Create quotation" on it): its client, when and package, already filled in.
  const [clients, onSale, from] = await Promise.all([customers.list(scope), offerings.onSale(scope), fromBooking(scope, booking, "quotation")]);
  return clients.length === 0 ? (
    <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
      Add a client first:{" "}
      <Link href="/studio/clients/new" className="font-medium text-brand-600 underline">
        New client
      </Link>
    </p>
  ) : (
    <DocumentEditor
      kind="quotation"
      customers={clients.map((c) => ({ id: c.id, name: c.name }))}
      offerings={onSale}
      presetCustomerId={clients.some((c) => c.id === client) ? client : undefined}
      fromBooking={from ?? undefined}
      scope={scope}
      basePath="/studio/quotations"
    />
  );
}
