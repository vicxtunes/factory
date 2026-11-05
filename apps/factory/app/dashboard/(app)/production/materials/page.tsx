import { MaterialsBoard } from "@repo/ui/production/MaterialsBoard";
import { RowsSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { localDate } from "@repo/lib/accounting/core/period";
import { requireProductionAccess } from "@repo/lib/production/access";
import { costingCatalog } from "@repo/lib/production/catalog";
import { PartsCatalog } from "@repo/lib/production/core";
import { production } from "@repo/lib/production/server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

export default async function PartsPage() {
  await requireProductionAccess();
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Everything production buys or makes. A bought part has stock, and each purchase sets its price and counts as money spent. A made part is made of other parts, so its cost follows theirs.
      </p>
      <Loading
        skeleton={
          <div className="space-y-4">
            <StatTilesSkeleton count={3} />
            <RowsSkeleton rows={6} />
          </div>
        }
      >
        <Parts />
      </Loading>
    </div>
  );
}

async function Parts() {
  const scope = await resolveTenantScope();
  const [book, materials, catalog] = await Promise.all([production.partsBook(scope), production.materials(scope), costingCatalog()]);
  const parts = new PartsCatalog(book);
  const products = catalog.flatMap((c) => c.products.map((p) => ({ id: p.id, name: p.name })));
  return (
    <MaterialsBoard
      materials={materials}
      today={localDate(new Date(), scope.timeZone)}
      basePath="/dashboard/production/materials"
      madeCosts={Object.fromEntries(book.parts.filter((p) => p.made).map((p) => [p.id, parts.evaluatePart(p.id, { variantId: null, details: {} }).cost]))}
      productNames={Object.fromEntries(products.map((p) => [p.id, p.name]))}
      products={products}
    />
  );
}
