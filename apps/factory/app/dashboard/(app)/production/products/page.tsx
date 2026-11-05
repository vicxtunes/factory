import { ProductCostsBoard } from "@repo/ui/production/ProductCostsBoard";
import { RowsSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { requireProductionAccess } from "@repo/lib/production/access";
import { costingCatalog } from "@repo/lib/production/catalog";
import { PartsCatalog, productCosts } from "@repo/lib/production/core";
import { production } from "@repo/lib/production/server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

export default async function ProductCostsPage() {
  await requireProductionAccess();
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        What each product costs to make at the latest prices paid, against what it sells for. Set a product up (what it&apos;s made of) to see it.
      </p>
      <Loading
        skeleton={
          <div className="space-y-4">
            <StatTilesSkeleton count={3} />
            <RowsSkeleton rows={6} />
          </div>
        }
      >
        <Costs />
      </Loading>
    </div>
  );
}

async function Costs() {
  const scope = await resolveTenantScope();
  const [catalog, book] = await Promise.all([costingCatalog(), production.partsBook(scope)]);
  return <ProductCostsBoard products={productCosts(catalog, new PartsCatalog(book))} basePath="/dashboard/production/products" />;
}
