import { createClient } from "@/lib/supabase/server";
import {
  FACTORY_ORDER_STATUS,
  type NotificationRow,
  type OrderItemWithOrder,
} from "@/lib/types";

const ITEM_SELECT = `
  id, order_id, product, product_type, qty, size, cover_type, lamination_type,
  box_type, urgency, item_notes, production_status, is_delayed, delay_reason,
  assigned_worker_id, media_link, updated_by_worker_id, created_at, updated_at,
  order:orders!inner (
    order_no, client_name, delivery_date, status, media_link, media_notes
  )
`;

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
