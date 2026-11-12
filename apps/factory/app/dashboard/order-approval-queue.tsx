"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@repo/ui/Button";
import { Field, Select } from "@repo/ui/Field";
import { StaffInvoicePanel } from "@repo/ui/invoices/StaffInvoicePanel";
import { SectionLabel } from "@repo/ui/SectionLabel";
import type { DesignerPublic, OrderItemWithOrder } from "@repo/lib/types";

import { CancelOrderButton } from "@repo/ui/order/CancelOrder";
import { cancelOrder, routeApprovedOrder } from "./actions";
import { AgreedPrices, OrderConfirmation } from "./order-confirmation";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { catalogUnitPrice } from "@repo/lib/orders/pricing";

/** One unit's cost from its product's recipe (with its add-ons), by item id; `short`: a cost it needs isn't set. */
export type ItemCosts = Record<string, { cost: number; short: boolean }>;

interface OrderGroup {
  orderId: string;
  orderNo: string;
  clientName: string;
  items: OrderItemWithOrder[];
  order: OrderItemWithOrder["order"];
}

// Groups the flat item list into one card per order — same technique
// apps/client/app/orders-board.tsx already uses (there's no order-level
// query anywhere in this app; every board is item-scoped and grouped
// client-side when it needs to reason about a whole order).
function groupByOrder(items: OrderItemWithOrder[]): OrderGroup[] {
  const byOrder = new Map<string, OrderGroup>();
  for (const item of items) {
    const existing = byOrder.get(item.order_id);
    if (existing) {
      existing.items.push(item);
    } else {
      byOrder.set(item.order_id, {
        orderId: item.order_id,
        orderNo: item.order.order_no,
        clientName: item.order.client_name,
        items: [item],
        order: item.order,
      });
    }
  }
  return [...byOrder.values()].sort((a, b) => (a.orderNo < b.orderNo ? 1 : -1));
}

export function OrderApprovalQueue({
  items,
  designers,
  photobookCategoryIds,
  agentPayments,
  costs,
  driveLinks,
  canCancel = false,
  takesPayments = false,
}: {
  items: OrderItemWithOrder[];
  designers: DesignerPublic[];
  photobookCategoryIds: string[];
  /** Drive folders and files linked to each item, by item id. */
  driveLinks: Record<string, number>;
  /** Only for those who see production costs (boss, supervisors). */
  costs: ItemCosts | null;
  /** Agents' own orders: paid so far and the % (set by the boss) needed before production (packages/lib/agents). */
  agentPayments: Record<string, { paid: number; percent: number; needed: number | null }>;
  canCancel?: boolean;
  /** Boss and reception record payments on the invoice; supervisors only make it. */
  takesPayments?: boolean;
}) {
  const groups = useMemo(() => groupByOrder(items), [items]);
  // Every client order that hasn't been sent on yet: check it, confirm it,
  // choose where it goes. Photo books also need a call to the client first.
  const photobookIds = new Set(photobookCategoryIds);
  const incoming = groups.filter((g) => g.order.released_at === null);

  return (
    <div>
      <SectionLabel>New client orders{incoming.length > 0 ? ` (${incoming.length})` : ""}</SectionLabel>
      <div className="space-y-3">
        {incoming.map((g) => (
          <RouteCard
            key={g.orderId}
            group={g}
            designers={designers}
            // Only a photo book with no price needs the call (a priced one is confirmed like any order).
            call={g.items.some((i) => i.category_id && photobookIds.has(i.category_id) && catalogUnitPrice(i) == null)}
            driveLinks={driveLinks}
            agentPayment={agentPayments[g.orderId] ?? null}
            costs={costs}
            canCancel={canCancel}
            takesPayments={takesPayments}
          />
        ))}
        {incoming.length === 0 ? <p className="text-sm text-muted">No new client orders.</p> : null}
      </div>
    </div>
  );
}

function ItemsList({ items }: { items: OrderItemWithOrder[] }) {
  return (
    <ul className="space-y-1 text-sm text-muted">
      {items.map((item) => (
        <li key={item.id}>
          {item.product}
          {item.product_type ? ` (${item.product_type})` : ""} · Qty {item.qty}
        </li>
      ))}
    </ul>
  );
}

