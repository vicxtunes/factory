import { createClient } from "@/lib/supabase/server";
import { ORDER_ITEM_SELECT as ITEM_SELECT } from "@/lib/item-select";
import {
  type Agent,
  type Announcement,
  type Client,
  type Currency,
  type DesignerPublic,
  type MarketingSlide,
  type NotificationRow,
  type OrderItemWithOrder,
  type ProductCategory,
  type ShowroomSettings,
  type WorkerPublic,
} from "@/lib/types";

// Items visible on the factory board: the item itself has reached the
// factory stage — a designer may release items one at a time, so this is
// an item-level check, not an order-level one (see app/graphics/actions.ts).
export async function fetchBoardItems(): Promise<OrderItemWithOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_items")
    .select(ITEM_SELECT)
    .eq("stage", "factory")
    // Client-portal orders sit unreleased (see lib/orders/create.ts's
    // `releaseImmediately`) until the receptionist routes them post-approval
    // — invisible to the factory floor until then. Staff-created orders
    // default released_at to now(), so this is a no-op for them.
    .not("order.released_at", "is", null)
    // Cancelled orders (see Order.cancelled_at) drop off every work board.
    .is("order.cancelled_at", null);
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
    .eq("order.assigned_designer_id", designerId)
    .is("order.cancelled_at", null);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OrderItemWithOrder[];
}

// Every item ever placed by this client — the /client-side portal's "My
// Orders" + "History" views split this by whether every item on the order
// is completed. Same shape/template as fetchDesignerItems above.
export async function fetchClientItems(clientId: string): Promise<OrderItemWithOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_items")
    .select(ITEM_SELECT)
    .eq("order.client_id", clientId)
    .order("created_at", { ascending: false });
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

// The receptionist's quote/approval queue: every item belonging to an order
// that still needs a quote, is awaiting the client's response, or has been
// approved but not yet routed to the factory/a designer. Staff-created
// orders never appear here (they default to approval_status='approved' and
// released_at=now() at creation, matching neither condition below).
export async function fetchApprovalQueueItems(): Promise<OrderItemWithOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_items")
    .select(ITEM_SELECT)
    .or("approval_status.neq.approved,released_at.is.null", { referencedTable: "order" })
    .is("order.cancelled_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OrderItemWithOrder[];
}

// Every item, for the dashboard overview's stats (all order statuses,
// including a client-portal order still sitting unreleased in the
// receptionist's quote queue) — kept separate from fetchOfficeItems below so
// this one page's totals aren't quietly narrowed by that split. Cancelled
// orders are left out — they're not work, and would inflate "not started".
export async function fetchAllItems(): Promise<OrderItemWithOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_items")
    .select(ITEM_SELECT)
    .is("order.cancelled_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OrderItemWithOrder[];
}

// The "Office Orders" board (/dashboard/orders): every item, same as
// fetchAllItems, but only once its order has actually been released —
// same filter and reasoning as fetchBoardItems above. A client-portal order
// still waiting on a quote or the client's approval belongs on the
// receptionist's "Client Orders" queue (fetchApprovalQueueItems) instead,
// not mixed in here alongside confirmed work.
export async function fetchOfficeItems(): Promise<OrderItemWithOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_items")
    .select(ITEM_SELECT)
    .not("order.released_at", "is", null)
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

// Same feed as fetchNotifications, scoped to one client's own orders —
// notifications has no client_id column directly, so this filters through
// the order_items -> orders embed rather than a plain .eq().
export async function fetchClientNotifications(
  clientId: string,
  limit = 10,
): Promise<NotificationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select(
      "id, order_item_id, event_type, message, created_at, order_item:order_items!inner(order:orders!inner(client_id))",
    )
    .eq("order_item.order.client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    order_item_id: row.order_item_id,
    event_type: row.event_type,
    message: row.message,
    created_at: row.created_at,
  })) as NotificationRow[];
}

