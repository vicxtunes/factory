"use server";

import { cookies } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";
import { INTAKE_COOKIE, signPayload } from "@/lib/auth/cookies";
import { getIntakeSession } from "@/lib/auth/session";
import type { OrderType } from "@/lib/types";

const COOKIE_MAX_AGE = 60 * 60 * 12; // 12h receptionist shift

export interface IntakeItemInput {
  category_id: string;
  product_id: string;
  variant_id: string; // "" when the product has no variant selected
  qty: number;
  attributes: Record<string, string>;
  item_notes: string;
}

export interface CreateOrderInput {
  customerType: "new" | "existing";
  client_id: string; // used when customerType === "existing"
  new_client: { name: string; email: string; phone: string }; // used when "new"
  agent_id: string;
  order_type: OrderType;
  delivery_date: string;
  deadline_at: string; // datetime-local value, required only when express
  order_notes: string;
  items: IntakeItemInput[];
}

type Result =
  | { ok: true; orderNo: string; items: { formIndex: number; itemId: string }[] }
  | { ok: false; error: string };

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

  if (!input.delivery_date) {
    return { ok: false, error: "Delivery date is required." };
  }
  if (input.order_type === "express" && !input.deadline_at) {
    return { ok: false, error: "Express orders need a deadline date & time." };
  }

  const candidateItems = input.items
    .map((item, formIndex) => ({ item, formIndex }))
    .filter(({ item }) => item.category_id && item.product_id);
  if (candidateItems.length === 0) {
    return { ok: false, error: "Add at least one item with a product selected." };
  }

  const admin = createAdminClient();

  // Resolve or create the client.
  let clientId: string;
  let clientName: string;
  let clientEmail: string | null;
  let clientPhone: string | null;

  if (input.customerType === "new") {
    const name = input.new_client.name.trim();
    if (!name) return { ok: false, error: "New client name is required." };
    const { data: client, error: clientErr } = await admin
      .from("clients")
      .insert({
        name,
        email: clean(input.new_client.email),
        phone: clean(input.new_client.phone),
      })
      .select("id, name, email, phone")
      .single();
    if (clientErr || !client) {
      return { ok: false, error: clientErr?.message ?? "Could not create client." };
    }
    ({ id: clientId, name: clientName, email: clientEmail, phone: clientPhone } = client);
  } else {
    if (!input.client_id) return { ok: false, error: "Select an existing client." };
    const { data: client, error: clientErr } = await admin
      .from("clients")
      .select("id, name, email, phone")
      .eq("id", input.client_id)
      .single();
    if (clientErr || !client) return { ok: false, error: "Selected client not found." };
    ({ id: clientId, name: clientName, email: clientEmail, phone: clientPhone } = client);
  }

  const agent = input.agent_id
    ? (await admin.from("agents").select("name").eq("id", input.agent_id).maybeSingle()).data
    : null;

  // Look up catalog rows server-side rather than trusting client-supplied
  // names — the client only tells us which ids it picked.
  const categoryIds = [...new Set(candidateItems.map(({ item }) => item.category_id))];
  const productIds = [...new Set(candidateItems.map(({ item }) => item.product_id))];
  const variantIds = [...new Set(candidateItems.map(({ item }) => item.variant_id).filter(Boolean))];

  const [{ data: categories }, { data: products }, { data: variants }, { data: attributeDefs }] =
    await Promise.all([
      admin.from("product_categories").select("id, name").in("id", categoryIds),
      admin.from("products").select("id, name, category_id").in("id", productIds),
      variantIds.length
        ? admin.from("product_variants").select("id, name").in("id", variantIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      admin
        .from("category_attributes")
        .select("category_id, name, required")
        .in("category_id", categoryIds),
    ]);

  const categoryById = new Map((categories ?? []).map((c) => [c.id, c]));
  const productById = new Map((products ?? []).map((p) => [p.id, p]));
  const variantById = new Map((variants ?? []).map((v) => [v.id, v]));
  const attributesByCategory = new Map<string, { name: string; required: boolean }[]>();
  for (const def of attributeDefs ?? []) {
    const list = attributesByCategory.get(def.category_id) ?? [];
    list.push(def);
    attributesByCategory.set(def.category_id, list);
  }

  const rows: Record<string, unknown>[] = [];
  for (const { item, formIndex } of candidateItems) {
    const category = categoryById.get(item.category_id);
    const product = productById.get(item.product_id);
    if (!category || !product || product.category_id !== item.category_id) {
      return { ok: false, error: `Item ${formIndex + 1}: invalid product selection.` };
    }
    const variant = item.variant_id ? variantById.get(item.variant_id) : null;

    const attributes: Record<string, string> = {};
    for (const def of attributesByCategory.get(item.category_id) ?? []) {
      const value = (item.attributes[def.name] ?? "").trim();
      if (def.required && !value) {
        return { ok: false, error: `Item ${formIndex + 1}: "${def.name}" is required.` };
      }
      if (value) attributes[def.name] = value;
    }

    rows.push({
      category_id: item.category_id,
      product_id: item.product_id,
      variant_id: item.variant_id || null,
      product: product.name,
      product_type: variant?.name ?? null,
      qty: Number.isFinite(item.qty) && item.qty > 0 ? Math.floor(item.qty) : 1,
      attributes,
      urgency: input.order_type === "express" ? "urgent" : "normal",
      item_notes: clean(item.item_notes),
    });
  }

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .insert({
      client_id: clientId,
      client_name: clientName,
      client_email: clientEmail,
      client_phone: clientPhone,
      agent_id: input.agent_id || null,
      agent_name: agent?.name ?? null,
      order_type: input.order_type,
      delivery_date: clean(input.delivery_date),
      deadline_at: input.order_type === "express" ? input.deadline_at : null,
      status: "At Factory",
      order_notes: clean(input.order_notes),
    })
    .select("id, order_no")
    .single();

  if (orderErr || !order) {
    return { ok: false, error: orderErr?.message ?? "Could not create order." };
  }

  const { data: insertedItems, error: itemsErr } = await admin
    .from("order_items")
    .insert(rows.map((row) => ({ ...row, order_id: order.id })))
    .select("id");

  if (itemsErr || !insertedItems) {
    // Roll back the order so intake can retry cleanly.
    await admin.from("orders").delete().eq("id", order.id);
    return { ok: false, error: itemsErr?.message ?? "Could not create items." };
  }

  return {
    ok: true,
    orderNo: order.order_no,
    items: candidateItems.map(({ formIndex }, i) => ({ formIndex, itemId: insertedItems[i].id })),
  };
}
