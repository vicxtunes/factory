import type { OrderItemWithOrder, OrderType } from "@/lib/types";

const ORDER_TYPE_RANK: Record<OrderType, number> = {
  express: 0,
  normal: 1,
};

// The one display policy, used by every board (factory, display screen,
// dashboard list + table): first-come-first-served by creation time. Express
// orders — and only express orders — are allowed to jump the queue; among
// themselves they order by deadline (soonest first), then creation time.
// Urgency drives the badge colour, not the position.
function compareForDisplay(a: OrderItemWithOrder, b: OrderItemWithOrder): number {
  const byType = ORDER_TYPE_RANK[a.order.order_type] - ORDER_TYPE_RANK[b.order.order_type];
  if (byType !== 0) return byType;

  if (a.order.order_type === "express") {
    const da = a.order.deadline_at;
    const db = b.order.deadline_at;
    if (da && db && da !== db) return da.localeCompare(db);
    if (da && !db) return -1;
    if (db && !da) return 1;
  }

  return a.created_at.localeCompare(b.created_at);
}

export function sortItems<T extends OrderItemWithOrder>(items: T[]): T[] {
  return [...items].sort(compareForDisplay);
}

// Kept as a separate name for the dashboard list/table call sites; same policy.
export function sortOrderListItems<T extends OrderItemWithOrder>(items: T[]): T[] {
  return [...items].sort(compareForDisplay);
}
