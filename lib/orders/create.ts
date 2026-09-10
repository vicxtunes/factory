import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { OrderType } from "@/lib/types";

import type { OrderItemInput, OrderRoute } from "./types";

function clean(s: string): string | null {
  const t = s.trim();
  return t.length ? t : null;
}

export interface BuildOrderParams {
  // The client is already resolved by the caller (existing lookup, or
  // resolveOrCreateClient for a new one).
  client: { id: string; name: string; email: string | null; phone: string | null };
  agentId: string | null;
  agentName: string | null;
  // Set when route === "designer"; the caller has verified the designer.
  designer: { id: string; name: string } | null;
  route: OrderRoute;
  orderType: OrderType;
  deliveryDate: string;
  deadlineAt: string;
  orderNotes: string;
  designerBrief: string;
  // Required initial owner — written to every item's assigned_worker_id.
  responsibleWorkerId: string;
  items: OrderItemInput[];
}

export type BuildOrderResult =
  | { ok: true; orderNo: string; items: { formIndex: number; itemId: string }[] }
  | { ok: false; error: string };

// The shared body of order creation: server-side catalog validation, the
// order insert, the items insert (each stamped with the responsible worker
// and the right stage), and order rollback if the items insert fails.
// Callers own auth, client/agent/designer resolution, and revalidation.
export async function buildAndInsertOrder(
  admin: SupabaseClient,
  p: BuildOrderParams,
): Promise<BuildOrderResult> {
  const candidateItems = p.items
    .map((item, formIndex) => ({ item, formIndex }))
    .filter(({ item }) => item.category_id && item.product_id);
  if (candidateItems.length === 0) {
    return { ok: false, error: "Add at least one item with a product selected." };
  }

  // Look up catalog rows server-side rather than trusting client-supplied
  // names — the client only tells us which ids it picked.
  const categoryIds = [...new Set(candidateItems.map(({ item }) => item.category_id))];
  const productIds = [...new Set(candidateItems.map(({ item }) => item.product_id))];
  const variantIds = [
    ...new Set(candidateItems.map(({ item }) => item.variant_id).filter(Boolean)),
  ];

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
  const productById = new Map((products ?? []).map((prod) => [prod.id, prod]));
  const variantById = new Map((variants ?? []).map((v) => [v.id, v]));
  const attributesByCategory = new Map<string, { name: string; required: boolean }[]>();
  for (const def of attributeDefs ?? []) {
    const list = attributesByCategory.get(def.category_id) ?? [];
    list.push(def);
    attributesByCategory.set(def.category_id, list);
  }

  const stage = p.route === "designer" ? "with_designer" : "factory";
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
      urgency: p.orderType === "express" ? "urgent" : "normal",
      item_notes: clean(item.item_notes),
      stage,
      assigned_worker_id: p.responsibleWorkerId,
    });
  }

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .insert({
      client_id: p.client.id,
      client_name: p.client.name,
      client_email: p.client.email,
      client_phone: p.client.phone,
      agent_id: p.agentId,
      agent_name: p.agentName,
      order_type: p.orderType,
      delivery_date: clean(p.deliveryDate),
      deadline_at: p.orderType === "express" ? p.deadlineAt : null,
      order_notes: clean(p.orderNotes),
      stage,
      assigned_designer_id: p.designer?.id ?? null,
      designer_name: p.designer?.name ?? null,
      designer_brief: p.designer ? clean(p.designerBrief) : null,
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

// Shared: confirm a responsible-worker id refers to a real active worker.
export async function verifyActiveWorker(
  admin: SupabaseClient,
  workerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!workerId) return { ok: false, error: "Pick the worker responsible for this order." };
  const { data } = await admin
    .from("workers")
    .select("id, active")
    .eq("id", workerId)
    .maybeSingle();
  if (!data || data.active === false) {
    return { ok: false, error: "That worker is no longer available — pick another." };
  }
  return { ok: true };
}
