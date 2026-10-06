import Link from "next/link";
import { notFound } from "next/navigation";

import { InvoiceStatusBadge } from "@repo/ui/billing/StatusBadges";
import { timeSpan } from "@repo/ui/bookings/BookingBits";
import { PipelineSteps, ProjectHistory } from "@repo/ui/projects/ProjectBits";
import { ProjectStatusButtons } from "@repo/ui/projects/ProjectControls";
import { ProjectGalleryPanel } from "@repo/ui/photos/ProjectGalleryPanel";
import { SectionLabel } from "@repo/ui/SectionLabel";
import { LinkedOrdersList, OrderFromAming } from "@repo/ui/studio-orders/AmingOrders";
import { AddTaskForm, TaskRows } from "@repo/ui/tasks/TaskRows";
import { localDate } from "@repo/lib/accounting/core/period";
import { invoices } from "@repo/lib/billing/server";
import { bookings } from "@repo/lib/bookings/server";
import { canEditProject, projectIdSchema } from "@repo/lib/projects/core";
import { projects } from "@repo/lib/projects/server";
import { customers } from "@repo/lib/customers/server";
import { photos } from "@repo/lib/photos/server";
import { studioOrders } from "@repo/lib/studio-orders/server";
import { portal, studioUrl } from "@repo/lib/studio-portal/server";
import { requireStudio } from "@repo/lib/studios/server";
import { tasks } from "@repo/lib/tasks/server";
import { team } from "@repo/lib/team/server";
import { formatAmount, formatDay } from "@repo/lib/tenancy/format";

export const metadata = { title: "Project · My Business" };

export default async function StudioProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { scope, studio } = await requireStudio();
  // Looked up inside the caller's studio only: another studio's id is "not found".
  const id = projectIdSchema.safeParse((await params).id);
  const view = id.success ? await projects.get(scope, id.data) : null;
  if (!view) notFound();
  const p = view.project;
  // Everything behind it: its booking, and its invoice (made when an online request was confirmed, or from its quotation).
  const booking = p.bookingId ? (await bookings.get(scope, p.bookingId))?.booking ?? null : null;
  const invoiceId = booking?.invoiceId ?? (booking?.quotationId ? await invoices.idForQuotation(scope, booking.quotationId) : null);
  const invoice = invoiceId ? await invoices.get(scope, invoiceId) : null;
  const [work, members, amingOrders, choices, gallery, usage, slug, client] = await Promise.all([
    tasks.forProject(scope, p.id),
    team.active(scope),
    studioOrders.forProject(scope, p.id),
    studioOrders.choices(scope, studio.ownerClientId),
    photos.delivery(scope, p.id),
    photos.usage(scope),
    portal.currentSlug(scope.tenantId),
    customers.get(scope, p.customerId),
  ]);
  const galleryPhotos = gallery ? await photos.photos(scope, gallery.id) : [];

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

      <section className="space-y-3">
        <SectionLabel>Tasks</SectionLabel>
        <TaskRows tasks={work} today={localDate(new Date(), scope.timeZone)} scope={scope} editable empty="No tasks yet." />
        {canEditProject(p.status) ? <AddTaskForm projectId={p.id} team={members.map((m) => ({ id: m.id, name: m.name }))} /> : null}
      </section>
      <section className="space-y-3">
        <SectionLabel>Client photos</SectionLabel>
        <ProjectGalleryPanel
          projectId={p.id}
          album={gallery}
          photos={galleryPhotos}
          usage={usage}
          shareUrl={gallery?.shareToken && slug ? studioUrl(`${slug}/g/${gallery.shareToken}`) : null}
          clientPhone={client?.phone ?? null}
        />
      </section>
      <section className="space-y-3">
        <SectionLabel>Aming orders</SectionLabel>
        <LinkedOrdersList orders={amingOrders} scope={scope} projectId={p.id} empty="Nothing ordered from Aming for this project yet." />
        <OrderFromAming projectId={p.id} choices={choices} scope={scope} />
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
