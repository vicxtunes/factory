import { ChartsSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { ProductionOverviewView } from "@repo/ui/production/ProductionOverviewView";
import { periodFrom } from "@repo/lib/accounting/params";
import { requireProductionAccess } from "@repo/lib/production/access";
import { costingCatalog } from "@repo/lib/production/catalog";
import { productionOverview } from "@repo/lib/production/server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ProductionPage({ searchParams }: { searchParams: SearchParams }) {
  await requireProductionAccess();
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        What making what was sold cost, and what it earned: sales as in Accounts, costs from recorded usage, or from product setups where nothing was recorded.
      </p>
      <Loading
        skeleton={
          <div className="space-y-6">
            <StatTilesSkeleton count={4} />
            <ChartsSkeleton />
          </div>
        }
      >
        <Overview searchParams={searchParams} />
      </Loading>
    </div>
  );
}

async function Overview({ searchParams }: { searchParams: SearchParams }) {
  const [scope, params, catalog] = await Promise.all([resolveTenantScope(), searchParams, costingCatalog()]);
  const view = await productionOverview.view(scope, catalog, periodFrom(params));
  return <ProductionOverviewView view={view} productHref="/dashboard/production/products" />;
}
