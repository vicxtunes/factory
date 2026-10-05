import { notFound } from "next/navigation";

import { ReceiptPdf } from "@repo/ui/billing/DocumentPdf";
import { shareTokenSchema } from "@repo/lib/billing/core";
import { invoices } from "@repo/lib/billing/server";

// A payment's receipt link (client.<domain>/r/<token>). No sign-in: holding
// the link is the permission, and it shows only this one receipt, as its PDF. View only.

export const dynamic = "force-dynamic";
// Private to whoever holds the link: keep it out of search engines.
export const metadata = { title: "Receipt", robots: { index: false, follow: false } };

export default async function ReceiptLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const parsed = shareTokenSchema.safeParse((await params).token);
  const found = parsed.success ? await invoices.receiptByLink(parsed.data) : null;
  if (!found) notFound();
  const { currency, locale, timeZone } = found.scope;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
      <ReceiptPdf receipt={found.receipt} issuer={found.issuer} scope={{ currency, locale, timeZone }} />
    </main>
  );
}
