-- The photos and files a client sends with an order from a studio's product
-- page, for the studio to make it from: uploads (in the order-media bucket,
-- like a factory order's) and pasted links. Needed before an order can be paid.

alter table product_requests add constraint product_requests_tenant_id_id_key unique (tenant_id, id);

create table product_request_media (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  request_id    uuid not null,
  file_name     text not null check (char_length(file_name) <= 300),
  -- Null for a pasted link.
  storage_path  text unique,
  mime_type     text,
  url           text not null check (url ~* '^https?://'),
  created_at    timestamptz not null default now(),
  -- Gone with its order; always this studio's own order.
  foreign key (tenant_id, request_id) references product_requests (tenant_id, id) on delete cascade
);

create index product_request_media_request on product_request_media (tenant_id, request_id);

-- Server (service role) only; every query filters by the caller's studio.
alter table product_request_media enable row level security;
revoke all on table product_request_media from anon, authenticated;
