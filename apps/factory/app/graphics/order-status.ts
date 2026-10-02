// The designer board's rules, kept apart from the UI so the board, the cards
// and the detail drawer all agree: which tab an order sits in, when it's due,
// whether it's late, and what order the list is in.

import { isFinishedStatus, type OrderItemWithOrder, type OrderType } from "@repo/lib/types";

/** One order on the designer board — its items grouped back together. */
export interface DesignerOrder {
  orderId: string;
  orderNo: string;
  clientName: string;
  orderType: OrderType;
  deadlineAt: string | null;
  deliveryDate: string | null;
  brief: string | null;
  createdAt: string;
  items: OrderItemWithOrder[];
}

export type OrderPhase = "in_design" | "submitted" | "completed";

// Same finished rule as the dashboard board: once every item is Ready or
// Delivered the order is "completed" (still editable until the factory
// completes each item, so a late mistake can be fixed). Before that it's
// "in_design" while any item is still with the designer — a partly-sent
// order still has work left — and "submitted" once every item has gone to
// the factory.
export function phaseOf(order: DesignerOrder): OrderPhase {
  if (order.items.every((i) => isFinishedStatus(i.production_status))) return "completed";
  if (order.items.some((i) => i.stage === "with_designer")) return "in_design";
  return "submitted";
}

export function sentCount(order: DesignerOrder): number {
  return order.items.filter((i) => i.stage === "factory").length;
}

/**
 * When the order is due, as a timestamp. Express orders carry an exact
 * deadline; normal orders a delivery date, due by the end of that day.
 */
export function dueAt(order: DesignerOrder): number | null {
  if (order.deadlineAt) return new Date(order.deadlineAt).getTime();
  if (order.deliveryDate) return new Date(`${order.deliveryDate}T23:59:59`).getTime();
  return null;
}

/** Past due and not finished yet. */
export function isLate(order: DesignerOrder, now: number): boolean {
  const due = dueAt(order);
  return due !== null && due < now && phaseOf(order) !== "completed";
}

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Due today", "Due tomorrow", "Due in 3 days", "2 days late", … */
export function dueLabel(order: DesignerOrder, now: number): string {
  const due = dueAt(order);
  if (due === null) return "No due date";
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY);
  if (due < now) {
    if (days >= 0) return order.deadlineAt ? "Deadline passed" : "Due today";
    return `${-days} day${days === -1 ? "" : "s"} late`;
  }
  if (days === 0) return order.deadlineAt ? `Due today, ${formatTime(due)}` : "Due today";
  if (days === 1) return "Due tomorrow";
  if (days < 7) return `Due in ${days} days`;
  return `Due ${new Date(due).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function formatTime(t: number): string {
  return new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// Work tabs: soonest due first (express before normal on a tie), undated
// orders last. Completed: newest first — it's a history, not a queue.
export function sortForPhase(orders: DesignerOrder[], completed: boolean): DesignerOrder[] {
  if (completed) return [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return [...orders].sort((a, b) => {
    const da = dueAt(a) ?? Infinity;
    const db = dueAt(b) ?? Infinity;
    if (da !== db) return da - db;
    if (a.orderType !== b.orderType) return a.orderType === "express" ? -1 : 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}
