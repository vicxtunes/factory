// What a product size costs to make, from its recipe and today's material
// prices, and what it earns at its selling price. Pure.

import type { Material, RecipeLine, UnitCost, UsageItem } from "./model";

/** A size's recipe: the product's lines for every size, then the size's own. */
export function recipeFor(lines: RecipeLine[], variantId: string | null): RecipeLine[] {
  return [...lines.filter((l) => l.variantId === null), ...(variantId ? lines.filter((l) => l.variantId === variantId) : [])];
}

const round = (n: number) => Math.round(n);

/** One unit of a recipe at the materials' current prices. */
export function unitCost(recipe: RecipeLine[], materials: Pick<Material, "id" | "kind" | "unitCost">[]): UnitCost {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const cost: UnitCost = { materials: 0, packaging: 0, other: 0, fixed: 0, perDetail: [], unpriced: false };
  const perDetail = new Map<string, number>();
  for (const line of recipe) {
    if (line.materialId === null) {
      cost.other += line.amount ?? 0;
      continue;
    }
    const material = byId.get(line.materialId);
    if (!material || material.unitCost <= 0) cost.unpriced = true;
    const value = (line.qty ?? 0) * (material?.unitCost ?? 0);
    if (line.perAttributeId) {
      perDetail.set(line.perAttributeId, (perDetail.get(line.perAttributeId) ?? 0) + value);
    } else if (material?.kind === "packaging") {
      cost.packaging += value;
    } else {
      cost.materials += value;
    }
  }
  cost.materials = round(cost.materials);
  cost.packaging = round(cost.packaging);
  cost.fixed = cost.materials + cost.packaging + cost.other;
  cost.perDetail = [...perDetail].map(([attributeId, perOne]) => ({ attributeId, perOne: Math.round(perOne * 100) / 100 }));
  return cost;
}

/** The cost of one unit for given detail values (e.g. { pages: 40 }), by attribute id. */
export function costWith(cost: UnitCost, values: Record<string, number>): number {
  return cost.fixed + round(cost.perDetail.reduce((sum, d) => sum + d.perOne * (values[d.attributeId] ?? 0), 0));
}

/** Profit and margin at a selling price; null when there's no price. */
export function margin(price: number | null, cost: number): { profit: number; percent: number } | null {
  if (price === null || price <= 0) return null;
  const profit = price - cost;
  return { profit, percent: Math.round((profit / price) * 1000) / 10 };
}

/**
 * What making `units` of an order item should use, from its recipe: each
 * material's quantity (per-detail lines × that detail's value on the item,
 * read by the attribute's name), and the other costs.
 */
export function expectedUsage(
  recipe: RecipeLine[],
  units: number,
  detailValue: (attributeId: string) => number,
): { materials: { materialId: string; qty: number }[]; otherCost: number } {
  const qty = new Map<string, number>();
  let other = 0;
  for (const line of recipe) {
    if (line.materialId === null) {
      other += (line.amount ?? 0) * units;
      continue;
    }
    const per = line.perAttributeId ? detailValue(line.perAttributeId) : 1;
    qty.set(line.materialId, (qty.get(line.materialId) ?? 0) + (line.qty ?? 0) * per * units);
  }
  return {
    materials: [...qty].map(([materialId, q]) => ({ materialId, qty: Math.round(q * 1000) / 1000 })),
    otherCost: other,
  };
}

/** The catalog as costing needs it (a subset of the app's catalog types). */
export interface CostingCategory {
  id: string;
  name: string;
  /** Number details (e.g. Pages) a recipe line can be per. */
  attributes: { id: string; name: string; type: string }[];
  products: { id: string; name: string; price: number | null; unit: string | null; variants: { id: string; name: string; price: number | null }[] }[];
}

export interface SizeCost {
  variantId: string | null;
  /** The size's name; null for a product without sizes. */
  name: string | null;
  /** Its list price (the size's own, else the product's); null when priced on a call. */
  price: number | null;
  cost: UnitCost;
  /** Per-detail lines named: "per Pages". */
  perDetail: { name: string; perOne: number }[];
  margin: ReturnType<typeof margin>;
}

export interface ProductCost {
  productId: string;
  name: string;
  categoryName: string;
  unit: string | null;
  hasRecipe: boolean;
  sizes: SizeCost[];
}

/**
 * Every product size's cost, price and margin. A margin is only worked out
 * when the cost doesn't depend on a detail (pages): it would mislead otherwise.
 */
export function productCosts(
  catalog: CostingCategory[],
  recipes: Map<string, RecipeLine[]>,
  materials: Pick<Material, "id" | "kind" | "unitCost">[],
): ProductCost[] {
  return catalog.flatMap((category) => {
    const names = new Map(category.attributes.map((a) => [a.id, a.name]));
    return category.products.map((product) => {
      const lines = recipes.get(product.id) ?? [];
      const sizes = product.variants.length ? product.variants.map((v) => ({ id: v.id, name: v.name, price: v.price ?? product.price })) : [{ id: null, name: null, price: product.price }];
      return {
        productId: product.id,
        name: product.name,
        categoryName: category.name,
        unit: product.unit,
        hasRecipe: lines.length > 0,
        sizes: sizes.map((size) => {
          const cost = unitCost(recipeFor(lines, size.id), materials);
          return {
            variantId: size.id,
            name: size.name,
            price: size.price,
            cost,
            perDetail: cost.perDetail.map((d) => ({ name: names.get(d.attributeId) ?? "detail", perOne: d.perOne })),
            margin: lines.length && cost.perDetail.length === 0 ? margin(size.price, cost.fixed) : null,
          };
        }),
      };
    });
  });
}

/** A detail's value on an order item, as a number ("40 pages" → 40); 0 when missing. */
export function detailNumber(attributes: Record<string, string | number>, name: string): number {
  const raw = attributes[name];
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** What an order item should use by its recipe: `attributeNames` maps a detail's id to its name. */
export function usagePlan(item: Pick<UsageItem, "variantId" | "qty" | "attributes">, lines: RecipeLine[], attributeNames: Map<string, string>) {
  return expectedUsage(recipeFor(lines, item.variantId), item.qty, (id) => detailNumber(item.attributes, attributeNames.get(id) ?? ""));
}

/**
 * The lines to save: every material the recipe expects (actual defaults to
 * expected when not given) plus any other material actually used.
 */
export function mergeUsage(expected: { materialId: string; qty: number }[], actual: { materialId: string; qty: number }[]) {
  const used = new Map(actual.map((a) => [a.materialId, a.qty]));
  const lines = expected.map((e) => ({ materialId: e.materialId, expectedQty: e.qty, actualQty: used.get(e.materialId) ?? e.qty }));
  for (const a of actual) if (!expected.some((e) => e.materialId === a.materialId) && a.qty > 0) lines.push({ materialId: a.materialId, expectedQty: 0, actualQty: a.qty });
  return lines;
}
