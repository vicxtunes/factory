import "server-only";

import { logOrderEvent, type AuditActor } from "@repo/lib/audit/log";
import { postOrderCard } from "@repo/lib/chat/orders";
import { chatHref } from "@repo/lib/chat/routes";
import { clientPath } from "@repo/lib/client-portal/paths";
import { formatMoney } from "@repo/lib/currency/format";
import { notifyOrderItem } from "@repo/lib/notifications/notify";
import { fetchBaseCurrencySymbol } from "@repo/lib/queries";
import { createAdminClient } from "@repo/lib/supabase/admin";

// Takes in a client's order: approved, its "received" card in the chat, and the
// client told. For reception (receiveClientOrder) and the assistant. Callers
// check who may do it.
export async function receiveOrder(
  orderId: string,
  actor: AuditActor | null,
  price?: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (price !== undefined && (!Number.isFinite(price) || price <= 0)) {
    return { ok: false, error: "Enter a valid price." };
  }

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, approval_status, released_at, order_no, client_id, cancelled_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Order not found." };
  if (order.cancelled_at) return { ok: false, error: "This order was cancelled." };
  // Any unsent order can be confirmed, including ones left mid-way in the old
  // quote/approval flow.
  if (order.released_at) return { ok: false, error: "This order was already sent to production." };

  const { error } = await admin
    .from("orders")
    .update(price !== undefined ? { approval_status: "approved", quoted_price: price } : { approval_status: "approved" })
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  await logOrderEvent({ orderId, actor, action: "order_received", detail: price !== undefined ? { price } : {} });

  // The order's chat with the client gets Aming's "received" card (pay,
  // attach a receipt, invoice), and the client's notification opens it.
  if (order.client_id) {
    const conversationId = await postOrderCard(orderId, "received");
    const { data: firstItem } = await admin
      .from("order_items")
      .select("id")
      .eq("order_id", orderId)
      .limit(1)
      .maybeSingle();
    if (firstItem) {
      await notifyOrderItem({
        orderItemId: firstItem.id,
        eventType: "quote_ready",
        message:
          price !== undefined
            ? `Order ${order.order_no} is confirmed — ${formatMoney(price, await fetchBaseCurrencySymbol())}. Open it to see how to pay.`
            : `Order ${order.order_no} has been received. Open it to see how to pay.`,
        recipient: { type: "client", id: order.client_id },
        pushTitle: "Order confirmed",
        url: clientPath(conversationId ? chatHref(conversationId) : "/orders"),
      });
    }
  }

  return { ok: true };
}
