import { redirect } from "next/navigation";

import { SectionLabel } from "@/components/ui/SectionLabel";
import { getDashboardSession } from "@/lib/auth/session";
import { fetchAgents, fetchClients, fetchDesigners, fetchProductCatalog } from "@/lib/queries";
import { isManagerRole } from "@/lib/types";

import { OrderForm } from "./order-form";

export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");

  const [clients, agents, catalog, designers] = await Promise.all([
    fetchClients(true),
    fetchAgents(true),
    fetchProductCatalog(true),
    fetchDesigners(true),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <SectionLabel>New order</SectionLabel>
      <OrderForm clients={clients} agents={agents} catalog={catalog} designers={designers} />
    </div>
  );
}
