import { redirect } from "next/navigation";

import { InvoicesList } from "@/components/invoices/InvoicesList";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { getDashboardSession } from "@/lib/auth/session";
import { listInvoices } from "@/lib/invoices/actions";
import { isManagerRole } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");

  const invoices = await listInvoices();

  return (
    <div className="space-y-6">
      <SectionLabel>Invoices</SectionLabel>
      {invoices.ok ? <InvoicesList invoices={invoices.data} /> : <p className="text-sm text-error-600">{invoices.error}</p>}
    </div>
  );
}
