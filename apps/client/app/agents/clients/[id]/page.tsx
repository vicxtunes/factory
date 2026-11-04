import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { agentClient, agentOrders } from "@repo/lib/agents/server";

import { requireAgent } from "../../agent";
import { OrderGrid } from "../../bits";
import { AgentFrame } from "../../frame";
import { EditClientButton } from "../client-sheet";

export const metadata = { title: "Client" };

// One of the agent's clients: contact details, and the orders this agent placed for them.
export default async function AgentClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { agent } = await requireAgent();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const client = await agentClient(agent.id, id);
  if (client?.status !== "active") notFound();
  const orders = await agentOrders(agent.id, id);

  return (
    <AgentFrame agent={agent} page="clients">
      <div className="space-y-5">
        <Link href="/agents/clients" className="text-sm font-medium text-brand-600 hover:underline">
          ← Clients
        </Link>
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:flex-row sm:items-start sm:justify-between sm:p-5">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">{client.name}</h1>
            <p className="truncate text-sm text-muted">{client.phone ?? "No phone"}</p>
            {client.email ? <p className="truncate text-sm text-muted">{client.email}</p> : null}
            {client.locked ? <p className="mt-2 text-xs text-muted">This client has their own login, so only they or Aming can change these details.</p> : null}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {client.locked ? null : <EditClientButton clientId={client.clientId} contact={{ name: client.name, phone: client.phone ?? "", email: client.email ?? "" }} />}
            {agent.active ? (
              <Link href={`/agents/orders/new?client=${client.clientId}`} className="inline-flex min-h-10 items-center rounded-[var(--radius)] bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
                New order
              </Link>
            ) : null}
          </div>
        </section>
        <h2 className="text-sm font-semibold">Order history</h2>
        <OrderGrid orders={orders} empty="No orders for this client yet." />
      </div>
    </AgentFrame>
  );
}
