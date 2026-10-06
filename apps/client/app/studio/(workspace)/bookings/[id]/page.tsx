import Link from "next/link";
import { BackLink } from "@repo/ui/navigation/back";
import { notFound } from "next/navigation";

import { BookingStatusBadge, timeSpan } from "@repo/ui/bookings/BookingBits";
import { BookingStatusButtons } from "@repo/ui/bookings/BookingStatusButtons";
import { RequestAnswer } from "@repo/ui/bookings/RequestAnswer";
import { ClientPortalPanel } from "@repo/ui/studio-portal/ClientPortalPanel";
import { StartProjectButton } from "@repo/ui/projects/ProjectControls";
import { InvoiceStatusBadge } from "@repo/ui/billing/StatusBadges";
import { Skeleton } from "@repo/ui/Skeleton";
import { Loading } from "@repo/ui/skeletons/Loading";
import { invoices } from "@repo/lib/billing/server";
import { bookingIdSchema, canEditBooking, type Booking } from "@repo/lib/bookings/core";
import { bookings } from "@repo/lib/bookings/server";
import { projects } from "@repo/lib/projects/server";
import { portal } from "@repo/lib/studio-portal/server";
import { requireStudio } from "@repo/lib/studios/server";
import { formatAmount, formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

export const metadata = { title: "Booking · My Business" };

export default async function StudioBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { scope } = await requireStudio();
  // Looked up inside the caller's studio only: another studio's id is "not found".
  const id = bookingIdSchema.safeParse((await params).id);
  const view = id.success ? await bookings.get(scope, id.data) : null;
  if (!view) notFound();
  const { booking: b, clashes } = view;
  const details: [string, React.ReactNode][] = [
    ["Client", <Link key="c" href={`/studio/clients/${b.customerId}`} className="hover:underline">{b.customerName}</Link>],
    ["When", `${formatDay(scope, b.date)} · ${timeSpan(b)}`],
    ["Location", b.location ?? "—"],
    ["Package", b.packageName ?? "—"],
    ["Amount", b.amount != null ? formatAmount(scope, b.amount) : "—"],
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackLink href={`/studio/bookings?view=day&date=${b.date}`} className="text-xs font-medium text-brand-600 hover:underline">
          ← Bookings
        </BackLink>
        {canEditBooking(b.status) ? (
          <Link
            href={`/studio/bookings/${b.id}/edit`}
            className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-gray-300 bg-white px-4 text-sm text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            Edit
          </Link>
        ) : null}
      </div>
      <div>
        <h2 className="text-xl font-semibold">{b.title}</h2>
        <BookingStatusBadge status={b.status} />
      </div>
      {clashes.length ? (
        <div className="rounded-2xl border border-warning-500/40 bg-warning-50 p-4 text-sm text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
          <p className="font-medium">Overlaps with:</p>
          <ul className="mt-1 list-disc pl-5">
            {clashes.map((c) => (
              <li key={c.id}>
                <Link href={`/studio/bookings/${c.id}`} className="underline">
                  {c.title}
                </Link>{" "}
                ({timeSpan(c)}, {c.customerName})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <dl className="grid gap-4 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:grid-cols-2 sm:p-5">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-medium text-muted">{label}</dt>
            <dd className="mt-0.5 text-sm">{value}</dd>
          </div>
        ))}
        {b.notes ? (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-muted">Notes</dt>
            <dd className="mt-0.5 whitespace-pre-line text-sm">{b.notes}</dd>
          </div>
        ) : null}
      </dl>
      {b.status === "requested" ? <RequestAnswer bookingId={b.id} projectsPath="/studio/projects" /> : null}
      <Loading skeleton={<Skeleton className="h-16 w-full rounded-2xl" />}>
        <Behind scope={scope} booking={b} />
      </Loading>
      {b.status === "requested" ? null : <BookingStatusButtons bookingId={b.id} status={b.status} />}
      {b.source === "online" ? (
        <Loading skeleton={<Skeleton className="h-24 w-full rounded-2xl" />}>
          <Access scope={scope} booking={b} />
        </Loading>
      ) : null}
    </>
  );
}

// The money behind it (the invoice made when its request was confirmed, or from its quotation) and its project.
async function Behind({ scope, booking: b }: { scope: TenantScope; booking: Booking }) {
  const invoiceId = b.invoiceId ?? (b.quotationId ? await invoices.idForQuotation(scope, b.quotationId) : null);
  const [invoice, projectId] = await Promise.all([invoiceId ? invoices.get(scope, invoiceId) : null, projects.idForBooking(scope, b.id)]);
  return (
    <>
      {b.quotationId || invoice ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 text-sm shadow-theme-xs">
          {b.quotationId ? (
            <Link href={`/studio/quotations/${b.quotationId}`} className="font-medium text-brand-600 hover:underline">
              Its quotation
            </Link>
          ) : (
            <span className="font-medium">Its invoice</span>
          )}
          {invoice ? (
            <span className="flex items-center gap-2">
              <Link href={`/studio/invoices/${invoice.id}`} className="font-medium text-brand-600 hover:underline">
                {invoice.number}
              </Link>
              <span className="tnum">
                {formatAmount(scope, invoice.paid)} paid of {formatAmount(scope, invoice.total)}
              </span>
              <InvoiceStatusBadge status={invoice.status} />
            </span>
          ) : (
            <span className="text-muted">No invoice yet</span>
          )}
        </section>
      ) : null}
      {projectId ? (
        <Link href={`/studio/projects/${projectId}`} className="text-sm font-medium text-brand-600 hover:underline">
          View its project
        </Link>
      ) : b.status === "confirmed" || b.status === "completed" ? (
        <StartProjectButton bookingId={b.id} basePath="/studio/projects" />
      ) : null}
    </>
  );
}

// Booked online: the link to their page, for a client the studio already knew who booked from a phone that isn't signed in.
async function Access({ scope, booking: b }: { scope: TenantScope; booking: Booking }) {
  const [access, slug] = await Promise.all([portal.status(scope, b.customerId), portal.currentSlug(scope.tenantId)]);
  return access ? <ClientPortalPanel customerId={b.customerId} status={access} hasAddress={!!slug} lastSignedIn={null} /> : null;
}
