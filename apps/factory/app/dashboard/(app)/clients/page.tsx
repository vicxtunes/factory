import { redirect } from "next/navigation";

import { SectionLabel } from "@repo/ui/SectionLabel";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { fetchClientOrderCounts, fetchClients } from "@repo/lib/queries";
import { getDashboardSession } from "@repo/lib/auth/session";
import { isManagerRole } from "@repo/lib/types";

import { ClientPanel } from "../../client-panel";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <SectionLabel>Clients</SectionLabel>
      <Loading skeleton={<RowsSkeleton />}>
        <Clients canDelete={session.role === "boss"} />
      </Loading>
    </div>
  );
}

async function Clients({ canDelete }: { canDelete: boolean }) {
  const [clients, orderCounts] = await Promise.all([fetchClients(), fetchClientOrderCounts()]);
  return <ClientPanel clients={clients} orderCounts={orderCounts} canDelete={canDelete} />;
}
