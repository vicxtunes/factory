-- Factory Order Tracker — receptionist quote/approval gate
--
-- Client-portal orders no longer land straight in the shared production
-- queue: they go to the receptionist first, who manually quotes a total
-- price (prices vary per job — never auto-summed from the catalog), the
-- client approves or requests changes, and only after approval does the
-- receptionist explicitly route the order to the factory or a designer.
--
-- Staff-created orders (dashboard's own order form, an in-house designer's
-- walk-in order) already go through a human at intake and must be
-- completely unaffected — approval_status defaults to 'approved' and
-- released_at defaults to now(), so every existing row and every future
-- staff-created order is already "through the gate" the instant it's
-- inserted. Only lib/orders/create.ts's client-portal path explicitly
-- inserts 'pending_review' / a null released_at.
create type order_approval_status as enum (
  'pending_review',
  'awaiting_client_approval',
  'approved',
  'changes_requested'
);

alter table orders
  add column approval_status order_approval_status not null default 'approved',
  add column quoted_price numeric(10, 2),
  add column client_decision_note text,
  add column released_at timestamptz not null default now();

create index orders_approval_status_idx on orders (approval_status);
-- The receptionist queue's exact filter (approved orders not yet routed,
-- or anything not yet approved) and the factory board's new join condition
-- both hit "released_at is null" — a partial index keeps both cheap even
-- though the table default means most rows never match it.
create index orders_unreleased_idx on orders (id) where released_at is null;
