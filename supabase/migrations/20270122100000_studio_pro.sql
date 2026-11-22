-- Pro for businesses (owner, 2026-11-22): page looks (templates) sold to
-- businesses in a monthly Pro plan. Classic stays free; Pro looks (the first:
-- Showcase) need Pro. Pro is paid a month at a time from the business's Aming
-- card (by MTN or Airtel, the price goes on the card first, as with extra
-- storage), at the boss's price; it can renew by itself from the card. Every
-- business gets 14 days of Pro free when it opens. When Pro ends, the public
-- page shows Classic until it's renewed; the chosen look is kept.

-- The boss's monthly price, one row; none: Pro isn't on sale.
create table pro_pricing (
  id          boolean primary key default true check (id),
  price       bigint not null check (price > 0),
  updated_at  timestamptz not null default now()
);
alter table pro_pricing enable row level security;
revoke all on table pro_pricing from anon, authenticated;

alter table tenants
  -- Pro until then (null: never had it). Pro is on while it's in the future.
  add column pro_until timestamptz,
  -- The end of the free trial, kept to tell a trial from a paid month.
  add column pro_trial_until timestamptz,
  -- Pay the next month from the card when this one ends (set when paying).
  add column pro_auto_renew boolean not null default false,
  -- The last notice sent about this Pro period ("reminder:<pro_until>", "ended:<pro_until>"), so each goes once.
  add column pro_notice text,
  -- The public page's look (packages/lib/pro/core.ts: PAGE_TEMPLATES).
  add column page_template text not null default 'classic' check (page_template ~ '^[a-z][a-z0-9-]{1,30}$');

-- Each month paid.
create table pro_payments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  client_id   uuid not null,
  amount      bigint not null check (amount > 0),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  -- By the business (paying now) or renewed by itself.
  auto        boolean not null,
  actor_name  text not null,
  created_at  timestamptz not null default now()
);
create index pro_payments_tenant on pro_payments (tenant_id, created_at desc);
alter table pro_payments enable row level security;
revoke all on table pro_payments from anon, authenticated;

-- The trial: 14 days from the moment a business opens (approved), once.
create function tenants_pro_trial()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'active' and new.owner_client_id is not null and new.pro_until is null then
    new.pro_until := now() + interval '14 days';
    new.pro_trial_until := new.pro_until;
  end if;
  return new;
end;
$$;
create trigger tenants_pro_trial before insert or update of status on tenants
  for each row execute function tenants_pro_trial();

-- Businesses already open get their 14 days from today.
update tenants set pro_until = now() + interval '14 days', pro_trial_until = now() + interval '14 days'
where status = 'active' and owner_client_id is not null and pro_until is null;

-- The boss sets the price; null takes Pro off sale.
create function pro_price_set(p_price bigint)
returns void
language plpgsql
as $$
begin
  delete from pro_pricing where true;
  if p_price is not null then
    insert into pro_pricing (price) values (p_price);
  end if;
end;
$$;

-- A month of Pro from the owner's Aming card, at the price the buyer saw
-- (p_amount). It starts when the current Pro ends (or now, if it has ended),
-- so a trial or paid month is never cut short. Returns the new end.
create function pro_buy(p_tenant uuid, p_amount bigint, p_auto boolean, p_renew boolean, p_actor_id text, p_actor_name text)
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
  select price into v_price from pro_pricing;
  if v_price is null then
    raise exception 'PRO:not_for_sale';
  end if;
  if v_price <> p_amount then
    raise exception 'PRO:price_changed';
  end if;
  select owner_client_id, pro_until into v_owner, v_until from tenants where id = p_tenant for update;
  if v_owner is null then
    raise exception 'PRO:no_owner';
  end if;
  v_start := greatest(coalesce(v_until, now()), now());
  if v_start > now() + interval '62 days' then
    raise exception 'PRO:too_far';
  end if;
  v_end := v_start + interval '1 month';
  perform wallet_post(v_owner, 'adjustment', -p_amount, null, null, 'Pro: 1 month', 'client', p_actor_id, p_actor_name);
  update tenants set pro_until = v_end, pro_auto_renew = p_renew where id = p_tenant;
  insert into pro_payments (tenant_id, client_id, amount, starts_at, ends_at, auto, actor_name)
  values (p_tenant, v_owner, p_amount, v_start, v_end, p_auto, p_actor_name);
  return v_end;
end;
$$;

revoke all on function pro_price_set(bigint) from public, anon, authenticated;
revoke all on function pro_buy(uuid, bigint, boolean, boolean, text, text) from public, anon, authenticated;
grant execute on function pro_price_set(bigint) to service_role;
grant execute on function pro_buy(uuid, bigint, boolean, boolean, text, text) to service_role;
