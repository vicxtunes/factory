-- No money in without a source. On 2 Nov 2026 a client's 1,297,000 was entered
-- as a wallet adjustment: the balance went up, but no payment existed, so it
-- never reached Money received and nothing said where it came from.
--
--   * money_accounts: where money is kept (cash, bank, mobile money).
--   * money_in_details: for money staff record by hand, who sent it, from which
--     phone, the day it really arrived and the account it went into. A side
--     table because receipts are append-only and written by the gateway too.
--   * other_money_in: money that isn't from a client (owners' money, other income).
--   * wallet_adjust can no longer add money, except to undo an earlier adjustment.
--   * money_not_in_books: what got in without reaching the books. Should stay
--     empty; the hourly money watch raises an alert for anything in it.
--
-- History isn't edited, and rows from before this migration have no details.
-- Service role only, like the wallet.

-- --- Where money is kept ----------------------------------------------------

create table money_accounts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default default_tenant_id() references tenants (id),
  name        text not null check (length(trim(name)) between 1 and 80),
  kind        text not null check (kind in ('cash', 'bank', 'mobile_money')),
  created_at  timestamptz not null default now()
);

create unique index money_accounts_name_key on money_accounts (tenant_id, lower(trim(name)));

insert into money_accounts (name, kind) values
  ('Cash', 'cash'),
  ('Bank', 'bank'),
  ('Mobile money', 'mobile_money');

-- --- Source of hand-recorded money ------------------------------------------

create table money_in_details (
  id                uuid primary key default gen_random_uuid(),
  receipt_id        uuid unique references order_payment_receipts (id) on delete restrict,
  payment_id        uuid unique references payments (id) on delete restrict,
  sender_name       text not null check (length(trim(sender_name)) between 1 and 120),
  sender_phone      text,
  received_on       date not null,
  money_account_id  uuid not null references money_accounts (id) on delete restrict,
  created_at        timestamptz not null default now(),
  constraint money_in_details_subject check ((receipt_id is null) <> (payment_id is null))
);

create or replace function money_history_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'WALLET:history';
end;
$$;

create trigger money_in_details_append_only before update or delete on money_in_details
  for each row execute function money_history_append_only();

-- The day and account rules every hand-recorded receipt has to pass.
create or replace function money_check_source(
  p_method text,
  p_reference text,
  p_sender_name text,
  p_sender_phone text,
  p_received_on date,
  p_account uuid
)
returns void
language plpgsql
stable
as $$
begin
  if nullif(trim(p_sender_name), '') is null then raise exception 'WALLET:source_sender'; end if;
  if p_method = 'mobile_money' and nullif(trim(p_sender_phone), '') is null then raise exception 'WALLET:source_phone'; end if;
  if p_method in ('mobile_money', 'bank_transfer') and nullif(trim(p_reference), '') is null then
    raise exception 'WALLET:source_reference';
  end if;
  if p_received_on is null then raise exception 'WALLET:source_date'; end if;
  if p_received_on > production_today(default_tenant_id()) then raise exception 'WALLET:source_future'; end if;
  perform 1 from money_accounts where id = p_account and tenant_id = default_tenant_id();
  if not found then raise exception 'WALLET:source_account'; end if;
end;
$$;

-- A receipt on an order with its source, in one go. Retrying with the same id is safe.
create or replace function money_record_order_receipt(
  p_receipt uuid,
  p_order uuid,
  p_amount bigint,
  p_method text,
  p_reference text,
  p_note text,
  p_excess_disposition text,
  p_sender_name text,
  p_sender_phone text,
  p_received_on date,
  p_account uuid,
  p_actor_type text,
  p_actor_id text,
  p_actor_name text
)
returns jsonb
language plpgsql
as $$
declare
  v_result jsonb;
