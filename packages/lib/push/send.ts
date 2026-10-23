import "server-only";

import webpush from "web-push";

import { createAdminClient } from "@repo/lib/supabase/admin";
import type { AuditActorType } from "@repo/lib/types";

import { recordInbox } from "@repo/lib/notifications/inbox";

import { ensureVapidConfigured } from "./vapid";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

// Tells one actor (dashboard user / worker / designer / client, per the same
// actor-model support_reports and order_audit_log use): saves it in their
// inbox, so their bell shows it, then pushes it to every device they've
// subscribed. Best-effort: a failure never blocks the caller's real mutation,
// so errors are swallowed and logged, matching logOrderEvent()'s posture in
// packages/lib/audit/log.ts. `inbox: false` for events another feed already
// shows (order items' `notifications`, resolved support reports).
export async function notifyActor(
  actor: { type: AuditActorType; id: string },
  payload: PushPayload,
  options: { inbox?: boolean } = {},
): Promise<void> {
  if (options.inbox !== false) await recordInbox(actor, payload);
  try {
    ensureVapidConfigured();
    const admin = createAdminClient();
    const { data: subs, error } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("subscriber_type", actor.type)
      .eq("subscriber_id", actor.id);
    if (error || !subs?.length) return;

    const staleIds: string[] = [];
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify(payload),
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          // 403 (Google) / 400 VapidPkHashMismatch (Apple): made with an older key; the device makes a new one next time the app opens (usePushSubscription).
          const oldKey = statusCode === 403 || (statusCode === 400 && String((err as { body?: unknown }).body).includes("VapidPkHashMismatch"));
          if (statusCode === 404 || statusCode === 410 || oldKey) staleIds.push(sub.id);
          else console.error("push send failed:", err);
        }
      }),
    );

    if (staleIds.length) {
      await admin.from("push_subscriptions").delete().in("id", staleIds);
    }
  } catch (err) {
    console.error("notifyActor threw:", err);
  }
}
