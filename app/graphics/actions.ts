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

// Once every item on an order has moved to the factory, flip the order's
// own stage too — bookkeeping only (used by
// unassign_orders_on_designer_deactivate), not something that hides the
// order from the designer's board; see fetchDesignerItems in
// lib/queries.ts for why the order keeps showing until every item is
// actually completed, so a late mistake can still be caught and fixed.
async function syncOrderStageIfDone(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
): Promise<void> {
  const { count } = await admin
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId)
    .eq("stage", "with_designer");
  if (count === 0) {
    await admin.from("orders").update({ stage: "factory" }).eq("id", orderId);
  }
}

// Sends one finished item on to the factory while the rest of the order
// stays with the designer — lets them release pieces as they finish
// instead of holding the whole order back for the slowest item.
export async function advanceItemToFactory(itemId: string): Promise<ActionResult> {
  const session = await getDesignerSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const { data: item } = await admin
    .from("order_items")
    .select("id, order_id, stage, order:orders!inner (assigned_designer_id)")
    .eq("id", itemId)
    .maybeSingle<{
      id: string;
      order_id: string;
      stage: string;
      order: { assigned_designer_id: string | null };
    }>();
  if (!item) return { ok: false, error: "Item not found." };
  if (item.order.assigned_designer_id !== session.designer_id) {
    return { ok: false, error: "This item isn't assigned to you." };
  }
  if (item.stage !== "with_designer") {
    return { ok: false, error: "This item has already moved on." };
  }

  const { error } = await admin
    .from("order_items")
    .update({ stage: "factory" })
    .eq("id", itemId);
  if (error) return { ok: false, error: error.message };

  await syncOrderStageIfDone(admin, item.order_id);

  revalidatePath("/graphics");
  revalidatePath("/factory");
  revalidatePath("/dashboard");
  return { ok: true };
}

// Designer says they're fully done with the order — releases whatever
// items they haven't already sent individually, all at once. Only the
// assigned designer may do this. A no-op (not an error) if every item was
// already sent one at a time.
export async function completeDesignerWork(orderId: string): Promise<ActionResult> {
  const session = await getDesignerSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, assigned_designer_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Order not found." };
  if (order.assigned_designer_id !== session.designer_id) {
    return { ok: false, error: "This order isn't assigned to you." };
  }

  const { error: itemsError } = await admin
    .from("order_items")
    .update({ stage: "factory" })
    .eq("order_id", orderId)
    .eq("stage", "with_designer");
  if (itemsError) return { ok: false, error: itemsError.message };

  const { error } = await admin.from("orders").update({ stage: "factory" }).eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/graphics");
  revalidatePath("/factory");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Designer edits — quantities, specs, and notes can still change on an
// assigned order, same fields a manager sets at intake. Sending an item to
// the factory only means "start producing this" — it doesn't lock the
// designer out, since a mistake might not surface until later. The only
// hard line is an item the factory has actually finished (`completed`):
// past that point editing it here would misrepresent already-delivered work.
// ---------------------------------------------------------------------------

export interface DesignerItemEditInput {
  id: string;
  category_id: string;
  product_id: string;
  variant_id: string; // "" when the product has no variant selected
  qty: number;
  attributes: Record<string, string>;
  item_notes: string;
}

export interface DesignerOrderEditInput {
  orderId: string;
  delivery_date: string;
  deadline_at: string; // required only when the order is express
  order_notes: string;
  items: DesignerItemEditInput[];
}

export async function updateDesignerOrder(input: DesignerOrderEditInput): Promise<ActionResult> {
  const session = await getDesignerSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, assigned_designer_id, order_type")
    .eq("id", input.orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Order not found." };
  if (order.assigned_designer_id !== session.designer_id) {
    return { ok: false, error: "This order isn't assigned to you." };
  }
  if (!input.delivery_date) return { ok: false, error: "Delivery date is required." };
  if (order.order_type === "express" && !input.deadline_at) {
    return { ok: false, error: "Express orders need a deadline date & time." };
  }
  if (input.items.length === 0) return { ok: false, error: "Order needs at least one item." };

  const itemIds = input.items.map((i) => i.id);
  const { data: existingItems } = await admin
    .from("order_items")
    .select("id, order_id, production_status")
    .in("id", itemIds);
  if (
    !existingItems ||
    existingItems.length !== itemIds.length ||
    existingItems.some((i) => i.order_id !== input.orderId)
  ) {
    return { ok: false, error: "One or more items don't belong to this order." };
  }
  if (existingItems.some((i) => i.production_status === "completed")) {
    return {
      ok: false,
      error: "An item has already been completed by the factory and can no longer be edited here.",
    };
  }

  // Look up catalog rows server-side rather than trusting client-supplied
  // names — same pattern as createOrder.
  const categoryIds = [...new Set(input.items.map((i) => i.category_id))];
  const productIds = [...new Set(input.items.map((i) => i.product_id))];
  const variantIds = [...new Set(input.items.map((i) => i.variant_id).filter(Boolean))];

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

  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  for (const [idx, item] of input.items.entries()) {
    const category = categoryById.get(item.category_id);
    const product = productById.get(item.product_id);
    if (!category || !product || product.category_id !== item.category_id) {
      return { ok: false, error: `Item ${idx + 1}: invalid product selection.` };
    }
    const variant = item.variant_id ? variantById.get(item.variant_id) : null;

    const attributes: Record<string, string> = {};
    for (const def of attributesByCategory.get(item.category_id) ?? []) {
      const value = (item.attributes[def.name] ?? "").trim();
      if (def.required && !value) {
        return { ok: false, error: `Item ${idx + 1}: "${def.name}" is required.` };
      }
      if (value) attributes[def.name] = value;
    }

    updates.push({
      id: item.id,
      patch: {
        category_id: item.category_id,
        product_id: item.product_id,
        variant_id: item.variant_id || null,
        product: product.name,
        product_type: variant?.name ?? null,
        qty: Number.isFinite(item.qty) && item.qty > 0 ? Math.floor(item.qty) : 1,
        attributes,
        item_notes: item.item_notes.trim() || null,
      },
    });
  }

  for (const { id, patch } of updates) {
    const { error } = await admin.from("order_items").update(patch).eq("id", id);
    if (error) return { ok: false, error: error.message };
  }

  const { error: orderError } = await admin
    .from("orders")
    .update({
      delivery_date: input.delivery_date,
      deadline_at: order.order_type === "express" ? input.deadline_at : null,
      order_notes: input.order_notes.trim() || null,
    })
    .eq("id", input.orderId);
  if (orderError) return { ok: false, error: orderError.message };

  revalidatePath("/graphics");
  revalidatePath("/dashboard");
  revalidatePath("/factory");
  return { ok: true };
}
