import "server-only";

// This app's DiscountStore: the discounts tables and discount_create()
// (supabase/migrations/20261001170000_discounts.sql). Every query is
// filtered by the scope's tenant.

import { createAdminClient } from "@/lib/supabase/admin";

import type { Discount } from "../../core/model";
import { DiscountError, type DiscountStore } from "../../ports";

interface Row {
  id: string;
  name: string;
  kind: Discount["kind"];
  value: number | string;
  applies_to: Discount["appliesTo"];
  starts_at: string;
  ends_at: string | null;
  created_by_name: string;
  created_at: string;
  products: { product_id: string }[];
}

const COLUMNS = "id, name, kind, value, applies_to, starts_at, ends_at, created_by_name, created_at, products:discount_products (product_id)";

const toDiscount = (r: Row): Discount => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  value: Number(r.value),
  appliesTo: r.applies_to,
  productIds: r.products.map((p) => p.product_id),
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  createdByName: r.created_by_name,
  createdAt: r.created_at,
});

// The database's DISCOUNT:<code> refusals, as sentences.
const MESSAGES: Record<string, string> = {
  started: "This discount has already started. It can only be ended now; to change it, end it and create a new one.",
  invalid_end: "A running discount can only be ended now or earlier than planned.",
  no_products: "Choose at least one product.",
};

function fail(error: { message: string }): never {
  const code = /DISCOUNT:(\w+)/.exec(error.message)?.[1];
  if (code && MESSAGES[code]) throw new DiscountError(MESSAGES[code]);
  throw new Error(`discounts: ${error.message}`);
}

export const factoryStore: DiscountStore = {
  async list(scope) {
    const { data, error } = await createAdminClient()
      .from("discounts")
      .select(COLUMNS)
      .eq("tenant_id", scope.tenantId)
      .order("starts_at", { ascending: false })
      .returns<Row[]>();
    if (error) fail(error);
    return (data ?? []).map(toDiscount);
  },

  async get(scope, id) {
    const { data, error } = await createAdminClient()
      .from("discounts")
      .select(COLUMNS)
      .eq("tenant_id", scope.tenantId)
      .eq("id", id)
      .maybeSingle<Row>();
    if (error) fail(error);
    return data ? toDiscount(data) : null;
  },

  async create(scope, input, actor) {
    const { data, error } = await createAdminClient().rpc("discount_create", {
      p_tenant: scope.tenantId,
      p_name: input.name,
      p_kind: input.kind,
      p_value: input.value,
      p_applies_to: input.appliesTo,
      p_product_ids: input.appliesTo === "products" ? input.productIds : [],
      p_starts_at: input.startsAt,
      p_ends_at: input.endsAt,
      p_actor_id: actor.id,
      p_actor_name: actor.name,
    });
    if (error) fail(error);
    return data as string;
  },

  async end(scope, id, at, actor) {
    const { error } = await createAdminClient()
      .from("discounts")
      .update({ ends_at: at, ended_by_name: actor.name })
      .eq("tenant_id", scope.tenantId)
      .eq("id", id);
    if (error) fail(error);
  },

  async remove(scope, id) {
    const { error } = await createAdminClient().from("discounts").delete().eq("tenant_id", scope.tenantId).eq("id", id);
    if (error) fail(error);
  },
};
