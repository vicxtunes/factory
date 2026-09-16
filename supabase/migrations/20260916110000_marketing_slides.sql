-- Factory Order Tracker — client-portal marketing carousel
--   Staff-managed promotional slides shown at the top of the client
--   dashboard (/client-side), each pointing at one product category in the
--   existing catalog. Management is boss-only, same as the rest of the
--   product catalog (see product_categories/products RLS comments).

create table marketing_slides (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references product_categories (id) on delete cascade,
  image_url   text not null,
  caption     text,
  sort_order  int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index marketing_slides_category_idx on marketing_slides (category_id);
create index marketing_slides_sort_idx on marketing_slides (sort_order);

create trigger marketing_slides_set_updated_at
  before update on marketing_slides
  for each row execute function set_updated_at();

alter table marketing_slides enable row level security;

-- Public marketing content, no PII — same posture as product_categories/
-- products (anon-readable). Writes go through the service-role admin
-- client from the boss-gated /dashboard/marketing panel only.
create policy "read marketing_slides" on marketing_slides
  for select to anon, authenticated using (true);
