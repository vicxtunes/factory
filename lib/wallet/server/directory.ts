import "server-only";

// Directory adapter — the ONLY place the wallet module reads app tables
// (orders, clients), uses the app's pricing rule (lib/orders/pricing.ts), or
// writes the order audit log.

import { logOrderEvent } from "@/lib/audit/log";
import type { Offer } from "@/lib/discounts/core/model";
import { orderAmount } from "@/lib/orders/pricing";
import { createAdminClient } from "@/lib/supabase/admin";

import { WalletError } from "./errors";
import type { WalletActor } from "./identity";

export interface WalletOrder {
  id: string;
  orderNo: string;
  clientId: string | null;
  approvalStatus: string;
  cancelledAt: string | null;
  /** Staff's price, or one fixed earlier by a payment. */
  quotedPrice: number | null;
  /** What the client is asked to pay now (lib/orders/pricing.ts); null when unknown. */
  amount: number | null;
}

interface OrderRow {
  id: string;
  order_no: string;
  client_id: string | null;
  approval_status: string;
  cancelled_at: string | null;
  quoted_price: number | null;
  items: {
    qty: number;
    offer: Offer | null;
    catalog_product: { price: number | null } | null;
    catalog_variant: { price: number | null } | null;
  }[];
}

export async function loadOrder(orderId: string): Promise<WalletOrder | null> {
  const { data, error } = await createAdminClient()
    .from("orders")
    .select(
      "id, order_no, client_id, approval_status, cancelled_at, quoted_price, items:order_items (qty, offer:item_offer, catalog_product:products (price), catalog_variant:product_variants (price))",
    )
    .eq("id", orderId)
    .maybeSingle<OrderRow>();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const quoted = data.quoted_price == null ? null : Number(data.quoted_price);
  const { amount } = orderAmount(
    data.items.map((i) => ({ ...i, order: { quoted_price: quoted } })),
  );
  return {
    id: data.id,
    orderNo: data.order_no,
    clientId: data.client_id,
    approvalStatus: data.approval_status,
    cancelledAt: data.cancelled_at,
    quotedPrice: quoted,
    // UGX amounts are whole shillings; the ledger stores integers.
    amount: amount == null ? null : Math.round(amount),
  };
}

/**
 * Makes sure the order's price is stored on the order (orders.quoted_price)
 * before money is taken for it. An order priced from the catalog would
 * otherwise change price if the catalog did — after the client had paid.
 * Only fills an empty price, so it never overwrites one staff set.
 */
export async function fixOrderPrice(order: WalletOrder): Promise<void> {
  if (order.quotedPrice != null) return;
  if (order.amount == null) throw new WalletError("This order's price isn't set yet.");
  const { error } = await createAdminClient()
    .from("orders")
    .update({ quoted_price: order.amount })
    .eq("id", order.id)
    .is("quoted_price", null);
  if (error) throw new Error(error.message);
}

export interface ClientInfo {
  id: string;
  name: string;
  phone: string | null;
}

export async function loadClient(clientId: string): Promise<ClientInfo | null> {
  const { data, error } = await createAdminClient()
    .from("clients")
    .select("id, name, phone")
    .eq("id", clientId)
    .maybeSingle<ClientInfo>();
  if (error) throw new Error(error.message);
  return data;
}

export async function loadClients(clientIds: string[]): Promise<Record<string, ClientInfo>> {
  if (!clientIds.length) return {};
  const { data, error } = await createAdminClient().from("clients").select("id, name, phone").in("id", clientIds);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((c) => [c.id, c as ClientInfo]));
}

/**
 * One line on the order's "Show logs" timeline. Best-effort, like every
 * audit write. The audit log only knows people, so "system" moves (e.g. a
 * future provider webhook) aren't logged here — the wallet ledger has them.
 */
export async function logOnOrder(
  orderId: string,
  actor: WalletActor,
  action: "wallet_payment" | "wallet_refund" | "order_payment_received",
  detail: Record<string, unknown>,
): Promise<void> {
  if (actor.type === "system" || !actor.id) return;
  await logOrderEvent({
    orderId,
    actor: { type: actor.type, id: actor.id, name: actor.name, role: "role" in actor ? String(actor.role) : undefined },
    action,
    detail,
  });
}
