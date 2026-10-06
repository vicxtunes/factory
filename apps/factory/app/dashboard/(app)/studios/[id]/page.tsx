import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomersList } from "@repo/ui/customers/CustomersList";
import { QuotaForm } from "@repo/ui/photos/QuotaForm";
import { UsageBar } from "@repo/ui/photos/UsageBar";
import { SectionLabel } from "@repo/ui/SectionLabel";
import { Skeleton } from "@repo/ui/Skeleton";
import { CardGridSkeleton, ChartsSkeleton, ChipRowSkeleton, PanelStackSkeleton, RowsSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { ReviewCard } from "@repo/ui/studio-access/ReviewCard";
import { AccountsOverview } from "@repo/ui/accounting/AccountsOverview";
import { PeriodPicker } from "@repo/ui/accounting/PeriodPicker";
import { InvoicesList } from "@repo/ui/billing/InvoicesList";
import { BookingsList } from "@repo/ui/bookings/BookingBits";
import { ProjectsBoard } from "@repo/ui/projects/ProjectsBoard";
import { LinkedOrdersList } from "@repo/ui/studio-orders/AmingOrders";
import { TasksBoard } from "@repo/ui/tasks/TasksBoard";
import { TeamList } from "@repo/ui/team/TeamList";
import { QuotationsList } from "@repo/ui/billing/QuotationsList";
import { ServicesList } from "@repo/ui/offerings/ServicesList";
import { periodFrom } from "@repo/lib/accounting/params";
import { localDate } from "@repo/lib/accounting/core/period";
import { invoices, quotations, studioAccounts } from "@repo/lib/billing/server";
import { bookings } from "@repo/lib/bookings/server";
import { projects } from "@repo/lib/projects/server";
import { photos } from "@repo/lib/photos/server";
import { studioOrders } from "@repo/lib/studio-orders/server";
import { studioAccess } from "@repo/lib/studio-access/server";
import { portal, studioUrl } from "@repo/lib/studio-portal/server";
import { tasks } from "@repo/lib/tasks/server";
import { team } from "@repo/lib/team/server";
import { CurrencySymbolProvider } from "@repo/lib/currency/CurrencySymbolProvider";
import { customers } from "@repo/lib/customers/server";
import { offerings } from "@repo/lib/offerings/server";
import { studioIdSchema, studioScope } from "@repo/lib/studios/core";
import { requireStudiosOversight, studios } from "@repo/lib/studios/server";
import type { StudioListing } from "@repo/lib/studios/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

export const dynamic = "force-dynamic";

const NO_LINKS = { sales: null, overdue: null, clients: null, client: null };

export default async function StudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireStudiosOversight();
  const id = studioIdSchema.safeParse((await params).id);
  const studio = id.success ? await studios.get(id.data) : null;
  if (!studio) notFound();
  const scope = studioScope(studio);
  const today = localDate(new Date(), scope.timeZone);
  const rows = (n: number) => <RowsSkeleton rows={n} />;
  // Read once, for the tasks and the team.
  const work = { todo: tasks.open(scope), members: team.list(scope) };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/studios" className="text-xs font-medium text-brand-600 hover:underline">
          ← Businesses
        </Link>
        <h2 className="mt-1 text-xl font-semibold">{studio.name}</h2>
      </div>
      <Loading skeleton={<PanelStackSkeleton count={1} />}>
        <About studio={studio} scope={scope} />
      </Loading>
      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
        <SectionLabel>Photo storage</SectionLabel>
        <Loading skeleton={<Skeleton className="h-16 w-full" />}>
          <Storage studio={studio} scope={scope} />
        </Loading>
      </section>
      <section className="space-y-4">
        <SectionLabel>Money</SectionLabel>
        <CurrencySymbolProvider symbol={scope.currency}>
          <Loading
            skeleton={
              <div className="space-y-6">
                <ChipRowSkeleton count={5} />
                <StatTilesSkeleton />
                <ChartsSkeleton />
              </div>
            }
          >
            <Money scope={scope} searchParams={searchParams} />
          </Loading>
        </CurrencySymbolProvider>
      </section>
      <section>
        <SectionLabel>Coming up</SectionLabel>
        <Loading skeleton={rows(3)}>
          <Upcoming scope={scope} today={today} />
        </Loading>
      </section>
      <section>
        <SectionLabel>Orders placed with Aming for its projects</SectionLabel>
        <Loading skeleton={rows(3)}>
          <AmingOrders scope={scope} />
        </Loading>
      </section>
      <section>
        <SectionLabel>Projects</SectionLabel>
        <Loading skeleton={<CardGridSkeleton count={3} />}>
          <Projects scope={scope} />
        </Loading>
      </section>
      <section>
        <SectionLabel>Open tasks</SectionLabel>
        <Loading skeleton={rows(3)}>
          <Tasks scope={scope} today={today} work={work} />
        </Loading>
      </section>
      <section>
        <SectionLabel>Team</SectionLabel>
        <Loading skeleton={rows(3)}>
          <Team work={work} />
        </Loading>
      </section>
      <section>
        <SectionLabel>Clients</SectionLabel>
        <Loading skeleton={rows(4)}>
          <Clients scope={scope} />
        </Loading>
      </section>
      <section>
        <SectionLabel>Packages & Services</SectionLabel>
        <Loading skeleton={rows(3)}>
          <Services scope={scope} />
        </Loading>
      </section>
      <section>
        <SectionLabel>Quotations</SectionLabel>
        <Loading skeleton={rows(3)}>
          <Quotations scope={scope} />
        </Loading>
      </section>
      <section>
        <SectionLabel>Invoices</SectionLabel>
        <Loading skeleton={rows(3)}>
          <Invoices scope={scope} />
        </Loading>
      </section>
    </div>
  );
}

