"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { SectionLabel } from "@/components/ui/SectionLabel";
import type { DesignerPublic, OrderItemWithOrder } from "@/lib/types";

import { receiveClientOrder, quoteOrder, routeApprovedOrder } from "./actions";
import { useCurrencySymbol } from "@/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@/lib/currency/format";

type Result = { ok: boolean; error?: string };

interface OrderGroup {
  orderId: string;
  orderNo: string;
  clientName: string;
  items: OrderItemWithOrder[];
  order: OrderItemWithOrder["order"];
}

// Groups the flat item list into one card per order — same technique
// app/client-side/orders-board.tsx already uses (there's no order-level
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
}: {
  items: OrderItemWithOrder[];
  designers: DesignerPublic[];
  photobookCategoryIds: string[];
}) {
  const symbol = useCurrencySymbol();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<Result>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  const groups = useMemo(() => groupByOrder(items), [items]);
  // Every new client order waits here: check it, receive it, choose where it
  // goes. Photo books also need a call to the client first.
  const photobookIds = new Set(photobookCategoryIds);
  const incoming = groups.filter((g) => g.order.approval_status === "pending_review" && g.order.released_at === null);
  const needsQuote = groups.filter((g) => g.order.approval_status === "changes_requested");
  const awaitingClient = groups.filter((g) => g.order.approval_status === "awaiting_client_approval");
  const readyToRoute = groups.filter(
    (g) => g.order.approval_status === "approved" && g.order.released_at === null,
  );

  return (
    <div className="space-y-8">
      <div>
        <SectionLabel>New client orders{incoming.length > 0 ? ` (${incoming.length})` : ""}</SectionLabel>
        <div className="space-y-3">
          {incoming.map((g) => (
            <RouteCard
              key={g.orderId}
              group={g}
              designers={designers}
              pending={pending}
              run={run}
              incoming
              call={g.items.some((i) => i.category_id && photobookIds.has(i.category_id))}
            />
          ))}
          {incoming.length === 0 ? <p className="text-sm text-muted">No new client orders.</p> : null}
        </div>
      </div>

      <div>
        <SectionLabel>Needs a quote{needsQuote.length > 0 ? ` (${needsQuote.length})` : ""}</SectionLabel>
        <div className="space-y-3">
          {needsQuote.map((g) => (
            <QuoteCard key={g.orderId} group={g} pending={pending} run={run} />
          ))}
          {needsQuote.length === 0 ? <p className="text-sm text-muted">Nothing waiting on a quote.</p> : null}
        </div>
      </div>

      <div>
        <SectionLabel>
          Awaiting client{awaitingClient.length > 0 ? ` (${awaitingClient.length})` : ""}
        </SectionLabel>
        <div className="space-y-3">
          {awaitingClient.map((g) => (
            <OrderCard key={g.orderId} group={g}>
              <p className="text-sm text-muted">
                Quoted{" "}
                <span className="font-semibold text-foreground">{formatMoney(g.order.quoted_price, symbol)}</span> —
                waiting on the client to approve or request changes.
              </p>
            </OrderCard>
          ))}
          {awaitingClient.length === 0 ? (
            <p className="text-sm text-muted">Nothing waiting on a client response.</p>
          ) : null}
        </div>
      </div>

      <div>
        <SectionLabel>Approved, not routed{readyToRoute.length > 0 ? ` (${readyToRoute.length})` : ""}</SectionLabel>
        <div className="space-y-3">
          {readyToRoute.map((g) => (
            <RouteCard key={g.orderId} group={g} designers={designers} pending={pending} run={run} />
          ))}
          {readyToRoute.length === 0 ? (
            <p className="text-sm text-muted">Nothing approved and waiting to be sent on.</p>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null}
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
function OrderDetails({ order, items }: { order: OrderGroup["order"]; items: OrderItemWithOrder[] }) {
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
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const attrs = Object.entries(item.attributes ?? {});
              const files = item.media.length + (item.media_link ? 1 : 0);
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
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

function QuoteCard({
  group,
  pending,
  run,
}: {
  group: OrderGroup;
  pending: boolean;
  run: (fn: () => Promise<Result>) => void;
}) {
  const [price, setPrice] = useState("");

  return (
    <OrderCard group={group}>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Quote a total price">
          <TextInput
            type="number"
            min={0}
            step="0.01"
            className="tnum w-32"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Button
          variant="primary"
          loading={pending} disabled={pending || !price}
          onClick={() => run(() => quoteOrder(group.orderId, Number(price)))}
        >
          Send quote
        </Button>
      </div>
    </OrderCard>
  );
}

function RouteCard({
  group,
  designers,
  pending,
  run,
  call = false,
  incoming = false,
}: {
  group: OrderGroup;
  designers: DesignerPublic[];
  pending: boolean;
  run: (fn: () => Promise<Result>) => void;
  // Photo-book order: show a call-the-client prompt instead of the approved
  // price, and confirm details + send in one step.
  call?: boolean;
  // New order awaiting review (vs. a legacy approved-not-routed one).
  incoming?: boolean;
}) {
  const symbol = useCurrencySymbol();
  const [route, setRoute] = useState<"factory" | "designer">("factory");
  const [designerId, setDesignerId] = useState("");

  return (
    <OrderCard group={group}>
      {incoming ? (
        <OrderDetails order={group.order} items={group.items} />
      ) : null}
      {call ? (
        <div className="mb-3 rounded-[var(--radius)] border border-brand-200 bg-brand-50 p-3 text-sm dark:border-brand-500/30 dark:bg-brand-500/10">
          <p className="mb-2 text-xs text-muted">
            This order has a photo book — call {group.clientName} to confirm the details first.
          </p>
          {group.order.client_phone ? (
            <a href={`tel:${group.order.client_phone}`}>
              <Button variant="primary" type="button">
                Call {group.order.client_phone}
              </Button>
            </a>
          ) : (
            <p className="text-xs text-muted">No phone number on file for this client.</p>
          )}
        </div>
      ) : incoming ? null : (
        <p className="mb-2 text-xs text-muted">
          Approved at{" "}
          <span className="font-semibold text-foreground">{formatMoney(group.order.quoted_price, symbol)}</span>.
        </p>
      )}
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          className={`rounded-[var(--radius)] px-3 py-1.5 text-xs font-medium ${
            route === "factory" ? "bg-brand-500 text-white" : "border border-border"
          }`}
          onClick={() => setRoute("factory")}
        >
          Send to factory
        </button>
        <button
          type="button"
          className={`rounded-[var(--radius)] px-3 py-1.5 text-xs font-medium ${
            route === "designer" ? "bg-brand-500 text-white" : "border border-border"
          }`}
          onClick={() => setRoute("designer")}
        >
          Send to graphics designer
        </button>
      </div>
      {route === "designer" ? (
        <Field label="Designer" hint="Required">
          <Select value={designerId} onChange={(e) => setDesignerId(e.target.value)}>
            <option value="">Select a designer…</option>
            {designers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Button
        variant="primary"
        className="mt-3"
        loading={pending} disabled={pending || (route === "designer" && !designerId)}
        onClick={() =>
          run(() =>
            incoming
              ? receiveClientOrder(group.orderId, route, designerId || undefined)
              : routeApprovedOrder(group.orderId, route, designerId || undefined),
          )
        }
      >
        {incoming ? (call ? "Called — receive & send" : "Receive & send") : "Send order"}
      </Button>
    </OrderCard>
  );
}
