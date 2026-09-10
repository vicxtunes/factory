import { redirect } from "next/navigation";

import { OrderForm } from "@/components/order/OrderForm";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { getDashboardSession } from "@/lib/auth/session";
import {
  fetchActiveWorkersPublic,
  fetchAgents,
  fetchClients,
  fetchDesigners,
  fetchProductCatalog,
} from "@/lib/queries";
import { isManagerRole } from "@/lib/types";

import { createOrder, lookupClientDuplicates } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");

  const [clients, agents, catalog, designers, workers] = await Promise.all([
    fetchClients(true),
    fetchAgents(true),
    fetchProductCatalog(true),
    fetchDesigners(true),
    fetchActiveWorkersPublic(),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <SectionLabel>New order</SectionLabel>
      <OrderForm
        variant="manager"
        clients={clients}
        agents={agents}
        catalog={catalog}
        designers={designers}
        workers={workers}
        onCreate={createOrder}
        onCheckDuplicates={lookupClientDuplicates}
      />
    </div>
  );
}
