import { Suspense } from "react";
import Link from "next/link";

import { InvoicesList } from "@repo/ui/billing/InvoicesList";
import { Skeleton } from "@repo/ui/Skeleton";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { invoices } from "@repo/lib/billing/server";
import { requireStudio } from "@repo/lib/studios/server";
import { formatAmount } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

export const metadata = { title: "Invoices · My Business" };

type Invoices = ReturnType<typeof invoices.list>;

export default async function StudioInvoicesPage() {
  const { scope } = await requireStudio("money");
  // Read once, for the total and the list.
  const list = invoices.list(scope);

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <Suspense fallback={<Skeleton className="h-4 w-56" />}>
          <Owed scope={scope} list={list} />
        </Suspense>
        <Link
          href="/studio/invoices/new"
          className="inline-flex min-h-11 shrink-0 items-center rounded-[var(--radius)] bg-brand-500 px-4 text-sm text-white shadow-theme-xs hover:bg-brand-600"
        >
          New invoice
        </Link>
      </div>
      <Loading skeleton={<RowsSkeleton />}>
        <List scope={scope} list={list} />
      </Loading>
    </>
  );
}

async function Owed({ scope, list }: { scope: TenantScope; list: Invoices }) {
  const owed = (await list).reduce((sum, i) => sum + i.balance, 0);
  return (
    <p className="text-sm text-muted">
      Clients owe <span className="font-semibold text-foreground tnum">{formatAmount(scope, owed)}</span> across open invoices.
    </p>
  );
}

async function List({ scope, list }: { scope: TenantScope; list: Invoices }) {
  return <InvoicesList invoices={await list} scope={scope} basePath="/studio/invoices" />;
}
