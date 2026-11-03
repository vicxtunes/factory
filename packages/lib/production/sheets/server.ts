import "server-only";

// The only file that touches the database for sheet prices.

import { AppError } from "@repo/lib/kernel/core";
import { createAdminClient } from "@repo/lib/supabase/admin";

import type { BookQuote, PackagingOption, SheetMaterialRow, SheetPriceRow } from "./model";
import type { SheetSaveInput } from "./schema";

const REFUSALS: Record<string, string> = {
  duplicate: "The same component is listed twice for one size and choice.",
  no_product: "That product doesn't exist.",
  no_material: "One of those materials doesn't exist.",
};

function fail(error: { message: string }): never {
  const code = /SHEET:(\w+)/.exec(error.message)?.[1];
  if (code && REFUSALS[code]) throw new AppError(REFUSALS[code]);
  throw new Error(`sheets: ${error.message}`);
}

/** What a book comes to for the client; null when the product isn't priced by the sheet. Prices come only from here. */
export async function quoteBook(productId: string, attributes: Record<string, string>): Promise<BookQuote | null> {
  const { data, error } = await createAdminClient().rpc("sheet_book_quote", { p_product: productId, p_attributes: attributes });
  if (error) fail(error);
  if (!data) return null;
  const q = data as { sheetPrice: number; sheets: number | null; lines: { component: string; price: number }[]; packaging: string | null; packagingPrice: number; missing: string[]; total: number | null };
  return {
    sheetPrice: Number(q.sheetPrice),
    sheets: q.sheets === null ? null : Number(q.sheets),
    lines: q.lines.map((l) => ({ component: l.component, price: Number(l.price) })),
    packaging: q.packaging,
    packagingPrice: Number(q.packagingPrice),
    missing: q.missing,
    total: q.total === null ? null : Number(q.total),
  };
}

/** The list price to store on a new or changed line: never blocks an order, a problem just leaves it for the call. */
export async function bookListPrice(productId: string | null, attributes: Record<string, string>): Promise<number | null> {
  if (!productId) return null;
  try {
    return (await quoteBook(productId, attributes))?.total ?? null;
  } catch (err) {
    console.error("sheet price not worked out:", productId, err);
    return null;
  }
}

export async function sheetSetup(productId: string): Promise<{ prices: SheetPriceRow[]; materials: SheetMaterialRow[] }> {
  const db = createAdminClient();
  const [prices, materials] = await Promise.all([
    db.from("sheet_prices").select("component, size, choice, price").eq("product_id", productId).order("sort_order"),
    db.from("sheet_materials").select("material_id, size, choice, qty").eq("product_id", productId).order("sort_order"),
  ]);
  if (prices.error) fail(prices.error);
  if (materials.error) fail(materials.error);
  return {
    prices: (prices.data ?? []).map((p) => ({ component: p.component, size: p.size, choice: p.choice, price: Number(p.price) })),
    materials: (materials.data ?? []).map((m) => ({ materialId: m.material_id, size: m.size, choice: m.choice, qty: Number(m.qty) })),
  };
}

/** Products whose cost comes from what a sheet uses, even with no recipe of their own. */
export async function sheetCostedProducts(): Promise<Set<string>> {
  const { data, error } = await createAdminClient().from("sheet_materials").select("product_id");
  if (error) fail(error);
  return new Set((data ?? []).map((r) => r.product_id as string));
}

/** The Packaging category's products with their price, and cost from their recipes. */
export async function packagingOptions(costOf: (productId: string) => number | null): Promise<PackagingOption[]> {
  const { data, error } = await createAdminClient().from("products").select("id, name, price, active, category:product_categories!inner (name)").eq("active", true).ilike("category.name", "packaging").order("name");
  if (error) fail(error);
  return (data ?? []).map((p) => ({ name: p.name as string, price: Math.round(Number(p.price ?? 0)), cost: costOf(p.id as string) }));
}

export async function saveSheets(input: SheetSaveInput, actor: { id: string; name: string }): Promise<void> {
  const { error } = await createAdminClient().rpc("sheet_save", {
    p_product: input.productId,
    p_prices: input.prices,
    p_materials: input.materials.map((m) => ({ material_id: m.materialId, size: m.size, choice: m.choice, qty: m.qty })),
    p_actor_id: actor.id,
    p_actor_name: actor.name,
  });
  if (error) fail(error);
}
