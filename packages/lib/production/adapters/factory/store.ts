import "server-only";

// This app's ProductionStore: the production tables, views and functions
// (supabase/migrations/20261130100000_production_costing.sql). Every query is
// filtered by the scope's tenant.

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { Material, MaterialMovement, MaterialPurchase } from "../../core/model";
import { unitCostOf } from "../../core/rules";
import { ProductionError, type ProductionStore } from "../../ports";

interface MaterialRow {
  id: string;
  name: string;
  unit: string;
  kind: Material["kind"];
  unit_cost: number | string;
  active: boolean;
  stock: number | string;
  stock_value: number | string;
  created_at: string;
}

const MATERIAL_COLUMNS = "id, name, unit, kind, unit_cost, active, stock, stock_value, created_at";

const toMaterial = (r: MaterialRow): Material => ({
  id: r.id,
  name: r.name,
  unit: r.unit,
  kind: r.kind,
  unitCost: Number(r.unit_cost),
  active: r.active,
  stock: Number(r.stock),
  stockValue: Number(r.stock_value),
  createdAt: r.created_at,
});

interface MovementRow {
  id: string;
  kind: MaterialMovement["kind"];
  qty: number | string;
  unit_cost: number | string;
  total: number | string;
  occurred_on: string;
  reason: string | null;
  actor_name: string;
  created_at: string;
  purchase_id: string | null;
}

interface PurchaseRow {
  id: string;
  material_id: string;
  qty: number | string;
  total: number | string;
  supplier: string | null;
  paid_from: MaterialPurchase["paidFrom"];
  reference: string | null;
  note: string | null;
  purchased_on: string;
  actor_name: string;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
}

// The database's PRODUCTION:<code> refusals, as sentences.
const MESSAGES: Record<string, string> = {
  no_material: "That material no longer exists.",
  no_purchase: "That purchase no longer exists.",
  already_voided: "That's already been voided.",
  has_repayments: "Part of this has been paid back to the supplier. Void those repayments first.",
  future_date: "The date can't be in the future.",
  negative_count: "A count can't be below zero.",
  history: "History can't be changed. Void it with a reason instead.",
};

function fail(error: { message: string; code?: string }): never {
  if (error.code === "23505") throw new ProductionError("There's already a material with that name.");
  const code = /PRODUCTION:(\w+)/.exec(error.message)?.[1];
  if (code && MESSAGES[code]) throw new ProductionError(MESSAGES[code]);
  throw new Error(`production: ${error.message}`);
}

export const factoryStore: ProductionStore = {
  async materials(scope) {
    const { data, error } = await createAdminClient()
      .from("production_materials")
      .select(MATERIAL_COLUMNS)
      .eq("tenant_id", scope.tenantId)
      .order("name")
      .returns<MaterialRow[]>();
    if (error) fail(error);
    return (data ?? []).map(toMaterial);
  },

  async material(scope, id) {
    const db = createAdminClient();
    const [material, movements, purchases] = await Promise.all([
      db.from("production_materials").select(MATERIAL_COLUMNS).eq("tenant_id", scope.tenantId).eq("id", id).maybeSingle<MaterialRow>(),
      db
        .from("material_movements")
        .select("id, kind, qty, unit_cost, total, occurred_on, reason, actor_name, created_at, purchase_id")
        .eq("tenant_id", scope.tenantId)
        .eq("material_id", id)
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200)
        .returns<MovementRow[]>(),
      db
        .from("material_purchases")
        .select("id, material_id, qty, total, supplier, paid_from, reference, note, purchased_on, actor_name, created_at, voided_at, void_reason")
        .eq("tenant_id", scope.tenantId)
        .eq("material_id", id)
        .order("purchased_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100)
        .returns<PurchaseRow[]>(),
    ]);
    if (material.error) fail(material.error);
    if (movements.error) fail(movements.error);
    if (purchases.error) fail(purchases.error);
    if (!material.data) return null;
    return {
      material: toMaterial(material.data),
      movements: (movements.data ?? []).map((m) => ({
        id: m.id,
        kind: m.kind,
        qty: Number(m.qty),
        unitCost: Number(m.unit_cost),
        total: Number(m.total),
        occurredOn: m.occurred_on,
        reason: m.reason,
        actorName: m.actor_name,
        createdAt: m.created_at,
        purchaseId: m.purchase_id,
      })),
      purchases: (purchases.data ?? []).map((p) => ({
        id: p.id,
        materialId: p.material_id,
        qty: Number(p.qty),
        total: Number(p.total),
        unitCost: unitCostOf(Number(p.total), Number(p.qty)),
        supplier: p.supplier,
        paidFrom: p.paid_from,
        reference: p.reference,
        note: p.note,
        purchasedOn: p.purchased_on,
        actorName: p.actor_name,
        createdAt: p.created_at,
        voidedAt: p.voided_at,
        voidReason: p.void_reason,
      })),
    };
  },

  async addMaterial(scope, input, actor) {
    const { data, error } = await createAdminClient()
      .from("materials")
      .insert({
        tenant_id: scope.tenantId,
        name: input.name,
        unit: input.unit,
        kind: input.kind,
        unit_cost: input.unitCost ?? 0,
        created_by_name: actor.name,
      })
      .select("id")
      .single<{ id: string }>();
    if (error) fail(error);
    return data.id;
  },

  async updateMaterial(scope, input) {
    const { error, count } = await createAdminClient()
      .from("materials")
      .update({ name: input.name, unit: input.unit, kind: input.kind, active: input.active }, { count: "exact" })
      .eq("tenant_id", scope.tenantId)
      .eq("id", input.id);
    if (error) fail(error);
    if (!count) throw new ProductionError(MESSAGES.no_material);
  },

  async recordPurchase(scope, input, actor) {
    const { data, error } = await createAdminClient().rpc("production_record_purchase", {
      p_tenant: scope.tenantId,
      p_material: input.materialId,
      p_qty: input.qty,
      p_total: input.total,
      p_supplier: input.supplier,
      p_paid_from: input.paidFrom,
      p_reference: input.reference,
      p_note: input.note,
      p_purchased_on: input.purchasedOn,
      p_due_on: input.dueOn,
      p_actor_id: actor.id,
      p_actor_name: actor.name,
    });
    if (error) fail(error);
    return data as string;
  },

  async voidPurchase(scope, input, actor) {
    const { error } = await createAdminClient().rpc("production_void_purchase", {
      p_tenant: scope.tenantId,
      p_purchase: input.id,
      p_reason: input.reason,
      p_actor_name: actor.name,
    });
    if (error) fail(error);
  },

  async countStock(scope, input, actor) {
    const { data, error } = await createAdminClient().rpc("production_count_stock", {
      p_tenant: scope.tenantId,
      p_material: input.materialId,
      p_counted: input.counted,
      p_reason: input.reason,
      p_actor_name: actor.name,
    });
    if (error) fail(error);
    return Number(data);
  },
};
