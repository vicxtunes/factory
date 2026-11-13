import { MoneyAlerts } from "@repo/ui/accounting/MoneyAlerts";
import { getDashboardSession, sessionCan } from "@repo/lib/auth/session";
import { DayBookBoard } from "@repo/ui/books/DayBookBoard";
import { PanelStackSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { localDate } from "@repo/lib/accounting/core/period";
import { requireAccountsAccess } from "@repo/lib/accounting/index.server";
import { dayBook } from "@repo/lib/books/server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";
import { getMoneyAlerts } from "@repo/lib/wallet/actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AccountsTodayPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAccountsAccess();

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">Every shilling that came in or went out on a day, and what each account should hold.</p>
      <Loading
        skeleton={
          <div className="space-y-4">
            <StatTilesSkeleton count={3} />
            <PanelStackSkeleton count={2} />
          </div>
        }
      >
        <Today searchParams={searchParams} />
      </Loading>
    </div>
  );
}

async function Today({ searchParams }: { searchParams: SearchParams }) {
  const [scope, params] = await Promise.all([resolveTenantScope(), searchParams]);
  const today = localDate(new Date(), scope.timeZone);
  const asked = typeof params.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.day) ? params.day : today;
  // Tomorrow has no book yet.
  const day = asked > today ? today : asked;
  const [book, alerts] = await Promise.all([dayBook(scope, day), getMoneyAlerts()]);
  return (
    <>
      <MoneyAlerts alerts={alerts.ok ? alerts.data ?? [] : []} canManage={sessionCan(await getDashboardSession(), "accounts", "manage")} />
      <DayBookBoard key={day} book={book} timeZone={scope.timeZone} canManage={sessionCan(await getDashboardSession(), "accounts", "manage")} />
    </>
  );
}
