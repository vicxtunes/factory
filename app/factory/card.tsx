"use client";

import { UrgencyBadge } from "@/components/ui/UrgencyBadge";
import type { OrderItemWithOrder } from "@/lib/types";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function ItemCard({
  item,
  onOpen,
}: {
  item: OrderItemWithOrder;
  onOpen: () => void;
}) {
  return (
    <article>
      <button
        onClick={onOpen}
        className="w-full rounded-[var(--radius)] border border-border bg-surface p-3 text-left text-sm shadow-theme-xs transition-colors hover:bg-background"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold tnum">{item.order.order_no}</p>
            <p className="text-muted">{item.order.client_name}</p>
          </div>
          <UrgencyBadge urgency={item.urgency} />
        </div>

        <p className="mt-2 font-medium">{item.product}</p>

        <div className="mt-2 flex items-center justify-between text-xs text-muted">
          <span>
            Qty <span className="tnum text-foreground">{item.qty}</span>
          </span>
          <span>
            Due{" "}
            <span className="tnum text-foreground">
              {formatDate(item.order.delivery_date)}
            </span>
          </span>
        </div>

        {item.is_delayed ? (
          <p className="mt-2 rounded bg-[var(--rush)]/10 px-2 py-1 text-xs text-[var(--rush)]">
            Delayed
          </p>
        ) : null}
      </button>
    </article>
  );
}
