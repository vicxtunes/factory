import { MoneyWeOweBoard } from "@repo/ui/production/MoneyWeOweBoard";
import { RowsSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { localDate } from "@repo/lib/accounting/core/period";
import { requireAccountsAccess } from "@repo/lib/accounting/index.server";
import { moneyWeOwe } from "@repo/lib/production/server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

export default async function MoneyWeOwePage() {
  await requireAccountsAccess();
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Money the business borrowed and has to pay back: the owners&apos; own money, suppliers&apos; credit, loans, other projects&apos; money. It isn&apos;t
        income, and paying it back isn&apos;t a cost; only interest is.
      </p>
      <Loading
        skeleton={
          <div className="space-y-4">
            <StatTilesSkeleton count={3} />
            <RowsSkeleton rows={5} />
          </div>
        }
      >
        <Owed />
      </Loading>
    </div>
  );
}

async function Owed() {
  const scope = await resolveTenantScope();
  const today = localDate(new Date(), scope.timeZone);
  const view = await moneyWeOwe.overview(scope, today);
  return <MoneyWeOweBoard accounts={view.accounts} totals={view.totals} open={view.open} today={today} basePath="/dashboard/accounts/owed" />;
}
