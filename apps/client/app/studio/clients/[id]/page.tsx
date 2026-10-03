import Link from "next/link";
import { notFound } from "next/navigation";

import { InvoicesList } from "@repo/ui/billing/InvoicesList";
import { BookingsList } from "@repo/ui/bookings/BookingBits";
import { QuotationsList } from "@repo/ui/billing/QuotationsList";
import { CustomerArchiveButton, CustomerForm } from "@repo/ui/customers/CustomerForm";
import { SectionLabel } from "@repo/ui/SectionLabel";
import { invoices, quotations } from "@repo/lib/billing/server";
import { bookings } from "@repo/lib/bookings/server";
import { customerIdSchema } from "@repo/lib/customers/core";
import { customers } from "@repo/lib/customers/server";
import { requireStudio } from "@repo/lib/studios/server";
import { formatAmount } from "@repo/lib/tenancy/format";

export const metadata = { title: "Client — My Studio" };

export default async function StudioClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { scope } = await requireStudio();
  // Looked up inside the caller's studio only: another studio's id is "not found".
  const id = customerIdSchema.safeParse((await params).id);
  const customer = id.success ? await customers.get(scope, id.data) : null;
  if (!customer) notFound();
  const [theirs, billed, booked] = await Promise.all([
    quotations.list(scope, customer.id),
    invoices.list(scope, customer.id),
    bookings.forCustomer(scope, customer.id),
  ]);
  const owed = billed.reduce((sum, i) => sum + i.balance, 0);

  return (
    <>
      <div>
        <Link href="/studio/clients" className="text-xs font-medium text-brand-600 hover:underline">
          ← Clients
        </Link>
        <h2 className="mt-1 text-xl font-semibold">
          {customer.name}
          {customer.archivedAt ? <span className="ml-2 align-middle text-xs font-normal text-muted">(archived)</span> : null}
        </h2>
        {owed > 0 ? (
          <p className="text-sm">
            Owes <span className="font-semibold tnum">{formatAmount(scope, owed)}</span>
          </p>
        ) : null}
      </div>
      <CustomerForm key={customer.id} customer={customer} basePath="/studio/clients" />
      <section>
        <SectionLabel>Bookings</SectionLabel>
        <BookingsList bookings={booked} scope={scope} basePath="/studio/bookings" />
      </section>
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <SectionLabel>Quotations</SectionLabel>
          {customer.archivedAt ? null : (
            <Link href={`/studio/quotations/new?client=${customer.id}`} className="text-sm font-medium text-brand-600 hover:underline">
              New quotation
            </Link>
          )}
        </div>
        <QuotationsList quotations={theirs} scope={scope} basePath="/studio/quotations" showClient={false} />
      </section>
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <SectionLabel>Invoices</SectionLabel>
          {customer.archivedAt ? null : (
            <Link href={`/studio/invoices/new?client=${customer.id}`} className="text-sm font-medium text-brand-600 hover:underline">
              New invoice
            </Link>
          )}
        </div>
        <InvoicesList invoices={billed} scope={scope} basePath="/studio/invoices" showClient={false} />
      </section>
      <CustomerArchiveButton customer={customer} />
    </>
  );
}
