import { ProductCostsBoard } from "@repo/ui/production/ProductCostsBoard";
import { RowsSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { requireProductionAccess } from "@repo/lib/production/access";
import { costingCatalog } from "@repo/lib/production/catalog";
import { Costing, productCosts } from "@repo/lib/production/core";
import { production } from "@repo/lib/production/server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

export default async function ProductCostsPage() {
  const session = await requireProductionAccess();
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        What each product costs to make from its recipe at today&apos;s material costs, against what it sells for. Write a product&apos;s recipe to see it.
      </p>
      <Loading
        skeleton={
          <div className="space-y-4">
            <StatTilesSkeleton count={3} />
            <RowsSkeleton rows={6} />
          </div>
        }
      >
        <Costs setsPrices={session.role === "boss"} />
      </Loading>
    </div>
  );
}

async function Costs({ setsPrices }: { setsPrices: boolean }) {
  const scope = await resolveTenantScope();
  const [catalog, book] = await Promise.all([costingCatalog(), production.costBook(scope)]);
  return <ProductCostsBoard products={productCosts(catalog, new Costing(book))} basePath="/dashboard/production/products" margin={book.margin} setsPrices={setsPrices} />;
}
