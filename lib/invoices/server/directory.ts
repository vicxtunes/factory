import "server-only";

// Directory adapter — the ONLY place the invoices module reads app tables
// (orders, order items, clients) or uses the app's pricing and client-status
// rules. Money (what's been paid, payment history) comes from lib/wallet.

import { CLIENT_STATUS_LABELS, clientStatus } from "@/lib/orders/clientStatus";
import { catalogUnitPrice, estimateUnitPrice, orderAmount } from "@/lib/orders/pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrderStage, ProductionStatus } from "@/lib/types";

import type { DraftLine, InvoiceLine } from "../types";

interface ItemRow {
  id: string;
  product: string;
  product_type: string | null;
  size: string | null;
  cover_type: string | null;
  lamination_type: string | null;
  box_type: string | null;
  qty: number;
  unit_price: number | null;
  unit: string | null;
  stage: OrderStage;
  production_status: ProductionStatus;
  assigned_worker_id: string | null;
  created_at: string;
  catalog_product: { price: number | null; description: string | null; unit: string | null } | null;
  catalog_variant: { price: number | null } | null;
  category: { name: string } | null;
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
  /** Lines for the staff price editor: agreed price, else catalog price, else empty. */
  draftLines: DraftLine[];
  /**
   * Lines for a pro forma (before invoicing): the agreed price if staff set
   * one, else the catalog price — except photo books, which are only priced
   * after the client has been called, so they stay "To be confirmed".
   */
  proformaLines: InvoiceLine[];
  /** Whether the order is still in the quote step (not yet approved). */
  unconfirmed: boolean;
  /** A price staff set on the order (their quote), if any. */
  quotedPrice: number | null;
}

const SELECT = `
  id, order_no, client_id, client_name, client_phone, client_email, created_at, delivery_date,
  approval_status, quoted_price, cancelled_at, cancel_reason,
  items:order_items (
    id, product, product_type, size, cover_type, lamination_type, box_type, qty, unit_price, unit,
    stage, production_status, assigned_worker_id, created_at,
    catalog_product:products (price, description, unit), catalog_variant:product_variants (price),
    category:product_categories (name)
  )
`;

function toOrder(row: OrderRow): InvoiceOrder {
  const quoted = row.quoted_price == null ? null : Number(row.quoted_price);
  const items = [...row.items].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const { amount: rawAmount } = orderAmount(items.map((i) => ({ ...i, order: { quoted_price: quoted } })));

  // Like the business's invoices: the product name in bold, the variant
  // ("Extra ordinary finishing") and options on the line under it.
  const title = (i: ItemRow) => i.product;
  const detail = (i: ItemRow) =>
    [i.product_type, i.size, i.cover_type, i.lamination_type, i.box_type].filter(Boolean).join(" · ") || null;
  const unit = (i: ItemRow) => i.unit ?? i.catalog_product?.unit ?? null;
  const catalog = (i: ItemRow) => {
    const price = catalogUnitPrice(i);
    return price == null ? null : Math.round(price);
  };

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
    amount: rawAmount == null ? null : Math.round(rawAmount),
    lines: items.map((i) => {
      const price = i.unit_price == null ? null : Number(i.unit_price);
      return {
        itemId: i.id,
        title: title(i),
        detail: detail(i),
        description: i.catalog_product?.description ?? null,
        qty: i.qty,
        unit: unit(i),
        unitPrice: price,
        lineTotal: price == null ? null : price * i.qty,
        progress: row.cancelled_at ? "Cancelled" : CLIENT_STATUS_LABELS[clientStatus(i)],
      };
    }),
    unconfirmed: row.approval_status !== "approved",
    quotedPrice: quoted,
    proformaLines: items.map((i) => {
      // Same rule as the client's order cards (lib/orders/pricing.ts).
      const estimate = estimateUnitPrice(i);
      const price = estimate == null ? null : Math.round(estimate);
      return {
        itemId: i.id,
        title: title(i),
        detail: detail(i),
        description: i.catalog_product?.description ?? null,
        qty: i.qty,
        unit: unit(i),
        unitPrice: price,
        lineTotal: price == null ? null : price * i.qty,
        progress: row.cancelled_at ? "Cancelled" : CLIENT_STATUS_LABELS[clientStatus(i)],
      };
    }),
    draftLines: items.map((i) => ({
      itemId: i.id,
      title: title(i),
      detail: detail(i),
      qty: i.qty,
      unit: unit(i),
      unitPrice: i.unit_price != null ? Number(i.unit_price) : catalog(i),
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
