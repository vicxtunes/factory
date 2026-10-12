import Link from "next/link";
import { notFound } from "next/navigation";

import { OwingBanner } from "@repo/ui/invoices/OwingBanner";
import { InvoicePdf } from "@repo/ui/invoices/InvoicePdf";
import { InvoiceLinkPayBar } from "@repo/ui/invoices/InvoiceLinkPayBar";
import { getMyOwing } from "@repo/lib/invoices/actions";
import { getInvoiceByToken } from "@repo/lib/invoices/public";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";
import { SUPPORT_PHONE_DISPLAY } from "@repo/lib/support/constants";

import { dueOn } from "../../document-due";

// The client's invoice link (client.<domain>/invoice/<token>). No sign-in:
// holding the link is the permission, to see it and to pay it. Standalone —
// no portal chrome. The invoice shows as its PDF, page by page, exactly as it
// downloads and prints, with its summary and "Pay" pinned underneath.

export const dynamic = "force-dynamic";
// Private to whoever holds the link: keep it out of search engines.
export const metadata = { title: "Invoice", robots: { index: false, follow: false } };

export default async function InvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await getInvoiceByToken(token);
  if (!invoice) notFound();
  // Signed in and owing on more than this invoice: say so (this one is paid right here).
  const [owing, scope] = await Promise.all([getMyOwing().catch(() => null), resolveTenantScope()]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10 print:max-w-none print:p-0">
      <p className="mb-3 text-sm text-muted print:hidden">Questions? Call or WhatsApp {SUPPORT_PHONE_DISPLAY}.</p>
      {owing && owing.owed > invoice.balance ? (
        <div className="mb-3">
          <OwingBanner owing={owing} />
        </div>
      ) : null}
      <InvoicePdf invoice={invoice} />
      <p className="mt-4 text-center text-sm text-muted print:hidden">
        Have an account?{" "}
        <Link href="/orders" className="font-medium text-brand-600 underline">
          Track this order in the client portal
        </Link>
      </p>
      <InvoiceLinkPayBar
        token={token}
        invoice={invoice}
        due={dueOn(scope, "Due", invoice.dueDate, invoice.balance <= 0 || invoice.order.cancelled)}
        scope={{ currency: scope.currency, locale: scope.locale }}
      />
    </main>
  );
}
