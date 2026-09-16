import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { notifyActor } from "@/lib/push/send";
import type { AuditActorType, NotificationEvent } from "@/lib/types";

// Order-lifecycle notifications aimed at a specific person (as opposed to
// the DB trigger on order_items, which logs completed/delayed untargeted —
// see notify_on_item_change in supabase/schema.sql — and is already picked
// up correctly by every recipient-scoped feed via a join on the item's
// current assignment, e.g. lib/queries.ts's fetchWorkerNotifications).
//
// Always writes a system (in-app) notification row — best-effort, never
// blocks the caller. Also sends a push, but only if the recipient actually
// has a push_subscriptions row; notifyActor() no-ops silently otherwise, so
// callers never need to check "do they have push" themselves.
export async function notifyOrderItem(params: {
  orderItemId: string;
  eventType: NotificationEvent;
  message: string;
  recipient: { type: AuditActorType; id: string };
  pushTitle: string;
  url?: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("notifications").insert({
      order_item_id: params.orderItemId,
      event_type: params.eventType,
      message: params.message,
    });
    if (error) console.error("notifyOrderItem insert failed:", error.message);
  } catch (err) {
    console.error("notifyOrderItem insert threw:", err);
  }

  await notifyActor(params.recipient, {
    title: params.pushTitle,
    body: params.message,
    url: params.url,
  });
}

// Push-only variant for events the DB trigger already logs as a system
// notification (completed, delayed) — avoids a duplicate untargeted +
// targeted pair of rows for the same event.
export async function pushOnlyOrderItem(
  recipient: { type: AuditActorType; id: string },
  payload: { title: string; body: string; url?: string },
): Promise<void> {
  await notifyActor(recipient, payload);
}
