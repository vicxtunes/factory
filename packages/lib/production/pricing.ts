import "server-only";

// An order line's list price from its product's parts, for products priced
// that way (photo books): worked out on the server, never from the browser.
// It's stored as the line's list price, so discounts, invoices and the call all
// follow. Such a product has no catalog price (parts_save_product refuses one).

import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

import { PartsCatalog } from "./core/parts";
import { production } from "./server";

/** Null when the product isn't priced by its parts, or something the price needs is missing: it's priced on the call. Never blocks an order. */
export async function partsListPrice(productId: string | null, variantId: string | null, attributes: Record<string, string>): Promise<number | null> {
  if (!productId) return null;
  try {
    const setup = new PartsCatalog(await production.partsBook(await resolveTenantScope())).setup(productId);
    if (setup.pricing.key !== "parts") return null;
    return setup.price({ variantId, details: attributes }, null);
  } catch (err) {
    console.error("price from parts not worked out:", productId, err);
    return null;
  }
}
