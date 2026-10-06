import { CustomerAccountsTable } from "@repo/ui/accounting/CustomerAccountsTable";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { accounting, requireAccountsAccess } from "@repo/lib/accounting/index.server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

export default async function ClientAccountsPage() {
  await requireAccountsAccess();

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">What each client has been invoiced, has paid and still owes, all time.</p>
      <Loading skeleton={<RowsSkeleton />}>
        <Accounts />
      </Loading>
    </div>
  );
}

async function Accounts() {
  const view = await accounting.customerAccounts(await resolveTenantScope());
  return <CustomerAccountsTable accounts={view.accounts} />;
}
