import { notFound } from "next/navigation";

import { BackLink } from "@repo/ui/navigation/back";
import { LenderDetailView } from "@repo/ui/production/LenderDetailView";
import { PanelStackSkeleton, TitleRowSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { localDate } from "@repo/lib/accounting/core/period";
import { requireAccountsAccess } from "@repo/lib/accounting/index.server";
import { moneyWeOwe } from "@repo/lib/production/server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

export default async function LenderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAccountsAccess();
  const { id } = await params;
  return (
    <div>
      <BackLink href="/dashboard/accounts/owed" className="text-xs font-medium text-brand-600 hover:underline">
        ← Money we owe
      </BackLink>
      <Loading
        skeleton={
          <div className="mt-1 space-y-6">
            <TitleRowSkeleton />
            <PanelStackSkeleton count={2} />
          </div>
        }
      >
        <Lender id={id} />
      </Loading>
    </div>
  );
}

async function Lender({ id }: { id: string }) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const scope = await resolveTenantScope();
  const today = localDate(new Date(), scope.timeZone);
  const detail = await moneyWeOwe.lender(scope, id, today);
  if (!detail) notFound();
  return (
    <div className="mt-1">
      <LenderDetailView detail={detail} today={today} />
    </div>
  );
}
