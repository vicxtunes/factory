import { redirect } from "next/navigation";

import { SectionLabel } from "@/components/ui/SectionLabel";
import { fetchClients } from "@/lib/queries";
import { getDashboardSession } from "@/lib/auth/session";

import { ClientPanel } from "../../client-panel";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const session = await getDashboardSession();
  if (session?.role !== "supervisor") redirect("/dashboard");

  const clients = await fetchClients();

  return (
    <div className="space-y-6">
      <SectionLabel>Clients</SectionLabel>
      <ClientPanel clients={clients} />
    </div>
  );
}
