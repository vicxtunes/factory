import { Suspense } from "react";
import Link from "next/link";
import { BackLink } from "@repo/ui/navigation/back";
import { notFound } from "next/navigation";

import { InvoicesList } from "@repo/ui/billing/InvoicesList";
import { BookingsList } from "@repo/ui/bookings/BookingBits";
import { ProjectsList } from "@repo/ui/projects/ProjectBits";
import { QuotationsList } from "@repo/ui/billing/QuotationsList";
import { CustomerArchiveButton, CustomerForm } from "@repo/ui/customers/CustomerForm";
import { DeleteButton } from "@repo/ui/DeleteButton";
import { deleteCustomer } from "@repo/lib/customers/actions";
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
import { buttonClass } from "@repo/ui/Button";
import type { TabItem } from "@repo/ui/Tabs";
import { UrlSheet } from "@repo/ui/UrlSheet";
import { UrlTabs } from "@repo/ui/UrlTabs";

export const metadata = { title: "Client · My Business" };

type ClientTab = "overview" | "projects" | "bookings" | "quotations" | "invoices";

// A client: their name and what they owe, Edit in the sheet (?edit), then
// their parts as tabs, only the open one loaded.
export default async function StudioClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; edit?: string }> }) {
  const { scope } = await requireStudio("clients");
  // Looked up inside the caller's studio only: another studio's id is "not found".
  const id = customerIdSchema.safeParse((await params).id);
  const customer = id.success ? await customers.get(scope, id.data) : null;
  if (!customer) notFound();
  const { tab: asked, edit } = await searchParams;
  // Read once, for what they owe and the list.
  const billed = invoices.list(scope, customer.id);
  const tabs: TabItem<ClientTab>[] = [
    { key: "overview", label: "Overview" },
    { key: "projects", label: "Projects" },
    { key: "bookings", label: "Bookings" },
    { key: "quotations", label: "Quotations" },
    { key: "invoices", label: "Invoices" },
  ];
  const tab = tabs.find((t) => t.key === asked)?.key ?? "overview";
  const creates = !customer.archivedAt;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <BackLink href="/studio/clients" className="text-xs font-medium text-brand-600 hover:underline">
            ← Clients
          </BackLink>
          <h2 className="mt-1 text-xl font-semibold">
            {customer.name}
            {customer.archivedAt ? <span className="ml-2 align-middle text-xs font-normal text-muted">(archived)</span> : null}
          </h2>
          <p className="text-sm text-muted">{[customer.phone, customer.email].filter(Boolean).join(" · ")}</p>
          <Suspense fallback={null}>
            <Owed scope={scope} billed={billed} />
          </Suspense>
        </div>
        <Link href={`/studio/clients/${customer.id}?edit`} scroll={false} className={buttonClass("secondary")}>
          Edit
        </Link>
      </div>

      <UrlTabs tabs={tabs} value={tab} label="Client" />

      {tab === "overview" ? (
        <>
          <Loading skeleton={<Skeleton className="h-24 w-full rounded-2xl" />}>
            <Access scope={scope} customer={customer} />
          </Loading>
          <div className="flex flex-wrap items-start gap-3">
            <CustomerArchiveButton customer={customer} />
            <DeleteButton
              label="Delete client"
              className="min-h-11"
              confirm={`Delete ${customer.name} with all their bookings, projects, quotations, invoices and orders?`}
              action={deleteCustomer.bind(null, customer.id)}
              after="/studio/clients"
            />
          </div>
        </>
      ) : null}
      {tab === "projects" ? (
        <Loading skeleton={<RowsSkeleton rows={2} />}>
          <Projects scope={scope} customer={customer} />
        </Loading>
      ) : null}
      {tab === "bookings" ? (
        <TabList action={creates ? { label: "New booking", href: `/studio/bookings?new&client=${customer.id}` } : null}>
          <Bookings scope={scope} customer={customer} />
        </TabList>
      ) : null}
      {tab === "quotations" ? (
        <TabList action={creates ? { label: "New quotation", href: `/studio/quotations/new?client=${customer.id}` } : null}>
          <Quotations scope={scope} customer={customer} />
        </TabList>
      ) : null}
      {tab === "invoices" ? (
        <TabList action={creates ? { label: "New invoice", href: `/studio/invoices/new?client=${customer.id}` } : null}>
          <Invoices scope={scope} billed={billed} />
        </TabList>
      ) : null}

      {edit !== undefined ? (
        <UrlSheet title="Edit client" closeHref={`/studio/clients/${customer.id}`}>
          <CustomerForm key={customer.id} customer={customer} basePath="/studio/clients" />
        </UrlSheet>
      ) : null}
    </>
  );
}

/** A tab's list with its "New …" button above it. */
function TabList({ action, children }: { action: { label: string; href: string } | null; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      {action ? (
        <div className="flex justify-end">
          <Link href={action.href} className={buttonClass("secondary", "sm")}>
            {action.label}
          </Link>
        </div>
      ) : null}
      <Loading skeleton={<RowsSkeleton rows={2} />}>{children}</Loading>
    </div>
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
