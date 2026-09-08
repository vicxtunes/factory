-- Factory Order Tracker — development seed data
-- Safe to run against a fresh database. Worker PINs below are for local dev only.
--
-- Worker PINs:
--   Amina Diallo   station Printing     PIN 1111
--   Kofi Mensah    station Binding      PIN 2222
--   Lucia Romano   station Lamination   PIN 3333
--   Sam Okoro      station Finishing    PIN 4444
--
-- Supervisor / boss accounts are Supabase Auth users — create them in the
-- dashboard (Authentication > Users), then insert matching profiles rows:
--   insert into profiles (id, role, full_name)
--   values ('<auth-user-uuid>', 'supervisor', 'Supervisor Name');
--   insert into profiles (id, role, full_name)
--   values ('<auth-user-uuid>', 'boss', 'Boss Name');

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Stations
-- ---------------------------------------------------------------------------
insert into stations (name) values
  ('Printing'), ('Binding'), ('Lamination'), ('Finishing');

-- ---------------------------------------------------------------------------
-- Workers
-- ---------------------------------------------------------------------------
insert into workers (id, name, pin_hash, station, active) values
  ('11111111-1111-1111-1111-111111111111', 'Amina Diallo', crypt('1111', gen_salt('bf', 10)), 'Printing',   true),
  ('22222222-2222-2222-2222-222222222222', 'Kofi Mensah',  crypt('2222', gen_salt('bf', 10)), 'Binding',    true),
  ('33333333-3333-3333-3333-333333333333', 'Lucia Romano', crypt('3333', gen_salt('bf', 10)), 'Lamination', true),
  ('44444444-4444-4444-4444-444444444444', 'Sam Okoro',    crypt('4444', gen_salt('bf', 10)), 'Finishing',  true);

-- ---------------------------------------------------------------------------
-- Orders + items
-- ---------------------------------------------------------------------------
insert into orders (id, order_no, client_name, delivery_date, status, order_notes, media_link, media_notes) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '2026-3956', 'Okafor Wedding',   current_date + 5, 'At Factory', 'Handle with care — client is a repeat VIP.', 'https://drive.google.com/drive/folders/example-3956', 'Ask Agent Jeff for folder access.'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '2026-3971', 'Adeleke Studios',  current_date + 2, 'At Factory', null, 'https://www.dropbox.com/sh/example-3971', 'Password: studio2026'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '2026-3980', 'Mensah Family',    current_date + 9, 'At Factory', 'Reprint of a damaged 2025 book.', 'https://drive.google.com/drive/folders/example-3980', null),
  ('aaaaaaaa-0000-0000-0000-000000000004', '2026-3990', 'City Hall Event',  current_date + 1, 'Quote', null, null, null);

insert into order_items
  (order_id, product, product_type, qty, size, cover_type, lamination_type, box_type, urgency, item_notes, production_status, assigned_worker_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Photo Books', 'Photo Book Hard Cover Pro', 2, '12 by 12', 'Leather', 'Matte', 'Rigid Box', 'urgent', 'Gold foil on spine.', 'in_production', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Prints',      'Fine Art Print',            25, '8 by 10', null, 'Luster', null, 'normal', null, 'not_started', null),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Photo Books', 'Photo Book Soft Cover',      1, '10 by 10', 'Soft Touch', 'Gloss', null, 'rush', 'Client needs this first.', 'quality_check', '22222222-2222-2222-2222-222222222222'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Album Box',   'Linen Presentation Box',     1, '11 by 11', null, null, 'Magnetic', 'rush', null, 'not_started', null),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Photo Books', 'Photo Book Hard Cover Pro',  1, '12 by 12', 'Linen', 'Matte', 'Rigid Box', 'normal', 'Match 2025 layout exactly.', 'ready_for_pickup', '33333333-3333-3333-3333-333333333333'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'Prints',      'Standard Print',            100, '6 by 4', null, null, null, 'normal', 'Waiting on quote approval.', 'not_started', null);

-- One delayed item to exercise the notification feed
update order_items
set is_delayed = true, delay_reason = 'Leather cover stock out of stock — reorder placed'
where order_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  and product = 'Photo Books';

-- ---------------------------------------------------------------------------
-- Agents + clients — for exercising the intake wizard's pickers. The
-- product catalog (Photo Books/Prints + attributes) is seeded by the
-- 20260908120000_clients_agents_products.sql migration itself, not here.
-- ---------------------------------------------------------------------------
insert into agents (name) values
  ('Jeff Adeyemi'), ('Grace Owusu');

insert into clients (name, email, phone) values
  ('Okafor Wedding', 'okafor@example.com', '+234 800 000 0001'),
  ('Adeleke Studios', 'studio@example.com', '+234 800 000 0002'),
  ('Mensah Family', null, '+234 800 000 0003');
