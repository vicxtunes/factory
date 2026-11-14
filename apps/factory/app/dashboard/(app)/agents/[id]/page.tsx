import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { Tile } from "@repo/ui/production/MaterialsBoard";
import { COMMISSION_STATUS_LABELS, AGENT_STAGE_LABELS, AGENT_WALLET_KIND_LABELS, weeklyPayWhen } from "@repo/lib/agents/core";
import { agentById, agentClients, figuresFor, payFirstForAll, weeklyPay } from "@repo/lib/agents/server";
import { pageAccess, sessionCan } from "@repo/lib/auth/session";
import { formatMoney } from "@repo/lib/currency/format";
import { fetchBaseCurrencySymbol } from "@repo/lib/queries";
import { agentWallet } from "@repo/lib/wallet/agent";
import { localPhone } from "@repo/lib/wallet/policy";

import { AgentActions } from "./agent-actions";

export const dynamic = "force-dynamic";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="rounded-2xl border border-border bg-surface shadow-theme-xs">
      <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{title}</h2>
      {children.length ? <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto">{children}</ul> : <p className="p-6 text-center text-sm text-muted">{empty}</p>}
    </section>
  );
}

// One agent: performance, orders, clients and every transaction.
export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await pageAccess("agents");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const agent = await agentById(id);
  if (!agent) notFound();

  const [{ orders, ...figures }, clients, wallet, symbol, payFirstAll, weekly] = await Promise.all([figuresFor(id), agentClients(id), agentWallet(id), fetchBaseCurrencySymbol(), payFirstForAll(), weeklyPay()]);
  const money = (n: number) => formatMoney(n, symbol);

  return (
    <div className="space-y-5">
      <Link href="/dashboard/agents" className="text-xs font-medium text-brand-600 hover:underline">
        ← Agents
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{agent.name}</h1>
          <p className="text-sm text-muted">{[agent.phone, agent.email].filter(Boolean).join(" · ") || "No login yet"}</p>
          <p className="text-sm text-muted">
            {agent.active ? "Active" : "Inactive"} · {agent.rateOverride === null ? "Category rates" : `Own rate: ${agent.rateOverride}%`} · Pays {agent.payFirstOverride ?? payFirstAll}% before production
            {agent.payFirstOverride === null ? " (all agents)" : " (own)"}
          </p>
          <p className="text-sm text-muted">
            {agent.payoutPhone
              ? `Weekly payment to ${localPhone(agent.payoutPhone)}${weekly.on ? ` · ${weeklyPayWhen(weekly).toLowerCase()}` : " · weekly payments are off (Rates & settings)"}`
              : "No weekly payment number: paid only when they ask"}
          </p>
        </div>
        {sessionCan(session, "agents", "manage") ? <AgentActions agent={agent} payFirstForAll={payFirstAll} /> : null}
      </div>

      <div className="@container grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Orders" value={String(figures.totalOrders)} />
        <Tile label="Completed sales" value={String(figures.completedSales)} />
        <Tile label="Pending orders" value={String(figures.pendingOrders)} />
        <Tile label="Commission earned" value={money(figures.commissionEarned)} />
        <Tile label="Commission pending" value={money(figures.commissionPending)} />
        <Tile label="Balance" value={money(figures.balance)} tone={figures.balance < 0 ? "error" : undefined} />
        <Tile label="Withdrawn" value={money(figures.withdrawn)} />
        <Tile label="Clients" value={String(clients.filter((c) => c.status === "active").length)} />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Section title="Orders" empty="No orders yet.">
          {orders.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {o.orderNo} · {o.clientName}
                </span>
                <span className="block text-xs text-muted">
                  {AGENT_STAGE_LABELS[o.stage]} · {o.price === null ? "Price to confirm" : `${money(o.paid)} of ${money(o.price)} paid`}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-semibold tnum">{money(o.commission.status === "pending" ? o.commission.amount : o.commission.creditedAmount)}</span>
                <span className="block text-xs text-muted">{COMMISSION_STATUS_LABELS[o.commission.status]}</span>
              </span>
            </li>
          ))}
        </Section>

        <Section title="Transactions" empty="None yet.">
          {wallet.entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{AGENT_WALLET_KIND_LABELS[e.kind]}</span>
                <span className="block truncate text-xs text-muted">
                  {e.note} · {day(e.createdAt)}
                </span>
              </span>
              <span className="shrink-0 text-right tnum">
                <span className="block font-semibold">
                  {e.amount > 0 ? "+" : "−"}
                  {money(Math.abs(e.amount))}
                </span>
                <span className="block text-xs text-muted">{money(e.balanceAfter)}</span>
              </span>
            </li>
          ))}
        </Section>

        <Section title="Clients" empty="No clients yet.">
          {clients.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{c.name}</span>
                <span className="block truncate text-xs text-muted">{[c.phone, c.email].filter(Boolean).join(" · ")}</span>
              </span>
              {c.status === "active" ? null : <span className="shrink-0 text-xs text-muted">{c.status === "pending" ? "To check" : "Refused"}</span>}
            </li>
          ))}
        </Section>

        <Section title="Withdrawals" empty="None yet.">
          {wallet.withdrawals.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="block font-semibold tnum">
                  {money(w.amount)}
                  {w.weekly ? <span className="ml-2 text-xs font-normal text-muted">Weekly</span> : null}
                </span>
                <span className="block truncate text-xs text-muted">
                  {w.method === "bank" ? `${w.bankName} ${w.bankAccountNumber}` : w.phone} · {day(w.createdAt)}
                  {w.reference ? ` · Ref ${w.reference}` : ""}
                  {w.reason ? ` · ${w.reason}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-xs capitalize text-muted">{w.status}</span>
            </li>
          ))}
        </Section>
      </div>
    </div>
  );
}
