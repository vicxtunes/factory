import { createClient } from "@/lib/supabase/server";
import { ORDER_ITEM_SELECT as ITEM_SELECT } from "@/lib/item-select";
import {
  type Agent,
  type Client,
  type DesignerPublic,
  type NotificationRow,
  type OrderItemWithOrder,
  type ProductCategory,
} from "@/lib/types";

// Items visible on the factory board: the item itself has reached the
// factory stage — a designer may release items one at a time, so this is
// an item-level check, not an order-level one (see app/graphics/actions.ts).
export async function fetchBoardItems(): Promise<OrderItemWithOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_items")
    .select(ITEM_SELECT)
    .eq("stage", "factory");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OrderItemWithOrder[];
}

// Every item ever routed to this designer — including items already sent
// to the factory, or already finished — so an order never just vanishes
// from their board. The client (app/graphics/board.tsx) splits these into
// "in progress" vs. "completed" for display; a designer can still correct
// a mistake on any item the factory hasn't fully completed yet.
export async function fetchDesignerItems(designerId: string): Promise<OrderItemWithOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_items")
    .select(ITEM_SELECT)
    .eq("order.assigned_designer_id", designerId);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OrderItemWithOrder[];
}

export async function fetchDesigners(activeOnly = false): Promise<DesignerPublic[]> {
  const supabase = await createClient();
  let query = supabase.from("designers_public").select("id, name, active").order("name");
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

// Every item, for the dashboard list (all order statuses).
export async function fetchAllItems(): Promise<OrderItemWithOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_items")
    .select(ITEM_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OrderItemWithOrder[];
}

export async function fetchNotifications(limit = 50): Promise<NotificationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, order_item_id, event_type, message, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

// Lightweight id -> name lookup for grouping the dashboard order list by
// category, without pulling the full nested products/attributes catalog.
export async function fetchCategoryNames(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_categories")
    .select("id, name")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchClients(activeOnly = false): Promise<Client[]> {
  const supabase = await createClient();
  let query = supabase
    .from("clients")
    .select("id, name, email, phone, active, created_at, updated_at")
    .order("name", { ascending: true });
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchAgents(activeOnly = false): Promise<Agent[]> {
  const supabase = await createClient();
  let query = supabase
    .from("agents")
    .select("id, name, active, created_at")
    .order("name", { ascending: true });
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

const CATALOG_SELECT = `
  id, name, sort_order, active, created_at,
  attributes:category_attributes (id, category_id, name, type, options, required, sort_order, created_at),
  products (
    id, category_id, name, active, created_at,
    variants:product_variants (id, product_id, name, active, created_at)
  )
`;

// Nested category -> products -> variants + custom-attribute catalog, used
// by the intake wizard's item pickers and the supervisor products panel.
export async function fetchProductCatalog(activeOnly = false): Promise<ProductCategory[]> {
  const supabase = await createClient();
  let query = supabase
    .from("product_categories")
    .select(CATALOG_SELECT)
    .order("sort_order", { ascending: true });
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const categories = (data ?? []) as unknown as ProductCategory[];
  for (const category of categories) {
    category.attributes.sort((a, b) => a.sort_order - b.sort_order);
    if (activeOnly) category.products = category.products.filter((p) => p.active);
    for (const product of category.products) {
      product.variants.sort((a, b) => a.name.localeCompare(b.name));
      if (activeOnly) product.variants = product.variants.filter((v) => v.active);
    }
  }
  return categories;
}
