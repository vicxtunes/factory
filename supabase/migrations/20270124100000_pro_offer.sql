-- What Pro gives (owner, 2026-11-22): Free businesses get 2 GB (was 1 GB),
-- Pro 50 GB; Pro has every page look, while a free business can rent a Pro
-- look on its own (boss's rent a month, from UGX 15,000); Pro can put its page
-- on its own domain (the owner asks, Aming connects it).

-- ---- Space: 2 GB free, 48 GB more while Pro is on ----
-- storage_quota_bytes stays "free space + extra bought"; Pro's 48 GB come on
-- top while it lasts, so nothing bought is lost when Pro ends (over the limit:
-- nothing is deleted, new uploads wait for room).
alter table tenants alter column storage_quota_bytes set default 2147483648;
update tenants set storage_quota_bytes = storage_quota_bytes + 1073741824;

create function tenant_space_bytes(p_tenant uuid)
returns bigint
language sql
stable
as $$
  select storage_quota_bytes + case when pro_until > now() then 51539607552 else 0 end from tenants where id = p_tenant;
$$;
revoke all on function tenant_space_bytes(uuid) from public, anon, authenticated;
grant execute on function tenant_space_bytes(uuid) to service_role;

-- As before (20261006100000), with Pro's space.
create or replace function photos_record(
  p_tenant uuid, p_id uuid, p_album uuid, p_large_key text, p_thumb_key text,
  p_width int, p_height int, p_bytes bigint, p_caption text
)
returns void
language plpgsql
as $$
declare
  v_quota bigint;
begin
  perform 1 from tenants where id = p_tenant for update;
  v_quota := tenant_space_bytes(p_tenant);
  if photos_used_bytes(p_tenant) + p_bytes > v_quota then
    raise exception 'PHOTOS:over_quota';
  end if;
  insert into photos (id, tenant_id, album_id, large_key, thumb_key, width, height, bytes, caption, position)
  values (p_id, p_tenant, p_album, p_large_key, p_thumb_key, p_width, p_height, p_bytes, p_caption,
          (select coalesce(max(position), 0) + 1 from photos where album_id = p_album));
end;
$$;

create or replace function photos_set_video(p_tenant uuid, p_album uuid, p_key text, p_bytes bigint)
returns text
language plpgsql
as $$
declare
  v_quota bigint;
  v_old_key text;
  v_old_bytes bigint;
begin
  perform 1 from tenants where id = p_tenant for update;
  v_quota := tenant_space_bytes(p_tenant);
  select video_key, coalesce(video_bytes, 0) into v_old_key, v_old_bytes
    from photo_albums where id = p_album and tenant_id = p_tenant and kind = 'service' for update;
  if not found then
    raise exception 'PHOTOS:no_album';
  end if;
  if photos_used_bytes(p_tenant) - v_old_bytes + p_bytes > v_quota then
    raise exception 'PHOTOS:over_quota';
  end if;
  update photo_albums set video_key = p_key, video_bytes = p_bytes where id = p_album;
  return v_old_key;
end;
$$;

-- As before (20261022100000), with Pro's space.
create or replace function files_record(
  p_tenant uuid, p_id uuid, p_folder uuid, p_name text, p_key text, p_bytes bigint, p_content_type text
)
returns void
language plpgsql
as $$
declare
  v_quota bigint;
begin
  perform 1 from tenants where id = p_tenant for update;
  v_quota := tenant_space_bytes(p_tenant);
  if photos_used_bytes(p_tenant) + p_bytes > v_quota then
    raise exception 'FILES:over_quota';
  end if;
  insert into files (id, tenant_id, folder_id, name, key, bytes, content_type)
  values (p_id, p_tenant, p_folder, p_name, p_key, p_bytes, p_content_type);
end;
$$;

-- ---- Renting a Pro look (free businesses) ----
-- The boss's rent a month for one Pro look; none: looks aren't for rent.
create table look_rent_pricing (
  id          boolean primary key default true check (id),
  price       bigint not null check (price > 0),
  updated_at  timestamptz not null default now()
);
alter table look_rent_pricing enable row level security;
revoke all on table look_rent_pricing from anon, authenticated;
insert into look_rent_pricing (price) values (15000);

-- Each look a business rents, until when.
create table look_rentals (
  tenant_id   uuid not null references tenants(id) on delete cascade,
  template    text not null check (template ~ '^[a-z][a-z0-9-]{1,30}$'),
  until       timestamptz not null,
  auto_renew  boolean not null default false,
  -- The last notice sent about this period ("reminder:<until>", "ended:<until>").
  notice      text,
  primary key (tenant_id, template)
);
alter table look_rentals enable row level security;
revoke all on table look_rentals from anon, authenticated;

-- Rents are paid like Pro months: kept with them, the look named.
alter table pro_payments add column template text;

create function look_rent_price_set(p_price bigint)
returns void
language plpgsql
as $$
begin
  delete from look_rent_pricing where true;
  if p_price is not null then
    insert into look_rent_pricing (price) values (p_price);
  end if;
end;
$$;

-- A month of one look from the owner's Aming card, at the rent the buyer saw.
-- Starts when the current rent of that look ends (or now). Returns the new end.
create function look_rent(p_tenant uuid, p_template text, p_amount bigint, p_auto boolean, p_renew boolean, p_actor_id text, p_actor_name text)
returns timestamptz
language plpgsql
as $$
declare
  v_price bigint;
  v_owner uuid;
  v_until timestamptz;
  v_start timestamptz;
  v_end   timestamptz;
begin
  select price into v_price from look_rent_pricing;
  if v_price is null then
    raise exception 'PRO:not_for_rent';
  end if;
  if v_price <> p_amount then
    raise exception 'PRO:price_changed';
  end if;
  select owner_client_id into v_owner from tenants where id = p_tenant for update;
  if v_owner is null then
    raise exception 'PRO:no_owner';
  end if;
  select until into v_until from look_rentals where tenant_id = p_tenant and template = p_template;
  v_start := greatest(coalesce(v_until, now()), now());
  if v_start > now() + interval '62 days' then
    raise exception 'PRO:too_far';
  end if;
  v_end := v_start + interval '1 month';
  perform wallet_post(v_owner, 'adjustment', -p_amount, null, null, 'Page look: 1 month', 'client', p_actor_id, p_actor_name);
  insert into look_rentals (tenant_id, template, until, auto_renew) values (p_tenant, p_template, v_end, p_renew)
    on conflict (tenant_id, template) do update set until = excluded.until, auto_renew = excluded.auto_renew;
  insert into pro_payments (tenant_id, client_id, amount, starts_at, ends_at, auto, actor_name, template)
  values (p_tenant, v_owner, p_amount, v_start, v_end, p_auto, p_actor_name, p_template);
  return v_end;
end;
$$;

revoke all on function look_rent_price_set(bigint) from public, anon, authenticated;
revoke all on function look_rent(uuid, text, bigint, boolean, boolean, text, text) from public, anon, authenticated;
grant execute on function look_rent_price_set(bigint) to service_role;
grant execute on function look_rent(uuid, text, bigint, boolean, boolean, text, text) to service_role;

-- ---- Own domain (Pro) ----
-- The owner asks for it ('asked'); once its DNS points here and the server
-- has its certificate, Aming turns it on ('live'). Served only while Pro is on.
alter table tenants
  add column custom_domain text unique check (custom_domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$'),
  add column custom_domain_status text check (custom_domain_status in ('asked', 'live')),
  add column custom_domain_at timestamptz,
  add constraint tenants_custom_domain_status check ((custom_domain is null) = (custom_domain_status is null));

-- ---- The chat on a Pro business's page ----
-- Its answers are counted with Alexis's (the daily spending cap), paid by
-- Aming as part of Pro; `visitor` (a browser's random id) limits how many a
-- visitor sends a day.
alter table assistant_runs add column visitor text;
create index assistant_runs_visitor_idx on assistant_runs (visitor, created_at desc) where visitor is not null;

-- ---- The pricing page says what's now in each ----
-- (Its words since 20270123100000; the boss hadn't changed them.)
update pro_page set features = '[
  {"text": "Your business page at amingspace.com/your-name", "free": true},
  {"text": "Bookings, projects, clients and invoices", "free": true},
  {"text": "Drive, team, Books and employees", "free": true},
  {"text": "Paid by clients with MTN, Airtel or the Aming card", "free": true},
  {"text": "2 GB of space (buy more any time)", "free": true},
  {"text": "The Classic page look, and Pro looks to rent at UGX 15,000 a month each", "free": true},
  {"text": "50 GB of space", "free": false},
  {"text": "Every page look, no rent: Showcase and every new one", "free": false},
  {"text": "Your page on your own domain (yourbusiness.com)", "free": false},
  {"text": "A chat on your page that answers your clients about your services, prices and free dates", "free": false},
  {"text": "More Pro features coming", "free": false}
]'::jsonb, updated_at = now();
