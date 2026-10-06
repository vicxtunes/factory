-- Services and their packages (see packages/lib/offerings/README.md).
--
-- A studio sells services ("Wedding Photography"), each with packages as its
-- tiers ("Gold", "Silver", "Bronze", "Custom"): every package has its own
-- price, description and what's included. Services are what the studio's
-- showroom shows, with a cover photo, a gallery and a preview video (a
-- private photo album of kind 'service', below).
--
-- Packages stay in the offerings table, so quotation and invoice lines that
-- point at one (billing_lines.offering_id) keep working. Every existing
-- offering becomes a package of a new service with the same name; studios
-- regroup their tiers from there.

create table offering_services (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants (id) on delete restrict,
  name         text not null check (nullif(trim(name), '') is not null and char_length(name) <= 80),
  -- Its page's address under the studio's: /<studio>/s/<slug>. Never changes,
  -- so shared links keep working when the service is renamed.
  slug         text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 90),
  description  text check (char_length(description) <= 2000),
  -- The showroom's order, smallest first.
  position     int not null default 0,
  -- Archived instead of deleted: its packages are on quotations.
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, slug)
);

-- Two services on sale can't share a name (archived ones don't count).
create unique index offering_services_tenant_active_name on offering_services (tenant_id, lower(name)) where archived_at is null;

create trigger offering_services_set_updated_at
  before update on offering_services
  for each row execute function set_updated_at();

-- Server (service role) only; every query filters by the caller's studio.
alter table offering_services enable row level security;
revoke all on table offering_services from anon, authenticated;

-- --- Every existing offering becomes a package of its own service -----------

alter table offerings
  add column service_id uuid,
  -- The order of a service's packages, smallest first.
  add column position int not null default 0;

update offerings set service_id = gen_random_uuid();

-- Slugs from names, made unique within each studio with -2, -3, … in the
-- order the offerings were created.
insert into offering_services (id, tenant_id, name, slug, description, archived_at, created_at)
select service_id, tenant_id, name,
       case when n = 1 then base else base || '-' || n end,
       null, archived_at, created_at
from (
  select o.*, row_number() over (partition by tenant_id, base order by created_at, id) as n
  from (
    select o.*, coalesce(nullif(left(trim(both '-' from regexp_replace(lower(o.name), '[^a-z0-9]+', '-', 'g')), 80), ''), 'service') as base
    from offerings o
  ) o
) o;

alter table offerings
  alter column service_id set not null,
  -- A package and its service always belong to the same studio.
  add constraint offerings_service_fkey foreign key (tenant_id, service_id) references offering_services (tenant_id, id) on delete restrict,
  -- No longer used: every offering is a package now. Kept (with a default)
  -- only so the code deployed before this migration keeps reading while the
  -- new code goes live; a later migration drops it.
  alter column kind set default 'package';

-- Package names are unique within their service, so every service can have
-- its own "Gold".
drop index offerings_tenant_active_name;
create unique index offerings_service_active_name on offerings (service_id, lower(name)) where archived_at is null;
create index offerings_service on offerings (service_id);

-- --- A service's photos and preview video: a private album of its own -------

alter table photo_albums
  -- The service a 'service' album belongs to (one each).
  add column service_id uuid,
  -- The service's preview video; it counts toward the allowance like photos.
  add column video_key text,
  add column video_bytes bigint check (video_bytes >= 0),
  add constraint photo_albums_service_fkey foreign key (tenant_id, service_id) references offering_services (tenant_id, id) on delete cascade,
  add constraint photo_albums_video_shape check ((video_key is null) = (video_bytes is null) and (video_key is null or kind = 'service')),
  drop constraint photo_albums_kind_check,
  add constraint photo_albums_kind_check check (kind in ('portfolio', 'delivery', 'service')),
  drop constraint photo_albums_delivery_shape,
  -- Shown through the service's page only: never public on its own, never shared by link.
  add constraint photo_albums_kind_shape check (
    (kind = 'portfolio' and project_id is null and service_id is null and share_token is null and share_expires_on is null)
    or (kind = 'delivery' and project_id is not null and service_id is null and not is_public)
    or (kind = 'service' and service_id is not null and project_id is null and share_token is null and share_expires_on is null and not is_public)
  );

create unique index photo_albums_one_per_service on photo_albums (service_id) where kind = 'service';

-- What a studio's storage holds: its photos and its services' videos.
create or replace function photos_used_bytes(p_tenant uuid)
returns bigint
language sql
stable
as $$
  select (select coalesce(sum(bytes), 0) from photos where tenant_id = p_tenant)
       + (select coalesce(sum(video_bytes), 0) from photo_albums where tenant_id = p_tenant);
$$;

-- As before, now counting videos too. Errors: PHOTOS:over_quota.
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
  select storage_quota_bytes into v_quota from tenants where id = p_tenant for update;
  if photos_used_bytes(p_tenant) + p_bytes > v_quota then
    raise exception 'PHOTOS:over_quota';
  end if;
  insert into photos (id, tenant_id, album_id, large_key, thumb_key, width, height, bytes, caption, position)
  values (p_id, p_tenant, p_album, p_large_key, p_thumb_key, p_width, p_height, p_bytes, p_caption,
          (select coalesce(max(position), 0) + 1 from photos where album_id = p_album));
end;
$$;

-- Sets (or replaces) a service album's preview video, only if it fits the
-- allowance (the old video's space is freed first). Returns the old video's
-- key, for its file to be deleted, or null. Errors: PHOTOS:over_quota,
-- PHOTOS:no_album.
create or replace function photos_set_video(p_tenant uuid, p_album uuid, p_key text, p_bytes bigint)
returns text
language plpgsql
as $$
declare
  v_quota bigint;
  v_old_key text;
  v_old_bytes bigint;
begin
  select storage_quota_bytes into v_quota from tenants where id = p_tenant for update;
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

revoke all on function photos_used_bytes(uuid) from public, anon, authenticated;
revoke all on function photos_set_video(uuid, uuid, text, bigint) from public, anon, authenticated;
grant execute on function photos_used_bytes(uuid) to service_role;
grant execute on function photos_set_video(uuid, uuid, text, bigint) to service_role;
