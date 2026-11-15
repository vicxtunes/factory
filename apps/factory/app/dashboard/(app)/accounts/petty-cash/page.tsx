import { redirect } from "next/navigation";

import { getDashboardSession } from "@repo/lib/auth/session";
import { localDate } from "@repo/lib/accounting/core/period";
import { hivepayAccountId, pettyCashBoxes, pettyCashLines } from "@repo/lib/books/petty-cash-server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";
import { PettyCashBoard } from "@repo/ui/books/PettyCashBoard";
import { PanelStackSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";

export const dynamic = "force-dynamic";

// The boss sees every box; a Receptionist or Supervisor only their role's box.
export default async function PettyCashPage() {
  const session = await getDashboardSession();
  if (!session) redirect("/dashboard/login");

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">Money for day-to-day payments, kept in HivePay. Use petty cash sends it straight to the person&apos;s phone.</p>
      <Loading
        skeleton={
          <div className="space-y-4">
            <StatTilesSkeleton count={2} />
            <PanelStackSkeleton count={1} />
          </div>
        }
      >
        <Boxes />
      </Loading>
    </div>
  );
}

async function Boxes() {
  const [session, scope] = await Promise.all([getDashboardSession(), resolveTenantScope()]);
  if (!session) redirect("/dashboard/login");
  const boxes = await pettyCashBoxes(scope, session);
  if (boxes.length === 0) redirect("/dashboard");
  const today = localDate(new Date(), scope.timeZone);
  const [lines, hivepayId] = await Promise.all([
    pettyCashLines(scope, boxes.map((b) => b.id), `${today.slice(0, 8)}01`, today),
    session.isBoss ? hivepayAccountId(scope) : Promise.resolve(null),
  ]);
  return <PettyCashBoard boxes={boxes} lines={lines} hivepayId={hivepayId} isBoss={session.isBoss} today={today} timeZone={scope.timeZone} />;
}
