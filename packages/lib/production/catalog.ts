import "server-only";

// The live catalog as costing needs it: active products and sizes with their
// list prices, and each category's number details (e.g. Pages).

import { fetchProductCatalog } from "@repo/lib/queries";

import type { CostingCategory } from "./core/costing";

export async function costingCatalog(): Promise<CostingCategory[]> {
  const catalog = await fetchProductCatalog(true);
  return catalog.map((c) => ({
    id: c.id,
    name: c.name,
    attributes: c.attributes.filter((a) => a.type === "number").map((a) => ({ id: a.id, name: a.name, type: a.type })),
    products: c.products.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      unit: p.unit,
      variants: p.variants.map((v) => ({ id: v.id, name: v.name, price: v.price })),
    })),
  }));
}
