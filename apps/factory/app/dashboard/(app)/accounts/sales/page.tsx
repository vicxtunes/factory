import { PeriodPicker } from "@repo/ui/accounting/PeriodPicker";
import { SalesTable, type SalesFilter } from "@repo/ui/accounting/SalesTable";
import { ChipRowSkeleton, PanelStackSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { accounting, requireAccountsAccess } from "@repo/lib/accounting/index.server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

import { param, periodFrom } from "@repo/lib/accounting/params";

export const dynamic = "force-dynamic";

const FILTERS: SalesFilter[] = ["all", "unpaid", "partially_paid", "paid", "overdue", "cancelled"];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AccountsSalesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAccountsAccess();

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Every invoiced order. An order counts as a sale on the day its invoice is issued.
      </p>
      <Loading
        skeleton={
          <div className="space-y-4">
            <ChipRowSkeleton count={5} />
            <PanelStackSkeleton count={2} />
          </div>
        }
      >
        <Sales searchParams={searchParams} />
      </Loading>
    </div>
  );
}

async function Sales({ searchParams }: { searchParams: SearchParams }) {
  const [scope, params] = await Promise.all([resolveTenantScope(), searchParams]);
  const view = await accounting.sales(scope, periodFrom(params));
  const status = param(params, "status") as SalesFilter | null;
  return (
    <>
      <PeriodPicker period={view.period} />
      <SalesTable
        // Remount when the period changes so filters start fresh on the new data.
        key={`${view.period.from}-${view.period.to}`}
        lines={view.lines}
        initialFilter={status && FILTERS.includes(status) ? status : "all"}
        exportName="sales"
      />
    </>
  );
}
