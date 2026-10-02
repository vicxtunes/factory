"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CreateOrderDrawer } from "@repo/ui/order/CreateOrderDrawer";
import { Drawer } from "@repo/ui/Drawer";
import { TextInput } from "@repo/ui/Field";
import { Tabs } from "@repo/ui/Tabs";
import { createClient } from "@repo/lib/supabase/browser";
import { useLiveOrderItems, type LoadItems } from "@repo/lib/supabase/useLiveOrderItems";
import { ORDER_ITEM_SELECT } from "@repo/lib/item-select";
import type {
  Agent,
  Client,
  OrderItemWithOrder,
  ProductCategory,
  WorkerPublic,
} from "@repo/lib/types";

import { checkClientDuplicates, createDesignerOrder } from "./actions";
import { OrderCard } from "./order-card";
import { OrderDetail } from "./order-detail";
import { isLate, phaseOf, sortForPhase, type DesignerOrder } from "./order-status";

function groupByOrder(items: OrderItemWithOrder[]): DesignerOrder[] {
  const byOrder = new Map<string, DesignerOrder>();
  for (const item of items) {
    const existing = byOrder.get(item.order_id);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    byOrder.set(item.order_id, {
      orderId: item.order_id,
      orderNo: item.order.order_no,
      clientName: item.order.client_name,
      orderType: item.order.order_type,
      deadlineAt: item.order.deadline_at,
      deliveryDate: item.order.delivery_date,
      brief: item.order.designer_brief,
      createdAt: item.order.created_at,
      items: [item],
    });
  }
  return Array.from(byOrder.values());
}

type BoardTab = "all" | "in_design" | "submitted" | "late" | "completed";

function matchesSearch(order: DesignerOrder, query: string): boolean {
  if (!query) return true;
  return [order.orderNo, order.clientName, ...order.items.map((i) => i.product)].some((field) =>
    field?.toLowerCase().includes(query),
  );
}

const EMPTY_MESSAGE: Record<BoardTab, string> = {
  all: "No orders routed to you yet.",
  in_design: "Nothing waiting on your design right now.",
  submitted: "Nothing in production from you right now.",
  late: "Nothing late. Nice work.",
  completed: "Nothing finished yet.",
};

// "Late" and "Due today" depend on the clock, so re-check once a minute
// rather than only when the data changes.
const CLOCK_TICK_MS = 60_000;

export function Board({
  initialItems,
  designerId,
  catalog,
  clients,
  agents,
  workers,
}: {
  initialItems: OrderItemWithOrder[];
  designerId: string;
  catalog: ProductCategory[];
  clients: Client[];
  agents: Agent[];
  workers: WorkerPublic[];
}) {
  const [items, setItems] = useState(initialItems);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [tab, setTab] = useState<BoardTab>("in_design");
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const supabaseRef = useRef(createClient());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const orders = useMemo(() => groupByOrder(items), [items]);
  // Search narrows every tab, and the counts follow it, so a designer can see
  // which tab their match landed in. "Late" overlaps In design / Submitted:
  // it's a cross-cut of the work tabs, not a stage of its own.
  const query = search.trim().toLowerCase();
  const byTab = useMemo(() => {
    const groups: Record<BoardTab, DesignerOrder[]> = { all: [], in_design: [], submitted: [], late: [], completed: [] };
    for (const order of orders) {
      if (!matchesSearch(order, query)) continue;
      groups.all.push(order);
      groups[phaseOf(order)].push(order);
      if (isLate(order, now)) groups.late.push(order);
    }
    return {
      all: sortForPhase(groups.all, false),
      in_design: sortForPhase(groups.in_design, false),
      submitted: sortForPhase(groups.submitted, false),
      late: sortForPhase(groups.late, false),
      completed: sortForPhase(groups.completed, true),
    };
  }, [orders, query, now]);
  const visibleOrders = byTab[tab];
  const selectedOrder = orders.find((o) => o.orderId === selectedOrderId) ?? null;

  const load = useCallback<LoadItems>(
    async (orderIds) => {
      let query = supabaseRef.current
        .from("order_items")
        .select(ORDER_ITEM_SELECT)
        .eq("order.assigned_designer_id", designerId)
        .is("order.cancelled_at", null);
      if (orderIds) query = query.in("order_id", orderIds);
      const { data } = await query;
      return data as unknown as OrderItemWithOrder[] | null;
    },
    [designerId],
  );

  // Full reload, after this user's own changes.
  const refetch = useCallback(async () => {
    const fresh = await load();
    if (fresh) setItems(fresh);
  }, [load]);

  useLiveOrderItems("graphics-board", items, setItems, load);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center gap-2">
        <TextInput
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search order no, client or product…"
          aria-label="Search orders"
          className="flex-1"
        />
        <CreateOrderDrawer
          variant="designer"
          clients={clients}
          agents={agents}
          catalog={catalog}
          workers={workers}
          onCreate={createDesignerOrder}
          onCheckDuplicates={checkClientDuplicates}
          onCreated={refetch}
          trigger={(open) => (
            <button
              type="button"
              onClick={open}
              className="inline-flex min-h-11 shrink-0 items-center rounded-[var(--radius)] bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
            >
              + New order
            </button>
          )}
        />
      </div>

      <Tabs
        label="Order status"
        value={tab}
        onChange={setTab}
        className="mb-4"
        tabs={[
          { key: "all", label: "All" },
          { key: "in_design", label: "In design", count: byTab.in_design.length },
          { key: "submitted", label: "Submitted", count: byTab.submitted.length },
          { key: "late", label: "Late", count: byTab.late.length, tone: "warning" },
          { key: "completed", label: "Completed" },
        ]}
      />

      <div role="tabpanel" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleOrders.map((order) => (
          <OrderCard key={order.orderId} order={order} now={now} onOpen={() => setSelectedOrderId(order.orderId)} />
        ))}
        {visibleOrders.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted md:col-span-2 xl:col-span-3">
            {query ? `No orders match “${search.trim()}”.` : EMPTY_MESSAGE[tab]}
          </p>
        ) : null}
      </div>

      <Drawer
        open={!!selectedOrder}
        onClose={() => setSelectedOrderId(null)}
        title={selectedOrder ? selectedOrder.orderNo : undefined}
      >
        {selectedOrder ? (
          <OrderDetail order={selectedOrder} catalog={catalog} onChanged={refetch} />
        ) : null}
      </Drawer>
    </div>
  );
}
