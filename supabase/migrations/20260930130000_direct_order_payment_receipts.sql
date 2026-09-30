create table order_payment_receipts (
  id                       uuid primary key default gen_random_uuid(),
  order_id                 uuid not null references orders(id) on delete restrict,
  client_id                uuid not null references clients(id) on delete restrict,
  amount_received          bigint not null check (amount_received > 0),
  amount_applied           bigint not null check (amount_applied >= 0),
  amount_wallet_credit     bigint not null default 0 check (amount_wallet_credit >= 0),
  amount_physically_refunded bigint not null default 0 check (amount_physically_refunded >= 0),
  excess_disposition       text check (excess_disposition in ('wallet', 'physical_refund')),
  wallet_payment_id       uuid unique references payments(id) on delete restrict,
  method                   text not null check (method in ('bank_transfer', 'mobile_money', 'cash', 'card', 'other')),
  reference                text,
  note                     text,
  actor_type               text not null check (actor_type in ('client', 'dashboard_user', 'system')),
  actor_id                 text,
  actor_name               text not null,
  created_at               timestamptz not null default now(),
  constraint order_payment_receipt_amounts check (
    amount_received = amount_applied + amount_wallet_credit + amount_physically_refunded
  ),
  constraint order_payment_receipt_excess check (
    (amount_received = amount_applied and excess_disposition is null and wallet_payment_id is null)
    or (amount_received > amount_applied and excess_disposition = 'wallet' and amount_wallet_credit > 0 and wallet_payment_id is not null and amount_physically_refunded = 0)
    or (amount_received > amount_applied and excess_disposition = 'physical_refund' and amount_physically_refunded > 0 and amount_wallet_credit = 0 and wallet_payment_id is null)
  )
);

create index order_payment_receipts_order_idx on order_payment_receipts (order_id, created_at desc);
create index order_payment_receipts_client_idx on order_payment_receipts (client_id, created_at desc);
alter table order_payment_receipts enable row level security;

create or replace function order_payment_receipts_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'order_payment_receipts is append-only';
end;
$$;

create trigger order_payment_receipts_no_update_or_delete
  before update or delete on order_payment_receipts
  for each row execute function order_payment_receipts_append_only();

create or replace function wallet_order_paid(p_order uuid)
returns bigint
language sql
stable
as $$
  select
    coalesce((select -sum(amount) from wallet_transactions where order_id = p_order), 0)
    + coalesce((select sum(amount_applied) from order_payment_receipts where order_id = p_order), 0);
$$;

create or replace function wallet_record_order_receipt(
  p_receipt uuid,
  p_order uuid,
  p_amount bigint,
  p_method text,
  p_reference text,
  p_note text,
  p_excess_disposition text,
  p_actor_type text,
  p_actor_id text,
  p_actor_name text
)
returns jsonb
language plpgsql
as $$
declare
  v_order record;
  v_existing order_payment_receipts;
  v_applied bigint;
  v_excess bigint;
  v_wallet_payment uuid;
  v_balance bigint;
