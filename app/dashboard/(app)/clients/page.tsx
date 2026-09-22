import { redirect } from "next/navigation";

import { SectionLabel } from "@/components/ui/SectionLabel";
import { fetchClientOrderCounts, fetchClients } from "@/lib/queries";
import { getDashboardSession } from "@/lib/auth/session";
import { isManagerRole } from "@/lib/types";

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
