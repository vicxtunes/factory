import Link from "next/link";

import { agentOrders } from "@repo/lib/agents/server";

import { requireAgent } from "../agent";
import { OrderGrid } from "../bits";
import { AgentFrame } from "../frame";

export const metadata = { title: "Orders" };

export default async function AgentOrdersPage() {
  const { agent } = await requireAgent();
  const orders = await agentOrders(agent.id);
  return (
    <AgentFrame agent={agent} page="orders">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Orders</h1>
          <Link href="/agents/orders/new" className="inline-flex min-h-10 items-center rounded-[var(--radius)] bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
            New order
          </Link>
        </div>
        <OrderGrid orders={orders} empty="No orders yet. Place your first one." />
      </div>
    </AgentFrame>
  );
}
