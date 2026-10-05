import { notFound } from "next/navigation";

import { InvoicePdf } from "@repo/ui/billing/DocumentPdf";
import { shareTokenSchema } from "@repo/lib/billing/core";
import { invoices } from "@repo/lib/billing/server";

// A studio's invoice link (client.<domain>/i/<token>), sent to its client.
// No sign-in: holding the link is the permission, and it shows only this one
// invoice, with what's been paid and what's left, as its PDF. View only.

export const dynamic = "force-dynamic";
// Private to whoever holds the link: keep it out of search engines.
export const metadata = { title: "Invoice", robots: { index: false, follow: false } };

export default async function InvoiceLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const parsed = shareTokenSchema.safeParse((await params).token);
  const found = parsed.success ? await invoices.byLink(parsed.data) : null;
  if (!found) notFound();
  const { currency, locale, timeZone } = found.scope;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
      <InvoicePdf invoice={found.invoice} issuer={found.issuer} scope={{ currency, locale, timeZone }} />
    </main>
  );
}
