// What each product costs to make, from its setup (core/parts.ts) and today's
// prices, and what it earns at its selling price. Pure.

import { PartsCatalog, rowMargin, type CostRow, type Pricing } from "./parts";

/** Profit and margin at a selling price; null when there's no price. */
export function margin(price: number | null, cost: number): { profit: number; percent: number } | null {
  if (price === null || price <= 0) return null;
  const profit = price - cost;
  return { profit, percent: Math.round((profit / price) * 1000) / 10 };
}

/** The catalog as costing needs it (a subset of the app's catalog types). */
export interface CostingCategory {
  id: string;
  name: string;
  /** The order form's details (Pages, NOS, Lamination…), with a choice's options. */
  attributes: { id: string; name: string; type: string; options: string[] }[];
  products: { id: string; name: string; price: number | null; unit: string | null; variants: { id: string; name: string; price: number | null }[] }[];
}

export interface ProductCost {
  productId: string;
  name: string;
  categoryName: string;
  unit: string | null;
  pricing: Pricing;
  isSetUp: boolean;
  rows: (CostRow & { margin: ReturnType<typeof rowMargin> })[];
}

/** Every product's cost, price and margin by size, from its setup. */
export function productCosts(catalog: CostingCategory[], parts: PartsCatalog): ProductCost[] {
  return catalog.flatMap((category) =>
    category.products.map((product) => {
      const setup = parts.setup(product.id);
      return {
        productId: product.id,
        name: product.name,
        categoryName: category.name,
        unit: product.unit,
        pricing: setup.pricing.key,
        isSetUp: setup.isSetUp,
        rows: setup.isSetUp ? setup.rows(product.variants, product.price).map((r) => ({ ...r, margin: rowMargin(r, setup.pricing.key) })) : [],
      };
    }),
  );
}

/**
 * The lines to save: every part the setup expects (actual defaults to
 * expected when not given) plus any other part actually used.
 */
export function mergeUsage(expected: { materialId: string; qty: number }[], actual: { materialId: string; qty: number }[]) {
  const used = new Map(actual.map((a) => [a.materialId, a.qty]));
  const lines = expected.map((e) => ({ materialId: e.materialId, expectedQty: e.qty, actualQty: used.get(e.materialId) ?? e.qty }));
  for (const a of actual) if (!expected.some((e) => e.materialId === a.materialId) && a.qty > 0) lines.push({ materialId: a.materialId, expectedQty: 0, actualQty: a.qty });
  return lines;
}
