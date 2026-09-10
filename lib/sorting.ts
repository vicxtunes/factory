import type { OrderItemWithOrder, OrderType } from "@/lib/types";

// The floor works its queue from the BOTTOM up — the oldest order is the next
// job. So the display stacks newest on top, oldest at the bottom, and express
// orders sink below the normal ones (still "jump the queue": they're worked
// first because they're nearest the bottom). Urgency drives the badge colour,
// not the position. One policy, used by every board: factory, display screen,
// dashboard list + table.
const ORDER_TYPE_RANK: Record<OrderType, number> = {
  normal: 0, // normal orders sit above…
  express: 1, // …express, which sinks to the bottom to be worked first
};

function compareForDisplay(a: OrderItemWithOrder, b: OrderItemWithOrder): number {
  const byType = ORDER_TYPE_RANK[a.order.order_type] - ORDER_TYPE_RANK[b.order.order_type];
  if (byType !== 0) return byType;

  // Newest first: a later created_at sorts earlier (higher up the list).
  return b.created_at.localeCompare(a.created_at);
}

export function sortItems<T extends OrderItemWithOrder>(items: T[]): T[] {
  return [...items].sort(compareForDisplay);
}

// Kept as a separate name for the dashboard list/table call sites; same policy.
export function sortOrderListItems<T extends OrderItemWithOrder>(items: T[]): T[] {
  return [...items].sort(compareForDisplay);
}
