import Link from "next/link";
import { notFound } from "next/navigation";

import { QuotationDocument } from "@repo/ui/billing/QuotationDocument";
import { QuotationShare } from "@repo/ui/billing/QuotationShare";
import { canEditQuotation, quotationIdSchema } from "@repo/lib/billing/core";
import { quotations, quotationUrl } from "@repo/lib/billing/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Quotation — My Studio" };

export default async function StudioQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { scope, studio } = await requireStudio();
  // Looked up inside the caller's studio only: another studio's id is "not found".
  const id = quotationIdSchema.safeParse((await params).id);
  const quotation = id.success ? await quotations.get(scope, id.data) : null;
  if (!quotation) notFound();

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
          {/* The client's view is a standalone document: open it to print or save as PDF. */}
          <a
            href={quotationUrl(quotation.shareToken)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-gray-300 bg-white px-4 text-sm text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            Open client view / Print
          </a>
        </div>
      </div>
      <QuotationShare
        quotationId={quotation.id}
        url={quotationUrl(quotation.shareToken)}
        number={quotation.number}
        studioName={studio.name}
        clientPhone={quotation.billTo.phone}
      />
      <QuotationDocument quotation={quotation} issuer={studio} scope={scope} />
    </>
  );
}
