import Link from "next/link";
import { BackLink } from "@repo/ui/navigation/back";
import { notFound } from "next/navigation";

import { DocumentShare } from "@repo/ui/billing/DocumentShare";
import { InvoicePdf } from "@repo/ui/billing/DocumentPdf";
import { VoidInvoiceButton } from "@repo/ui/billing/InvoiceButtons";
import { PaymentsPanel } from "@repo/ui/billing/PaymentsPanel";
import { localDate } from "@repo/lib/accounting/core/period";
import { canEditInvoice, canVoidInvoice, invoiceIdSchema } from "@repo/lib/billing/core";
import { documentIssuer, invoices, invoiceUrl, receiptUrl } from "@repo/lib/billing/server";
import { bookings } from "@repo/lib/bookings/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Invoice · My Business" };

const button =
  "inline-flex min-h-11 items-center rounded-[var(--radius)] border border-gray-300 bg-white px-4 text-sm text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300";

export default async function StudioInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { scope, studio } = await requireStudio("money");
  // Looked up inside the caller's studio only: another studio's id is "not found".
  const id = invoiceIdSchema.safeParse((await params).id);
  const [invoice, issuer] = await Promise.all([id.success ? invoices.get(scope, id.data) : null, documentIssuer(studio.id)]);
  if (!invoice) notFound();
  const state = { voided: !!invoice.voidedAt, paid: invoice.paid };
  // Booked automatically from its shoot day (or its quotation's).
  const bookingId = await bookings.idForInvoice(scope, invoice.id);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackLink href="/studio/invoices" className="text-xs font-medium text-brand-600 hover:underline">
          ← Invoices
        </BackLink>
        <div className="flex flex-wrap gap-2">
          {invoice.sourceId ? (
            <Link href={`/studio/quotations/${invoice.sourceId}`} className={button}>
              Quotation
            </Link>
          ) : null}
          {bookingId ? (
            <Link href={`/studio/bookings/${bookingId}`} className={button}>
              Booking
            </Link>
          ) : null}
          {canEditInvoice(state) ? (
            <Link href={`/studio/invoices/${invoice.id}/edit`} className={button}>
              Edit
            </Link>
          ) : null}
        </div>
      </div>
      {invoice.voidedAt ? null : (
        <DocumentShare
          kind="invoice"
          documentId={invoice.id}
          url={invoiceUrl(invoice.shareToken)}
          number={invoice.number}
          studioName={studio.name}
          clientPhone={invoice.billTo.phone}
        />
      )}
      <PaymentsPanel
        invoice={invoice}
        receiptUrls={Object.fromEntries(invoice.payments.map((p) => [p.id, receiptUrl(p.shareToken)]))}
        today={localDate(new Date(), scope.timeZone)}
        scope={scope}
      />
      <InvoicePdf
        invoice={invoice}
        issuer={issuer}
        scope={{ currency: scope.currency, locale: scope.locale, timeZone: scope.timeZone }}
      />
      {canVoidInvoice(state) ? <VoidInvoiceButton invoiceId={invoice.id} /> : null}
    </>
  );
}
