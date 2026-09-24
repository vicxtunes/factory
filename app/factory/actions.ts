"use server";

import { cookies } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";
import { WORKER_COOKIE, signPayload } from "@/lib/auth/cookies";
import { getWorkerSession } from "@/lib/auth/session";
import { verifyPin } from "@/lib/auth/pin";
import { logOrderEvent, resolveActor } from "@/lib/audit/log";
import { pushOnlyOrderItem, notifyOrderItem } from "@/lib/notifications/notify";
import { fetchWorkerNotifications } from "@/lib/queries";
import { BOARD_COLUMNS, STATUS_LABELS, type NotificationRow, type ProductionStatus } from "@/lib/types";

function itemLabel(item: { product: string; product_type: string | null }): string {
  return item.product_type ? `${item.product} (${item.product_type})` : item.product;
}

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // "remembered on device"

type ActionResult = { ok: true } | { ok: false; error: string };

export async function verifyWorkerPin(
  workerId: string,
  pin: string,
): Promise<ActionResult> {
  const admin = createAdminClient();
  const { data: worker } = await admin
    .from("workers")
    .select("id, name, pin_hash, active")
    .eq("id", workerId)
    .maybeSingle();

  if (!worker || !worker.active) return { ok: false, error: "Unknown worker." };
  if (!(await verifyPin(pin, worker.pin_hash))) {
    return { ok: false, error: "Incorrect PIN." };
  }

  const store = await cookies();
  store.set(
    WORKER_COOKIE,
    await signPayload({ worker_id: worker.id, name: worker.name }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    },
  );
  return { ok: true };
}

export async function logoutWorker(): Promise<void> {
  const store = await cookies();
  store.delete(WORKER_COOKIE);
}

export async function getMyNotifications(): Promise<NotificationRow[]> {
  const session = await getWorkerSession();
  if (!session) return [];
  return fetchWorkerNotifications(session.worker_id, 10);
}

// Only the worker a supervisor assigned to an item may move it through the
// queues — otherwise anyone signed in to /factory could advance/flag/clear
// work that isn't theirs.
function assertAssignedToWorker(
  item: { assigned_worker_id: string | null },
  workerId: string,
): ActionResult | null {
  if (item.assigned_worker_id !== workerId) {
    return { ok: false, error: "This item isn't assigned to you — ask a supervisor to assign it first." };
  }
  return null;
}

// Advance to the next production status (Not Started -> ... -> Ready). A
// worker's last stop is "Ready" — "Completed" only happens once the client
// has actually picked the order up at the office, which is the
// receptionist's call via the dashboard's status override (overrideStatus
// in app/dashboard/actions.ts), not something the factory floor can trigger.
export async function advanceStatus(itemId: string): Promise<ActionResult> {
  const session = await getWorkerSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const { data: item } = await admin
    .from("order_items")
    .select(
      "id, order_id, product, product_type, production_status, assigned_worker_id, order:orders!inner (order_no, client_id, cancelled_at)",
    )
    .eq("id", itemId)
    .maybeSingle<{
      id: string;
      order_id: string;
      product: string;
      product_type: string | null;
      production_status: ProductionStatus;
      assigned_worker_id: string | null;
      order: { order_no: string; client_id: string | null; cancelled_at: string | null };
    }>();
  if (!item) return { ok: false, error: "Item not found." };
  if (item.order.cancelled_at) return { ok: false, error: "This order was cancelled." };
  const forbidden = assertAssignedToWorker(item, session.worker_id);
  if (forbidden) return forbidden;

  const nextIdx = BOARD_COLUMNS.indexOf(item.production_status as ProductionStatus) + 1;
  if (nextIdx <= 0 || nextIdx >= BOARD_COLUMNS.length) {
    return { ok: false, error: "Item is ready for pickup — a receptionist marks it delivered once the client collects it." };
  }
  const nextStatus = BOARD_COLUMNS[nextIdx];

  const { error } = await admin
    .from("order_items")
    .update({
      production_status: nextStatus,
      updated_by_worker_id: session.worker_id,
    })
    .eq("id", itemId);
  if (error) return { ok: false, error: error.message };

  await logOrderEvent({
    orderId: item.order_id,
    orderItemId: itemId,
    actor: await resolveActor(),
    action: "status_advanced",
    detail: { itemLabel: itemLabel(item), to: nextStatus },
  });

  // "Ready" has no DB trigger of its own — write a real system notification.
  if (item.order.client_id && nextStatus === "ready_for_pickup") {
    await notifyOrderItem({
      orderItemId: itemId,
      eventType: "ready",
      message: `Order ${item.order.order_no}, ${itemLabel(item)}, is now ${STATUS_LABELS[nextStatus]}.`,
      recipient: { type: "client", id: item.order.client_id },
      pushTitle: "Your order is ready",
      url: "/client-side/orders",
    });
  }

  return { ok: true };
}

export async function flagDelay(
  itemId: string,
  reason: string,
): Promise<ActionResult> {
  const session = await getWorkerSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!reason.trim()) return { ok: false, error: "A delay reason is required." };

  const admin = createAdminClient();
  const { data: item } = await admin
    .from("order_items")
    .select(
      "id, order_id, product, product_type, assigned_worker_id, order:orders!inner (order_no, client_id)",
    )
    .eq("id", itemId)
    .maybeSingle<{
      id: string;
      order_id: string;
      product: string;
      product_type: string | null;
      assigned_worker_id: string | null;
      order: { order_no: string; client_id: string | null };
    }>();
  if (!item) return { ok: false, error: "Item not found." };
  const forbidden = assertAssignedToWorker(item, session.worker_id);
  if (forbidden) return forbidden;

  const trimmedReason = reason.trim();
  const { error } = await admin
    .from("order_items")
    .update({
      is_delayed: true,
      delay_reason: trimmedReason,
      updated_by_worker_id: session.worker_id,
    })
    .eq("id", itemId);
  if (error) return { ok: false, error: error.message };

  await logOrderEvent({
    orderId: item.order_id,
    orderItemId: itemId,
    actor: await resolveActor(),
    action: "delay_flagged",
    detail: { itemLabel: itemLabel(item), reason: trimmedReason },
  });

  // Delayed is already logged untargeted by the DB trigger — just push.
  if (item.order.client_id) {
    await pushOnlyOrderItem(
      { type: "client", id: item.order.client_id },
      {
        title: "Your order was delayed",
        body: `Order ${item.order.order_no}, ${itemLabel(item)}: ${trimmedReason}`,
        url: "/client-side/orders",
      },
    );
  }

  return { ok: true };
}

export async function clearDelay(itemId: string): Promise<ActionResult> {
  const session = await getWorkerSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const { data: item } = await admin
    .from("order_items")
    .select("id, order_id, product, product_type, assigned_worker_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Item not found." };
  const forbidden = assertAssignedToWorker(item, session.worker_id);
  if (forbidden) return forbidden;

  const { error } = await admin
    .from("order_items")
    .update({
      is_delayed: false,
      delay_reason: null,
      updated_by_worker_id: session.worker_id,
    })
    .eq("id", itemId);
  if (error) return { ok: false, error: error.message };

  await logOrderEvent({
    orderId: item.order_id,
    orderItemId: itemId,
    actor: await resolveActor(),
    action: "delay_cleared",
    detail: { itemLabel: itemLabel(item) },
  });
  return { ok: true };
}
