import { BooksBoard } from "@repo/ui/business-books/BooksBoard";
import { PeriodPicker } from "@repo/ui/accounting/PeriodPicker";
import { RowsSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { addDays, localDate, PERIOD_PRESETS, resolvePeriod } from "@repo/lib/accounting/core";
import { periodFrom } from "@repo/lib/accounting/params";
import { AMING_CARD, SYSTEM, UNASSIGNED, balances, notes, totals } from "@repo/lib/business-books/core";
import { bookAccounts, bookChanges, bookEntries, bookLines, employees, heldBySystem, projectChoices } from "@repo/lib/business-books/server";
import { canUse } from "@repo/lib/team/core";
import { requireStudio, type CallerStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Books · My Business" };

type Params = Record<string, string | string[] | undefined>;

// The business's books (packages/lib/business-books): it records money in and
// money out; everything the system already knows comes in by itself, and the
// balances, profit and notes follow. No closing, no accounting words.
export default async function BooksPage({ searchParams }: { searchParams: Promise<Params> }) {
  const caller = await requireStudio("money");
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Record money in and money out. Payments on your invoices, System payments and your Aming card come in by themselves.</p>
      <Loading
        skeleton={
          <div className="space-y-6">
            <StatTilesSkeleton />
            <RowsSkeleton />
          </div>
        }
      >
        <Books caller={caller} searchParams={searchParams} />
      </Loading>
    </div>
  );
}

async function Books({ caller, searchParams }: { caller: CallerStudio; searchParams: Promise<Params> }) {
  const { scope, studio, access } = caller;
  const period = resolvePeriod(periodFrom(await searchParams), new Date(), scope.timeZone);
  const today = localDate(new Date(), scope.timeZone);
  const [accounts, lines, held, changes, people, projects] = await Promise.all([
    bookAccounts(scope),
    bookLines(scope),
    heldBySystem(scope, studio.ownerClientId),
    bookChanges(scope),
    employees(scope),
    projectChoices(scope),
  ]);

  const from = period.fromDate ?? "0000-01-01";
  const to = period.toDate ?? today;
  const shown = lines.filter((l) => l.occurredOn >= from && l.occurredOn <= to);
  const now = totals(lines, from, to);
  // The period before, as long, for the notes ("transport cost 40% more").
  const days = period.fromDate ? Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1 : 0;
  const before = days ? totals(lines, addDays(from, -days), addDays(from, -1)) : null;

  const held2 = balances(accounts, lines, { system: held.system, amingCard: held.amingCard });
  const named = [
    ...accounts.map((a) => ({ key: a.id, name: a.name, own: true })),
    { key: SYSTEM, name: "System payments", own: false },
    { key: AMING_CARD, name: "Aming card", own: false },
    ...(held2.has(UNASSIGNED) ? [{ key: UNASSIGNED, name: "Not in an account yet", own: false }] : []),
  ].map((a) => ({ ...a, balance: held2.get(a.key) ?? 0 }));

  // From 5 pm, a day with nothing recorded by hand gets a reminder.
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: scope.timeZone }).format(new Date()));
  const nudge = hour >= 17 && !lines.some((l) => l.source === "manual" && l.occurredOn === today) ? "Nothing recorded today. Any money in or out? It takes a few seconds." : null;

  // Hand entries shown, as recorded: what Edit opens with.
  const entries = await bookEntries(scope, shown.filter((l) => l.source === "manual").map((l) => l.sourceId));

  return (
    <div className="space-y-4">
      <PeriodPicker period={period} presets={[{ value: "today", label: "Today" }, { value: "this_week", label: "This week" }, ...PERIOD_PRESETS]} />
      <BooksBoard
        currency={scope.currency}
        locale={scope.locale}
        today={today}
        accounts={accounts}
        balances={named}
        lines={shown}
        totals={now}
        notes={before ? notes(now, before) : []}
        changes={Object.fromEntries(changes)}
        entries={entries}
        employees={people.filter((p) => !p.leftOn).map((p) => ({ id: p.id, name: p.name }))}
        projects={projects}
        periodLabel={periodLabel(period.preset, from, to)}
        canEdit={canUse(access, "money", "manage")}
        nudge={nudge}
      />
    </div>
  );
}

function periodLabel(preset: string, from: string, to: string): string {
  const named = [{ value: "today", label: "Today" }, { value: "this_week", label: "This week" }, ...PERIOD_PRESETS].find((p) => p.value === preset);
  return named?.label ?? `${from} to ${to}`;
}
