// Shared order_items select fragment — used by both server-side queries
// (lib/queries.ts) and client-side Realtime refetches (factory/dashboard
// boards). Kept in one place so a live board's refetch never drifts from
// the initial server-rendered shape (a past bug: the boards each hardcoded
// their own copy that fell behind when columns were added, so a Realtime
// refetch would silently null out fields the UI expected).
export const ORDER_ITEM_SELECT = `
  id, order_id, product, product_type, category_id, product_id, variant_id,
  attributes, qty, size, cover_type, lamination_type,
  box_type, urgency, stage, production_status, is_delayed, delay_reason,
  assigned_worker_id, media_link, updated_by_worker_id, created_at, updated_at,
  media:order_item_media (id, order_item_id, file_name, mime_type, cloudinary_public_id, storage_path, secure_url, uploaded_at, uploaded_by_type, uploaded_by_id, uploaded_by_name, uploaded_by_role),
  item_notes:order_notes!order_item_id (id, order_id, order_item_id, author_type, author_id, author_name, author_role, body, created_at),
  order:orders!inner (
    order_no, client_id, client_name, client_phone, delivery_date, status, stage, assigned_designer_id,
    designer_name, designer_brief, media_link, media_notes,
    order_type, deadline_at, agent_name, created_at, created_by_name, created_by_role,
    approval_status, quoted_price, client_decision_note, released_at,
    cancelled_at, cancel_reason, cancelled_by_name, cancelled_by_type,
    order_notes:order_notes!order_id (id, order_id, order_item_id, author_type, author_id, author_name, author_role, body, created_at)
  )
`;
