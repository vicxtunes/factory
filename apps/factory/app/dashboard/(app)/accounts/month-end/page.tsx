import { getDashboardSession, sessionCan } from "@repo/lib/auth/session";
import { requireAccountsAccess } from "@repo/lib/accounting/index.server";
import { monthCheck, monthCheckList } from "@repo/lib/books/month-check-server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";
import { MonthCheckBoard } from "@repo/ui/books/MonthCheckBoard";
import { PanelStackSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function MonthEndPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAccountsAccess();

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">At the end of every month: what each account really holds against what the books say, any differences explained and approved by the boss.</p>
      <Loading
        skeleton={
          <div className="space-y-4">
            <StatTilesSkeleton count={4} />
            <PanelStackSkeleton count={1} />
          </div>
        }
      >
        <MonthEnd searchParams={searchParams} />
      </Loading>
    </div>
  );
}

async function MonthEnd({ searchParams }: { searchParams: SearchParams }) {
  const [scope, params, session] = await Promise.all([resolveTenantScope(), searchParams, getDashboardSession()]);
  const months = await monthCheckList(scope);
  const asked = typeof params.month === "string" ? months.find((m) => m.month === params.month)?.month : undefined;
  // Opens on the newest month still to finish, else the newest open one, else this month.
  const month = asked ?? months.find((m) => m.open && m.status !== "approved")?.month ?? months.find((m) => m.open)?.month ?? months[0]!.month;
  const check = await monthCheck(scope, month);
  return <MonthCheckBoard key={month} check={check} months={months} canManage={sessionCan(session, "accounts", "manage")} isBoss={session?.isBoss ?? false} timeZone={scope.timeZone} />;
}