type Of = { scope: TenantScope };
type Work = { todo: ReturnType<typeof tasks.open>; members: ReturnType<typeof team.list> };

// Its review (while it's being set up or reviewed) and its details.
async function About({ studio, scope }: Of & { studio: StudioListing }) {
  const [review, slug] = await Promise.all([studioAccess.reviewOne(studio.id), portal.currentSlug(studio.id)]);
  const details: [string, string | null][] = [
    ["Owner", studio.ownerName],
    ["Phone", studio.phone],
    ["Email", studio.email],
    ["Address", studio.address],
    ["Public page", slug ? studioUrl(slug) : "Not chosen yet"],
  ];
  return (
    <>
      {review ? (
        <ReviewCard
          studio={review}
          publicUrl={slug ? studioUrl(slug) : null}
          dateFormat={new Intl.DateTimeFormat(scope.locale, { timeZone: scope.timeZone, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}
        />
      ) : null}
      <dl className="grid gap-4 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:grid-cols-2 sm:p-5">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-medium text-muted">{label}</dt>
            <dd className="mt-0.5 whitespace-pre-line text-sm">{value || "—"}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

async function Storage({ studio, scope }: Of & { studio: StudioListing }) {
  const usage = await photos.usage(scope);
  return (
    <>
      <UsageBar usage={usage} />
      <QuotaForm studioId={studio.id} quotaGb={Math.round(usage.quotaBytes / 1024 ** 3)} />
    </>
  );
}

async function Money({ scope, searchParams }: Of & { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const money = await studioAccounts.overview(scope, periodFrom(await searchParams));
  return (
    <>
      <PeriodPicker period={money.period} />
      <AccountsOverview view={money} links={NO_LINKS} showHeld={false} />
    </>
  );
}

async function Upcoming({ scope, today }: Of & { today: string }) {
  return <BookingsList bookings={await bookings.upcoming(scope, today, 10)} scope={scope} basePath={null} empty="Nothing booked ahead." />;
}

async function AmingOrders({ scope }: Of) {
  return <LinkedOrdersList orders={await studioOrders.forStudio(scope)} scope={scope} showProject empty="No project orders yet." />;
}

async function Projects({ scope }: Of) {
  return <ProjectsBoard projects={await projects.list(scope)} scope={scope} basePath={null} />;
}

async function Tasks({ scope, today, work }: Of & { today: string; work: Work }) {
  const [todo, members] = await Promise.all([work.todo, work.members]);
  return <TasksBoard tasks={todo} team={members.map((m) => ({ id: m.id, name: m.name }))} today={today} scope={scope} editable={false} projectPath={null} />;
}

async function Team({ work }: { work: Work }) {
  const [members, todo] = await Promise.all([work.members, work.todo]);
  const openTasks: Record<string, number> = {};
  for (const t of todo) if (t.assigneeId) openTasks[t.assigneeId] = (openTasks[t.assigneeId] ?? 0) + 1;
  return <TeamList members={members} openTasks={openTasks} basePath={null} />;
}

async function Clients({ scope }: Of) {
  const [active, archived] = await Promise.all([customers.list(scope), customers.list(scope, true)]);
  return <CustomersList active={active} archived={archived} basePath={null} />;
}

async function Services({ scope }: Of) {
  return <ServicesList categories={await offerings.manage(scope)} scope={scope} />;
}

async function Quotations({ scope }: Of) {
  return <QuotationsList quotations={await quotations.list(scope)} scope={scope} basePath={null} />;
}

async function Invoices({ scope }: Of) {
  return <InvoicesList invoices={await invoices.list(scope)} scope={scope} basePath={null} />;
}
