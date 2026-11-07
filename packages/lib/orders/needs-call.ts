import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isPhotobookCategory } from "./photobook";

/**
 * Whether an order still needs reception to phone the client: a photo book on
 * it has no price (none from its recipe, none in the catalog). A priced photo
 * book skips the call like any other order (owner, 2026-11-07).
 */
export async function orderNeedsCall(db: SupabaseClient, orderId: string): Promise<boolean> {
  const { data, error } = await db
    .from("order_items")
    .select("list_unit_price, category:product_categories (name), catalog_product:products (price), catalog_variant:product_variants (price)")
    .eq("order_id", orderId)
    .returns<{ list_unit_price: number | null; category: { name: string } | null; catalog_product: { price: number | null } | null; catalog_variant: { price: number | null } | null }[]>();
  if (error) throw new Error(`orders: ${error.message}`);
  return (data ?? []).some(
    (i) => isPhotobookCategory(i.category?.name) && (i.catalog_variant?.price ?? i.catalog_product?.price ?? i.list_unit_price) == null,
  );
}
