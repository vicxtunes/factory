-- Factory Order Tracker — order cancellation
--
-- An order can be cancelled by its client while it's still unconfirmed
-- (released_at is null), or by the boss at any point until every item is
-- completed. Cancellation is order-level and soft: nothing is deleted, the
-- order just drops off every work board (factory, designer, display, Client
-- Orders queue) and shows as "Cancelled" to staff and the client. A reason
-- is always recorded.
alter table orders
  add column cancelled_at timestamptz,
  add column cancel_reason text,
  add column cancelled_by_name text,
  add column cancelled_by_type text;

-- Work boards all filter on "cancelled_at is null"; most rows match, so a
-- partial index on the (rare) cancelled rows keeps the reverse lookup cheap.
create index orders_cancelled_idx on orders (id) where cancelled_at is not null;
