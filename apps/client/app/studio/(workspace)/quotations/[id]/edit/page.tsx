import Link from "next/link";
import { notFound } from "next/navigation";

import { DocumentEditor } from "@repo/ui/billing/DocumentEditor";
import { canEditQuotation, quotationIdSchema } from "@repo/lib/billing/core";
import { quotations } from "@repo/lib/billing/server";
import { customers } from "@repo/lib/customers/server";
import { offerings } from "@repo/lib/offerings/server";
import { requireStudio } from "@repo/lib/studios/server";

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
        <Link href={`/studio/quotations/${quotation.id}`} className="font-medium text-brand-600 underline">
          Back to it
        </Link>
      </p>
    );
  }
  const [clients, onSale] = await Promise.all([customers.list(scope), offerings.onSale(scope)]);
  // Keep the quotation's own client selectable even if they've since been archived.
  const choices = clients.some((c) => c.id === quotation.customerId)
    ? clients
    : [...clients, { id: quotation.customerId, name: `${quotation.billTo.name} (archived)` }];

  return (
    <>
      <Link href={`/studio/quotations/${quotation.id}`} className="text-xs font-medium text-brand-600 hover:underline">
        ← {quotation.number}
      </Link>
      <DocumentEditor
        kind="quotation"
        document={{ id: quotation.id, customerId: quotation.customerId, date: quotation.validUntil, notes: quotation.notes, lines: quotation.lines }}
        customers={choices.map((c) => ({ id: c.id, name: c.name }))}
        offerings={onSale}
        scope={scope}
        basePath="/studio/quotations"
      />
    </>
  );
}
