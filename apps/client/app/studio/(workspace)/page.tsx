import { Suspense } from "react";

import { timeSpan } from "@repo/ui/bookings/BookingBits";
import { CardRail, HomeGreeting, HomeHero, HomeSection, Icon, QuickActions, RoundLink, type QuickAction } from "@repo/ui/home/HomeBits";
import { PackageList } from "@repo/ui/home/PackageList";
import { ProjectsList } from "@repo/ui/projects/ProjectBits";
import { UsageBar } from "@repo/ui/photos/UsageBar";
import { TodoList } from "@repo/ui/tasks/TodoList";
import { SectionLabel } from "@repo/ui/SectionLabel";
import { Skeleton } from "@repo/ui/Skeleton";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { localDate } from "@repo/lib/accounting/core/period";
import { BOOKING_STATUS_LABELS } from "@repo/lib/bookings/core";
import { bookings } from "@repo/lib/bookings/server";
import { offerings } from "@repo/lib/offerings/server";
import { PhotoError } from "@repo/lib/photos/ports";
import { photos } from "@repo/lib/photos/server";
import { portal } from "@repo/lib/studio-portal/server";
import { formatAmount, formatDay } from "@repo/lib/tenancy/format";
import { productRequests } from "@repo/lib/product-requests/server";
import { projects } from "@repo/lib/projects/server";
import { tasks } from "@repo/lib/tasks/server";
import { requireStudio } from "@repo/lib/studios/server";
import { canUse, type StudioAccess } from "@repo/lib/team/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

export const metadata = { title: "My Business" };

// The studio's home: who's here, the one thing to do next, the usual
// shortcuts, the next events and the packages on sale as cards, then the
// work in hand. Requests are answered where they belong (bookings on
// Bookings, orders on Accounts), and the money is on Wallet and Accounts. The studio is
// created the first time any My Business page opens. A team member sees only
// the parts they were given, and the tasks given to them.
export default async function StudioDashboardPage() {
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
      <HomeSection title="Your packages" href={can("catalog") ? "/studio/offerings" : undefined}>
        <Loading skeleton={<Skeleton className="h-64 w-full rounded-3xl" />}>
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
      <HomeSection title={can("projects") ? "Tasks to do" : "Your tasks"} href="/studio/tasks">
        <Loading skeleton={<RowsSkeleton rows={4} />}>
          <Todo scope={scope} today={today} access={access} />
        </Loading>
      </HomeSection>
      {access.owner ? (
        <Suspense fallback={<Skeleton className="h-6 w-full" />}>
          <Usage scope={scope} />
        </Suspense>
      ) : null}
    </>
  );
}

async function Usage({ scope }: { scope: TenantScope }) {
  return <UsageBar usage={await photos.usage(scope)} />;
}

/** The shortcuts this person can use. */
function quickActions(can: (area: Parameters<typeof canUse>[1]) => boolean): QuickAction[] {
  return [
    ...(can("bookings") ? [{ label: "New booking", icon: "calendar", href: "/studio/bookings?new" } as const] : []),
    ...(can("money") ? [{ label: "New invoice", icon: "invoice", href: "/studio/invoices/new" } as const] : []),
    ...(can("clients") ? [{ label: "Add client", icon: "client", href: "/studio/clients?new" } as const] : []),
    ...(can("projects") ? [{ label: "Vendors", icon: "store", href: "/studio/vendors" } as const] : []),
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
        cta={{ label: "Review requests", href: bookingRequests.length ? "/studio/bookings" : "/studio/accounts" }}
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
    <CardRail
      cards={upcoming.map((b) => ({
        id: b.id,
        href: `/studio/bookings/${b.id}`,
        title: b.title,
        meta: [formatDay(scope, b.date), timeSpan(b), b.location].filter(Boolean).join(" · "),
        metaIcon: "calendar" as const,
        tag: BOOKING_STATUS_LABELS[b.status],
        price: b.amount ? formatAmount(scope, b.amount) : null,
        imageUrl: covers.get(serviceOf.get(b.offeringId ?? "") ?? "") ?? null,
        person: b.customerName,
      }))}
    />
  );
}

// What the studio sells: every package on sale as cards to swipe through, by service.
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
        title: o.name,
        tag: o.serviceName,
        price: o.price > 0 ? formatAmount(scope, o.price) : "On request",
        meta: o.inclusions.length ? o.inclusions.join(" · ") : o.description,
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
  const all = access.owner || canUse(access, "projects");
  const todo = await tasks.open(scope, all || access.owner ? undefined : access.memberId);
  return <TodoList tasks={all ? todo.slice(0, 8) : todo} today={today} projectPath={all ? "/studio/projects" : null} />;
}
