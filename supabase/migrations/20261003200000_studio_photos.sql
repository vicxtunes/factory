-- Studio photos (My Business, Phase 7b-1; see packages/lib/photos/README.md).
--
-- A studio's photos live in Cloudflare R2; this records which photos it has,
-- in which albums, and how much space they take. Each studio has a storage
-- allowance (1 GB to start; the boss can raise it per studio).
--
-- Every photo is stored twice, both resized in the browser: a large copy
-- (~2400px, for full screen) and a small one (~600px, for grids). `bytes` is
-- what both really take in R2, read back from R2 when the upload is
-- confirmed, never what the browser claims.

alter table tenants
  add column storage_quota_bytes bigint not null default 1073741824 check (storage_quota_bytes >= 0);

create table photo_albums (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants (id) on delete restrict,
  title       text not null check (nullif(trim(title), '') is not null and char_length(title) <= 80),
  -- The album's address under the studio's: /<studio>/gallery/<slug>.
  slug        text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$'),
  -- Shown on the studio's public page and at its address.
  is_public   boolean not null default true,
  cover_photo_id uuid,
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, slug)
);

create trigger photo_albums_set_updated_at
  before update on photo_albums
  for each row execute function set_updated_at();

create table photos (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants (id) on delete restrict,
  album_id    uuid not null,
  -- Object keys in the R2 bucket.
  large_key   text not null unique check (char_length(large_key) <= 300),
  thumb_key   text not null unique check (char_length(thumb_key) <= 300),
  width       int not null check (width > 0),
  height      int not null check (height > 0),
  -- Both copies together, as stored in R2.
  bytes       bigint not null check (bytes > 0),
  caption     text check (char_length(caption) <= 200),
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, album_id) references photo_albums (tenant_id, id) on delete cascade
);

create index photos_album on photos (album_id, position, created_at);
create index photos_tenant on photos (tenant_id);

-- An album's cover is one of the studio's own photos; deleting it just clears the cover.
alter table photo_albums
  add constraint photo_albums_cover_fkey foreign key (tenant_id, cover_photo_id)
  references photos (tenant_id, id) on delete set null (cover_photo_id);

-- Records an uploaded photo, only if it fits the studio's allowance. The
-- studio's row is locked so two uploads at once can't both squeeze in.
-- Errors: PHOTOS:over_quota.
create or replace function photos_record(
  p_tenant uuid, p_id uuid, p_album uuid, p_large_key text, p_thumb_key text,
  p_width int, p_height int, p_bytes bigint, p_caption text
)
returns void
language plpgsql
as $$
declare
  v_quota bigint;
  v_used  bigint;
begin
  select storage_quota_bytes into v_quota from tenants where id = p_tenant for update;
  select coalesce(sum(bytes), 0) into v_used from photos where tenant_id = p_tenant;
  if v_used + p_bytes > v_quota then
    raise exception 'PHOTOS:over_quota';
  end if;
  insert into photos (id, tenant_id, album_id, large_key, thumb_key, width, height, bytes, caption, position)
  values (p_id, p_tenant, p_album, p_large_key, p_thumb_key, p_width, p_height, p_bytes, p_caption,
          (select coalesce(max(position), 0) + 1 from photos where album_id = p_album));
end;
$$;

-- Server (service role) only; every query filters by the caller's studio.
alter table photo_albums enable row level security;
alter table photos enable row level security;
revoke all on table photo_albums, photos from anon, authenticated;
revoke all on function photos_record(uuid, uuid, uuid, text, text, int, int, bigint, text) from public, anon, authenticated;
grant execute on function photos_record(uuid, uuid, uuid, text, text, int, int, bigint, text) to service_role;
