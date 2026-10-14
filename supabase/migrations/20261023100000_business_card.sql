-- Two cards for a business's owner (packages/lib/wallet/README.md → "Two cards").
--
--   Aming card      the wallet as it always was (wallets, wallet_transactions):
--                   the owner's own money with Aming, for Aming's orders and
--                   extra storage. Every client has one.
--   Business card   what the business's customers pay it by mobile money
--                   (business_wallets, business_wallet_transactions). One per
--                   business, with its own balance and its own history.
--
-- Until now a customer's payment landed in the owner's wallet, mixed with
-- their own money. From here it lands on the Business card, and the owner
-- moves money between the two cards (wallet_transfer) and withdraws from the
-- Business card (business_withdrawals). What customers had already paid moves
-- over once, at the bottom of this file.

-- ── The Business card ──────────────────────────────────────────────────────

create table business_wallets (
  tenant_id   uuid primary key references tenants (id) on delete restrict,
  balance     bigint not null default 0 check (balance >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The owner asks for money from the Business card on their phone. It leaves
-- the card at once (so it can't be spent twice); staff send it and mark it
-- paid, or refuse it and it goes back.
create table business_withdrawals (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references business_wallets (tenant_id) on delete restrict,
  amount             bigint not null check (amount > 0),
  -- The mobile money number to send it to (+256…).
  phone              text not null check (char_length(phone) <= 20),
  status             text not null default 'pending' check (status in ('pending', 'paid', 'rejected')),
  -- Paid: the mobile money transaction id. Rejected: why (shown to the owner).
  reference          text check (char_length(reference) <= 100),
  reason             text check (char_length(reason) <= 500),
  requested_by_name  text not null,
  resolved_by_name   text,
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz
);

create index business_withdrawals_pending_idx on business_withdrawals (created_at) where status = 'pending';
create index business_withdrawals_tenant_idx on business_withdrawals (tenant_id, created_at desc);

-- Its ledger: append-only, one signed row per movement, like wallet_transactions.
create table business_wallet_transactions (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references business_wallets (tenant_id) on delete restrict,
  kind           text not null check (kind in ('customer_payment', 'transfer_in', 'transfer_out', 'withdrawal', 'withdrawal_returned')),
  amount         bigint not null check (amount <> 0),
  balance_after  bigint not null check (balance_after >= 0),
  -- The mobile money prompt a customer's payment came from.
  collection_id  uuid references provider_collections (id) on delete restrict,
  withdrawal_id  uuid references business_withdrawals (id) on delete restrict,
  note           text,
  actor_type     text not null,
  actor_id       text,
  actor_name     text not null,
  created_at     timestamptz not null default now(),
  constraint business_wallet_tx_shape check (
    (kind = 'customer_payment'    and amount > 0 and collection_id is not null and withdrawal_id is null) or
    (kind = 'transfer_in'         and amount > 0 and collection_id is null and withdrawal_id is null) or
    (kind = 'transfer_out'        and amount < 0 and collection_id is null and withdrawal_id is null) or
    (kind = 'withdrawal'          and amount < 0 and collection_id is null and withdrawal_id is not null) or
    (kind = 'withdrawal_returned' and amount > 0 and collection_id is null and withdrawal_id is not null)
  )
);

-- One prompt is credited once; a withdrawal is taken once and returned at most once.
create unique index business_wallet_tx_collection_key on business_wallet_transactions (collection_id) where kind = 'customer_payment';
create unique index business_wallet_tx_withdrawal_key on business_wallet_transactions (withdrawal_id, kind) where withdrawal_id is not null;
create index business_wallet_tx_tenant_idx on business_wallet_transactions (tenant_id, created_at desc);

create trigger business_wallet_tx_no_update_or_delete
  before update or delete on business_wallet_transactions
  for each row execute function wallet_tx_append_only();

-- Server (service role) only, like the wallet tables.
alter table business_wallets enable row level security;
alter table business_wallet_transactions enable row level security;
alter table business_withdrawals enable row level security;
revoke all on table business_wallets, business_wallet_transactions, business_withdrawals from anon, authenticated;

-- The one place a Business card's balance changes: locks it (creating it on
-- first use), applies the signed amount, refuses to go below zero, appends
-- the ledger row.
create or replace function business_wallet_post(
  p_tenant uuid,
  p_kind text,
  p_amount bigint,
  p_collection uuid,
  p_withdrawal uuid,
  p_note text,
  p_actor_type text,
  p_actor_id text,
  p_actor_name text
)
returns business_wallet_transactions
language plpgsql
as $$
declare
  v_balance bigint;
  v_row business_wallet_transactions;
begin
  insert into business_wallets (tenant_id) values (p_tenant) on conflict (tenant_id) do nothing;
  select balance into v_balance from business_wallets where tenant_id = p_tenant for update;

  if v_balance + p_amount < 0 then
    raise exception 'WALLET:insufficient_funds';
  end if;

  update business_wallets set balance = v_balance + p_amount, updated_at = now() where tenant_id = p_tenant;

  insert into business_wallet_transactions (
    tenant_id, kind, amount, balance_after, collection_id, withdrawal_id, note, actor_type, actor_id, actor_name
  ) values (
    p_tenant, p_kind, p_amount, v_balance + p_amount, p_collection, p_withdrawal, p_note, p_actor_type, p_actor_id, p_actor_name
  ) returning * into v_row;

  return v_row;
end;
$$;

-- ── Moving money between the two cards ─────────────────────────────────────

-- The Aming card's side of a move is a ledger row of its own kind.
alter table wallet_transactions drop constraint wallet_transactions_kind_check;
alter table wallet_transactions
  add constraint wallet_transactions_kind_check
  check (kind in ('deposit', 'order_payment', 'refund', 'adjustment', 'transfer'));

alter table wallet_transactions drop constraint wallet_tx_shape;
alter table wallet_transactions
  add constraint wallet_tx_shape check (
    (kind = 'deposit'       and amount > 0 and payment_id is not null and order_id is null) or
    (kind = 'order_payment' and amount < 0 and order_id is not null) or
    (kind = 'refund'        and amount > 0 and order_id is not null) or
    (kind = 'adjustment'    and order_id is null and payment_id is null and nullif(trim(note), '') is not null) or
    (kind = 'transfer'      and order_id is null and payment_id is null and nullif(trim(note), '') is not null)
  );

-- Moves p_amount between a business's card and its owner's Aming card, in one
-- transaction: p_to is the card it goes to ('aming' or 'business'). Neither
-- card can go below zero. The Business card is always locked first.
-- Errors: WALLET:invalid_amount, WALLET:no_business, WALLET:insufficient_funds.
create or replace function wallet_transfer(
  p_tenant uuid,
  p_to text,
  p_amount bigint,
  p_note text,
  p_actor_type text,
  p_actor_id text,
  p_actor_name text
)
returns jsonb
language plpgsql
as $$
declare
  v_owner uuid;
  v_business business_wallet_transactions;
  v_aming wallet_transactions;
begin
  if p_amount is null or p_amount <= 0 or p_to not in ('aming', 'business') then
    raise exception 'WALLET:invalid_amount';
  end if;
  select owner_client_id into v_owner from tenants where id = p_tenant;
  if v_owner is null then
    raise exception 'WALLET:no_business';
  end if;

  if p_to = 'aming' then
    v_business := business_wallet_post(p_tenant, 'transfer_out', -p_amount, null, null, coalesce(p_note, 'To your Aming card'), p_actor_type, p_actor_id, p_actor_name);
    v_aming := wallet_post(v_owner, 'transfer', p_amount, null, null, coalesce(p_note, 'From your Business card'), p_actor_type, p_actor_id, p_actor_name);
  else
    v_business := business_wallet_post(p_tenant, 'transfer_in', p_amount, null, null, coalesce(p_note, 'From your Aming card'), p_actor_type, p_actor_id, p_actor_name);
    v_aming := wallet_post(v_owner, 'transfer', -p_amount, null, null, coalesce(p_note, 'To your Business card'), p_actor_type, p_actor_id, p_actor_name);
  end if;

  return jsonb_build_object('business', v_business.balance_after, 'aming', v_aming.balance_after);
end;
$$;

-- ── Withdrawing from the Business card ─────────────────────────────────────

-- The owner asks for p_amount on p_phone: it leaves the card now and waits
-- for staff. Returns the withdrawal's id.
-- Errors: WALLET:invalid_amount, WALLET:insufficient_funds.
create or replace function business_withdraw_request(
  p_tenant uuid,
  p_amount bigint,
  p_phone text,
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
  if p_amount is null or p_amount <= 0 then
    raise exception 'WALLET:invalid_amount';
  end if;
  -- The card first: the request row refers to it.
  insert into business_wallets (tenant_id) values (p_tenant) on conflict (tenant_id) do nothing;
  insert into business_withdrawals (tenant_id, amount, phone, requested_by_name)
  values (p_tenant, p_amount, p_phone, p_actor_name)
  returning id into v_id;
  perform business_wallet_post(p_tenant, 'withdrawal', -p_amount, null, v_id, 'Withdrawal to ' || p_phone, p_actor_type, p_actor_id, p_actor_name);
  return v_id;
end;
$$;

-- Staff answer a waiting withdrawal: paid (p_text is the transaction id), or
-- refused (p_text is why), which puts the money back on the card. Returns the
-- withdrawal's tenant and amount.
-- Errors: WALLET:withdrawal_not_pending.
create or replace function business_withdraw_resolve(
  p_withdrawal uuid,
  p_paid boolean,
  p_text text,
  p_actor_type text,
  p_actor_id text,
  p_actor_name text
)
returns jsonb
language plpgsql
as $$
declare
  v_w business_withdrawals;
begin
  select * into v_w from business_withdrawals where id = p_withdrawal for update;
  if not found or v_w.status <> 'pending' then
    raise exception 'WALLET:withdrawal_not_pending';
  end if;

  update business_withdrawals
     set status = case when p_paid then 'paid' else 'rejected' end,
         reference = case when p_paid then p_text end,
         reason = case when p_paid then null else p_text end,
         resolved_by_name = p_actor_name,
         resolved_at = now()
   where id = p_withdrawal;

  if not p_paid then
    perform business_wallet_post(v_w.tenant_id, 'withdrawal_returned', v_w.amount, null, v_w.id, 'Withdrawal not sent: ' || coalesce(p_text, ''), p_actor_type, p_actor_id, p_actor_name);
  end if;

  return jsonb_build_object('tenant_id', v_w.tenant_id, 'amount', v_w.amount);
end;
$$;

revoke all on function business_wallet_post(uuid, text, bigint, uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function wallet_transfer(uuid, text, bigint, text, text, text, text) from public, anon, authenticated;
revoke all on function business_withdraw_request(uuid, bigint, text, text, text, text) from public, anon, authenticated;
revoke all on function business_withdraw_resolve(uuid, boolean, text, text, text, text) from public, anon, authenticated;
grant execute on function business_wallet_post(uuid, text, bigint, uuid, uuid, text, text, text, text) to service_role;
grant execute on function wallet_transfer(uuid, text, bigint, text, text, text, text) to service_role;
grant execute on function business_withdraw_request(uuid, bigint, text, text, text, text) to service_role;
grant execute on function business_withdraw_resolve(uuid, boolean, text, text, text, text) to service_role;

-- ── A customer's payment lands on the Business card ────────────────────────

-- As in 20261021100000, except that money paid to a business (for an order
-- request, a booking or one of its invoices) is credited to its Business
-- card, not its owner's wallet.
create or replace function provider_collection_settle(p_collection uuid, p_actor_name text)
returns jsonb
language plpgsql
as $$
declare
  v_c provider_collections;
  v_due bigint;
  v_receipt jsonb;
  v_receipt_id uuid;
  v_payment uuid;
  v_order_no text;
  v_item text;
  v_order uuid;
  v_take bigint;
  -- The business a customer's payment is for.
  v_tenant uuid;
  -- What still has to go somewhere, and what went on orders.
  v_left bigint;
  v_applied bigint := 0;
begin
  select * into v_c from provider_collections where id = p_collection for update;
  if not found then
    raise exception 'WALLET:payment_not_found';
  end if;
  if v_c.status = 'succeeded' then
    return jsonb_build_object('already_settled', true, 'receipt_id', v_c.receipt_id, 'payment_id', v_c.payment_id);
  end if;
  -- A 'failed' row the provider now reports as paid still settles: the
  -- client's money arrived.
  v_left := v_c.amount;

  if v_c.order_id is not null then
    begin
      select order_no, round(quoted_price)::bigint - wallet_order_paid(id)
        into v_order_no, v_due
        from orders where id = v_c.order_id for update;
      v_receipt := wallet_record_order_receipt(
        v_c.id, v_c.order_id, v_c.amount, 'mobile_money', v_c.provider_ref,
        'Paid by mobile money (' || initcap(v_c.provider) || ')',
        case when v_c.amount > coalesce(v_due, 0) then 'wallet' end,
        'system', null, p_actor_name
      );
      v_receipt_id := v_c.id;
      v_payment := (select wallet_payment_id from order_payment_receipts where id = v_c.id);
      v_applied := coalesce((v_receipt ->> 'applied')::bigint, 0);
      v_left := 0;
    exception when others then
      -- The order can't take it (paid meanwhile, cancelled, repriced, no
      -- invoice): fall through to a wallet deposit of the whole amount.
      v_receipt_id := null;
      v_payment := null;
    end;
  end if;

  if v_c.order_ids is not null then
    foreach v_order in array v_c.order_ids loop
      exit when v_left <= 0;
      begin
        select round(quoted_price)::bigint - wallet_order_paid(id)
          into v_due
          from orders where id = v_order and client_id = v_c.client_id for update;
        v_take := least(v_left, coalesce(v_due, 0));
        if v_take > 0 then
          perform wallet_record_order_receipt(
            gen_random_uuid(), v_order, v_take, 'mobile_money', v_c.provider_ref,
            'Paid by mobile money (' || initcap(v_c.provider) || ')',
            null, 'system', null, p_actor_name
          );
          v_left := v_left - v_take;
          v_applied := v_applied + v_take;
        end if;
      exception when others then
        -- This order can't take it: its share stays for the next one, then the wallet.
        null;
      end;
    end loop;
  end if;

  if v_left > 0 then
    if v_c.product_request_id is not null then
      select quantity || ' × ' || item_name, tenant_id into v_item, v_tenant from product_requests where id = v_c.product_request_id;
    end if;
    if v_c.booking_id is not null then
      select title, tenant_id into v_item, v_tenant from bookings where id = v_c.booking_id;
    end if;
    if v_c.billing_document_id is not null then
      select number, tenant_id into v_item, v_tenant from billing_documents where id = v_c.billing_document_id;
    end if;
    if v_tenant is not null then
      perform business_wallet_post(
        v_tenant, 'customer_payment', v_left, v_c.id, null,
        case
          when v_c.product_request_id is not null then 'Customer payment for ' || coalesce(v_item, 'an order request')
          when v_c.billing_document_id is not null then 'Customer payment for invoice ' || coalesce(v_item, '')
          else 'Customer payment for booking ' || coalesce(v_item, '')
        end,
        'system', null, v_c.created_by_name
      );
    else
      insert into payments (
        client_id, amount, method, status, provider, provider_ref, reference, note,
        created_by_type, created_by_id, created_by_name
      ) values (
        v_c.client_id, v_left, 'mobile_money', 'pending', v_c.provider, v_c.provider_ref, v_c.provider_ref,
        case
          when v_c.order_ids is not null then 'Mobile money for your invoices — kept in the wallet: they didn''t need it any more'
          when v_c.order_id is null then 'Wallet top-up by mobile money'
          else 'Mobile money for order ' || coalesce(v_order_no, '') || ' — kept in the wallet: the order couldn''t take it'
        end,
        'system', null, p_actor_name
      ) returning id into v_payment;
      perform wallet_settle_payment(v_payment, 'system', null, p_actor_name);
    end if;
  end if;

  update provider_collections
     set status = 'succeeded',
         failure_reason = null,
         receipt_id = v_receipt_id,
         payment_id = v_payment,
         resolved_at = now()
   where id = v_c.id;

  return jsonb_build_object(
    'already_settled', false,
    'receipt_id', v_receipt_id,
    'payment_id', v_payment,
    'applied', v_applied
  );
end;
$$;

-- ── Accounts: the money is still received and held ─────────────────────────

-- A customer's payment to a business arrived in Aming's mobile money account
-- and is held for the business's owner, as it was when it went to their wallet.
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
  c.provider_ref
from business_wallet_transactions b
join tenants t on t.id = b.tenant_id
join provider_collections c on c.id = b.collection_id
where b.kind = 'customer_payment';

-- What's held for a client: their Aming card, and their business's card.
create or replace view accounting_customers with (security_invoker = true) as
select
  default_tenant_id()   as tenant_id,
  c.id,
  c.name,
  c.phone,
  c.active,
  (select count(*) from orders o where o.client_id = c.id and o.cancelled_at is null)::int as order_count,
  coalesce(w.balance, 0)
    + coalesce((select sum(bw.balance) from business_wallets bw join tenants t on t.id = bw.tenant_id where t.owner_client_id = c.id), 0)::bigint as held
from clients c
left join wallets w on w.client_id = c.id;

-- ── What customers had already paid moves to the Business card ─────────────

-- Each business's owner had its customers' payments in their own wallet. As
-- much of that as is still there (they may have spent some) moves over, as a
-- transfer on both ledgers.
do $$
declare
  v record;
begin
  for v in
    select t.id as tenant_id, least(coalesce(w.balance, 0), sum(p.amount))::bigint as amount
      from tenants t
      join provider_collections c on c.client_id = t.owner_client_id
       and c.status = 'succeeded'
       and (c.product_request_id is not null or c.booking_id is not null or c.billing_document_id is not null)
      join payments p on p.id = c.payment_id and p.status = 'succeeded'
      left join wallets w on w.client_id = t.owner_client_id
     group by t.id, w.balance
  loop
    if v.amount > 0 then
      perform wallet_transfer(v.tenant_id, 'business', v.amount, 'Customer payments received before the Business card', 'system', null, 'Aming');
    end if;
  end loop;
end;
$$;
