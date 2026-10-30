-- Money watch: the boss could not see who took which payment, and nothing
-- told anyone when the app's records and HivePay's disagreed (a payment
-- HivePay took but the app left pending for a week; a failed prompt credited
-- by hand). Three things, all service-role only like the wallet tables:
--
--   * money_alerts: what the hourly check against HivePay finds that doesn't
--     add up (packages/lib/wallet/server/watch.ts), one row per problem, until
--     the boss or a supervisor marks it resolved.
--   * money_reports: the days the evening money report has gone out, so a
--     restart never sends it twice.
--   * accounting_money_in gains recorded_by: the staff member (or the
--     gateway) that recorded each payment received.

create table money_alerts (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in (
                     -- HivePay took the money; the app says pending or failed.
                     'paid_not_credited',
                     -- The app credited it; HivePay says it didn't go through.
                     'credited_not_paid',
                     -- Two prompts HivePay took: same phone, same amount, within 30 minutes.
                     'possible_double',
                     -- A payout still sending an hour after it went out.
                     'payout_unconfirmed'
                   )),
  collection_id    uuid references provider_collections (id) on delete restrict,
  -- A business's or a vendor's withdrawal (two tables, so no foreign key).
  withdrawal_id    uuid,
  amount           bigint not null check (amount >= 0),
  phone            text,
  detail           text not null,
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz,
  resolved_by_name text,
  constraint money_alerts_subject check ((collection_id is null) <> (withdrawal_id is null))
);

-- One alert per problem: the hourly check finds the same thing again and again.
create unique index money_alerts_once on money_alerts (kind, coalesce(collection_id, withdrawal_id));
create index money_alerts_open_idx on money_alerts (created_at desc) where resolved_at is null;

create table money_reports (
  -- The Kampala calendar day the report covers.
  day     date primary key,
  sent_at timestamptz not null default now()
);

alter table money_alerts enable row level security;
alter table money_reports enable row level security;
revoke all on table money_alerts, money_reports from anon, authenticated;

-- As in 20261023100000_business_card.sql, plus recorded_by (added last: a
-- view can only gain columns at the end).
create or replace view accounting_money_in with (security_invoker = true) as
select
  default_tenant_id()                                as tenant_id,
  r.id,
  r.created_at                                       as received_at,
  r.client_id                                        as customer_id,
  r.method,
  r.amount_received - r.amount_physically_refunded   as amount,
  'sale_receipt'::text                               as kind,
  o.order_no,
  r.reference,
  r.actor_name                                       as recorded_by
from order_payment_receipts r
join orders o on o.id = r.order_id
where r.amount_received > r.amount_physically_refunded
union all
select
  default_tenant_id(),
  p.id,
  coalesce(p.resolved_at, p.updated_at),
  p.client_id,
  p.method,
  p.amount,
  -- A payment made for one order (installment) is a sale receipt too.
  case when p.order_id is null then 'prepayment' else 'sale_receipt' end,
  o.order_no,
  p.reference,
  p.created_by_name
from payments p
left join orders o on o.id = p.order_id
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
  c.created_by_name
from business_wallet_transactions b
join tenants t on t.id = b.tenant_id
join provider_collections c on c.id = b.collection_id
where b.kind = 'customer_payment';
