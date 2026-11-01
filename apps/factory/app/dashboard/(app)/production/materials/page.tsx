import { MaterialsBoard } from "@repo/ui/production/MaterialsBoard";
import { RowsSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { localDate } from "@repo/lib/accounting/core/period";
import { requireProductionAccess } from "@repo/lib/production/access";
import { production } from "@repo/lib/production/server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

export default async function MaterialsPage() {
  await requireProductionAccess();
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        What production uses, how much is in stock and what it&apos;s worth. Each purchase sets the price and counts as money spent.
      </p>
      <Loading
        skeleton={
          <div className="space-y-4">
            <StatTilesSkeleton count={3} />
            <RowsSkeleton rows={6} />
          </div>
        }
      >
        <Materials />
      </Loading>
    </div>
  );
}

async function Materials() {
  const scope = await resolveTenantScope();
  const materials = await production.materials(scope);
  return <MaterialsBoard materials={materials} today={localDate(new Date(), scope.timeZone)} basePath="/dashboard/production/materials" />;
}
