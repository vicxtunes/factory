import { MoneyAlerts } from "@repo/ui/accounting/MoneyAlerts";
import { getDashboardSession, sessionCan } from "@repo/lib/auth/session";
import { MoneyDashboard } from "@repo/ui/money/MoneyDashboard";
import { ChartsSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { localDate } from "@repo/lib/accounting/core/period";
import { accounting, requireAccountsAccess } from "@repo/lib/accounting/index.server";
import { moneyFlow } from "@repo/lib/books/expenses-server";
import { moneyWeOwe } from "@repo/lib/production/server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";
import { getMoneyAlerts } from "@repo/lib/wallet/actions";

import { periodFrom } from "@repo/lib/accounting/params";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AccountsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAccountsAccess();

  return (
    <Loading
      skeleton={
        <div className="space-y-6">
          <StatTilesSkeleton count={3} />
          <ChartsSkeleton />
        </div>
      }
    >
      <Overview searchParams={searchParams} />
    </Loading>
  );
}

async function Overview({ searchParams }: { searchParams: SearchParams }) {
  const [scope, params] = await Promise.all([resolveTenantScope(), searchParams]);
  const [view, alerts, owed] = await Promise.all([
    accounting.dashboard(scope, periodFrom(params)),
    getMoneyAlerts(),
    moneyWeOwe.overview(scope, localDate(new Date(), scope.timeZone)),
  ]);
  const flow = await moneyFlow(view.period);
  return (
    <div className="space-y-6">
      <MoneyAlerts alerts={alerts.ok ? alerts.data ?? [] : []} canManage={sessionCan(await getDashboardSession(), "accounts", "manage")} isBoss={(await getDashboardSession())?.isBoss ?? false} />
      <MoneyDashboard view={view} timeZone={scope.timeZone} weOwe={owed.totals} flow={flow} />
    </div>
  );
}
