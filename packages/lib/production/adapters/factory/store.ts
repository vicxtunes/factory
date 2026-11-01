import "server-only";

// This app's ProductionStore: the production tables, views and functions
// (supabase/migrations/20261130100000_production_costing.sql). Every query is
// filtered by the scope's tenant.

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { Lender, Loan, Material, MaterialMovement, MaterialPurchase, RecipeLine, Repayment } from "../../core/model";
import { unitCostOf } from "../../core/rules";
import { ProductionError, type ProductionStore } from "../../ports";

interface LoanRow {
  id: string;
  lender_id: string;
  lender_name: string;
  lender_kind: Loan["lenderKind"];
  amount: number | string;
  to_repay: number | string;
  received_on: string;
  received_into: Loan["receivedInto"];
  purchase_id: string | null;
  due_on: string | null;
  note: string | null;
  actor_name: string;
  repaid: number | string;
  interest_paid: number | string;
  voided_at: string | null;
  void_reason: string | null;
}

const LOAN_COLUMNS =
  "id, lender_id, lender_name, lender_kind, amount, to_repay, received_on, received_into, purchase_id, due_on, note, actor_name, repaid, interest_paid, voided_at, void_reason";

const toLoan = (r: LoanRow): Loan => ({
  id: r.id,
  lenderId: r.lender_id,
  lenderName: r.lender_name,
  lenderKind: r.lender_kind,
  amount: Number(r.amount),
  toRepay: Number(r.to_repay),
  receivedOn: r.received_on,
  receivedInto: r.received_into,
  purchaseId: r.purchase_id,
  dueOn: r.due_on,
  note: r.note,
  actorName: r.actor_name,
  repaid: Number(r.repaid),
  interestPaid: Number(r.interest_paid),
  voidedAt: r.voided_at,
  voidReason: r.void_reason,
});

