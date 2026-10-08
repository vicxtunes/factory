import { BackLink } from "@repo/ui/navigation/back";
import { notFound } from "next/navigation";

import { DocumentEditor } from "@repo/ui/billing/DocumentEditor";
import { FormSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { canEditQuotation, quotationIdSchema, type Quotation } from "@repo/lib/billing/core";
import { quotations } from "@repo/lib/billing/server";
import { bookings } from "@repo/lib/bookings/server";
import { customers } from "@repo/lib/customers/server";
import { offerings } from "@repo/lib/offerings/server";
import { requireStudio } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

export const metadata = { title: "Edit quotation · My Business" };

export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { scope } = await requireStudio();
  const id = quotationIdSchema.safeParse((await params).id);
  const quotation = id.success ? await quotations.get(scope, id.data) : null;
  if (!quotation) notFound();
  if (!canEditQuotation(quotation.status)) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
        This quotation has been answered, so it can&apos;t be changed.{" "}
        <BackLink href={`/studio/quotations/${quotation.id}`} className="font-medium text-brand-600 underline">
          Back to it
        </BackLink>
      </p>
    );
  }

  return (
    <>
      <BackLink href={`/studio/quotations/${quotation.id}`} className="text-xs font-medium text-brand-600 hover:underline">
        ← {quotation.number}
      </BackLink>
      <Loading skeleton={<FormSkeleton />}>
        <Form scope={scope} quotation={quotation} />
      </Loading>
    </>
  );
}

async function Form({ scope, quotation }: { scope: TenantScope; quotation: Quotation }) {
  const [clients, onSale, bookingId] = await Promise.all([customers.list(scope), offerings.onSale(scope), bookings.idForQuotation(scope, quotation.id)]);
  // Made from a booking: the booking holds the shoot's day and times; the form shows them read-only.
  const b = bookingId ? (await bookings.get(scope, bookingId))?.booking : null;
  // Keep the quotation's own client selectable even if they've since been archived.
  const choices = clients.some((c) => c.id === quotation.customerId)
    ? clients
    : [...clients, { id: quotation.customerId, name: `${quotation.billTo.name} (archived)` }];

  return (
    <DocumentEditor
      kind="quotation"
      document={{
        id: quotation.id,
        customerId: quotation.customerId,
        date: quotation.validUntil,
        shoot: quotation.shoot,
        booking: b ? { id: b.id, shoot: { date: b.date, startTime: b.startTime, endTime: b.endTime } } : null,
        notes: quotation.notes,
        lines: quotation.lines,
      }}
      customers={choices.map((c) => ({ id: c.id, name: c.name }))}
      offerings={onSale}
      scope={scope}
      basePath="/studio/quotations"
    />
  );
}
