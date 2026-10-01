import { AccountsOverview } from "@/components/accounting/AccountsOverview";
import { PeriodPicker } from "@/components/accounting/PeriodPicker";
import { accounting, requireAccountsAccess } from "@/lib/accounting/index.server";
import { resolveTenantScope } from "@/lib/tenancy/server/resolve";

import { periodFrom } from "./params";

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
