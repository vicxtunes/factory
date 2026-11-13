import { MaterialsBoard } from "@repo/ui/production/MaterialsBoard";
import { sessionCan } from "@repo/lib/auth/session";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { requireProductionAccess } from "@repo/lib/production/access";
import { costingCatalog } from "@repo/lib/production/catalog";
import { orderSizes, toPlainCostBook } from "@repo/lib/production/core";
import { production } from "@repo/lib/production/server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

export default async function MaterialsPage() {
  const session = await requireProductionAccess();
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        What products are made of. A material costs one amount, an amount for each size, or is built from other materials, so its cost follows theirs.
      </p>
      <Loading skeleton={<RowsSkeleton rows={6} />}>
        <Materials setsPrices={sessionCan(session, "catalog", "manage")} canEdit={sessionCan(session, "production", "manage")} />
      </Loading>
    </div>
  );
}

async function Materials({ setsPrices, canEdit }: { setsPrices: boolean; canEdit: boolean }) {
  const [book, catalog] = await Promise.all([production.costBook(await resolveTenantScope()), costingCatalog()]);
  return <MaterialsBoard book={toPlainCostBook(book)} sizes={orderSizes(catalog)} setsPrices={setsPrices} canEdit={canEdit} />;
}
