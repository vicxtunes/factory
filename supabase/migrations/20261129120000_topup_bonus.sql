-- Top-up bonus (Black November): while a bonus runs, every wallet deposit of
-- at least its minimum gets `percent` extra on the client's Aming card, as its
-- own ledger row (kind 'bonus', tied to the deposit's payment, once). Every
-- way money is added counts (mobile money top-ups, bank and cash recorded by
-- staff), because the bonus is posted by a trigger on the deposit row itself.
-- Money on the Aming card only pays for Aming's orders and never leaves it
-- (transfers go one way, onto it), so a bonus can't be cashed out.

create table topup_bonuses (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default default_tenant_id() references tenants (id),
  percent          integer not null check (percent between 1 and 100),
  min_amount       bigint not null check (min_amount >= 0),
  starts_at        timestamptz not null default now(),
  ends_at          timestamptz,
  created_by_id    text,
  created_by_name  text not null,
  ended_by_name    text,
  created_at       timestamptz not null default now(),
  constraint topup_bonuses_ends_after_start check (ends_at is null or ends_at > starts_at)
);

alter table topup_bonuses enable row level security;
revoke all on table topup_bonuses from anon, authenticated;

-- As discounts: once started, only ending it early; a scheduled one can be cancelled.
create or replace function topup_bonuses_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.starts_at <= now() then
      raise exception 'BONUS:started';
    end if;
    return old;
  end if;
  if old.starts_at <= now() then
    if (new.percent, new.min_amount, new.starts_at, new.tenant_id)
       is distinct from (old.percent, old.min_amount, old.starts_at, old.tenant_id) then
      raise exception 'BONUS:started';
    end if;
    if new.ends_at is distinct from old.ends_at
       and (new.ends_at is null or new.ends_at < now() - interval '1 minute'
            or (old.ends_at is not null and new.ends_at > old.ends_at)) then
      raise exception 'BONUS:invalid_end';
    end if;
  end if;
  return new;
end;
$$;

create trigger topup_bonuses_guard
  before update or delete on topup_bonuses
  for each row execute function topup_bonuses_guard();

/** A new bonus; refused if it would overlap another (one bonus at a time, so a deposit's is never in doubt). */
create or replace function topup_bonus_create(
  p_tenant uuid,
  p_percent integer,
  p_min_amount bigint,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_actor_id text,
  p_actor_name text
)
returns uuid
language plpgsql
as $$
declare
  v_starts timestamptz := coalesce(p_starts_at, now());
  v_id uuid;
begin
  lock table topup_bonuses in share row exclusive mode;
  if exists (
    select 1 from topup_bonuses
     where tenant_id = p_tenant
       and tstzrange(starts_at, ends_at) && tstzrange(v_starts, p_ends_at)
  ) then
    raise exception 'BONUS:overlap';
  end if;
  insert into topup_bonuses (tenant_id, percent, min_amount, starts_at, ends_at, created_by_id, created_by_name)
  values (p_tenant, p_percent, p_min_amount, v_starts, p_ends_at, p_actor_id, p_actor_name)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function topup_bonus_create(uuid, integer, bigint, timestamptz, timestamptz, text, text) from public, anon, authenticated;

-- The ledger learns the new kind.
alter table wallet_transactions drop constraint wallet_transactions_kind_check;
alter table wallet_transactions
  add constraint wallet_transactions_kind_check
  check (kind in ('deposit', 'order_payment', 'refund', 'adjustment', 'transfer', 'bonus'));

alter table wallet_transactions drop constraint wallet_tx_shape;
alter table wallet_transactions add constraint wallet_tx_shape check (
     (kind = 'deposit' and amount > 0 and payment_id is not null and order_id is null)
  or (kind = 'order_payment' and amount < 0 and order_id is not null)
  or (kind = 'refund' and amount > 0 and order_id is not null)
  or (kind = 'adjustment' and order_id is null and payment_id is null and nullif(trim(note), '') is not null)
  or (kind = 'transfer' and order_id is null and payment_id is null and nullif(trim(note), '') is not null)
  -- Tied to the deposit it rewards.
  or (kind = 'bonus' and amount > 0 and payment_id is not null and order_id is null)
);

-- One bonus per deposit.
create unique index wallet_tx_bonus_payment_key on wallet_transactions (payment_id) where kind = 'bonus';

create or replace function wallet_topup_bonus()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bonus topup_bonuses;
  v_amount bigint;
begin
  select * into v_bonus
    from topup_bonuses
   where tenant_id = default_tenant_id()
     and starts_at <= new.created_at
     and (ends_at is null or new.created_at < ends_at)
   order by starts_at desc
   limit 1;
  if v_bonus.id is null or new.amount < v_bonus.min_amount then
    return null;
  end if;
  v_amount := floor(new.amount * v_bonus.percent / 100.0)::bigint;
  if v_amount > 0 then
    perform wallet_post(new.client_id, 'bonus', v_amount, new.payment_id, null,
                        format('%s%% top-up bonus', v_bonus.percent), 'system', v_bonus.id::text, 'Aming');
  end if;
  return null;
end;
$$;

create trigger wallet_tx_topup_bonus
  after insert on wallet_transactions
  for each row when (new.kind = 'deposit')
  execute function wallet_topup_bonus();

-- Accounts: a bonus is money held for the client that was never received, so
-- it moves what's held like a staff correction does (20261001160000_accounting_views.sql).
create or replace view accounting_held_movements with (security_invoker = true) as
select
  default_tenant_id()   as tenant_id,
  t.id,
  t.created_at          as at,
  t.client_id           as customer_id,
  case t.kind when 'order_payment' then 'spent' when 'bonus' then 'adjustment' else t.kind end as kind,
  t.amount,
  o.order_no,
  t.note
from wallet_transactions t
left join orders o on o.id = t.order_id
where t.kind in ('order_payment', 'refund', 'adjustment', 'bonus');
