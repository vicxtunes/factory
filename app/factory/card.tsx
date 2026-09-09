"use client";

import { DELAYED_CARD_STYLE, PRODUCTION_STATUS_CARD_STYLES } from "@/components/ui/productionStatusStyles";
import { UrgencyBadge } from "@/components/ui/UrgencyBadge";
import type { OrderItemWithOrder } from "@/lib/types";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Same colored-by-status card as the /display screen (see
// components/ui/productionStatusStyles.ts) — so a worker's board and the
// wall display read as one system, just with the order number and urgency
// badge that workers additionally need to match physical batches.
export function ItemCard({
  item,
  onOpen,
}: {
  item: OrderItemWithOrder;
  onOpen: () => void;
}) {
  const isExpress = item.order.order_type === "express";

  return (
    <article>
      <button
        onClick={onOpen}
        className={`w-full rounded-xl border p-3 text-left text-sm shadow-theme-xs transition-opacity hover:opacity-90 ${
          item.is_delayed ? DELAYED_CARD_STYLE : PRODUCTION_STATUS_CARD_STYLES[item.production_status]
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold leading-tight">{item.order.client_name}</p>
            <p className="tnum text-xs opacity-70">{item.order.order_no}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {isExpress ? (
              <span className="rounded-full bg-black/20 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-white">
                Express
              </span>
            ) : null}
            <UrgencyBadge urgency={item.urgency} />
          </div>
        </div>

        <p className="mt-0.5 text-sm opacity-80">
          {item.product}
          {item.product_type ? ` · ${item.product_type}` : ""}
        </p>

        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="opacity-80">
            Qty <span className="tnum font-semibold">{item.qty}</span>
          </span>
          <span className="tnum font-semibold">
            {isExpress && item.order.deadline_at
              ? formatDeadline(item.order.deadline_at)
              : formatDate(item.order.delivery_date)}
          </span>
        </div>

        {item.is_delayed ? (
          <p className="mt-2 text-xs font-bold uppercase tracking-wide">
            Delayed{item.delay_reason ? `: ${item.delay_reason}` : ""}
          </p>
        ) : null}
      </button>
    </article>
  );
}
