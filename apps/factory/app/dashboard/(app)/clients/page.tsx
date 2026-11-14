import { SectionLabel } from "@repo/ui/SectionLabel";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { fetchClientOrderCounts, fetchClients } from "@repo/lib/queries";
import { pageAccess, sessionCan } from "@repo/lib/auth/session";

import { ClientPanel } from "../../client-panel";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const session = await pageAccess("clients");

  return (
    <div className="space-y-6">
      <SectionLabel>Clients</SectionLabel>
      <Loading skeleton={<RowsSkeleton />}>
        <Clients canManage={sessionCan(session, "clients", "manage")} canDelete={sessionCan(session, "order_admin", "manage")} />
      </Loading>
    </div>
  );
}

async function Clients({ canManage, canDelete }: { canManage: boolean; canDelete: boolean }) {
  const [clients, orderCounts] = await Promise.all([fetchClients(), fetchClientOrderCounts()]);
  return <ClientPanel clients={clients} orderCounts={orderCounts} canManage={canManage} canDelete={canDelete} />;
}
