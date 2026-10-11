import { notFound } from "next/navigation";

import { DocumentPayBar } from "@repo/ui/billing/DocumentPayBar";
import { InvoicePdf } from "@repo/ui/billing/DocumentPdf";
import { InvoiceStatusBadge } from "@repo/ui/billing/StatusBadges";
import { shareTokenSchema } from "@repo/lib/billing/core";
import { invoices } from "@repo/lib/billing/server";

import { dueOn } from "../../document-due";

// A studio's invoice link (client.<domain>/i/<token>), sent to its client.
// No sign-in: holding the link is the permission, and it shows only this one
// invoice, with what's been paid and what's left, as its PDF, and its
// summary pinned underneath with "Pay" (by mobile money) while something's left.

export const dynamic = "force-dynamic";
// Private to whoever holds the link: keep it out of search engines.
export const metadata = { title: "Invoice", robots: { index: false, follow: false } };

export default async function InvoiceLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const parsed = shareTokenSchema.safeParse((await params).token);
  const found = parsed.success ? await invoices.byLink(parsed.data) : null;
  if (!found) notFound();
  const { currency, locale, timeZone } = found.scope;
  const { invoice } = found;
  const settled = invoice.balance <= 0 || !!invoice.voidedAt;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
      <InvoicePdf invoice={invoice} issuer={found.issuer} scope={{ currency, locale, timeZone }} />
      <DocumentPayBar
        kind="invoice"
        token={parsed.data!}
        number={invoice.number}
        status={<InvoiceStatusBadge status={invoice.status} />}
        from={found.issuer.name}
        to={invoice.billTo.name}
        amount={settled ? invoice.total : invoice.balance}
        amountLabel={invoice.voidedAt ? "Total" : settled ? "Paid" : invoice.balance < invoice.total ? "Left to pay" : "To pay"}
        due={dueOn(found.scope, "Due", invoice.dueDate, settled)}
        payable={!settled}
        scope={{ currency, locale }}
      />
    </main>
  );
}
