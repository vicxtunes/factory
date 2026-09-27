import "server-only";

// Directory adapter — the ONLY place the invoices module reads app tables
// (orders, order items, clients) or uses the app's pricing and client-status
// rules. Money (what's been paid, payment history) comes from lib/wallet.

import { CLIENT_STATUS_LABELS, clientStatus } from "@/lib/orders/clientStatus";
import { catalogUnitPrice, orderAmount } from "@/lib/orders/pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrderStage, ProductionStatus } from "@/lib/types";

import type { InvoiceLine } from "../types";

interface ItemRow {
  product: string;
  product_type: string | null;
  size: string | null;
  cover_type: string | null;
  lamination_type: string | null;
  box_type: string | null;
  qty: number;
  stage: OrderStage;
  production_status: ProductionStatus;
  assigned_worker_id: string | null;
  created_at: string;
  catalog_product: { price: number | null } | null;
  catalog_variant: { price: number | null } | null;
}

interface OrderRow {
  id: string;
  order_no: string;
  client_id: string | null;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  created_at: string;
  delivery_date: string | null;
  approval_status: string;
  quoted_price: number | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  items: ItemRow[];
}

export interface InvoiceOrder {
  id: string;
  orderNo: string;
  clientId: string | null;
  client: { name: string; phone: string | null; email: string | null };
  placedAt: string;
  deliveryDate: string | null;
  approved: boolean;
  cancelled: boolean;
  cancelReason: string | null;
  /** The order's price (what the invoice is for); null while unknown. */
  amount: number | null;
  lines: InvoiceLine[];
}

const SELECT = `
  id, order_no, client_id, client_name, client_phone, client_email, created_at, delivery_date,
  approval_status, quoted_price, cancelled_at, cancel_reason,
  items:order_items (
    product, product_type, size, cover_type, lamination_type, box_type, qty,
    stage, production_status, assigned_worker_id, created_at,
    catalog_product:products (price), catalog_variant:product_variants (price)
  )
`;

function toOrder(row: OrderRow): InvoiceOrder {
  const quoted = row.quoted_price == null ? null : Number(row.quoted_price);
  const items = [...row.items].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const { amount: rawAmount } = orderAmount(items.map((i) => ({ ...i, order: { quoted_price: quoted } })));
  const amount = rawAmount == null ? null : Math.round(rawAmount);

  // Unit prices are only shown when the total really is catalog price ×
  // quantity; a quoted total (the usual case) isn't split across lines.
  const units = items.map((i) => catalogUnitPrice(i));
  const catalogTotal = units.every((u) => u != null)
    ? Math.round(items.reduce((sum, i, idx) => sum + (units[idx] as number) * i.qty, 0))
    : null;
  const showUnits = amount != null && catalogTotal === amount;

  return {
    id: row.id,
    orderNo: row.order_no,
    clientId: row.client_id,
    client: { name: row.client_name, phone: row.client_phone, email: row.client_email },
    placedAt: row.created_at,
    deliveryDate: row.delivery_date,
    approved: row.approval_status === "approved",
    cancelled: !!row.cancelled_at,
    cancelReason: row.cancel_reason,
    amount,
    lines: items.map((i, idx) => ({
      description: i.product_type ? `${i.product} — ${i.product_type}` : i.product,
      detail: [i.size, i.cover_type, i.lamination_type, i.box_type].filter(Boolean).join(" · ") || null,
      qty: i.qty,
      unitPrice: showUnits ? Math.round(units[idx] as number) : null,
      lineTotal: showUnits ? Math.round((units[idx] as number) * i.qty) : null,
      progress: row.cancelled_at ? "Cancelled" : CLIENT_STATUS_LABELS[clientStatus(i)],
    })),
  };
}

export async function loadOrder(orderId: string): Promise<InvoiceOrder | null> {
  const { data, error } = await createAdminClient().from("orders").select(SELECT).eq("id", orderId).maybeSingle<OrderRow>();
  if (error) throw new Error(error.message);
  return data ? toOrder(data) : null;
}

export async function loadOrders(orderIds: string[]): Promise<Record<string, InvoiceOrder>> {
  if (!orderIds.length) return {};
  const { data, error } = await createAdminClient().from("orders").select(SELECT).in("id", orderIds).returns<OrderRow[]>();
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((o) => [o.id, toOrder(o)]));
}
