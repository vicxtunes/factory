import { UsageBoard } from "@repo/ui/production/UsageBoard";
import { RowsSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { requireProductionAccess } from "@repo/lib/production/access";
import { costingCatalog } from "@repo/lib/production/catalog";
import { production, usage } from "@repo/lib/production/server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

/** How far back the queue looks. */
const SINCE_DAYS = 30;

export default async function UsagePage() {
  await requireProductionAccess();
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        What each item actually used, against its recipe. Saving takes it off stock; the difference is wastage.
      </p>
      <Loading
        skeleton={
          <div className="space-y-4">
            <StatTilesSkeleton count={3} />
            <RowsSkeleton rows={6} />
          </div>
        }
      >
        <Usage />
      </Loading>
    </div>
  );
}

async function Usage() {
  const scope = await resolveTenantScope();
  const catalog = await costingCatalog();
  const [queue, records, materials] = await Promise.all([usage.queue(scope, catalog, SINCE_DAYS), production.records(scope, 50), production.materials(scope)]);
  return <UsageBoard queue={queue} records={records} materials={materials} sinceDays={SINCE_DAYS} />;
}
