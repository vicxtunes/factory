import Link from "next/link";
import { notFound } from "next/navigation";

import { QuotationPdf } from "@repo/ui/billing/DocumentPdf";
import { DocumentShare } from "@repo/ui/billing/DocumentShare";
import { CreateInvoiceButton } from "@repo/ui/billing/InvoiceButtons";
import { canEditQuotation, quotationIdSchema } from "@repo/lib/billing/core";
import { invoices, quotations, quotationUrl } from "@repo/lib/billing/server";
import { bookings } from "@repo/lib/bookings/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Quotation · My Studio" };

export default async function StudioQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { scope, studio } = await requireStudio();
  // Looked up inside the caller's studio only: another studio's id is "not found".
  const id = quotationIdSchema.safeParse((await params).id);
  const quotation = id.success ? await quotations.get(scope, id.data) : null;
  if (!quotation) notFound();
  const [invoiceId, bookingId] =
    quotation.status === "accepted"
      ? await Promise.all([invoices.idForQuotation(scope, quotation.id), bookings.idForQuotation(scope, quotation.id)])
      : [null, null];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/studio/quotations" className="text-xs font-medium text-brand-600 hover:underline">
          ← Quotations
        </Link>
        <div className="flex flex-wrap gap-2">
          {canEditQuotation(quotation.status) ? (
            <Link
              href={`/studio/quotations/${quotation.id}/edit`}
              className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-gray-300 bg-white px-4 text-sm text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              Edit
            </Link>
          ) : null}
        </div>
      </div>
      {quotation.status === "accepted" ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs print:hidden">
          <p className="text-sm">Accepted by the client.</p>
          {bookingId ? (
            <Link href={`/studio/bookings/${bookingId}`} className="text-sm font-medium text-brand-600 hover:underline">
              View its booking
            </Link>
          ) : (
            <Link href={`/studio/bookings/new?quotation=${quotation.id}`} className="text-sm font-medium text-brand-600 hover:underline">
              Book it
            </Link>
          )}
          {invoiceId ? (
            <Link href={`/studio/invoices/${invoiceId}`} className="text-sm font-medium text-brand-600 hover:underline">
              View its invoice
            </Link>
          ) : (
            <CreateInvoiceButton quotationId={quotation.id} basePath="/studio/invoices" />
          )}
        </section>
      ) : null}
      <DocumentShare
        kind="quotation"
        documentId={quotation.id}
        url={quotationUrl(quotation.shareToken)}
        number={quotation.number}
        studioName={studio.name}
        clientPhone={quotation.billTo.phone}
      />
      {quotation.status === "declined" ? (
        <section className="rounded-2xl border border-border bg-surface p-4 text-sm shadow-theme-xs">
          <p className="font-medium">Declined by the client</p>
          {quotation.declineReason ? <p className="mt-1 whitespace-pre-line text-muted">{quotation.declineReason}</p> : null}
        </section>
      ) : null}
      <QuotationPdf
        quotation={quotation}
        issuer={{ name: studio.name, phone: studio.phone, email: studio.email, address: studio.address }}
        scope={{ currency: scope.currency, locale: scope.locale, timeZone: scope.timeZone }}
      />
    </>
  );
}
