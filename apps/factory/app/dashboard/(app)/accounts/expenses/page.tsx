import { ExpensesBoard } from "@repo/ui/books/ExpensesBoard";
import { PanelStackSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { requireAccountsAccess } from "@repo/lib/accounting/index.server";
import { expensesBoard } from "@repo/lib/books/expenses-server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

export default async function AccountsExpensesPage() {
  const session = await requireAccountsAccess();

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">Everything the business spends: one-time, and what repeats. Each payment comes out of an account and shows on Today.</p>
      <Loading
        skeleton={
          <div className="space-y-4">
            <StatTilesSkeleton count={3} />
            <PanelStackSkeleton count={2} />
          </div>
        }
      >
        <Board isBoss={session.role === "boss"} />
      </Loading>
    </div>
  );
}

async function Board({ isBoss }: { isBoss: boolean }) {
  const scope = await resolveTenantScope();
  const board = await expensesBoard(scope);
  return <ExpensesBoard {...board} isBoss={isBoss} timeZone={scope.timeZone} />;
}
