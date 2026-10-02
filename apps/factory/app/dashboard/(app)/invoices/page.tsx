import { redirect } from "next/navigation";

import { InvoicesList } from "@repo/ui/invoices/InvoicesList";
import { SectionLabel } from "@repo/ui/SectionLabel";
import { getDashboardSession } from "@repo/lib/auth/session";
import { listInvoices } from "@repo/lib/invoices/actions";
import { isManagerRole } from "@repo/lib/types";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");

  const invoices = await listInvoices();

  return (
    <div className="space-y-6">
      <SectionLabel>Invoices</SectionLabel>
      {invoices.ok ? <InvoicesList invoices={invoices.data} canEditSettings={session.role === "boss"} /> : <p className="text-sm text-error-600">{invoices.error}</p>}
    </div>
  );
}
