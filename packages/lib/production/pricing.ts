import "server-only";

// An order line's list price for a photo book priced from its recipe (from the
// margin, or from its materials' selling prices, plus its add-ons). Worked out
// on the server, never from the browser, and stored as the line's list price,
// so discounts, invoices and the call all follow. Such a product has no catalog
// price of its own.

import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

import { Costing } from "./core/recipes";
import { production } from "./server";

/** Null when the product isn't priced from its recipe, or something its price needs is missing: it's priced on the call. Never blocks an order. */
export async function recipeListPrice(productId: string | null, variantId: string | null, attributes: Record<string, string>): Promise<number | null> {
  if (!productId) return null;
  try {
    const costing = new Costing(await production.costBook(await resolveTenantScope()));
    const variantName = costing.product(productId)?.variants.find((v) => v.id === variantId)?.name ?? null;
    return costing.quote(productId, { variantId, variantName, details: attributes }).price;
  } catch (err) {
    console.error("price from the recipe not worked out:", productId, err);
    return null;
  }
}

/** How a photo book's price is made up, as a client may see it: selling prices only, never a cost or the margin. */
export interface PriceExplained {
  price: number;
  /** "materials": each part at its selling price; "margin": the book as one amount (its parts' costs stay private). */
  method: "materials" | "margin";
  /** One book's parts: quantity × selling price each ("materials"); the book itself as one line ("margin"). */
  parts: { name: string; qty: number; each: number; total: number }[];
  /** Lamination, packaging and the like, at their catalog prices. */
  addOns: { name: string; price: number }[];
  /** Parts with no selling price yet, counted as 0. */
  notSet: string[];
}

/** Null when the product isn't priced from its recipe (its catalog price is the whole story) or has no price. */
export async function explainListPrice(productId: string, variantId: string | null, attributes: Record<string, string>): Promise<PriceExplained | null> {
  const costing = new Costing(await production.costBook(await resolveTenantScope()));
  const variantName = costing.product(productId)?.variants.find((v) => v.id === variantId)?.name ?? null;
  const q = costing.quote(productId, { variantId, variantName, details: attributes });
  if (q.price == null || !q.method) return null;
  const addOns = q.addOns.map((a) => ({ name: `${a.kind}: ${a.name}`, price: a.price ?? 0 }));
  const addOnTotal = addOns.reduce((s, a) => s + a.price, 0);
  const parts =
    q.method === "materials"
      ? q.lines.map((l) => ({ name: l.name, qty: l.qty, each: l.sell ?? 0, total: Math.round((l.sell ?? 0) * l.qty) }))
      : [{ name: "The book (its sheets, cover and binding)", qty: 1, each: q.price - addOnTotal, total: q.price - addOnTotal }];
  // What wasn't set is named only by part: a missing cost would say nothing a client should hear.
  const notSet = q.method === "materials" ? q.lines.filter((l) => l.sell === null).map((l) => l.name) : [];
  return { price: q.price, method: q.method, parts, addOns, notSet };
}
