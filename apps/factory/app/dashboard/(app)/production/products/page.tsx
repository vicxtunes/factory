import { ProductCostsBoard } from "@repo/ui/production/ProductCostsBoard";
import { RowsSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { requireProductionAccess } from "@repo/lib/production/access";
import { costingCatalog } from "@repo/lib/production/catalog";
import { productCosts } from "@repo/lib/production/core";
import { production } from "@repo/lib/production/server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

export default async function ProductCostsPage() {
  await requireProductionAccess();
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        What each product costs to make at today&apos;s material prices, against what it sells for. Give a product a recipe (what one takes) to see it.
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
  const [catalog, recipes, materials] = await Promise.all([costingCatalog(), production.recipes(scope), production.materials(scope)]);
  return <ProductCostsBoard products={productCosts(catalog, recipes, materials)} basePath="/dashboard/production/products" />;
}
