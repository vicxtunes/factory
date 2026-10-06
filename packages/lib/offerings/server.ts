import "server-only";

// The offering service wired to this app's store, and Aming's catalog as
// studios' products see it. Pages and actions import from here.

import { fetchProductCatalog } from "@repo/lib/queries";
import type { Product } from "@repo/lib/types";

import { supabaseOfferingStore } from "./adapters/supabase/store";
import { OfferingService } from "./service";

export const offerings = new OfferingService(supabaseOfferingStore);

/**
 * Aming's products on sale (active, in an active category), by id: what a
 * studio picks from, and what its picked products show. A picked product
 * Aming no longer has on sale is off the studio's showroom.
 */
export async function amingProducts(): Promise<Map<string, Product>> {
  return new Map((await fetchProductCatalog(true)).flatMap((c) => c.products.map((p) => [p.id, p] as const)));
}
