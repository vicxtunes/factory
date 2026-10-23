"use server";

import { logOrderEvent, resolveActor } from "@repo/lib/audit/log";
import { announceOrderCollected } from "@repo/lib/chat/orders";
import { createAdminClient } from "@repo/lib/supabase/admin";

type Result = { ok: true } | { ok: false; error: string };

// "Confirm received" on the ready-for-pickup card in an order's chat: the
// client says they've collected it, so its ready items are marked delivered,
// as staff would. Only the order's own client, and only items that are ready.
export async function confirmOrderCollected(orderId: string): Promise<Result> {
  const actor = await resolveActor();
  if (actor?.type !== "client") return { ok: false, error: "Only the client can confirm they received the order." };

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, client_id, cancelled_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.client_id !== actor.id) return { ok: false, error: "Order not found." };
  if (order.cancelled_at) return { ok: false, error: "This order was cancelled." };

  const { data: collected, error } = await admin
    .from("order_items")
    .update({ production_status: "completed" })
    .eq("order_id", orderId)
    .eq("production_status", "ready_for_pickup")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!collected?.length) return { ok: false, error: "Nothing on this order is waiting for pickup." };

  await logOrderEvent({ orderId, actor, action: "order_collected", detail: { count: collected.length } });
  await announceOrderCollected(orderId, actor.name, collected.length);
  return { ok: true };
}
