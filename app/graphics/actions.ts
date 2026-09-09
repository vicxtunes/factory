"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { DESIGNER_COOKIE, signPayload } from "@/lib/auth/cookies";
import { getDesignerSession } from "@/lib/auth/session";
import { verifyPin } from "@/lib/auth/pin";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // remembered on device, same as workers

type ActionResult = { ok: true } | { ok: false; error: string };

export async function verifyDesignerPin(
  designerId: string,
  pin: string,
): Promise<ActionResult> {
  const admin = createAdminClient();
  const { data: designer } = await admin
    .from("designers")
    .select("id, name, pin_hash, active")
    .eq("id", designerId)
    .maybeSingle();

  if (!designer || !designer.active) return { ok: false, error: "Unknown designer." };
  if (!(await verifyPin(pin, designer.pin_hash))) {
    return { ok: false, error: "Incorrect PIN." };
  }

  const store = await cookies();
  store.set(
    DESIGNER_COOKIE,
    await signPayload({ designer_id: designer.id, name: designer.name }),
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

export async function logoutDesigner(): Promise<void> {
  const store = await cookies();
  store.delete(DESIGNER_COOKIE);
}

// Designer marks their work done on the whole order — auto-forwards it to
// the factory board. Only the assigned designer may do this.
export async function completeDesignerWork(orderId: string): Promise<ActionResult> {
  const session = await getDesignerSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, assigned_designer_id, stage")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Order not found." };
  if (order.assigned_designer_id !== session.designer_id) {
    return { ok: false, error: "This order isn't assigned to you." };
  }
  if (order.stage !== "with_designer") {
    return { ok: false, error: "This order has already moved on." };
  }

  const { error } = await admin
    .from("orders")
    .update({ stage: "factory" })
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/graphics");
  revalidatePath("/factory");
  revalidatePath("/dashboard");
  return { ok: true };
}
