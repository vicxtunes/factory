import { Suspense } from "react";

import { AccountsOverview } from "@repo/ui/accounting/AccountsOverview";
import { PeriodPicker } from "@repo/ui/accounting/PeriodPicker";
import { BookingsList } from "@repo/ui/bookings/BookingBits";
import { ProductRequestsList } from "@repo/ui/product-requests/ProductRequestsList";
import { ProjectsList } from "@repo/ui/projects/ProjectBits";
import { TaskRows } from "@repo/ui/tasks/TaskRows";
import { UsageBar } from "@repo/ui/photos/UsageBar";
import { SectionLabel } from "@repo/ui/SectionLabel";
import { Skeleton } from "@repo/ui/Skeleton";
import { ChartsSkeleton, ChipRowSkeleton, RowsSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { localDate } from "@repo/lib/accounting/core/period";
import { periodFrom } from "@repo/lib/accounting/params";
import { bookings } from "@repo/lib/bookings/server";
import { photos } from "@repo/lib/photos/server";
import { productRequests } from "@repo/lib/product-requests/server";
import { projects } from "@repo/lib/projects/server";
import { tasks } from "@repo/lib/tasks/server";
import { studioAccounts } from "@repo/lib/billing/server";
import { CurrencySymbolProvider } from "@repo/lib/currency/CurrencySymbolProvider";
import { requireStudio } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

export const metadata = { title: "My Business" };

/** Where the studio's figures lead. */
const LINKS = { sales: "/studio/invoices", overdue: "/studio/invoices", clients: "/studio/clients", client: "/studio/clients/" };

// The studio's dashboard: its money at a glance, from its invoices and
// payments (packages/lib/billing → Accounts). The studio is created the first
// time any My Business page opens.
export default async function StudioDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { scope, studio } = await requireStudio();
  const today = localDate(new Date(), scope.timeZone);

  return (
    <>
      <h2 className="text-xl font-semibold">{studio.name}</h2>
      <Suspense fallback={<Skeleton className="h-6 w-full" />}>
        <Usage scope={scope} />
      </Suspense>
      {/* Shown only when there are some, so nothing stands in for it while it loads. */}
      <Suspense fallback={null}>
        <Requests scope={scope} />
      </Suspense>
      <Suspense fallback={null}>
        <OrderRequests scope={scope} />
      </Suspense>
      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <SectionLabel>Coming up</SectionLabel>
          <Loading skeleton={<RowsSkeleton rows={3} />}>
            <Upcoming scope={scope} today={today} />
          </Loading>
        </section>
        <section>
          <SectionLabel>Projects in hand</SectionLabel>
          <Loading skeleton={<RowsSkeleton rows={3} />}>
            <InHand scope={scope} />
          </Loading>
        </section>
      </div>
      <section>
        <SectionLabel>Tasks to do</SectionLabel>
        <Loading skeleton={<RowsSkeleton rows={4} />}>
          <Todo scope={scope} today={today} />
        </Loading>
      </section>
      {/* Amounts in the studio's own currency. */}
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
          <Accounts scope={scope} searchParams={searchParams} />
        </Loading>
      </CurrencySymbolProvider>
    </>
  );
}

async function Usage({ scope }: { scope: TenantScope }) {
  return <UsageBar usage={await photos.usage(scope)} />;
}

// Clients who booked online: first thing the studio sees until it answers.
async function Requests({ scope }: { scope: TenantScope }) {
  const requests = await bookings.requests(scope);
  if (!requests.length) return null;
  return (
    <section>
      <SectionLabel>Booking requests ({requests.length})</SectionLabel>
      <BookingsList bookings={requests} scope={scope} basePath="/studio/bookings" empty="" />
    </section>
  );
}

// Clients who asked for a product online: Confirm makes the invoice.
async function OrderRequests({ scope }: { scope: TenantScope }) {
  const requests = await productRequests.open(scope);
  if (!requests.length) return null;
  return (
    <section>
      <SectionLabel>Order requests ({requests.length})</SectionLabel>
      <ProductRequestsList requests={requests} scope={scope} invoicesPath="/studio/invoices" clientsPath="/studio/clients" />
    </section>
  );
}

async function Upcoming({ scope, today }: { scope: TenantScope; today: string }) {
  return <BookingsList bookings={await bookings.upcoming(scope, today)} scope={scope} basePath="/studio/bookings" empty="Nothing booked ahead." />;
}

async function InHand({ scope }: { scope: TenantScope }) {
  const inHand = await projects.active(scope);
  return <ProjectsList projects={inHand.slice(0, 5)} scope={scope} basePath="/studio/projects" empty="No projects in hand." />;
}

async function Todo({ scope, today }: { scope: TenantScope; today: string }) {
  const todo = await tasks.open(scope);
  return <TaskRows tasks={todo.slice(0, 6)} today={today} scope={scope} editable showProject empty="Nothing to do." />;
}

async function Accounts({ scope, searchParams }: { scope: TenantScope; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const view = await studioAccounts.overview(scope, periodFrom(await searchParams));
  return (
    <div className="space-y-6">
      <PeriodPicker period={view.period} />
      <AccountsOverview view={view} links={LINKS} showHeld={false} />
    </div>
  );
}
