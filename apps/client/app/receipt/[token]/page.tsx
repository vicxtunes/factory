import { notFound } from "next/navigation";

import { ReceiptPdf } from "@repo/ui/invoices/InvoicePdf";
import { getReceiptByToken } from "@repo/lib/invoices/public";

// A payment's receipt link (client.<domain>/receipt/<token>). No sign-in:
// holding the link is the permission, and it shows only this one receipt.

export const dynamic = "force-dynamic";
// Private to whoever holds the link: keep it out of search engines.
export const metadata = { title: "Receipt", robots: { index: false, follow: false } };

export default async function ReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const receipt = await getReceiptByToken((await params).token);
  if (!receipt) notFound();
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
      <ReceiptPdf receipt={receipt} />
    </main>
  );
}
