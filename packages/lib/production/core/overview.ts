// Production's overview for a period: what was sold, what making it cost,
// the gross profit per product, and the wastage by material. Pure.
//
// Sales are counted as Accounts counts them (an invoiced, live order, on its
// invoice's issue date, at the order's agreed total), so the two agree; an
// order's total is shared out over its lines by their confirmed prices. An
// item's cost is its production record's actual cost when one exists, else
// its recipe's estimate at today's prices; an item with no recipe costs 0
// and is shown as such, so the gap is visible rather than hidden.

import { costWith, detailNumber, recipeFor, unitCost } from "./costing";
import type { Material, RecipeLine } from "./model";

export interface SoldItem {
  itemId: string;
  productId: string | null;
  product: string;
  variantId: string | null;
  qty: number;
  unitPrice: number | null;
  attributes: Record<string, string | number>;
}

export interface SoldOrder {
  /** The order's agreed total (orders.quoted_price), what Accounts counts. */
  total: number;
  items: SoldItem[];
}

export interface ProductFigures {
  key: string;
  name: string;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
  /** null without revenue. */
  marginPercent: number | null;
  /** Part of the cost is a recipe estimate (no usage recorded). */
  estimated: boolean;
  /** No recipe: its cost isn't known. */
  noRecipe: boolean;
}

export interface PeriodFigures {
  revenue: number;
  cost: number;
  profit: number;
  marginPercent: number | null;
  /** How the cost is known: from recorded usage, from recipes, or not at all (revenue with no recipe). */
  costRecorded: number;
  costEstimated: number;
  revenueWithoutRecipe: number;
  products: ProductFigures[];
}

export interface MaterialFigure {
  materialId: string;
  name: string;
  unit: string;
  qty: number;
  value: number;
}

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/** An order's total shared over its lines by their confirmed prices (by quantity when none has one); the shares add up exactly. */
export function shareRevenue(order: SoldOrder): Map<string, number> {
  const weights = order.items.map((i) => (i.unitPrice ?? 0) * i.qty);
  const sum = weights.reduce((a, b) => a + b, 0);
  const use = sum > 0 ? weights : order.items.map((i) => i.qty);
  const whole = use.reduce((a, b) => a + b, 0);
  const shares = new Map<string, number>();
  let given = 0;
  order.items.forEach((item, idx) => {
    const last = idx === order.items.length - 1;
    const share = last ? order.total - given : whole > 0 ? Math.round((order.total * use[idx]) / whole) : 0;
    shares.set(item.itemId, share);
    given += share;
  });
  return shares;
}

export function periodFigures(
  orders: SoldOrder[],
  /** Live production records' actual cost, by item. */
  recorded: Map<string, number>,
  recipes: Map<string, RecipeLine[]>,
  materials: Pick<Material, "id" | "kind" | "unitCost">[],
  /** A number detail's name by id (recipes refer to ids, items carry names). */
  detailNames: Map<string, string>,
): PeriodFigures {
  const byProduct = new Map<string, ProductFigures>();
  let costRecorded = 0;
  let costEstimated = 0;
  let revenueWithoutRecipe = 0;

  for (const order of orders) {
    const shares = shareRevenue(order);
    for (const item of order.items) {
      const revenue = shares.get(item.itemId) ?? 0;
      const lines = (item.productId && recipes.get(item.productId)) || [];
      let cost = 0;
      let estimated = false;
      let noRecipe = false;
      if (recorded.has(item.itemId)) {
        cost = recorded.get(item.itemId) ?? 0;
        costRecorded += cost;
      } else if (lines.length) {
        const unit = unitCost(recipeFor(lines, item.variantId), materials);
        const values = Object.fromEntries(unit.perDetail.map((d) => [d.attributeId, detailNumber(item.attributes, detailNames.get(d.attributeId) ?? "")]));
        cost = costWith(unit, values) * item.qty;
        costEstimated += cost;
        estimated = true;
      } else {
        noRecipe = true;
        revenueWithoutRecipe += revenue;
      }

      const key = item.productId ?? `name:${item.product}`;
      const p = byProduct.get(key) ?? { key, name: item.product, units: 0, revenue: 0, cost: 0, profit: 0, marginPercent: null, estimated: false, noRecipe: false };
      p.units += item.qty;
      p.revenue += revenue;
      p.cost += cost;
      p.estimated ||= estimated;
      p.noRecipe ||= noRecipe;
      byProduct.set(key, p);
    }
  }

  const products = [...byProduct.values()]
    .map((p) => ({ ...p, profit: p.revenue - p.cost, marginPercent: p.noRecipe ? null : percent(p.revenue - p.cost, p.revenue) }))
    .sort((a, b) => b.profit - a.profit || b.revenue - a.revenue);
  const revenue = products.reduce((s, p) => s + p.revenue, 0);
  const cost = costRecorded + costEstimated;
  return {
    revenue,
    cost,
    profit: revenue - cost,
    marginPercent: percent(revenue - cost, revenue),
    costRecorded,
    costEstimated,
    revenueWithoutRecipe,
    products,
  };
}

/** Wastage by material: what records used beyond what they expected (net of savings), at the prices then; most first. */
export function wastageByMaterial(
  lines: { materialId: string; name: string; unit: string; expectedQty: number; actualQty: number; unitCost: number }[],
): MaterialFigure[] {
  const by = new Map<string, MaterialFigure>();
  for (const l of lines) {
    const extra = l.actualQty - l.expectedQty;
    if (extra === 0) continue;
    const f = by.get(l.materialId) ?? { materialId: l.materialId, name: l.name, unit: l.unit, qty: 0, value: 0 };
    f.qty = Math.round((f.qty + extra) * 1000) / 1000;
    f.value += Math.round(extra * l.unitCost);
    by.set(l.materialId, f);
  }
  return [...by.values()].filter((f) => f.value !== 0 || f.qty !== 0).sort((a, b) => b.value - a.value);
}
