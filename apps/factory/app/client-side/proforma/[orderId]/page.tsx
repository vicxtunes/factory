import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { InvoiceDocument } from "@repo/ui/invoices/InvoiceDocument";
import { InvoiceDownloadButtons } from "@repo/ui/invoices/InvoiceDownloadButtons";
import { PaymentMethods } from "@repo/ui/payments/PaymentMethods";
import { getProformaForViewer } from "@repo/lib/invoices/public";
import { SUPPORT_PHONE_DISPLAY } from "@repo/lib/support/constants";

// A pro forma invoice: the estimate for an order that hasn't been invoiced
// yet (usually one still waiting to be confirmed), in the same layout as the
// real invoice. Catalog prices for everything except photo books, which are
// priced after the client is called. For the order's own client (or staff);
// once the order is invoiced, this sends them to the real invoice.

export const dynamic = "force-dynamic";
export const metadata = { title: "Pro forma invoice", robots: { index: false, follow: false } };

export default async function ProformaPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const result = await getProformaForViewer(orderId);
  if (!result) notFound();
  if ("invoiceUrl" in result) redirect(result.invoiceUrl);
  const invoice = result.view;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10 print:max-w-none print:p-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/client-side/orders" className="text-sm font-medium text-brand-600 underline">
          ← Back to orders
        </Link>
        <InvoiceDownloadButtons invoice={invoice} />
      </div>
      <InvoiceDocument invoice={invoice} />
      {/* Paying early is fine when the estimate is complete (no photo books waiting for a price). */}
      {invoice.complete && invoice.balance > 0 && !invoice.order.cancelled ? (
        <section className="mt-4 space-y-2 print:hidden">
          <h2 className="text-sm font-semibold">Pay now</h2>
          <PaymentMethods orderNo={invoice.order.orderNo} />
        </section>
      ) : null}
      <p className="mt-4 text-center text-sm text-muted print:hidden">Questions? Call or WhatsApp {SUPPORT_PHONE_DISPLAY}.</p>
    </main>
  );
}
