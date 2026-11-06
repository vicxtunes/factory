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
