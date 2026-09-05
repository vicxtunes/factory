import type { OrderItemWithOrder, Urgency } from "@/lib/types";

const URGENCY_RANK: Record<Urgency, number> = {
  rush: 0,
  urgent: 1,
  normal: 2,
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
