-- The assistant reviews orders clients place on the order form: this keeps
-- what it has done with each, so it speaks to the client only once per outcome.
create table assistant_order_reviews (
  order_id      uuid primary key references orders(id) on delete cascade,
  asked_photos  timestamptz,
  asked_price   timestamptz,
  approved_at   timestamptz
);
alter table assistant_order_reviews enable row level security;
