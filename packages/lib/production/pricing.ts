import "server-only";

// An order line's list price for a product priced per sheet (photo books):
// the catalog's price per sheet for its size × its sheets + the chosen
// packaging's catalog price. Worked out on the server, never from the browser,
// and stored as the line's list price, so discounts, invoices and the call all
// follow. Such a product has no catalog price of its own.

import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

import { PartsCatalog } from "./core/parts";
import { production } from "./server";

/** Null when the product isn't priced per sheet, or something the price needs is missing: it's priced on the call. Never blocks an order. */
export async function partsListPrice(productId: string | null, variantId: string | null, attributes: Record<string, string>): Promise<number | null> {
  if (!productId) return null;
  try {
    const setup = new PartsCatalog(await production.partsBook(await resolveTenantScope())).setup(productId);
    if (setup.pricing.key !== "per_sheet") return null;
    return setup.price({ variantId, details: attributes }, null);
  } catch (err) {
    console.error("price per sheet not worked out:", productId, err);
    return null;
  }
}
