"use client";

import { UrgencyBadge } from "@/components/ui/UrgencyBadge";
import { statusCardClasses } from "@/components/ui/statusColors";
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
  const isExpress = item.order.order_type === "express";

  return (
    <button
      onClick={onOpen}
      className={`w-full rounded-[var(--radius)] border border-l-4 border-border bg-surface p-3 text-left text-sm shadow-theme-xs transition-colors hover:bg-background ${statusCardClasses(item.production_status, item.is_delayed)}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold tnum">{item.order.order_no}</p>
          <p className="text-muted">{item.order.client_name}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <UrgencyBadge urgency={item.urgency} />
          {isExpress ? (
            <span className="rounded-full bg-error-50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-error-700 dark:bg-error-500/15 dark:text-error-400">
              Express
            </span>
          ) : null}
        </div>
      </div>

      <p className="mt-2 font-medium">{item.product}</p>

      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>{STATUS_LABELS[item.production_status]}</span>
        <span>{assignedName ?? "Unassigned"}</span>
      </div>

      {item.stage === "with_designer" ? (
        <p className="mt-2 rounded bg-brand-500/10 px-2 py-1 text-xs text-brand-600">
          With designer{item.order.designer_name ? `: ${item.order.designer_name}` : ""}
        </p>
      ) : null}

      {item.is_delayed ? (
        <p className="mt-2 rounded bg-[var(--rush)]/10 px-2 py-1 text-xs text-[var(--rush)]">
          Delayed
        </p>
      ) : null}
    </button>
  );
}
