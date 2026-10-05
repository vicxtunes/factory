import Link from "next/link";
import { notFound } from "next/navigation";

import { DocumentEditor } from "@repo/ui/billing/DocumentEditor";
import { canEditInvoice, invoiceIdSchema } from "@repo/lib/billing/core";
import { invoices } from "@repo/lib/billing/server";
import { customers } from "@repo/lib/customers/server";
import { offerings } from "@repo/lib/offerings/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Edit invoice · My Studio" };

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { scope } = await requireStudio();
  const id = invoiceIdSchema.safeParse((await params).id);
  const invoice = id.success ? await invoices.get(scope, id.data) : null;
  if (!invoice) notFound();
  if (!canEditInvoice({ voided: !!invoice.voidedAt, paid: invoice.paid })) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
        {invoice.voidedAt ? "This invoice is void." : "This invoice has payments, so it can't be changed. Void them first."}{" "}
        <Link href={`/studio/invoices/${invoice.id}`} className="font-medium text-brand-600 underline">
          Back to it
        </Link>
      </p>
    );
  }
  const [clients, onSale] = await Promise.all([customers.list(scope), offerings.onSale(scope)]);
  // Keep the invoice's own client selectable even if they've since been archived.
  const choices = clients.some((c) => c.id === invoice.customerId)
    ? clients
    : [...clients, { id: invoice.customerId, name: `${invoice.billTo.name} (archived)` }];

  return (
    <>
      <Link href={`/studio/invoices/${invoice.id}`} className="text-xs font-medium text-brand-600 hover:underline">
        ← {invoice.number}
      </Link>
      <DocumentEditor
        kind="invoice"
        document={{ id: invoice.id, customerId: invoice.customerId, date: invoice.dueDate, notes: invoice.notes, lines: invoice.lines }}
        customers={choices.map((c) => ({ id: c.id, name: c.name }))}
        offerings={onSale}
        scope={scope}
        basePath="/studio/invoices"
      />
    </>
  );
}
