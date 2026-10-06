import { AccountsOverview } from "@repo/ui/accounting/AccountsOverview";
import { PeriodPicker } from "@repo/ui/accounting/PeriodPicker";
import { ChartsSkeleton, ChipRowSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { accounting, requireAccountsAccess } from "@repo/lib/accounting/index.server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

import { periodFrom } from "@repo/lib/accounting/params";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AccountsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAccountsAccess();

  return (
    <Loading
      skeleton={
        <div className="space-y-6">
          <ChipRowSkeleton count={5} />
          <StatTilesSkeleton count={6} />
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
  const view = await accounting.overview(scope, periodFrom(params));
  return (
    <div className="space-y-6">
      <PeriodPicker period={view.period} />
      <AccountsOverview view={view} />
    </div>
  );
}
