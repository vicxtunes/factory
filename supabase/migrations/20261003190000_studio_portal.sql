-- The studio portal (My Business, Phase 7a; see packages/lib/studio-portal/README.md).
--
-- 1. A studio's own address: client.<domain>/<slug>. It shares the client
--    portal's top level with product pages, so a slug can never equal a
--    product slug or an app page, and the other way round. Old slugs are kept
--    and redirect to the current one, so links shared in WhatsApp never break.
-- 2. A studio's clients sign in on that address with their phone and a
--    4-digit PIN, set up from a one-time link the studio sends them.
-- 3. A project can carry a link to its photos (Google Drive, Dropbox, …).

-- ── App pages a top-level slug must never shadow (products and studios) ──
create or replace function product_slug_reserved(p_slug text) returns boolean
language sql immutable as $$
  select p_slug in (
    'orders', 'history', 'new', 'payment', 'settings', 'showroom',
    'support', 'auth', 'api', 'serwist', 'client-side', 'chat',
    'dashboard', 'factory', 'graphics', 'display', 'login', 'signin',
    'studio', 'invoice', 'proforma', 'q', 'i', 'r', 'me', 'welcome'
  );
$$;

-- ── Studio slugs ──
create table studio_slugs (
  slug        text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  tenant_id   uuid not null references tenants (id) on delete cascade,
  -- One current slug per studio; the others redirect to it.
  is_current  boolean not null default true,
  created_at  timestamptz not null default now()
);

create unique index studio_slugs_one_current on studio_slugs (tenant_id) where is_current;

-- Makes p_slug the studio's address. Its own old slug comes back; anyone
-- else's slug, a product's slug or an app page is refused.
-- Errors: STUDIO_SLUG:taken.
create or replace function studio_set_slug(p_tenant uuid, p_slug text) returns void
language plpgsql as $$
declare
  v_owner uuid;
begin
  select tenant_id into v_owner from studio_slugs where slug = p_slug;
  if (v_owner is not null and v_owner <> p_tenant)
     or product_slug_reserved(p_slug)
     or exists (select 1 from products where slug = p_slug) then
    raise exception 'STUDIO_SLUG:taken';
  end if;
  update studio_slugs set is_current = false where tenant_id = p_tenant and is_current and slug <> p_slug;
  insert into studio_slugs (slug, tenant_id, is_current) values (p_slug, p_tenant, true)
  on conflict (slug) do update set is_current = true;
end;
$$;

-- Product slugs now skip studio slugs too (and refuse one set by hand).
create or replace function products_assign_slug() returns trigger
language plpgsql as $$
declare
  base      text := product_slug_base(new.name);
  candidate text := base;
  n         integer := 1;
begin
  if new.slug is not null then
    if exists (select 1 from studio_slugs s where s.slug = new.slug) then
      raise exception 'That address is already a studio''s.';
    end if;
    return new;
  end if;
  while product_slug_reserved(candidate)
     or exists (select 1 from products p where p.slug = candidate and p.id <> new.id)
     or exists (select 1 from studio_slugs s where s.slug = candidate)
  loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  new.slug := candidate;
  return new;
end;
$$;

-- ── Client sign-in ──
alter table customers
  -- bcrypt hash of the client's 4-digit PIN.
  add column portal_pin_hash          text,
  -- When the PIN was last set: a sign-in from before it no longer counts.
  add column portal_pin_set_at        timestamptz,
  -- sha256 of the one-time set-up link's secret (never the secret itself), and when it expires.
  add column portal_invite_hash       text unique,
  add column portal_invite_expires_at timestamptz,
  add column portal_failed_attempts   int not null default 0 check (portal_failed_attempts >= 0),
  add column portal_locked_until      timestamptz,
  add column portal_signed_in_at      timestamptz,
  add constraint customers_portal_pin_pair check ((portal_pin_hash is null) = (portal_pin_set_at is null)),
  add constraint customers_portal_invite_pair check ((portal_invite_hash is null) = (portal_invite_expires_at is null));

-- ── Photos ──
alter table projects
  add column photos_url text check (char_length(photos_url) <= 500 and photos_url ~ '^https://');

-- Server (service role) only.
alter table studio_slugs enable row level security;
revoke all on table studio_slugs from anon, authenticated;
revoke all on function studio_set_slug(uuid, text) from public, anon, authenticated;
grant execute on function studio_set_slug(uuid, text) to service_role;