// What the receptionist checks before receiving an order: is everything filled
// in? Two plain tables — order info, then one row per item with its options
// stacked as label / value pairs so nothing runs together.
function OrderDetails({ order, items, costs, driveLinks }: { order: OrderGroup["order"]; items: OrderItemWithOrder[]; costs: ItemCosts | null; driveLinks: Record<string, number> }) {
  const symbol = useCurrencySymbol();
  const notes = order.order_notes.map((n) => n.body).filter(Boolean);
  const info: [string, string][] = [
    ["Order type", order.order_type === "express" ? "Express" : "Normal"],
    ["Delivery", order.delivery_date ?? "Not set"],
    ["Client phone", order.client_phone ?? "Not on file"],
  ];

  return (
    <div className="mb-3 space-y-3 text-xs">
      <table className="w-full border-collapse">
        <tbody>
          {info.map(([label, value]) => (
            <tr key={label} className="border-b border-border last:border-b-0">
              <th scope="row" className="w-32 py-1.5 pr-3 text-left font-medium text-muted">
                {label}
              </th>
              <td className="py-1.5 text-foreground">{value}</td>
            </tr>
          ))}
          {notes.length > 0 ? (
            <tr className="border-b border-border last:border-b-0">
              <th scope="row" className="w-32 py-1.5 pr-3 text-left align-top font-medium text-muted">
                Notes
              </th>
              <td className="py-1.5 text-foreground">{notes.join(" / ")}</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <div className="overflow-x-auto rounded-[var(--radius)] border border-border">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 text-left text-muted dark:bg-white/5">
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="px-3 py-2 font-medium">Details</th>
              <th className="px-3 py-2 font-medium">Files</th>
              {costs ? <th className="px-3 py-2 text-right font-medium">Cost · margin</th> : null}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const attrs = Object.entries(item.attributes ?? {});
              const files = item.media.length + (item.media_link ? 1 : 0) + (driveLinks[item.id] ?? 0);
              return (
                <tr key={item.id} className="border-t border-border align-top">
                  <td className="px-3 py-2 font-medium text-foreground">
                    {item.product}
                    {item.product_type ? <span className="block font-normal text-muted">{item.product_type}</span> : null}
                  </td>
                  <td className="tnum px-3 py-2 text-right text-foreground">{item.qty}</td>
                  <td className="px-3 py-2">
                    {attrs.length > 0 ? (
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                        {attrs.map(([label, value]) => (
                          <div key={label} className="contents">
                            <dt className="text-muted">{label}</dt>
                            <dd className="text-foreground">{String(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <span className="text-[var(--rush)]">Nothing filled in</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {files > 0 ? (
                      <span className="text-foreground">{files}</span>
                    ) : (
                      <span className="text-[var(--rush)]">None</span>
                    )}
                  </td>
                  {costs ? <CostCell item={item} cost={costs[item.id]} symbol={symbol} /> : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** An item's cost from its recipe, and its margin at its price (the recipe's or the catalog's) when it has one. */
function CostCell({ item, cost, symbol }: { item: OrderItemWithOrder; cost: ItemCosts[string] | undefined; symbol: string }) {
  if (!cost) return <td className="px-3 py-2 text-right text-muted">No recipe</td>;
  const price = catalogUnitPrice(item);
  const margin = price && price > 0 ? Math.round(((price - cost.cost) / price) * 1000) / 10 : null;
  return (
    <td className="tnum px-3 py-2 text-right text-foreground">
      {formatMoney(cost.cost * item.qty, symbol)}
      {margin !== null ? (
        <span className={`block ${margin < 0 ? "text-error-600 dark:text-error-400" : margin < 25 ? "text-warning-600 dark:text-warning-500" : "text-success-600 dark:text-success-500"}`}>{margin}%</span>
      ) : null}
      {cost.short ? <span className="block text-warning-600 dark:text-warning-500">cost short</span> : null}
    </td>
  );
}

const STEPS = [
  { key: "confirm", label: "Confirm prices" },
  { key: "invoice", label: "Issue invoice" },
  { key: "route", label: "Route to production" },
] as const;

/** Where this order is in getting it out of the queue. */
function Steps({ current }: { current: (typeof STEPS)[number]["key"] }) {
  const at = STEPS.findIndex((s) => s.key === current);
  return (
    <ol className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" aria-label="Steps">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2" aria-current={i === at ? "step" : undefined}>
          <span
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
              i < at ? "bg-success-500 text-white" : i === at ? "bg-brand-500 text-white" : "bg-gray-100 text-muted dark:bg-white/10"
            }`}
          >
            {i < at ? "✓" : i + 1}
          </span>
          <span className={i === at ? "font-semibold text-foreground" : "text-muted"}>{s.label}</span>
          {i < STEPS.length - 1 ? <span className="text-muted">→</span> : null}
        </li>
      ))}
    </ol>
  );
}

function OrderCard({ group, children }: { group: OrderGroup; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-4 shadow-theme-xs">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{group.orderNo}</p>
          <p className="text-xs text-muted">{group.clientName}</p>
        </div>
      </div>
      <ItemsList items={group.items} />
      {group.order.client_decision_note ? (
        <p className="mt-3 rounded-[var(--radius)] border border-warning-100 bg-warning-50 p-2 text-xs text-warning-700">
          Client note: {group.order.client_decision_note}
        </p>
      ) : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function RouteCard({
  group,
  designers,
  call = false,
  agentPayment,
  costs,
  driveLinks,
  canCancel = false,
  takesPayments = false,
}: {
  group: OrderGroup;
  designers: DesignerPublic[];
  agentPayment: { paid: number; percent: number; needed: number | null } | null;
  costs: ItemCosts | null;
  driveLinks: Record<string, number>;
  // Photo-book order: confirming needs the price agreed on a call with the
  // client — photo books have no catalog price (see ./order-confirmation.tsx).
  call?: boolean;
  canCancel?: boolean;
  takesPayments?: boolean;
}) {
  const symbol = useCurrencySymbol();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [designerId, setDesignerId] = useState("");
  const [sending, startSending] = useTransition();
  const [sendingTo, setSendingTo] = useState<"factory" | "designer" | null>(null);
  const [invoiceReady, setInvoiceReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = group.order.approval_status === "approved";
  const paidEnough = !agentPayment || (agentPayment.needed !== null && agentPayment.paid >= agentPayment.needed);

  function send(route: "factory" | "designer") {
    setError(null);
    setSendingTo(route);
    startSending(async () => {
      const arg = route === "designer" ? designerId : undefined;
      const res = await routeApprovedOrder(group.orderId, route, arg);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <OrderCard group={group}>
      <OrderDetails order={group.order} items={group.items} costs={costs} driveLinks={driveLinks} />
      <Steps current={confirmed ? (invoiceReady ? "route" : "invoice") : "confirm"} />
      {!confirmed ? (
        <OrderConfirmation
          orderId={group.orderId}
          orderNo={group.orderNo}
          clientName={group.clientName}
          items={group.items}
          call={call}
          onChanged={() => router.refresh()}
        />
      ) : (
        <div className="space-y-3">
          <AgreedPrices items={group.items} invoiced={invoiceReady} onChanged={() => router.refresh()} />
          <StaffInvoicePanel
            orderId={group.orderId}
            takesPayments={takesPayments}
            onChanged={() => router.refresh()}
            onInvoiceStatusChange={setInvoiceReady}
          />
          {agentPayment ? (
            <p className={`text-xs ${paidEnough ? "text-muted" : "font-medium text-[var(--rush)]"}`}>
              Agent order: {agentPayment.needed === null ? `${agentPayment.percent}% of the price` : `${formatMoney(agentPayment.needed, symbol)} (${agentPayment.percent}%)`} must be paid before production. Paid so far:{" "}
              {formatMoney(agentPayment.paid, symbol)}.
            </p>
          ) : null}
          <Button variant="primary" disabled={!invoiceReady || !paidEnough || sending} onClick={() => setOpen(true)}>
            Route order
          </Button>
          {!invoiceReady ? <p className="text-xs text-muted">Generate the invoice before sending this order to production.</p> : null}
        </div>
      )}
      {canCancel ? (
        <span className="ml-2">
          <CancelOrderButton
            orderNo={group.orderNo}
            cancel={(reason) => cancelOrder(group.orderId, reason)}
            onCancelled={() => router.refresh()}
            requireTypedOrderNo
            description="The order is removed from this queue and the client is notified with your reason. This can't be undone."
          />
        </span>
      ) : null}
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-400/50 p-4 backdrop-blur-[2px] dark:bg-gray-950/60"
          onClick={() => !sending && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Where should this order go?"
            className="w-full max-w-sm rounded-[var(--radius)] border border-border bg-surface p-5 shadow-theme-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">Where should this order go?</h3>
            <p className="mt-0.5 text-xs text-muted">
              {group.orderNo} · {group.clientName}
              {group.order.quoted_price != null ? ` · ${formatMoney(group.order.quoted_price, symbol)}` : ""}
            </p>
            <div className="mt-4 space-y-3">
              <Button
                variant="primary"
                className="w-full"
                loading={sending && sendingTo === "factory"}
                disabled={sending}
                onClick={() => send("factory")}
              >
                Factory
              </Button>
              <div className="rounded-[var(--radius)] border border-border p-3">
                <Field label="Graphics designer">
                  <Select value={designerId} onChange={(e) => setDesignerId(e.target.value)} disabled={sending}>
                    <option value="">Select a designer…</option>
                    {designers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button
                  variant="secondary"
                  className="mt-3 w-full"
                  loading={sending && sendingTo === "designer"}
                  disabled={sending || !designerId}
                  onClick={() => send("designer")}
                >
                  Designer
                </Button>
              </div>
            </div>
            {error ? <p className="mt-3 text-sm text-[var(--rush)]">{error}</p> : null}
            <Button variant="ghost" className="mt-3 w-full" disabled={sending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </OrderCard>
  );
}
