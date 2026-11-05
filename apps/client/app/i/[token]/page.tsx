import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { DocumentPayBar } from "@repo/ui/billing/DocumentPayBar";
import { InvoicePdf } from "@repo/ui/billing/DocumentPdf";
import { InvoiceStatusBadge } from "@repo/ui/billing/StatusBadges";
import { shareTokenSchema } from "@repo/lib/billing/core";
import { invoices } from "@repo/lib/billing/server";
import { businessTermsAccepted } from "@repo/lib/wallet/studio";

import { BrandStyle } from "../../brand-style";
import { dueOn } from "../../document-due";
import { studioDocumentMetadata, studioDocumentViewport } from "../../studio-document-head";

// A studio's invoice link (client.<domain>/i/<token>), sent to its client.
// No sign-in: holding the link is the permission, and it shows only this one
// invoice, with what's been paid and what's left, as its PDF, and its
// summary pinned underneath with "Pay" (by mobile money) while something's left.

export const dynamic = "force-dynamic";
// Read once per request, for the head and the page.
const load = cache(async (token: string) => {
  const parsed = shareTokenSchema.safeParse(token);
  return parsed.success ? invoices.byLink(parsed.data) : null;
});

type Params = { params: Promise<{ token: string }> };

// The studio's brand in the tab and the share preview, never Aming's (../../studio-document-head.ts).
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const found = await load((await params).token);
  return found ? studioDocumentMetadata(found.scope.tenantId, found.issuer, "Invoice") : { title: { absolute: "Invoice" }, robots: { index: false, follow: false } };
}

export async function generateViewport({ params }: Params): Promise<Viewport> {
  const found = await load((await params).token);
  return found ? studioDocumentViewport(found.issuer) : {};
}

export default async function InvoiceLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const parsed = shareTokenSchema.safeParse((await params).token);
  const found = parsed.success ? await load(parsed.data) : null;
  if (!found) notFound();
  const { currency, locale, timeZone } = found.scope;
  const { invoice } = found;
  const settled = invoice.balance <= 0 || !!invoice.voidedAt;
  // Mobile money in the app, once the studio has agreed to the wallet's terms: else it's paid as the invoice says.
  const payOnline = !settled && (await businessTermsAccepted(found.scope.tenantId));

  return (
    <>
      <BrandStyle color={found.issuer.color} />
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
          payable={payOnline}
          scope={{ currency, locale }}
        />
      </main>
    </>
  );
}
