-- Product slugs: a shareable URL per product (client portal /{slug}).
--
-- The slug is made from the product name when the product is created
-- ("A4 Photo Book" -> "a4-photo-book"), with "-2", "-3", … added if another
-- product already has it, or if it would clash with one of the client
-- portal's own pages (orders, history, …). It is NOT changed on rename, so
-- links people have already shared keep working.

alter table products add column slug text;

create or replace function product_slug_base(p_name text) returns text
language sql immutable as $$
  select coalesce(
    nullif(trim(both '-' from regexp_replace(
      -- Accented letters become plain ones ("Café" -> "cafe") rather than dropped.
      translate(lower(p_name), 'àáâãäåāçćčèéêëēėęìíîïīñńòóôõöøōùúûüūýÿžźż', 'aaaaaaaccceeeeeeeiiiiinnooooooouuuuuyyzzz'),
      '[^a-z0-9]+', '-', 'g'
    )), ''),
    'product'
  );
$$;

-- Paths the client portal already uses at the top level (app/client-side/*
-- and proxy.ts's shared paths). A product slug must never shadow them.
create or replace function product_slug_reserved(p_slug text) returns boolean
language sql immutable as $$
  select p_slug in (
    'orders', 'history', 'new', 'payment', 'settings', 'showroom',
    'support', 'auth', 'api', 'serwist', 'client-side', 'chat',
    'dashboard', 'factory', 'graphics', 'display', 'login', 'signin'
  );
$$;

create or replace function products_assign_slug() returns trigger
language plpgsql as $$
declare
  base      text := product_slug_base(new.name);
  candidate text := base;
  n         integer := 1;
begin
  if new.slug is not null then
    return new;
  end if;
  while product_slug_reserved(candidate)
     or exists (select 1 from products p where p.slug = candidate and p.id <> new.id)
  loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  new.slug := candidate;
  return new;
end;
$$;

create trigger products_assign_slug
  before insert or update of slug on products
  for each row execute function products_assign_slug();

-- Backfill, oldest first, so the earliest product keeps the plain slug.
do $$
declare
  r record;
begin
  for r in select id from products where slug is null order by created_at, id loop
    update products set slug = null where id = r.id; -- fires the trigger
  end loop;
end;
$$;

alter table products alter column slug set not null;
create unique index products_slug_uniq on products (slug);
