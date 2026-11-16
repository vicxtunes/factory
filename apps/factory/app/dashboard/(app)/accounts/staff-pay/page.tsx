import { redirect } from "next/navigation";

import { getDashboardSession } from "@repo/lib/auth/session";
import { localDate } from "@repo/lib/accounting/core/period";
import { staffPayBoard } from "@repo/lib/books/staff-pay-server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";
import { StaffPayBoard } from "@repo/ui/books/StaffPayBoard";
import { PanelStackSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";

export const dynamic = "force-dynamic";

// Salaries, allowances and advances (owner, 2026-11-15). The boss only.
export default async function StaffPayPage() {
  const session = await getDashboardSession();
  if (!session) redirect("/dashboard/login");
  if (!session.isBoss) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">Salaries, allowances and advances for everyone Aming pays, all in one place. Each payslip&apos;s pay is a Salaries expense; advances are Salary advances; allowances given on their day are Staff allowances.</p>
      <Loading
        skeleton={
          <div className="space-y-4">
            <StatTilesSkeleton count={4} />
            <PanelStackSkeleton count={2} />
          </div>
        }
      >
        <Board />
      </Loading>
    </div>
  );
}

async function Board() {
  const scope = await resolveTenantScope();
  const board = await staffPayBoard(scope);
  return <StaffPayBoard {...board} today={localDate(new Date(), scope.timeZone)} />;
}
