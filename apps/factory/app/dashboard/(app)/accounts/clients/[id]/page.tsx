import { BackLink } from "@repo/ui/navigation/back";
import { notFound } from "next/navigation";

import { CustomerAccountDetail } from "@repo/ui/accounting/CustomerAccountDetail";
import { PanelStackSkeleton, TitleRowSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { accounting, requireAccountsAccess } from "@repo/lib/accounting/index.server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

export default async function ClientAccountPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAccountsAccess();
  const { id } = await params;

  return (
    <div>
      <BackLink href="/dashboard/accounts/clients" className="text-xs font-medium text-brand-600 hover:underline">
        ← Client accounts
      </BackLink>
      <Loading
        skeleton={
          <div className="mt-1 space-y-6">
            <TitleRowSkeleton action={false} />
            <PanelStackSkeleton count={2} />
          </div>
        }
      >
        <Account id={id} />
      </Loading>
    </div>
  );
}

async function Account({ id }: { id: string }) {
  const view = await accounting.customerAccount(await resolveTenantScope(), id);
  if (!view) notFound();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="mt-1 text-xl font-semibold">{view.account.name}</h2>
        {view.account.phone ? <p className="text-sm text-muted tnum">{view.account.phone}</p> : null}
      </div>
      <CustomerAccountDetail view={view} />
    </div>
  );
}
