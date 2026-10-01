-- Indexes for the work boards' recent-orders view and the notification
-- bells. Each was checked with explain analyze on ~20k orders / 60k items.

-- recent_order_items (20261001130000): "order still has an item that isn't
-- completed" — a small slice of order_items, so a partial index.
create index if not exists order_items_open_idx
  on order_items (order_id) where production_status <> 'completed';

-- recent_order_items: "an item of the order changed in the last 30 days".
create index if not exists order_items_updated_at_idx on order_items (updated_at);

-- Client/worker/designer notification bells find notifications through
-- their items; without this every bell scans the whole notifications table.
create index if not exists notifications_order_item_idx
  on notifications (order_item_id, created_at desc);
