import { notFound } from "next/navigation";

import { BackLink } from "@repo/ui/navigation/back";
import { ProductPerformanceView } from "@repo/ui/production/ProductPerformanceView";
import { ChartsSkeleton, StatTilesSkeleton, TitleRowSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { periodFrom } from "@repo/lib/accounting/params";
import { requireProductionAccess } from "@repo/lib/production/access";
import { costingCatalog } from "@repo/lib/production/catalog";
import { productionOverview } from "@repo/lib/production/server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  await requireProductionAccess();
  const { id } = await params;
  return (
    <div>
      <BackLink href="/dashboard/production/products" className="text-xs font-medium text-brand-600 hover:underline">
        ← Product costs
      </BackLink>
      <Loading
        skeleton={
          <div className="mt-1 space-y-6">
            <TitleRowSkeleton />
            <StatTilesSkeleton count={4} />
            <ChartsSkeleton />
          </div>
        }
      >
        <Performance id={id} searchParams={searchParams} />
      </Loading>
    </div>
  );
}

async function Performance({ id, searchParams }: { id: string; searchParams: SearchParams }) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [scope, query, catalog] = await Promise.all([resolveTenantScope(), searchParams, costingCatalog()]);
  const view = await productionOverview.product(scope, catalog, id, periodFrom(query));
  if (!view) notFound();
  return (
    <div className="mt-1">
      <ProductPerformanceView view={view} setupHref={`/dashboard/production/products/${id}/setup`} />
    </div>
  );
}
