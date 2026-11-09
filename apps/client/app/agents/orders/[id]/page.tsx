import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { payFirstWording } from "@repo/lib/agents/core";
import { agentClient, agentOrder, payFirstPercent } from "@repo/lib/agents/server";
import { clientUrl } from "@repo/lib/client-portal/paths";
import { clientMoney } from "@repo/lib/currency/server";

import { requireAgent } from "../../agent";
import { CommissionStatusText, StageBadge, StageProgress, shortDate } from "../../bits";
import { AgentFrame } from "../../frame";
import { OrderPayment } from "./order-payment";

export const metadata = { title: "Order" };

const COMMISSION_NOTES = {
  pending: "Credited once the order is paid in full and delivered. This is an estimate until the price is confirmed.",
  credited: "On your balance.",
  reversed: "Taken back after a refund or cancellation.",
  cancelled: "The order was cancelled.",
};

export default async function AgentOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { agent } = await requireAgent();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const order = await agentOrder(agent.id, id);
  if (!order) notFound();

  const [money, client, percent] = await Promise.all([clientMoney(), order.clientId ? agentClient(agent.id, order.clientId) : null, payFirstPercent(agent.id)]);
  const payFirst = order.earns && order.stage !== "cancelled" ? payFirstWording(order.price, order.payFirstPercent ?? percent, money) : null;
  const due = order.price === null ? null : Math.max(order.price - order.paid, 0);
  const canPay = order.stage !== "cancelled" && order.price !== null && due !== null && due > 0;

  return (
    <AgentFrame agent={agent} page="orders">
      <div className="space-y-5">
        <Link href="/agents/orders" className="text-sm font-medium text-brand-600 hover:underline">
          ← Orders
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">{order.orderNo}</h1>
            <p className="truncate text-sm text-muted" suppressHydrationWarning>
              {order.clientName} · {shortDate(order.createdAt)}
            </p>
          </div>
          <StageBadge stage={order.stage} />
        </div>

        {order.stage === "cancelled" ? null : (
          <section className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-5">
            <StageProgress stage={order.stage} />
          </section>
        )}

        <div className="grid items-start gap-5 lg:grid-cols-[1fr_22rem]">
          <section className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-5">
            <h2 className="text-sm font-semibold">Items</h2>
            <ul className="mt-2 divide-y divide-border">
              {order.lines.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate">
                    {l.qty} × {l.product}
                  </span>
                  {l.unitPrice === null ? null : <span className="shrink-0 tnum">{money(l.unitPrice * l.qty)}</span>}
                </li>
              ))}
            </ul>
          </section>

          <div className="space-y-5">
            <section className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-5">
              <h2 className="text-sm font-semibold">Commission</h2>
              {order.earns ? (
                <>
                  <p className="mt-2 text-2xl font-bold tnum">{money(order.commission.status === "pending" ? order.commission.amount : order.commission.creditedAmount)}</p>
                  <CommissionStatusText status={order.commission.status} />
                  <p className="mt-1 text-xs text-muted">{COMMISSION_NOTES[order.commission.status]}</p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted">No commission: this order was placed before commission started on 4 Nov 2026.</p>
              )}
            </section>

            <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-5">
              <h2 className="text-sm font-semibold">Payment</h2>
              {order.price === null ? (
                <p className="text-sm text-muted">Aming will confirm the price first.</p>
              ) : (
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Price</dt>
                    <dd className="tnum">{money(order.price)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Paid</dt>
                    <dd className="tnum">{money(order.paid)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 font-semibold">
                    <dt>Still to pay</dt>
                    <dd className="tnum">{money(due ?? 0)}</dd>
                  </div>
                </dl>
              )}
              {payFirst ? <p className="text-xs font-medium text-warning-700">{payFirst}</p> : null}
              {canPay ? <OrderPayment orderId={order.id} phone={client?.status === "active" ? client.phone : null} invoiceUrl={order.invoiceToken ? clientUrl(`/invoice/${order.invoiceToken}`) : null} /> : null}
            </section>
          </div>
        </div>
      </div>
    </AgentFrame>
  );
}
