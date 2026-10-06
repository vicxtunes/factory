import { Suspense } from "react";
import Link from "next/link";
import { BackLink } from "@repo/ui/navigation/back";
import { notFound } from "next/navigation";

import { InvoicesList } from "@repo/ui/billing/InvoicesList";
import { BookingsList } from "@repo/ui/bookings/BookingBits";
import { ProjectsList } from "@repo/ui/projects/ProjectBits";
import { QuotationsList } from "@repo/ui/billing/QuotationsList";
import { CustomerArchiveButton, CustomerForm } from "@repo/ui/customers/CustomerForm";
import { SectionLabel } from "@repo/ui/SectionLabel";
import { Skeleton } from "@repo/ui/Skeleton";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { ClientPortalPanel } from "@repo/ui/studio-portal/ClientPortalPanel";
import { portal } from "@repo/lib/studio-portal/server";
import { invoices, quotations } from "@repo/lib/billing/server";
import { bookings } from "@repo/lib/bookings/server";
import { projects } from "@repo/lib/projects/server";
import { customerIdSchema, type Customer } from "@repo/lib/customers/core";
import { customers } from "@repo/lib/customers/server";
import { requireStudio } from "@repo/lib/studios/server";
import { formatAmount, formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

export const metadata = { title: "Client · My Business" };

export default async function StudioClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { scope } = await requireStudio();
  // Looked up inside the caller's studio only: another studio's id is "not found".
  const id = customerIdSchema.safeParse((await params).id);
  const customer = id.success ? await customers.get(scope, id.data) : null;
  if (!customer) notFound();
  // Read once, for what they owe and the list.
  const billed = invoices.list(scope, customer.id);

  return (
    <>
      <div>
        <BackLink href="/studio/clients" className="text-xs font-medium text-brand-600 hover:underline">
          ← Clients
        </BackLink>
        <h2 className="mt-1 text-xl font-semibold">
          {customer.name}
          {customer.archivedAt ? <span className="ml-2 align-middle text-xs font-normal text-muted">(archived)</span> : null}
        </h2>
        <Suspense fallback={null}>
          <Owed scope={scope} billed={billed} />
        </Suspense>
      </div>
      <CustomerForm key={customer.id} customer={customer} basePath="/studio/clients" />
      <Loading skeleton={<Skeleton className="h-24 w-full rounded-2xl" />}>
        <Access scope={scope} customer={customer} />
      </Loading>
      <section>
        <SectionLabel>Projects</SectionLabel>
        <Loading skeleton={<RowsSkeleton rows={2} />}>
          <Projects scope={scope} customer={customer} />
        </Loading>
      </section>
      <section>
        <SectionLabel>Bookings</SectionLabel>
        <Loading skeleton={<RowsSkeleton rows={2} />}>
          <Bookings scope={scope} customer={customer} />
        </Loading>
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
        <Loading skeleton={<RowsSkeleton rows={2} />}>
          <Quotations scope={scope} customer={customer} />
        </Loading>
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
        <Loading skeleton={<RowsSkeleton rows={2} />}>
          <Invoices scope={scope} billed={billed} />
        </Loading>
      </section>
      <CustomerArchiveButton customer={customer} />
    </>
  );
}

type Of = { scope: TenantScope; customer: Customer };
type Billed = { scope: TenantScope; billed: ReturnType<typeof invoices.list> };

async function Owed({ scope, billed }: Billed) {
  const owed = (await billed).reduce((sum, i) => sum + i.balance, 0);
  if (owed <= 0) return null;
  return (
    <p className="text-sm">
      Owes <span className="font-semibold tnum">{formatAmount(scope, owed)}</span>
    </p>
  );
}

async function Access({ scope, customer }: Of) {
  const [access, address] = await Promise.all([portal.status(scope, customer.id), portal.currentSlug(scope.tenantId)]);
  if (!access) return null;
  return (
    <ClientPortalPanel
      customerId={customer.id}
      status={access}
      hasAddress={address !== null}
      lastSignedIn={access.signedInAt ? formatDay(scope, access.signedInAt) : null}
    />
  );
}

async function Projects({ scope, customer }: Of) {
  return <ProjectsList projects={await projects.list(scope, customer.id)} scope={scope} basePath="/studio/projects" />;
}

async function Bookings({ scope, customer }: Of) {
  return <BookingsList bookings={await bookings.forCustomer(scope, customer.id)} scope={scope} basePath="/studio/bookings" />;
}

async function Quotations({ scope, customer }: Of) {
  return <QuotationsList quotations={await quotations.list(scope, customer.id)} scope={scope} basePath="/studio/quotations" showClient={false} />;
}

async function Invoices({ scope, billed }: Billed) {
  return <InvoicesList invoices={await billed} scope={scope} basePath="/studio/invoices" showClient={false} />;
}
