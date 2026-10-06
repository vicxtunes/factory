import { redirect } from "next/navigation";

import { InvoicesList } from "@repo/ui/invoices/InvoicesList";
import { SectionLabel } from "@repo/ui/SectionLabel";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { getDashboardSession } from "@repo/lib/auth/session";
import { listInvoices } from "@repo/lib/invoices/actions";
import { isManagerRole } from "@repo/lib/types";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <SectionLabel>Invoices</SectionLabel>
      <Loading skeleton={<RowsSkeleton />}>
        <Invoices canEditSettings={session.role === "boss"} />
      </Loading>
    </div>
  );
}

async function Invoices({ canEditSettings }: { canEditSettings: boolean }) {
  const invoices = await listInvoices();
  return invoices.ok ? <InvoicesList invoices={invoices.data} canEditSettings={canEditSettings} /> : <p className="text-sm text-error-600">{invoices.error}</p>;
}
