import Link from "next/link";

import { QuotationsList } from "@repo/ui/billing/QuotationsList";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { quotations } from "@repo/lib/billing/server";
import { requireStudio } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

export const metadata = { title: "Quotations · My Business" };

export default async function StudioQuotationsPage() {
  const { scope } = await requireStudio();
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
      <Loading skeleton={<RowsSkeleton />}>
        <Quotations scope={scope} />
      </Loading>
    </>
  );
}

async function Quotations({ scope }: { scope: TenantScope }) {
  return <QuotationsList quotations={await quotations.list(scope)} scope={scope} basePath="/studio/quotations" />;
}
