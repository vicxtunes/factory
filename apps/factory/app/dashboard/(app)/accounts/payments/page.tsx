import { MoneyAlerts } from "@repo/ui/accounting/MoneyAlerts";
import { PaymentsTable } from "@repo/ui/accounting/PaymentsTable";
import { PeriodPicker } from "@repo/ui/accounting/PeriodPicker";
import { PanelStackSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { DAY_PERIOD_PRESETS } from "@repo/lib/accounting/core/period";
import { accounting, requireAccountsAccess } from "@repo/lib/accounting/index.server";
import { periodFrom } from "@repo/lib/accounting/params";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";
import { getMoneyAlerts } from "@repo/lib/wallet/actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AccountsPaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAccountsAccess();

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Every payment received: cash, bank, mobile money and wallet top-ups, each counted once, with who recorded it.
      </p>
      <Loading
        skeleton={
          <div className="space-y-4">
            <StatTilesSkeleton count={3} />
            <PanelStackSkeleton count={2} />
          </div>
        }
      >
        <Payments searchParams={searchParams} />
      </Loading>
    </div>
  );
}

async function Payments({ searchParams }: { searchParams: SearchParams }) {
  const [scope, params] = await Promise.all([resolveTenantScope(), searchParams]);
  const input = periodFrom(params);
  // Money is watched day by day: the page opens on today.
  const [view, alerts] = await Promise.all([accounting.payments(scope, { ...input, preset: input.preset ?? "today" }), getMoneyAlerts()]);
  return (
    <>
      <MoneyAlerts alerts={alerts.ok ? alerts.data ?? [] : []} />
      <PeriodPicker period={view.period} presets={DAY_PERIOD_PRESETS} />
      <PaymentsTable
        // Remount when the period changes so the search starts fresh on the new data.
        key={`${view.period.from}-${view.period.to}`}
        lines={view.lines}
        exportName="payments"
      />
    </>
  );
}
