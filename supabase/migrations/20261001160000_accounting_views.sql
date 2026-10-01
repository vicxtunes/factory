-- Accounts: read-only views over the existing money data (see
-- lib/accounting/README.md). Nothing here stores money. Every figure is
-- derived from invoices, orders, order_payment_receipts, payments and the
-- wallet ledger, so Accounts can never disagree with them.
--
-- Tenant-aware: each view has a tenant_id column, and lib/accounting always
-- filters by it. The source tables have no tenant_id yet, so for now it is
-- default_tenant_id(). When they get one, replace default_tenant_id() with
-- the table's column in each view (see lib/tenancy/README.md).
--
-- Service-role only: security_invoker (callers get their own permissions on
-- the underlying tables, which have RLS on and no policies) plus revoked
-- grants, like the wallet tables.

-- One row per invoice: a sale, recorded on its issue date.
create view accounting_sale_documents with (security_invoker = true) as
select
  default_tenant_id()                          as tenant_id,
  inv.id,
  inv.invoice_no                               as number,
  inv.issued_at,
  inv.due_date,
  o.id                                         as order_id,
  o.order_no,
  o.client_id                                  as customer_id,
  coalesce(c.name, o.client_name)              as customer_name,
  coalesce(round(o.quoted_price)::bigint, 0)   as total,
  -- Filled in when invoice lines record their list price (discounts).
  0::bigint                                    as discount,
  wallet_order_paid(o.id)                      as paid,
  o.cancelled_at is not null                   as cancelled,
  coalesce(
    (select string_agg(i.product, ', ' order by i.created_at) from order_items i where i.order_id = o.id),
    ''
  )                                            as products
from invoices inv
join orders o on o.id = inv.order_id
left join clients c on c.id = o.client_id;

-- Money that actually arrived, once each:
--   * a receipt recorded against an order, net of anything physically handed
--     back (the part credited to the wallet stays: it was received);
--   * a succeeded payment (a wallet top-up) that isn't the wallet-credit half
--     of a receipt above, which would otherwise count twice.
create view accounting_money_in with (security_invoker = true) as
select
  default_tenant_id()                                as tenant_id,
  r.id,
  r.created_at                                       as received_at,
  r.client_id                                        as customer_id,
  r.method,
  r.amount_received - r.amount_physically_refunded   as amount,
  'sale_receipt'::text                               as kind,
  o.order_no,
  r.reference
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
  p.reference
from payments p
left join orders o on o.id = p.order_id
where p.status = 'succeeded'
  and not exists (select 1 from order_payment_receipts r where r.wallet_payment_id = p.id);

-- Money already held for a client moving: spent on an order, refunded back
-- into the wallet, or corrected by staff. Deposits are left out: they are
-- money received, already in accounting_money_in.
create view accounting_held_movements with (security_invoker = true) as
select
  default_tenant_id()   as tenant_id,
  t.id,
  t.created_at          as at,
  t.client_id           as customer_id,
  case t.kind when 'order_payment' then 'spent' else t.kind end as kind,
  t.amount,
  o.order_no,
  t.note
from wallet_transactions t
left join orders o on o.id = t.order_id
where t.kind in ('order_payment', 'refund', 'adjustment');

-- Clients with their live order count and what's held for them.
create view accounting_customers with (security_invoker = true) as
select
  default_tenant_id()   as tenant_id,
  c.id,
  c.name,
  c.phone,
  c.active,
  (select count(*) from orders o where o.client_id = c.id and o.cancelled_at is null)::int as order_count,
  coalesce(w.balance, 0) as held
from clients c
left join wallets w on w.client_id = c.id;

revoke all on accounting_sale_documents, accounting_money_in, accounting_held_movements, accounting_customers
  from public, anon, authenticated;
