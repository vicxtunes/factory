"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CreateOrderDrawer } from "@/components/order/CreateOrderDrawer";
import { Drawer } from "@/components/ui/Drawer";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { createClient } from "@/lib/supabase/browser";
import { ORDER_ITEM_SELECT } from "@/lib/item-select";
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
      orderNotes: item.order.order_notes,
      items: [item],
    });
  }
  return Array.from(byOrder.values());
}

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
  const [showCompleted, setShowCompleted] = useState(false);
  const supabaseRef = useRef(createClient());

  const orders = useMemo(() => groupByOrder(items), [items]);
  // An order stays in view — and stays editable — until the factory has
  // actually finished every item on it, not just until it's been sent.
  // That way a mistake caught late can still be fixed.
  const inProgressOrders = useMemo(
    () => orders.filter((o) => o.items.some((i) => i.production_status !== "completed")),
    [orders],
  );
  const completedOrders = useMemo(
    () => orders.filter((o) => o.items.every((i) => i.production_status === "completed")),
    [orders],
  );
  const selectedOrder = orders.find((o) => o.orderId === selectedOrderId) ?? null;

  const refetch = useCallback(async () => {
    const { data } = await supabaseRef.current
      .from("order_items")
      .select(ORDER_ITEM_SELECT)
      .eq("order.assigned_designer_id", designerId);
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

      <div className="mb-2 flex items-baseline justify-between">
        <SectionLabel>Your orders</SectionLabel>
        <span className="text-xs text-muted tnum">{inProgressOrders.length}</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {inProgressOrders.map((order) => (
          <OrderCard key={order.orderId} order={order} onOpen={() => setSelectedOrderId(order.orderId)} />
        ))}
        {inProgressOrders.length === 0 ? (
          <p className="rounded-[var(--radius)] border border-dashed border-border p-3 text-xs text-muted md:col-span-2 xl:col-span-3">
            Nothing routed to you right now.
          </p>
        ) : null}
      </div>

      <div className="mt-6">
        <button
          onClick={() => setShowCompleted((v) => !v)}
          className="text-sm text-muted underline-offset-2 hover:underline"
        >
          {showCompleted ? "Hide" : "Show"} completed ({completedOrders.length})
        </button>
        {showCompleted ? (
          <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {completedOrders.map((order) => (
              <OrderCard key={order.orderId} order={order} onOpen={() => setSelectedOrderId(order.orderId)} />
            ))}
            {completedOrders.length === 0 ? (
              <p className="text-xs text-muted">Nothing finished yet.</p>
            ) : null}
          </div>
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
