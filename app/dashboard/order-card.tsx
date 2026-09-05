"use client";

import { UrgencyBadge } from "@/components/ui/UrgencyBadge";
import { STATUS_LABELS, type OrderItemWithOrder } from "@/lib/types";

export function OrderCard({
  item,
  assignedName,
  onOpen,
}: {
  item: OrderItemWithOrder;
  assignedName: string | null;
  onOpen: () => void;
}) {
  return (
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
        <span>{STATUS_LABELS[item.production_status]}</span>
        <span>{assignedName ?? "Unassigned"}</span>
      </div>

      {item.is_delayed ? (
        <p className="mt-2 rounded bg-[var(--rush)]/10 px-2 py-1 text-xs text-[var(--rush)]">
          Delayed
        </p>
      ) : null}
    </button>
  );
}
