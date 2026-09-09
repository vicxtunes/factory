"use server";

import { cookies } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";
import { WORKER_COOKIE, signPayload } from "@/lib/auth/cookies";
import { getWorkerSession } from "@/lib/auth/session";
import { verifyPin } from "@/lib/auth/pin";
import { BOARD_COLUMNS, type ProductionStatus } from "@/lib/types";

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

// Advance to the next production status (Not Started -> ... -> Ready -> Completed).
export async function advanceStatus(itemId: string): Promise<ActionResult> {
  const session = await getWorkerSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const { data: item } = await admin
    .from("order_items")
    .select("id, production_status, assigned_worker_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Item not found." };
  const forbidden = assertAssignedToWorker(item, session.worker_id);
  if (forbidden) return forbidden;

  const flow: ProductionStatus[] = [...BOARD_COLUMNS, "completed"];
  const nextIdx = flow.indexOf(item.production_status as ProductionStatus) + 1;
  if (nextIdx <= 0 || nextIdx >= flow.length) {
    return { ok: false, error: "Item is already complete." };
  }

  const { error } = await admin
    .from("order_items")
    .update({
      production_status: flow[nextIdx],
      updated_by_worker_id: session.worker_id,
    })
    .eq("id", itemId);
  return error ? { ok: false, error: error.message } : { ok: true };
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
    .select("id, assigned_worker_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Item not found." };
  const forbidden = assertAssignedToWorker(item, session.worker_id);
  if (forbidden) return forbidden;

  const { error } = await admin
    .from("order_items")
    .update({
      is_delayed: true,
      delay_reason: reason.trim(),
      updated_by_worker_id: session.worker_id,
    })
    .eq("id", itemId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function clearDelay(itemId: string): Promise<ActionResult> {
  const session = await getWorkerSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const { data: item } = await admin
    .from("order_items")
    .select("id, assigned_worker_id")
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
  return error ? { ok: false, error: error.message } : { ok: true };
}
