import { SpeedBoard } from "@repo/ui/production/SpeedBoard";
import { ChartsSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { localDate } from "@repo/lib/accounting/core/period";
import { requireProductionAccess } from "@repo/lib/production/access";
import { speed } from "@repo/lib/production/server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The windows offered; anything else falls back to 90 days. */
const WINDOWS = new Set([30, 90, 180]);

export default async function SpeedPage({ searchParams }: { searchParams: SearchParams }) {
  await requireProductionAccess();
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        How long items take from the client&apos;s order to ready for pickup, and where they wait: from each item&apos;s history.
      </p>
      <Loading
        skeleton={
          <div className="space-y-6">
            <StatTilesSkeleton count={4} />
            <ChartsSkeleton />
          </div>
        }
      >
        <Speed searchParams={searchParams} />
      </Loading>
    </div>
  );
}

async function Speed({ searchParams }: { searchParams: SearchParams }) {
  const [scope, params] = await Promise.all([resolveTenantScope(), searchParams]);
  const asked = Number(params.days);
  const view = await speed.view(scope, WINDOWS.has(asked) ? asked : 90);
  return <SpeedBoard view={view} today={localDate(new Date(), scope.timeZone)} basePath="/dashboard/production/speed" />;
}
