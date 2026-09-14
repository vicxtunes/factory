import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getDashboardSession, getDesignerSession, getWorkerSession } from "@/lib/auth/session";
import type { AuditActorType } from "@/lib/types";

export interface AuditActor {
  type: AuditActorType;
  id: string;
  name: string;
  role?: string;
}

// Same precedence requireMediaUploadAccess() uses — any of the three signed-in
// surfaces may be the one performing an order-touching action. `id` is the
// actor's identifier in their own auth system (dashboard user id / worker id
// / designer id) — used both for audit attribution and, via lib/notes, to
// check "is this my note".
export async function resolveActor(): Promise<AuditActor | null> {
  const dashboard = await getDashboardSession();
  if (dashboard) {
    return {
      type: "dashboard_user",
      id: dashboard.userId,
      name: dashboard.fullName || dashboard.email || "Dashboard user",
      role: dashboard.role,
    };
  }
  const designer = await getDesignerSession();
  if (designer) return { type: "designer", id: designer.designer_id, name: designer.name };

  const worker = await getWorkerSession();
  if (worker) return { type: "worker", id: worker.worker_id, name: worker.name };

  return null;
}

// Appends one line to an order's "Show logs" timeline. Best-effort: a logging
// failure must never block the real mutation it's attached to, so errors are
// swallowed (and reported to the server console for debugging) rather than
// thrown or returned to the caller.
export async function logOrderEvent(params: {
  orderId: string;
  orderItemId?: string | null;
  actor: AuditActor | null;
  action: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  if (!params.actor) return;

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("order_audit_log").insert({
      order_id: params.orderId,
      order_item_id: params.orderItemId ?? null,
      actor_type: params.actor.type,
      actor_name: params.actor.name,
      actor_role: params.actor.role ?? null,
      action: params.action,
      detail: params.detail ?? {},
    });
    if (error) console.error("order_audit_log insert failed:", error.message);
  } catch (err) {
    console.error("order_audit_log insert threw:", err);
  }
}
