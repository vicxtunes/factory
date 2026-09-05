"use server";

import { cookies } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";
import { INTAKE_COOKIE, signPayload } from "@/lib/auth/cookies";
import { getIntakeSession } from "@/lib/auth/session";
import type { Urgency } from "@/lib/types";

const COOKIE_MAX_AGE = 60 * 60 * 12; // 12h receptionist shift

export interface IntakeItemInput {
  product: string;
  product_type: string;
  qty: number;
  size: string;
  cover_type: string;
  lamination_type: string;
  box_type: string;
  urgency: Urgency;
  item_notes: string;
  media_link: string;
}

export interface CreateOrderInput {
  order_no: string;
  client_name: string;
  delivery_date: string;
  status: string;
  order_notes: string;
  media_link: string;
  media_notes: string;
  items: IntakeItemInput[];
}

type Result = { ok: true; orderNo: string } | { ok: false; error: string };

export async function verifyIntakePin(
  _prev: unknown,
  formData: FormData,
): Promise<{ error?: string }> {
  const pin = String(formData.get("pin") ?? "");
  if (!process.env.INTAKE_PIN) return { error: "Intake PIN is not configured." };
  if (pin !== process.env.INTAKE_PIN) return { error: "Incorrect PIN." };

  const store = await cookies();
  store.set(INTAKE_COOKIE, await signPayload({ ok: true }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return {};
}

function clean(s: string): string | null {
  const t = s.trim();
  return t.length ? t : null;
}

export async function createOrder(input: CreateOrderInput): Promise<Result> {
  if (!(await getIntakeSession())) return { ok: false, error: "Not signed in." };

  if (!input.order_no.trim() || !input.client_name.trim()) {
    return { ok: false, error: "Order number and client name are required." };
  }
  const items = input.items.filter((i) => i.product.trim().length > 0);
  if (items.length === 0) {
    return { ok: false, error: "Add at least one line item with a product." };
  }

  const admin = createAdminClient();

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .insert({
      order_no: input.order_no.trim(),
      client_name: input.client_name.trim(),
      delivery_date: clean(input.delivery_date),
      status: clean(input.status) ?? "At Factory",
      order_notes: clean(input.order_notes),
      media_link: clean(input.media_link),
      media_notes: clean(input.media_notes),
    })
    .select("id, order_no")
    .single();

  if (orderErr || !order) {
    return { ok: false, error: orderErr?.message ?? "Could not create order." };
  }

  const { error: itemsErr } = await admin.from("order_items").insert(
    items.map((i) => ({
      order_id: order.id,
      product: i.product.trim(),
      product_type: clean(i.product_type),
      qty: Number.isFinite(i.qty) && i.qty > 0 ? Math.floor(i.qty) : 1,
      size: clean(i.size),
      cover_type: clean(i.cover_type),
      lamination_type: clean(i.lamination_type),
      box_type: clean(i.box_type),
      urgency: i.urgency,
      item_notes: clean(i.item_notes),
      media_link: clean(i.media_link),
    })),
  );

  if (itemsErr) {
    // Roll back the order so intake can retry cleanly.
    await admin.from("orders").delete().eq("id", order.id);
    return { ok: false, error: itemsErr.message };
  }

  return { ok: true, orderNo: order.order_no };
}