interface RepaymentRow {
  id: string;
  loan_id: string;
  amount: number | string;
  interest: number | string;
  paid_on: string;
  paid_from: Repayment["paidFrom"];
  reference: string | null;
  note: string | null;
  actor_name: string;
  voided_at: string | null;
  void_reason: string | null;
}

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
  no_lender: "That lender no longer exists.",
  no_loan: "That loan no longer exists.",
  no_repayment: "That repayment no longer exists.",
  loan_voided: "That loan has been voided.",
  over_repaid: "That's more than is left to pay back on this loan.",
  before_loan: "A repayment can't be dated before the money was borrowed.",
  void_the_purchase: "This is a supplier's credit for a purchase: void the purchase instead (on its material's page).",
  no_product: "That product no longer exists.",
  wrong_size: "One of the sizes no longer belongs to this product. Reload and try again.",
  credit_via_purchase: "Materials on credit are recorded as a purchase, on Materials.",
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

  async lenders(scope) {
    const { data, error } = await createAdminClient()
      .from("lenders")
      .select("id, name, phone, kind")
      .eq("tenant_id", scope.tenantId)
      .order("name")
      .returns<Lender[]>();
    if (error) fail(error);
    return data ?? [];
  },

  async loans(scope, lenderId) {
    let query = createAdminClient().from("production_loans").select(LOAN_COLUMNS).eq("tenant_id", scope.tenantId);
    if (lenderId) query = query.eq("lender_id", lenderId);
    const { data, error } = await query.order("received_on", { ascending: false }).order("created_at", { ascending: false }).returns<LoanRow[]>();
    if (error) fail(error);
    return (data ?? []).map(toLoan);
  },

  async repayments(scope, loanIds) {
    if (loanIds.length === 0) return [];
    const { data, error } = await createAdminClient()
      .from("loan_repayments")
      .select("id, loan_id, amount, interest, paid_on, paid_from, reference, note, actor_name, voided_at, void_reason")
      .eq("tenant_id", scope.tenantId)
      .in("loan_id", loanIds)
      .order("paid_on")
      .order("created_at")
      .returns<RepaymentRow[]>();
    if (error) fail(error);
    return (data ?? []).map((r) => ({
      id: r.id,
      loanId: r.loan_id,
      amount: Number(r.amount),
      interest: Number(r.interest),
      paidOn: r.paid_on,
      paidFrom: r.paid_from,
      reference: r.reference,
      note: r.note,
      actorName: r.actor_name,
      voidedAt: r.voided_at,
      voidReason: r.void_reason,
    }));
  },

  async recordLoan(scope, input, actor) {
    const { data, error } = await createAdminClient().rpc("production_record_loan", {
      p_tenant: scope.tenantId,
      p_lender: input.lenderId,
      p_lender_name: input.lender?.name ?? null,
      p_lender_phone: input.lender?.phone ?? null,
      p_lender_kind: input.lender?.kind ?? null,
      p_amount: input.amount,
      p_to_repay: input.toRepay,
      p_received_on: input.receivedOn,
      p_received_into: input.receivedInto,
      p_due_on: input.dueOn,
      p_note: input.note,
      p_actor_id: actor.id,
      p_actor_name: actor.name,
    });
    if (error) fail(error);
    return data as string;
  },

  async recordRepayment(scope, input, actor) {
    const { data, error } = await createAdminClient().rpc("production_record_repayment", {
      p_tenant: scope.tenantId,
      p_loan: input.loanId,
      p_amount: input.amount,
      p_paid_on: input.paidOn,
      p_paid_from: input.paidFrom,
      p_reference: input.reference,
      p_note: input.note,
      p_actor_id: actor.id,
      p_actor_name: actor.name,
    });
    if (error) fail(error);
    return data as string;
  },

  async voidLoan(scope, input, actor) {
    const { error } = await createAdminClient().rpc("production_void_loan", {
      p_tenant: scope.tenantId,
      p_loan: input.id,
      p_reason: input.reason,
      p_actor_name: actor.name,
    });
    if (error) fail(error);
  },

  async voidRepayment(scope, input, actor) {
    const { error } = await createAdminClient().rpc("production_void_repayment", {
      p_tenant: scope.tenantId,
      p_repayment: input.id,
      p_reason: input.reason,
      p_actor_name: actor.name,
    });
    if (error) fail(error);
  },

  async recipes(scope, productId) {
    let query = createAdminClient()
      .from("recipe_lines")
      .select("product_id, variant_id, material_id, qty, per_attribute_id, label, amount")
      .eq("tenant_id", scope.tenantId);
    if (productId) query = query.eq("product_id", productId);
    const { data, error } = await query.order("sort_order").returns<
      {
        product_id: string;
        variant_id: string | null;
        material_id: string | null;
        qty: number | string | null;
        per_attribute_id: string | null;
        label: string | null;
        amount: number | string | null;
      }[]
    >();
    if (error) fail(error);
    const byProduct = new Map<string, RecipeLine[]>();
    for (const r of data ?? []) {
      const lines = byProduct.get(r.product_id) ?? [];
      lines.push({
        variantId: r.variant_id,
        materialId: r.material_id,
        qty: r.qty === null ? null : Number(r.qty),
        perAttributeId: r.per_attribute_id,
        label: r.label,
        amount: r.amount === null ? null : Number(r.amount),
      });
      byProduct.set(r.product_id, lines);
    }
    return byProduct;
  },

  async saveRecipe(scope, input) {
    const lines = input.lines.map((l) =>
      "materialId" in l
        ? { variant_id: l.variantId, material_id: l.materialId, qty: l.qty, per_attribute_id: l.perAttributeId }
        : { variant_id: l.variantId, label: l.label, amount: l.amount },
    );
    const { error } = await createAdminClient().rpc("production_save_recipe", { p_tenant: scope.tenantId, p_product: input.productId, p_lines: lines });
    if (error) fail(error);
  },
};
