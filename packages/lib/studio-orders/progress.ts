// Aming's order rows → a LinkedOrder: the one place that turns Aming's item
// statuses into progress words, the same ones the client sees in My Orders
// (packages/lib/orders/clientStatus.ts). Pure; tested in ./progress.test.ts.

import { CLIENT_STATUS_LABELS, clientStatus, type ClientStatus } from "@repo/lib/orders/clientStatus";
import type { OrderStage, ProductionStatus } from "@repo/lib/types";

import type { LinkedOrder } from "./core/model";

export interface ItemRow {
  product: string;
  qty: number;
  production_status: ProductionStatus;
  stage: OrderStage;
  assigned_worker_id: string | null;
}

export interface OrderRow {
  id: string;
  order_no: string;
  created_at: string;
  delivery_date: string | null;
  cancelled_at: string | null;
  items: ItemRow[];
}

/** One project_orders row with its project and order embedded. */
export interface LinkRow {
  project: { id: string; title: string } | null;
  order: OrderRow | null;
}

/** How far along each client status is; designing and production are the same step. */
const RANK: Record<ClientStatus, number> = {
  pending: 0,
  received: 1,
  in_designing: 2,
  production: 2,
  quality_check: 3,
  ready_for_delivery: 4,
  delivered: 5,
};

export function toLinked(row: LinkRow): LinkedOrder | null {
  const o = row.order;
  if (!o || !row.project) return null;
  const statuses = o.items.map(clientStatus);
  const slowest = statuses.reduce<ClientStatus | null>((min, s) => (min === null || RANK[s] < RANK[min] ? s : min), null);
  const cancelled = o.cancelled_at !== null;
  return {
    orderId: o.id,
    orderNo: o.order_no,
    placedAt: o.created_at,
    deliveryDate: o.delivery_date,
    items: o.items.map((item, i) => ({ product: item.product, qty: item.qty, progress: CLIENT_STATUS_LABELS[statuses[i]] })),
    progress: cancelled ? "Cancelled" : slowest ? CLIENT_STATUS_LABELS[slowest] : "Pending",
    finished: !cancelled && statuses.length > 0 && statuses.every((s) => s === "delivered"),
    cancelled,
    projectId: row.project.id,
    projectTitle: row.project.title,
  };
}
