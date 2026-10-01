"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CreateOrderDrawer } from "@/components/order/CreateOrderDrawer";
import { Drawer } from "@/components/ui/Drawer";
import { TextInput } from "@/components/ui/Field";
import { Tabs } from "@/components/ui/Tabs";
import { createClient } from "@/lib/supabase/browser";
import { ORDER_ITEM_SELECT } from "@/lib/item-select";
import { isFinishedStatus } from "@/lib/types";
import type {
  Agent,
  Client,
  OrderItemWithOrder,
  ProductCategory,
  WorkerPublic,
} from "@/lib/types";

import { checkClientDuplicates, createDesignerOrder } from "./actions";
import { OrderCard, type DesignerOrder } from "./order-card";
import { OrderDetail } from "./order-detail";

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
      items: [item],
    });
  }
  return Array.from(byOrder.values());
}

type BoardTab = "all" | "in_design" | "submitted" | "completed";

// Which tab an order belongs to. Same finished rule as the dashboard board:
// once every item is Ready or Delivered the order is "Completed" (still
// editable there until the factory completes each item, so a late mistake
// can be fixed). Before that it's "In design" while any item is still with
// the designer — a partly-sent order still has work left — and "Submitted"
// once every item has gone to the factory.
function tabOf(order: DesignerOrder): Exclude<BoardTab, "all"> {
  if (order.items.every((i) => isFinishedStatus(i.production_status))) return "completed";
  if (order.items.some((i) => i.stage === "with_designer")) return "in_design";
  return "submitted";
}

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
  completed: "Nothing finished yet.",
};

export function Board({
  initialItems,
  designerId,
  designerName,
  catalog,
  clients,
  agents,
  workers,
}: {
  initialItems: OrderItemWithOrder[];
  designerId: string;
  designerName: string;
  catalog: ProductCategory[];
  clients: Client[];
  agents: Agent[];
  workers: WorkerPublic[];
}) {
  const [items, setItems] = useState(initialItems);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [tab, setTab] = useState<BoardTab>("in_design");
  const [search, setSearch] = useState("");
  const supabaseRef = useRef(createClient());

  const orders = useMemo(() => groupByOrder(items), [items]);
  // Search narrows every tab, and the counts follow it, so a designer can see
  // which tab their match landed in.
  const query = search.trim().toLowerCase();
  const byTab = useMemo(() => {
    const groups: Record<BoardTab, DesignerOrder[]> = { all: [], in_design: [], submitted: [], completed: [] };
    for (const order of orders) {
      if (!matchesSearch(order, query)) continue;
      groups.all.push(order);
      groups[tabOf(order)].push(order);
    }
    return groups;
  }, [orders, query]);
  const visibleOrders = byTab[tab];
  const selectedOrder = orders.find((o) => o.orderId === selectedOrderId) ?? null;

  const refetch = useCallback(async () => {
    const { data } = await supabaseRef.current
      .from("order_items")
      .select(ORDER_ITEM_SELECT)
      .eq("order.assigned_designer_id", designerId)
      .is("order.cancelled_at", null);
    if (data) setItems(data as unknown as OrderItemWithOrder[]);
  }, [designerId]);

  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel("graphics-board")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => refetch(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">Signed in as {designerName}</span>
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
              className="inline-flex min-h-9 items-center rounded-[var(--radius)] bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600"
            >
              + New order
            </button>
          )}
        />
      </div>

      <TextInput
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search order no, client or product…"
        aria-label="Search orders"
        className="mb-3"
      />

      <Tabs
        label="Order status"
        value={tab}
        onChange={setTab}
        className="mb-4"
        tabs={[
          { key: "all", label: "All" },
          { key: "in_design", label: "In design", count: byTab.in_design.length },
          { key: "submitted", label: "Submitted", count: byTab.submitted.length },
          { key: "completed", label: "Completed" },
        ]}
      />

      <div role="tabpanel" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleOrders.map((order) => (
          <OrderCard key={order.orderId} order={order} onOpen={() => setSelectedOrderId(order.orderId)} />
        ))}
        {visibleOrders.length === 0 ? (
          <p className="rounded-[var(--radius)] border border-dashed border-border p-3 text-xs text-muted md:col-span-2 xl:col-span-3">
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

