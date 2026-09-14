"use client";

import { NoteBadge } from "@/components/order/NoteBadge";
import type { OrderItemWithOrder, OrderType } from "@/lib/types";

export interface DesignerOrder {
  orderId: string;
  orderNo: string;
  clientName: string;
  orderType: OrderType;
  deadlineAt: string | null;
  deliveryDate: string | null;
  brief: string | null;
  items: OrderItemWithOrder[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function OrderCard({ order, onOpen }: { order: DesignerOrder; onOpen: () => void }) {
  const sent = order.items.filter((i) => i.stage === "factory").length;
  const itemNotes = order.items.flatMap((i) => i.item_notes);
  const orderNotes = (order.items[0]?.order.order_notes ?? []).filter((n) => n.order_item_id === null);

  return (
    <article className="relative rounded-[var(--radius)] border border-border bg-surface shadow-theme-xs transition-colors">
      <button
        onClick={onOpen}
        className="w-full rounded-[var(--radius)] p-3 pr-11 text-left text-sm hover:bg-background"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-base font-semibold leading-tight">{order.clientName}</p>
          {order.orderType === "express" ? (
            <span className="shrink-0 rounded bg-[var(--rush)]/10 px-2 py-0.5 text-xs font-medium text-[var(--rush)]">
              Express
            </span>
          ) : null}
        </div>

        <p className="mt-2 text-xs text-muted">
          {order.items.length} item{order.items.length === 1 ? "" : "s"} · Due{" "}
          <span className="tnum text-foreground">{formatDate(order.deliveryDate)}</span>
        </p>

        {sent > 0 ? (
          <p className="mt-1 text-xs text-brand-600">
            <span className="tnum">{sent}</span>/<span className="tnum">{order.items.length}</span> already
            sent to the factory
          </p>
        ) : null}

        {order.brief ? (
          <p className="mt-2 line-clamp-2 text-xs text-muted">{order.brief}</p>
        ) : null}
      </button>

      {orderNotes.length + itemNotes.length > 0 ? (
        <div className="absolute right-2.5 top-2.5">
          <NoteBadge orderNotes={orderNotes} itemNotes={itemNotes} />
        </div>
      ) : null}
    </article>
  );
}
