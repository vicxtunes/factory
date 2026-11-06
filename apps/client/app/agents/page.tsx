import Link from "next/link";

import { HomeGreeting, HomeHero, HomeSection } from "@repo/ui/home/HomeBits";
import { figuresFor } from "@repo/lib/agents/server";
import { clientMoney } from "@repo/lib/currency/server";

import { requireAgent } from "./agent";
import { OrderGrid } from "./bits";
import { AgentFrame } from "./frame";

export const metadata = { title: "Agent home" };

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-theme-xs ${strong ? "border-brand-500 bg-brand-50 dark:bg-brand-500/15" : "border-border bg-surface"}`}>
      <p className="text-lg font-bold tnum lg:text-2xl">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  );
}

export default async function AgentHomePage() {
  const { session, agent } = await requireAgent();
  const [{ orders, ...figures }, money] = await Promise.all([figuresFor(agent.id), clientMoney()]);

  return (
    <AgentFrame agent={agent} page="home">
      <div className="space-y-8">
        <HomeGreeting name={session.name} avatarUrl={session.avatarUrl} subtitle="Sales agent" />
        <HomeHero title="Place an order" text="Choose one of your clients or register a new one, then pick the products." cta={{ label: "New order", href: "/agents/orders/new" }} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Figure strong label="Available to withdraw" value={money(figures.balance)} />
          <Figure label="Commission earned" value={money(figures.commissionEarned)} />
          <Figure label="Withdrawn" value={money(figures.withdrawn)} />
          <Figure label="Total orders" value={String(figures.totalOrders)} />
          <Figure label="Completed sales" value={String(figures.completedSales)} />
          <Figure label="Pending orders" value={String(figures.pendingOrders)} />
        </div>
        <HomeSection title="Latest orders">
          <OrderGrid orders={orders.slice(0, 6)} empty="No orders yet." />
          {orders.length > 6 ? (
            <Link href="/agents/orders" className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline">
              See all orders
            </Link>
          ) : null}
        </HomeSection>
      </div>
    </AgentFrame>
  );
}
