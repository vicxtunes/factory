import { notFound } from "next/navigation";

import { QuotationPdf } from "@repo/ui/billing/DocumentPdf";
import { QuotationAnswer } from "@repo/ui/billing/QuotationAnswer";
import { canRespondToQuotation, shareTokenSchema } from "@repo/lib/billing/core";
import { quotations } from "@repo/lib/billing/server";

// A studio's quotation link (client.<domain>/q/<token>), sent to its client.
// No sign-in: holding the link is the permission, and it shows only this one
// quotation, as its PDF. Standalone, without portal chrome.

export const dynamic = "force-dynamic";
// Private to whoever holds the link: keep it out of search engines.
export const metadata = { title: "Quotation", robots: { index: false, follow: false } };

export default async function QuotationLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const parsed = shareTokenSchema.safeParse((await params).token);
  const token = parsed.success ? parsed.data : null;
  const found = token ? await quotations.byLink(token) : null;
  if (!token || !found) notFound();
  const { quotation, issuer } = found;
  const { currency, locale, timeZone } = found.scope;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6 sm:py-10">
      <QuotationPdf quotation={quotation} issuer={issuer} scope={{ currency, locale, timeZone }} />
      {canRespondToQuotation(quotation.status) ? <QuotationAnswer token={token} studioName={issuer.name} /> : null}
      {quotation.status === "declined" ? (
        <p className="text-center text-sm text-muted">
          Declined{quotation.declineReason ? `: ${quotation.declineReason}` : "."}
        </p>
      ) : null}
      {quotation.status === "accepted" ? (
        <p className="text-center text-sm text-muted">Accepted. {issuer.name} will be in touch with the next steps.</p>
      ) : null}
      {quotation.status === "expired" ? (
        <p className="text-center text-sm text-muted">This quotation has expired. Ask {issuer.name} for an updated one.</p>
      ) : null}
    </main>
  );
}
