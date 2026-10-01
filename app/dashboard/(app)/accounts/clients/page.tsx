import { CustomerAccountsTable } from "@/components/accounting/CustomerAccountsTable";
import { accounting, requireAccountsAccess } from "@/lib/accounting/index.server";
import { resolveTenantScope } from "@/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

export default async function ClientAccountsPage() {
  await requireAccountsAccess();
  const view = await accounting.customerAccounts(await resolveTenantScope());

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">What each client has been invoiced, has paid and still owes, all time.</p>
      <CustomerAccountsTable accounts={view.accounts} />
    </div>
  );
}
