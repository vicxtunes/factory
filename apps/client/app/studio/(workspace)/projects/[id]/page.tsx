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
import { vendorJobs } from "@repo/lib/vendors/server";
import { team } from "@repo/lib/team/server";
import { formatAmount, formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";
import { buttonClass } from "@repo/ui/Button";
import { SheetButton } from "@repo/ui/SheetButton";
import type { TabItem } from "@repo/ui/Tabs";
import { UrlTabs } from "@repo/ui/UrlTabs";

import { hireCard, jobRows } from "../../../_workspace/vendor-jobs";
import { EditProjectSheet } from "../sheets";

export const metadata = { title: "Project · My Business" };

type ProjectTab = "overview" | "tasks" | "vendors" | "files" | "orders" | "history";

export default async function StudioProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ hire?: string; service?: string; edit?: string; tab?: string }> }) {
  const { scope, studio, access } = await requireStudio("projects");
  // Looked up inside the caller's studio only: another studio's id is "not found".
  const id = projectIdSchema.safeParse((await params).id);
  const view = id.success ? await projects.get(scope, id.data) : null;
  if (!view) notFound();
  const p = view.project;
  // From a vendor's page ("Hire on a project", or "Hire this service"): the hire form opens with them, and that service, chosen.
  const { hire = null, service = null, edit, tab: asked } = await searchParams;
  // Its parts as tabs, only the open one loaded; Aming orders are the owner's alone (placed under their own account).
  const tabs: TabItem<ProjectTab>[] = [
    { key: "overview", label: "Overview" },
    { key: "tasks", label: "Tasks" },
    { key: "vendors", label: "Vendors" },
    { key: "files", label: "Files & photos" },
    ...(access.owner ? [{ key: "orders" as const, label: "Aming orders" }] : []),
    { key: "history", label: "History" },
  ];
  // Coming to hire a vendor: their tab.
  const tab = hire ? "vendors" : (tabs.find((t) => t.key === asked)?.key ?? "overview");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackLink href="/studio/projects" className="text-xs font-medium text-brand-600 hover:underline">
          ← Projects
        </BackLink>
          <Link href={`/studio/projects/${p.id}?edit`} scroll={false} className={buttonClass("secondary")}>
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

      <UrlTabs tabs={tabs} value={tab} label="Project" />

      {tab === "overview" ? (
        <>
          <Suspense fallback={<Skeleton className="h-24 w-full rounded-2xl" />}>
            <BookingAndMoney scope={scope} project={p} money={canUse(access, "money")} />
          </Suspense>
          {p.notes ? (
            <section>
              <SectionLabel>Notes</SectionLabel>
              <p className="whitespace-pre-line rounded-2xl border border-border bg-surface p-4 text-sm shadow-theme-xs">{p.notes}</p>
            </section>
          ) : null}
        </>
      ) : null}
      {tab === "tasks" ? (
        <Loading skeleton={<RowsSkeleton rows={3} />}>
          <Tasks scope={scope} project={p} />
        </Loading>
      ) : null}
      {tab === "vendors" ? (
        <Loading skeleton={<RowsSkeleton rows={2} />}>
          <Vendors scope={scope} project={p} canPay={canUse(access, "money")} hire={hire} service={service} />
        </Loading>
      ) : null}
      {tab === "files" ? (
        <>
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
        </>
      ) : null}
      {tab === "orders" ? (
        <Loading skeleton={<RowsSkeleton rows={2} />}>
          <AmingOrders scope={scope} project={p} ownerClientId={studio.ownerClientId} />
        </Loading>
      ) : null}
      {tab === "history" ? <ProjectHistory events={view.events} scope={scope} /> : null}
      {edit !== undefined ? <EditProjectSheet scope={scope} project={p} /> : null}
    </>
  );
}

// Everything behind it: its booking, and its invoice (its booking's: made when an online request was confirmed, or from its quotation;
// or, without a booking, made from the project itself); the money only for those who handle it.
async function BookingAndMoney({ scope, project: p, money }: { scope: TenantScope; project: Project; money: boolean }) {
  const booking = p.bookingId ? ((await bookings.get(scope, p.bookingId))?.booking ?? null) : null;
  const invoiceId = !money
    ? null
    : (p.invoiceId ?? booking?.invoiceId ?? (booking?.quotationId ? await invoices.idForQuotation(scope, booking.quotationId) : null));
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
            <Link href={`/studio/invoices/new?booking=${booking.id}`} className={buttonClass("secondary", "sm")}>
              Create invoice
            </Link>
          ) : !p.bookingId ? (
            // A project of its own: the invoice is made from it, for its client.
            <Link href={`/studio/invoices/new?project=${p.id}`} className={buttonClass("secondary", "sm")}>
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
      <SheetButton label="Add a task" title="Add a task">
        <AddTaskForm projectId={p.id} team={members.map((m) => ({ id: m.id, name: m.name }))} client={{ id: p.customerId, name: p.customerName }} folders={folders} />
      </SheetButton>
    </>
  );
}

// Its folder in Files (Projects → its title), made with the project.
// Vendors hired on the project (packages/lib/vendors → jobs), and the project's
// folders one can be given. Delivered work left unanswered is settled here too.
async function Vendors({ scope, project: p, canPay, hire, service }: { scope: TenantScope; project: Project; canPay: boolean; hire: string | null; service: string | null }) {
  after(() => vendorJobs.sweepOverdue());
  const [found, projectFolder, hiring] = await Promise.all([vendorJobs.forProject(scope.tenantId, p.id), files.projectFolder(scope, p.id), hireCard(hire)]);
  const [jobs, folders] = await Promise.all([jobRows(found), projectFolder ? files.foldersWithin(scope, projectFolder) : []]);
  return (
    <ProjectVendors projectId={p.id} jobs={jobs} folders={folders} canPay={canPay} hire={hiring} hireService={service} returnTo={`/studio/projects/${p.id}?tab=vendors`} />
  );
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
      <SheetButton label="Order from Aming" title="Order from Aming">
        <OrderFromAming projectId={p.id} choices={choices} scope={scope} />
      </SheetButton>
    </>
  );
}
