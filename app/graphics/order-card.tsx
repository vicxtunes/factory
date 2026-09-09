"use client";

import type { OrderItemWithOrder, OrderType } from "@/lib/types";

export interface DesignerOrder {
  orderId: string;
  orderNo: string;
  clientName: string;
  orderType: OrderType;
  deadlineAt: string | null;
  deliveryDate: string | null;
  brief: string | null;
  orderNotes: string | null;
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

  return (
    <article>
      <button
        onClick={onOpen}
        className="w-full rounded-[var(--radius)] border border-border bg-surface p-3 text-left text-sm shadow-theme-xs transition-colors hover:bg-background"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold tnum">{order.orderNo}</p>
            <p className="text-muted">{order.clientName}</p>
          </div>
          {order.orderType === "express" ? (
            <span className="rounded bg-[var(--rush)]/10 px-2 py-0.5 text-xs font-medium text-[var(--rush)]">
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
    </article>
  );
}
