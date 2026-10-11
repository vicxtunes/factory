import { Suspense } from "react";

import { AccountsOverview } from "@repo/ui/accounting/AccountsOverview";
import { PeriodPicker } from "@repo/ui/accounting/PeriodPicker";
import { BookingsList, timeSpan } from "@repo/ui/bookings/BookingBits";
import { EventRail, HomeGreeting, HomeHero, HomeSection, Icon, QuickActions, RoundLink, type QuickAction } from "@repo/ui/home/HomeBits";
import { PackageList } from "@repo/ui/home/PackageList";
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
import { BOOKING_STATUS_LABELS } from "@repo/lib/bookings/core";
import { bookings } from "@repo/lib/bookings/server";
import { offerings } from "@repo/lib/offerings/server";
import { PhotoError } from "@repo/lib/photos/ports";
import { photos } from "@repo/lib/photos/server";
import { portal } from "@repo/lib/studio-portal/server";
import { formatAmount, formatDay } from "@repo/lib/tenancy/format";
import { productRequests } from "@repo/lib/product-requests/server";
import { paidForStudioRequests } from "@repo/lib/wallet/studio";
import { projects } from "@repo/lib/projects/server";
import { tasks } from "@repo/lib/tasks/server";
import { studioAccounts } from "@repo/lib/billing/server";
import { CurrencySymbolProvider } from "@repo/lib/currency/CurrencySymbolProvider";
import { requireStudio } from "@repo/lib/studios/server";
import { canUse, type StudioAccess } from "@repo/lib/team/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

export const metadata = { title: "My Business" };

/** Where the studio's figures lead. */
const LINKS = { sales: "/studio/invoices", overdue: "/studio/invoices", clients: "/studio/clients", client: "/studio/clients/" };

// The studio's home: who's here, the one thing to do next, the usual
// shortcuts, the next events as cards and the packages on sale; then the
// requests waiting, the work in hand and its money (packages/lib/billing →
// Accounts). The studio is created the first time any My Business page opens.
// A team member sees only the parts they were given, and the tasks given to them.
export default async function StudioDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { scope, studio, access, session } = await requireStudio("anyone");
  const today = localDate(new Date(), scope.timeZone);
  const can = (area: Parameters<typeof canUse>[1]) => canUse(access, area);

  return (
    <>
      <HomeGreeting
        name={session.name}
        avatarUrl={session.avatarUrl}
        subtitle={studio.name}
        actions={
          can("bookings") ? (
            <RoundLink href="/studio/bookings" label="Calendar">
              <Icon name="calendar" />
            </RoundLink>
          ) : null
        }
      />
      <Loading skeleton={<Skeleton className="h-40 w-full rounded-3xl" />}>
        <Hero scope={scope} studioId={studio.id} access={access} />
      </Loading>
      <QuickActions actions={quickActions(can)} />
      {can("bookings") ? (
        <HomeSection title="Next events" href="/studio/bookings">
          <Loading skeleton={<Skeleton className="h-64 w-full rounded-3xl" />}>
            <NextEvents scope={scope} today={today} />
          </Loading>
        </HomeSection>
      ) : null}
      {/* Shown only when there are some, so nothing stands in for it while it loads. */}
      <span id="requests" className="-mt-4 block scroll-mt-24" />
      {can("bookings") ? (
        <Suspense fallback={null}>
          <Requests scope={scope} />
        </Suspense>
      ) : null}
      {can("money") ? (
        <Suspense fallback={null}>
          <OrderRequests scope={scope} />
        </Suspense>
      ) : null}
      <HomeSection title="Your packages" href={can("catalog") ? "/studio/offerings" : undefined}>
        <Loading skeleton={<RowsSkeleton rows={3} />}>
          <Packages scope={scope} />
        </Loading>
      </HomeSection>
      {can("projects") ? (
        <section>
          <SectionLabel>Projects in hand</SectionLabel>
          <Loading skeleton={<RowsSkeleton rows={3} />}>
            <InHand scope={scope} />
          </Loading>
        </section>
      ) : null}
      <section>
        <SectionLabel>{can("projects") ? "Tasks to do" : "Your tasks"}</SectionLabel>
        <Loading skeleton={<RowsSkeleton rows={4} />}>
          <Todo scope={scope} today={today} access={access} />
        </Loading>
      </section>
      {access.owner ? (
        <Suspense fallback={<Skeleton className="h-6 w-full" />}>
          <Usage scope={scope} />
        </Suspense>
      ) : null}
      {/* Amounts in the studio's own currency. */}
      {can("money") ? (
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
      ) : null}
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
  const paid = await paidForStudioRequests(requests.map((r) => r.id));
  return (
    <section>
      <SectionLabel>Order requests ({requests.length})</SectionLabel>
      <ProductRequestsList requests={requests} paid={paid} scope={scope} invoicesPath="/studio/invoices" clientsPath="/studio/clients" />
    </section>
  );
}

/** The shortcuts this person can use; Vendors is on its way. */
function quickActions(can: (area: Parameters<typeof canUse>[1]) => boolean): QuickAction[] {
  return [
    ...(can("bookings") ? [{ label: "New booking", icon: "calendar", href: "/studio/bookings/new" } as const] : []),
    ...(can("money") ? [{ label: "New invoice", icon: "invoice", href: "/studio/invoices/new" } as const] : []),
    ...(can("clients") ? [{ label: "Add client", icon: "client", href: "/studio/clients/new" } as const] : []),
    { label: "Vendors", icon: "store", badge: "Soon" },
  ];
}

