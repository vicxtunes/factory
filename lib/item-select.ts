// Shared order_items select fragment — used by both server-side queries
// (lib/queries.ts) and client-side Realtime refetches (factory/dashboard
// boards). Kept in one place so a live board's refetch never drifts from
// the initial server-rendered shape (a past bug: the boards each hardcoded
// their own copy that fell behind when columns were added, so a Realtime
// refetch would silently null out fields the UI expected).
export const ORDER_ITEM_SELECT = `
  id, order_id, product, product_type, category_id, product_id, variant_id,
  attributes, qty, size, cover_type, lamination_type,
  box_type, urgency, item_notes, production_status, is_delayed, delay_reason,
  assigned_worker_id, media_link, updated_by_worker_id, created_at, updated_at,
  media:order_item_media (id, file_name, mime_type, cloudinary_public_id, secure_url, uploaded_at),
  order:orders!inner (
    order_no, client_name, delivery_date, status, stage, assigned_designer_id,
    designer_name, designer_brief, media_link, media_notes,
    order_type, deadline_at, agent_name
  )
`;
