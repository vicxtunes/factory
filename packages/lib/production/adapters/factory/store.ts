import "server-only";

// This app's ProductionStore: the production tables, views and functions
// (supabase/migrations/20261130100000_production_costing.sql,
// 20261224100000_costing_recipes.sql). Every query is
// filtered by the scope's tenant.

import { DAY_CLOSED_MESSAGE } from "@repo/lib/books/model";
import { createAdminClient } from "@repo/lib/supabase/admin";

import type { Lender, Loan, Repayment } from "../../core/model";
import type { AutoPrice, CostBy, CostedProduct, CostMaterial, MaterialPart, RecipeLine, SizeAmounts } from "../../core/recipes";
import type { MaterialFigure, SoldOrder } from "../../core/overview";
import type { ItemJourney } from "../../core/speed";
import { ProductionError, type ProductionStore } from "../../ports";

interface LoanRow {
  id: string;
  lender_id: string;
  lender_name: string;
  lender_kind: Loan["lenderKind"];
  amount: number | string;
  to_repay: number | string;
  interest_rate: number | string | null;
  interest_per: Loan["interestPer"];
  interest_due: number | string;
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
  "id, lender_id, lender_name, lender_kind, amount, to_repay, interest_rate, interest_per, interest_due, received_on, received_into, purchase_id, due_on, note, actor_name, repaid, interest_paid, voided_at, void_reason";

const toLoan = (r: LoanRow): Loan => ({
  id: r.id,
  lenderId: r.lender_id,
  lenderName: r.lender_name,
  lenderKind: r.lender_kind,
  amount: Number(r.amount),
  toRepay: Number(r.to_repay),
  interestRate: r.interest_rate === null ? null : Number(r.interest_rate),
  interestPer: r.interest_per,
  interestDue: Number(r.interest_due),
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
  cost_by: CostBy;
  unit_cost: number | string;
  size_costs: SizeAmounts;
  sell_price: number | string | null;
  size_sells: SizeAmounts;
  active: boolean;
}

interface ProductRow {
  id: string;
  name: string;
  price: number | string | null;
  auto_price: AutoPrice | null;
  margin: number | string | null;
  category: { name: string } | null;
  variants: { id: string; name: string; price: number | string | null; active: boolean }[];
}

const num = (v: number | string | null) => (v === null ? null : Number(v));

/** PostgREST returns at most 1,000 rows a request: read page by page. */
async function allPages<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) fail(error);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < 1000) return rows;
  }
}

// The database's PRODUCTION:<code> refusals, as sentences.
const MESSAGES: Record<string, string> = {
  no_material: "One of those materials no longer exists.",
  used_as_part: "Another material is built with this one, so it can't be built from others itself.",
  bad_part: "A material is built only from materials with a cost of their own (not built ones, and not itself).",
  has_catalog_price: "This product has a catalog price of its own, which would win on invoices. Clear its price (and its sizes' prices) first.",
  no_product: "That product no longer exists.",
  already_voided: "That's already been voided.",
  future_date: "The date can't be in the future.",
  history: "History can't be changed. Void it with a reason instead.",
  no_lender: "That lender no longer exists.",
  no_loan: "That loan no longer exists.",
  no_repayment: "That repayment no longer exists.",
  loan_voided: "That loan has been voided.",
  repay_in_order: "This loan has a later repayment. With a rate, enter repayments in date order: void the later one first.",
  void_latest_first: "Void this loan's latest repayment first: each one's interest depends on those before it.",
  over_repaid: "That's more than is left to pay back on this loan.",
  before_loan: "A repayment can't be dated before the money was borrowed.",
  void_the_purchase: "This is a supplier's credit for a purchase: void the purchase instead.",
  credit_via_purchase: "Materials on credit are recorded as a purchase.",
};

/** The margin photo books are priced at until the boss sets one. */
const DEFAULT_MARGIN = 0.4;

function fail(error: { message: string; code?: string }): never {
  if (error.code === "23505") throw new ProductionError("There's already a material with that name.");
  if (error.code === "23001" || error.code === "23503") throw new ProductionError("A recipe or a built material uses this material. Remove it there first, or mark it not in use.");
  if (error.message.includes("DAYBOOK:day_closed")) throw new ProductionError(DAY_CLOSED_MESSAGE);
  const code = /PRODUCTION:(\w+)/.exec(error.message)?.[1];
  if (code && MESSAGES[code]) throw new ProductionError(MESSAGES[code]);
  throw new Error(`production: ${error.message}`);
}