// Same idea as fetchClientNotifications, scoped by an item's *current*
// assigned_worker_id — a worker reassigned off an item loses visibility of
// its past events, which is the right call (they no longer own it).
export async function fetchWorkerNotifications(
  workerId: string,
  limit = 10,
): Promise<NotificationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select(
      "id, order_item_id, event_type, message, created_at, order_item:order_items!inner(assigned_worker_id)",
    )
    .eq("order_item.assigned_worker_id", workerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    order_item_id: row.order_item_id,
    event_type: row.event_type,
    message: row.message,
    created_at: row.created_at,
  })) as NotificationRow[];
}

// Same idea, scoped by the order's current assigned_designer_id.
export async function fetchDesignerNotifications(
  designerId: string,
  limit = 10,
): Promise<NotificationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select(
      "id, order_item_id, event_type, message, created_at, order_item:order_items!inner(order:orders!inner(assigned_designer_id))",
    )
    .eq("order_item.order.assigned_designer_id", designerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    order_item_id: row.order_item_id,
    event_type: row.event_type,
    message: row.message,
    created_at: row.created_at,
  })) as NotificationRow[];
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
    .select("id, name, email, phone, avatar_url, active, created_at, updated_at")
    .order("name", { ascending: true });
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

// How many orders each client has — used only by the Clients admin panel,
// to show up front (before anyone tries) which clients Delete will
// actually work on: orders.client_id has no cascade/set-null, so a client
// with any order history can't be deleted (see deleteClient in
// app/dashboard/actions.ts). Keyed by client_id; a client with none simply
// has no entry.
export async function fetchClientOrderCounts(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("orders").select("client_id").not("client_id", "is", null);
  if (error) throw new Error(error.message);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    if (!row.client_id) continue;
    counts[row.client_id] = (counts[row.client_id] ?? 0) + 1;
  }
  return counts;
}

// Active workers, safe projection (no pin_hash) — for the responsible-worker
// picker on both new-order surfaces (dashboard + graphics).
export async function fetchActiveWorkersPublic(): Promise<WorkerPublic[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workers_public")
    .select("id, name, station, active")
    .eq("active", true)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as WorkerPublic[];
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
    id, category_id, name, price, description, active, created_at, display_image_url, preview_video_url,
    variants:product_variants (id, product_id, name, price, active, created_at),
    media:product_media (id, product_id, kind, file_name, mime_type, storage_path, secure_url, sort_order, created_at)
  )
`;

// Marketing carousel slides for the client-portal dashboard, each pointing
// at a catalog category. activeOnly=true is what /client-side renders;
// false (all slides, for the boss-only admin panel) is the default so an
// inactive slide doesn't just vanish from the management list.
export async function fetchMarketingSlides(activeOnly = false): Promise<MarketingSlide[]> {
  const supabase = await createClient();
  let query = supabase
    .from("marketing_slides")
    .select("id, image_url, caption, link_url, sort_order, active, created_at, updated_at")
    .order("sort_order", { ascending: true });
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MarketingSlide[];
}

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
      product.media.sort((a, b) => a.sort_order - b.sort_order);
    }
  }
  return categories;
}

// Singleton row — always id 1, created by its migration and never deleted,
// so this can't come back empty.
export async function fetchShowroomSettings(): Promise<ShowroomSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("showroom_settings")
    .select("product_view_mode, show_prices")
    .eq("id", 1)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as ShowroomSettings;
}

// Boss-managed currencies clients may view prices in — see lib/types.ts's
// Currency comment. `activeOnly` is what the client-facing showroom/order
// form want; the dashboard's currency manager passes false to also show
// currencies the boss has retired (still listed, just not offerable).
export async function fetchBaseCurrencySymbol(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("currencies").select("symbol").eq("is_base", true).maybeSingle();
  return data?.symbol?.trim() || "UGX";
}

export async function fetchCurrencies(activeOnly = false): Promise<Currency[]> {
  const supabase = await createClient();
  let query = supabase
    .from("currencies")
    .select("id, code, label, symbol, rate, is_base, active, sort_order")
    .order("sort_order");
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

// Every announcement, active or not, for the dashboard's manager page — the
// popup itself only ever asks lib/announcements/actions.ts's
// getActiveAnnouncement for a single actor-scoped one.
export async function fetchAnnouncements(): Promise<Announcement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, audience, active, created_by_name, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Announcement[];
}
