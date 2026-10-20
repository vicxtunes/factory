import { Suspense } from "react";
import Link from "next/link";
import { BackLink } from "@repo/ui/navigation/back";
import { notFound } from "next/navigation";
import { after } from "next/server";

import { InvoiceStatusBadge } from "@repo/ui/billing/StatusBadges";
import { timeSpan } from "@repo/ui/bookings/BookingBits";
import { PipelineSteps, ProjectHistory } from "@repo/ui/projects/ProjectBits";
import { ProjectStatusButtons } from "@repo/ui/projects/ProjectControls";
import { DeleteButton } from "@repo/ui/DeleteButton";
import { FolderArt } from "@repo/ui/files/FolderArt";
import { deleteProject } from "@repo/lib/projects/actions";
import { ProjectGalleryPanel } from "@repo/ui/photos/ProjectGalleryPanel";
import { SectionLabel } from "@repo/ui/SectionLabel";
import { Skeleton } from "@repo/ui/Skeleton";
import { PanelStackSkeleton, RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { LinkedOrdersList, OrderFromAming } from "@repo/ui/studio-orders/AmingOrders";
import { AddTaskForm, TaskRows } from "@repo/ui/tasks/TaskRows";
import { ProjectVendors } from "@repo/ui/vendors/ProjectVendors";
import { localDate } from "@repo/lib/accounting/core/period";
import { invoices } from "@repo/lib/billing/server";
import { bookings } from "@repo/lib/bookings/server";
import { projectIdSchema, type Project } from "@repo/lib/projects/core";
import { projects } from "@repo/lib/projects/server";
import { customers } from "@repo/lib/customers/server";
import { files } from "@repo/lib/files/server";
import { photos } from "@repo/lib/photos/server";
import { studioOrders } from "@repo/lib/studio-orders/server";
import { portal, studioUrl } from "@repo/lib/studio-portal/server";
import { requireStudio } from "@repo/lib/studios/server";
import { canUse } from "@repo/lib/team/core";
import { tasks } from "@repo/lib/tasks/server";
import { vendorJobs, vendors } from "@repo/lib/vendors/server";
import { team } from "@repo/lib/team/server";
import { formatAmount, formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

export const metadata = { title: "Project · My Business" };

export default async function StudioProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ hire?: string }> }) {
  const { scope, studio, access } = await requireStudio("projects");
  // Looked up inside the caller's studio only: another studio's id is "not found".
  const id = projectIdSchema.safeParse((await params).id);
  const view = id.success ? await projects.get(scope, id.data) : null;
  if (!view) notFound();
  const p = view.project;
  // From a vendor's page ("Hire on a project"): the hire form opens with them chosen.
  const hire = (await searchParams).hire ?? null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackLink href="/studio/projects" className="text-xs font-medium text-brand-600 hover:underline">
          ← Projects
        </BackLink>
          <Link
            href={`/studio/projects/${p.id}/edit`}
            className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-gray-300 bg-white px-4 text-sm text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            Edit
          </Link>
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
      <div className="flex flex-wrap items-start gap-2">
        <ProjectStatusButtons projectId={p.id} status={p.status} />
        <DeleteButton
          label="Delete project"
          className="min-h-11"
          confirm={`Delete "${p.title}" with its tasks and albums?`}
          action={deleteProject.bind(null, p.id)}
          after="/studio/projects"
        />
      </div>

      <Suspense fallback={<Skeleton className="h-24 w-full rounded-2xl" />}>
        <BookingAndMoney scope={scope} project={p} money={canUse(access, "money")} />
      </Suspense>

      <section className="space-y-3">
        <SectionLabel>Tasks</SectionLabel>
        <Loading skeleton={<RowsSkeleton rows={3} />}>
          <Tasks scope={scope} project={p} />
        </Loading>
      </section>
      <section id="vendors" className="scroll-mt-20 space-y-3">
        <SectionLabel>Vendors</SectionLabel>
        <Loading skeleton={<RowsSkeleton rows={2} />}>
          <Vendors scope={scope} project={p} canPay={canUse(access, "money")} hire={hire} />
        </Loading>
      </section>
      {canUse(access, "files") ? (
        <section className="space-y-3">
          <SectionLabel>Files</SectionLabel>
          <Suspense fallback={<Skeleton className="h-20 w-full rounded-2xl" />}>
            <ProjectFiles scope={scope} project={p} />
          </Suspense>
        </section>
      ) : null}
      <section className="space-y-3">
        <SectionLabel>Client photos</SectionLabel>
        <Loading skeleton={<PanelStackSkeleton count={1} />}>
          <Photos scope={scope} project={p} />
        </Loading>
      </section>
      {/* Placed under the owner's own Aming account: theirs alone. */}
      {access.owner ? (
        <section className="space-y-3">
          <SectionLabel>Aming orders</SectionLabel>
          <Loading skeleton={<RowsSkeleton rows={2} />}>
            <AmingOrders scope={scope} project={p} ownerClientId={studio.ownerClientId} />
          </Loading>
        </section>
      ) : null}
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

// Everything behind it: its booking, and its invoice (made when an online request was confirmed, or from its quotation); the money only for those who handle it.
async function BookingAndMoney({ scope, project: p, money }: { scope: TenantScope; project: Project; money: boolean }) {
  const booking = p.bookingId ? ((await bookings.get(scope, p.bookingId))?.booking ?? null) : null;
  const invoiceId = !money ? null : (booking?.invoiceId ?? (booking?.quotationId ? await invoices.idForQuotation(scope, booking.quotationId) : null));
  const invoice = invoiceId ? await invoices.get(scope, invoiceId) : null;
  return (
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
      {money ? (
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
          ) : booking && (booking.status === "tentative" || booking.status === "confirmed") ? (
            // Made from its booking: client, when and package filled in; saving links it (and confirms the booking).
            <Link href={`/studio/invoices/new?booking=${booking.id}`} className="font-medium text-brand-600 hover:underline">
              Create invoice
            </Link>
          ) : (
            <p className="text-muted">No invoice linked</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

// Tasks for the team or the client; with the project's folders, also choosing photos or giving feedback on them.
async function Tasks({ scope, project: p }: { scope: TenantScope; project: Project }) {
  const [work, members, folderId] = await Promise.all([
    tasks.forProject(scope, p.id),
    team.active(scope),
    files.projectFolder(scope, p.id),
  ]);
  const folders = folderId ? await files.foldersWithin(scope, folderId) : [];
  return (
    <>
      <TaskRows tasks={work} today={localDate(new Date(), scope.timeZone)} scope={scope} editable empty="No tasks yet." />
      <AddTaskForm projectId={p.id} team={members.map((m) => ({ id: m.id, name: m.name }))} client={{ id: p.customerId, name: p.customerName }} folders={folders} />
    </>
  );
}

// Its folder in Files (Projects → its title), made with the project.
// Vendors hired on the project (packages/lib/vendors → jobs), and the project's
// folders one can be given. Delivered work left unanswered is settled here too.
async function Vendors({ scope, project: p, canPay, hire }: { scope: TenantScope; project: Project; canPay: boolean; hire: string | null }) {
  after(() => vendorJobs.sweepOverdue());
  const [found, projectFolder, hiring] = await Promise.all([
    vendorJobs.forProject(scope.tenantId, p.id),
    files.projectFolder(scope, p.id),
    hire ? vendors.hireable(hire) : null,
  ]);
  const [jobs, folders] = await Promise.all([
    Promise.all(
      found.map(async (j) => ({
        id: j.id,
        vendorId: j.vendorId,
        vendorName: j.vendor.name,
        vendorCategory: j.vendor.category,
        photoUrl: await vendors.pictureUrl(j.vendor.photoKey),
        brief: j.brief,
        samplesWanted: j.samplesWanted,
        dueOn: j.dueOn,
        price: j.price,
        status: j.status,
        folderId: j.folderId,
        deliveredAt: j.deliveredAt,
        disputeReason: j.disputeReason,
      })),
    ),
    projectFolder ? files.foldersWithin(scope, projectFolder) : [],
  ]);
  const hireCard = hiring
    ? { id: hiring.id, name: hiring.name, category: hiring.category, location: hiring.location, skills: hiring.skills, offers: hiring.offers, photoUrl: await vendors.pictureUrl(hiring.photoKey) }
    : null;
  return <ProjectVendors projectId={p.id} jobs={jobs} folders={folders} canPay={canPay} hire={hireCard} />;
}

async function ProjectFiles({ scope, project: p }: { scope: TenantScope; project: Project }) {
  const folderId = await files.projectFolder(scope, p.id);
  if (!folderId) return <p className="text-sm text-muted">This project has no folder.</p>;
  return (
    <Link
      href={`/studio/files?folder=${folderId}`}
      className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs transition hover:border-brand-500/40 hover:shadow-md"
    >
      <FolderArt className="h-10 w-12 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">Project files</span>
        <span className="block text-xs text-muted">Contracts, raw footage, edits: anything for this project, in Files → Projects.</span>
      </span>
      <span className="text-sm font-medium text-brand-600">Open</span>
    </Link>
  );
}

async function Photos({ scope, project: p }: { scope: TenantScope; project: Project }) {
  const [gallery, usage, slug, client] = await Promise.all([
    photos.delivery(scope, p.id),
    photos.usage(scope),
    portal.currentSlug(scope.tenantId),
    customers.get(scope, p.customerId),
  ]);
  const galleryPhotos = gallery ? await photos.photos(scope, gallery.id) : [];
  return (
    <ProjectGalleryPanel
      projectId={p.id}
      album={gallery}
      photos={galleryPhotos}
      usage={usage}
      shareUrl={gallery?.shareToken && slug ? studioUrl(`${slug}/g/${gallery.shareToken}`) : null}
      clientPhone={client?.phone ?? null}
    />
  );
}

async function AmingOrders({ scope, project: p, ownerClientId }: { scope: TenantScope; project: Project; ownerClientId: string }) {
  const [amingOrders, choices] = await Promise.all([studioOrders.forProject(scope, p.id), studioOrders.choices(scope, ownerClientId)]);
  return (
    <>
      <LinkedOrdersList orders={amingOrders} scope={scope} projectId={p.id} empty="Nothing ordered from Aming for this project yet." />
      <OrderFromAming projectId={p.id} choices={choices} scope={scope} />
    </>
  );
}
