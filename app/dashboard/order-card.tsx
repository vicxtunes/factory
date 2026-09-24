"use client";

import { NoteBadge } from "@/components/order/NoteBadge";
import { StatusGlowBadge } from "@/components/ui/StatusGlowBadge";
import { UrgencyBadge } from "@/components/ui/UrgencyBadge";
import { statusCardClasses } from "@/components/ui/statusColors";
import type { OrderItemWithOrder } from "@/lib/types";

function formatCreatedAt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

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
  const orderNotes = item.order.order_notes.filter((n) => n.order_item_id === null);

  return (
    <article
      className={`relative rounded-[var(--radius)] border border-l-4 border-border bg-surface shadow-theme-xs transition-colors ${statusCardClasses(item.production_status, item.is_delayed)}`}
    >
      <button
        onClick={onOpen}
        className="w-full rounded-[var(--radius)] p-3 pr-11 text-left text-sm hover:bg-background"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-base font-semibold leading-tight">{item.order.client_name}</p>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <UrgencyBadge urgency={item.urgency} />
            {isExpress ? (
              <span className="rounded-full bg-error-50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-error-700 dark:bg-error-500/15 dark:text-error-400">
                Express
              </span>
            ) : null}
          </div>
        </div>

        <p className="mt-2 font-medium">{item.product}</p>
        <p className="mt-0.5 tnum text-xs text-muted">Created {formatCreatedAt(item.created_at)}</p>

        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
          {item.order.cancelled_at ? (
            <span className="rounded-full bg-error-50 px-2.5 py-0.5 text-xs font-medium text-error-700 dark:bg-error-500/15 dark:text-error-400">
              Cancelled
            </span>
          ) : (
            <StatusGlowBadge status={item.production_status} isDelayed={item.is_delayed} />
          )}
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

      {orderNotes.length + item.item_notes.length > 0 ? (
        <div className="absolute right-2.5 top-2.5">
          <NoteBadge orderNotes={orderNotes} itemNotes={item.item_notes} />
        </div>
      ) : null}
    </article>
  );
}
