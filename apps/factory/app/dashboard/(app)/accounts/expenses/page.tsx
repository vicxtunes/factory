import { ExpensesBoard } from "@repo/ui/books/ExpensesBoard";
import { PanelStackSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { resolvePeriod } from "@repo/lib/accounting/core/period";
import { requireAccountsAccess } from "@repo/lib/accounting/index.server";
import { periodFrom } from "@repo/lib/accounting/params";
import { expenseDashboard, expenseMonths, expensesBoard } from "@repo/lib/books/expenses-server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AccountsExpensesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAccountsAccess();

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">Everything the business spends, one-time and recurring. Each payment comes out of an account and shows on Today.</p>
      <Loading
        skeleton={
          <div className="space-y-4">
            <StatTilesSkeleton count={3} />
            <PanelStackSkeleton count={2} />
          </div>
        }
      >
        <Board isBoss={session.role === "boss"} searchParams={searchParams} />
      </Loading>
    </div>
  );
}

async function Board({ isBoss, searchParams }: { isBoss: boolean; searchParams: SearchParams }) {
  const [scope, params] = await Promise.all([resolveTenantScope(), searchParams]);
  const period = resolvePeriod(periodFrom(params), new Date(), scope.timeZone);
  // The board first: it creates what recurring expenses now owe, and the figures must include them.
  const board = await expensesBoard(scope, period);
  const [summary, months] = await Promise.all([expenseDashboard(scope, period), expenseMonths(scope, period)]);
  return <ExpensesBoard {...board} summary={summary} months={months} period={period} isBoss={isBoss} timeZone={scope.timeZone} />;
}
