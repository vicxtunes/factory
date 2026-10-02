import { redirect } from "next/navigation";

import { SectionLabel } from "@repo/ui/SectionLabel";
import { fetchClientOrderCounts, fetchClients } from "@repo/lib/queries";
import { getDashboardSession } from "@repo/lib/auth/session";
import { isManagerRole } from "@repo/lib/types";

import { ClientPanel } from "../../client-panel";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");

  const [clients, orderCounts] = await Promise.all([fetchClients(), fetchClientOrderCounts()]);

  return (
    <div className="space-y-6">
      <SectionLabel>Clients</SectionLabel>
      <ClientPanel clients={clients} orderCounts={orderCounts} canDelete={session.role === "boss"} />
    </div>
  );
}
