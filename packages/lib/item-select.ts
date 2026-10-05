import type { SupabaseClient } from "@supabase/supabase-js";

// Shared order_items select fragment — used by both server-side queries
// (packages/lib/queries.ts) and client-side Realtime refetches (factory/dashboard
// boards). Kept in one place so a live board's refetch never drifts from
// the initial server-rendered shape (a past bug: the boards each hardcoded
// their own copy that fell behind when columns were added, so a Realtime
// refetch would silently null out fields the UI expected).
export const ORDER_ITEM_SELECT = `
  id, order_id, product, product_type, category_id, product_id, variant_id,
  attributes, qty, size, cover_type, lamination_type,
  box_type, urgency, stage, production_status, is_delayed, delay_reason,
  assigned_worker_id, media_link, updated_by_worker_id, created_at, updated_at,
  media:order_item_media (id, order_item_id, file_name, mime_type, cloudinary_public_id, storage_path, secure_url, uploaded_at, uploaded_by_type, uploaded_by_id, uploaded_by_name, uploaded_by_role, downloaded_at, downloaded_by_name),
  item_notes:order_notes!order_item_id (id, order_id, order_item_id, author_type, author_id, author_name, author_role, body, created_at),
  unit_price, line_discount_kind, line_discount_value,
  catalog_product:products (price),
  catalog_variant:product_variants (price),
  offer:item_offer,
  category:product_categories (name),
  order:orders!inner (
    order_no, client_id, client_name, client_phone, delivery_date, status, stage, assigned_designer_id,
    designer_name, designer_brief, media_link, media_notes,
    order_type, deadline_at, agent_name, created_at, created_by_name, created_by_role,
    approval_status, quoted_price, client_decision_note, released_at,
    cancelled_at, cancel_reason, cancelled_by_name, cancelled_by_type,
    order_notes:order_notes!order_id (id, order_id, order_item_id, author_type, author_id, author_name, author_role, body, created_at)
  )
`;

/** Completed or cancelled orders stay on the work boards this many days. */
export const RECENT_DAYS = 30;

// What a work board loads: open orders plus those active in the last
// RECENT_DAYS days, whole orders only (the recent_order_items view, which
// hardcodes the same 30 days). Filter, embed and sort it like order_items.
export function selectRecentItems(supabase: SupabaseClient) {
  return supabase.from("recent_order_items").select(ORDER_ITEM_SELECT);
}
