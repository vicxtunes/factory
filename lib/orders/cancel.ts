import "server-only";

import { revalidatePath } from "next/cache";

import { logOrderEvent, type AuditActor } from "@/lib/audit/log";
import { notifyOrderItem, pushOnlyOrderItem } from "@/lib/notifications/notify";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true } | { ok: false; error: string };

export interface CancellableOrder {
  id: string;
  order_no: string;
  client_id: string | null;
  released_at: string | null;
  cancelled_at: string | null;
  assigned_designer_id: string | null;
}

// Shared by both cancel paths — the client's (app/client-side/actions.ts,
// only before the order is confirmed) and the boss's (app/dashboard/actions.ts,
// any time until it's completed). Each caller does its own permission check
// first; this just loads the order, records the cancellation, logs it, and
// tells whoever was working on it.
export async function loadCancellableOrder(orderId: string) {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, order_no, client_id, released_at, cancelled_at, assigned_designer_id")
    .eq("id", orderId)
    .maybeSingle<CancellableOrder>();
  const { data: items } = await admin
    .from("order_items")
    .select("id, production_status, assigned_worker_id")
    .eq("order_id", orderId);
  return { order, items: items ?? [] };
}

export function cleanReason(reason: string): string | null {
  const trimmed = reason.trim();
  return trimmed.length >= 3 ? trimmed.slice(0, 500) : null;
}

export async function applyCancellation(params: {
  order: CancellableOrder;
  items: { id: string; assigned_worker_id: string | null }[];
  reason: string;
  actor: AuditActor;
  // Who to tell. The client is told when the boss cancels; staff are told
  // when the client cancels.
  notifyClient: boolean;
}): Promise<Result> {
  const { order, items, reason, actor } = params;
  const admin = createAdminClient();

  // Only flip a still-live order, so two people cancelling at once can't
  // overwrite each other's reason.
  const { data: updated, error } = await admin
    .from("orders")
    .update({
      cancelled_at: new Date().toISOString(),
      cancel_reason: reason,
      cancelled_by_name: actor.name,
      cancelled_by_type: actor.type,
    })
    .eq("id", order.id)
    .is("cancelled_at", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated?.length) return { ok: false, error: "This order was already cancelled." };

  await logOrderEvent({ orderId: order.id, actor, action: "order_cancelled", detail: { reason } });

  // Notification feeds are item-scoped and each recipient's feed joins
  // through the order, so one in-app row (anchored on any item, same trick
  // as quoteOrder in app/dashboard/actions.ts) shows up for the client and
  // designer alike — one row per recipient would duplicate it in the client's
  // feed. Everyone affected also gets a push.
  const anchor = items[0]?.id;
  if (anchor) {
    const message = `Order ${order.order_no} was cancelled — "${reason}"`;
    const recipients: { type: "client" | "designer" | "worker"; id: string; url: string }[] = [];
    if (params.notifyClient && order.client_id) {
      recipients.push({ type: "client", id: order.client_id, url: "/client-side/history" });
    }
    if (order.released_at && order.assigned_designer_id) {
      recipients.push({ type: "designer", id: order.assigned_designer_id, url: "/graphics" });
    }
    for (const workerId of new Set(items.map((i) => i.assigned_worker_id).filter((w): w is string => !!w))) {
      recipients.push({ type: "worker", id: workerId, url: "/factory" });
    }
    const [first, ...rest] = recipients;
    if (first) {
      await notifyOrderItem({
        orderItemId: anchor,
        eventType: "cancelled",
        message,
        recipient: { type: first.type, id: first.id },
        pushTitle: "Order cancelled",
        url: first.url,
      });
    } else {
      // Nobody downstream to push to (e.g. a client cancelling before it was
      // confirmed) — still log it so it shows in the dashboard's bell.
      await admin.from("notifications").insert({ order_item_id: anchor, event_type: "cancelled", message });
    }
    await Promise.all(
      rest.map((r) =>
        pushOnlyOrderItem({ type: r.type, id: r.id }, { title: "Order cancelled", body: message, url: r.url }),
      ),
    );
  }

  for (const path of [
    "/dashboard",
    "/dashboard/orders",
    "/dashboard/order-approvals",
    "/factory",
    "/graphics",
    "/display",
    "/client-side",
    "/client-side/orders",
    "/client-side/history",
  ]) {
    revalidatePath(path);
  }
  return { ok: true };
}
