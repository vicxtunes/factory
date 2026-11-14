import { redirect } from "next/navigation";

import { getDashboardSession } from "@repo/lib/auth/session";
import { localDate } from "@repo/lib/accounting/core/period";
import { pettyCashBoxes, pettyCashLines, spendCategories, topUpSources } from "@repo/lib/books/petty-cash-server";
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
      <p className="text-sm text-muted">Cash for day-to-day payments. Record each payment from the box as you make it.</p>
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
  const [lines, categories, sources] = await Promise.all([
    pettyCashLines(scope, boxes.map((b) => b.id), `${today.slice(0, 8)}01`, today),
    spendCategories(scope),
    session.isBoss ? topUpSources(scope) : Promise.resolve([]),
  ]);
  return <PettyCashBoard boxes={boxes} lines={lines} categories={categories} sources={sources} isBoss={session.isBoss} today={today} timeZone={scope.timeZone} />;
}
