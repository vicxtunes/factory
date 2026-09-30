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
    wt.order_id,
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
    wt.note,
    p.failure_reason,
    wt.actor_name,
    wt.created_at,
    wt.balance_after
  from wallet_transactions wt
  left join clients c on c.id = wt.client_id
  left join orders o on o.id = wt.order_id
  left join payments p on p.id = wt.payment_id
  where (p_client is null or wt.client_id = p_client)
    and (p_kind is null or wt.kind = p_kind)
    and (p_status is null or 'succeeded' = p_status)
    and (
      p_search is null
      or lower(coalesce(c.name, '') || ' ' || coalesce(c.phone, '') || ' ' || coalesce(o.order_no, '') || ' ' || coalesce(p.reference, '') || ' ' || coalesce(wt.note, ''))
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
    'deposit_report'::text as kind,
    p.amount,
    p.method,
    p.status,
    p.reference,
    p.note,
    p.failure_reason,
    p.created_by_name,
    p.created_at,
    null::bigint as balance_after
  from payments p
  left join clients c on c.id = p.client_id
  left join orders o on o.id = p.order_id
  where p.status in ('pending', 'failed', 'cancelled')
    and (p_client is null or p.client_id = p_client)
    and (p_kind is null or p_kind = 'deposit_report')
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
