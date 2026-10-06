import Link from "next/link";

import { QuotationsList } from "@repo/ui/billing/QuotationsList";
import { quotations } from "@repo/lib/billing/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Quotations · My Business" };

export default async function StudioQuotationsPage() {
  const { scope } = await requireStudio();
  const list = await quotations.list(scope);

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted">Send a quotation as a link; your client accepts it from their phone.</p>
        <Link
          href="/studio/quotations/new"
          className="inline-flex min-h-11 shrink-0 items-center rounded-[var(--radius)] bg-brand-500 px-4 text-sm text-white shadow-theme-xs hover:bg-brand-600"
        >
          New quotation
        </Link>
      </div>
      <QuotationsList quotations={list} scope={scope} basePath="/studio/quotations" />
    </>
  );
}
