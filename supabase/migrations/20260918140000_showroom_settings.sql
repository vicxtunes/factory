-- Factory Order Tracker — showroom display mode setting
--
-- Clicking a product in the showroom grid now opens a full-screen studio
-- view of that one product (see app/client-side/product-showcase.tsx),
-- replacing the small detail drawer and the old shuffled-deck "Free Walk"
-- tab. Its image area can be either the scroll-driven 3D scene (the old
-- Free Walk visual, now cycling through one product's own photos) or a
-- plain photo/video carousel — the boss picks which from the dashboard
-- Products page, since neither is objectively better (3D is flashier but
-- can't show video; carousel shows everything a product has uploaded).
--
-- Singleton table (single row, id fixed to 1) rather than a generic
-- key-value settings table — there's exactly one setting today and no
-- indication more are coming, so a dedicated column beats a jsonb blob.
create table showroom_settings (
  id                 int primary key default 1,
  product_view_mode  text not null default 'carousel' check (product_view_mode in ('carousel', 'scene')),
  updated_at         timestamptz not null default now(),
  constraint showroom_settings_singleton check (id = 1)
);

insert into showroom_settings (id) values (1);

alter table showroom_settings enable row level security;

create policy "read showroom_settings" on showroom_settings
  for select to anon, authenticated using (true);
