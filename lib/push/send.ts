import "server-only";

import webpush from "web-push";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AuditActorType } from "@/lib/types";

import { ensureVapidConfigured } from "./vapid";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

// Sends a push to every subscription belonging to one actor (dashboard
// user / worker / designer, per the same actor-model support_reports and
// order_audit_log use). Best-effort: a delivery failure never blocks the
// caller's real mutation, so errors are swallowed and logged, matching
// logOrderEvent()'s posture in lib/audit/log.ts.
export async function notifyActor(
  actor: { type: AuditActorType; id: string },
  payload: PushPayload,
): Promise<void> {
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
          if (statusCode === 404 || statusCode === 410) staleIds.push(sub.id);
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
