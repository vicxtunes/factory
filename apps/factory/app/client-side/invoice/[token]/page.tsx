import Link from "next/link";
import { notFound } from "next/navigation";

import { InvoiceDocument } from "@repo/ui/invoices/InvoiceDocument";
import { InvoiceDownloadButtons } from "@repo/ui/invoices/InvoiceDownloadButtons";
import { PaymentMethods } from "@repo/ui/payments/PaymentMethods";
import { getInvoiceByToken } from "@repo/lib/invoices/public";
import { SUPPORT_PHONE_DISPLAY } from "@repo/lib/support/constants";

// The client's invoice link (client.<domain>/invoice/<token>). No sign-in:
// holding the link is the permission. Standalone — no portal chrome — so it
// reads (and prints) as a document.

export const dynamic = "force-dynamic";
// Private to whoever holds the link: keep it out of search engines.
export const metadata = { title: "Invoice", robots: { index: false, follow: false } };

export default async function InvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await getInvoiceByToken(token);
  if (!invoice) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10 print:max-w-none print:p-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="text-sm text-muted">Questions? Call or WhatsApp {SUPPORT_PHONE_DISPLAY}.</p>
        <InvoiceDownloadButtons invoice={invoice} />
      </div>
      <InvoiceDocument invoice={invoice} />
      {/* On screen only: the same payment details with copy buttons, for paying from a phone. */}
      {invoice.balance > 0 && !invoice.order.cancelled ? (
        <section className="mt-4 space-y-2 print:hidden">
          <h2 className="text-sm font-semibold">Pay now</h2>
          <PaymentMethods orderNo={invoice.order.orderNo} />
        </section>
      ) : null}
      <p className="mt-4 text-center text-sm text-muted print:hidden">
        Have an account?{" "}
        <Link href="/client-side/orders" className="font-medium text-brand-600 underline">
          Track this order in the client portal
        </Link>
      </p>
    </main>
  );
}
