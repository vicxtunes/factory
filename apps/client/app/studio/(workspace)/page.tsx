import { AccountsOverview } from "@repo/ui/accounting/AccountsOverview";
import { PeriodPicker } from "@repo/ui/accounting/PeriodPicker";
import { BookingsList } from "@repo/ui/bookings/BookingBits";
import { ProjectsList } from "@repo/ui/projects/ProjectBits";
import { TaskRows } from "@repo/ui/tasks/TaskRows";
import { UsageBar } from "@repo/ui/photos/UsageBar";
import { SectionLabel } from "@repo/ui/SectionLabel";
import { localDate } from "@repo/lib/accounting/core/period";
import { periodFrom } from "@repo/lib/accounting/params";
import { bookings } from "@repo/lib/bookings/server";
import { photos } from "@repo/lib/photos/server";
import { projects } from "@repo/lib/projects/server";
import { tasks } from "@repo/lib/tasks/server";
import { studioAccounts } from "@repo/lib/billing/server";
import { CurrencySymbolProvider } from "@repo/lib/currency/CurrencySymbolProvider";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "My Studio" };

/** Where the studio's figures lead. */
const LINKS = { sales: "/studio/invoices", overdue: "/studio/invoices", clients: "/studio/clients", client: "/studio/clients/" };

// The studio's dashboard: its money at a glance, from its invoices and
// payments (packages/lib/billing → Accounts). The studio is created the first
// time any My Studio page opens.
export default async function StudioDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { scope, studio } = await requireStudio();
  const today = localDate(new Date(), scope.timeZone);
  const [view, requests, upcoming, inHand, todo, usage] = await Promise.all([
    studioAccounts.overview(scope, periodFrom(await searchParams)),
    bookings.requests(scope),
    bookings.upcoming(scope, today),
    projects.active(scope),
    tasks.open(scope),
    photos.usage(scope),
  ]);

  return (
    <>
      <h2 className="text-xl font-semibold">{studio.name}</h2>
      <UsageBar usage={usage} />
      {requests.length ? (
        // Clients who booked online: first thing the studio sees until it answers.
        <section>
          <SectionLabel>Booking requests ({requests.length})</SectionLabel>
          <BookingsList bookings={requests} scope={scope} basePath="/studio/bookings" empty="" />
        </section>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <SectionLabel>Coming up</SectionLabel>
          <BookingsList bookings={upcoming} scope={scope} basePath="/studio/bookings" empty="Nothing booked ahead." />
        </section>
        <section>
          <SectionLabel>Projects in hand</SectionLabel>
          <ProjectsList projects={inHand.slice(0, 5)} scope={scope} basePath="/studio/projects" empty="No projects in hand." />
        </section>
      </div>
      <section>
        <SectionLabel>Tasks to do</SectionLabel>
        <TaskRows tasks={todo.slice(0, 6)} today={today} scope={scope} editable showProject empty="Nothing to do." />
      </section>
      {/* Amounts in the studio's own currency. */}
      <CurrencySymbolProvider symbol={scope.currency}>
        <div className="space-y-6">
          <PeriodPicker period={view.period} />
          <AccountsOverview view={view} links={LINKS} showHeld={false} />
        </div>
      </CurrencySymbolProvider>
    </>
  );
}
