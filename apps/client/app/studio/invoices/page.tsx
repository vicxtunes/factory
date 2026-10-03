import Link from "next/link";

import { InvoicesList } from "@repo/ui/billing/InvoicesList";
import { invoices } from "@repo/lib/billing/server";
import { requireStudio } from "@repo/lib/studios/server";
import { formatAmount } from "@repo/lib/tenancy/format";

export const metadata = { title: "Invoices — My Studio" };

export default async function StudioInvoicesPage() {
  const { scope } = await requireStudio();
  const list = await invoices.list(scope);
  const owed = list.reduce((sum, i) => sum + i.balance, 0);

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted">
          Clients owe <span className="font-semibold text-foreground tnum">{formatAmount(scope, owed)}</span> across open invoices.
        </p>
        <Link
          href="/studio/invoices/new"
          className="inline-flex min-h-11 shrink-0 items-center rounded-[var(--radius)] bg-brand-500 px-4 text-sm text-white shadow-theme-xs hover:bg-brand-600"
        >
          New invoice
        </Link>
      </div>
      <InvoicesList invoices={list} scope={scope} basePath="/studio/invoices" />
    </>
  );
}
