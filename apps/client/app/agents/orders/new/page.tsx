import Link from "next/link";
import { redirect } from "next/navigation";

import { placeAgentOrder } from "@repo/lib/agents/actions";
import { agentClient, agentClients } from "@repo/lib/agents/server";
import { fetchCurrencies, fetchProductCatalog } from "@repo/lib/queries";

import { OrderForm } from "../../../order-form";
import { requireAgent } from "../../agent";
import { AddClientButton } from "../../clients/client-sheet";
import { AgentFrame } from "../../frame";

export const metadata = { title: "New order" };

// Two steps: which client, then the normal order form for them.
export default async function AgentNewOrderPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { agent } = await requireAgent();
  if (!agent.active) redirect("/agents/orders");
  const { client: clientId } = await searchParams;

  if (clientId) {
    const client = await agentClient(agent.id, clientId).catch(() => null);
    if (client?.status === "active") {
      const [catalog, currencies] = await Promise.all([fetchProductCatalog(true), fetchCurrencies()]);
      return (
        <AgentFrame agent={agent} page="orders">
          <OrderForm catalog={catalog} showPrices currencies={currencies} agent={{ clientName: client.name, place: placeAgentOrder.bind(null, client.clientId) }} />
        </AgentFrame>
      );
    }
  }

  const clients = (await agentClients(agent.id)).filter((c) => c.status === "active");
  return (
    <AgentFrame agent={agent} page="orders">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Who is this order for?</h1>
          <AddClientButton />
        </div>
        {clients.length ? (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {clients.map((c) => (
              <li key={c.id}>
                <Link href={`/agents/orders/new?client=${c.clientId}`} className="block rounded-2xl border border-border bg-surface p-4 shadow-theme-xs hover:bg-background">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className="block truncate text-sm text-muted">{c.phone ?? c.email}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">Register your first client to place an order.</p>
        )}
      </div>
    </AgentFrame>
  );
}
