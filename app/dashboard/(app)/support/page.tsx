import { redirect } from "next/navigation";

import { getDashboardSession } from "@/lib/auth/session";
import { getSupportReports } from "@/lib/support/actions";
import { SUPPORT_OWNER_EMAIL } from "@/lib/support/constants";

import { SupportPanel } from "../../support-panel";
import { NotifyPanel } from "../../notify-panel";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const session = await getDashboardSession();
  if (!session || session.email !== SUPPORT_OWNER_EMAIL) redirect("/dashboard");

  const reports = await getSupportReports();

  return (
    <div className="space-y-6">
      <SupportPanel reports={reports} />
      <NotifyPanel />
    </div>
  );
}