begin
  if p_amount <= 0 then
    raise exception 'WALLET:invalid_amount';
  end if;
  if p_method not in ('bank_transfer', 'mobile_money', 'cash', 'card', 'other') then
    raise exception 'WALLET:invalid_method';
  end if;
  if p_excess_disposition is not null and p_excess_disposition not in ('wallet', 'physical_refund') then
    raise exception 'WALLET:invalid_excess_disposition';
  end if;

  select id, client_id, order_no, approval_status, cancelled_at, quoted_price
    into v_order
    from orders where id = p_order for update;
  if not found then
    raise exception 'WALLET:order_not_found';
  end if;
  if v_order.client_id is null then
    raise exception 'WALLET:order_not_linked_to_client';
  end if;
  if v_order.cancelled_at is not null then
    raise exception 'WALLET:order_cancelled';
  end if;
  if v_order.approval_status <> 'approved' then
    raise exception 'WALLET:order_not_confirmed';
  end if;
  if v_order.quoted_price is null then
    raise exception 'WALLET:price_unknown';
  end if;
  if not exists (select 1 from invoices where order_id = p_order) then
    raise exception 'WALLET:invoice_required';
  end if;

  select * into v_existing from order_payment_receipts where id = p_receipt;
  if found then
    if v_existing.order_id <> p_order or v_existing.amount_received <> p_amount then
      raise exception 'WALLET:receipt_id_conflict';
    end if;
    select balance into v_balance from wallets where client_id = v_existing.client_id;
    return jsonb_build_object(
      'already_recorded', true,
      'applied', v_existing.amount_applied,
      'wallet_credit', v_existing.amount_wallet_credit,
      'physically_refunded', v_existing.amount_physically_refunded,
      'balance', coalesce(v_balance, 0)
    );
  end if;

  v_applied := least(p_amount, round(v_order.quoted_price)::bigint - wallet_order_paid(p_order));
  if v_applied <= 0 then
    raise exception 'WALLET:already_paid';
  end if;
  v_excess := p_amount - v_applied;
  if v_excess > 0 and p_excess_disposition is null then
    raise exception 'WALLET:overpayment_choice_required';
  end if;
  if v_excess = 0 and p_excess_disposition is not null then
    raise exception 'WALLET:unexpected_excess_disposition';
  end if;

  if v_excess > 0 and p_excess_disposition = 'wallet' then
    insert into payments (
      client_id, amount, method, status, reference, note,
      created_by_type, created_by_id, created_by_name,
      resolved_by_type, resolved_by_id, resolved_by_name, resolved_at
    ) values (
      v_order.client_id, v_excess, p_method, 'succeeded', nullif(trim(p_reference), ''),
      coalesce(nullif(trim(p_note), ''), 'Excess credit from order ' || v_order.order_no),
      p_actor_type, p_actor_id, p_actor_name,
      p_actor_type, p_actor_id, p_actor_name, now()
    ) returning id into v_wallet_payment;

    perform wallet_post(
      v_order.client_id, 'deposit', v_excess, v_wallet_payment, null,
      'Excess credit from order ' || v_order.order_no,
      p_actor_type, p_actor_id, p_actor_name
    );
  end if;

  insert into order_payment_receipts (
    id, order_id, client_id, amount_received, amount_applied,
    amount_wallet_credit, amount_physically_refunded, excess_disposition,
    wallet_payment_id, method, reference, note, actor_type, actor_id, actor_name
  ) values (
    p_receipt, p_order, v_order.client_id, p_amount, v_applied,
    case when p_excess_disposition = 'wallet' then v_excess else 0 end,
    case when p_excess_disposition = 'physical_refund' then v_excess else 0 end,
    p_excess_disposition, v_wallet_payment, p_method,
    nullif(trim(p_reference), ''), nullif(trim(p_note), ''),
    p_actor_type, p_actor_id, p_actor_name
  );

  select balance into v_balance from wallets where client_id = v_order.client_id;
  return jsonb_build_object(
    'already_recorded', false,
    'applied', v_applied,
    'wallet_credit', case when p_excess_disposition = 'wallet' then v_excess else 0 end,
    'physically_refunded', case when p_excess_disposition = 'physical_refund' then v_excess else 0 end,
    'balance', coalesce(v_balance, 0)
  );
end;
$$;

create or replace function orders_guard_paid_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paid bigint;
begin
  if new.quoted_price is not distinct from old.quoted_price then
    return new;
  end if;
  v_paid := wallet_order_paid(new.id);
  if v_paid > 0 and (new.quoted_price is null or round(new.quoted_price)::bigint < v_paid) then
    raise exception 'WALLET:price_below_paid';
  end if;
  return new;
end;
$$;

