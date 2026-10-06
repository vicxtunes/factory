import { redirect } from "next/navigation";

import { PanelStackSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { getDashboardSession } from "@repo/lib/auth/session";
import { getSupportReports } from "@repo/lib/support/actions";
import { SUPPORT_OWNER_EMAIL } from "@repo/lib/support/constants";

import { SupportPanel } from "../../support-panel";
import { NotifyPanel } from "../../notify-panel";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const session = await getDashboardSession();
  if (!session || session.email !== SUPPORT_OWNER_EMAIL) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <Loading skeleton={<PanelStackSkeleton count={3} />}>
        <Reports />
      </Loading>
      <NotifyPanel />
    </div>
  );
}

async function Reports() {
  return <SupportPanel reports={await getSupportReports()} />;
}