begin
  perform money_check_source(p_method, p_reference, p_sender_name, p_sender_phone, p_received_on, p_account);
  v_result := wallet_record_order_receipt(
    p_receipt, p_order, p_amount, p_method, p_reference, p_note, p_excess_disposition, p_actor_type, p_actor_id, p_actor_name
  );
  insert into money_in_details (receipt_id, sender_name, sender_phone, received_on, money_account_id)
  values (p_receipt, trim(p_sender_name), nullif(trim(p_sender_phone), ''), p_received_on, p_account)
  on conflict (receipt_id) do nothing;
  return v_result;
end;
$$;

-- A wallet deposit waiting to be settled, with its source, in one go.
create or replace function money_record_deposit(
  p_client uuid,
  p_amount bigint,
  p_method text,
  p_reference text,
  p_note text,
  p_sender_name text,
  p_sender_phone text,
  p_received_on date,
  p_account uuid,
  p_actor_type text,
  p_actor_id text,
  p_actor_name text
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  perform money_check_source(p_method, p_reference, p_sender_name, p_sender_phone, p_received_on, p_account);
  insert into payments (client_id, amount, method, reference, note, created_by_type, created_by_id, created_by_name)
  values (p_client, p_amount, p_method, nullif(trim(p_reference), ''), nullif(trim(p_note), ''), p_actor_type, p_actor_id, p_actor_name)
  returning id into v_id;
  insert into money_in_details (payment_id, sender_name, sender_phone, received_on, money_account_id)
  values (v_id, trim(p_sender_name), nullif(trim(p_sender_phone), ''), p_received_on, p_account);
  return v_id;
end;
$$;

-- --- Money that isn't from a client -----------------------------------------

create table other_money_in (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null default default_tenant_id() references tenants (id),
  kind              text not null check (kind in ('owner', 'other_income', 'other')),
  amount            bigint not null check (amount > 0),
  sender_name       text not null check (length(trim(sender_name)) between 1 and 120),
  sender_phone      text,
  method            text not null check (method in ('cash', 'bank_transfer', 'mobile_money', 'other')),
  reference         text,
  received_on       date not null,
  money_account_id  uuid not null references money_accounts (id) on delete restrict,
  note              text,
  actor_id          text,
  actor_name        text not null,
  created_at        timestamptz not null default now(),
  voided_at         timestamptz,
  void_reason       text,
  voided_by_name    text,
  constraint other_money_in_phone check (method <> 'mobile_money' or nullif(trim(sender_phone), '') is not null),
  constraint other_money_in_reference check (method not in ('mobile_money', 'bank_transfer') or nullif(trim(reference), '') is not null)
);

create index other_money_in_day_idx on other_money_in (tenant_id, received_on desc);

create trigger other_money_in_void_only before update or delete on other_money_in
  for each row execute function production_void_only();

-- --- Adjustments can't bring money in ---------------------------------------

create table wallet_adjustment_reversals (
  -- The adjustment that undoes...
  entry_id     uuid primary key references wallet_transactions (id) on delete restrict,
  -- ...this earlier one, wholly or partly.
  reverses_id  uuid not null references wallet_transactions (id) on delete restrict,
  created_at   timestamptz not null default now()
);

create index wallet_adjustment_reversals_of_idx on wallet_adjustment_reversals (reverses_id);

create trigger wallet_adjustment_reversals_append_only before update or delete on wallet_adjustment_reversals
  for each row execute function money_history_append_only();

-- What of an adjustment hasn't been undone yet.
create or replace function wallet_adjustment_left(p_entry uuid)
returns bigint
language sql
stable
as $$
  select abs(t.amount) - coalesce((
    select sum(abs(u.amount))::bigint
      from wallet_adjustment_reversals r
      join wallet_transactions u on u.id = r.entry_id
     where r.reverses_id = t.id
  ), 0)
  from wallet_transactions t where t.id = p_entry;
$$;

drop function wallet_adjust(uuid, bigint, text, text, text, text);

create function wallet_adjust(
  p_client uuid,
  p_amount bigint,
  p_note text,
  p_actor_type text,
  p_actor_id text,
  p_actor_name text,
  p_reverses uuid default null
)
returns bigint
language plpgsql
as $$
declare
  v_row wallet_transactions;
  v_old wallet_transactions;
begin
  if p_amount = 0 then
    raise exception 'WALLET:invalid_amount';
  end if;
  if p_reverses is null then
    -- Money that arrived is a deposit, so it reaches the books with its source.
    if p_amount > 0 then raise exception 'WALLET:adjust_cannot_add'; end if;
  else
    select * into v_old from wallet_transactions where id = p_reverses for update;
    if not found or v_old.client_id <> p_client or v_old.kind <> 'adjustment' or sign(v_old.amount) = sign(p_amount) then
      raise exception 'WALLET:adjust_bad_reversal';
    end if;
    if abs(p_amount) > wallet_adjustment_left(p_reverses) then raise exception 'WALLET:adjust_over_reversal'; end if;
  end if;
  v_row := wallet_post(p_client, 'adjustment', p_amount, null, null, p_note, p_actor_type, p_actor_id, p_actor_name);
  if p_reverses is not null then
    insert into wallet_adjustment_reversals (entry_id, reverses_id) values (v_row.id, p_reverses);
  end if;
  return v_row.balance_after;
end;
$$;

-- --- The day money arrived and who sent it, on Accounts ---------------------

-- When money counts as received: the moment it was recorded, unless staff said
-- it arrived on another day (midday that day, so it can't slip across midnight).
create or replace function money_received_at(p_recorded timestamptz, p_received_on date)
returns timestamptz
language sql
stable
as $$
  select case
    when p_received_on is null or p_received_on = (p_recorded at time zone t.time_zone)::date then p_recorded
    else (p_received_on + time '12:00') at time zone t.time_zone
  end
  from tenants t where t.id = default_tenant_id();
$$;

create or replace view accounting_money_in with (security_invoker = true) as
select
  default_tenant_id()                                as tenant_id,
  r.id,
  money_received_at(r.created_at, d.received_on)     as received_at,
  r.client_id                                        as customer_id,
  r.method,
  r.amount_received - r.amount_physically_refunded   as amount,
  'sale_receipt'::text                               as kind,
  o.order_no,
  r.reference,
  r.actor_name                                       as recorded_by,
  d.sender_name,
  coalesce(d.sender_phone, k.phone)                  as sender_phone,
  r.created_at                                       as recorded_at,
  a.name                                             as account_name
from order_payment_receipts r
join orders o on o.id = r.order_id
left join money_in_details d on d.receipt_id = r.id
left join money_accounts a on a.id = d.money_account_id
left join lateral (
  select c.phone from provider_collections c
   where c.receipt_id = r.id or c.provider_ref = r.reference
   limit 1
) k on true
where r.amount_received > r.amount_physically_refunded
union all
select
  default_tenant_id(),
  p.id,
  money_received_at(coalesce(p.resolved_at, p.updated_at), d.received_on),
  p.client_id,
  p.method,
  p.amount,
  -- A payment made for one order (installment) is a sale receipt too.
  case when p.order_id is null then 'prepayment' else 'sale_receipt' end,
  o.order_no,
  p.reference,
  p.created_by_name,
  d.sender_name,
  coalesce(d.sender_phone, k.phone),
  coalesce(p.resolved_at, p.updated_at),
  a.name
from payments p
left join orders o on o.id = p.order_id
left join money_in_details d on d.payment_id = p.id
left join money_accounts a on a.id = d.money_account_id
left join lateral (
  select c.phone from provider_collections c where c.payment_id = p.id limit 1
) k on true
where p.status = 'succeeded'
  and not exists (select 1 from order_payment_receipts r where r.wallet_payment_id = p.id)
union all
select
  default_tenant_id(),
  b.id,
  b.created_at,
  t.owner_client_id,
  'mobile_money',
  b.amount,
  'prepayment',
  null,
  c.provider_ref,
  c.created_by_name,
  null,
  c.phone,
  b.created_at,
  null
from business_wallet_transactions b
join tenants t on t.id = b.tenant_id
join provider_collections c on c.id = b.collection_id
where b.kind = 'customer_payment';

-- Other money in, for Accounts: what was recorded here, and borrowed money
-- that actually arrived (supplier credit brings no money).
create view accounting_other_money_in with (security_invoker = true) as
select
  m.tenant_id,
  m.id,
  m.kind,
  m.amount,
  m.sender_name,
  m.sender_phone,
  m.method,
  m.reference,
  m.received_on,
  a.name as account_name,
  m.note,
  m.actor_name as recorded_by,
  m.created_at as recorded_at
from other_money_in m
join money_accounts a on a.id = m.money_account_id
where m.voided_at is null
union all
select
  l.tenant_id,
  l.id,
  'loan',
  l.amount,
  n.name,
  n.phone,
  l.received_into,
  null,
  l.received_on,
  null,
  l.note,
  l.actor_name,
  l.created_at
from loans l
join lenders n on n.id = l.lender_id
where l.voided_at is null and l.received_into <> 'materials';

-- --- What got in without reaching the books ---------------------------------

create view money_not_in_books with (security_invoker = true) as
select
  'adjustment'::text as source,
  t.id,
  wallet_adjustment_left(t.id) as amount,
  c.name as client_name,
  c.phone,
  t.actor_name as by_name,
  t.note,
  t.created_at
from wallet_transactions t
left join clients c on c.id = t.client_id
where t.kind = 'adjustment' and t.amount > 0 and wallet_adjustment_left(t.id) > 0
union all
select
  'collection',
  k.id,
  k.amount,
  c.name,
  k.phone,
  k.created_by_name,
  k.provider_ref,
  k.created_at
from provider_collections k
left join clients c on c.id = k.client_id
where k.status = 'succeeded'
  and k.receipt_id is null
  and k.payment_id is null
  and not exists (select 1 from accounting_money_in m where m.reference = k.provider_ref);

-- --- Alerts about ledger rows -----------------------------------------------

alter table money_alerts add column ledger_id uuid;
alter table money_alerts drop constraint money_alerts_subject;
alter table money_alerts add constraint money_alerts_subject check (
  num_nonnulls(collection_id, withdrawal_id, ledger_id) = 1
);
alter table money_alerts drop constraint money_alerts_kind_check;
alter table money_alerts add constraint money_alerts_kind_check check (kind in (
  'paid_not_credited',
  'credited_not_paid',
  'possible_double',
  'payout_unconfirmed',
  'recorded_by_hand',
  -- Money got in without being recorded as received (see money_not_in_books).
  'money_not_in_books'
));
drop index money_alerts_once;
create unique index money_alerts_once on money_alerts (kind, coalesce(collection_id, withdrawal_id, ledger_id));

-- The morning note about money recorded after the evening report went out.
alter table money_reports add column late_checked_at timestamptz;

-- --- Service role only ------------------------------------------------------

alter table money_accounts enable row level security;
alter table money_in_details enable row level security;
alter table other_money_in enable row level security;
alter table wallet_adjustment_reversals enable row level security;

revoke all on money_accounts, money_in_details, other_money_in, wallet_adjustment_reversals from anon, authenticated;
revoke all on accounting_other_money_in, money_not_in_books from anon, authenticated;
revoke all on function money_history_append_only() from public, anon, authenticated;
revoke all on function money_check_source(text, text, text, text, date, uuid) from public, anon, authenticated;
revoke all on function money_record_order_receipt(uuid, uuid, bigint, text, text, text, text, text, text, date, uuid, text, text, text) from public, anon, authenticated;
revoke all on function money_record_deposit(uuid, bigint, text, text, text, text, text, date, uuid, text, text, text) from public, anon, authenticated;
revoke all on function wallet_adjustment_left(uuid) from public, anon, authenticated;
revoke all on function wallet_adjust(uuid, bigint, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function money_received_at(timestamptz, date) from public, anon, authenticated;