export const factoryStore: ProductionStore = {
  async costBook(scope) {
    const db = createAdminClient();
    const [materials, parts, lines, products, settings] = await Promise.all([
      db
        .from("materials")
        .select("id, name, unit, cost_by, unit_cost, size_costs, sell_price, size_sells, active")
        .eq("tenant_id", scope.tenantId)
        .order("name")
        .returns<MaterialRow[]>(),
      db
        .from("material_parts")
        .select("material_id, part_id, qty, size_totals")
        .eq("tenant_id", scope.tenantId)
        .order("sort_order")
        .returns<{ material_id: string; part_id: string; qty: number | string; size_totals: SizeAmounts | null }[]>(),
      db
        .from("recipe_lines")
        .select("product_id, material_id, qty, per_sheet, sizes, when_detail, when_value, sell_price, size_sells")
        .eq("tenant_id", scope.tenantId)
        .order("sort_order")
        .returns<
          {
            product_id: string;
            material_id: string;
            qty: number | string;
            per_sheet: boolean;
            sizes: string[] | null;
            when_detail: string | null;
            when_value: string | null;
            sell_price: number | string | null;
            size_sells: SizeAmounts | null;
          }[]
        >(),
      db
        .from("products")
        .select("id, name, price, auto_price, margin, category:product_categories (name), variants:product_variants (id, name, price, active)")
        .eq("active", true)
        .order("name")
        .returns<ProductRow[]>(),
      db.from("costing_settings").select("margin").eq("tenant_id", scope.tenantId).maybeSingle<{ margin: number | string }>(),
    ]);
    for (const r of [materials, parts, lines, products, settings]) if (r.error) fail(r.error);
    const partsOf = new Map<string, MaterialPart[]>();
    for (const r of parts.data ?? []) partsOf.set(r.material_id, [...(partsOf.get(r.material_id) ?? []), { partId: r.part_id, qty: Number(r.qty), sizeTotals: r.size_totals }]);
    const recipes = new Map<string, RecipeLine[]>();
    for (const r of lines.data ?? []) {
      const line: RecipeLine = {
        materialId: r.material_id,
        qty: Number(r.qty),
        perSheet: r.per_sheet,
        sizes: r.sizes,
        whenDetail: r.when_detail,
        whenValue: r.when_value,
        sellPrice: num(r.sell_price),
        sizeSells: r.size_sells,
      };
      recipes.set(r.product_id, [...(recipes.get(r.product_id) ?? []), line]);
    }
    return {
      materials: (materials.data ?? []).map(
        (m): CostMaterial => ({
          id: m.id,
          name: m.name,
          unit: m.unit,
          costBy: m.cost_by,
          cost: Number(m.unit_cost),
          sizeCosts: m.size_costs ?? {},
          parts: partsOf.get(m.id) ?? [],
          sellPrice: num(m.sell_price),
          sizeSells: m.size_sells ?? {},
          active: m.active,
        }),
      ),
      recipes,
      products: (products.data ?? []).map(
        (p): CostedProduct => ({
          id: p.id,
          name: p.name,
          categoryName: p.category?.name ?? "",
          price: num(p.price),
          variants: (p.variants ?? []).filter((v) => v.active).map((v) => ({ id: v.id, name: v.name, price: num(v.price) })),
          autoPrice: p.auto_price,
          margin: num(p.margin),
        }),
      ),
      margin: settings.data ? Number(settings.data.margin) : DEFAULT_MARGIN,
    };
  },

  async saveMaterial(scope, input, actor) {
    const { data, error } = await createAdminClient().rpc("costing_save_material", {
      p_tenant: scope.tenantId,
      p_id: input.id,
      p_material: {
        name: input.name,
        unit: input.unit,
        cost_by: input.costBy,
        unit_cost: input.costBy === "one" ? input.cost : 0,
        size_costs: input.costBy === "size" ? input.sizeCosts : {},
        sell_price: input.sellPrice,
        size_sells: input.sizeSells,
        active: input.active,
      },
      p_parts: input.costBy === "parts" ? input.parts.map((p) => ({ part_id: p.partId, qty: p.qty, size_totals: p.sizeTotals })) : [],
      p_actor_name: actor.name,
    });
    if (error) fail(error);
    return data as string;
  },

  async deleteMaterial(scope, id) {
    const { error, count } = await createAdminClient().from("materials").delete({ count: "exact" }).eq("tenant_id", scope.tenantId).eq("id", id);
    if (error) fail(error);
    if (!count) throw new ProductionError(MESSAGES.no_material);
  },

  async saveRecipe(scope, input) {
    const { error } = await createAdminClient().rpc("costing_save_recipe", {
      p_tenant: scope.tenantId,
      p_product: input.productId,
      p_lines: input.lines.map((l) => ({
        material_id: l.materialId,
        qty: l.qty,
        per_sheet: l.perSheet,
        sizes: l.sizes,
        when_detail: l.whenDetail,
        when_value: l.whenValue,
        sell_price: l.sellPrice,
        size_sells: l.sizeSells,
      })),
    });
    if (error) fail(error);
  },

  async setPricing(_scope, input) {
    const { error } = await createAdminClient().rpc("costing_set_pricing", {
      p_product: input.productId,
      p_auto: input.autoPrice,
      p_margin: input.autoPrice === "margin" && input.marginPercent !== null ? input.marginPercent / 100 : null,
    });
    if (error) fail(error);
  },

  async setMargin(scope, input, actor) {
    const { error } = await createAdminClient()
      .from("costing_settings")
      .upsert({ tenant_id: scope.tenantId, margin: input.marginPercent / 100, updated_by_name: actor.name, updated_at: new Date().toISOString() });
    if (error) fail(error);
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
      p_interest_rate: input.interestRate,
      p_interest_per: input.interestPer,
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

  async soldOrders(_scope, range) {
    const rows = await allPages<{
      issued_at: string;
      order: {
        quoted_price: number | string | null;
        cancelled_at: string | null;
        client_name: string;
        items: { id: string; product: string; product_id: string | null; variant_id: string | null; product_type: string | null; qty: number; unit_price: number | string | null; attributes: Record<string, string | number> | null }[];
      };
    }>((from, to) => {
      let q = createAdminClient()
        .from("invoices")
        .select("issued_at, order:orders!inner (quoted_price, cancelled_at, client_name, items:order_items (id, product, product_id, variant_id, product_type, qty, unit_price, attributes))")
        .is("order.cancelled_at", null);
      if (range.from) q = q.gte("issued_at", range.from);
      if (range.to) q = q.lt("issued_at", range.to);
      return q.order("issued_at").range(from, to);
    });
    return rows.map(
      (r): SoldOrder => ({
        total: Math.round(Number(r.order.quoted_price ?? 0)),
        issuedAt: r.issued_at,
        clientName: r.order.client_name,
        items: r.order.items.map((i) => ({
          itemId: i.id,
          productId: i.product_id,
          product: i.product,
          variantId: i.variant_id,
          variantName: i.product_type,
          qty: i.qty,
          unitPrice: i.unit_price === null ? null : Number(i.unit_price),
          attributes: i.attributes ?? {},
        })),
      }),
    );
  },

  async recordedCosts(scope, itemIds) {
    const costs = new Map<string, number>();
    for (let i = 0; i < itemIds.length; i += 200) {
      const { data, error } = await createAdminClient()
        .from("production_records")
        .select("order_item_id, actual_cost")
        .eq("tenant_id", scope.tenantId)
        .is("voided_at", null)
        .in("order_item_id", itemIds.slice(i, i + 200))
        .returns<{ order_item_id: string; actual_cost: number | string }[]>();
      if (error) fail(error);
      for (const r of data ?? []) costs.set(r.order_item_id, Number(r.actual_cost));
    }
    return costs;
  },

  async materialsUsed(scope, dates) {
    const rows = await allPages<{ material_id: string; qty: number | string; total: number | string; material: { name: string; unit: string } }>((from, to) => {
      let q = createAdminClient()
        .from("material_movements")
        .select("material_id, qty, total, material:materials (name, unit)")
        .eq("tenant_id", scope.tenantId)
        .not("record_id", "is", null);
      if (dates.from) q = q.gte("occurred_on", dates.from);
      if (dates.to) q = q.lte("occurred_on", dates.to);
      return q.order("created_at").range(from, to);
    });
    const by = new Map<string, MaterialFigure>();
    for (const r of rows) {
      const f = by.get(r.material_id) ?? { materialId: r.material_id, name: r.material.name, unit: r.material.unit, qty: 0, value: 0 };
      f.qty = Math.round((f.qty - Number(r.qty)) * 1000) / 1000;
      f.value -= Number(r.total);
      by.set(r.material_id, f);
    }
    return [...by.values()].filter((f) => f.qty !== 0).sort((a, b) => b.value - a.value);
  },

  async recordLines(scope, range) {
    const rows = await allPages<{ lines: { material_id: string; expected_qty: number | string; actual_qty: number | string; unit_cost: number | string; material: { name: string; unit: string } }[] }>(
      (from, to) => {
        let q = createAdminClient()
          .from("production_records")
          .select("lines:production_record_lines (material_id, expected_qty, actual_qty, unit_cost, material:materials (name, unit))")
          .eq("tenant_id", scope.tenantId)
          .is("voided_at", null);
        if (range.from) q = q.gte("created_at", range.from);
        if (range.to) q = q.lt("created_at", range.to);
        return q.order("created_at").range(from, to);
      },
    );
    return rows.flatMap((r) =>
      r.lines.map((l) => ({
        materialId: l.material_id,
        name: l.material.name,
        unit: l.material.unit,
        expectedQty: Number(l.expected_qty),
        actualQty: Number(l.actual_qty),
        unitCost: Number(l.unit_cost),
      })),
    );
  },

  async recordLinesOf(scope, itemIds) {
    const lines: Awaited<ReturnType<ProductionStore["recordLinesOf"]>> = [];
    for (let i = 0; i < itemIds.length; i += 200) {
      const { data, error } = await createAdminClient()
        .from("production_records")
        .select("lines:production_record_lines (material_id, expected_qty, actual_qty, unit_cost, material:materials (name, unit))")
        .eq("tenant_id", scope.tenantId)
        .is("voided_at", null)
        .in("order_item_id", itemIds.slice(i, i + 200))
        .returns<{ lines: { material_id: string; expected_qty: number | string; actual_qty: number | string; unit_cost: number | string; material: { name: string; unit: string } }[] }[]>();
      if (error) fail(error);
      for (const r of data ?? [])
        for (const l of r.lines)
          lines.push({
            materialId: l.material_id,
            name: l.material.name,
            unit: l.material.unit,
            expectedQty: Number(l.expected_qty),
            actualQty: Number(l.actual_qty),
            unitCost: Number(l.unit_cost),
          });
    }
    return lines;
  },

  async journeys(_scope, since) {
    const items = await allPages<{
      id: string;
      order_id: string;
      product: string;
      product_id: string | null;
      worker: { name: string } | null;
      order: { order_no: string; client_name: string; created_at: string; submitted_at: string | null; released_at: string | null; delivery_date: string | null };
    }>((from, to) =>
      createAdminClient()
        .from("order_items")
        .select(
          "id, order_id, product, product_id, worker:workers!assigned_worker_id (name), order:orders!inner (order_no, client_name, created_at, submitted_at, released_at, delivery_date, cancelled_at)",
        )
        .is("order.cancelled_at", null)
        .gte("order.created_at", since)
        .order("created_at")
        .range(from, to),
    );
    // Each item's first time at each step, from the order history.
    const orderIds = [...new Set(items.map((i) => i.order_id))];
    const first = new Map<string, Map<string, string>>();
    const mark = (itemId: string, step: string, at: string) => {
      const steps = first.get(itemId) ?? new Map<string, string>();
      if (!steps.has(step)) steps.set(step, at);
      first.set(itemId, steps);
    };
    for (let i = 0; i < orderIds.length; i += 100) {
      const events = await allPages<{ order_item_id: string | null; action: string; detail: { to?: string } | null; created_at: string }>((from, to) =>
        createAdminClient()
          .from("order_audit_log")
          .select("order_item_id, action, detail, created_at")
          .in("order_id", orderIds.slice(i, i + 100))
          .in("action", ["item_sent_to_factory", "status_advanced", "status_overridden"])
          .not("order_item_id", "is", null)
          .order("created_at")
          .range(from, to),
      );
      for (const e of events) {
        if (!e.order_item_id) continue;
        if (e.action === "item_sent_to_factory") mark(e.order_item_id, "factory", e.created_at);
        else if (e.detail?.to) mark(e.order_item_id, e.detail.to, e.created_at);
      }
    }
    return items.map((i): ItemJourney => {
      const steps = first.get(i.id) ?? new Map<string, string>();
      return {
        itemId: i.id,
        orderNo: i.order.order_no,
        clientName: i.order.client_name,
        productId: i.product_id,
        product: i.product,
        workerName: i.worker?.name ?? null,
        placedAt: i.order.submitted_at ?? i.order.created_at,
        releasedAt: i.order.released_at,
        toFactoryAt: steps.get("factory") ?? null,
        inProductionAt: steps.get("in_production") ?? null,
        checkAt: steps.get("quality_check") ?? null,
        readyAt: steps.get("ready_for_pickup") ?? steps.get("completed") ?? null,
        dueOn: i.order.delivery_date,
      };
    });
  },
};
