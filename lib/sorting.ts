import type { OrderItemWithOrder, OrderType, Urgency } from "@/lib/types";

const URGENCY_RANK: Record<Urgency, number> = {
  rush: 0,
  urgent: 1,
  normal: 2,
};

const ORDER_TYPE_RANK: Record<OrderType, number> = {
  express: 0,
  normal: 1,
};

// Board sort: rush -> urgent -> normal, then delivery date ascending
// (items with no delivery date sort last).
export function sortItems<T extends OrderItemWithOrder>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const byUrgency = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    if (byUrgency !== 0) return byUrgency;

    const da = a.order.delivery_date;
    const db = b.order.delivery_date;
    if (da && db) return da.localeCompare(db);
    if (da) return -1;
    if (db) return 1;
    return a.created_at.localeCompare(b.created_at);
  });
}

// Dashboard order list sort: urgency -> delivery date -> order type
// (express before normal), so items needing attention soonest surface first
// within a category group, with order type only breaking ties between
// otherwise-equal items.
export function sortOrderListItems<T extends OrderItemWithOrder>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const byUrgency = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    if (byUrgency !== 0) return byUrgency;

    const da = a.order.delivery_date;
    const db = b.order.delivery_date;
    if (da && db) {
      const byDate = da.localeCompare(db);
      if (byDate !== 0) return byDate;
    } else if (da) {
      return -1;
    } else if (db) {
      return 1;
    }

    const byType = ORDER_TYPE_RANK[a.order.order_type] - ORDER_TYPE_RANK[b.order.order_type];
    if (byType !== 0) return byType;

    return a.created_at.localeCompare(b.created_at);
  });
}