revoke all on function wallet_order_paid(uuid) from public, anon, authenticated;
revoke all on function wallet_record_order_receipt(uuid, uuid, bigint, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function orders_guard_paid_price() from public, anon, authenticated;

create or replace function wallet_transaction_history(
  p_client uuid default null,
  p_search text default null,
  p_kind text default null,
  p_status text default null,
  p_offset integer default 0,
  p_limit integer default 50
)
returns table (
  id uuid,
  client_id uuid,
  client_name text,
  client_phone text,
  order_id uuid,
  order_no text,
  kind text,
  amount bigint,
  method text,
  status text,
  reference text,
  note text,
  failure_reason text,
  actor_name text,
  created_at timestamptz,
  balance_after bigint
)
language sql
stable
as $$
with history as (
  select
    wt.id,
    wt.client_id,
    c.name as client_name,
    c.phone as client_phone,
    coalesce(wt.order_id, excess_receipt.order_id) as order_id,
    o.order_no,
    wt.kind,
    wt.amount,
    case
      when wt.kind = 'order_payment' and wt.payment_id is null then 'wallet'::text
      when wt.kind in ('deposit', 'order_payment') and p.method is not null then p.method
      else null
    end as method,
    'succeeded'::text as status,
    p.reference,
    coalesce(wt.note, excess_receipt.note) as note,
    p.failure_reason,
    wt.actor_name,
    wt.created_at,
    wt.balance_after
  from wallet_transactions wt
  left join payments p on p.id = wt.payment_id
  left join order_payment_receipts excess_receipt on excess_receipt.wallet_payment_id = p.id
  left join clients c on c.id = wt.client_id
  left join orders o on o.id = coalesce(wt.order_id, excess_receipt.order_id)
  where (
      wt.kind in ('refund', 'adjustment')
      or (wt.kind = 'order_payment' and wt.payment_id is null)
      or (wt.kind = 'deposit' and (p.order_id is null or p.id is null))
    )
    and (p_client is null or wt.client_id = p_client)
    and (p_kind is null or wt.kind = p_kind)
    and (p_status is null or 'succeeded' = p_status)
    and (
      p_search is null
      or lower(coalesce(c.name, '') || ' ' || coalesce(c.phone, '') || ' ' || coalesce(o.order_no, '') || ' ' || coalesce(p.reference, '') || ' ' || coalesce(wt.note, '') || ' ' || coalesce(excess_receipt.note, ''))
        like '%' || lower(trim(p_search)) || '%'
    )

  union all

  select
    applied.id,
    p.client_id,
    c.name as client_name,
    c.phone as client_phone,
    p.order_id,
    o.order_no,
    'order_payment'::text as kind,
    -applied.amount as amount,
    p.method,
    'succeeded'::text as status,
    p.reference,
    p.note,
    p.failure_reason,
    applied.actor_name,
    applied.created_at,
    applied.balance_after
  from payments p
  join wallet_transactions deposit on deposit.payment_id = p.id and deposit.kind = 'deposit'
  join wallet_transactions applied on applied.payment_id = p.id and applied.kind = 'order_payment'
  left join clients c on c.id = p.client_id
  left join orders o on o.id = p.order_id
  where p.order_id is not null
    and p.status = 'succeeded'
    and (p_client is null or p.client_id = p_client)
    and (p_kind is null or p_kind = 'order_payment')
    and (p_status is null or p_status = 'succeeded')
    and (
      p_search is null
      or lower(coalesce(c.name, '') || ' ' || coalesce(c.phone, '') || ' ' || coalesce(o.order_no, '') || ' ' || coalesce(p.reference, '') || ' ' || coalesce(p.note, ''))
        like '%' || lower(trim(p_search)) || '%'
    )

  union all

  select
    deposit.id,
    p.client_id,
    c.name as client_name,
    c.phone as client_phone,
    p.order_id,
    o.order_no,
    'deposit'::text as kind,
    deposit.amount + coalesce(applied.amount, 0) as amount,
    p.method,
    'succeeded'::text as status,
    p.reference,
    coalesce(p.note, 'Excess from an order payment retained in wallet') as note,
    p.failure_reason,
    p.created_by_name as actor_name,
    deposit.created_at,
    coalesce(applied.balance_after, deposit.balance_after) as balance_after
  from payments p
  join wallet_transactions deposit on deposit.payment_id = p.id and deposit.kind = 'deposit'
  left join wallet_transactions applied on applied.payment_id = p.id and applied.kind = 'order_payment'
  left join clients c on c.id = p.client_id
  left join orders o on o.id = p.order_id
  where p.order_id is not null
    and p.status = 'succeeded'
    and deposit.amount + coalesce(applied.amount, 0) > 0
    and (p_client is null or p.client_id = p_client)
    and (p_kind is null or p_kind = 'deposit')
    and (p_status is null or p_status = 'succeeded')
    and (
      p_search is null
      or lower(coalesce(c.name, '') || ' ' || coalesce(c.phone, '') || ' ' || coalesce(o.order_no, '') || ' ' || coalesce(p.reference, '') || ' ' || coalesce(p.note, ''))
        like '%' || lower(trim(p_search)) || '%'
    )

  union all

  select
    receipt.id,
    receipt.client_id,
    c.name as client_name,
    c.phone as client_phone,
    receipt.order_id,
    o.order_no,
    'order_payment'::text as kind,
    receipt.amount_applied as amount,
    receipt.method,
    'succeeded'::text as status,
    receipt.reference,
    concat_ws('; ', nullif(receipt.note, ''), case when receipt.amount_physically_refunded > 0 then 'Excess physically returned: ' || receipt.amount_physically_refunded::text end) as note,
    null::text as failure_reason,
    receipt.actor_name,
    receipt.created_at,
    null::bigint as balance_after
  from order_payment_receipts receipt
  left join clients c on c.id = receipt.client_id
  left join orders o on o.id = receipt.order_id
  where (p_client is null or receipt.client_id = p_client)
    and (p_kind is null or p_kind = 'order_payment')
    and (p_status is null or p_status = 'succeeded')
    and (
      p_search is null
      or lower(coalesce(c.name, '') || ' ' || coalesce(c.phone, '') || ' ' || coalesce(o.order_no, '') || ' ' || coalesce(receipt.reference, '') || ' ' || coalesce(receipt.note, ''))
        like '%' || lower(trim(p_search)) || '%'
    )

  union all

  select
    p.id,
    p.client_id,
    c.name as client_name,
    c.phone as client_phone,
    p.order_id,
    o.order_no,
    case when p.order_id is null then 'deposit_report'::text else 'order_payment_report'::text end as kind,
    p.amount,
    p.method,
    p.status,
    p.reference,
    p.note,
    p.failure_reason,
    p.created_by_name as actor_name,
    p.created_at,
    null::bigint as balance_after
  from payments p
  left join clients c on c.id = p.client_id
  left join orders o on o.id = p.order_id
  where p.status in ('pending', 'failed', 'cancelled')
    and (p_client is null or p.client_id = p_client)
    and (p_kind is null or (p.order_id is null and p_kind = 'deposit_report') or (p.order_id is not null and p_kind = 'order_payment_report'))
    and (p_status is null or p.status = p_status)
    and (
      p_search is null
      or lower(coalesce(c.name, '') || ' ' || coalesce(c.phone, '') || ' ' || coalesce(o.order_no, '') || ' ' || coalesce(p.reference, '') || ' ' || coalesce(p.note, ''))
        like '%' || lower(trim(p_search)) || '%'
    )
)
select *
from history
order by created_at desc
offset coalesce(p_offset, 0)
limit coalesce(p_limit, 50);
$$;

revoke all on function wallet_transaction_history(uuid, text, text, text, integer, integer) from public, anon, authenticated;