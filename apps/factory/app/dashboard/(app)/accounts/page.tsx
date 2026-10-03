import { AccountsOverview } from "@repo/ui/accounting/AccountsOverview";
import { PeriodPicker } from "@repo/ui/accounting/PeriodPicker";
import { accounting, requireAccountsAccess } from "@repo/lib/accounting/index.server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

import { periodFrom } from "@repo/lib/accounting/params";

export const dynamic = "force-dynamic";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAccountsAccess();
  const [scope, params] = await Promise.all([resolveTenantScope(), searchParams]);
  const view = await accounting.overview(scope, periodFrom(params));

  return (
    <div className="space-y-6">
      <PeriodPicker period={view.period} />
      <AccountsOverview view={view} />
    </div>
  );
}
