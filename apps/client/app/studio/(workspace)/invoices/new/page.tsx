import Link from "next/link";
import { BackLink } from "@repo/ui/navigation/back";

import { FormSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { DocumentEditor, type FromProject } from "@repo/ui/billing/DocumentEditor";
import { customers } from "@repo/lib/customers/server";
import { offerings } from "@repo/lib/offerings/server";
import { projectIdSchema } from "@repo/lib/projects/core";
import { projects } from "@repo/lib/projects/server";
import { requireStudio } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { fromBooking } from "../../../_workspace/from-booking";
import { buttonClass } from "@repo/ui/Button";

export const metadata = { title: "New invoice · My Business" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ client?: string; booking?: string; project?: string }> }) {
  const { scope } = await requireStudio("money");
  const { client, booking, project } = await searchParams;
  const back = booking ? { href: `/studio/bookings/${booking}`, label: "← Booking" } : project ? { href: `/studio/projects/${project}`, label: "← Project" } : { href: "/studio/invoices", label: "← Invoices" };

  return (
    <>
      <BackLink href={back.href} className="text-xs font-medium text-brand-600 hover:underline">
        {back.label}
      </BackLink>
      <Loading skeleton={<FormSkeleton />}>
        <Form scope={scope} client={client} booking={booking} project={project} />
      </Loading>
    </>
  );
}

async function Form({ scope, client, booking, project }: { scope: TenantScope; client?: string; booking?: string; project?: string }) {
  // From a booking ("Create invoice" on it): its client, when and package, already filled in. From a project without one: its client.
  const [clients, onSale, from, forProject] = await Promise.all([
    customers.list(scope),
    offerings.onSale(scope),
    fromBooking(scope, booking, "invoice"),
    fromProject(scope, project),
  ]);
  return clients.length === 0 ? (
    <div className="space-y-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
      <p>Add a client first.</p>
      <Link href="/studio/clients?new" className={buttonClass("primary", "sm")}>
        New client
      </Link>
    </div>
  ) : (
    <DocumentEditor
      kind="invoice"
      customers={clients.map((c) => ({ id: c.id, name: c.name }))}
      offerings={onSale}
      presetCustomerId={clients.some((c) => c.id === client) ? client : undefined}
      fromBooking={from ?? undefined}
      fromProject={forProject ?? undefined}
      scope={scope}
      basePath="/studio/invoices"
    />
  );
}

/** A project that can have its invoice made here: one without a booking or an invoice yet. The server checks the same when it's saved. */
async function fromProject(scope: TenantScope, id: string | undefined): Promise<FromProject | null> {
  const parsed = projectIdSchema.safeParse(id);
  const p = parsed.success ? (await projects.get(scope, parsed.data))?.project : null;
  if (!p || p.bookingId || p.invoiceId) return null;
  return { id: p.id, customerId: p.customerId, title: p.title };
}
