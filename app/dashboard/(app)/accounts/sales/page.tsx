import { PeriodPicker } from "@/components/accounting/PeriodPicker";
import { SalesTable, type SalesFilter } from "@/components/accounting/SalesTable";
import { accounting, requireAccountsAccess } from "@/lib/accounting/index.server";
import { resolveTenantScope } from "@/lib/tenancy/server/resolve";

import { param, periodFrom } from "../params";

export const dynamic = "force-dynamic";

const FILTERS: SalesFilter[] = ["all", "unpaid", "partially_paid", "paid", "overdue", "cancelled"];

export default async function AccountsSalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAccountsAccess();
  const [scope, params] = await Promise.all([resolveTenantScope(), searchParams]);
  const view = await accounting.sales(scope, periodFrom(params));
  const status = param(params, "status") as SalesFilter | null;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Every invoiced order. An order counts as a sale on the day its invoice is issued.
      </p>
      <PeriodPicker period={view.period} />
      <SalesTable
        // Remount when the period changes so filters start fresh on the new data.
        key={`${view.period.from}-${view.period.to}`}
        lines={view.lines}
        initialFilter={status && FILTERS.includes(status) ? status : "all"}
        exportName="sales"
      />
    </div>
  );
}
