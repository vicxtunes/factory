"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { clearAttempts, isBlocked, recordFailure, TOO_MANY_ATTEMPTS } from "@/lib/auth/attempts";
import { getGoogleIdentity, getWorkerSession } from "@/lib/auth/session";
import { verifyPin } from "@/lib/auth/pin";
import { logOrderEvent, resolveActor } from "@/lib/audit/log";
import { pushOnlyOrderItem, notifyOrderItem } from "@/lib/notifications/notify";
import { fetchWorkerNotifications } from "@/lib/queries";
import { BOARD_COLUMNS, STATUS_LABELS, type NotificationRow, type ProductionStatus } from "@/lib/types";

function itemLabel(item: { product: string; product_type: string | null }): string {
  return item.product_type ? `${item.product} (${item.product_type})` : item.product;
}

type ActionResult = { ok: true } | { ok: false; error: string };

// Step 2 of "Continue with Google" for an existing worker: they've signed in
// with Google, now they pick their name and enter their old PIN *once* to
// prove it's them, and the Google account is attached to that worker. After
// this the PIN is never used again — only Google signs them in.
export async function linkWorkerAccount(workerId: string, pin: string): Promise<ActionResult> {
  const google = await getGoogleIdentity();
  if (!google) return { ok: false, error: "Please sign in with Google first." };

  const admin = createAdminClient();
  const { data: existingLink } = await admin
    .from("worker_identities")
    .select("worker_id")
    .eq("auth_user_id", google.userId)
    .maybeSingle();
  if (existingLink) return { ok: true }; // already linked; never re-point a link

  const keys = [`worker:${workerId}`, `user:${google.userId}`];
  if (await isBlocked(keys)) return { ok: false, error: TOO_MANY_ATTEMPTS };

  const { data: worker } = await admin
    .from("workers")
    .select("id, pin_hash, active")
    .eq("id", workerId)
    .maybeSingle();
  if (!worker || !worker.active) return { ok: false, error: "Unknown worker." };

  const { data: taken } = await admin
    .from("worker_identities")
    .select("auth_user_id")
    .eq("worker_id", workerId)
    .maybeSingle();
  if (taken) {
    return { ok: false, error: "This worker is already connected to a Google account — ask a supervisor to reset it." };
  }

  if (!worker.pin_hash || !(await verifyPin(pin, worker.pin_hash))) {
    await recordFailure(keys);
    return { ok: false, error: "Incorrect PIN." };
  }

  const { error } = await admin
    .from("worker_identities")
    .insert({ auth_user_id: google.userId, worker_id: workerId });
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, error: "This worker is already connected to a Google account — ask a supervisor to reset it." };
    }
    return { ok: false, error: error.message };
  }
  await clearAttempts(keys);
  return { ok: true };
}

// "I'm not on the list": a signed-in Google user who isn't an existing worker
// asks to be added. A supervisor/boss approves it from the dashboard's
// Workers page; until then they have no access.
export async function requestWorkerAccess(input: {
  name: string;
  phone?: string;
  note?: string;
}): Promise<ActionResult> {
  const google = await getGoogleIdentity();
  if (!google) return { ok: false, error: "Please sign in with Google first." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Please enter your name." };

  const admin = createAdminClient();
  const { data: linked } = await admin
    .from("worker_identities")
    .select("worker_id")
    .eq("auth_user_id", google.userId)
    .maybeSingle();
  if (linked) return { ok: true };

  const { error } = await admin.from("worker_access_requests").insert({
    auth_user_id: google.userId,
    email: google.email,
    name,
    phone: input.phone?.trim() || null,
    note: input.note?.trim() || null,
  });
  // 23505: they already have a pending request — treat as success.
  if (error && (error as { code?: string }).code !== "23505") return { ok: false, error: error.message };
  return { ok: true };
}

export async function logoutWorker(): Promise<void> {
  if (await getGoogleIdentity()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
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
      "id, order_id, product, product_type, production_status, assigned_worker_id, order:orders!inner (order_no, client_id)",
    )
    .eq("id", itemId)
    .maybeSingle<{
      id: string;
      order_id: string;
      product: string;
      product_type: string | null;
      production_status: ProductionStatus;
      assigned_worker_id: string | null;
      order: { order_no: string; client_id: string | null };
    }>();
  if (!item) return { ok: false, error: "Item not found." };
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
