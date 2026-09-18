-- Factory Order Tracker — product media + per-variant pricing
--
-- Two independent additions once the catalog data entry needed to grow up:
--   1. Media per product: a single display image, a single preview video,
--      and an open-ended gallery of extra photos/videos (shown behind a
--      "View more detail" toggle in the showroom). Files live in a new
--      Supabase Storage bucket, same signed-upload pattern as order photos
--      (see 20260911120000_order_media_bucket.sql) — public bucket so
--      getPublicUrl() works directly in <img>/<video> with no auth, same
--      posture as every other media bucket in this app.
--   2. Per-variant pricing, overriding the product's own price (e.g. a
--      larger size costs more). Nullable and falls back to the product
--      price when unset, same "no fake $0.00" philosophy as
--      20260917150000_product_price.sql.
--
-- Prices recorded here aren't shown to clients yet — the boss wants pricing
-- held back from the showroom for now. That's a display-layer decision made
-- in the client-side app, not a schema one, so nothing here gates on it.

alter table product_variants add column price numeric(10, 2);

alter table products
  add column display_image_path text,
  add column display_image_url  text,
  add column preview_video_path text,
  add column preview_video_url  text;

create table product_media (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products (id) on delete cascade,
  kind         text not null check (kind in ('photo', 'video')),
  file_name    text not null,
  mime_type    text,
  storage_path text not null,
  secure_url   text not null,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create index product_media_product_idx on product_media (product_id);

alter table product_media enable row level security;

create policy "read product_media" on product_media
  for select to anon, authenticated using (true);

insert into storage.buckets (id, name, public, file_size_limit)
values ('product-media', 'product-media', true, 209715200) -- 200MiB ceiling, same as order-media
on conflict (id) do nothing;
