import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerAccountDetail } from "@repo/ui/accounting/CustomerAccountDetail";
import { accounting, requireAccountsAccess } from "@repo/lib/accounting/index.server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

export default async function ClientAccountPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAccountsAccess();
  const [scope, { id }] = await Promise.all([resolveTenantScope(), params]);
  const view = await accounting.customerAccount(scope, id);
  if (!view) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/accounts/clients" className="text-xs font-medium text-brand-600 hover:underline">
          ← Client accounts
        </Link>
        <h2 className="mt-1 text-xl font-semibold">{view.account.name}</h2>
        {view.account.phone ? <p className="text-sm text-muted tnum">{view.account.phone}</p> : null}
      </div>
      <CustomerAccountDetail view={view} />
    </div>
  );
}
