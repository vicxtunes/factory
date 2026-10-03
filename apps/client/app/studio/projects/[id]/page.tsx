import Link from "next/link";
import { notFound } from "next/navigation";

import { InvoiceStatusBadge } from "@repo/ui/billing/StatusBadges";
import { timeSpan } from "@repo/ui/bookings/BookingBits";
import { PipelineSteps, ProjectHistory } from "@repo/ui/projects/ProjectBits";
import { ProjectStatusButtons } from "@repo/ui/projects/ProjectControls";
import { SectionLabel } from "@repo/ui/SectionLabel";
import { invoices } from "@repo/lib/billing/server";
import { bookings } from "@repo/lib/bookings/server";
import { canEditProject, projectIdSchema } from "@repo/lib/projects/core";
import { projects } from "@repo/lib/projects/server";
import { requireStudio } from "@repo/lib/studios/server";
import { formatAmount, formatDay } from "@repo/lib/tenancy/format";

export const metadata = { title: "Project — My Studio" };

export default async function StudioProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { scope } = await requireStudio();
  // Looked up inside the caller's studio only: another studio's id is "not found".
  const id = projectIdSchema.safeParse((await params).id);
  const view = id.success ? await projects.get(scope, id.data) : null;
  if (!view) notFound();
  const p = view.project;
  // Everything behind it: its booking, the quotation it was booked from, and that quotation's invoice.
  const booking = p.bookingId ? (await bookings.get(scope, p.bookingId))?.booking ?? null : null;
  const invoiceId = booking?.quotationId ? await invoices.idForQuotation(scope, booking.quotationId) : null;
  const invoice = invoiceId ? await invoices.get(scope, invoiceId) : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/studio/projects" className="text-xs font-medium text-brand-600 hover:underline">
          ← Projects
        </Link>
        {canEditProject(p.status) ? (
          <Link
            href={`/studio/projects/${p.id}/edit`}
            className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-gray-300 bg-white px-4 text-sm text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            Edit
          </Link>
        ) : null}
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">{p.title}</h2>
        <p className="text-sm text-muted">
          <Link href={`/studio/clients/${p.customerId}`} className="hover:underline">
            {p.customerName}
          </Link>
          {p.eventDate ? ` · ${formatDay(scope, p.eventDate)}` : ""}
        </p>
        <PipelineSteps status={p.status} />
      </div>
      <ProjectStatusButtons projectId={p.id} status={p.status} />

      <section className="grid gap-3 rounded-2xl border border-border bg-surface p-4 text-sm shadow-theme-xs sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-muted">Booking</p>
          {booking ? (
            <Link href={`/studio/bookings/${booking.id}`} className="font-medium text-brand-600 hover:underline">
              {formatDay(scope, booking.date)} · {timeSpan(booking)}
              {booking.location ? ` · ${booking.location}` : ""}
            </Link>
          ) : (
            <p className="text-muted">None</p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-muted">Money</p>
          {invoice ? (
            <p className="flex flex-wrap items-center gap-2">
              <Link href={`/studio/invoices/${invoice.id}`} className="font-medium text-brand-600 hover:underline">
                {invoice.number}
              </Link>
              <span className="tnum">
                {formatAmount(scope, invoice.paid)} paid · {formatAmount(scope, invoice.balance)} left
              </span>
              <InvoiceStatusBadge status={invoice.status} />
            </p>
          ) : (
            <p className="text-muted">No invoice linked</p>
          )}
        </div>
      </section>

      {p.notes ? (
        <section>
          <SectionLabel>Notes</SectionLabel>
          <p className="whitespace-pre-line rounded-2xl border border-border bg-surface p-4 text-sm shadow-theme-xs">{p.notes}</p>
        </section>
      ) : null}
      <section>
        <SectionLabel>History</SectionLabel>
        <ProjectHistory events={view.events} scope={scope} />
      </section>
    </>
  );
}
