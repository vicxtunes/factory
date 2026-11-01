import { notFound } from "next/navigation";

import { BackLink } from "@repo/ui/navigation/back";
import { MaterialDetailView } from "@repo/ui/production/MaterialDetailView";
import { PanelStackSkeleton, TitleRowSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { localDate } from "@repo/lib/accounting/core/period";
import { requireProductionAccess } from "@repo/lib/production/access";
import { production } from "@repo/lib/production/server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

export default async function MaterialPage({ params }: { params: Promise<{ id: string }> }) {
  await requireProductionAccess();
  const { id } = await params;
  return (
    <div>
      <BackLink href="/dashboard/production/materials" className="text-xs font-medium text-brand-600 hover:underline">
        ← Materials
      </BackLink>
      <Loading
        skeleton={
          <div className="mt-1 space-y-6">
            <TitleRowSkeleton />
            <PanelStackSkeleton count={2} />
          </div>
        }
      >
        <Material id={id} />
      </Loading>
    </div>
  );
}

async function Material({ id }: { id: string }) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const scope = await resolveTenantScope();
  const detail = await production.material(scope, id);
  if (!detail) notFound();
  return (
    <div className="mt-1">
      <MaterialDetailView detail={detail} today={localDate(new Date(), scope.timeZone)} />
    </div>
  );
}
