-- Extra storage sold in packs the boss makes (owner, 2026-11-19): each its own
-- size and price (5 GB for 15,000, 20 GB for 50,000…), instead of one price a
-- GB times 1, 5, 10 or 50. No pack: extra storage isn't on sale.
-- storage_pricing goes: it was set to 0 on 2026-11-18, so it holds no row.

create table storage_packs (
  gb          int primary key check (gb between 1 and 1000),
  price       bigint not null check (price > 0),
  updated_at  timestamptz not null default now()
);
alter table storage_packs enable row level security;
revoke all on table storage_packs from anon, authenticated;

-- The boss saves the packs all at once: [{"gb": 5, "price": 15000}, …]; [] takes storage off sale.
create function storage_packs_set(p_packs jsonb)
returns void
language plpgsql
as $$
begin
  delete from storage_packs where true;
  insert into storage_packs (gb, price)
  select (p->>'gb')::int, (p->>'price')::bigint from jsonb_array_elements(p_packs) p;
end;
$$;
revoke all on function storage_packs_set(jsonb) from public, anon, authenticated;
grant execute on function storage_packs_set(jsonb) to service_role;

-- Buying: the pack of p_gb, at the price the buyer saw. Otherwise as before
-- (20261022100000_studio_files.sql).
create or replace function storage_buy(p_tenant uuid, p_gb int, p_amount bigint, p_actor_id text, p_actor_name text)
returns bigint
language plpgsql
as $$
declare
  v_price bigint;
  v_owner uuid;
  v_quota bigint;
  v_new   bigint;
begin
  select price into v_price from storage_packs where gb = p_gb;
  if v_price is null then
    raise exception 'STORAGE:not_for_sale';
  end if;
  if v_price <> p_amount then
    raise exception 'STORAGE:price_changed';
  end if;
  select owner_client_id, storage_quota_bytes into v_owner, v_quota from tenants where id = p_tenant for update;
  if v_owner is null then
    raise exception 'STORAGE:no_owner';
  end if;
  v_new := v_quota + p_gb::bigint * 1073741824;
  if v_new > 1000::bigint * 1073741824 then
    raise exception 'STORAGE:too_much';
  end if;
  perform wallet_post(v_owner, 'adjustment', -p_amount, null, null, 'Extra storage: ' || p_gb || ' GB', 'client', p_actor_id, p_actor_name);
  update tenants set storage_quota_bytes = v_new where id = p_tenant;
  insert into storage_purchases (tenant_id, client_id, gb, amount, actor_name) values (p_tenant, v_owner, p_gb, p_amount, p_actor_name);
  return v_new;
end;
$$;

drop table storage_pricing;
