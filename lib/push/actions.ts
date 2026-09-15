"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveActor } from "@/lib/audit/log";

type Result = { ok: true } | { ok: false; error: string };

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// Any signed-in surface may opt in — same boundary as support reports
// (lib/support/actions.ts). Upserts on endpoint so re-subscribing (e.g.
// after a permission reset) doesn't create duplicate rows.
export async function subscribeToPush(subscription: PushSubscriptionInput): Promise<Result> {
  const actor = await resolveActor();
  if (!actor) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const { error } = await admin.from("push_subscriptions").upsert(
    {
      subscriber_type: actor.type,
      subscriber_id: actor.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: "endpoint" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function unsubscribeFromPush(endpoint: string): Promise<Result> {
  const actor = await resolveActor();
  if (!actor) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("subscriber_type", actor.type)
    .eq("subscriber_id", actor.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Lets the opt-in UI show current state on mount without a dedicated
// "am I subscribed" table lookup key — just checks whether this actor has
// any row at all (endpoint identity lives in the browser's own
// PushManager.getSubscription(), which the client checks separately).
export async function hasPushSubscription(): Promise<boolean> {
  const actor = await resolveActor();
  if (!actor) return false;

  const admin = createAdminClient();
  const { count } = await admin
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("subscriber_type", actor.type)
    .eq("subscriber_id", actor.id);
  return (count ?? 0) > 0;
}