/** Each service's cover photo (small), by service id. Until photo storage is set up, none. */
async function serviceCovers(scope: TenantScope, serviceIds: string[]): Promise<Map<string, string | null>> {
  const covers = await Promise.all(
    [...new Set(serviceIds)].map(async (id) => {
      try {
        return [id, (await photos.serviceGallery(scope, id))?.coverUrl ?? null] as const;
      } catch (err) {
        if (err instanceof PhotoError) return [id, null] as const;
        throw err;
      }
    }),
  );
  return new Map(covers);
}

// The one thing to do next: answer the clients waiting, else get the page out there.
async function Hero({ scope, studioId, access }: { scope: TenantScope; studioId: string; access: StudioAccess }) {
  const [bookingRequests, orderRequests, slug, onSale] = await Promise.all([
    canUse(access, "bookings") ? bookings.requests(scope) : [],
    canUse(access, "money") ? productRequests.open(scope) : [],
    portal.currentSlug(studioId),
    offerings.onSale(scope, "service"),
  ]);
  const imageUrl = onSale[0] ? (await serviceCovers(scope, [onSale[0].serviceId])).get(onSale[0].serviceId) : null;
  const waiting = bookingRequests.length + orderRequests.length;
  if (waiting > 0) {
    return (
      <HomeHero
        title={`${waiting} client${waiting === 1 ? " is" : "s are"} waiting`}
        text="Answer their booking and order requests: confirming makes the invoice."
        cta={{ label: "Review requests", href: "#requests" }}
        imageUrl={imageUrl}
      />
    );
  }
  return slug ? (
    <HomeHero title="Book, order & pay" text="Share your page: clients book a day, order and pay you there." cta={{ label: "Open my page", href: `/${slug}` }} imageUrl={imageUrl} />
  ) : (
    <HomeHero title="Put your work online" text="Add your services and photos, and get your own page for clients." cta={{ label: "Set up my page", href: "/studio/showroom" }} imageUrl={imageUrl} />
  );
}

// What's coming up, as cards: each with its package's cover photo.
async function NextEvents({ scope, today }: { scope: TenantScope; today: string }) {
  const [upcoming, onSale] = await Promise.all([bookings.upcoming(scope, today, 8), offerings.onSale(scope, "service")]);
  if (!upcoming.length) {
    return <p className="rounded-3xl border border-dashed border-border p-6 text-center text-sm text-muted">Nothing booked ahead.</p>;
  }
  const serviceOf = new Map(onSale.map((o) => [o.id, o.serviceId]));
  const covers = await serviceCovers(scope, upcoming.flatMap((b) => serviceOf.get(b.offeringId ?? "") ?? []));
  return (
    <EventRail
      events={upcoming.map((b) => ({
        id: b.id,
        href: `/studio/bookings/${b.id}`,
        title: b.title,
        when: [formatDay(scope, b.date), timeSpan(b), b.location].filter(Boolean).join(" · "),
        tag: BOOKING_STATUS_LABELS[b.status],
        price: b.amount ? formatAmount(scope, b.amount) : null,
        imageUrl: covers.get(serviceOf.get(b.offeringId ?? "") ?? "") ?? null,
        person: b.customerName,
      }))}
    />
  );
}

// What the studio sells: every package on sale, by service.
async function Packages({ scope }: { scope: TenantScope }) {
  const onSale = await offerings.onSale(scope, "service");
  if (!onSale.length) {
    return <p className="rounded-3xl border border-dashed border-border p-6 text-center text-sm text-muted">No packages yet. Add your services and their packages.</p>;
  }
  const covers = await serviceCovers(scope, onSale.map((o) => o.serviceId));
  return (
    <PackageList
      allLabel="All packages"
      packages={onSale.map((o) => ({
        id: o.id,
        href: "/studio/offerings",
        name: o.name,
        group: o.serviceName,
        price: o.price > 0 ? formatAmount(scope, o.price) : "On request",
        detail: o.inclusions.length ? o.inclusions.join(" · ") : o.description,
        imageUrl: covers.get(o.serviceId) ?? null,
      }))}
    />
  );
}

async function InHand({ scope }: { scope: TenantScope }) {
  const inHand = await projects.active(scope);
  return <ProjectsList projects={inHand.slice(0, 5)} scope={scope} basePath="/studio/projects" empty="No projects in hand." />;
}

// Everyone's, for those who run the projects; else only the caller's own.
async function Todo({ scope, today, access }: { scope: TenantScope; today: string; access: StudioAccess }) {
  if (access.owner || canUse(access, "projects")) {
    const todo = await tasks.open(scope);
    return <TaskRows tasks={todo.slice(0, 6)} today={today} scope={scope} editable showProject empty="Nothing to do." />;
  }
  const mine = await tasks.open(scope, access.memberId);
  return <TaskRows tasks={mine} today={today} scope={scope} editable="status" showProject projectPath={null} empty="Nothing given to you right now." />;
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
