import Link from "next/link";

import { getDashboardSession, sessionCan } from "@repo/lib/auth/session";
import { MoneyWeOweBoard } from "@repo/ui/production/MoneyWeOweBoard";
import { RowsSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { localDate } from "@repo/lib/accounting/core/period";
import { totalOwedToAgents } from "@repo/lib/agents/server";
import { requireAccountsAccess } from "@repo/lib/accounting/index.server";
import { formatMoney } from "@repo/lib/currency/format";
import { moneyWeOwe } from "@repo/lib/production/server";
import { fetchBaseCurrencySymbol } from "@repo/lib/queries";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

export default async function MoneyWeOwePage() {
  await requireAccountsAccess();
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Money the business borrowed and has to pay back: the owners&apos; own money, suppliers&apos; credit, loans, other projects&apos; money. It isn&apos;t
        income, and paying it back isn&apos;t a cost; only interest is.
      </p>
      <Loading
        skeleton={
          <div className="space-y-4">
            <StatTilesSkeleton count={3} />
            <RowsSkeleton rows={5} />
          </div>
        }
      >
        <Owed />
      </Loading>
    </div>
  );
}

async function Owed() {
  const scope = await resolveTenantScope();
  const today = localDate(new Date(), scope.timeZone);
  const [view, toAgents, symbol] = await Promise.all([moneyWeOwe.overview(scope, today), totalOwedToAgents(), fetchBaseCurrencySymbol()]);
  return (
    <div className="space-y-4">
      <MoneyWeOweBoard accounts={view.accounts} totals={view.totals} open={view.open} today={today} basePath="/dashboard/accounts/owed" canManage={sessionCan(await getDashboardSession(), "accounts", "manage")} />
      {/* Commission earned and not yet withdrawn: owed, but not a loan. */}
      {toAgents > 0 ? (
        <Link href="/dashboard/agents" className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 text-sm shadow-theme-xs hover:bg-background">
          <span className="font-medium">Agents&apos; commission balances</span>
          <span className="font-semibold tnum">{formatMoney(toAgents, symbol)}</span>
        </Link>
      ) : null}
    </div>
  );
}
