"use client";

import { UrgencyBadge } from "@/components/ui/UrgencyBadge";
import { STATUS_LABELS, type OrderItemWithOrder } from "@/lib/types";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const HEAD = "px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted";
const CELL = "px-3 py-2 align-top";

export function OrderItemsTable({
  items,
  workerName,
  onOpen,
}: {
  items: OrderItemWithOrder[];
  workerName: (id: string | null) => string;
  onOpen: (itemId: string) => void;
}) {
  return (
    <div className="max-w-full overflow-x-auto rounded-2xl border border-border bg-surface shadow-theme-xs">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className={HEAD}>Order</th>
            <th className={HEAD}>Client</th>
            <th className={HEAD}>Product</th>
            <th className={`${HEAD} text-right`}>Qty</th>
            <th className={HEAD}>Due</th>
            <th className={HEAD}>Urgency</th>
            <th className={HEAD}>Status</th>
            <th className={HEAD}>Worker</th>
            <th className={HEAD}>Stage</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((i) => (
            <tr
              key={i.id}
              onClick={() => onOpen(i.id)}
              className="cursor-pointer hover:bg-background"
            >
              <td className={`${CELL} whitespace-nowrap font-medium tnum`}>
                {i.order.order_no}
                {i.order.order_type === "express" ? (
                  <span className="ml-1 rounded bg-[var(--rush)]/10 px-1 text-[0.65rem] font-semibold text-[var(--rush)]">
                    EXP
                  </span>
                ) : null}
              </td>
              <td className={CELL}>{i.order.client_name}</td>
              <td className={CELL}>
                {i.product}
                {i.product_type ? (
                  <span className="block text-xs text-muted">{i.product_type}</span>
                ) : null}
              </td>
              <td className={`${CELL} text-right tnum`}>{i.qty}</td>
              <td className={`${CELL} whitespace-nowrap tnum`}>
                {formatDate(i.order.delivery_date)}
              </td>
              <td className={CELL}>
                <UrgencyBadge urgency={i.urgency} />
              </td>
              <td className={`${CELL} whitespace-nowrap`}>{STATUS_LABELS[i.production_status]}</td>
              <td className={CELL}>{workerName(i.assigned_worker_id)}</td>
              <td className={`${CELL} whitespace-nowrap`}>
                {i.stage === "with_designer" ? "With designer" : "Factory"}
                {i.is_delayed ? (
                  <span className="ml-1 text-xs font-medium text-[var(--rush)]">· Delayed</span>
                ) : null}
              </td>
            </tr>
          ))}
          {items.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-3 py-6 text-center text-muted">
                No items match these filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
