import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomersList } from "@repo/ui/customers/CustomersList";
import { SectionLabel } from "@repo/ui/SectionLabel";
import { AccountsOverview } from "@repo/ui/accounting/AccountsOverview";
import { PeriodPicker } from "@repo/ui/accounting/PeriodPicker";
import { InvoicesList } from "@repo/ui/billing/InvoicesList";
import { BookingsList } from "@repo/ui/bookings/BookingBits";
import { ProjectsBoard } from "@repo/ui/projects/ProjectsBoard";
import { TasksBoard } from "@repo/ui/tasks/TasksBoard";
import { TeamList } from "@repo/ui/team/TeamList";
import { QuotationsList } from "@repo/ui/billing/QuotationsList";
import { OfferingsList } from "@repo/ui/offerings/OfferingsList";
import { periodFrom } from "@repo/lib/accounting/params";
import { localDate } from "@repo/lib/accounting/core/period";
import { invoices, quotations, studioAccounts } from "@repo/lib/billing/server";
import { bookings } from "@repo/lib/bookings/server";
import { projects } from "@repo/lib/projects/server";
import { tasks } from "@repo/lib/tasks/server";
import { team } from "@repo/lib/team/server";
import { CurrencySymbolProvider } from "@repo/lib/currency/CurrencySymbolProvider";
import { customers } from "@repo/lib/customers/server";
import { offerings } from "@repo/lib/offerings/server";
import { studioIdSchema, studioScope } from "@repo/lib/studios/core";
import { requireStudiosOversight, studios } from "@repo/lib/studios/server";

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
  const [active, archived, onSale, offSale, quotes, bills, money, upcoming, work, todo, members] = await Promise.all([
    customers.list(scope),
    customers.list(scope, true),
    offerings.list(scope),
    offerings.list(scope, true),
    quotations.list(scope),
    invoices.list(scope),
    studioAccounts.overview(scope, periodFrom(await searchParams)),
    bookings.upcoming(scope, today, 10),
    projects.list(scope),
    tasks.open(scope),
    team.list(scope),
  ]);
  const openTasks: Record<string, number> = {};
  for (const t of todo) if (t.assigneeId) openTasks[t.assigneeId] = (openTasks[t.assigneeId] ?? 0) + 1;

  const details: [string, string | null][] = [
    ["Owner", studio.ownerName],
    ["Phone", studio.phone],
    ["Email", studio.email],
    ["Address", studio.address],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/studios" className="text-xs font-medium text-brand-600 hover:underline">
          ← Studios
        </Link>
        <h2 className="mt-1 text-xl font-semibold">{studio.name}</h2>
      </div>
      <dl className="grid gap-4 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:grid-cols-2 sm:p-5">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-medium text-muted">{label}</dt>
            <dd className="mt-0.5 whitespace-pre-line text-sm">{value || "—"}</dd>
          </div>
        ))}
      </dl>
      <section className="space-y-4">
        <SectionLabel>Money</SectionLabel>
        <CurrencySymbolProvider symbol={scope.currency}>
          <PeriodPicker period={money.period} />
          <AccountsOverview view={money} links={NO_LINKS} showHeld={false} />
        </CurrencySymbolProvider>
      </section>
      <section>
        <SectionLabel>Coming up</SectionLabel>
        <BookingsList bookings={upcoming} scope={scope} basePath={null} empty="Nothing booked ahead." />
      </section>
      <section>
        <SectionLabel>Projects</SectionLabel>
        <ProjectsBoard projects={work} scope={scope} basePath={null} />
      </section>
      <section>
        <SectionLabel>Open tasks</SectionLabel>
        <TasksBoard tasks={todo} team={members.map((m) => ({ id: m.id, name: m.name }))} today={today} scope={scope} editable={false} projectPath={null} />
      </section>
      <section>
        <SectionLabel>Team</SectionLabel>
        <TeamList members={members} openTasks={openTasks} basePath={null} />
      </section>
      <section>
        <SectionLabel>Clients</SectionLabel>
        <CustomersList active={active} archived={archived} basePath={null} />
      </section>
      <section>
        <SectionLabel>Packages & Services</SectionLabel>
        <OfferingsList active={onSale} archived={offSale} scope={scope} basePath={null} />
      </section>
      <section>
        <SectionLabel>Quotations</SectionLabel>
        <QuotationsList quotations={quotes} scope={scope} basePath={null} />
      </section>
      <section>
        <SectionLabel>Invoices</SectionLabel>
        <InvoicesList invoices={bills} scope={scope} basePath={null} />
      </section>
    </div>
  );
}
