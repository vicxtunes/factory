import { createClient } from "@/lib/supabase/server";
import { ORDER_ITEM_SELECT as ITEM_SELECT } from "@/lib/item-select";
import {
  FACTORY_ORDER_STATUS,
  type Agent,
  type Client,
  type NotificationRow,
  type OrderItemWithOrder,
  type ProductCategory,
} from "@/lib/types";

// Items visible on the factory board: their order is "At Factory".
export async function fetchBoardItems(): Promise<OrderItemWithOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_items")
    .select(ITEM_SELECT)
    .eq("order.status", FACTORY_ORDER_STATUS);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OrderItemWithOrder[];
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
