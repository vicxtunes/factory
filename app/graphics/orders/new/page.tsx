import Link from "next/link";
import { redirect } from "next/navigation";

import { OrderForm } from "@/components/order/OrderForm";
import { Header } from "@/components/ui/Header";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { getDesignerSession } from "@/lib/auth/session";
import { fetchActiveWorkersPublic, fetchAgents, fetchClients, fetchProductCatalog } from "@/lib/queries";

import { checkClientDuplicates, createDesignerOrder } from "../../actions";
import { LogoutButton } from "../../logout-button";

export const metadata = { title: "New order — Graphics" };
export const dynamic = "force-dynamic";

export default async function DesignerNewOrderPage() {
  const session = await getDesignerSession();
  if (!session) redirect("/graphics");

  const [clients, agents, catalog, workers] = await Promise.all([
    fetchClients(true),
    fetchAgents(true),
    fetchProductCatalog(true),
    fetchActiveWorkersPublic(),
  ]);

  return (
    <>
      <Header
        surface="Graphics"
        right={
          <>
            <span className="text-white/80">{session.name}</span>
            <LogoutButton />
          </>
        }
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-3 py-4">
        <div className="mb-4 flex items-center justify-between">
          <SectionLabel>New order</SectionLabel>
          <Link href="/graphics" className="text-xs text-brand-600">
            ← Back to board
          </Link>
        </div>
        <OrderForm
          variant="designer"
          clients={clients}
          agents={agents}
          catalog={catalog}
          workers={workers}
          onCreate={createDesignerOrder}
          onCheckDuplicates={checkClientDuplicates}
        />
      </main>
    </>
  );
}
